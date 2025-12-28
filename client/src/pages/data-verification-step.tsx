import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Shield,
  Database,
  FileText,
  BarChart3,
  Eye,
  Download,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Info,
  TrendingUp,
  Link2
} from "lucide-react";
import { PIIDetectionDialog } from "@/components/PIIDetectionDialog";
import { SchemaAnalysis } from "@/components/SchemaAnalysis";
import { DataQualityCheckpoint } from "@/components/DataQualityCheckpoint";
import { SchemaValidationDialog } from "@/components/SchemaValidationDialog";
import { DataElementsMappingUI } from "@/components/DataElementsMappingUI";
import { TransformationPlanDisplay } from "@/components/TransformationPlanDisplay";
import { DataTransformationUI } from "@/components/data-transformation-ui";
import AgentCheckpoints from "@/components/agent-checkpoints";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useProject } from "@/hooks/useProject";
import { JourneyProgress } from '@shared/schema';

interface DataVerificationStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean;
}

interface VerificationStatus {
  dataQuality: boolean;
  schemaValidation: boolean;
  piiReview: boolean;
  dataPreview: boolean;
  overallApproved: boolean;
}

export default function DataVerificationStep({
  journeyType,
  onNext,
  onPrevious,
  renderAsContent = false
}: DataVerificationStepProps) {
  const { toast } = useToast();

  // State for verification status
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    dataQuality: false,
    schemaValidation: false,
    piiReview: false,
    dataPreview: false,
    overallApproved: false
  });

  // Centralized project data and state (DEC-003)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => localStorage.getItem('currentProjectId'));
  const { project, journeyProgress, updateProgress, isLoading: projectLoading, isUpdating } = useProject(currentProjectId || undefined);

  // Local data state (some will be migrated to journeyProgress/project from hook)
  const [projectData, setProjectData] = useState<any>(null);
  const [dataQuality, setDataQuality] = useState<any>(null);
  const [piiResults, setPiiResults] = useState<any>(null);
  const [schemaAnalysis, setSchemaAnalysis] = useState<any>(null);
  const [requiredDataElements, setRequiredDataElements] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [joinInsights, setJoinInsights] = useState<any | null>(null);

  // PII Dialog state
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [piiReviewCompleted, setPiiReviewCompleted] = useState(false);

  // Schema Validation Dialog state
  const [showSchemaDialog, setShowSchemaDialog] = useState(false);
  const [editedSchema, setEditedSchema] = useState<any>(null);

  // FIX #30: Multi-dataset tab selection - allows viewing each dataset individually
  const [selectedDatasetIndex, setSelectedDatasetIndex] = useState<number>(-1); // -1 = joined view

  const computedQualityScore = (() => {
    // If we have it in journeyProgress, prioritize it
    if (journeyProgress?.dataQuality?.overallScore) {
      return journeyProgress.dataQuality.overallScore;
    }
    // Fallback to dataQuality state (legacy/API)
    // Priority 1: Use qualityScore field from backend (this is the main overall score)
    if (typeof dataQuality?.qualityScore === 'number') {
      return dataQuality.qualityScore;
    }
    // Priority 2: Check nested qualityScore.overall
    if (dataQuality?.qualityScore?.overall && typeof dataQuality.qualityScore.overall === 'number') {
      return dataQuality.qualityScore.overall;
    }
    // Priority 3: Use score field if present
    if (typeof dataQuality?.score === 'number') {
      return dataQuality.score;
    }
    // Priority 4: Calculate from metrics if available
    const metrics = dataQuality?.metrics && typeof dataQuality.metrics === 'object' ? dataQuality.metrics : null;
    if (metrics) {
      const metricValues = Object.values(metrics).filter(v => typeof v === 'number') as number[];
      if (metricValues.length > 0) {
        return metricValues.reduce((sum, val) => sum + val, 0) / metricValues.length;
      }
    }
    return 0;
  })();

  const qualityScore = typeof computedQualityScore === 'number'
    ? computedQualityScore > 0 && computedQualityScore <= 1
      ? Math.round(computedQualityScore * 100)
      : Math.round(computedQualityScore)
    : 0;

  const qualityMetrics = dataQuality?.metrics && typeof dataQuality.metrics === 'object' ? dataQuality.metrics : null;
  const qualityLabel = dataQuality?.qualityScore?.label ?? null;
  const qualityRecommendations = Array.isArray(dataQuality?.recommendations) ? dataQuality.recommendations : [];
  const qualityIssues = Array.isArray(dataQuality?.issues)
    ? dataQuality.issues.map((issue: any, index: number) => {
      if (typeof issue === 'string') {
        return {
          severity: index === 0 ? 'warning' : 'info',
          message: issue,
          fix: undefined
        } as const;
      }

      const severityValue = (issue?.severity || '').toString().toLowerCase();
      const severity: 'critical' | 'warning' | 'info' =
        severityValue === 'error'
          ? 'critical'
          : severityValue === 'warning'
            ? 'warning'
            : 'info';

      return {
        severity,
        message: issue?.message || issue?.description || 'Data quality issue detected',
        fix: issue?.suggestion || issue?.fix || undefined
      };
    })
    : [];

  // FIX: Use joined schema from journeyProgress for availableColumns (SSOT)
  const availableColumns = useMemo(() => {
    // Priority 1: Use joined schema from journeyProgress (SSOT)
    const joinedSchema = journeyProgress?.joinedData?.schema;
    if (joinedSchema && typeof joinedSchema === 'object') {
      const columns = Array.isArray(joinedSchema) 
        ? joinedSchema.map((col: any) => col.name || col.column || col)
        : Object.keys(joinedSchema);
      if (columns.length > 0) {
        console.log(`📊 [SSOT] Using ${columns.length} columns from joined schema for mapping`);
        return columns;
      }
    }
    
    // Priority 2: Use projectData schema (which should be joined schema)
    if (projectData?.schema && typeof projectData.schema === 'object') {
      const columns = Array.isArray(projectData.schema)
        ? projectData.schema.map((col: any) => col.name || col.column || col)
        : Object.keys(projectData.schema);
      if (columns.length > 0) return columns;
    }
    
    // Priority 3: Infer from preview data
    if (Array.isArray(projectData?.preview) && projectData.preview.length > 0) {
      return Object.keys(projectData.preview[0] ?? {});
    }
    
    return [];
  }, [projectData, journeyProgress?.joinedData?.schema]);

  const requiredElements = useMemo(() => {
    if (!requiredDataElements) {
      console.log('📋 [P1-3 DEBUG] No requiredDataElements loaded');
      return [];
    }
    console.log('📋 [P1-3 DEBUG] requiredDataElements structure:', {
      isArray: Array.isArray(requiredDataElements),
      hasRequiredDataElements: !!requiredDataElements.requiredDataElements,
      requiredDataElementsLength: Array.isArray(requiredDataElements.requiredDataElements) ? requiredDataElements.requiredDataElements.length : 'N/A',
      hasElements: !!requiredDataElements.elements,
      elementsLength: Array.isArray(requiredDataElements.elements) ? requiredDataElements.elements.length : 'N/A',
      keys: Object.keys(requiredDataElements || {})
    });

    // Try different data structures - CRITICAL FIX: Check requirementsDocument structure correctly
    let elements: any[] = [];
    if (Array.isArray(requiredDataElements.requiredDataElements)) {
      elements = requiredDataElements.requiredDataElements;
      console.log(`📋 [P1-3 DEBUG] Using requiredDataElements.requiredDataElements array (${elements.length} elements)`);
    } else if (Array.isArray(requiredDataElements.elements)) {
      elements = requiredDataElements.elements;
      console.log(`📋 [P1-3 DEBUG] Using requiredDataElements.elements array (${elements.length} elements)`);
    } else if (Array.isArray(requiredDataElements)) {
      elements = requiredDataElements;
      console.log(`📋 [P1-3 DEBUG] Using requiredDataElements as array directly (${elements.length} elements)`);
    } else {
      console.warn('⚠️ [P1-3 DEBUG] Could not extract elements array from requiredDataElements structure:', requiredDataElements);
    }

    // Map elements to the format expected by DataElementsMappingUI
    const mapped = elements.map((el: any, idx: number) => ({
      elementId: el.elementId || el.id || `element-${idx}`,
      elementName: el.elementName || el.name || el.element || `Element ${idx + 1}`,
      description: el.description || el.rationale || '',
      dataType: el.dataType || el.expectedType || el.type || 'string',
      purpose: el.purpose || el.derivation || '',
      required: el.required !== false, // Default to true
      sourceField: el.sourceField || el.mappedColumn || el.source || undefined,
      sourceAvailable: el.sourceAvailable ?? (!!el.sourceField || !!el.mappedColumn),
      transformationRequired: el.transformationRequired ?? (!!el.transformationLogic || !!el.derivation),
      transformationLogic: el.transformationLogic,
      alternatives: el.alternatives,
      confidence: el.confidence
    }));

    console.log(`📋 [P1-3 DEBUG] Mapped ${mapped.length} required elements for DataElementsMappingUI (expected ~15 from prepare step)`);
    if (mapped.length < 10) {
      console.warn(`⚠️ [P1-3 DEBUG] WARNING: Only ${mapped.length} elements mapped, expected more. Check requirementsDocument structure.`);
    }
    return mapped;
  }, [requiredDataElements]);

  // Sync local state with journeyProgress (SSOT)
  // FIX: Always prioritize journeyProgress.requirementsDocument as the single source of truth
  // This ensures data elements from Prepare step flow correctly to Verification step
  useEffect(() => {
    if (journeyProgress) {
      if (journeyProgress.piiDecision && !piiReviewCompleted) {
        setPiiReviewCompleted(true);
        setVerificationStatus(prev => ({ ...prev, piiReview: true }));
      }
      setVerificationStatus(prev => ({
        ...prev,
        dataQuality: journeyProgress.dataQualityApproved || prev.dataQuality,
        schemaValidation: journeyProgress.schemaValidated || prev.schemaValidation,
        piiReview: !!journeyProgress.piiDecision || prev.piiReview,
      }));

      // FIX: Always sync from journeyProgress when it has requirementsDocument
      // This ensures Preparation step data flows to Verification step
      if (journeyProgress.requirementsDocument) {
        const reqDoc = journeyProgress.requirementsDocument as any;
        const isLocked = (journeyProgress as any).requirementsLocked === true;
        console.log('✅ [SSOT] Loading requirementsDocument from journeyProgress:', {
          elementsCount: reqDoc?.requiredDataElements?.length || 0,
          analysesCount: reqDoc?.analysisPath?.length || 0,
          isLocked,
          source: 'journeyProgress.requirementsDocument',
          action: 'LOADED_FROM_SSOT'
        });
        setRequiredDataElements(reqDoc);
        
        // Also log analysis recommendations and questions for debugging
        if (reqDoc.analysisPath) {
          console.log('📋 [SSOT] Analysis recommendations:', reqDoc.analysisPath.map((a: any) => a.type || a).join(', '));
        }
        if (reqDoc.userQuestions) {
          console.log('📋 [SSOT] User questions:', reqDoc.userQuestions.length);
        }
      } else {
        // DEBUG: Log when requirementsDocument is missing
        const isLocked = (journeyProgress as any)?.requirementsLocked === true;
        console.log('⚠️ [SSOT] requirementsDocument missing in journeyProgress:', {
          isLocked,
          hasRequirementsDocument: false,
          action: isLocked ? 'WILL_BLOCK_REGENERATION' : 'WILL_ATTEMPT_FALLBACK'
        });
      }
    }
  }, [journeyProgress]);

  // FIX: Fallback API fetch for required data elements
  // Only runs when journeyProgress is loaded but doesn't have requirementsDocument
  // This handles cases where Prepare step wasn't completed but we still need to show something
  useEffect(() => {
    // Skip if:
    // 1. Project is still loading (useProject hasn't finished)
    // 2. We already have data elements from journeyProgress (SSOT)
    // 3. We already have data elements from a previous fetch
    // 4. No project ID available
    // Wait for journeyProgress to fully load before making any decisions
    if (projectLoading || !currentProjectId) {
      console.log('⏳ [SSOT] Waiting for journeyProgress to load...');
      return;
    }

    // Priority 1: Use requirementsDocument from journeyProgress (SSOT)
    if (journeyProgress?.requirementsDocument) {
      console.log('✅ [SSOT] requirementsDocument exists in journeyProgress, no API fallback needed');
      return;
    }

    // Priority 2: Check if requirements are locked - if so, never call API (even if document missing)
    // This prevents regeneration when requirements are locked
    const isLocked = (journeyProgress as any)?.requirementsLocked === true;
    if (isLocked && !journeyProgress?.requirementsDocument) {
      // Requirements are locked but document missing - this is an error state
      console.error('❌ [SSOT] Requirements locked but document missing - this should not happen');
      toast({
        title: "Error",
        description: "Required data elements are locked but missing. Please contact support or restart the journey.",
        variant: "destructive"
      });
      return; // Don't call API - regeneration would violate lock
    }

    // Skip if already loaded
    if (requiredDataElements) {
      console.log('✅ [SSOT] requiredDataElements already loaded, no API fallback needed');
      return;
    }

    // Last resort: Fetch from API only if requirements are NOT locked
    // This handles edge cases where Prepare step wasn't completed
    const fetchFallback = async () => {
      try {
        console.log('⚠️ [Fallback] journeyProgress loaded but no requirementsDocument (not locked), fetching from API...');
        const dataElementsResponse = await apiClient.get(`/api/projects/${currentProjectId}/required-data-elements`);
        if (dataElementsResponse.success && dataElementsResponse.document) {
          setRequiredDataElements(dataElementsResponse.document);
          console.log('✅ [Fallback] Loaded from API:', dataElementsResponse.document?.requiredDataElements?.length || 0, 'elements');
        }
      } catch (error) {
        console.warn('❌ [Fallback] Required data elements not available from API:', error);
        toast({
          title: "Warning",
          description: "Could not load required data elements. Please complete the Preparation step first.",
          variant: "destructive"
        });
      }
    };

    fetchFallback();
  }, [projectLoading, currentProjectId, journeyProgress?.requirementsDocument, requiredDataElements]);

  // Load project data on mount or when ID changes
  useEffect(() => {
    if (currentProjectId) {
      loadProjectData(currentProjectId);
    }
  }, [currentProjectId]);

  const loadProjectData = async (projectId: string) => {
    try {
      setIsLoading(true);

      if (!projectId) {
        toast({
          title: "No Project Found",
          description: "Please upload data first before verification",
          variant: "destructive"
        });
        return;
      }

      // Load project data
      let project: any = null;
      try {
        project = await apiClient.getProject(projectId);
      } catch (projectError) {
        console.error('⚠️ Failed to load project:', projectError);
        // Create minimal project object so we can continue
        project = { id: projectId, name: 'Project' };
      }

      // [GAP FIX] Prioritize journeyProgress.joinedData (SSOT)
      const journeyProgressJoinedData = journeyProgress?.joinedData;

      let datasets: any[] = [];
      let joinedRows: any[] = [];
      let joinedSchema: any = null;
      let joinInsightsData: any = null;
      let totalRecordCount: number = 0;
      let datasetsResponse: any = null;

      // Helper to check if schema has actual content
      const hasSchemaContent = (schema: any): boolean => {
        if (!schema) return false;
        if (typeof schema !== 'object') return false;
        if (Array.isArray(schema)) return schema.length > 0;
        return Object.keys(schema).length > 0;
      };

      // Try to get data from journeyProgress first (fastest, most consistent)
      if (journeyProgressJoinedData) {
        console.log('✅ [SSOT] Using persisted joinedData from journeyProgress');
        joinedRows = journeyProgressJoinedData.preview || [];
        // CRITICAL: Only use schema if it has actual content
        joinedSchema = hasSchemaContent(journeyProgressJoinedData.schema)
          ? journeyProgressJoinedData.schema
          : null;
        joinInsightsData = journeyProgressJoinedData.joinInsights || null;
        totalRecordCount = (journeyProgressJoinedData as any).totalRowCount || journeyProgressJoinedData.rowCount || journeyProgressJoinedData.preview?.length || 0;

        console.log(`📊 [SSOT] joinedData: ${joinedRows.length} rows, schema keys: ${joinedSchema ? Object.keys(joinedSchema).length : 0}`);

        // Still fetch datasets for the list view, but don't rely on them for the main preview if we have joinedData
        try {
          datasetsResponse = await apiClient.getProjectDatasets(projectId);
          datasets = Array.isArray(datasetsResponse?.datasets) ? datasetsResponse.datasets : [];

          // CRITICAL FIX: If journeyProgress didn't have schema but API response does, use API schema
          if (!joinedSchema && hasSchemaContent(datasetsResponse?.joinedSchema)) {
            joinedSchema = datasetsResponse.joinedSchema;
            console.log(`📊 [API Fallback] Using joinedSchema from API: ${Object.keys(joinedSchema).length} columns`);
          }
        } catch (e) { console.warn('Failed to refresh datasets list', e); }
      } else {
        // Fallback to fetching from API if not in progress state
        try {
          datasetsResponse = await apiClient.getProjectDatasets(projectId);
          console.log('📊 Datasets response:', datasetsResponse);

          datasets = Array.isArray(datasetsResponse?.datasets) ? datasetsResponse.datasets : [];
          joinedRows = Array.isArray(datasetsResponse?.joinedPreview) ? datasetsResponse.joinedPreview : [];
          joinedSchema = hasSchemaContent(datasetsResponse?.joinedSchema) ? datasetsResponse.joinedSchema : null;
          joinInsightsData = datasetsResponse?.joinInsights || null;
          totalRecordCount = datasetsResponse?.totalRecordCount || 0;
        } catch (datasetError) {
          console.error('❌ Failed to load datasets:', datasetError);
        }
      }

      setJoinInsights(joinInsightsData);

      // Process datasets and build preview
      if (datasets.length > 0 || joinedRows.length > 0) {
        // FIX 2.1: Build combined preview and schema from ALL datasets when no joined preview
        let previewSource: any[] = [];
        let derivedSchema: Record<string, any> = {};

        // CRITICAL FIX: Check for actual schema content, not just truthiness
        if (joinedRows.length > 0 && hasSchemaContent(joinedSchema)) {
          // Use backend-provided joined data (from SSOT or API)
          previewSource = joinedRows.slice(0, 50);
          derivedSchema = joinedSchema;
          console.log('✅ Using JOINED preview and schema:', joinedRows.length, 'rows,', Object.keys(joinedSchema).length, 'columns');
        } else if (datasets.length > 0) {
          // [PHASE 4 FIX] Build combined preview from ALL datasets with improved schema merge
          console.log('📊 [Phase 4] Building combined preview from', datasets.length, 'datasets (no backend join)');

          // Track which columns came from which dataset for debugging
          const columnSources: Record<string, string> = {};

          for (let dsIdx = 0; dsIdx < datasets.length; dsIdx++) {
            const ds = datasets[dsIdx];
            const dataset = ds?.dataset || ds || {};
            const datasetPreview = dataset?.preview || dataset?.data?.slice(0, 20) || [];

            // Merge schema from each dataset
            if (dataset?.schema) {
              // [PHASE 4 FIX] Clean dataset name: strip extension, shorten if needed
              const rawName = dataset?.originalFileName || dataset?.name || `Dataset${dsIdx + 1}`;
              const cleanName = rawName.replace(/\.[^.]+$/, '').substring(0, 15);

              Object.entries(dataset.schema).forEach(([col, type]) => {
                // [PHASE 4 FIX] Use deterministic prefix for conflicts
                let finalCol = col;
                if (derivedSchema[col] !== undefined && datasets.length > 1) {
                  // Use ds1_, ds2_ prefix instead of long file names
                  finalCol = `${cleanName}_${col}`;
                  console.log(`📊 [Phase 4] Column conflict: '${col}' from ${rawName} renamed to '${finalCol}'`);
                }
                derivedSchema[finalCol] = type;
                columnSources[finalCol] = rawName;
              });
            }

            // Add preview rows with source indicator to main preview if space allows
            if (Array.isArray(datasetPreview) && datasetPreview.length > 0) {
              const rowsToAdd = previewSource.length < 50
                ? datasetPreview.slice(0, 50 - previewSource.length)
                : [];
              previewSource = [...previewSource, ...rowsToAdd];
            }
          }
        }

        console.log(`📊 [Phase 4] Merged schema has ${Object.keys(derivedSchema).length} columns from ${datasets.length} datasets`);

        // If still empty, use first dataset as final fallback
        if (previewSource.length === 0) {
          const firstDatasetItem = datasets[0];
          const dataset = firstDatasetItem?.dataset || firstDatasetItem || {};
          previewSource = dataset?.preview || dataset?.data?.slice(0, 20) || [];
          derivedSchema = dataset?.schema || project.schema || {};
        }

        // [PHASE 4 & 5 FIX] Prefer backend-provided mergedSchema if available
        if (datasetsResponse?.mergedSchema && Object.keys(datasetsResponse.mergedSchema).length > 0) {
          derivedSchema = datasetsResponse.mergedSchema;
          console.log('📊 [Phase 4] Using backend mergedSchema with', Object.keys(derivedSchema).length, 'columns');
        } else {
          derivedSchema = Object.keys(derivedSchema).length > 0 ? derivedSchema : project.schema || {};
        }

        const projectWithData = {
          ...project,
          preview: previewSource,
          sampleData: previewSource,
          schema: derivedSchema,
          datasets,
          datasetCount: datasets.length,
          // [PHASE 5 FIX] Use calculated totalRecordCount from SSOT or API
          recordCount: totalRecordCount || project.recordCount,
          totalRecordCount: totalRecordCount,
          recordCountNote: datasetsResponse?.recordCountNote,
          joinedPreview: joinedRows,
          joinInsights: joinInsightsData
        };

        setProjectData(projectWithData);

        if (previewSource.length > 0) {
          console.log('✅ Preview data loaded:', previewSource.length, 'rows (joined view preferred)');
          updateVerificationStatus('dataPreview', true);
        }
      } else {
        console.warn('⚠️ No datasets found for project');
        setProjectData(project);
      }

      // Load data quality assessment
      try {
        const qualityResponse = await apiClient.get(`/api/projects/${projectId}/data-quality`);
        setDataQuality(qualityResponse);
      } catch (error) {
        console.warn('Data quality assessment not available:', error);
      }

      // Load PII detection results
      try {
        const piiResponse = await apiClient.get(`/api/projects/${projectId}/pii-analysis`);
        setPiiResults(piiResponse);
      } catch (error) {
        console.warn('PII analysis not available:', error);
      }

      // Load schema analysis
      try {
        const schemaResponse = await apiClient.get(`/api/projects/${projectId}/schema-analysis`);
        setSchemaAnalysis(schemaResponse);
      } catch (error) {
        console.warn('Schema analysis not available:', error);
      }

      // FIX: Required data elements are now loaded from journeyProgress (SSOT) in the sync useEffect
      // API fallback is handled separately after journeyProgress is confirmed loaded
      // This prevents race conditions and ensures Prepare step data propagates correctly

    } catch (error) {
      console.error('Failed to load project data:', error);
      toast({
        title: "Error",
        description: "Failed to load project data for verification",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

// Auto-approve verification steps when data loads successfully with good quality
// This improves UX by pre-approving steps that meet quality thresholds
useEffect(() => {
  if (isLoading) return;

  // Auto-approve data quality if score is high enough (>= 70%)
  if (dataQuality && qualityScore >= 70 && !verificationStatus.dataQuality) {
    console.log('✅ Auto-approving data quality (score:', qualityScore, ')');
    updateVerificationStatus('dataQuality', true);
  }

  // Auto-approve schema validation if schema exists and has columns
  if (schemaAnalysis && projectData?.schema && Object.keys(projectData.schema).length > 0 && !verificationStatus.schemaValidation) {
    console.log('✅ Auto-approving schema validation');
    updateVerificationStatus('schemaValidation', true);
  }

  // Auto-approve PII review if no PII detected
  if (piiResults && (!piiResults.detectedPII || piiResults.detectedPII.length === 0) && !verificationStatus.piiReview) {
    console.log('✅ Auto-approving PII review (no PII detected)');
    setPiiReviewCompleted(true);
    updateVerificationStatus('piiReview', true);
  }
}, [isLoading, dataQuality, qualityScore, schemaAnalysis, projectData, piiResults, verificationStatus]);

const handlePIIReview = () => {
  if (piiResults && piiResults.detectedPII?.length > 0) {
    setShowPIIDialog(true);
  } else {
    setPiiReviewCompleted(true);
    updateVerificationStatus('piiReview', true);
  }
};

const handlePIIApproval = async (requiresPII: boolean, anonymizeData: boolean, selectedColumns: string[]) => {
  const projectId = localStorage.getItem('currentProjectId');

  setPiiReviewCompleted(true);
  setShowPIIDialog(false);
  updateVerificationStatus('piiReview', true);

  if (projectId) {
    try {
      // FIX: Save PII decision to project metadata so transformation step can exclude these columns
      // If requiresPII is false, user wants to EXCLUDE the detected PII columns
      // selectedColumns contains the columns the user wants to KEEP (include in analysis)
      const allPiiColumns = piiResults?.detectedPII?.map((p: any) => p.column) || [];

      // Columns to exclude = all PII columns MINUS the ones user selected to keep
      const columnsToExclude = requiresPII
        ? allPiiColumns.filter((col: string) => !selectedColumns.includes(col))
        : allPiiColumns; // If user doesn't want PII at all, exclude all PII columns

      console.log(`🔒 [PII Frontend] User decision: requiresPII=${requiresPII}, anonymize=${anonymizeData}`);
      console.log(`🔒 [PII Frontend] Detected PII columns:`, allPiiColumns);
      console.log(`🔒 [PII Frontend] Columns user wants to keep:`, selectedColumns);
      console.log(`🔒 [PII Frontend] Columns to exclude:`, columnsToExclude);
      console.log(`🔒 [PII Frontend] Saving to project ${projectId}...`);

      // Build metadata payload
      const metadataPayload = {
        piiDecision: {
          requiresPII,
          anonymizeData,
          selectedColumns: columnsToExclude, // Columns to EXCLUDE from transformations
          decisionTimestamp: new Date().toISOString(),
          allDetectedPiiColumns: allPiiColumns
        },
        excludedColumns: columnsToExclude, // Direct access for transformation step
        anonymizedColumns: anonymizeData ? selectedColumns : [] // Columns to anonymize if user chose anonymization
      };

      console.log(`🔒 [PII Frontend] Metadata payload:`, JSON.stringify(metadataPayload, null, 2));

      // Update journeyProgress with PII decision (SSOT)
      updateProgress({
        piiDecision: {
          excludedColumns: columnsToExclude,
          anonymizedColumns: anonymizeData ? selectedColumns : [],
          decisionTimestamp: new Date().toISOString()
        },
        currentStep: 'verification'
      });

      console.log(`💾 [PII Frontend] Saved PII decision to journeyProgress: ${columnsToExclude.length} columns to exclude`);

      // D2 FIX: Actually filter the data on the backend, not just UI
      if (columnsToExclude.length > 0 || (anonymizeData && selectedColumns.length > 0)) {
        console.log(`🔒 [D2 FIX] Calling server-side PII exclusion...`);
        try {
          const piiExclusionResult = await apiClient.post(`/api/projects/${projectId}/apply-pii-exclusions`, {
            excludedColumns: columnsToExclude,
            anonymizedColumns: anonymizeData ? selectedColumns : []
          });
          console.log(`✅ [D2 FIX] Server-side PII exclusion complete:`, piiExclusionResult);
        } catch (piiError: any) {
          console.error(`❌ [D2 FIX] Server-side PII exclusion failed:`, piiError);
          // Don't fail the whole operation, just warn
          toast({
            title: "Warning",
            description: "PII decision saved but data filtering may not have applied. Please verify in transformation step.",
            variant: "destructive"
          });
        }
      }

      // Approve PII-related checkpoints on the server
      const checkpointsResponse = await apiClient.get(`/api/projects/${projectId}/checkpoints`);
      const checkpoints = checkpointsResponse?.checkpoints || [];

      const piiCheckpoints = checkpoints.filter((cp: any) =>
        cp.status === 'waiting_approval' &&
        (cp.stepName?.includes('pii') || cp.stepName?.includes('privacy'))
      );

      for (const checkpoint of piiCheckpoints) {
        await apiClient.submitCheckpointFeedback(
          projectId,
          checkpoint.id,
          `PII review complete. Excluded ${columnsToExclude.length} columns. Anonymize: ${anonymizeData}`,
          true
        );
      }

      console.log(`✅ Approved ${piiCheckpoints.length} PII checkpoints`);

      // Show success toast with details
      toast({
        title: "PII Decision Saved",
        description: `${columnsToExclude.length} column(s) will be excluded from analysis.`,
      });
    } catch (error: any) {
      console.error('❌ [PII Frontend] Failed to save PII decision or approve checkpoints:', error);
      console.error('❌ [PII Frontend] Error details:', error?.message, error?.response);
      toast({
        title: "Warning - PII Not Saved",
        description: error?.message || "PII decision may not have been saved. Please try again or verify in the transformation step.",
        variant: "destructive"
      });
    }
  } else {
    console.warn('⚠️ [PII Frontend] No projectId found in localStorage - cannot save PII decision');
  }

  toast({
    title: "PII Review Complete",
    description: "Data privacy review has been completed",
  });
};

const handleSchemaConfirm = (schema: Record<string, string>) => {
  setEditedSchema(schema);
  updateVerificationStatus('schemaValidation', true);
  toast({
    title: "Schema Confirmed",
    description: "Schema validation complete",
  });
};

const handleQualityApprove = async () => {
  const projectId = localStorage.getItem('currentProjectId');

  // Update journeyProgress (SSOT)
  updateProgress({
    dataQualityApproved: true,
    dataQualityScore: qualityScore,
    currentStep: 'verification'
  });

  toast({
    title: "Quality Approved",
    description: "Data quality has been approved and agent checkpoints updated",
  });
};

const handlePreviewConfirm = () => {
  if (!projectData?.preview || projectData.preview.length === 0) {
    toast({
      title: "No Preview Data",
      description: "Upload data before marking the preview as reviewed.",
      variant: "destructive"
    });
    return;
  }

  updateVerificationStatus('dataPreview', true);
  toast({
    title: "Preview Reviewed",
    description: "Data preview marked as reviewed",
  });
};

const handleFixIssue = (issueIndex: number) => {
  toast({
    title: "Apply Fix",
    description: "Fix functionality will be implemented",
  });
};

const updateVerificationStatus = (key: keyof VerificationStatus, value: boolean) => {
  setVerificationStatus(prev => {
    const updated = { ...prev, [key]: value };

    // Check if all verification steps are complete
    const allComplete = Object.values(updated).every(status => status === true);
    updated.overallApproved = allComplete;

    return updated;
  });
};

const handleApproveData = async () => {
  try {
    setIsProcessing(true);

    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) {
      toast({
        title: "Project Not Found",
        description: "No project ID found. Please go back to Data Upload step.",
        variant: "destructive"
      });
      return;
    }

    // Mark project as verified in journeyProgress (SSOT) and mark step as complete
    updateProgress({
      currentStep: 'transformation',
      completedSteps: [...(journeyProgress?.completedSteps || []), 'data-verification'],
      schemaValidated: verificationStatus.schemaValidation,
      dataQualityApproved: verificationStatus.dataQuality,
      stepTimestamps: {
        ...(journeyProgress?.stepTimestamps || {}),
        dataVerificationCompleted: new Date().toISOString()
      }
    });

    toast({
      title: "Data Approved",
      description: "Your data has been verified and approved for analysis",
    });

    // Proceed to next step
    if (onNext) {
      onNext();
    }

  } catch (error: any) {
    console.error('Failed to approve data:', error);
    toast({
      title: "Error",
      description: error.message || "Failed to approve data. Please try again.",
      variant: "destructive"
    });
  } finally {
    setIsProcessing(false);
  }
};

const getJourneyTypeInfo = () => {
  switch (journeyType) {
    case 'non-tech':
      return {
        title: "AI-Guided Data Verification",
        description: "Our AI has analyzed your data. Review the findings below.",
        icon: CheckCircle,
        color: "blue"
      };
    case 'business':
      return {
        title: "Business Data Verification",
        description: "Verify your business data quality and structure",
        icon: Database,
        color: "green"
      };
    case 'technical':
      return {
        title: "Technical Data Verification",
        description: "Review data quality, schema, and technical details",
        icon: BarChart3,
        color: "purple"
      };
    case 'consultation':
      return {
        title: "Expert Data Verification",
        description: "Comprehensive data review with expert validation",
        icon: Shield,
        color: "indigo"
      };
    default:
      return {
        title: "Data Verification",
        description: "Review and verify your uploaded data",
        icon: CheckCircle,
        color: "blue"
      };
  }
};

const journeyInfo = getJourneyTypeInfo();
const IconComponent = journeyInfo.icon;

if (isLoading) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <h3 className="text-lg font-semibold mb-2">Loading Data Verification</h3>
            <p className="text-gray-600">Analyzing your uploaded data...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

if (!projectData) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-600" />
            <h3 className="text-lg font-semibold mb-2">No Data Found</h3>
            <p className="text-gray-600 mb-4">Please upload data first before verification.</p>
            {onPrevious && (
              <Button onClick={onPrevious} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back to Upload
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const verificationSteps = [
  {
    id: 'dataPreview',
    title: 'Data Preview',
    description: 'Review uploaded data structure and sample records',
    status: verificationStatus.dataPreview,
    icon: Eye
  },
  {
    id: 'dataQuality',
    title: 'Data Quality',
    description: 'Assess completeness, consistency, and validity',
    status: verificationStatus.dataQuality,
    icon: CheckCircle
  },
  {
    id: 'schemaValidation',
    title: 'Schema Validation',
    description: 'Verify data types and structure detection',
    status: verificationStatus.schemaValidation,
    icon: Database
  },
  {
    id: 'piiReview',
    title: 'Privacy Review',
    description: 'Check for personally identifiable information',
    status: verificationStatus.piiReview,
    icon: Shield
  }
  // Profiling step removed - moved to data upload step
];

const completedSteps = verificationSteps.filter(step => step.status).length;
const totalSteps = verificationSteps.length;
const progressPercentage = (completedSteps / totalSteps) * 100;

return (
  <div className="space-y-6">
    {/* Header */}
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconComponent className="w-6 h-6 text-blue-600" />
          {journeyInfo.title}
        </CardTitle>
        <CardDescription>{journeyInfo.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Verification Progress</span>
            <span className="text-sm text-gray-600">{completedSteps}/{totalSteps} completed</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      </CardContent>
    </Card>

    {/* Detailed Verification Tabs - Moved to Top */}
    <Card>
      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="schema">Schema</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="elements">Elements</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="space-y-4">
          {/* FIX #30: Multi-dataset tab navigation - allows viewing each dataset individually */}
          {projectData?.datasets && projectData.datasets.length > 1 && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-blue-900 text-base">
                  <Link2 className="w-5 h-5" />
                  Multi-Dataset View
                </CardTitle>
                <CardDescription className="text-blue-800">
                  {projectData.datasets.length} datasets uploaded. Select a view below.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {/* Dataset selection tabs */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    variant={selectedDatasetIndex === -1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDatasetIndex(-1)}
                    className={selectedDatasetIndex === -1 ? "bg-blue-600" : ""}
                  >
                    <Link2 className="w-4 h-4 mr-1" />
                    {joinInsights?.joinStrategy === 'join' ? 'Joined View' : 'Combined View'}
                  </Button>
                  {projectData.datasets.map((ds: any, idx: number) => {
                    const dataset = ds?.dataset || ds;
                    const fileName = dataset?.fileName || dataset?.name || `Dataset ${idx + 1}`;
                    return (
                      <Button
                        key={idx}
                        variant={selectedDatasetIndex === idx ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedDatasetIndex(idx)}
                        className={selectedDatasetIndex === idx ? "bg-blue-600" : ""}
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        {fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName}
                      </Button>
                    );
                  })}
                </div>

                {/* Join insights info (only show when on joined view) */}
                {selectedDatasetIndex === -1 && joinInsights && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="bg-white text-blue-700 border-blue-200">
                        {joinInsights.detectionMethod === 'column_match' ? 'Column Match' :
                          joinInsights.detectionMethod === 'pk_fk' ? 'Primary/Foreign Key' :
                            joinInsights.detectionMethod === 'name_similarity' ? 'Name Similarity' : 'Auto-detected'}
                      </Badge>
                      <Badge variant="outline" className="bg-white text-blue-700 border-blue-200">
                        {joinInsights.joinStrategy === 'join' ? 'Joined View' : 'Stacked Preview'}
                      </Badge>
                      {joinInsights.foreignKeys?.length > 0 && (
                        <Badge variant="outline" className="bg-white text-green-700 border-green-200">
                          {joinInsights.foreignKeys.length} relationship(s) detected
                        </Badge>
                      )}
                    </div>
                    {joinInsights.foreignKeys?.length > 0 && (
                      <div className="mt-3 text-sm text-gray-700">
                        <p className="font-medium text-gray-900 mb-1">Join Keys:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {joinInsights.foreignKeys.map((fk: any, idx: number) => (
                            <li key={idx}>
                              <span className="font-semibold">{fk.datasetName}</span>.{fk.foreignColumn}{' '}
                              ↔ {joinInsights.primaryDatasetName}.{fk.primaryColumn}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Individual dataset info (when a specific dataset is selected) */}
                {selectedDatasetIndex >= 0 && projectData.datasets[selectedDatasetIndex] && (() => {
                  const ds = projectData.datasets[selectedDatasetIndex];
                  const dataset = ds?.dataset || ds;
                  return (
                    <div className="text-sm text-gray-700">
                      <p><span className="font-medium">File:</span> {dataset?.fileName || dataset?.name || 'Unknown'}</p>
                      <p><span className="font-medium">Rows:</span> {dataset?.preview?.length || dataset?.data?.length || 0}</p>
                      <p><span className="font-medium">Columns:</span> {Object.keys(dataset?.schema || dataset?.preview?.[0] || {}).length}</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Data Preview</CardTitle>
              <CardDescription>
                {selectedDatasetIndex === -1
                  ? `Showing ${projectData?.preview?.length || 0} sample records${(dataQuality?.recordCount || projectData?.recordCount) ? ` of ${(dataQuality?.recordCount || projectData?.recordCount)?.toLocaleString()} total` : ''} — profiling and analysis will use the complete dataset`
                  : `Viewing dataset ${selectedDatasetIndex + 1} of ${projectData?.datasets?.length || 1}`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // FIX #30: Get preview data based on selected dataset index
                let previewData: any[] = [];

                if (selectedDatasetIndex === -1) {
                  // Joined/combined view (default)
                  previewData = Array.isArray(projectData.joinedPreview) && projectData.joinedPreview.length > 0
                    ? projectData.joinedPreview.slice(0, 10)
                    : Array.isArray(projectData.data) ? projectData.data.slice(0, 10) :
                      Array.isArray(projectData.preview) ? projectData.preview :
                        Array.isArray(projectData.sampleData) ? projectData.sampleData : [];
                } else if (projectData?.datasets && projectData.datasets[selectedDatasetIndex]) {
                  // Individual dataset view
                  const ds = projectData.datasets[selectedDatasetIndex];
                  const dataset = ds?.dataset || ds;
                  previewData = Array.isArray(dataset?.preview) ? dataset.preview.slice(0, 10) :
                    Array.isArray(dataset?.data) ? dataset.data.slice(0, 10) : [];
                }

                if (previewData.length > 0) {
                  // Get column headers from first row
                  const firstRow = previewData[0];
                  const headers = Object.keys(firstRow || {});

                  if (headers.length === 0) {
                    return (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Preview data structure is invalid
                        </AlertDescription>
                      </Alert>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <ScrollArea className="h-96 w-full border rounded-lg">
                        <div className="min-w-max pb-4">
                          <Table>
                            <TableHeader className="sticky top-0 bg-gray-50 z-10">
                              <TableRow>
                                {headers.map((key) => (
                                  <TableHead key={key} className="whitespace-nowrap">{String(key)}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewData.slice(0, 10).map((row: any, index: number) => (
                                <TableRow key={index} className="hover:bg-gray-50">
                                  {Object.values(row).map((value: any, cellIndex: number) => {
                                    const cellValue = value === null || value === undefined ? '' :
                                      typeof value === 'object' ? JSON.stringify(value) : String(value);
                                    return (
                                      <TableCell key={cellIndex} className="whitespace-nowrap">
                                        {cellValue}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>

                      <div className="flex justify-end">
                        <Button
                          variant={verificationStatus.dataPreview ? "secondary" : "default"}
                          onClick={handlePreviewConfirm}
                          disabled={verificationStatus.dataPreview}
                        >
                          {verificationStatus.dataPreview ? (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Preview Confirmed
                            </>
                          ) : (
                            'Confirm Preview'
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      No preview data available. Please ensure your file was uploaded successfully.
                    </AlertDescription>
                  </Alert>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <DataQualityCheckpoint
            qualityScore={Math.max(0, Math.min(100, qualityScore || 0))}
            issues={qualityIssues}
            onApprove={handleQualityApprove}
            onFixIssue={handleFixIssue}
            isLoading={isProcessing || qualityScore === 0}
          />

          {qualityLabel && (
            <Card>
              <CardHeader>
                <CardTitle>Quality Assessment Summary</CardTitle>
                <CardDescription>
                  Assessment label: <Badge variant="outline" className="uppercase">{qualityLabel.replace(/_/g, ' ')}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Dataset Records</p>
                  <p className="text-2xl font-semibold">{dataQuality?.recordCount ?? projectData?.recordCount ?? dataQuality?.metadata?.recordCount ?? '—'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Generated At</p>
                  <p className="text-2xl font-semibold">{dataQuality?.metadata?.generatedAt ? new Date(dataQuality.metadata.generatedAt).toLocaleString() : '—'}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {qualityMetrics && (
            <Card>
              <CardHeader>
                <CardTitle>Quality Metrics Breakdown</CardTitle>
                <CardDescription>Detailed metrics powering the overall quality score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(qualityMetrics).map(([metricName, value]) => {
                  const metricValue = typeof value === 'number' ? Math.round(value) : null;
                  const label = metricName.charAt(0).toUpperCase() + metricName.slice(1);
                  return (
                    <div key={metricName} className="space-y-2">
                      <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                        <span>{label}</span>
                        <span>{metricValue !== null ? `${metricValue}%` : '—'}</span>
                      </div>
                      {metricValue !== null && (
                        <Progress value={Math.max(0, Math.min(100, metricValue))} />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {qualityRecommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recommended Actions</CardTitle>
                <CardDescription>Suggestions from the data quality checker</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {qualityRecommendations.map((rec: string, index: number) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schema" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Schema Analysis</CardTitle>
              <CardDescription>Detected data types and structure</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // FIX: Use joined schema from journeyProgress (SSOT) instead of individual dataset schema
                const joinedSchema = journeyProgress?.joinedData?.schema || projectData?.schema;
                const schemaToDisplay = joinedSchema || schemaAnalysis?.schema;
                const columnCount = joinedSchema 
                  ? (Array.isArray(joinedSchema) ? joinedSchema.length : Object.keys(joinedSchema).length)
                  : (schemaAnalysis?.totalColumns || Object.keys(schemaAnalysis?.schema || {}).length);
                const columnNames = joinedSchema
                  ? (Array.isArray(joinedSchema) 
                      ? joinedSchema.map((col: any) => col.name || col.column || col)
                      : Object.keys(joinedSchema))
                  : (schemaAnalysis?.columnNames || []);
                const columnTypes = joinedSchema && !Array.isArray(joinedSchema)
                  ? Object.entries(joinedSchema).reduce((acc: Record<string, number>, [_, type]) => {
                      const typeStr = String(type);
                      acc[typeStr] = (acc[typeStr] || 0) + 1;
                      return acc;
                    }, {})
                  : (schemaAnalysis?.columnTypes || {});

                return schemaToDisplay ? (
                <div className="space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Detected Schema {joinedSchema ? '(Joined Dataset)' : ''}</h4>
                      <p className="text-sm text-gray-600 mb-4">
                        Total columns: {columnCount}
                      </p>
                    </div>

                    {columnNames && columnNames.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Column Names:</h5>
                        <div className="flex flex-wrap gap-2">
                          {columnNames.slice(0, 20).map((col: string, idx: number) => (
                            <Badge key={idx} variant="outline">{col}</Badge>
                          ))}
                          {columnNames.length > 20 && (
                            <Badge variant="outline">+{columnNames.length - 20} more</Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {Object.keys(columnTypes).length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Data Types:</h5>
                        <div className="text-sm text-gray-600">
                          {Object.entries(columnTypes).map(([type, count]) => (
                            <div key={type} className="flex justify-between">
                              <span>{type}</span>
                              <span>{count as number} columns</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => setShowSchemaDialog(true)}
                    variant="outline"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Review & Edit Schema
                  </Button>
                </div>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Schema analysis is not available. This may be normal for some file types.
                  </AlertDescription>
                </Alert>
              );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Review</CardTitle>
              <CardDescription>Check for personally identifiable information</CardDescription>
            </CardHeader>
            <CardContent>
              {piiResults ? (
                <div className="space-y-4">
                  {piiResults.detectedPII && piiResults.detectedPII.length > 0 ? (
                    <div>
                      <Alert className="mb-4">
                        <Shield className="h-4 w-4" />
                        <AlertDescription>
                          PII detected in your data. Please review the findings below.
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-2">
                        <h4 className="font-semibold">Detected PII Fields:</h4>
                        {(piiResults.detectedPII || []).map((pii: any, index: number) => (
                          <Badge key={index} variant="destructive" className="mr-2">
                            {pii.column || pii.field}: {(pii.types || [pii.type]).join(', ')}
                          </Badge>
                        ))}
                      </div>

                      <Button
                        onClick={handlePIIReview}
                        className="mt-4"
                        variant="outline"
                      >
                        <Shield className="w-4 h-4 mr-2" />
                        Review PII Handling
                      </Button>
                    </div>
                  ) : (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        No PII detected in your data.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={handlePIIReview}
                      variant={verificationStatus.piiReview ? "secondary" : "default"}
                      disabled={verificationStatus.piiReview}
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      {verificationStatus.piiReview ? "Privacy Reviewed" : "Mark Privacy Reviewed"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    PII analysis is running or not available.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* P1-3 FIX: Add Elements tab to render DataElementsMappingUI */}
        <TabsContent value="elements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Map Required Data Elements</CardTitle>
              <CardDescription>
                Connect your business requirements to actual data columns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {requiredElements.length > 0 ? (
                <DataElementsMappingUI
                  requiredDataElements={requiredElements}
                  availableColumns={availableColumns}
                  onSaveMapping={async (mappings) => {
                    // P1-3: Persist element mappings to journeyProgress
                    // Then call Data Engineer agent to add transformation logic in natural language
                    console.log('📋 [P1-3] Saving data element mappings:', mappings);
                    try {
                      // Build element mappings object for Data Engineer endpoint
                      const elementMappings: Record<string, any> = {};
                      (mappings as any[]).forEach((m: any) => {
                        elementMappings[m.elementId] = {
                          sourceColumn: m.mappedColumn,
                          transformationDescription: m.transformationDescription,
                          transformationCode: m.transformationCode
                        };
                      });

                      // Call Data Engineer endpoint to enhance mappings with transformation logic
                      const enhanceResponse = await apiClient.post(
                        `/api/projects/${currentProjectId}/enhance-requirements-mappings`,
                        { elementMappings }
                      );

                      if (enhanceResponse.success && enhanceResponse.document) {
                        // Update journeyProgress with enhanced requirements document
                        await updateProgress({
                          requirementsDocument: enhanceResponse.document,
                          // Also update flat version for backwards compatibility
                          requiredDataElements: enhanceResponse.document.requiredDataElements,
                          currentStep: 'verification'
                        } as any);

                        toast({
                          title: "Mappings Enhanced",
                          description: "Data element mappings saved and enhanced with transformation logic by Data Engineer agent",
                        });
                      } else {
                        // Fallback: Save mappings without enhancement
                        const updatedElements = requiredElements.map(elem => {
                          const elemId = (elem as any).id || (elem as any).elementId;
                          const mapping = (mappings as any[]).find((m: any) => m.elementId === elemId);
                          if (mapping) {
                            return {
                              ...elem,
                              sourceColumn: mapping.mappedColumn,
                              mappingStatus: 'mapped' as const
                            };
                          }
                          return elem;
                        });

                        const existingReqDoc = (journeyProgress as any)?.requirementsDocument || {};
                        await updateProgress({
                          requirementsDocument: {
                            ...existingReqDoc,
                            requiredDataElements: updatedElements
                          },
                          requiredDataElements: updatedElements,
                          currentStep: 'verification'
                        } as any);

                        toast({
                          title: "Mappings Saved",
                          description: "Data element mappings have been saved successfully",
                        });
                      }
                    } catch (error) {
                      console.error('Failed to save mappings:', error);
                      toast({
                        title: "Error",
                        description: "Failed to save data element mappings",
                        variant: "destructive"
                      });
                    }
                  }}
                />
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No required data elements found. Complete the Prepare step to define required elements first.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs >
    </Card >

    {/* Verification Checklist */}
    <Card>
      <CardHeader>
        <CardTitle>Verification Checklist</CardTitle>
        <CardDescription>Complete all verification steps to proceed with analysis</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {verificationSteps.map((step) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-4 rounded-lg border ${step.status
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-200'
                  }`}
              >
                <div className={`p-2 rounded-full ${step.status ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                  <StepIcon className={`w-4 h-4 ${step.status ? 'text-green-600' : 'text-gray-400'
                    }`} />
                </div>
                <div className="flex-1">
                  <h4 className={`font-medium ${step.status ? 'text-green-900' : 'text-gray-900'
                    }`}>
                    {step.title}
                  </h4>
                  <p className={`text-sm ${step.status ? 'text-green-700' : 'text-gray-600'
                    }`}>
                    {step.description}
                  </p>
                </div>
                <Badge variant={step.status ? "default" : "secondary"}>
                  {step.status ? "Complete" : "Pending"}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>

    {/* Reviews and Approval Section */}
    <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          Data Verification Approval
        </CardTitle>
        <CardDescription>
          Review all verification checks and approve to proceed with analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Progress Summary */}
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
            <div className="flex items-center gap-4">
              {verificationStatus.overallApproved ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-6 h-6" />
                  <div>
                    <span className="font-semibold text-lg">All Checks Complete</span>
                    <p className="text-sm text-gray-600">Ready to proceed with analysis</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertCircle className="w-6 h-6" />
                  <div>
                    <span className="font-semibold text-lg">{completedSteps}/{totalSteps} Checks Complete</span>
                    <p className="text-sm text-gray-600">Complete all verifications to approve</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => currentProjectId && loadProjectData(currentProjectId)}
                variant="outline"
                disabled={isLoading}
                size="sm"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              <Button
                onClick={handleApproveData}
                disabled={isProcessing || isLoading}
                className={verificationStatus.overallApproved ? "bg-green-600 hover:bg-green-700" : "bg-yellow-600 hover:bg-yellow-700"}
                size="lg"
                title={isLoading ? "Loading project data..." : !verificationStatus.overallApproved ? `${completedSteps}/${totalSteps} verification steps complete - Click to continue anyway` : "All verifications complete - Click to approve and continue"}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : verificationStatus.overallApproved ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve & Continue
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Continue ({completedSteps}/{totalSteps} checked)
                  </>
                )}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Quick Checklist */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {verificationSteps.map((step) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${step.status
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                >
                  <StepIcon className={`w-4 h-4 flex-shrink-0 ${step.status ? 'text-green-600' : 'text-gray-400'}`} />
                  <span className="font-medium truncate">{step.title}</span>
                  {step.status && <CheckCircle className="w-3 h-3 ml-auto text-green-600" />}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>

    {/* AI Agent Activity - Moved to Bottom */}
    {projectData?.id && (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            AI Agent Activity
          </CardTitle>
          <CardDescription>
            Our agents are reviewing your data quality. View detailed checkpoint information below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentCheckpoints projectId={projectData.id} />
        </CardContent>
      </Card>
    )}

    {/* Navigation Actions */}
    {onPrevious && (
      <Card>
        <CardContent className="flex items-center justify-start pt-6">
          <Button onClick={onPrevious} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Upload
          </Button>
        </CardContent>
      </Card>
    )}

    {/* PII Detection Dialog */}
    {
      showPIIDialog && piiResults && (
        <PIIDetectionDialog
          isOpen={showPIIDialog}
          onClose={() => setShowPIIDialog(false)}
          onDecision={handlePIIApproval}
          piiResult={piiResults}
        />
      )
    }

    {/* Schema Validation Dialog */}
    {
      showSchemaDialog && schemaAnalysis && (() => {
        // Convert schema to flat Record<string, string> format
        let flatSchema: Record<string, string> = {};

        if (schemaAnalysis.schema && typeof schemaAnalysis.schema === 'object') {
          // Handle nested schema format { column: { type: 'string' } }
          flatSchema = Object.fromEntries(
            Object.entries(schemaAnalysis.schema).map(([key, value]) => [
              key,
              typeof value === 'string' ? value : (value as any)?.type || 'string'
            ])
          );
        } else if (Array.isArray(schemaAnalysis.columnNames) && schemaAnalysis.columnNames.length > 0) {
          // If we only have column names, create a basic schema
          flatSchema = Object.fromEntries(
            schemaAnalysis.columnNames.map((col: string) => [col, 'string'])
          );
        }

        return (
          <SchemaValidationDialog
            isOpen={showSchemaDialog}
            onClose={() => setShowSchemaDialog(false)}
            onConfirm={handleSchemaConfirm}
            detectedSchema={flatSchema}
            sampleData={Array.isArray(projectData?.preview) ? projectData.preview :
              Array.isArray(projectData?.sampleData) ? projectData.sampleData : []}
          />
        );
      })()
    }
  </div >
);
}
