import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  Link2,
  ThumbsUp,
  ThumbsDown,
  XCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
// Note: JourneyProgress type removed - use journeyProgress from context instead

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

  // CRITICAL FIX (Gap A): Restore verification status from journeyProgress on mount
  // This ensures status survives browser refresh/navigation
  useEffect(() => {
    if (journeyProgress?.verificationStatus) {
      const savedStatus = journeyProgress.verificationStatus as VerificationStatus;
      console.log('📋 [Verification Status] Restoring from journeyProgress:', savedStatus);
      setVerificationStatus(prev => ({
        ...prev,
        ...savedStatus
      }));
    }
  }, [journeyProgress?.verificationStatus]);
  const queryClient = useQueryClient();
  const hasRefreshedOnMount = useRef(false);

  // Local data state (some will be migrated to journeyProgress/project from hook)
  const [projectData, setProjectData] = useState<any>(null);
  const [dataQuality, setDataQuality] = useState<any>(null);
  const [dataQualityLoaded, setDataQualityLoaded] = useState(false); // FIX: Track if quality was loaded
  const [piiResults, setPiiResults] = useState<any>(null);
  const [schemaAnalysis, setSchemaAnalysis] = useState<any>(null);
  const [requiredDataElements, setRequiredDataElements] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [joinInsights, setJoinInsights] = useState<any | null>(null);
  // CRITICAL FIX: Store element mappings in state so they can be saved when approving
  const [currentElementMappings, setCurrentElementMappings] = useState<any[]>([]);

  // PII Dialog state
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [piiReviewCompleted, setPiiReviewCompleted] = useState(false);

  // Schema Validation Dialog state
  const [showSchemaDialog, setShowSchemaDialog] = useState(false);
  const [editedSchema, setEditedSchema] = useState<any>(null);

  // P0-2 FIX: Data Quality Approval Checkpoint state (u2a2a2u pattern)
  const [showDataQualityApprovalDialog, setShowDataQualityApprovalDialog] = useState(false);
  const [dataQualityCheckpointId, setDataQualityCheckpointId] = useState<string | null>(null);
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);

  // FIX #30: Multi-dataset tab selection - allows viewing each dataset individually
  const [selectedDatasetIndex, setSelectedDatasetIndex] = useState<number>(-1); // -1 = joined view

  // CRITICAL: Track when force refresh completes to prevent fallback race condition
  const [hasCompletedRefresh, setHasCompletedRefresh] = useState(false);

  // Business Definition Enrichment state (connects BA Agent to data elements)
  const [isEnrichingDefinitions, setIsEnrichingDefinitions] = useState(false);
  const [definitionEnrichmentComplete, setDefinitionEnrichmentComplete] = useState(false);

  // Function to enrich data elements with business definitions from BA Agent
  const enrichDataElementsWithDefinitions = async (projectId: string) => {
    if (isEnrichingDefinitions || definitionEnrichmentComplete) return;

    try {
      setIsEnrichingDefinitions(true);
      console.log('📚 [Business Definitions] Starting enrichment for project', projectId);

      const response = await apiClient.post(`/api/projects/${projectId}/enrich-data-elements`, {
        includeInferred: true
      });

      if (response.success && response.enrichedElements) {
        console.log('✅ [Business Definitions] Enrichment complete:', response.stats);

        // Update the required data elements with enriched versions
        setRequiredDataElements((prev: any) => ({
          ...prev,
          requiredDataElements: response.enrichedElements,
          businessDefinitionsEnriched: true,
          enrichmentStats: response.stats
        }));

        toast({
          title: "Business Definitions Loaded",
          description: `Found ${response.stats?.found || 0} standard definitions, inferred ${response.stats?.inferred || 0}.`,
          variant: "default"
        });

        setDefinitionEnrichmentComplete(true);
      }
    } catch (error: any) {
      console.error('❌ [Business Definitions] Enrichment error:', error);
      toast({
        title: "Business Definitions Unavailable",
        description: "Could not load business definitions for your data elements. You can continue without them or try refreshing the page.",
        variant: "default"
      });
    } finally {
      setIsEnrichingDefinitions(false);
    }
  };

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
    // Priority 4: Calculate from ONLY the 4 main metrics (completeness, consistency, accuracy, validity)
    // FIX: Don't average ALL numeric values - only use the defined formula
    const metrics = dataQuality?.metrics && typeof dataQuality.metrics === 'object' ? dataQuality.metrics : null;
    if (metrics) {
      const mainMetrics = ['completeness', 'consistency', 'accuracy', 'validity'];
      const values = mainMetrics
        .map(key => {
          const val = (metrics as any)[key];
          return typeof val === 'number' ? val : null;
        })
        .filter((v): v is number => v !== null);

      if (values.length > 0) {
        // Formula: (Completeness + Consistency + Accuracy + Validity) / 4
        return values.reduce((sum, val) => sum + val, 0) / values.length;
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

    // FIX Jan 20: Enhanced debug logging to trace mapping state
    const rawElements = requiredDataElements.requiredDataElements || requiredDataElements.elements || (Array.isArray(requiredDataElements) ? requiredDataElements : []);
    const mappedRawCount = rawElements.filter((el: any) => el.sourceField || el.sourceColumn || el.sourceAvailable).length;

    console.log('📋 [P1-3 DEBUG] requiredDataElements structure:', {
      isArray: Array.isArray(requiredDataElements),
      hasRequiredDataElements: !!requiredDataElements.requiredDataElements,
      requiredDataElementsLength: Array.isArray(requiredDataElements.requiredDataElements) ? requiredDataElements.requiredDataElements.length : 'N/A',
      hasElements: !!requiredDataElements.elements,
      elementsLength: Array.isArray(requiredDataElements.elements) ? requiredDataElements.elements.length : 'N/A',
      keys: Object.keys(requiredDataElements || {}),
      // FIX: Show mapping status of raw elements BEFORE transformation
      rawMappedCount: mappedRawCount,
      lastMappedAt: requiredDataElements.lastMappedAt,
      sampleRawElement: rawElements[0] ? {
        name: rawElements[0].elementName || rawElements[0].name,
        sourceField: rawElements[0].sourceField,
        sourceColumn: rawElements[0].sourceColumn,
        sourceAvailable: rawElements[0].sourceAvailable
      } : null
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
    // CRITICAL: Include calculationDefinition from DS agent for DE agent collaboration
    const mapped = elements.map((el: any, idx: number) => ({
      elementId: el.elementId || el.id || `element-${idx}`,
      elementName: el.elementName || el.name || el.element || `Element ${idx + 1}`,
      description: el.description || el.rationale || '',
      dataType: el.dataType || el.expectedType || el.type || 'string',
      purpose: el.purpose || el.derivation || '',
      required: el.required !== false, // Default to true
      // CRITICAL FIX: Include sourceColumn as fallback for sourceField
      // Backend map-data-elements sets sourceColumn, not sourceField
      sourceField: el.sourceField || el.sourceColumn || el.mappedColumn || el.source || undefined,
      sourceAvailable: el.sourceAvailable ?? (!!el.sourceField || !!el.sourceColumn || !!el.mappedColumn),
      transformationRequired: el.transformationRequired ?? (!!el.transformationLogic || !!el.derivation || !!el.calculationDefinition),
      transformationLogic: el.transformationLogic,
      alternatives: el.alternatives,
      confidence: el.confidence,
      // DS Agent collaboration: Pass calculation definition from prepare step
      calculationDefinition: el.calculationDefinition,
      // Also preserve any existing transformation code/description
      transformationCode: el.transformationCode,
      transformationDescription: el.transformationDescription,
      sourceColumn: el.sourceColumn || el.sourceField || el.mappedColumn,
      // FIX Issue 2: Include sourceColumns array for composite/derived elements
      // This contains the mapping from DS abstract fields to actual dataset columns
      sourceColumns: el.sourceColumns || [],
      isComposite: el.isComposite || (el.sourceColumns?.length > 1) || false,
      // FIX: Include businessDefinition from BA Agent enrichment
      businessDefinition: el.businessDefinition,
      hasBusinessDefinition: !!el.businessDefinition
    }));

    // Calculate mapping statistics for debugging
    const autoMappedCount = mapped.filter((el: any) => el.sourceAvailable || el.sourceField || el.sourceColumn).length;
    const needTransformCount = mapped.filter((el: any) => el.transformationRequired).length;
    const missingCount = mapped.filter((el: any) => !el.sourceAvailable && !el.sourceField && !el.sourceColumn && el.required).length;

    console.log(`📋 [Data Elements] Loaded ${mapped.length} required elements for mapping`, {
      autoMapped: autoMappedCount,
      needTransform: needTransformCount,
      missing: missingCount,
      sampleElement: mapped[0] ? {
        name: mapped[0].elementName,
        sourceField: mapped[0].sourceField,
        sourceColumn: mapped[0].sourceColumn,
        sourceAvailable: mapped[0].sourceAvailable
      } : null
    });

    // DS-DE Agent Collaboration Logging
    const elementsWithCalcDef = mapped.filter((el: any) => el.calculationDefinition);
    if (elementsWithCalcDef.length > 0) {
      console.log(`🤝 [DS→DE] ${elementsWithCalcDef.length} elements have DS agent calculationDefinition for DE agent processing`);
      elementsWithCalcDef.forEach((el: any) => {
        console.log(`   - ${el.elementName}: ${el.calculationDefinition?.calculationType} (${el.calculationDefinition?.formula?.aggregationMethod || 'n/a'})`);
      });
    }

    if (mapped.length === 0) {
      console.warn(`⚠️ [Data Elements] No elements found - Preparation step may not have completed`);
    }
    return mapped;
  }, [requiredDataElements]);

  // Sync local state with journeyProgress (SSOT)
  // FIX: Always prioritize journeyProgress.requirementsDocument as the single source of truth
  // This ensures data elements from Prepare step flow correctly to Verification step
  // CRITICAL FIX: Gate behind hasCompletedRefresh to prevent stale cache race condition
  useEffect(() => {
    if (!hasCompletedRefresh) return; // Wait for fresh data before applying SSOT
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
        const elements = reqDoc?.requiredDataElements || [];

        // DEBUG: Log mapping status of first few elements
        const sampleElements = elements.slice(0, 3).map((el: any) => ({
          name: el.elementName || el.name,
          sourceField: el.sourceField,
          sourceColumn: el.sourceColumn,
          sourceAvailable: el.sourceAvailable,
          mappedColumn: el.mappedColumn
        }));

        const serverMappedCount = elements.filter((el: any) =>
          el.sourceField || el.sourceColumn || el.sourceAvailable
        ).length;

        console.log('✅ [SSOT] Loading requirementsDocument from journeyProgress:', {
          elementsCount: elements.length,
          serverMappedCount,
          lastMappedAt: reqDoc?.lastMappedAt,
          analysesCount: reqDoc?.analysisPath?.length || 0,
          isLocked,
          sampleElements,
          hasCompleteness: !!reqDoc?.completeness,
          source: 'journeyProgress.requirementsDocument',
          action: 'APPLYING_SSOT'
        });

        // FIX Jan 22: Always apply SSOT when hasCompletedRefresh is true
        // The hasCompletedRefresh gate already ensures we have fresh server data
        // Previous shouldApplySSOT check using localMappingTimestampRef caused race conditions
        // where the SSOT data was skipped on navigation even though it was fresh
        setRequiredDataElements(reqDoc);

        // Restore element mappings from requirementsDocument
        // This ensures mappings persist across page navigation/refresh
        const restoredMappings: any[] = [];
        elements.forEach((elem: any) => {
          if (elem.sourceColumn || elem.sourceField) {
            restoredMappings.push({
              elementId: elem.elementId || elem.id,
              mappedColumn: elem.sourceColumn || elem.sourceField,
              transformationDescription: elem.transformationDescription,
              transformationCode: elem.transformationCode
            });
          }
        });
        if (restoredMappings.length > 0) {
          console.log('📋 [SSOT] Restoring', restoredMappings.length, 'element mappings from requirementsDocument');
          setCurrentElementMappings(restoredMappings);
          setHasMappedElements(true);
        }

        // Also check if elements have sourceAvailable set (from prior mapping)
        if (serverMappedCount > 0) {
          console.log(`📋 [SSOT] Found ${serverMappedCount}/${elements.length} elements already mapped`);
          setHasMappedElements(true);
        }

        // Also log analysis recommendations and questions for debugging
        if (reqDoc.analysisPath) {
          console.log('📋 [SSOT] Analysis recommendations:', reqDoc.analysisPath.map((a: any) => a.type || a).join(', '));
        }
        if (reqDoc.userQuestions) {
          console.log('📋 [SSOT] User questions:', reqDoc.userQuestions.length);
        }

        // Enrich elements with business definitions if not already done
        // This connects BA Agent definitions to the data element pipeline
        // FIX Jan 20: Only trigger after page load completes to avoid race conditions
        if (currentProjectId && !reqDoc.businessDefinitionsEnriched && !isLoading) {
          console.log('📚 [Business Definitions] Elements not yet enriched, triggering enrichment...');
          enrichDataElementsWithDefinitions(currentProjectId);
        } else if (currentProjectId && !reqDoc.businessDefinitionsEnriched && isLoading) {
          console.log('📚 [Business Definitions] Waiting for page load to complete before enrichment...');
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
  }, [journeyProgress, currentProjectId, isLoading, hasCompletedRefresh]);

  // ✅ P0 FIX: Load mappings from DE Agent transformationPlan if no mappings yet
  // This ensures mappings show on first visit (not just on revisit)
  useEffect(() => {
    // Skip if we already have mappings or no transformationPlan
    if (currentElementMappings.length > 0) {
      return; // Already have mappings, no need to load from plan
    }

    if (!journeyProgress?.transformationPlan) {
      return; // No transformation plan available
    }

    const plan = journeyProgress.transformationPlan as any;
    const planMappings = plan?.mappings || plan?.transformations || [];

    if (planMappings.length > 0) {
      console.log(`📋 [Verification] Loading ${planMappings.length} mappings from DE Agent transformationPlan`);
      const restoredMappings = planMappings.map((m: any) => ({
        elementId: m.targetElement || m.elementName || m.elementId,
        mappedColumn: m.sourceColumn || m.sourceField,
        transformationDescription: m.transformationLogic || m.suggestedTransformation,
        confidence: m.confidence || 0.8
      })).filter((m: any) => m.mappedColumn); // Only include mappings that have a source column

      if (restoredMappings.length > 0) {
        console.log(`✅ [Verification] Restored ${restoredMappings.length} mappings from transformationPlan`);
        setCurrentElementMappings(restoredMappings);
      }
    }
  }, [currentElementMappings.length, journeyProgress?.transformationPlan]);

  // FIX: Fallback API fetch for required data elements
  // Only runs when journeyProgress is loaded but doesn't have requirementsDocument
  // This handles cases where Prepare step wasn't completed but we still need to show something
  useEffect(() => {
    // Skip if:
    // 1. Project is still loading (useProject hasn't finished)
    // 2. Force refresh hasn't completed yet (wait for fresh data)
    // 3. We already have data elements from journeyProgress (SSOT)
    // 4. We already have data elements from a previous fetch
    // 5. No project ID available
    // Wait for journeyProgress to fully load before making any decisions
    if (projectLoading || !currentProjectId) {
      console.log('⏳ [SSOT] Waiting for journeyProgress to load...');
      return;
    }

    // CRITICAL: Wait for force refresh to complete before checking for fallback
    // This prevents race condition where fallback runs before refresh brings fresh data
    if (!hasCompletedRefresh) {
      console.log('⏳ [SSOT] Waiting for force refresh to complete before fallback check...');
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
    // FIX: Added retry logic with exponential backoff for resilience
    const fetchFallback = async () => {
      const MAX_RETRIES = 2;
      const BASE_DELAY = 2000; // 2 seconds

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`⚠️ [Fallback] Retry attempt ${attempt}/${MAX_RETRIES}...`);
            await new Promise(r => setTimeout(r, BASE_DELAY * attempt));
          } else {
            console.log('⚠️ [Fallback] journeyProgress loaded but no requirementsDocument (not locked), fetching from API...');
          }

          const dataElementsResponse = await apiClient.get(`/api/projects/${currentProjectId}/required-data-elements`);

          // Check if preparation is required (elements don't exist)
          if (dataElementsResponse.error === 'preparation_required' || dataElementsResponse.requiresPreparation) {
            console.log('⚠️ [Fallback] Preparation step required - elements not yet generated, redirecting...', {
              error: dataElementsResponse.error,
              requiresPreparation: dataElementsResponse.requiresPreparation,
              journeyProgressAtRedirect: {
                hasRequirementsDoc: !!journeyProgress?.requirementsDocument,
                requirementsLocked: (journeyProgress as any)?.requirementsLocked,
                currentStep: journeyProgress?.currentStep
              }
            });
            toast({
              title: "Preparation Required",
              description: "Redirecting to Preparation step to define your analysis goals and data requirements.",
              variant: "destructive"
            });
            // Redirect to Preparation step
            if (onPrevious) {
              setTimeout(() => onPrevious(), 1500); // Small delay to show toast
            }
            return; // Exit - don't retry
          }

          if (dataElementsResponse.success && dataElementsResponse.document) {
            setRequiredDataElements(dataElementsResponse.document);
            console.log('✅ [Fallback] Loaded from API:', dataElementsResponse.document?.requiredDataElements?.length || 0, 'elements');
            return; // Success - exit retry loop
          }
        } catch (error: any) {
          console.warn(`❌ [Fallback] Attempt ${attempt + 1} failed:`, error.message || error);
          if (attempt === MAX_RETRIES) {
            toast({
              title: "Preparation Required",
              description: "Redirecting to Preparation step to define your analysis goals and data requirements.",
              variant: "destructive"
            });
            // Redirect to Preparation step
            if (onPrevious) {
              setTimeout(() => onPrevious(), 1500);
            }
          }
        }
      }
    };

    fetchFallback();
  }, [projectLoading, currentProjectId, journeyProgress?.requirementsDocument, requiredDataElements, (journeyProgress as any)?.requirementsLocked, hasCompletedRefresh]);

  // Load project data on mount or when ID changes
  useEffect(() => {
    if (currentProjectId) {
      loadProjectData(currentProjectId);
    }
  }, [currentProjectId]);

  // FIX: Force refresh project data when entering verification step
  // This ensures we get the latest requirementsDocument from prepare step
  // CRITICAL: Must complete BEFORE fallback logic runs
  useEffect(() => {
    const forceRefresh = async () => {
      if (currentProjectId && !projectLoading && !hasRefreshedOnMount.current) {
        hasRefreshedOnMount.current = true;
        console.log('🔄 [Verification] Force refreshing project data on mount...', {
          currentProjectId,
          hasRequirementsDocBefore: !!journeyProgress?.requirementsDocument,
          requirementsLockedBefore: (journeyProgress as any)?.requirementsLocked
        });
        try {
          await queryClient.refetchQueries({ queryKey: ["project", currentProjectId] });
          // Check cache data after refresh
          const cachedData = queryClient.getQueryData(["project", currentProjectId]) as any;
          console.log('✅ [Verification] Force refresh completed:', {
            hasRequirementsDocAfter: !!cachedData?.journeyProgress?.requirementsDocument,
            requirementsLockedAfter: cachedData?.journeyProgress?.requirementsLocked,
            elementsCount: cachedData?.journeyProgress?.requirementsDocument?.requiredDataElements?.length || 0
          });

          // CRITICAL FIX: If requirementsDocument exists in fresh cache, set it directly
          // This prevents race condition where React hasn't re-rendered with new journeyProgress yet
          if (cachedData?.journeyProgress?.requirementsDocument) {
            const reqDoc = cachedData.journeyProgress.requirementsDocument;
            console.log('📋 [Verification] Setting requirementsDocument directly from fresh cache');
            setRequiredDataElements(reqDoc);

            // Also restore element mappings
            // FIX Jan 22: Check sourceField in addition to sourceColumn (DE mapping sets sourceField)
            const elements = reqDoc?.requiredDataElements || [];
            const restoredMappings: any[] = [];
            elements.forEach((elem: any) => {
              if (elem.sourceColumn || elem.sourceField) {
                restoredMappings.push({
                  elementId: elem.elementId || elem.id,
                  mappedColumn: elem.sourceColumn || elem.sourceField,
                  transformationDescription: elem.transformationDescription,
                  transformationCode: elem.transformationCode
                });
              }
            });
            if (restoredMappings.length > 0) {
              console.log('📋 [Verification] Restoring', restoredMappings.length, 'mappings from force-refresh');
              setCurrentElementMappings(restoredMappings);
              setHasMappedElements(true);
            }
          }
        } catch (err) {
          console.warn('⚠️ [Verification] Force refresh failed:', err);
        }
        setHasCompletedRefresh(true);
      } else if (hasRefreshedOnMount.current && !hasCompletedRefresh) {
        // Already started refresh, mark as completed
        setHasCompletedRefresh(true);
      }
    };
    forceRefresh();
  }, [currentProjectId, projectLoading, queryClient, hasCompletedRefresh]);

  // State for Data Engineer mapping
  const [isMappingElements, setIsMappingElements] = useState(false);
  const [hasMappedElements, setHasMappedElements] = useState(false);

  // Data Engineer mapping: Trigger mapping when elements are loaded but not yet mapped to source fields
  // FIX: Also check journeyProgress.requirementsDocument directly to handle navigation timing issues
  // FIX Jan 20: Added isLoading check to wait for data to be loaded first
  useEffect(() => {
    const triggerDataEngineerMapping = async () => {
      // FIX: Check both local state AND journeyProgress for requirements document
      // This handles the case where local state hasn't updated yet after navigation
      const reqDoc = requiredDataElements || journeyProgress?.requirementsDocument;

      // Skip if:
      // 1. No project ID
      // 2. No required data elements loaded (from either source)
      // 3. Already mapping or already mapped
      // 4. FIX: Still loading data (wait for page load to complete)
      if (!currentProjectId || !reqDoc || isMappingElements || hasMappedElements || isLoading) {
        console.log('📋 [Auto-Map] Skipping - missing dependencies:', {
          hasProjectId: !!currentProjectId,
          hasReqDoc: !!reqDoc,
          hasLocalState: !!requiredDataElements,
          hasJourneyProgress: !!journeyProgress?.requirementsDocument,
          isMappingElements,
          hasMappedElements,
          isLoading
        });
        return;
      }

      // Check if elements need mapping (no sourceField set)
      const elements = (reqDoc as any).requiredDataElements || [];
      const unmappedCount = elements.filter((el: any) => !el.sourceField && !el.sourceColumn && !el.sourceAvailable).length;
      const mappedCount = elements.filter((el: any) => el.sourceField || el.sourceColumn).length;

      console.log('📋 [Auto-Map] Element status:', {
        total: elements.length,
        mapped: mappedCount,
        unmapped: unmappedCount
      });

      // FIX: Only skip if ALL elements are mapped (not if some are mapped)
      if (elements.length > 0 && unmappedCount === 0) {
        console.log('✅ [Data Engineer] All elements already mapped to source fields');
        setHasMappedElements(true);
        return;
      }

      // If no elements at all, skip
      if (elements.length === 0) {
        console.log('⚠️ [Data Engineer] No elements to map');
        return;
      }

      console.log(`🔧 [Data Engineer] Triggering mapping for ${elements.length} elements...`);
      setIsMappingElements(true);

      try {
        const response = await apiClient.post(`/api/projects/${currentProjectId}/map-data-elements`, {});

        if (response.success && response.document) {
          console.log(`✅ [Data Engineer] Mapping complete:`, response.mappingStats);

          // DEBUG: Log the mapping results for first few elements
          const mappedElems = response.document.requiredDataElements || [];
          console.log(`📊 [Data Engineer] Mapped elements sample:`, mappedElems.slice(0, 3).map((e: any) => ({
            name: e.elementName,
            sourceField: e.sourceField,
            sourceColumn: e.sourceColumn,
            sourceAvailable: e.sourceAvailable,
            confidence: e.confidence,
            // FIX Issue 2: Log sourceColumns for composite/derived elements
            sourceColumns: e.sourceColumns?.map((sc: any) => ({
              field: sc.componentField,
              mapped: sc.matchedColumn,
              confidence: sc.matchConfidence,
              matched: sc.matched
            })) || [],
            isComposite: e.isComposite,
            calculationType: e.calculationDefinition?.calculationType
          })));

          // Log composite elements specifically
          const compositeElements = mappedElems.filter((e: any) => e.sourceColumns?.length > 0 || e.isComposite);
          if (compositeElements.length > 0) {
            console.log(`🔗 [Composite Elements] ${compositeElements.length} elements have sourceColumns mapping:`);
            compositeElements.forEach((e: any) => {
              const matchedCount = (e.sourceColumns || []).filter((sc: any) => sc.matched).length;
              console.log(`   - ${e.elementName}: ${matchedCount}/${e.sourceColumns?.length || 0} fields mapped`);
            });
          }

          setRequiredDataElements(response.document);
          setHasMappedElements(true);

          // Refresh project data to get updated journeyProgress
          queryClient.invalidateQueries({ queryKey: ["project", currentProjectId] });

          toast({
            title: "Data Mapping Complete",
            description: `Mapped ${response.mappingStats?.elementsMapped || 0} of ${response.mappingStats?.totalElements || 0} data elements to source fields.`,
          });
        } else if (response.error === 'preparation_required' || response.requiresPreparation) {
          console.log('⚠️ [Data Engineer] Preparation required, redirecting...', {
            error: response.error,
            message: response.message,
            journeyProgressAtRedirect: {
              hasRequirementsDoc: !!journeyProgress?.requirementsDocument,
              requirementsLocked: (journeyProgress as any)?.requirementsLocked
            }
          });
          toast({
            title: "Preparation Required",
            description: "Redirecting to Preparation step to define your analysis goals.",
            variant: "destructive"
          });
          if (onPrevious) {
            setTimeout(() => onPrevious(), 1500);
          }
        }
      } catch (error: any) {
        console.error('❌ [Data Engineer] Mapping failed:', error);
        toast({
          title: "Mapping Error",
          description: error.message || "Failed to map data elements. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsMappingElements(false);
      }
    };

    triggerDataEngineerMapping();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, requiredDataElements, journeyProgress?.requirementsDocument, isMappingElements, hasMappedElements, isLoading]);

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
        setDataQualityLoaded(true); // FIX: Mark as loaded
        console.log('📊 [Data Quality] Loaded with score:', qualityResponse?.qualityScore?.overall || qualityResponse?.qualityScore);
      } catch (error) {
        console.warn('Data quality assessment not available:', error);
        setDataQualityLoaded(true); // FIX: Mark as loaded even on error
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

const handleSchemaConfirm = async (schema: Record<string, string>) => {
  const projectId = localStorage.getItem('currentProjectId');
  if (!projectId) {
    toast({
      title: "Project Not Found",
      description: "No project ID found. Please go back to Data Upload step.",
      variant: "destructive"
    });
    return;
  }

  setIsProcessing(true);
  try {
    // [DAY 7] Route through DE agent for schema validation before approval
    console.log('🔍 [DE Agent] Validating schema via agent...');
    const validationResult = await apiClient.post(`/api/data-quality/${projectId}/validate-schema-via-agent`, {
      proposedSchema: schema
    });
    console.log('🔍 [DE Agent Schema] Validation result:', validationResult);

    // Check for blocking errors
    if (!validationResult.validation?.isValid && validationResult.validation?.errors?.length > 0) {
      toast({
        title: "Schema Validation Failed",
        description: `DE Agent found errors: ${validationResult.validation.errors.slice(0, 2).join(', ')}`,
        variant: "destructive"
      });
      setIsProcessing(false);
      return;
    }

    // Show warnings if any
    if (validationResult.validation?.warnings?.length > 0) {
      toast({
        title: "Schema Warnings",
        description: `DE Agent notes: ${validationResult.validation.warnings.slice(0, 2).join(', ')}`,
        variant: "default"
      });
    }

    // Now call the approval endpoint with the checkpoint ID
    await apiClient.post(`/api/data-quality/${projectId}/approve-schema`, {
      checkpointId: validationResult.validation?.checkpointId,
      confirmedSchema: schema,
      feedback: 'Schema confirmed after DE agent validation'
    });

    // Update local state
    setEditedSchema(schema);
    updateVerificationStatus('schemaValidation', true);

    // Update journeyProgress
    updateProgress({
      schemaValidated: true,
      schemaCheckpointId: validationResult.validation?.checkpointId,
      confirmedSchema: schema,
      currentStep: 'verification'
    });

    toast({
      title: "Schema Confirmed",
      description: "Schema validated by DE Agent and approved",
    });

    console.log('✅ [DE Agent Schema] Schema approved with checkpoint');
  } catch (error: any) {
    console.error('Schema validation error:', error);
    // Non-blocking: Allow approval even if agent validation fails
    toast({
      title: "Schema Validation",
      description: "Agent validation unavailable. Proceeding with manual approval.",
      variant: "default"
    });

    // Fallback to direct approval
    setEditedSchema(schema);
    updateVerificationStatus('schemaValidation', true);
    updateProgress({
      schemaValidated: true,
      confirmedSchema: schema,
      currentStep: 'verification'
    });
  } finally {
    setIsProcessing(false);
  }
};

const handleQualityApprove = async () => {
  const projectId = localStorage.getItem('currentProjectId');
  if (!projectId) {
    toast({
      title: "Project Not Found",
      description: "No project ID found. Please go back to Data Upload step.",
      variant: "destructive"
    });
    return;
  }

  setIsProcessing(true);
  try {
    // [DAY 7] Route through DE agent for validation before approval
    console.log('🔍 [DE Agent] Validating quality via agent...');
    const validationResult = await apiClient.post(`/api/data-quality/${projectId}/validate-via-agent`, {});
    console.log('🔍 [DE Agent Quality] Validation result:', validationResult);

    // Show warnings if any
    if (validationResult.validation?.warnings?.length > 0) {
      toast({
        title: "Quality Warnings",
        description: `DE Agent notes: ${validationResult.validation.warnings.slice(0, 2).join(', ')}`,
        variant: "default"
      });
    }

    // Show recommendations
    if (validationResult.validation?.recommendations?.length > 0) {
      console.log('💡 [DE Agent Quality] Recommendations:', validationResult.validation.recommendations);
    }

    // Now call the approval endpoint with the checkpoint ID
    await apiClient.post(`/api/data-quality/${projectId}/approve-quality`, {
      checkpointId: validationResult.validation?.checkpointId,
      feedback: `Approved with score ${validationResult.validation?.overallScore || qualityScore}%`
    });

    // Update local verification status
    updateVerificationStatus('dataQuality', true);

    // Update journeyProgress (SSOT)
    updateProgress({
      dataQualityApproved: true,
      dataQualityScore: validationResult.validation?.overallScore || qualityScore,
      dataQualityCheckpointId: validationResult.validation?.checkpointId,
      currentStep: 'verification'
    });

    toast({
      title: "Quality Approved",
      description: `Data quality approved by DE Agent. Score: ${validationResult.validation?.overallScore || qualityScore}%`,
    });

    console.log('✅ [DE Agent Quality] Quality approved with checkpoint');
  } catch (error: any) {
    console.error('Quality validation error:', error);
    // Non-blocking: Allow approval even if agent validation fails
    toast({
      title: "Quality Validation",
      description: "Agent validation unavailable. Proceeding with manual approval.",
      variant: "default"
    });

    // Fallback to direct approval
    updateVerificationStatus('dataQuality', true);
    updateProgress({
      dataQualityApproved: true,
      dataQualityScore: qualityScore,
      currentStep: 'verification'
    });
  } finally {
    setIsProcessing(false);
  }
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

    // FIX: Check only the 4 actual verification steps, NOT overallApproved itself
    // Previously this included overallApproved in the check, causing it to always fail
    const stepsToCheck: (keyof VerificationStatus)[] = ['dataQuality', 'schemaValidation', 'piiReview', 'dataPreview'];
    const allComplete = stepsToCheck.every(step => updated[step] === true);
    updated.overallApproved = allComplete;

    // CRITICAL FIX (Gap A): Persist verification status to journeyProgress
    // This ensures status survives browser refresh/navigation
    updateProgress({
      verificationStatus: updated,
      currentStep: 'data-verification'
    });
    console.log(`✅ [Verification Status] Persisted ${key}=${value} to journeyProgress`);

    return updated;
  });
};

// P0-2 FIX: Create checkpoint for data quality review (u2a2a2u pattern)
const createDataQualityCheckpoint = async () => {
  const projectId = localStorage.getItem('currentProjectId');
  if (!projectId) return;

  setIsCreatingCheckpoint(true);
  try {
    const checkpointResponse = await apiClient.post(`/api/projects/${projectId}/checkpoints`, {
      stage: 'data_quality_review',
      agentId: 'data_engineer',
      message: `Data quality verification completed. Quality score: ${computedQualityScore}%. Please review and approve to proceed with transformation.`,
      artifacts: [
        {
          type: 'data_quality_summary',
          data: {
            qualityScore: computedQualityScore,
            dataQualityChecked: verificationStatus.dataQuality,
            schemaValidated: verificationStatus.schemaValidation,
            piiReviewed: verificationStatus.piiReview,
            dataPreviewChecked: verificationStatus.dataPreview,
            allChecksComplete: verificationStatus.overallApproved,
            piiDecision: journeyProgress?.piiDecision || null
          }
        }
      ],
      requiresApproval: true
    });

    if (checkpointResponse.checkpointId) {
      setDataQualityCheckpointId(checkpointResponse.checkpointId);
      setShowDataQualityApprovalDialog(true);
      console.log('✅ [P0-2] Data quality checkpoint created:', checkpointResponse.checkpointId);
    }
  } catch (error) {
    console.error('Failed to create checkpoint:', error);
    // Show dialog anyway for manual approval
    setShowDataQualityApprovalDialog(true);
  } finally {
    setIsCreatingCheckpoint(false);
  }
};

// P0-2 FIX: Handle final approval after checkpoint review
// ✅ GAP 1-3 FIX: Use dedicated PUT /verify endpoint instead of generic updateProgress
const handleFinalApproval = async () => {
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

    // Submit checkpoint approval if we have one
    if (dataQualityCheckpointId) {
      try {
        await apiClient.post(`/api/projects/${projectId}/checkpoints/${dataQualityCheckpointId}/feedback`, {
          approved: true,
          feedback: 'Data quality approved by user'
        });
        console.log('✅ [P0-2] Checkpoint approved:', dataQualityCheckpointId);
      } catch (checkpointError) {
        console.warn('⚠️ Checkpoint feedback failed (non-blocking):', checkpointError);
      }
    }

    // ✅ GAP 1 FIX: Build element mappings in the format expected by backend
    let elementMappings: Record<string, any> = {};
    if (currentElementMappings.length > 0) {
      console.log('📋 [GAP 1 FIX] Building element mappings:', currentElementMappings.length, 'mappings');
      currentElementMappings.forEach((mapping: any) => {
        elementMappings[mapping.elementId] = {
          sourceField: mapping.mappedColumn,
          transformationCode: mapping.transformationCode,
          transformationDescription: mapping.transformationDescription
        };
      });
    }

    // ✅ GAP 1 FIX: Build updated requirements document with mappings embedded
    // TASK 2 FIX: Preserve analysisPath even if requirementsDocument was lost due to errors
    const existingReqDoc = (journeyProgress as any)?.requirementsDocument || {};

    // TASK 2 FIX: Get analysisPath from multiple fallback sources
    const preservedAnalysisPath = existingReqDoc.analysisPath
      || requiredDataElements?.analysisPath
      || (journeyProgress as any)?.analysisPath
      || [];

    if (preservedAnalysisPath.length > 0 && !existingReqDoc.analysisPath) {
      console.log(`🔄 [TASK 2 FIX] Preserving analysisPath from fallback source (${preservedAnalysisPath.length} analyses)`);
    }

    let updatedRequirementsDocument = {
      ...existingReqDoc,
      analysisPath: preservedAnalysisPath // Ensure analysisPath is always preserved
    };

    if (currentElementMappings.length > 0) {
      const updatedElements = (existingReqDoc.requiredDataElements || requiredDataElements?.requiredDataElements || []).map((elem: any) => {
        const elemId = elem.id || elem.elementId;
        const mapping = currentElementMappings.find((m: any) => m.elementId === elemId);
        if (mapping) {
          return {
            ...elem,
            sourceColumn: mapping.mappedColumn,
            sourceField: mapping.mappedColumn,
            transformationDescription: mapping.transformationDescription,
            transformationCode: mapping.transformationCode,
            mappingStatus: 'mapped' as const
          };
        }
        return elem;
      });

      updatedRequirementsDocument = {
        ...updatedRequirementsDocument,
        requiredDataElements: updatedElements
      };
    }

    // ✅ GAP 3 FIX: Collect PII decisions from journeyProgress
    const piiDecisions = journeyProgress?.piiDecisions ||
                        (journeyProgress?.piiDecision as any)?.masking_choices ||
                        {};

    console.log('🔒 [GAP 3 FIX] PII decisions to send:', Object.keys(piiDecisions).length);

    // ✅ GAP 2 FIX: Call dedicated PUT /verify endpoint
    // This endpoint saves to BOTH journeyProgress AND dataset.ingestionMetadata
    // AND triggers DE Agent for transformation planning
    const verifyResponse = await apiClient.put(`/api/projects/${projectId}/verify`, {
      verificationStatus: 'approved',
      verificationTimestamp: new Date().toISOString(),
      verificationChecks: { ...verificationStatus, overallApproved: true },
      piiDecisions: piiDecisions,
      dataQuality: dataQuality || journeyProgress?.dataQuality,
      schemaValidation: verificationStatus.schemaValidation,
      elementMappings: elementMappings,
      requirementsDocument: updatedRequirementsDocument,
      dataQualityCheckpointId: dataQualityCheckpointId
    });

    console.log('✅ [GAP 1-3 FIX] Verification endpoint response:', {
      success: verifyResponse.success,
      deAgentTriggered: verifyResponse.deAgentTriggered,
      message: verifyResponse.message
    });

    // Also update local cache for immediate UI feedback
    updateProgress({
      currentStep: 'transformation',
      completedSteps: [...(journeyProgress?.completedSteps || []), 'data-verification'],
      verificationCompleted: true,
      dataQualityApproved: true,
      verificationStatus: { ...verificationStatus, overallApproved: true },
      elementMappings: elementMappings,
      requirementsDocument: updatedRequirementsDocument,
      stepTimestamps: {
        ...(journeyProgress?.stepTimestamps || {}),
        dataVerificationCompleted: new Date().toISOString(),
        dataQualityApprovedAt: new Date().toISOString()
      }
    });

    setShowDataQualityApprovalDialog(false);

    toast({
      title: "Data Quality Approved",
      description: verifyResponse.message || "Your data has been verified and approved. Proceeding to transformation step.",
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

// P0-2 FIX: Cancel approval and let user revise
const handleCancelApproval = () => {
  setShowDataQualityApprovalDialog(false);
  toast({
    title: "Approval Cancelled",
    description: "Please review and address any data quality issues before proceeding.",
  });
};

const handleApproveData = async () => {
  // P0-2 FIX: Show checkpoint approval dialog instead of directly approving
  // This ensures explicit user consent in the u2a2a2u pattern
  await createDataQualityCheckpoint();
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

// I-2 FIX: Make PII decision mandatory before continue
// If PII was detected, user MUST review and make a decision before proceeding
const isPiiDetected = piiResults?.detectedPII && piiResults.detectedPII.length > 0;
const isPiiReviewPending = isPiiDetected && !verificationStatus.piiReview;
const canContinue = !isPiiReviewPending; // Can only continue if PII review is not pending

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

    {/* [DATA CONTINUITY] Prepare Step Summary - Show artifacts from Step 2 */}
    {journeyProgress && (journeyProgress.analysisGoal || journeyProgress.userQuestions?.length || requiredDataElements) && (
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-emerald-900">
            <TrendingUp className="w-5 h-5" />
            From Prepare Step: Your Analysis Plan
          </CardTitle>
          <CardDescription className="text-emerald-700">
            Review the goals and recommendations from the previous step
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Analysis Goal */}
          {journeyProgress.analysisGoal && (
            <div className="p-3 bg-white rounded-lg border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Analysis Goal
              </h4>
              <p className="text-sm text-gray-700">{journeyProgress.analysisGoal}</p>
            </div>
          )}

          {/* User Questions */}
          {journeyProgress.userQuestions && journeyProgress.userQuestions.length > 0 && (
            <div className="p-3 bg-white rounded-lg border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Your Questions ({journeyProgress.userQuestions.length})
              </h4>
              <ul className="space-y-1">
                {journeyProgress.userQuestions.slice(0, 5).map((q: any, idx: number) => (
                  <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-emerald-600 font-medium">{idx + 1}.</span>
                    <span>{q.text || q}</span>
                  </li>
                ))}
                {journeyProgress.userQuestions.length > 5 && (
                  <li className="text-sm text-emerald-600">+{journeyProgress.userQuestions.length - 5} more questions</li>
                )}
              </ul>
            </div>
          )}

          {/* Recommended Analysis Approaches - from requirementsDocument.analysisPath */}
          {requiredDataElements?.analysisPath && requiredDataElements.analysisPath.length > 0 && (
            <div className="p-3 bg-white rounded-lg border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Recommended Analysis Approaches
              </h4>
              <div className="flex flex-wrap gap-2">
                {requiredDataElements.analysisPath.map((analysis: any, idx: number) => (
                  <Badge key={idx} variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                    {analysis.analysisName || analysis.analysisType || analysis.type || analysis.method || analysis.name || (typeof analysis === 'string' ? analysis : 'Unknown Analysis')}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Required Data Elements Summary */}
          {requiredElements.length > 0 && (
            <div className="p-3 bg-white rounded-lg border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Required Data Elements
              </h4>
              <p className="text-sm text-gray-700">
                {requiredElements.length} data element(s) identified for your analysis.
                Map these to your dataset columns in the <strong>Elements</strong> tab below.
              </p>
            </div>
          )}

          {/* Audience Context */}
          {journeyProgress.audience?.primary && (
            <div className="p-3 bg-white rounded-lg border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Target Audience
              </h4>
              <div className="text-sm text-gray-700 flex flex-wrap items-center gap-1">
                <span>Primary:</span> <Badge variant="outline">{journeyProgress.audience.primary}</Badge>
                {Array.isArray(journeyProgress.audience.secondary) && journeyProgress.audience.secondary.length > 0 && (
                  <>
                    <span className="ml-2">Secondary:</span>
                    {journeyProgress.audience.secondary.map((a: string, i: number) => (
                      <Badge key={i} variant="outline">{a}</Badge>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )}

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

                {/* P2-1 FIX: Stacked vs Joined warning when no join was performed */}
                {selectedDatasetIndex === -1 && (!joinInsights || joinInsights.joinStrategy !== 'join') && projectData.datasets.length > 1 && (
                  <Alert className="mt-3 border-amber-300 bg-amber-50">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      <span className="font-medium">Datasets are stacked, not joined.</span> No common join keys were detected between your {projectData.datasets.length} datasets. Rows from each file are shown independently. If you need a joined view, ensure datasets share common identifier columns (e.g., employee_id, user_id).
                    </AlertDescription>
                  </Alert>
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
            isLoading={isProcessing || !dataQualityLoaded}
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
                      // FIX: Handle both string and rich metadata object formats
                      const typeStr = typeof type === 'string'
                        ? type
                        : (type as any)?.type || (type as any)?.dataType || 'unknown';
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

                    {/* Validation Warnings: Flag columns with type mismatches */}
                    {(() => {
                      const validationResults = projectData?.datasets?.[0]?.ingestionMetadata?.validationResults;
                      if (!validationResults || validationResults.isValid || !validationResults.warnings?.length) return null;
                      return (
                        <div>
                          <h5 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-amber-700">
                            <AlertTriangle className="w-4 h-4" />
                            Type Mismatch Warnings
                          </h5>
                          <div className="space-y-2">
                            {validationResults.warnings.map((w: any, idx: number) => (
                              <div key={idx} className="p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-amber-900">{w.column}</span>
                                  <Badge variant="outline" className="text-amber-700 border-amber-300">
                                    {w.mismatchPercentage}% mismatch
                                  </Badge>
                                </div>
                                <p className="text-xs text-amber-700 mt-1">
                                  Inferred as <strong>{w.inferredType}</strong>, but {w.mismatchCount} sampled values don't match.
                                  {w.sampleMismatches?.length > 0 && (
                                    <span className="block mt-0.5 text-amber-600">
                                      Examples: {w.sampleMismatches.join(', ')}
                                    </span>
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            These columns may need attention during transformation. You can override types in Schema Edit.
                          </p>
                        </div>
                      );
                    })()}
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
                  schema={projectData?.schema || projectData?.joinedSchema || {}}
                  sampleData={
                    Array.isArray(projectData?.joinedPreview) && projectData.joinedPreview.length > 0
                      ? projectData.joinedPreview.slice(0, 10)
                      : Array.isArray(projectData?.preview)
                        ? projectData.preview.slice(0, 10)
                        : []
                  }
                  isMapping={isMappingElements}
                  // P0-1 FIX: Pass initialMappings to restore previously saved mappings
                  initialMappings={Object.fromEntries(
                    currentElementMappings
                      .filter((m: any) => m.mappedColumn || m.sourceColumn || m.sourceField)
                      .map((m: any) => [
                        m.elementId,
                        {
                          sourceField: m.mappedColumn || m.sourceColumn || m.sourceField,
                          transformationCode: m.transformationCode,
                          transformationDescription: m.transformationDescription
                        }
                      ])
                  )}
                  onSaveMapping={async (mappings) => {
                    // P1-3: Persist element mappings to journeyProgress
                    // Then call Data Engineer agent to add transformation logic in natural language
                    console.log('📋 [P1-3] Saving data element mappings:', mappings);

                    // CRITICAL FIX: Convert Record<string, any> to array format for currentElementMappings
                    // The mappings parameter is an object keyed by elementId, not an array
                    const mappingsRecord = mappings as Record<string, any>;
                    const mappingsArray = Object.entries(mappingsRecord).map(([elementId, mapping]) => ({
                      elementId,
                      mappedColumn: mapping.sourceField || mapping.mappedColumn,
                      sourceColumn: mapping.sourceField || mapping.mappedColumn,
                      sourceField: mapping.sourceField || mapping.mappedColumn,
                      transformationCode: mapping.transformationCode,
                      transformationDescription: mapping.transformationDescription
                    }));
                    setCurrentElementMappings(mappingsArray);
                    console.log('📋 [P1-3] Converted mappings to array format:', mappingsArray.length, 'items');

                    try {
                      // Build element mappings object for Data Engineer endpoint
                      const elementMappings: Record<string, any> = {};
                      Object.entries(mappingsRecord).forEach(([elementId, mapping]) => {
                        elementMappings[elementId] = {
                          sourceColumn: mapping.sourceField || mapping.mappedColumn,
                          transformationDescription: mapping.transformationDescription,
                          transformationCode: mapping.transformationCode
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
                        // FIX: mappings is a Record<string, any>, not an array
                        const updatedElements = requiredElements.map(elem => {
                          const elemId = (elem as any).id || (elem as any).elementId;
                          const mapping = mappingsRecord[elemId]; // Direct lookup by elementId key
                          if (mapping) {
                            return {
                              ...elem,
                              sourceColumn: mapping.sourceField || mapping.mappedColumn,
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
          {/* I-2 FIX: PII Review Required Alert */}
          {isPiiReviewPending && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <Shield className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-red-800">PII Review Required</h4>
                <p className="text-sm text-red-600">
                  Personal identifiable information (PII) was detected in your data.
                  You must review and make a decision about how to handle this data before continuing.
                </p>
              </div>
              <Button
                onClick={handlePIIReview}
                variant="destructive"
                size="sm"
              >
                Review PII Now
              </Button>
            </div>
          )}

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
                disabled={isProcessing || isLoading || !canContinue}
                className={verificationStatus.overallApproved ? "bg-green-600 hover:bg-green-700" : isPiiReviewPending ? "bg-red-600 hover:bg-red-700" : "bg-yellow-600 hover:bg-yellow-700"}
                size="lg"
                title={isLoading ? "Loading project data..." : isPiiReviewPending ? "PII Review Required - You must review detected PII before continuing" : !verificationStatus.overallApproved ? `${completedSteps}/${totalSteps} verification steps complete - Click to continue anyway` : "All verifications complete - Click to approve and continue"}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : isPiiReviewPending ? (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    PII Review Required
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
      showSchemaDialog && (() => {
        // FIX: Prioritize joined schema from journeyProgress (SSOT for multi-dataset)
        // Priority 1: journeyProgress.joinedData.schema (SSOT)
        // Priority 2: schemaAnalysis.schema from API (fallback)
        const hasMultipleDatasets = (projectData?.datasets?.length ?? 0) > 1 ||
                                    !!(journeyProgress as any)?.joinedData?.joinConfig;

        let schemaSource: Record<string, any> = {};
        let isJoinedSchema = false;
        const datasetCount = projectData?.datasets?.length || 1;

        // Check journeyProgress.joinedData.schema first (SSOT for joined datasets)
        const joinedSchema = (journeyProgress as any)?.joinedData?.schema;
        if (hasMultipleDatasets && joinedSchema && typeof joinedSchema === 'object' && Object.keys(joinedSchema).length > 0) {
          schemaSource = joinedSchema;
          isJoinedSchema = true;
          console.log(`📊 [Schema Dialog] Using JOINED schema from journeyProgress with ${Object.keys(schemaSource).length} columns`);
        } else if (schemaAnalysis?.schema && typeof schemaAnalysis.schema === 'object') {
          // Fallback to API response schema
          schemaSource = schemaAnalysis.schema;
          isJoinedSchema = schemaAnalysis.isJoinedSchema || false;
          console.log(`📊 [Schema Dialog] Using API schema (isJoined: ${isJoinedSchema}) with ${Object.keys(schemaSource).length} columns`);
        } else if (Array.isArray(schemaAnalysis?.columnNames) && schemaAnalysis.columnNames.length > 0) {
          // Last resort: Create schema from column names only
          schemaSource = Object.fromEntries(
            schemaAnalysis.columnNames.map((col: string) => [col, 'string'])
          );
          console.log(`📊 [Schema Dialog] Created schema from column names with ${Object.keys(schemaSource).length} columns`);
        }

        // PHASE 5 FIX: For multi-dataset scenarios, ALWAYS build merged schema from datasets
        // This ensures we show the complete joined schema, not just one dataset's schema
        const datasets = projectData?.datasets || [];
        console.log(`📊 [Schema Dialog] Multi-dataset check: hasMultiple=${hasMultipleDatasets}, datasetCount=${datasets.length}, currentSchemaIsJoined=${isJoinedSchema}`);

        if (hasMultipleDatasets && datasets.length > 1) {
          // Force build merged schema for multi-dataset scenarios
          const mergedSchema: Record<string, any> = {};
          datasets.forEach((ds: any, idx: number) => {
            const dsSchema = ds.ingestionMetadata?.transformedSchema ||
                            ds.metadata?.transformedSchema ||
                            ds.ingestionMetadata?.schema ||
                            ds.metadata?.schema ||
                            ds.schema;
            console.log(`📊 [Schema Dialog] Dataset ${idx} schema source:`, dsSchema ? Object.keys(dsSchema).length + ' columns' : 'none');
            if (dsSchema && typeof dsSchema === 'object') {
              for (const [col, type] of Object.entries(dsSchema)) {
                if (!mergedSchema[col]) {
                  mergedSchema[col] = type;
                }
              }
            }
          });
          if (Object.keys(mergedSchema).length > 0) {
            schemaSource = mergedSchema;
            isJoinedSchema = true;
            console.log(`📊 [Schema Dialog] Built MERGED schema from ${datasets.length} datasets with ${Object.keys(mergedSchema).length} columns`);
          } else {
            console.warn(`⚠️ [Schema Dialog] Could not build merged schema from datasets - no valid schemas found`);
          }
        } else if (Object.keys(schemaSource).length === 0 && datasets.length === 1) {
          // Single dataset fallback
          const ds = datasets[0];
          const dsSchema = ds?.ingestionMetadata?.schema || ds?.metadata?.schema || ds?.schema;
          if (dsSchema && typeof dsSchema === 'object') {
            schemaSource = dsSchema;
            console.log(`📊 [Schema Dialog] Using single dataset schema with ${Object.keys(schemaSource).length} columns`);
          }
        }

        // Convert schema to flat Record<string, string> format for the dialog
        const flatSchema: Record<string, string> = Object.fromEntries(
          Object.entries(schemaSource).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : (value as any)?.type || 'string'
          ])
        );

        // Get appropriate sample data - prefer joined preview for multi-dataset
        const joinedPreview = (journeyProgress as any)?.joinedData?.preview;
        const sampleData = (isJoinedSchema && Array.isArray(joinedPreview) && joinedPreview.length > 0)
          ? joinedPreview
          : (Array.isArray(projectData?.preview) ? projectData.preview :
             Array.isArray(projectData?.sampleData) ? projectData.sampleData : []);

        return (
          <SchemaValidationDialog
            isOpen={showSchemaDialog}
            onClose={() => setShowSchemaDialog(false)}
            onConfirm={handleSchemaConfirm}
            detectedSchema={flatSchema}
            sampleData={sampleData}
            isJoinedSchema={isJoinedSchema}
            datasetCount={datasetCount}
          />
        );
      })()
    }

    {/* P0-2 FIX: Data Quality Approval Dialog - Explicit user approval checkpoint */}
    <Dialog open={showDataQualityApprovalDialog} onOpenChange={setShowDataQualityApprovalDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            Confirm Data Quality Approval
          </DialogTitle>
          <DialogDescription>
            Review the data quality summary below and confirm that your data is ready for transformation and analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Quality Score Summary */}
          <div className={`rounded-lg p-4 space-y-3 ${computedQualityScore >= 80 ? 'bg-green-50' : computedQualityScore >= 60 ? 'bg-yellow-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Data Quality Score</h4>
              <Badge variant={computedQualityScore >= 80 ? 'default' : computedQualityScore >= 60 ? 'secondary' : 'destructive'}>
                {computedQualityScore}%
              </Badge>
            </div>
            <Progress value={computedQualityScore} className="h-2" />
          </div>

          {/* Verification Checklist */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm mb-3">Verification Checklist</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {verificationStatus.dataQuality ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-400" />
                )}
                <span>Data Quality Assessment</span>
              </div>
              <div className="flex items-center gap-2">
                {verificationStatus.schemaValidation ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-400" />
                )}
                <span>Schema Validation</span>
              </div>
              <div className="flex items-center gap-2">
                {verificationStatus.piiReview ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-400" />
                )}
                <span>PII Review</span>
              </div>
              <div className="flex items-center gap-2">
                {verificationStatus.dataPreview ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-400" />
                )}
                <span>Data Preview</span>
              </div>
            </div>
          </div>

          {/* PII Decision Summary if exists */}
          {journeyProgress?.piiDecision && (
            <div className="bg-amber-50 rounded-lg p-4">
              <h4 className="font-medium text-sm text-amber-900 mb-2">PII Decision</h4>
              <p className="text-xs text-amber-700">
                {journeyProgress.piiDecision.excludedColumns?.length > 0
                  ? `${journeyProgress.piiDecision.excludedColumns.length} column(s) will be excluded from analysis`
                  : 'No columns excluded - all data will be included'}
              </p>
            </div>
          )}

          {/* Warning if not all checks complete */}
          {!verificationStatus.overallApproved && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Not all verification steps are complete. You can still proceed, but we recommend completing all checks for best results.
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              By approving, you confirm that the data quality is acceptable and you're ready to proceed with data transformation.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancelApproval} disabled={isProcessing}>
            <ThumbsDown className="w-4 h-4 mr-2" />
            Review Again
          </Button>
          <Button
            onClick={handleFinalApproval}
            className="bg-green-600 hover:bg-green-700"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <ThumbsUp className="w-4 h-4 mr-2" />
                Approve & Continue
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div >
);
}
