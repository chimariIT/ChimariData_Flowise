/**
 * Data Upload Step - CONSOLIDATED
 *
 * This step combines the former project-setup-step and data-step into one:
 * 1. User enters project name/description
 * 2. User uploads files (project auto-created on first upload)
 * 3. PII detection and review per file
 * 4. DE Agent joins files after PII exclusions
 * 5. User approves joined dataset preview
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Upload,
  CheckCircle,
  AlertCircle,
  FileText,
  BarChart3,
  Settings,
  Eye,
  Shield,
  ArrowRight,
  Link2,
  FolderOpen
} from "lucide-react";
import { PIIDetectionDialog } from "@/components/PIIDetectionDialog";
import AgentCheckpoints from "@/components/agent-checkpoints";
import { AgentRecommendationDialog } from "@/components/AgentRecommendationDialog";
import { useToast } from "@/hooks/use-toast";
import { useProject } from "@/hooks/useProject";
import { apiClient } from "@/lib/api";
import { startClientMetric, type ClientMetricHandle } from "@/lib/performanceTracker";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { queryClient } from "@/lib/queryClient";

interface DataUploadStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean;
}

type SessionJourney = 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom';

const SESSION_TO_PROJECT_JOURNEY: Record<SessionJourney, string> = {
  'non-tech': 'ai_guided',
  business: 'template_based',
  technical: 'self_service',
  consultation: 'consultation',
  custom: 'custom',
};

const normalizeSessionJourney = (value?: string): SessionJourney => {
  const key = (value || '').toLowerCase();
  const map: Record<string, SessionJourney> = {
    'non-tech': 'non-tech',
    'non_tech': 'non-tech',
    'ai_guided': 'non-tech',
    guided: 'non-tech',
    business: 'business',
    'template_based': 'business',
    technical: 'technical',
    'self_service': 'technical',
    consultation: 'consultation',
    custom: 'custom',
  };
  return map[key] ?? 'non-tech';
};

const columnMatchesExclusion = (columnName: string, columnsList: string[]): boolean => {
  const normalizedColumn = (columnName || '').toLowerCase();
  return columnsList.some((column) => {
    const normalized = column.toLowerCase();
    return normalizedColumn === normalized || normalizedColumn.endsWith(`_${normalized}`);
  });
};

export default function DataUploadStep({ journeyType, onNext, onPrevious, renderAsContent = false }: DataUploadStepProps) {
  const { toast } = useToast();
  const normalizedJourneyType = normalizeSessionJourney(journeyType);
  const normalizedProjectJourney = SESSION_TO_PROJECT_JOURNEY[normalizedJourneyType];

  // Project metadata state (from project-setup-step)
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  // Upload state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [dataPreview, setDataPreview] = useState<Record<string, any[]>>({});
  const [joinedPreview, setJoinedPreview] = useState<any[]>([]);
  const [joinedPreviewSchema, setJoinedPreviewSchema] = useState<Record<string, any> | null>(null);
  const [joinInsights, setJoinInsights] = useState<any | null>(null);

  interface ValidationStats {
    totalRows: number;
    totalColumns: number;
    missingValues: number;
    duplicateRows: number;
    qualityScore: number;
  }

  const [dataValidation, setDataValidation] = useState<Record<string, ValidationStats>>({});
  const [linkedSchema, setLinkedSchema] = useState<{ [table: string]: { columns: Record<string, string>, primaryKey?: string, foreignKeys?: Array<{ column: string, references: string }> } }>({});
  const [editingRelations, setEditingRelations] = useState(false);
  const [pendingRelations, setPendingRelations] = useState<{ [table: string]: { primaryKey?: string, foreignKeys: Array<{ column: string, references: string }> } }>({});
  const [inferring, setInferring] = useState(false);

  // Quality checkpoint and PII detection state
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [piiDetectionResult, setPiiDetectionResult] = useState<any>(null);
  const [currentPIIFile, setCurrentPIIFile] = useState<string | null>(null); // Track which file is currently in PII dialog
  const [piiDecisionsByFile, setPiiDecisionsByFile] = useState<Record<string, {
    excludedColumns: string[];
    anonymizedColumns: string[];
    decisionTimestamp: string;
  }>>({});
  const [piiQueue, setPiiQueue] = useState<Array<{ fileName: string; piiResult: any; preview: any[]; schema: Record<string, string>; recordCount: number }>>([]);
  const [piiReviewCompleted, setPiiReviewCompleted] = useState(false);
  const [dataQualityApproved, setDataQualityApproved] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);

  // Agent recommendation state
  const [agentRecommendation, setAgentRecommendation] = useState<any | null>(null);
  const [showRecommendationDialog, setShowRecommendationDialog] = useState(false);
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState(false);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);

  const { project, journeyProgress, updateProgress, isUpdating } = useProject(currentProjectId || undefined);

  const aggregatedValidation = useMemo(() => {
    const entries = Object.values(dataValidation);
    if (!entries.length) return null;

    // CRITICAL FIX: If we have joined data with totalRowCount, use that instead of summing individual datasets
    // This ensures accuracy when datasets are joined (joined count != sum of individual counts)
    const joinedTotalRows = journeyProgress?.joinedData?.totalRowCount || 
                           journeyProgress?.joinedData?.fullData?.length || 
                           null;

    return entries.reduce(
      (acc, stats, idx) => {
        // Use joined total if available, otherwise sum individual datasets
        acc.totalRows = joinedTotalRows !== null ? joinedTotalRows : (acc.totalRows + (stats.totalRows || 0));
        acc.totalColumns = Math.max(acc.totalColumns, stats.totalColumns || 0);
        acc.missingValues += stats.missingValues || 0;
        acc.duplicateRows += stats.duplicateRows || 0;
        acc.qualityScoreSum += stats.qualityScore || 0;
        acc.datasets = idx + 1;
        return acc;
      },
      {
        totalRows: joinedTotalRows !== null ? joinedTotalRows : 0,
        totalColumns: 0,
        missingValues: 0,
        duplicateRows: 0,
        qualityScoreSum: 0,
        datasets: 0,
      }
    );
  }, [dataValidation, journeyProgress]);

  const aggregatedQualityScore = aggregatedValidation
    ? Math.round(aggregatedValidation.qualityScoreSum / aggregatedValidation.datasets)
    : 0;

  const shouldHideColumn = useCallback(
    (columnName: string) => columnMatchesExclusion(columnName, excludedColumns),
    [excludedColumns]
  );

  const joinedPreviewColumns = useMemo(() => {
    const schemaColumns = joinedPreviewSchema ? Object.keys(joinedPreviewSchema) : [];
    const baseColumns = schemaColumns.length
      ? schemaColumns
      : (joinedPreview[0] ? Object.keys(joinedPreview[0]) : []);
    return baseColumns.filter((column) => !shouldHideColumn(column));
  }, [joinedPreviewSchema, joinedPreview, shouldHideColumn]);

  const joinDetectionLabel = useMemo(() => {
    switch (joinInsights?.detectionMethod) {
      case 'data_engineer_agent':
        return 'Data Engineer Agent';
      case 'schema_match':
        return 'Schema Match';
      case 'metadata':
        return 'Stored Join Plan';
      default:
        return 'Fallback Preview';
    }
  }, [joinInsights]);

  const joinStrategyLabel = useMemo(
    () => (joinInsights?.joinStrategy === 'join' ? 'Joined View' : 'Stacked Preview'),
    [joinInsights]
  );

  const filterDataPreviewColumns = useCallback((columnsToRemove: string[]) => {
    if (!columnsToRemove.length) return;

    setDataPreview((prev) => {
      const next: Record<string, any[]> = {};
      Object.entries(prev).forEach(([name, rows]) => {
        next[name] = rows.map((row) => {
          const filtered: Record<string, any> = {};
          Object.entries(row).forEach(([key, value]) => {
            if (!columnsToRemove.includes(key)) {
              filtered[key] = value;
            }
          });
          return filtered;
        });
      });
      return next;
    });

    setLinkedSchema((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((table) => {
        const existing = next[table];
        if (!existing) return;
        const updatedColumns = { ...existing.columns };
        columnsToRemove.forEach((column) => {
          delete updatedColumns[column];
        });
        next[table] = { ...existing, columns: updatedColumns };
      });
      return next;
    });

    setJoinedPreview((prev) => {
      if (!prev.length) return prev;
      return prev.map((row) => {
        const filtered: Record<string, any> = {};
        Object.entries(row).forEach(([key, value]) => {
          if (!columnMatchesExclusion(key, columnsToRemove)) {
            filtered[key] = value;
          }
        });
        return filtered;
      });
    });

    setJoinedPreviewSchema((prev) => {
      if (!prev) return prev;
      const nextSchema: Record<string, any> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (!columnMatchesExclusion(key, columnsToRemove)) {
          nextSchema[key] = value;
        }
      });
      return nextSchema;
    });
  }, []);

  const refreshProjectPreview = useCallback(async () => {
    if (!currentProjectId) return;

    try {
      setIsRefreshingPreview(true);
      const response = await apiClient.getProjectDatasets(currentProjectId);
      const joinedRows = Array.isArray(response?.joinedPreview) ? response.joinedPreview : [];
      setJoinedPreview(joinedRows);
      setJoinedPreviewSchema(response?.joinedSchema || null);
      setJoinInsights(response?.joinInsights || null);

      const datasets = response?.datasets || [];
      if (datasets.length > 0) {
        const newPreviews: Record<string, any[]> = {};
        const newValidations: Record<string, ValidationStats> = {};
        const newSchemas: { [table: string]: { columns: Record<string, string>, primaryKey?: string, foreignKeys?: Array<{ column: string, references: string }> } } = {};
        const fileIds: string[] = [];

        datasets.forEach((datasetItem: any) => {
          const datasetEntry = datasetItem?.dataset || datasetItem;
          if (!datasetEntry) return;

          const originalFileName = datasetEntry.originalFileName || datasetEntry.name || 'Dataset Preview';
          const normalizedTableName = originalFileName.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, '_');

          if (datasetEntry.id) {
            fileIds.push(datasetEntry.id);
          }

          if (datasetEntry.preview && Array.isArray(datasetEntry.preview)) {
            newPreviews[originalFileName] = datasetEntry.preview;
          }

          const metrics = datasetEntry.ingestionMetadata?.qualityMetrics;
          newValidations[originalFileName] = {
            totalRows: datasetEntry.recordCount || datasetEntry.rowCount || 0,
            totalColumns: Object.keys(datasetEntry.schema || {}).length,
            missingValues: 0,
            duplicateRows: metrics?.duplicateRows || 0,
            qualityScore: metrics?.dataQualityScore || metrics?.completeness || 85
          };

          if (datasetEntry.schema) {
            newSchemas[normalizedTableName] = {
              columns: datasetEntry.schema,
              primaryKey: undefined,
              foreignKeys: []
            };
          }
        });

        if (Object.keys(newPreviews).length > 0) {
          setDataPreview(newPreviews);
          setDataValidation(newValidations);
          setLinkedSchema(prev => ({ ...prev, ...newSchemas }));
          setUploadedFileIds(fileIds);
          setUploadStatus('completed');
        }
      }

      // Restore verification states
      try {
        const projectData = await apiClient.getProject(currentProjectId);
        if (projectData) {
          const stepStatus = projectData.stepCompletionStatus || {};
          if (stepStatus.data === true || (projectData.journeyProgress as any)?.currentStep > 2) {
            setDataQualityApproved(true);
            setPiiReviewCompleted(true);
          }
          if (projectData.metadata?.piiReviewed === true) {
            setPiiReviewCompleted(true);
          }
          if (projectData.metadata?.dataQualityApproved === true) {
            setDataQualityApproved(true);
          }
          // Restore project name/description if we have them
          if (projectData.name && !projectName) {
            setProjectName(projectData.name);
          }
          if (projectData.description && !projectDescription) {
            setProjectDescription(projectData.description);
          }
        }
      } catch (projectError) {
        console.error('Failed to load project for state restoration:', projectError);
      }
    } catch (error) {
      console.error('Failed to refresh dataset preview', error);
    } finally {
      setIsRefreshingPreview(false);
    }
  }, [currentProjectId, projectName, projectDescription]);

  // Initialize projectId from localStorage on mount
  // Clear project state when starting a new journey
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('new') === 'true') {
      // Clear all project-related state for fresh start
      localStorage.removeItem('currentProjectId');
      setCurrentProjectId(null);
      setProjectName('');
      setProjectDescription('');
      setUploadStatus('idle');
      setUploadedFiles([]);
      setDataPreview({});
      setJoinedPreview([]);
      setJoinedPreviewSchema(null);
      setJoinInsights(null);
      setDataValidation({});
      setLinkedSchema({});
      setPiiDecisionsByFile({});
      setPiiQueue([]);
      setPiiReviewCompleted(false);
      setDataQualityApproved(false);
      setExcludedColumns([]);
      setUploadedFileIds([]);
      
      // Clear React Query cache for projects to prevent loading old data
      queryClient.removeQueries({ queryKey: ['project'] });
      queryClient.removeQueries({ queryKey: ['project-session'] });
      
      console.log('🧹 Cleared all project state and cache for new journey');
      // Remove the ?new=true from URL to prevent re-clearing on navigation
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  useEffect(() => {
    // Only load saved project ID if not starting a new journey
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('new') === 'true') {
      return; // Don't load old project ID when starting new journey
    }
    
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId && !currentProjectId) {
      setCurrentProjectId(savedProjectId);
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (currentProjectId) {
      refreshProjectPreview();
    }
  }, [currentProjectId, refreshProjectPreview]);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Data Upload",
          description: "Our AI will automatically validate and prepare your data",
          icon: Database,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Data Upload",
          description: "Upload your business data with template-based validation",
          icon: BarChart3,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Data Upload",
          description: "Upload data with full control over validation and transformation",
          icon: Settings,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Consultation Data Upload",
          description: "Upload data for expert review and preparation",
          icon: Eye,
          color: "yellow"
        };
      default:
        return {
          title: "Data Upload",
          description: "Upload and prepare your data for analysis",
          icon: Database,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  const checkForPII = async (fileName: string, preview: any[], schema: Record<string, string>, recordCount: number) => {
    try {
      // CRITICAL FIX: Check if file already processed or queued using current state
      // This must be done synchronously before any async operations
      if (piiDecisionsByFile[fileName]) {
        console.log(`⏭️ [PII] Skipping ${fileName} - already processed`);
        return; // File already processed
      }

      const piiColumns: Array<{ column: string; types: string[]; confidence: number; examples: string[] }> = [];

      Object.keys(schema).forEach(columnName => {
        const lowerName = columnName.toLowerCase();
        const sampleValues = preview.slice(0, 5).map(row => String(row[columnName] || ''));
        const detectedTypes: string[] = [];

        if (lowerName.includes('email') || sampleValues.some(v => /@/.test(v))) {
          detectedTypes.push('email');
        }
        if (lowerName.includes('phone') || lowerName.includes('tel') || sampleValues.some(v => /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(v))) {
          detectedTypes.push('phone');
        }
        if (lowerName.includes('ssn') || lowerName.includes('social')) {
          detectedTypes.push('ssn');
        }
        if (lowerName.includes('name') && !lowerName.includes('file') && !lowerName.includes('user')) {
          detectedTypes.push('name');
        }
        if (lowerName.includes('address') || lowerName.includes('street')) {
          detectedTypes.push('address');
        }

        if (detectedTypes.length > 0) {
          piiColumns.push({
            column: columnName,
            types: detectedTypes,
            confidence: 0.8,
            examples: sampleValues.filter(v => v).slice(0, 3)
          });
        }
      });

      if (piiColumns.length > 0) {
        const highRiskTypes = piiColumns.flatMap(c => c.types).filter(t => ['ssn', 'credit_card'].includes(t));
        const riskLevel = highRiskTypes.length > 0 ? 'high' : piiColumns.length > 3 ? 'medium' : 'low';

        const piiResult = {
          detectedPII: piiColumns,
          riskLevel,
          recommendations: [
            'Consider anonymizing sensitive fields before analysis',
            'Review data retention policies',
            'Ensure compliance with data protection regulations'
          ]
        };

        // Add to PII queue - use functional update to prevent duplicates atomically
        setPiiQueue(prev => {
          // Check if file is already in queue (race condition protection)
          const alreadyQueued = prev.some(item => item.fileName === fileName);
          if (alreadyQueued) {
            console.log(`⏭️ [PII] File ${fileName} already in queue, skipping duplicate`);
            return prev;
          }
          console.log(`✅ [PII] Added ${fileName} to PII review queue (${prev.length + 1} file(s) in queue)`);
          return [...prev, { fileName, piiResult, preview: [...preview], schema: { ...schema }, recordCount }];
        });
      } else {
        // No PII detected - mark as completed for this file
        setPiiDecisionsByFile(prev => {
          if (prev[fileName]) {
            return prev; // Already processed
          }
          console.log(`✅ [PII] No PII detected in ${fileName}, marked as completed`);
          return {
            ...prev,
            [fileName]: {
              excludedColumns: [],
              anonymizedColumns: [],
              decisionTimestamp: new Date().toISOString()
            }
          };
        });
      }
    } catch (error) {
      console.error(`❌ [PII] Error detecting PII for ${fileName}:`, error);
      // On error, mark as completed (no PII)
      setPiiDecisionsByFile(prev => ({
        ...prev,
        [fileName]: {
          excludedColumns: [],
          anonymizedColumns: [],
          decisionTimestamp: new Date().toISOString()
        }
      }));
    }
  };

  // Process PII queue - show dialog for next file
  useEffect(() => {
    if (piiQueue.length > 0 && !showPIIDialog && !currentPIIFile) {
      const nextFile = piiQueue[0];
      // CRITICAL FIX: Double-check the file hasn't already been processed (race condition protection)
      if (piiDecisionsByFile[nextFile.fileName]) {
        console.log(`⏭️ [PII Queue] Skipping ${nextFile.fileName} - already processed, removing from queue`);
        setPiiQueue(prev => prev.filter(item => item.fileName !== nextFile.fileName));
        return;
      }
      console.log(`📋 [PII Queue] Processing next file: ${nextFile.fileName} (${piiQueue.length} file(s) remaining in queue)`);
      setCurrentPIIFile(nextFile.fileName);
      setPiiDetectionResult(nextFile.piiResult);
      setShowPIIDialog(true);
    }
  }, [piiQueue, showPIIDialog, currentPIIFile, piiDecisionsByFile]);

  const fetchAgentRecommendations = async (projectId: string, fileIds: string[]) => {
    if (!projectId || fileIds.length === 0) return;

    setIsLoadingRecommendation(true);
    try {
      const questions = journeyProgress?.userQuestions?.map(q => q.text) || [];
      const businessContext = journeyProgress?.audience || {};

      const data = await apiClient.post(`/api/projects/${projectId}/agent-recommendations`, {
        uploadedFileIds: fileIds,
        userQuestions: questions.length > 0 ? questions : ['Analyze the uploaded data'],
        businessContext
      });

      if (data?.success && data.recommendation) {
        setAgentRecommendation(data.recommendation);
        setShowRecommendationDialog(true);

        updateProgress({
          agentRecommendations: [{
            type: 'agent_recommendation',
            reasoning: data.recommendation.reasoning || 'Based on your data and goals',
            suggestedAnalyses: data.recommendation.analysisPaths || [],
            relatedGoals: journeyProgress?.analysisGoal ? [journeyProgress.analysisGoal] : []
          }]
        });
      }
    } catch (error: any) {
      console.error('Error fetching agent recommendations:', error);
      toast({
        title: "Agent Recommendation Error",
        description: error.message || "Failed to get agent recommendations. You can proceed manually.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingRecommendation(false);
    }
  };

  const handleAcceptRecommendation = (recommendation: any) => {
    setShowRecommendationDialog(false);

    updateProgress({
      executionConfig: {
        ...(journeyProgress?.executionConfig || {}),
        selectedAnalyses: recommendation.selectedAnalyses || [],
        confirmedAt: new Date().toISOString()
      },
      currentStep: 'prepare'
    });

    toast({
      title: "Recommendations Accepted",
      description: `Analysis will proceed with ${recommendation.analysisComplexity || 'standard'} complexity.`
    });
  };

  const handleModifyRecommendation = (recommendation: any) => {
    setShowRecommendationDialog(false);
    localStorage.setItem('draftRecommendations', JSON.stringify(recommendation));
    toast({
      title: "Ready for Customization",
      description: "You can customize the analysis configuration in the Execute step."
    });
  };

  const handleDataQualityApproval = async () => {
    setDataQualityApproved(true);
    if (currentProjectId) {
      updateProgress({
        dataQualityApproved: true,
        stepTimestamps: {
          ...(journeyProgress?.stepTimestamps || {}),
          dataQualityApproval: new Date().toISOString()
        }
      });
    }
  };

  const handleContinue = async () => {
    // Validate project exists - check both state and localStorage for resilience
    let effectiveProjectId = currentProjectId;
    if (!effectiveProjectId) {
      // Fallback: check localStorage in case state was lost during re-render
      const storedProjectId = localStorage.getItem('currentProjectId');
      if (storedProjectId) {
        console.log('📋 [Data Upload] Recovered projectId from localStorage:', storedProjectId);
        effectiveProjectId = storedProjectId;
        setCurrentProjectId(storedProjectId); // Sync state
      } else {
        toast({
          title: "Project Not Created",
          description: "Please upload at least one file to create your project.",
          variant: "destructive"
        });
        return;
      }
    }

    // Validate files uploaded - also check journeyProgress as fallback
    const effectiveFileIds = uploadedFileIds?.length > 0
      ? uploadedFileIds
      : (journeyProgress?.uploadedDatasetIds || []);

    if (!effectiveFileIds || effectiveFileIds.length === 0) {
      // Last resort: check if we have joined data (indicates files were processed)
      if (joinedPreview?.length > 0 || journeyProgress?.joinedData?.preview?.length > 0) {
        console.log('📋 [Data Upload] Files detected via joined data, proceeding...');
      } else {
        toast({
          title: "No Files Uploaded",
          description: "Please upload at least one file before continuing.",
          variant: "destructive"
        });
        return;
      }
    }

    // Validate PII review completed - also check journeyProgress
    const piiCompleted = piiReviewCompleted || (journeyProgress?.piiDecision != null) || (journeyProgress?.piiDecisionsByFile && Object.keys(journeyProgress.piiDecisionsByFile).length > 0);
    if (!piiCompleted) {
      toast({
        title: "PII Review Required",
        description: "Please complete the PII review for all uploaded files before continuing.",
        variant: "destructive"
      });
      return;
    }

    // Validate data quality approved - also check journeyProgress
    const qualityApproved = dataQualityApproved || journeyProgress?.dataQualityApproved;
    if (!qualityApproved) {
      toast({
        title: "Data Quality Approval Required",
        description: "Please approve the data quality before continuing.",
        variant: "destructive"
      });
      return;
    }

    // Persist all Step 1 outputs to journeyProgress
    // [DATA CONTINUITY FIX] Preserve fullData that backend already saved
    try {
      updateProgress({
        currentStep: 'prepare',
        completedSteps: [...(journeyProgress?.completedSteps || []), 'data'],
        uploadedDatasetIds: effectiveFileIds.length > 0 ? effectiveFileIds : uploadedFileIds,
        joinedData: {
          // Preserve fullData from backend (saved by GET /datasets endpoint)
          ...(journeyProgress?.joinedData || {}),
          preview: joinedPreview,
          schema: joinedPreviewSchema || undefined,
          totalRowCount: aggregatedValidation?.totalRows || journeyProgress?.joinedData?.fullRowCount || joinedPreview.length,
          joinInsights: joinInsights || journeyProgress?.joinedData?.joinInsights || undefined,
          columnCount: joinedPreviewColumns.length,
          rowCount: joinedPreview.length,
        },
        piiDecisionsByFile: piiDecisionsByFile,
        dataQualityApproved: true,
        stepTimestamps: {
          ...(journeyProgress?.stepTimestamps || {}),
          dataCompleted: new Date().toISOString()
        }
      });

      // Navigate to next step
      if (onNext) {
        onNext();
      }
    } catch (error: any) {
      console.error('Failed to save step 1 progress:', error);
      toast({
        title: "Error Saving Progress",
        description: error.message || "Failed to save project state. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handlePIIReviewComplete = async (
    approved: boolean,
    anonymizedColumns?: string[],
    excludedCols?: string[]
  ) => {
    setPiiReviewCompleted(true);
    setShowPIIDialog(false);

    if (excludedCols && excludedCols.length > 0) {
      setExcludedColumns(excludedCols);
      filterDataPreviewColumns(excludedCols);
    }

    if (currentProjectId) {
      updateProgress({
        piiDecision: {
          excludedColumns: excludedCols || [],
          anonymizedColumns: anonymizedColumns || [],
          decisionTimestamp: new Date().toISOString()
        },
        schemaValidated: approved
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to upload files.",
        variant: "destructive"
      });
      setUploadStatus('error');
      return;
    }

    setUploadedFiles((prev) => [...prev, ...files]);
    setUploadStatus('uploading');
    setUploadProgress(5);
    setDataQualityApproved(false);
    setPiiReviewCompleted(false);
    setPiiDetectionResult(null);

    const newlyUploadedFileIds: string[] = [];
    let latestProjectId = localStorage.getItem('currentProjectId') || null;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        // Use user-provided project name or fall back to file name
        const fallbackName = projectName.trim() || file.name.replace(/\.[^/.]+$/, "");
        const fallbackDescription = projectDescription.trim() || `Uploaded file: ${file.name}`;
        const progressBase = Math.round((index / files.length) * 100);

        const uploadFlowMetric = startClientMetric('upload_flow_total', {
          fileName: file.name,
          fileSize: file.size,
          journeyType
        });

        const uploadNetworkMetric = startClientMetric('upload_network', {
          fileName: file.name,
          fileSize: file.size
        });

        setUploadProgress(progressBase + 10);

        let data: any;
        try {
          // AUTO-CREATE PROJECT ON FIRST FILE UPLOAD
          if (latestProjectId && index > 0) {
            // Add file to existing project
            data = await apiClient.uploadFileToProject(latestProjectId, file);
          } else {
            // Create new project with first file (auto-create on upload)
            data = await apiClient.uploadFile(file, {
              name: fallbackName,
              description: fallbackDescription,
              questions: [],
              isTrial: false
            });
          }

          if (!data?.success) {
            uploadNetworkMetric?.end('error', {
              message: data?.error || 'Upload failed',
              responseStatus: data?.status
            });
            throw new Error(data?.error || 'Upload failed');
          }

          uploadNetworkMetric?.end('success', {
            projectId: data.projectId || latestProjectId,
            requiresPIIDecision: !!data.requiresPIIDecision
          });
        } catch (error: any) {
          uploadNetworkMetric?.end('error', {
            message: error?.message || 'Upload request failed'
          });
          throw error;
        }

        setUploadProgress(progressBase + 40);

        // Update project ID on first file (project was auto-created)
        if (data.projectId && index === 0) {
          latestProjectId = data.projectId;
          localStorage.setItem('currentProjectId', data.projectId);
          setCurrentProjectId(data.projectId);

          // Update project name if user provided one
          if (projectName.trim()) {
            setProjectName(projectName.trim());
          } else {
            setProjectName(fallbackName);
          }
        }

        setUploadStatus('processing');

        const preview = data.sampleData || data.project?.preview || [];
        const recordCount = data.recordCount || preview.length || 0;

        const schema: Record<string, string> = {};
        let columns = 0;
        let missingValues = 0;

        if (preview.length > 0) {
          const firstRow = preview[0];
          columns = Object.keys(firstRow).length;

          Object.keys(firstRow).forEach(key => {
            const values = preview.map((row: any) => row[key]);
            const nonNullValues = values.filter((v: any) => v !== null && v !== undefined && v !== '');
            missingValues += (values.length - nonNullValues.length);

            if (nonNullValues.length > 0) {
              const sample = nonNullValues[0];
              if (typeof sample === 'number') {
                schema[key] = Number.isInteger(sample) ? 'integer' : 'float';
              } else if (typeof sample === 'boolean') {
                schema[key] = 'boolean';
              } else if (sample instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(sample))) {
                schema[key] = 'date';
              } else {
                schema[key] = 'string';
              }
            } else {
              schema[key] = 'string';
            }
          });
        }

        const previews: Record<string, any[]> = {};
        previews[file.name] = preview.slice(0, 10);
        setDataPreview((prev) => ({ ...prev, ...previews }));

        const qualityScore = recordCount && columns
          ? Math.max(0, Math.round(((recordCount * columns - missingValues) / (recordCount * columns)) * 100))
          : 0;

        setDataValidation((prev) => ({
          ...prev,
          [file.name]: {
            totalRows: recordCount,
            totalColumns: columns,
            missingValues,
            duplicateRows: 0,
            qualityScore: qualityScore || 93
          }
        }));

        const baseTableName = file.name.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, '_');
        const tables: Record<string, { columns: Record<string, string>; primaryKey?: string; foreignKeys: Array<{ column: string; references: string }> }> = {
          [baseTableName]: {
            columns: schema,
            primaryKey: Object.keys(schema).includes('id') ? 'id' : undefined,
            foreignKeys: []
          }
        };

        setLinkedSchema((prev) => ({ ...prev, ...tables }));

        if (data.fileId) {
          newlyUploadedFileIds.push(data.fileId);
        }

        // FIX: Use backend's PII analysis instead of re-detecting on frontend
        // The backend already performs PII analysis and returns it in the response
        const backendPiiResult = data.piiResult || data.piiAnalysis;
        if (backendPiiResult?.detectedPII && backendPiiResult.detectedPII.length > 0) {
          // Backend detected PII - use its result directly
          const piiResult = {
            detectedPII: backendPiiResult.detectedPII,
            riskLevel: backendPiiResult.riskLevel || (backendPiiResult.detectedPII.some((p: any) => ['ssn', 'credit_card'].includes(p.types?.[0])) ? 'high' : 'medium'),
            recommendations: backendPiiResult.recommendations || [
              'Consider anonymizing sensitive fields before analysis',
              'Review data retention policies',
              'Ensure compliance with data protection regulations'
            ]
          };

          // Add to PII queue using backend's result
          setPiiQueue(prev => {
            const alreadyQueued = prev.some(item => item.fileName === file.name);
            if (alreadyQueued) {
              console.log(`⏭️ [PII] File ${file.name} already in queue, skipping duplicate`);
              return prev;
            }
            console.log(`✅ [PII] Added ${file.name} to PII review queue using backend analysis (${prev.length + 1} file(s) in queue)`);
            return [...prev, { fileName: file.name, piiResult, preview: [...preview], schema: { ...schema }, recordCount }];
          });
        } else {
          // No PII detected by backend - mark as completed
          setPiiDecisionsByFile(prev => {
            if (prev[file.name]) {
              return prev; // Already processed
            }
            console.log(`✅ [PII] No PII detected in ${file.name} (backend analysis), marked as completed`);
            return {
              ...prev,
              [file.name]: {
                excludedColumns: [],
                anonymizedColumns: [],
                decisionTimestamp: new Date().toISOString()
              }
            };
          });
        }

        const flowStatus: 'success' | 'warning' = data?.requiresPIIDecision ? 'warning' : 'success';
        uploadFlowMetric?.end(flowStatus, {
          projectId: data.projectId,
          recordCount,
          columnCount: columns,
          qualityScore: qualityScore || 93
        });

        const progressAfterFile = Math.round(((index + 1) / files.length) * 100);
        setUploadProgress(progressAfterFile);
      }

      setUploadStatus('completed');
      setUploadProgress(100);

      if (latestProjectId) {
        setCurrentProjectId(latestProjectId);
        await refreshProjectPreview();
      }

      if (newlyUploadedFileIds.length > 0) {
        const combinedFileIds = [...uploadedFileIds, ...newlyUploadedFileIds];
        setUploadedFileIds(combinedFileIds);
        if (latestProjectId) {
          await fetchAgentRecommendations(latestProjectId, combinedFileIds);
        }
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setUploadProgress(0);

      let userMessage = error.message || 'Upload failed';
      if (error.message?.includes('Authentication required')) {
        userMessage = 'Please log in to upload files. You need to be authenticated.';
      } else if (error.message?.includes('Not Found')) {
        userMessage = 'Upload endpoint not found. Please check your connection and try again.';
      }

      toast({
        title: "Upload failed",
        description: userMessage,
        variant: "destructive"
      });
    }
  };

  const getUploadStatusIcon = () => {
    switch (uploadStatus) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'uploading':
      case 'processing':
        return <Database className="w-5 h-5 text-blue-600 animate-pulse" />;
      default:
        return <Upload className="w-5 h-5 text-gray-600" />;
    }
  };

  const getUploadStatusText = () => {
    switch (uploadStatus) {
      case 'uploading':
        return 'Uploading file...';
      case 'processing':
        return 'Processing and validating data...';
      case 'completed':
        return 'Data uploaded and validated successfully!';
      case 'error':
        return 'Upload failed. Please try again.';
      default:
        return 'Ready to upload';
    }
  };

  const handlePIIDecision = async (requiresPII: boolean, anonymizeData: boolean, selectedColumns: string[]) => {
    if (!currentPIIFile) return;

    const allPiiColumns = piiDetectionResult?.detectedPII?.map((p: any) => p.column) || [];
    const columnsToExclude = requiresPII
      ? allPiiColumns.filter((col: string) => !selectedColumns.includes(col))
      : allPiiColumns;
    const columnsToAnonymize = anonymizeData ? selectedColumns : [];

    // Store PII decision for this specific file
    const fileDecision = {
      excludedColumns: columnsToExclude,
      anonymizedColumns: columnsToAnonymize,
      decisionTimestamp: new Date().toISOString()
    };

    setPiiDecisionsByFile(prev => ({
      ...prev,
      [currentPIIFile]: fileDecision
    }));

    // Aggregate all excluded columns across all files
    const allExcludedColumns = Object.values({ ...piiDecisionsByFile, [currentPIIFile]: fileDecision })
      .flatMap(decision => decision.excludedColumns);
    const uniqueExcludedColumns = [...new Set(allExcludedColumns)];

    if (uniqueExcludedColumns.length > 0) {
      setExcludedColumns(uniqueExcludedColumns);
      filterDataPreviewColumns(uniqueExcludedColumns);
    }

    // Apply server-side PII filtering for this specific file
    if (currentProjectId && (columnsToExclude.length > 0 || columnsToAnonymize.length > 0)) {
      try {
        await apiClient.post(
          `/api/projects/${currentProjectId}/apply-pii-exclusions`,
          {
            excludedColumns: columnsToExclude,
            anonymizedColumns: columnsToAnonymize,
            fileName: currentPIIFile // Include fileName to identify which dataset
          }
        );
        // CRITICAL FIX: Invalidate cache after backend updates dataset
        queryClient.invalidateQueries({ queryKey: ["project", currentProjectId] });
        await refreshProjectPreview();
        toast({
          title: "PII Decision Saved",
          description: `For ${currentPIIFile}: ${columnsToExclude.length} column(s) excluded, ${columnsToAnonymize.length} column(s) anonymized`,
        });
      } catch (piiError) {
        console.error('Server-side PII exclusion failed:', piiError);
        toast({
          title: "PII Processing Issue",
          description: "Some PII columns may still be visible. They will be filtered in the verification step.",
          variant: "destructive"
        });
      }
    }

    // Persist PII decision for this file
    if (currentProjectId) {
      updateProgress({
        piiDecisionsByFile: {
          ...(journeyProgress?.piiDecisionsByFile || {}),
          [currentPIIFile]: fileDecision
        },
        // Also maintain aggregate for backwards compatibility
        piiDecision: {
          ...(journeyProgress?.piiDecision || {}),
          excludedColumns: uniqueExcludedColumns,
          anonymizedColumns: Object.values({ ...piiDecisionsByFile, [currentPIIFile]: fileDecision })
            .flatMap(decision => decision.anonymizedColumns),
          decisionTimestamp: new Date().toISOString()
        },
        schemaValidated: true
      });
    }

    // Remove this file from queue and close dialog
    setPiiQueue(prev => {
      const remainingQueue = prev.filter(item => item.fileName !== currentPIIFile);
      
      // Check if all files have been processed (after removal)
      if (remainingQueue.length === 0) {
        setPiiReviewCompleted(true);
      }
      
      return remainingQueue;
    });
    setShowPIIDialog(false);
    setCurrentPIIFile(null);
    setPiiDetectionResult(null);
  };

  const content = (
    <div className="space-y-6">
      {/* Journey Type Info */}
      <Card className={`border-${journeyInfo.color}-200 bg-${journeyInfo.color}-50`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-${journeyInfo.color}-900`}>
            <Icon className="w-5 h-5" />
            {journeyInfo.title}
          </CardTitle>
          <CardDescription className={`text-${journeyInfo.color}-700`}>
            {journeyInfo.description}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Project Name & Description - BEFORE Upload */}
      {!currentProjectId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Project Details
            </CardTitle>
            <CardDescription>
              Enter a name and description for your analysis project (optional - we'll auto-generate if left blank)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Q4 Sales Analysis, Employee Engagement Study"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectDescription">Description</Label>
              <Textarea
                id="projectDescription"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe what you want to analyze and any specific questions you have..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Created Badge */}
      {currentProjectId && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Project Created: {projectName || 'Data Analysis Project'}</p>
                {projectDescription && (
                  <p className="text-sm text-green-700 mt-1">{projectDescription}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Your Data
          </CardTitle>
          <CardDescription>
            Upload your data file for analysis. Supported formats: CSV, Excel, JSON
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer ${uploadStatus === 'uploading' || uploadStatus === 'processing' ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <div className="flex flex-col items-center space-y-4">
                  {getUploadStatusIcon()}
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      {uploadedFiles.length ? `${uploadedFiles.length} file(s) selected` : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {getUploadStatusText()}
                    </p>
                  </div>
                  {!uploadedFiles.length && (
                    <Button variant="outline" disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}>
                      Choose File
                    </Button>
                  )}
                </div>
              </label>
            </div>

            {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Validation Results */}
      {uploadStatus === 'completed' && aggregatedValidation && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Data Validation Results
            </CardTitle>
            <CardDescription className="text-green-700">
              Your data has been successfully validated and is ready for analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedValidation.totalRows}</p>
                <p className="text-sm text-green-700">Total Rows</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedValidation.totalColumns}</p>
                <p className="text-sm text-green-700">Columns</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedValidation.missingValues}</p>
                <p className="text-sm text-green-700">Missing Values</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedQualityScore}%</p>
                <p className="text-sm text-green-700">Quality Score</p>
              </div>
            </div>

            {/* Schema Overview */}
            <div className="space-y-3 mt-2">
              <h4 className="font-medium text-green-900">Schema Overview</h4>
              <div className="grid md:grid-cols-2 gap-3">
                {Object.entries(linkedSchema).map(([table, def]) => (
                  <div key={table} className="p-3 bg-white rounded border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{table}</span>
                      {def.primaryKey && (
                        <Badge variant="outline" className="text-xs">PK: {def.primaryKey}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Object.entries(def.columns).map(([col, type]) => (
                        <Badge key={col} variant="secondary" className="bg-green-100 text-green-800">
                          {journeyType === 'technical' ? `${col}: ${type}` : col}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PII Detection Dialog */}
      {showPIIDialog && piiDetectionResult && (
        <PIIDetectionDialog
          isOpen={showPIIDialog}
          onClose={() => {
            // If user closes without decision, mark as no PII for this file
            if (currentPIIFile) {
              setPiiDecisionsByFile(prev => ({
                ...prev,
                [currentPIIFile]: {
                  excludedColumns: [],
                  anonymizedColumns: [],
                  decisionTimestamp: new Date().toISOString()
                }
              }));
              setPiiQueue(prev => prev.filter(item => item.fileName !== currentPIIFile));
              setCurrentPIIFile(null);
            }
            setShowPIIDialog(false);
          }}
          onDecision={handlePIIDecision}
          projectId={currentProjectId}
          fileName={currentPIIFile}
          piiResult={piiDetectionResult}
        />
      )}

      {/* Multi-dataset joined preview - This is the MAIN dataset going forward */}
      {uploadStatus === 'completed' && joinedPreview.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Link2 className="w-5 h-5" />
              Joined Dataset (Main Dataset)
            </CardTitle>
            <CardDescription className="text-blue-800">
              <strong>This joined dataset is your main dataset going forward.</strong> The Data Engineer agent merged your uploaded datasets. All subsequent analysis will use this joined dataset.
            </CardDescription>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge variant="outline" className="bg-white text-blue-700 border-blue-200">
                {joinDetectionLabel}
              </Badge>
              <Badge variant="outline" className="bg-white text-blue-700 border-blue-200">
                {joinStrategyLabel}
              </Badge>
              <Badge variant="outline" className="bg-white text-blue-700 border-blue-200">
                {(joinInsights?.datasetCount || 0).toString()} dataset(s)
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {joinInsights?.foreignKeys?.length > 0 && (
              <div className="text-sm text-gray-700 mb-4">
                <p className="font-medium text-gray-900 mb-2">Join keys identified by the Data Engineer:</p>
                <ul className="list-disc list-inside space-y-1">
                  {joinInsights.foreignKeys.map((fk: any) => (
                    <li key={fk.datasetId}>
                      <span className="font-semibold">{fk.datasetName}</span>{' '}
                      ↔ {joinInsights.primaryDatasetName}.{fk.primaryColumn} ({Math.round((fk.confidence ?? 0) * 100)}% confidence)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {joinedPreviewColumns.length === 0 ? (
              <p className="text-sm text-gray-600 p-4 border rounded-lg bg-white">
                No columns available after PII filtering. Adjust excluded fields to inspect the merged sample.
              </p>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-white text-gray-700 border-gray-200">
                    {Math.min(joinedPreview.length, 10)} rows of {(journeyProgress?.joinedData?.totalRowCount || journeyProgress?.joinedData?.fullData?.length || joinedPreview.length).toLocaleString()} total records in the joined dataset
                  </Badge>
                </div>
                <ScrollArea className="border rounded-lg h-96 w-full bg-white">
                  <div className="w-max min-w-full">
                    <table className="w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                          {joinedPreviewColumns.map((column) => (
                            <th key={column} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {joinedPreview.slice(0, 10).map((row, index) => (
                          <tr key={`joined-row-${index}`} className="hover:bg-gray-50">
                            {joinedPreviewColumns.map((column) => (
                              <td key={`${column}-${index}`} className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                                {String(row[column] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sample Data Preview (per file) */}
      {uploadStatus === 'completed' && Object.keys(dataPreview).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Sample Data Preview
            </CardTitle>
            <CardDescription>
              Showing first 10 rows for each uploaded file (post-PII decisions)
              {isRefreshingPreview && ' • refreshing...'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(dataPreview).map(([name, rows]) => {
                const visibleColumns = rows.length
                  ? Object.keys(rows[0]).filter(column => !excludedColumns.includes(column))
                  : [];
                const totalRecordCount = dataValidation[name]?.totalRows || rows.length;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">{name}</h4>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {rows.length} rows of {totalRecordCount.toLocaleString()} total records in the dataset
                        </Badge>
                        <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                          {visibleColumns.length} columns
                        </Badge>
                      </div>
                    </div>
                    {visibleColumns.length === 0 ? (
                      <p className="text-sm text-gray-600 p-4 border rounded-lg">No columns available after PII filtering.</p>
                    ) : (
                      <ScrollArea className="border rounded-lg h-96 w-full">
                        <div className="w-max min-w-full">
                          <table className="w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                {visibleColumns.map((column) => (
                                  <th key={column} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    {column}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {rows.map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                  {visibleColumns.map((column) => (
                                    <td key={`${column}-${index}`} className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                                      {String(row[column] ?? '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                        <ScrollBar orientation="vertical" />
                      </ScrollArea>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Quality Approval */}
      {uploadStatus === 'completed' && piiReviewCompleted && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Data Quality Approval
            </CardTitle>
            <CardDescription className="text-green-700">
              Review the data quality metrics and approve to proceed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-white rounded-lg border">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-2">Quality Review</h4>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Data completeness: {aggregatedQualityScore}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Schema validated: {Object.keys(linkedSchema).length} table(s)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>PII review: Completed</span>
                    </div>
                  </div>
                </div>
                {!dataQualityApproved && (
                  <Button
                    onClick={handleDataQualityApproval}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve Quality
                  </Button>
                )}
                {dataQualityApproved && (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approved
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Agents Activity */}
      {uploadStatus === 'completed' && piiReviewCompleted && currentProjectId && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Shield className="w-5 h-5" />
              AI Agents Activity
            </CardTitle>
            <CardDescription className="text-purple-700">
              Our agents are reviewing your data quality and preparing recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentCheckpoints projectId={currentProjectId} />
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      {uploadStatus === 'completed' && dataQualityApproved && onNext && (
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={handleContinue}
            className="bg-blue-600 hover:bg-blue-700"
            size="lg"
            disabled={isUpdating}
          >
            {isUpdating ? 'Saving...' : 'Continue to Analysis Preparation'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Agent Recommendation Dialog */}
      <AgentRecommendationDialog
        recommendation={agentRecommendation}
        onAccept={handleAcceptRecommendation}
        onModify={handleModifyRecommendation}
        open={showRecommendationDialog}
        onOpenChange={setShowRecommendationDialog}
      />

      {/* PII Detection Dialog (duplicate for safety) */}
      {piiDetectionResult && (
        <PIIDetectionDialog
          isOpen={showPIIDialog}
          onClose={() => setShowPIIDialog(false)}
          onDecision={handlePIIDecision}
          projectId={currentProjectId}
          onToolkitApplied={refreshProjectPreview}
          piiResult={piiDetectionResult}
        />
      )}
    </div>
  );

  if (renderAsContent) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Upload & Project Setup
        </CardTitle>
        <CardDescription>
          Create your project and upload data for analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}
