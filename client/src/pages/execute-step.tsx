import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Play,
  CheckCircle,
  Clock,
  Settings,
  Brain,
  Zap,
  AlertCircle,
  Download,
  Eye,
  MessageCircle,
  Lightbulb,
  Shield,
  ShieldCheck,
  ArrowRight,
  Loader2,
  RefreshCw,
  CreditCard
} from "lucide-react";
import { useProject } from "@/hooks/useProject";
import { CheckpointDialog } from "@/components/CheckpointDialog";
import { apiClient } from "@/lib/api";
import type { JourneyTemplate } from '@shared/journey-templates';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AgentCheckpoints from "@/components/agent-checkpoints";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ExecutionProgressTracker } from "@/components/ExecutionProgressTracker";
import type { AnalysisExecutionState, ExecutionStep } from "@shared/progress-types";
import { SmartDefaultsService, type DatasetSchema, type AnalysisRecommendation } from "@/lib/smart-defaults";
import { realtimeClient } from "@/lib/realtime";
import { QuotaStatusIndicator, QuotaExceededBanner, SubscriptionRequiredBanner } from "@/components/QuotaStatusIndicator";

interface ExecuteStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

export default function ExecuteStep({ journeyType, onNext, onPrevious }: ExecuteStepProps) {
  const { toast } = useToast();
  // FIX Phase 3: Use updateProgressAsync for proper async handling
  const { projectId, project, journeyProgress, updateProgress, updateProgressAsync, isUpdating, isLoading: projectLoading } = useProject(localStorage.getItem('currentProjectId') || undefined);

  // const [executionStatus, setExecutionStatus] = useState<'idle' | 'configuring' | 'running' | 'completed' | 'error'>('idle');
  // const [executionProgress, setExecutionProgress] = useState(0);

  const [executionState, setExecutionState] = useState<AnalysisExecutionState>({
    status: 'idle',
    overallProgress: 0,
    currentStep: { id: 'init', name: 'Ready to Start', status: 'pending', description: 'Waiting to start analysis...' },
    completedSteps: [],
    pendingSteps: [],
    analysisTypes: [],
    startedAt: new Date().toISOString(),
    executionId: '',
    projectId: '',
    totalSteps: 0
  });

  // Derived status for backward compatibility
  const executionStatus = executionState.status === 'initializing' ? 'configuring' : executionState.status;
  const executionProgress = executionState.overallProgress;

  const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>([]);
  const [executionResults, setExecutionResults] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);

  // P1-3 FIX: Artifact generation polling state
  const [artifactPolling, setArtifactPolling] = useState(false);
  const [artifactStatus, setArtifactStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [artifactPollCount, setArtifactPollCount] = useState(0);
  const MAX_ARTIFACT_POLLS = 30; // Max 30 polls = 60 seconds (2s interval)

  const [selectedScenario, setSelectedScenario] = useState<string[]>([]);
  const [scenarioQuestion, setScenarioQuestion] = useState<string>("");
  const [suggestedScenarios, setSuggestedScenarios] = useState<Array<{ id: string; title: string; description: string; analyses: string[] }>>([]);
  const [scenarioSource, setScenarioSource] = useState<'internal' | 'external' | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [selectedBusinessTemplates, setSelectedBusinessTemplates] = useState<string[]>([]);
  const [primaryBusinessTemplate, setPrimaryBusinessTemplate] = useState<string>("");
  const [savedQuestions, setSavedQuestions] = useState<string[]>([]);
  const [savedGoal, setSavedGoal] = useState<string>("");

  // Smart Defaults State
  const [datasetSchema, setDatasetSchema] = useState<DatasetSchema | null>(null);
  const [smartRecommendations, setSmartRecommendations] = useState<AnalysisRecommendation[]>([]);

  // GAP D: Requirements document with analysisPath and questionAnswerMapping
  const [requirementsDocument, setRequirementsDocument] = useState<any>(null);

  // PHASE 6 FIX: Cost confirmation before execution
  const [showCostConfirmation, setShowCostConfirmation] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [costLoading, setCostLoading] = useState(false);

  // Billing/Subscription State (Aligned with Unified Billing)
  const [billingError, setBillingError] = useState<{
    type: 'TIER_UPGRADE_REQUIRED' | 'QUOTA_EXCEEDED' | 'PAYMENT_REQUIRED' | null;
    message: string;
    options?: {
      payOverage?: { cost: number; url: string };
      upgradeTier?: { url: string; recommendedTier: string };
      payPerProject?: { url: string; description: string };
    };
    quotaStatus?: { quota: number; used: number; remaining: number; percentUsed: number; isExceeded: boolean };
    minimumTier?: string;
  } | null>(null);

  // Note: Questions loading moved below after session is available

  useEffect(() => {
    if (!scenarioQuestion && savedQuestions.length > 0) {
      setScenarioQuestion(savedQuestions[0]);
      setSelectedScenario([`user-${0}`]);
    }
  }, [scenarioQuestion, savedQuestions]);

  const [loadingServerResults, setLoadingServerResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const inferAnalysesForQuestion = (question: string): string[] => {
    const q = question.toLowerCase();
    const analyses = new Set<string>(['descriptive']);
    if (/(trend|time|month|week|year|season)/.test(q)) analyses.add('time-series');
    if (/(impact|effect|improve|drive|increase|decrease|predict|churn|attrition)/.test(q)) analyses.add('regression');
    if (/(relationship|correlat|association|compare|versus|vs)/.test(q)) analyses.add('correlation');
    if (/(segment|cluster|group|persona)/.test(q)) analyses.add('clustering');
    if (/(classification|classify|category)/.test(q)) analyses.add('classification');
    return Array.from(analyses);
  };

  const personalizedScenarios: Array<{ id: string; title: string; description: string; analyses: string[]; example?: string; source?: 'user' | 'system' }> = savedQuestions.map((question, index) => ({
    id: `user-${index}`,
    title: question.length > 60 ? `${question.slice(0, 57)}…` : question,
    description: 'Based on the questions you entered earlier',
    analyses: inferAnalysesForQuestion(question),
    example: question,
    source: 'user'
  }));
  const [validationStatus, setValidationStatus] = useState<'pending' | 'validating' | 'validated' | 'failed'>('pending');
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [checkpointApproved, setCheckpointApproved] = useState(false);

  // Agent recommendation state
  const [agentRecommendations, setAgentRecommendations] = useState<any | null>(null);
  const [useAgentConfig, setUseAgentConfig] = useState(true); // Default to using agent recommendations

  // =====================================================
  // U2A2A2U WORKFLOW STATE
  // =====================================================
  // Track workflow phases and checkpoint for agentic execution
  const [workflowCheckpointId, setWorkflowCheckpointId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'running' | 'awaiting_approval' | 'completed' | 'failed'>('idle');
  const [workflowPhases, setWorkflowPhases] = useState<Array<{
    phase: string;
    agentType?: string;
    status: 'success' | 'partial' | 'failed' | 'skipped';
    summary: string;
  }>>([]);
  const [workflowSynthesis, setWorkflowSynthesis] = useState<any>(null);

  const resolvedProjectId = projectId;

  useEffect(() => {
    if (!journeyProgress) return;

    // Load questions from journeyProgress (Master)
    if (journeyProgress.userQuestions && journeyProgress.userQuestions.length > 0) {
      const questions = journeyProgress.userQuestions.map(q => q.text).filter(t => t && t.trim().length > 0).slice(0, 6);
      if (questions.length > 0) {
        setSavedQuestions(questions);
      }
    }

    // Load goal from journeyProgress (Master)
    if (journeyProgress.analysisGoal) {
      setSavedGoal(journeyProgress.analysisGoal);
    }
  }, [journeyProgress]);

  // Load analysis results from server if available
  useEffect(() => {
    if (!resolvedProjectId || executionResults || executionStatus === 'running') {
      return;
    }

    let cancelled = false;
    const loadResults = async () => {
      setLoadingServerResults(true);
      setResultsError(null);
      try {
        const response = await apiClient.getAnalysisResults(resolvedProjectId);
        if (!cancelled && response?.results) {
          setExecutionResults(response.results);
          setExecutionState(prev => ({
            ...prev,
            status: 'completed',
            overallProgress: 100,
            currentStep: { ...prev.currentStep, status: 'completed', description: 'Analysis loaded from server.' }
          }));
          setValidationStatus('validated');
        }
      } catch (error: any) {
        if (cancelled) return;
        const status = error?.response?.status || error?.status;
        if (status === 404) {
          // No execution yet; keep idle state
          return;
        }
        console.error('Failed to load execution results from server:', error);
        setResultsError(error?.message || 'Unable to load execution results. Please try again.');
      } finally {
        if (!cancelled) setLoadingServerResults(false);
      }
    };

    loadResults();
    return () => { cancelled = true; };
  }, [resolvedProjectId, executionResults, executionStatus]);

  // WebSocket Integration for Real-time Progress (using native WebSocket client)
  useEffect(() => {
    if (!resolvedProjectId || executionStatus === 'completed') return;

    // Subscribe to execution progress events for this project using native WebSocket
    const handleProgress = (event: any) => {
      const data = event.data || event;
      if (data.projectId === resolvedProjectId || event.sourceId === resolvedProjectId) {
        // [DAY 10] Handle workflow_progress events from U2A2A2U coordination
        if (data.eventType === 'workflow_progress') {
          console.log('📊 [Execute] Workflow progress event:', data);

          // Update workflow phases with new phase info
          setWorkflowPhases(prev => {
            const existingPhase = prev.find(p => p.phase === data.phase);
            if (existingPhase) {
              // Update existing phase
              return prev.map(p => p.phase === data.phase
                ? { ...p, status: data.status === 'completed' ? 'success' : data.status === 'failed' ? 'failed' : 'partial', summary: data.message }
                : p
              );
            } else if (data.status === 'completed' || data.status === 'started') {
              // Add new phase
              return [...prev, {
                phase: data.phase,
                agentType: data.phase.replace(/_/g, ' '),
                status: data.status === 'completed' ? 'success' : 'partial',
                summary: data.message
              }];
            }
            return prev;
          });

          // Update workflow status based on overall progress
          if (data.percentComplete >= 100) {
            setWorkflowStatus('completed');
          } else if (data.status === 'failed') {
            setWorkflowStatus('failed');
          } else if (data.percentComplete > 0) {
            setWorkflowStatus('running');
          }

          // Also update execution state progress
          setExecutionState(prev => ({
            ...prev,
            overallProgress: data.percentComplete,
            currentStep: {
              ...prev.currentStep,
              name: data.message || data.phase,
              status: data.status === 'completed' ? 'completed' : 'running',
              description: data.slaCompliant ? 'Within SLA' : (data.durationMs ? `Duration: ${Math.round(data.durationMs / 1000)}s` : prev.currentStep.description)
            }
          }));
          return;
        }

        // Standard execution progress handling
        setExecutionState(prev => ({
          ...prev,
          status: data.status || prev.status,
          overallProgress: data.overallProgress ?? data.progress ?? prev.overallProgress,
          currentStep: data.currentStep || prev.currentStep,
          completedSteps: data.completedSteps || prev.completedSteps
        }));

        if (data.status === 'completed') {
          setValidationStatus('validated');
          // Trigger result reload
          setExecutionResults(null);
        }
      }
    };

    // Subscribe to project-specific events using the native WebSocket realtime client
    const unsubscribe = realtimeClient.subscribe(
      `project:${resolvedProjectId}`,
      handleProgress,
      { persistent: true }
    );

    // Also subscribe to execution_progress events
    const unsubscribeProgress = realtimeClient.subscribe(
      'type:execution',
      handleProgress,
      { persistent: true }
    );

    // [DAY 10] Subscribe to type:analysis for workflow progress events
    const unsubscribeAnalysis = realtimeClient.subscribe(
      'type:analysis',
      handleProgress,
      { persistent: true }
    );

    return () => {
      unsubscribe();
      unsubscribeProgress();
      unsubscribeAnalysis();
    };
  }, [resolvedProjectId, executionStatus]);

  // Sync from journeyProgress (SSOT)
  useEffect(() => {
    if (!journeyProgress) return;

    // Load questions from journeyProgress
    if (journeyProgress.userQuestions && journeyProgress.userQuestions.length > 0) {
      setSavedQuestions(journeyProgress.userQuestions.map(q => q.text).slice(0, 6));
    }

    // Load goal
    if (journeyProgress.analysisGoal) {
      setSavedGoal(journeyProgress.analysisGoal);
    }

    // CRITICAL FIX (Gap E): Restore selectedAnalyses from executionConfig if available
    // This ensures analysis selections survive browser refresh/navigation
    const savedExecutionConfig = (journeyProgress as any).executionConfig;
    if (savedExecutionConfig?.selectedAnalyses?.length > 0 && selectedAnalyses.length === 0) {
      console.log('📋 [Gap E Fix] Restoring selectedAnalyses from journeyProgress.executionConfig:', savedExecutionConfig.selectedAnalyses);
      setSelectedAnalyses(savedExecutionConfig.selectedAnalyses);
    }

    // [STEP 5→6 FIX] First check if there's an approved plan with analysisSteps
    // The plan step saves analysisPlanId and sets planApproved=true when user approves
    const planApproved = (journeyProgress as any).planApproved;
    const analysisPlanId = (journeyProgress as any).analysisPlanId;

    if (planApproved && analysisPlanId) {
      console.log('✅ [Execute] Using APPROVED PLAN from Step 5:', { analysisPlanId, planApproved });
      // The plan's analysisSteps should be used - fetch them if not already loaded
      // This will be handled by a separate effect below that loads the plan
    }

    // Load requirements/analysisPath - FIX: Check both nested and flat structure
    // Prepare step saves to journeyProgress.requirementsDocument, not directly on journeyProgress
    const reqDoc = (journeyProgress as any).requirementsDocument;
    const analysisPath = reqDoc?.analysisPath || (journeyProgress as any).analysisPath || [];

    if (analysisPath.length > 0) {
      console.log('📋 [Execute] Loading requirements from journeyProgress:', {
        hasReqDoc: !!reqDoc,
        analysisPathLength: analysisPath.length
      });

      setRequirementsDocument({
        analysisPath: analysisPath,
        requiredDataElements: reqDoc?.requiredDataElements || (journeyProgress as any).requiredDataElements || [],
        questionAnswerMapping: reqDoc?.questionAnswerMapping || (journeyProgress as any).questionAnswerMapping || [],
        completeness: reqDoc?.completeness || (journeyProgress as any).completeness || 0,
        gaps: reqDoc?.gaps || (journeyProgress as any).gaps || [],
      });

      // Auto-select analyses if nothing selected (only if no approved plan)
      if (selectedAnalyses.length === 0 && !planApproved) {
        // PHASE 8 FIX: Replace [_\s]+ to handle both underscores and spaces in type names
        // e.g., 'descriptive_statistics' → 'descriptive-statistics'
        const recommendedTypes = analysisPath
          .map((a: any) => a.analysisType?.toLowerCase().replace(/[_\s]+/g, '-'))
          .filter((t: string) => t);
        if (recommendedTypes.length > 0) {
          setSelectedAnalyses(recommendedTypes);
          console.log('✅ [Execute] Auto-selected DS-recommended analyses from journeyProgress:', recommendedTypes);
        }
      }
    }

    // Load agent recommendations (MOVED to consolidated effect below)
  }, [journeyProgress]);

  // GAP D: Load requirements document with analysisPath and questionAnswerMapping (fallback if not in context)
  useEffect(() => {
    // CRITICAL FIX: Wait for project to finish loading before making decisions
    if (projectLoading) {
      console.log('[Execute] Waiting for project to load...');
      return;
    }

    // Skip API call if we already have data from context
    if (requirementsDocument?.analysisPath?.length > 0) {
      console.log('[Execute] Skipping API call - requirements already loaded from context');
      return;
    }

    // CRITICAL FIX: Also check journeyProgress before making API call
    // The previous useEffect should have loaded from journeyProgress, but if journeyProgress is still loading, wait
    if (!journeyProgress && !resolvedProjectId) return;

    // If journeyProgress exists but doesn't have requirementsDocument, try API as fallback
    const hasRequirementsInProgress = (journeyProgress as any)?.requirementsDocument;
    if (hasRequirementsInProgress) {
      console.log('[Execute] Requirements exist in journeyProgress, should have been loaded by previous effect');
      return; // Previous effect should handle this
    }

    if (!resolvedProjectId) return;

    const loadRequirementsDocument = async () => {
      try {
        console.log(`📊 [Execute] Loading requirements document from API for project ${resolvedProjectId} (fallback)`);
        const response = await apiClient.get(`/api/projects/${resolvedProjectId}/required-data-elements`);

        if (response?.document) {
          setRequirementsDocument(response.document);
          console.log('✅ [Execute] Requirements document loaded from API:', {
            analysisPath: response.document.analysisPath?.length || 0,
            questionAnswerMapping: response.document.questionAnswerMapping?.length || 0,
            completeness: response.document.completeness
          });

          // Auto-select analyses from DS recommendations if not already selected
          if (selectedAnalyses.length === 0 && response.document.analysisPath?.length > 0) {
            // PHASE 8 FIX: Replace [_\s]+ to handle both underscores and spaces in type names
            // e.g., 'descriptive_statistics' → 'descriptive-statistics'
            const recommendedTypes = response.document.analysisPath
              .map((a: any) => a.analysisType?.toLowerCase().replace(/[_\s]+/g, '-'))
              .filter((t: string) => t);
            if (recommendedTypes.length > 0) {
              setSelectedAnalyses(recommendedTypes);
              console.log('✅ [Execute] Auto-selected DS-recommended analyses from API:', recommendedTypes);
            }
          }
        } else {
          console.warn('⚠️ [Execute] No requirements document in API response');
        }
      } catch (error) {
        console.warn('⚠️ [Execute] Could not load requirements document:', error);
        // Don't fail - continue with default analyses
      }
    };

    loadRequirementsDocument();
  }, [resolvedProjectId, projectLoading, journeyProgress, requirementsDocument]);

  // [STEP 5→6 FIX] Load approved plan from Step 5 and use its analysisSteps
  const [approvedPlan, setApprovedPlan] = useState<any>(null);
  useEffect(() => {
    if (!resolvedProjectId || !journeyProgress) return;

    const planApproved = (journeyProgress as any).planApproved;
    const analysisPlanId = (journeyProgress as any).analysisPlanId;

    if (!planApproved || !analysisPlanId) {
      console.log('📋 [Execute] No approved plan found, will use requirements document');
      return;
    }

    const loadApprovedPlan = async () => {
      // PHASE 6 FIX (ROOT CAUSE #4): Prioritize journeyProgress.requirementsDocument.analysisPath
      // This ensures Execute Step uses the SAME data source that Plan Step displayed
      // Priority: requirementsDocument (DS Agent) > plan.analysisSteps (PM Agent)

      const reqDocAnalysisPath = (journeyProgress as any).requirementsDocument?.analysisPath;

      if (reqDocAnalysisPath?.length > 0 && selectedAnalyses.length === 0) {
        // Use DS Agent's analysisPath directly from SSOT (what user approved in Plan Step)
        const dsRecommendedAnalyses = reqDocAnalysisPath
          .map((a: any) => a.analysisType?.toLowerCase().replace(/\s+/g, '-') || a.type?.toLowerCase())
          .filter((t: string) => t);

        if (dsRecommendedAnalyses.length > 0) {
          console.log('✅ [PHASE 6 FIX] Using DS Agent analysisPath from journeyProgress SSOT:', dsRecommendedAnalyses);
          setSelectedAnalyses(dsRecommendedAnalyses);
          // Don't need to fetch from API since we have SSOT
          return;
        }
      }

      // Fallback: Load from API if not in journeyProgress
      try {
        console.log(`📋 [STEP 5→6 FIX] Loading approved plan from API: ${analysisPlanId}`);
        const response = await apiClient.get(`/api/projects/${resolvedProjectId}/plan`);

        if (response?.plan || response?.data?.plan) {
          const plan = response.plan || response.data.plan;
          setApprovedPlan(plan);

          // Use plan's analysisSteps for execution (only if we didn't get from SSOT above)
          if (plan.analysisSteps?.length > 0 && selectedAnalyses.length === 0) {
            const plannedAnalyses = plan.analysisSteps.map((step: any) =>
              step.method?.toLowerCase().replace(/\s+/g, '-') ||
              step.type?.toLowerCase() ||
              step.name?.toLowerCase().replace(/\s+/g, '-')
            ).filter((t: string) => t);

            if (plannedAnalyses.length > 0) {
              console.log('✅ [STEP 5→6 FIX] Using analyses from API PLAN (fallback):', plannedAnalyses);
              setSelectedAnalyses(plannedAnalyses);
            }
          }

          // Also store expected cost from plan
          if (plan.estimatedCost) {
            console.log('💰 [Execute] Expected cost from approved plan:', plan.estimatedCost.total);
          }
        }
      } catch (error) {
        console.warn('⚠️ [Execute] Could not load approved plan from API:', error);
        // Fall back to requirements document (already loaded by other effects)
      }
    };

    loadApprovedPlan();
  }, [resolvedProjectId, journeyProgress, selectedAnalyses.length]);

  // Fetch schema and generate smart recommendations
  // P1-4 FIX: Only generate new recommendations if no locked selections from Prepare step
  useEffect(() => {
    if (!resolvedProjectId) return;

    // Skip if we have an approved plan (loaded above)
    if (approvedPlan?.analysisSteps?.length > 0) {
      console.log('📋 [P1-4] Skipping smart recommendations - using approved plan');
      return;
    }

    // Skip if we already have locked selections from Prepare step (SSOT)
    if (journeyProgress?.selectedAnalysisTypes && journeyProgress.selectedAnalysisTypes.length > 0) {
      console.log('📋 [P1-4] Using locked analysis selections from Prepare step:', journeyProgress.selectedAnalysisTypes);
      return;
    }

    const loadSchemaAndRecommend = async () => {
      try {
        const response = await apiClient.getProjectDatasets(resolvedProjectId);
        if (response?.datasets && response.datasets.length > 0) {
          // Use the first dataset for now
          const dataset = response.datasets[0];
          // Transform API response to DatasetSchema
          const schema: DatasetSchema = {
            columns: dataset.schema?.columns || [],
            rowCount: dataset.rowCount
          };
          setDatasetSchema(schema);

          const recs = SmartDefaultsService.recommendAnalysisTypes(schema);
          setSmartRecommendations(recs);

          // Auto-select top recommendation if nothing selected and no locked selections
          if (selectedAnalyses.length === 0 && recs.length > 0 && recs[0].confidence > 0.8) {
            // Optional: Auto-select or just highlight
            // setSelectedAnalyses([recs[0].type]);
            toast({
              title: "Analysis Recommended",
              description: `Based on your data, we recommend ${recs[0].type.replace('_', ' ')} analysis.`,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load dataset schema for smart defaults:", error);
      }
    };

    loadSchemaAndRecommend();
  }, [resolvedProjectId, journeyProgress?.selectedAnalysisTypes]);

  // Load selected analysis types from journeyProgress
  // ✅ FIX: For non-tech journeys, populate selectedAnalyses; for business, set selectedBusinessTemplates
  useEffect(() => {
    if (journeyProgress?.selectedAnalysisTypes && journeyProgress.selectedAnalysisTypes.length > 0) {
      setSelectedBusinessTemplates(journeyProgress.selectedAnalysisTypes);

      // ✅ For non-tech/technical journeys, also populate selectedAnalyses so they're pre-checked
      if ((journeyType === 'non-tech' || journeyType === 'technical') && selectedAnalyses.length === 0) {
        console.log('📋 [Execute] Pre-selecting analyses from journeyProgress.selectedAnalysisTypes:', journeyProgress.selectedAnalysisTypes);
        setSelectedAnalyses(journeyProgress.selectedAnalysisTypes);
      }
    }
  }, [journeyType, journeyProgress, selectedAnalyses.length]);

  useEffect(() => {
    if (journeyProgress?.agentRecommendations && journeyProgress.agentRecommendations.length > 0) {
      const rec = journeyProgress.agentRecommendations[0];
      const legacyFormat = {
        recommendedAnalyses: rec.suggestedAnalyses || [],
        reasoning: rec.reasoning || ""
      };
      setAgentRecommendations(legacyFormat);

      if (selectedAnalyses.length === 0 && legacyFormat.recommendedAnalyses.length > 0) {
        setSelectedAnalyses(legacyFormat.recommendedAnalyses);
      }
    }
  }, [journeyProgress, selectedAnalyses.length]);

  // Fetch template configurations and auto-fill recommended analyses (Phase 3 - Task 3.2)
  // P1-4 FIX: Don't override locked selections from Prepare step
  useEffect(() => {
    if (journeyType !== 'business' || !primaryBusinessTemplate) return;

    // Skip if we have locked selections from Prepare step (SSOT)
    if (journeyProgress?.selectedAnalysisTypes && journeyProgress.selectedAnalysisTypes.length > 0) {
      console.log('📋 [P1-4] Skipping template config - using locked selections from Prepare step');
      return;
    }

    // [GAP D FIX] Prioritize analysis selection from Requirements Document (the 'Plan')
    if (journeyProgress?.requirementsDocument?.analysisPath?.length) {
      const analyses = journeyProgress.requirementsDocument.analysisPath;
      const analysisIds = analyses.map((a: any) =>
        a.analysisType?.toLowerCase().replace(/\s+/g, '-') ||
        a.analysisName?.toLowerCase().replace(/\s+/g, '-') ||
        a.type?.toLowerCase() // fallback
      ).filter(Boolean);

      if (analysisIds.length > 0) {
        console.log('📋 [Execute] Auto-selecting analyses from Requirements Plan:', analysisIds);
        setSelectedAnalyses(analysisIds);
        // Don't return here, might still want to fetch template config for other metadata, 
        // but we've acted on the SSOT plan.
      }
    }

    const fetchTemplateConfig = async () => {
      try {
        const response = await fetch(`/api/templates/${primaryBusinessTemplate}/config`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.config) {
            console.log('Template config loaded:', data.config);

            // Auto-fill recommended analyses (but don't override agent recommendations or locked selections)
            // [GAP D FIX] Don't override if we just loaded from requirementsDocument
            if (!agentRecommendations &&
              !journeyProgress?.requirementsDocument?.analysisPath?.length &&
              data.config.recommendedAnalyses &&
              data.config.recommendedAnalyses.length > 0) {
              setSelectedAnalyses(data.config.recommendedAnalyses);
              console.log('Auto-selected analyses from template:', data.config.recommendedAnalyses);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch template config:', error);
        // Silently fail - user can still manually select analyses
      }
    };

    fetchTemplateConfig();
  }, [journeyType, primaryBusinessTemplate, agentRecommendations, journeyProgress?.selectedAnalysisTypes, journeyProgress?.requirementsDocument]);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Analysis Execution",
          description: "Our AI will automatically configure and run the optimal analysis",
          icon: Brain,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Analysis Execution",
          description: "Execute analysis using business templates and best practices",
          icon: BarChart3,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Analysis Execution",
          description: "Configure and execute advanced statistical analysis",
          icon: Settings,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Expert-Guided Analysis",
          description: "Analysis executed with expert consultation and guidance",
          icon: Eye,
          color: "yellow"
        };
      default:
        return {
          title: "Analysis Execution",
          description: "Configure and execute your data analysis",
          icon: BarChart3,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  // Analysis options with journey-specific labels
  const getAnalysisOptions = () => {
    if (journeyType === 'non-tech') {
      return [
        { id: 'descriptive', name: 'Understand Your Data', description: 'See what your data looks like with charts and summaries', duration: '2-3 min' },
        { id: 'correlation', name: 'Find Patterns', description: 'Discover how different things relate to each other', duration: '3-5 min' },
        { id: 'regression', name: 'Predict Outcomes', description: 'Understand what factors drive results', duration: '5-8 min' },
        { id: 'clustering', name: 'Group Similar Items', description: 'Find natural groups in your data', duration: '8-12 min' },
        { id: 'classification', name: 'Categorize & Predict', description: 'Predict which category something belongs to', duration: '10-15 min' },
        { id: 'time-series', name: 'Spot Trends Over Time', description: 'See how things change over days, months, or years', duration: '6-10 min' }
      ];
    }

    // For business journey, show template-based workflow steps instead of technical analyses
    if (journeyType === 'business' && selectedBusinessTemplates.length > 0) {
      // Map business templates to their workflow steps
      const templateWorkflowSteps = selectedBusinessTemplates.flatMap(templateId => {
        // Business template workflow steps based on template type
        switch (templateId) {
          case 'retail_customer_segmentation':
            return [
              { id: 'customer_data_prep', name: 'Prepare Customer Data', description: 'Clean and normalize customer purchase behavior data', duration: '3-5 min' },
              { id: 'customer_clustering', name: 'Customer Clustering', description: 'Identify customer segments based on behavior', duration: '8-12 min' },
              { id: 'segment_profiling', name: 'Segment Profiling', description: 'Analyze characteristics of each customer segment', duration: '5-7 min' }
            ];
          case 'finance_fraud_detection':
            return [
              { id: 'transaction_features', name: 'Transaction Feature Engineering', description: 'Extract fraud indicators from transactions', duration: '5-8 min' },
              { id: 'anomaly_detection', name: 'Anomaly Detection', description: 'Identify suspicious transaction patterns', duration: '10-15 min' },
              { id: 'fraud_scoring', name: 'Fraud Risk Scoring', description: 'Calculate fraud probability scores', duration: '5-7 min' }
            ];
          case 'finance_credit_risk':
            return [
              { id: 'credit_data_prep', name: 'Credit Data Preparation', description: 'Prepare borrower credit history and financial data', duration: '4-6 min' },
              { id: 'risk_scoring', name: 'Risk Score Calculation', description: 'Calculate creditworthiness scores', duration: '6-9 min' },
              { id: 'default_prediction', name: 'Default Prediction Model', description: 'Predict likelihood of loan default', duration: '10-15 min' }
            ];
          case 'hr_attrition_prediction':
            return [
              { id: 'employee_analysis', name: 'Employee Data Analysis', description: 'Analyze employee demographics and performance', duration: '3-5 min' },
              { id: 'attrition_patterns', name: 'Attrition Pattern Identification', description: 'Find factors driving employee turnover', duration: '8-12 min' },
              { id: 'retention_insights', name: 'Retention Strategy Insights', description: 'Generate recommendations to reduce attrition', duration: '5-7 min' }
            ];
          case 'hr_compensation_analysis':
            return [
              { id: 'comp_benchmarking', name: 'Compensation Benchmarking', description: 'Compare compensation against market data', duration: '5-8 min' },
              { id: 'equity_analysis', name: 'Pay Equity Analysis', description: 'Identify compensation disparities', duration: '7-10 min' },
              { id: 'comp_recommendations', name: 'Compensation Recommendations', description: 'Generate fair compensation adjustments', duration: '5-7 min' }
            ];
          default:
            // Generic business template steps
            return [
              { id: 'business_data_prep', name: 'Business Data Preparation', description: 'Prepare data according to template requirements', duration: '3-5 min' },
              { id: 'business_analysis', name: 'Template-based Analysis', description: 'Execute analysis using business template', duration: '8-12 min' },
              { id: 'business_insights', name: 'Business Insights Generation', description: 'Generate actionable business insights', duration: '5-7 min' }
            ];
        }
      });

      // Remove duplicates by id
      const uniqueSteps = Array.from(new Map(templateWorkflowSteps.map(step => [step.id, step])).values());
      return uniqueSteps;
    }

    // Default technical labels for technical/consultation users
    return [
      { id: 'descriptive', name: 'Descriptive Statistics', description: 'Basic statistical summaries and distributions', duration: '2-3 min' },
      { id: 'correlation', name: 'Correlation Analysis', description: 'Relationships between variables', duration: '3-5 min' },
      { id: 'regression', name: 'Regression Analysis', description: 'Predictive modeling and relationships', duration: '5-8 min' },
      { id: 'clustering', name: 'Clustering Analysis', description: 'Group similar data points', duration: '8-12 min' },
      { id: 'classification', name: 'Classification Analysis', description: 'Predict categorical outcomes', duration: '10-15 min' },
      { id: 'time-series', name: 'Time Series Analysis', description: 'Trends and patterns over time', duration: '6-10 min' }
    ];
  };

  const baseAnalysisOptions = getAnalysisOptions();

  // PHASE 8 FIX: When DS Agent has recommended analyses, show THOSE directly instead of hardcoded options
  // This ensures users see the EXACT analyses that DS Agent recommended in Prepare step
  const analysisOptions = useMemo(() => {
    const recommendedAnalyses = requirementsDocument?.analysisPath ||
                                (journeyProgress as any)?.requirementsDocument?.analysisPath || [];

    // PRIORITY 1: If DS Agent has recommendations, show those directly
    if (recommendedAnalyses.length > 0) {
      console.log('📊 [Execute] Using DS Agent analysisPath with', recommendedAnalyses.length, 'analyses');
      return recommendedAnalyses.map((analysis: any, index: number) => ({
        // Normalize ID to match selection state (using [_\s]+ to handle underscores)
        id: analysis.analysisType?.toLowerCase().replace(/[_\s]+/g, '-') || `analysis-${index}`,
        name: analysis.analysisName || analysis.analysisType?.replace(/_/g, ' ') || `Analysis ${index + 1}`,
        description: analysis.description || analysis.rationale || analysis.purpose || '',
        duration: analysis.estimatedDuration || '5-10 min',
        isRecommended: true,
        // Preserve original data for execution
        originalAnalysisId: analysis.analysisId,
        analysisType: analysis.analysisType,
        requiredElements: analysis.requiredDataElements || []
      }));
    }

    // FALLBACK: Use hardcoded options only if no DS recommendations
    return baseAnalysisOptions.map(opt => ({
      ...opt,
      isRecommended: false
    }));
  }, [baseAnalysisOptions, requirementsDocument?.analysisPath, journeyProgress]);

  // Count how many recommended analyses exist
  const recommendedCount = analysisOptions.filter((a: any) => a.isRecommended).length;

  // Non-tech scenario presets in plain language → mapped to analyses
  const scenarioPresets: Array<{ id: string; title: string; description: string; analyses: string[]; example?: string; source?: 'user' | 'system' }> = [
    {
      id: 'policy-attrition',
      title: 'Policy impact on employee attrition',
      description: 'Check if a policy change increased employee departures',
      analyses: ['descriptive', 'correlation', 'regression', 'time-series'],
      example: 'Is there evidence of employee attrition due to the new remote work policy?'
    },
    {
      id: 'campaign-effectiveness',
      title: 'Marketing campaign effectiveness',
      description: 'Determine if a recent campaign drove sales lift',
      analyses: ['descriptive', 'time-series', 'regression'],
      example: 'Did the April campaign increase weekly sales?'
    },
    {
      id: 'pricing-churn',
      title: 'Pricing change effect on churn',
      description: 'Assess if pricing changes impacted customer churn',
      analyses: ['descriptive', 'correlation', 'classification', 'regression'],
      example: 'Did the price adjustment affect churn rates?'
    },
    {
      id: 'operations-sla',
      title: 'Operational changes and SLA breaches',
      description: 'See if schedule changes affected SLA breaches',
      analyses: ['descriptive', 'correlation', 'time-series'],
      example: 'Did staffing changes increase SLA breaches?'
    }
  ];

  const scenarioOptions = personalizedScenarios.concat(scenarioPresets);

  // Debounced question suggestion fetch for non-tech users
  useEffect(() => {
    let cancelled = false;
    if (journeyType !== 'non-tech') return;
    if (!scenarioQuestion || scenarioQuestion.trim().length < 8) {
      setSuggestedScenarios([]);
      setScenarioSource(null);
      return;
    }
    setIsSuggesting(true);
    const t = setTimeout(async () => {
      try {
        // Fetch project data to get schema context
        let schema: Record<string, any> | undefined;
        let dataContext: any = {};

        if (resolvedProjectId) {
          try {
            const projectData = await apiClient.getProjectDatasets(resolvedProjectId);
            const dataset = projectData?.datasets?.[0]?.dataset;
            if (dataset?.schema) {
              schema = dataset.schema || {};
              // Ensure schema is an object before using Object methods
              const safeSchema = schema || {};
              dataContext = {
                columnNames: Object.keys(safeSchema),
                rowCount: dataset.rowCount || dataset.recordCount,
                hasTimeSeries: Object.values(safeSchema).some((type: any) =>
                  typeof type === 'string' && (type.includes('date') || type.includes('time'))
                )
              };
            }
          } catch (dataError) {
            console.warn('Could not fetch project data for context:', dataError);
          }
        }

        const resp = await apiClient.post('/api/analysis/suggest-scenarios', {
          question: scenarioQuestion,
          schema,
          goals: savedGoal ? [savedGoal] : [],
          previousQuestions: savedQuestions,
          dataContext
        });
        if (!cancelled) {
          setSuggestedScenarios(resp?.scenarios || []);
          setScenarioSource(resp?.source || null);
        }
      } catch (e) {
        if (!cancelled) {
          setSuggestedScenarios([]);
          setScenarioSource(null);
        }
      } finally {
        if (!cancelled) setIsSuggesting(false);
      }
    }, 450);

    return () => { cancelled = true; clearTimeout(t); };
  }, [scenarioQuestion, journeyType, resolvedProjectId, savedGoal, savedQuestions]);

  const handleAnalysisToggle = (analysisId: string) => {
    setSelectedAnalyses(prev =>
      prev.includes(analysisId)
        ? prev.filter(id => id !== analysisId)
        : [...prev, analysisId]
    );
  };

  const handleExecuteAnalysis = async () => {
    // FIX Phase 3 - Checkpoint Enforcement: Verify plan was approved
    const planApproved = journeyProgress?.planApproved === true;
    const planApprovedAt = journeyProgress?.planApprovedAt;

    if (!planApproved && journeyType !== 'non-tech') {
      toast({
        title: "Plan Approval Required",
        description: "Please go back to the Plan step and approve the analysis plan before execution.",
        variant: "destructive"
      });
      return;
    }

    // CRITICAL FIX: Show feedback when no analyses selected instead of silent return
    if (selectedAnalyses.length === 0) {
      toast({
        title: "No Analysis Selected",
        description: "Please select at least one analysis type before executing.",
        variant: "destructive"
      });
      return;
    }

    // Phase 3 - Task 3.3: Show checkpoint dialog first
    if (!checkpointApproved) {
      setShowCheckpoint(true);
      return;
    }

    // PHASE 6 FIX: Show cost confirmation before execution
    // If cost confirmation not yet shown, fetch estimate and show dialog
    if (!showCostConfirmation && estimatedCost === 0) {
      setCostLoading(true);
      try {
        const costResponse = await apiClient.get(`/api/projects/${projectId}/cost-estimate`);
        const cost = costResponse.estimatedCost || costResponse.totalCost || 0;
        setEstimatedCost(cost);
        setShowCostConfirmation(true);
      } catch (costError) {
        console.warn('Cost estimate unavailable, proceeding without confirmation:', costError);
        // Proceed without cost confirmation if endpoint not available
      }
      setCostLoading(false);
      return;
    }

    // Reset cost confirmation for next execution
    setShowCostConfirmation(false);

    setExecutionState({
      status: 'initializing',
      overallProgress: 0,
      currentStep: { id: 'config', name: 'Configuring Analysis', status: 'running', description: 'Preparing analysis parameters...' },
      completedSteps: [],
      pendingSteps: selectedAnalyses.map(id => ({ id, name: id, status: 'pending', description: 'Pending execution...' })),
      analysisTypes: selectedAnalyses,
      startedAt: new Date().toISOString(),
      executionId: '',
      projectId: resolvedProjectId || '',
      totalSteps: selectedAnalyses.length + 2
    });


    // Update business context if needed
    if (journeyType === 'business') {
      updateProgress({
        businessContext: {
          selectedTemplates: selectedBusinessTemplates,
          primaryTemplate: primaryBusinessTemplate
        }
      });
    }

    try {
      if (!projectId) {
        console.error('No project ID found');
        setExecutionState(prev => ({ ...prev, status: 'failed', error: 'No project ID found' }));
        // CRITICAL FIX: Show toast so user knows what went wrong
        toast({
          title: "Project Not Found",
          description: "No project ID found. Please go back to Data Upload and ensure your project is created.",
          variant: "destructive"
        });
        return;
      }

      console.log(`🚀 Executing real analysis for project ${projectId}`);
      console.log(`📊 Analysis types: ${selectedAnalyses.join(', ')}`);

      // Call the REAL analysis execution API
      // Update journeyProgress that execution has started
      updateProgress({
        executionStartedAt: new Date().toISOString(),
        executionConfig: {
          selectedAnalyses,
          confirmedAt: new Date().toISOString(),
          executionParams: {
            journeyType,
            templateContext: journeyType === 'business' ? {
              selectedTemplates: selectedBusinessTemplates,
              primaryTemplate: primaryBusinessTemplate
            } : undefined
          }
        }
      });

      setExecutionState(prev => ({
        ...prev,
        status: 'running',
        overallProgress: 10,
        currentStep: { id: 'execution', name: 'Executing Analysis', status: 'running', description: 'Sending request to analysis engine...' }
      }));


      // Get authentication token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // =====================================================
      // U2A2A2U AGENTIC WORKFLOW INTEGRATION
      // =====================================================
      // Instead of calling analysis-execution directly, we now use the
      // U2A2A2U (User→Agent→Agent→User) workflow which coordinates:
      // 1. Data Engineer Agent - validates data quality
      // 2. Data Scientist Agent - plans and executes analysis
      // 3. Business Agent - adds industry context
      // 4. PM Agent - synthesizes results
      // 5. Checkpoint - user approval
      // 6. Execution - run approved analysis
      // =====================================================

      console.log('🔄 [U2A2A2U] Starting agentic workflow for project', projectId);
      console.log('🔄 [U2A2A2U] Agents will coordinate: DATA_ENGINEER → DATA_SCIENTIST → BUSINESS_AGENT → PM_SYNTHESIS');

      // FIX Phase 3: Add execution timeout (5 minutes for complex analyses)
      const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn('⏱️ U2A2A2U workflow timed out after 5 minutes');
      }, EXECUTION_TIMEOUT_MS);

      let response: Response;

      // PHASE 9 FIX: Use direct analysis execution route instead of agent-workflow
      // This route has better data extraction (extractDatasetRows) that properly handles
      // transformed data from joinedData in journeyProgress
      console.log('🔬 [PHASE 9] Using direct analysis-execution route');

      // Build analysisPath for evidence chain if not already available (declared outside try for logging)
      const analysisPathForExecution = requirementsDocument?.analysisPath ||
        selectedAnalyses.map((type, idx) => ({
          analysisId: `analysis_${idx}`,
          analysisName: type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          analysisType: type,
          requiredDataElements: []
        }));

      // Build questionAnswerMapping from requirements document (declared outside try for logging)
      const questionMappingForExecution = requirementsDocument?.questionAnswerMapping ||
        (savedQuestions || []).map((q: string, idx: number) => ({
          questionId: `q_${idx}`,
          questionText: q,
          recommendedAnalyses: selectedAnalyses.slice(0, 2),
          requiredDataElements: []
        }));

      try {
        response = await fetch('/api/analysis-execution/execute', {
          method: 'POST',
          headers,
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            projectId: projectId,
            // Selected analysis types (required)
            analysisTypes: selectedAnalyses,
            // CRITICAL: Pass DS-recommended analyses with priority and details
            analysisPath: analysisPathForExecution,
            // CRITICAL: Pass question-to-analysis mapping for evidence chain
            questionAnswerMapping: questionMappingForExecution,
            // Preview mode flag
            previewOnly: false
          })
        });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Agentic workflow timed out after 5 minutes. Your analysis may be processing in the background - please check back in a few minutes.');
        }
        throw fetchError;
      }
      clearTimeout(timeoutId);

      console.log('🔄 [PHASE 9] Analysis execution request sent');
      console.log('📈 [PHASE 9] Analysis types:', selectedAnalyses.length);
      console.log('📋 [PHASE 9] Analysis path items:', analysisPathForExecution.length);
      console.log('❓ [PHASE 9] Question mappings:', questionMappingForExecution.length);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        // Handle billing-specific error codes
        if (response.status === 402 || response.status === 403) {
          const errorCode = errorData?.code;

          if (errorCode === 'TIER_UPGRADE_REQUIRED') {
            console.log('🔒 [Billing] Tier upgrade required');
            setBillingError({
              type: 'TIER_UPGRADE_REQUIRED',
              message: errorData?.message || 'Your subscription tier does not include access to this journey type.',
              minimumTier: errorData?.minimumTier,
              options: {
                upgradeTier: { url: errorData?.upgradeUrl || '/billing/upgrade', recommendedTier: errorData?.minimumTier }
              }
            });
            setExecutionState(prev => ({ ...prev, status: 'idle', overallProgress: 0 }));
            return; // Don't throw, let the UI show the billing error
          }

          if (errorCode === 'QUOTA_EXCEEDED') {
            console.log('⚠️ [Billing] Quota exceeded');
            setBillingError({
              type: 'QUOTA_EXCEEDED',
              message: errorData?.message || 'Your analysis quota has been exceeded.',
              quotaStatus: errorData?.quotaStatus,
              options: errorData?.options
            });
            setExecutionState(prev => ({ ...prev, status: 'idle', overallProgress: 0 }));
            return; // Don't throw, let the UI show the billing error
          }

          if (errorCode === 'PAYMENT_REQUIRED') {
            console.log('💳 [Billing] Payment required');
            setBillingError({
              type: 'PAYMENT_REQUIRED',
              message: errorData?.message || 'Payment is required to execute this analysis.',
              options: {
                payPerProject: { url: errorData?.paymentUrl || `/projects/${projectId}/payment`, description: 'Pay for this project' }
              }
            });
            setExecutionState(prev => ({ ...prev, status: 'idle', overallProgress: 0 }));
            return; // Don't throw, let the UI show the billing error
          }
        }

        const errorMessage = errorData?.error
          || errorData?.message
          || `Analysis execution failed (HTTP ${response.status}). Please check your data and try again.`;
        throw new Error(errorMessage);
      }

      setExecutionState(prev => ({
        ...prev,
        overallProgress: 50,
        currentStep: { id: 'processing', name: 'Processing Results', status: 'running', description: 'Analyzing returned data...' }
      }));


      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Analysis execution failed');
      }

      // =====================================================
      // U2A2A2U WORKFLOW RESPONSE HANDLING
      // =====================================================
      // The workflow returns phases, status, and optional checkpointId
      const workflow = data.workflow;

      if (!workflow) {
        throw new Error('Workflow response missing from API');
      }

      console.log('🔄 [U2A2A2U] Workflow response received');
      console.log(`🔄 [U2A2A2U] Status: ${workflow.status}, Phases: ${workflow.phases?.length || 0}`);
      console.log(`🔄 [U2A2A2U] Current phase: ${workflow.currentPhase}`);

      // Store workflow phases for display
      setWorkflowPhases(workflow.phases || []);
      setWorkflowStatus(workflow.status);

      // =====================================================
      // HANDLE AWAITING_APPROVAL STATUS
      // =====================================================
      // If workflow needs user approval, show checkpoint dialog
      if (workflow.status === 'awaiting_approval' && workflow.checkpointId) {
        console.log(`✋ [U2A2A2U] Workflow awaiting approval. CheckpointId: ${workflow.checkpointId}`);
        setWorkflowCheckpointId(workflow.checkpointId);

        // Get synthesis results for checkpoint display
        const synthesisPhase = workflow.phases?.find((p: any) => p.phase === 'synthesis');
        if (synthesisPhase?.resultId) {
          try {
            const latestRes = await fetch(`/api/agent-workflow/${projectId}/results/latest`, {
              headers,
              credentials: 'include'
            });
            if (latestRes.ok) {
              const latestData = await latestRes.json();
              const pmResult = latestData.results?.project_manager;
              if (pmResult?.output?.result) {
                setWorkflowSynthesis(pmResult.output.result);
              }
            }
          } catch (e) {
            console.warn('Failed to fetch synthesis details:', e);
          }
        }

        setExecutionState(prev => ({
          ...prev,
          status: 'running',
          overallProgress: 75,
          currentStep: {
            id: 'checkpoint',
            name: 'Awaiting Your Approval',
            status: 'running',
            description: 'AI agents have prepared an analysis plan. Please review and approve.'
          }
        }));

        // Show the checkpoint dialog
        setShowCheckpoint(true);

        toast({
          title: "Approval Required",
          description: "AI agents have prepared an analysis plan. Please review and approve to continue.",
        });

        return; // Wait for user to approve via handleWorkflowApproval
      }

      // =====================================================
      // HANDLE COMPLETED STATUS
      // =====================================================
      if (workflow.status === 'completed') {
        await handleWorkflowCompleted(workflow, headers);
      } else if (workflow.status === 'failed') {
        const failedPhase = workflow.phases?.find((p: any) => p.status === 'failed');
        throw new Error(failedPhase?.summary || 'Workflow failed');
      }

    } catch (error: any) {
      console.error('❌ Analysis execution error:', error);
      const errorMsg = error?.message || 'Analysis execution failed. Please try again.';
      setExecutionState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMsg,
        currentStep: { ...prev.currentStep, status: 'failed', error: errorMsg }
      }));

      toast({
        title: "Analysis Failed",
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  // =====================================================
  // U2A2A2U WORKFLOW HELPER FUNCTIONS
  // =====================================================

  /**
   * Handle workflow completion - extract results and update state
   */
  const handleWorkflowCompleted = async (workflow: any, headers: Record<string, string>) => {
    console.log('✅ [U2A2A2U] Workflow completed successfully');

    // Fetch latest results from all agents
    const projectId = resolvedProjectId;
    let payload: any = null;

    try {
      const resultsRes = await fetch(`/api/agent-workflow/${projectId}/results/latest`, {
        headers,
        credentials: 'include'
      });

      if (resultsRes.ok) {
        const resultsData = await resultsRes.json();

        // Extract synthesis from PM agent
        const pmResult = resultsData.results?.project_manager;
        const dsResult = resultsData.results?.data_scientist;

        // Build payload from agent results
        payload = {
          // From DS agent
          insights: dsResult?.output?.result?.insights || [],
          correlations: dsResult?.output?.result?.correlations || [],
          mlModels: dsResult?.output?.result?.mlModels || [],
          recommendations: [
            ...(dsResult?.output?.recommendations || []),
            ...(pmResult?.output?.recommendations || [])
          ],
          // From PM synthesis
          formatted: pmResult?.output?.result?.formatted || {},
          questionAnswers: pmResult?.output?.result?.questionAnswers || [],
          executiveSummary: pmResult?.output?.result?.formatted?.executiveSummary ||
                           pmResult?.output?.result?.summaryForUser,
          // Metadata
          workflowId: workflow.workflowId,
          executionTimeMs: workflow.executionTimeMs,
          phases: workflow.phases,
          insightCount: dsResult?.output?.result?.insights?.length || 0,
          recommendationCount: (dsResult?.output?.recommendations?.length || 0) +
                              (pmResult?.output?.recommendations?.length || 0)
        };

        console.log(`📈 [U2A2A2U] Results: ${payload.insightCount} insights, ${payload.recommendationCount} recommendations`);
      }
    } catch (e) {
      console.warn('Failed to fetch workflow results:', e);
    }

    // Fallback if no results fetched
    if (!payload) {
      payload = {
        insights: [],
        recommendations: [],
        workflowId: workflow.workflowId,
        executionTimeMs: workflow.executionTimeMs,
        phases: workflow.phases,
        insightCount: 0,
        recommendationCount: 0
      };
    }

    setExecutionState(prev => ({
      ...prev,
      status: 'completed',
      overallProgress: 100,
      currentStep: {
        id: 'complete',
        name: 'Analysis Complete',
        status: 'completed',
        description: 'All AI agents have finished processing.'
      },
      completedSteps: [...prev.completedSteps, prev.currentStep]
    }));

    setExecutionResults(payload);
    setWorkflowStatus('completed');

    // Store execution summary
    const pricingSummary = {
      totalAnalyses: selectedAnalyses.length,
      executionTime: `${Math.round(workflow.executionTimeMs / 1000)}s`,
      resultsGenerated: payload.insightCount || 0,
      insightsFound: payload.insightCount || 0,
      recommendationsFound: payload.recommendationCount || 0,
      qualityScore: 85, // Default quality score
      dataSize: 0,
      datasetCount: 1,
      selectedAnalyses,
      estimatedCost: 0
    };

    // Update journeyProgress with results (SSOT)
    try {
      updateProgress({
        executionCompletedAt: new Date().toISOString(),
        analysisResultsId: workflow.workflowId,
        artifactIds: [],
        executionSummary: {
          totalAnalyses: pricingSummary.totalAnalyses,
          dataSize: pricingSummary.dataSize,
          executionTime: pricingSummary.executionTime,
          resultsGenerated: pricingSummary.resultsGenerated,
          insightsFound: pricingSummary.insightsFound,
          recommendationsFound: pricingSummary.recommendationsFound,
          qualityScore: pricingSummary.qualityScore,
          datasetCount: pricingSummary.datasetCount
        },
        costEstimate: {
          amount: pricingSummary.estimatedCost,
          currency: 'USD',
          lockedAt: new Date().toISOString(),
        }
      });

      localStorage.setItem('chimari_execution_results', JSON.stringify(payload));

      // P1-3 FIX: Start artifact generation polling after execution completes
      startArtifactPolling();
    } catch (error) {
      console.error('Failed to save execution results to progress:', error);
    }
  };

  /**
   * P1-3 FIX: Poll for artifact generation status after execution completes
   * Artifacts are generated asynchronously by the backend after analysis execution
   */
  const startArtifactPolling = () => {
    console.log('📦 [P1-3] Starting artifact generation polling...');
    setArtifactPolling(true);
    setArtifactStatus('generating');
    setArtifactPollCount(0);
  };

  // P1-3 FIX: Artifact polling effect
  useEffect(() => {
    if (!artifactPolling || !resolvedProjectId) return;

    const pollArtifacts = async () => {
      try {
        console.log(`📦 [P1-3] Polling artifacts (attempt ${artifactPollCount + 1}/${MAX_ARTIFACT_POLLS})...`);

        const response = await apiClient.get(`/api/projects/${resolvedProjectId}/artifacts`);
        const fetchedArtifacts = response?.artifacts || [];

        if (fetchedArtifacts.length > 0) {
          // Check if any artifacts are still generating
          const pendingArtifacts = fetchedArtifacts.filter(
            (a: any) => a.status === 'generating' || a.status === 'pending' || a.status === 'created'
          );
          const readyArtifacts = fetchedArtifacts.filter(
            (a: any) => a.status === 'ready' || a.status === 'completed'
          );

          setArtifacts(fetchedArtifacts);

          if (pendingArtifacts.length === 0 && readyArtifacts.length > 0) {
            // All artifacts are ready
            console.log(`✅ [P1-3] All ${readyArtifacts.length} artifacts are ready!`);
            setArtifactStatus('ready');
            setArtifactPolling(false);

            // Update journeyProgress with artifact IDs
            const artifactIds = readyArtifacts.map((a: any) => a.id);
            updateProgress({
              artifactIds,
              artifactsGeneratedAt: new Date().toISOString()
            });

            toast({
              title: "Artifacts Ready",
              description: `${readyArtifacts.length} artifact(s) have been generated and are ready for download.`,
            });
          } else if (readyArtifacts.length > 0) {
            // Some artifacts ready, some still generating
            console.log(`⏳ [P1-3] ${readyArtifacts.length} artifacts ready, ${pendingArtifacts.length} still generating...`);
            setArtifacts(fetchedArtifacts);
          }
        }

        // Check if we've exceeded max polls
        if (artifactPollCount >= MAX_ARTIFACT_POLLS) {
          console.log('⚠️ [P1-3] Max polling attempts reached, stopping poll...');
          setArtifactPolling(false);
          if (artifacts.length === 0) {
            setArtifactStatus('error');
            toast({
              title: "Artifact Generation Timeout",
              description: "Artifacts are taking longer than expected. You can check back later on the Results page.",
              variant: "default"
            });
          }
        }
      } catch (error) {
        console.error('❌ [P1-3] Error polling artifacts:', error);
        // Don't stop polling on transient errors, just increment counter
      }

      setArtifactPollCount(prev => prev + 1);
    };

    const pollInterval = setInterval(pollArtifacts, 2000); // Poll every 2 seconds

    // Initial poll
    pollArtifacts();

    return () => clearInterval(pollInterval);
  }, [artifactPolling, resolvedProjectId, artifactPollCount, artifacts.length, updateProgress, toast]);

  /**
   * Handle workflow approval - continue workflow after user approves checkpoint
   */
  const handleWorkflowApproval = async (approved: boolean, feedback?: string) => {
    const projectId = resolvedProjectId;
    const checkpointId = workflowCheckpointId;

    if (!projectId || !checkpointId) {
      toast({
        title: "Error",
        description: "Missing project or checkpoint ID",
        variant: "destructive"
      });
      return;
    }

    setShowCheckpoint(false);
    setCheckpointApproved(approved);

    if (!approved) {
      console.log('❌ [U2A2A2U] User rejected the analysis plan');
      setExecutionState(prev => ({
        ...prev,
        status: 'idle',
        overallProgress: 0,
        currentStep: {
          id: 'rejected',
          name: 'Plan Rejected',
          status: 'failed',
          description: 'You rejected the analysis plan. Please adjust your selections and try again.'
        }
      }));
      setWorkflowStatus('failed');

      toast({
        title: "Plan Rejected",
        description: "You can adjust your analysis selections and try again.",
        variant: "default"
      });
      return;
    }

    console.log(`▶️ [U2A2A2U] User approved. Continuing workflow with checkpoint: ${checkpointId}`);

    setExecutionState(prev => ({
      ...prev,
      overallProgress: 85,
      currentStep: {
        id: 'executing',
        name: 'Executing Approved Analysis',
        status: 'running',
        description: 'Running the approved analysis plan...'
      }
    }));

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Call continue endpoint
      const response = await fetch('/api/agent-workflow/continue', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          projectId,
          checkpointId,
          feedback: feedback || 'approved'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to continue workflow');
      }

      const data = await response.json();

      if (!data.success || !data.workflow) {
        throw new Error(data.error || 'Invalid response from workflow continuation');
      }

      console.log('✅ [U2A2A2U] Workflow continuation complete');

      // Update phases
      setWorkflowPhases(prev => [...prev, ...(data.workflow.phases || [])]);

      // Handle completed workflow
      await handleWorkflowCompleted(data.workflow, headers);

      toast({
        title: "Analysis Complete",
        description: "Your analysis has been executed successfully!",
      });

    } catch (error: any) {
      console.error('❌ [U2A2A2U] Workflow continuation failed:', error);
      setExecutionState(prev => ({
        ...prev,
        status: 'failed',
        error: error.message,
        currentStep: {
          id: 'failed',
          name: 'Execution Failed',
          status: 'failed',
          description: error.message
        }
      }));
      setWorkflowStatus('failed');

      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getCurrentProjectId = () => resolvedProjectId;

  const handlePreviewResults = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      toast({
        title: "Missing project",
        description: "Please select a project or upload data before previewing results.",
        variant: "destructive"
      });
      return;
    }

    setPreviewError(null);
    setPreviewLoading(true);

    try {
      let resultsPayload = executionResults;
      if (!resultsPayload) {
        const apiResponse = await apiClient.getAnalysisResults(projectId);
        resultsPayload = apiResponse?.results;
      }

      if (!resultsPayload) {
        throw new Error('Results are not available yet. Please run the analysis first.');
      }

      setPreviewData(resultsPayload);
      setIsPreviewOpen(true);
    } catch (error: any) {
      const message = error?.message || 'Failed to load preview results.';
      setPreviewError(message);
      toast({
        title: "Preview unavailable",
        description: message,
        variant: "destructive"
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadArtifacts = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      toast({
        title: "Missing project",
        description: "Please select a project before downloading artifacts.",
        variant: "destructive"
      });
      return;
    }

    setArtifactLoading(true);

    try {
      const response = await apiClient.getProjectArtifacts(projectId);
      const artifacts = response?.artifacts ?? [];
      const fileRef = artifacts
        .flatMap((artifact: any) => artifact.fileRefs || [])
        .find((ref: any) =>
          ['pdf', 'presentation', 'dashboard', 'csv'].includes(ref?.type || '') || ref?.url
        );

      if (fileRef?.url) {
        window.open(fileRef.url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Artifacts are still generating. Please check back shortly.');
      }
    } catch (error: any) {
      const message = error?.message || 'Failed to download artifacts.';
      toast({
        title: "Download unavailable",
        description: message,
        variant: "destructive"
      });
    } finally {
      setArtifactLoading(false);
    }
  };

  // Phase 3 - Task 3.3: Checkpoint handlers
  // FIX Phase 3: Remove hardcoded delay by using async/await properly
  // UPDATED: Integrated with U2A2A2U workflow approval
  const handleCheckpointApprove = async (feedback?: string) => {
    console.log('Analysis plan approved', feedback ? `with feedback: ${feedback}` : '');

    // Store approval decision in project history (SSOT)
    try {
      const history = journeyProgress?.checkpointHistory || [];
      const newRecord = {
        timestamp: new Date().toISOString(),
        type: 'approval' as const,
        feedback: feedback || '',
        analysesSelected: selectedAnalyses
      };

      await updateProgressAsync({
        checkpointHistory: [...history, newRecord]
      });
      console.log('✅ [Phase 3 Fix] Checkpoint history updated');
    } catch (error) {
      console.error('Failed to update checkpoint history:', error);
    }

    // =====================================================
    // U2A2A2U WORKFLOW APPROVAL
    // =====================================================
    // If we have a workflow checkpoint, continue the U2A2A2U workflow
    if (workflowCheckpointId) {
      console.log('🔄 [U2A2A2U] Continuing workflow after checkpoint approval');
      await handleWorkflowApproval(true, feedback);
    } else {
      // Legacy path: Direct execution (not using U2A2A2U)
      console.log('⚡ [Legacy] Direct execution without U2A2A2U workflow');
      setCheckpointApproved(true);
      setShowCheckpoint(false);
      handleExecuteAnalysis();
    }
  };

  const handleCheckpointModify = (modifications: string) => {
    console.log('Modification requested:', modifications);
    setShowCheckpoint(false);
    // Store modification request (SSOT)
    try {
      const history = journeyProgress?.checkpointHistory || [];
      const newRecord = {
        timestamp: new Date().toISOString(),
        type: 'modification' as const,
        modifications,
        analysesSelected: selectedAnalyses
      };

      updateProgress({
        checkpointHistory: [...history, newRecord]
      });
    } catch (error) {
      console.error('Failed to update checkpoint history:', error);
    }

    // Reset workflow checkpoint if we're modifying
    if (workflowCheckpointId) {
      setWorkflowCheckpointId(null);
      setWorkflowStatus('idle');
      setWorkflowPhases([]);
    }

    toast({
      title: "Modification Requested",
      description: "Please adjust your analysis selection and try again.",
    });
  };

  const handleCheckpointClose = () => {
    setShowCheckpoint(false);

    // If closing during U2A2A2U workflow, treat as rejection
    if (workflowCheckpointId && workflowStatus === 'awaiting_approval') {
      handleWorkflowApproval(false, 'User closed checkpoint dialog');
    }
  };

  // For non-tech, selecting a scenario toggles it and accumulates analyses
  const handleSelectScenario = (scenarioId: string) => {
    setSelectedScenario(prev => {
      const isCurrentlySelected = prev.includes(scenarioId);
      const newSelection = isCurrentlySelected
        ? prev.filter(id => id !== scenarioId)
        : [...prev, scenarioId];

      // Accumulate analyses from all selected scenarios
      const allSelectedPresets = newSelection
        .map(id => suggestedScenarios.find(s => s.id === id) || scenarioPresets.find(s => s.id === id))
        .filter(Boolean);

      const accumulatedAnalyses = [...new Set(allSelectedPresets.flatMap(preset => preset?.analyses || []))];
      setSelectedAnalyses(accumulatedAnalyses);

      return newSelection;
    });

    const preset = (suggestedScenarios.find(s => s.id === scenarioId) || scenarioPresets.find(s => s.id === scenarioId));
    if (preset) {
      // Only scenario presets have examples, suggested scenarios don't
      const presetWithExample = preset as { example?: string };
      if (!scenarioQuestion && presetWithExample.example) setScenarioQuestion(presetWithExample.example);
    }
  };

  const getExecutionStatusIcon = () => {
    switch (executionStatus) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'running':
        return <Zap className="w-5 h-5 text-blue-600 animate-pulse" />;
      case 'configuring':
        return <Settings className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Play className="w-5 h-5 text-gray-600" />;
    }
  };

  const getExecutionStatusText = () => {
    switch (executionStatus) {
      case 'configuring':
        return 'Configuring analysis parameters...';
      case 'running':
        return 'Running analysis...';
      case 'completed':
        return 'Analysis completed successfully!';
      case 'failed':
        return 'Analysis failed. Please try again.';
      default:
        return 'Ready to execute';
    }
  };

  // State for template duration
  const [executeDuration, setExecuteDuration] = useState<string>('<1 minute');

  // Load template duration from API (Task 2.2: Frontend Template Integration)
  useEffect(() => {
    async function loadTemplateDuration() {
      try {
        const templates = await apiClient.getTemplatesByJourneyType(journeyType);
        if (templates?.data && templates.data.length > 0) {
          const template = templates.data[0];
          const executeStep = template.steps?.find((s: any) => s.id === 'execute');
          if (executeStep?.estimatedDuration) {
            setExecuteDuration(`${executeStep.estimatedDuration} minute${executeStep.estimatedDuration === 1 ? '' : 's'}`);
          }
        }
      } catch (error) {
        console.warn('Failed to load template duration from API, using default:', error);
        // Fallback to default if API fails
      }
    }
    if (journeyType) {
      loadTemplateDuration();
    }
  }, [journeyType]);

  // Find correct duration from template (fallback function kept for backwards compatibility)
  function getExecuteDuration(journeyType: string): string {
    return executeDuration; // Use state value from API
  }

  const getEstimatedDuration = () => {
    const totalMinutes = selectedAnalyses.reduce((total, analysisId) => {
      const analysis = analysisOptions.find((opt: { id: string; duration?: string }) => opt.id === analysisId);
      const duration = analysis?.duration || '5 min';
      return total + parseInt(duration.split('-')[0]);
    }, 0);
    return `${totalMinutes}-${totalMinutes + selectedAnalyses.length * 2} minutes`;
  };

  const executionSummary = useMemo(() => {
    if (!executionResults) {
      return {
        totalAnalyses: 0,
        executionTime: '—',
        resultsGenerated: 0,
        qualityScore: 0,
        insightCount: 0,
        recommendationCount: 0,
        datasetCount: 0
      };
    }

    const totalAnalyses = executionResults.analysisTypes?.length
      ?? executionResults.summary?.totalAnalyses
      ?? selectedAnalyses.length;
    const executionTime = executionResults.summary?.executionTime
      ?? (executionResults.executionTimeSeconds ? `${executionResults.executionTimeSeconds}s` : '—');
    const resultsGenerated = executionResults.insightCount
      ?? executionResults.summary?.dataRowsProcessed
      ?? 0;
    const qualityScore = executionResults.qualityScore
      ?? executionResults.summary?.qualityScore
      ?? 0;

    return {
      totalAnalyses,
      executionTime,
      resultsGenerated,
      qualityScore,
      insightCount: executionResults.insightCount ?? executionResults.insights?.length ?? 0,
      recommendationCount: executionResults.recommendationCount ?? executionResults.recommendations?.length ?? 0,
      datasetCount: executionResults.metadata?.datasetCount ?? executionResults.datasetCount ?? 1
    };
  }, [executionResults, selectedAnalyses.length]);

  const previewSummary = useMemo(() => {
    if (!previewData) return null;
    const insightCount = previewData.insightCount ?? previewData.insights?.length ?? 0;
    const recommendationCount = previewData.recommendationCount ?? previewData.recommendations?.length ?? 0;
    const quality = previewData.qualityScore ?? previewData.summary?.qualityScore ?? executionSummary.qualityScore;
    const avgConfidence = previewData.insights?.length
      ? Math.round(
        previewData.insights.reduce(
          (sum: number, insight: any) => sum + (insight.confidence || 60),
          0
        ) / previewData.insights.length
      )
      : quality;

    return {
      insightCount,
      recommendationCount,
      quality,
      avgConfidence,
      duration: previewData.summary?.executionTime ?? executionSummary.executionTime
    };
  }, [previewData, executionSummary]);

  return (
    <div className="space-y-6">
      {/* Phase 3 - Task 3.3: Checkpoint Dialog */}
      <CheckpointDialog
        open={showCheckpoint}
        onClose={handleCheckpointClose}
        onApprove={handleCheckpointApprove}
        onModify={handleCheckpointModify}
        analysisSteps={analysisOptions.filter((a: { id: string }) => selectedAnalyses.includes(a.id))}
        journeyType={journeyType}
        estimatedDuration={selectedAnalyses.length > 0 ? `${selectedAnalyses.length * 5}-${selectedAnalyses.length * 8} minutes` : undefined}
      />

      {/* PHASE 6 FIX: Cost Confirmation Dialog */}
      <Dialog open={showCostConfirmation} onOpenChange={setShowCostConfirmation}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Confirm Analysis Execution
            </DialogTitle>
            <DialogDescription>
              Review the estimated cost before proceeding with analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-gray-600 mb-1">Estimated Cost</p>
              <p className="text-3xl font-bold text-blue-700">
                ${estimatedCost.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <Eye className="w-4 h-4 mt-0.5 text-gray-400" />
                <span>You'll see a <strong>preview</strong> of results after execution</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <Shield className="w-4 h-4 mt-0.5 text-gray-400" />
                <span>Pay after reviewing to unlock <strong>full insights</strong></span>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <Download className="w-4 h-4 mt-0.5 text-gray-400" />
                <span>Includes PDF reports and data exports</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
              Selected analyses: {selectedAnalyses.length} ({selectedAnalyses.join(', ')})
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowCostConfirmation(false);
                setEstimatedCost(0);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowCostConfirmation(false);
                // Re-call handleExecuteAnalysis which will now proceed past the cost check
                handleExecuteAnalysis();
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Execute Analysis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) {
            setPreviewError(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Analysis Preview</DialogTitle>
            <DialogDescription>
              Generated insights and confidence scores from your latest execution.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : previewError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {previewError}
            </div>
          ) : previewData ? (
            <>
              {previewSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Confidence</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.avgConfidence}%</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Insights</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.insightCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Recommendations</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.recommendationCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Quality Score</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.quality}%</p>
                  </div>
                </div>
              )}

              <Separator />

              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2">Key Insights</h4>
                <ScrollArea className="h-64 pr-4">
                  {previewData.insights?.length ? (
                    previewData.insights.map((insight: any, index: number) => (
                      <div key={`insight-${index}`} className="mb-3 rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-900">{insight.title || `Insight ${index + 1}`}</p>
                          <Badge variant="secondary" className="text-xs">
                            {insight.confidence ?? 60}% confidence
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700 mt-2">{insight.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">No insights are available yet.</p>
                  )}
                </ScrollArea>
              </div>

              <Separator className="my-4" />

              <div>
                <h4 className="text-sm font-semibold mb-2">Recommended Actions</h4>
                <ScrollArea className="h-48 pr-4">
                  {previewData.recommendations?.length ? (
                    previewData.recommendations.map((rec: any, index: number) => (
                      <div key={`rec-${index}`} className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-blue-900">{rec.title || `Recommendation ${index + 1}`}</p>
                          <Badge className="text-xs bg-blue-100 text-blue-700">
                            Priority: {rec.priority || 'Medium'}
                          </Badge>
                        </div>
                        <p className="text-sm text-blue-800 mt-2">{rec.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">No recommendations generated yet.</p>
                  )}
                </ScrollArea>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">No preview data is available yet. Run the analysis to generate insights.</p>
          )}
        </DialogContent>
      </Dialog>

      {loadingServerResults && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading latest execution results from the server…</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FIX Phase 3: Add retry option for results loading errors */}
      {resultsError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-red-800">
                <AlertCircle className="w-4 h-4" />
                <span>{resultsError}</span>
              </div>
              <Button
                onClick={() => {
                  setResultsError(null);
                  setLoadingServerResults(true);
                  if (resolvedProjectId) {
                    apiClient.getAnalysisResults(resolvedProjectId)
                      .then((response) => {
                        if (response?.results) {
                          setExecutionResults(response.results);
                        }
                      })
                      .catch((err) => setResultsError(err.message || 'Failed to load results'))
                      .finally(() => setLoadingServerResults(false));
                  }
                }}
                variant="outline"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* REMOVED: Question clarifications section - moved to Verification step */}

      {/* FIX #26: DS Recommendations from Requirements Document */}
      {requirementsDocument?.analysisPath && requirementsDocument.analysisPath.length > 0 && (
        <Card className="border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Brain className="w-6 h-6 text-purple-600" />
              Data Scientist Recommended Analyses
            </CardTitle>
            <CardDescription className="text-purple-700">
              Based on your goals and data, our Data Scientist agent recommends these {requirementsDocument.analysisPath.length} analyses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {requirementsDocument.analysisPath.map((analysis: any, index: number) => (
              <div key={analysis.analysisId || index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-purple-200">
                <Badge variant="outline" className="mt-1 bg-purple-100 text-purple-700 shrink-0">
                  {index + 1}
                </Badge>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm text-gray-900">{analysis.analysisName}</h4>
                    <Badge className="bg-blue-100 text-blue-800 text-xs">
                      ~{analysis.estimatedDuration || '5-10 min'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{analysis.description}</p>
                  {analysis.techniques && analysis.techniques.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {analysis.techniques.slice(0, 3).map((technique: any, idx: number) => {
                        // Handle both string and object format
                        const techniqueName = typeof technique === 'string'
                          ? technique
                          : (technique.name || technique.technique || technique.type || 'Unknown');
                        return (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {techniqueName}
                          </Badge>
                        );
                      })}
                      {analysis.techniques.length > 3 && (
                        <Badge variant="secondary" className="text-xs">+{analysis.techniques.length - 3} more</Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {requirementsDocument.questionAnswerMapping && requirementsDocument.questionAnswerMapping.length > 0 && (
              <div className="mt-4 p-3 bg-purple-100/50 rounded-lg border border-purple-200">
                <p className="text-sm font-medium text-purple-900 mb-2">
                  {requirementsDocument.questionAnswerMapping.length} question(s) linked to these analyses
                </p>
                <ul className="space-y-1">
                  {requirementsDocument.questionAnswerMapping.slice(0, 3).map((mapping: any, idx: number) => (
                    <li key={idx} className="text-xs text-purple-800 flex items-start gap-2">
                      <span className="text-purple-600">•</span>
                      <span>{mapping.questionText || mapping.question}</span>
                    </li>
                  ))}
                  {requirementsDocument.questionAnswerMapping.length > 3 && (
                    <li className="text-xs text-purple-600 ml-4">
                      +{requirementsDocument.questionAnswerMapping.length - 3} more questions
                    </li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agent Recommendations Card */}
      {agentRecommendations && (
        <Card className="border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Brain className="w-6 h-6 text-blue-600" />
              🤖 Agent Recommendations
            </CardTitle>
            <CardDescription className="text-blue-700">
              Our AI agents analyzed your data and generated these intelligent recommendations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Data Analysis Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Files Analyzed</p>
                <p className="text-lg font-bold text-blue-900">{agentRecommendations.filesAnalyzed || 0}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Total Records</p>
                <p className="text-lg font-bold text-blue-900">{agentRecommendations.expectedDataSize?.toLocaleString() || 0}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Data Quality</p>
                <div className="flex items-center gap-1">
                  <p className="text-lg font-bold text-blue-900">{agentRecommendations.dataQuality || 0}%</p>
                  <Badge variant={agentRecommendations.dataQuality >= 90 ? "default" : "secondary"} className="text-xs">
                    {agentRecommendations.dataQuality >= 90 ? 'Excellent' : agentRecommendations.dataQuality >= 70 ? 'Good' : 'Fair'}
                  </Badge>
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Complexity</p>
                <Badge className={
                  agentRecommendations.analysisComplexity === 'low' ? 'bg-green-100 text-green-800' :
                    agentRecommendations.analysisComplexity === 'medium' ? 'bg-blue-100 text-blue-800' :
                      agentRecommendations.analysisComplexity === 'high' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                }>
                  {agentRecommendations.analysisComplexity?.toUpperCase() || 'N/A'}
                </Badge>
              </div>
            </div>

            {/* Recommended Analyses */}
            {agentRecommendations.recommendedAnalyses && agentRecommendations.recommendedAnalyses.length > 0 && (
              <div className="p-4 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-gray-900">
                    {agentRecommendations.recommendedAnalyses.length} Recommended Analyses
                  </p>
                </div>
                <ul className="space-y-2">
                  {agentRecommendations.recommendedAnalyses.map((analysis: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="mt-0.5 flex-shrink-0">{i + 1}</Badge>
                      <span className="text-gray-700">{analysis}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cost & Time Estimates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <p className="text-xs font-medium text-gray-600">Estimated Time</p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{agentRecommendations.timeEstimate || 'N/A'}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="w-4 h-4 bg-green-600 p-0" />
                  <p className="text-xs font-medium text-gray-600">Estimated Cost</p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{agentRecommendations.costEstimate || 'N/A'}</p>
              </div>
            </div>

            {/* Rationale */}
            {agentRecommendations.rationale && (
              <div className="p-4 bg-blue-100/50 rounded-lg border border-blue-300">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-5 h-5 text-blue-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900 mb-1">Why these recommendations?</p>
                    <p className="text-sm text-blue-800">{agentRecommendations.rationale}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Toggle to use manual configuration */}
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-200">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">Using Agent Recommendations</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUseAgentConfig(!useAgentConfig)}
                className="text-xs"
              >
                {useAgentConfig ? 'Customize Configuration' : 'Use Agent Config'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Analysis Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {journeyType === 'business' && selectedBusinessTemplates.length > 0
              ? 'Business Template Analysis Steps'
              : agentRecommendations
                ? 'Recommended Analyses'
                : 'Analysis Plan'}
          </CardTitle>
          <CardDescription>
            {agentRecommendations
              ? 'These analyses were selected based on your goals from the Plan step.'
              : journeyType === 'non-tech'
                ? 'These analyses were recommended based on your goals. To change them, go back to the Plan step.'
                : journeyType === 'business' && selectedBusinessTemplates.length > 0
                  ? 'Pre-configured workflow steps for your selected business templates.'
                  : 'Analyses to run on your data based on your Plan configuration.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {journeyType === 'business' && (selectedBusinessTemplates.length > 0 || primaryBusinessTemplate) && (
              <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-5 h-5 text-green-700" />
                  <span className="font-semibold text-green-900">Business Templates Active</span>
                </div>
                <p className="text-sm text-green-800 mb-2">
                  The workflow steps below are tailored for your selected business templates:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedBusinessTemplates.map(templateId => (
                    <Badge key={templateId} variant="secondary" className="bg-green-100 text-green-800 border border-green-300">
                      {templateId.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {/* CONSISTENCY: Show locked requirements indicator */}
            {recommendedCount > 0 && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    <strong>{recommendedCount} analyses recommended</strong> based on your goals in the Prepare step.
                    These will remain consistent throughout your journey.
                  </span>
                </p>
              </div>
            )}

            <div className="grid gap-3">
              {analysisOptions.map((analysis: any) => {
                const recommendation = smartRecommendations.find(r => r.type === analysis.id.replace('-', '_'));
                // CONSISTENCY: Check both smartRecommendations AND locked requirements
                const isFromSmartRec = !!recommendation;
                const isFromLockedReqs = analysis.isRecommended === true;
                const isRecommended = isFromSmartRec || isFromLockedReqs;

                return (
                  <div
                    key={analysis.id}
                    className={`p-4 border rounded-lg transition-all ${selectedAnalyses.includes(analysis.id)
                      ? 'border-blue-500 bg-blue-50'
                      : isFromLockedReqs
                        ? 'border-green-300 bg-green-50/30'  // Green for locked recommendations
                        : isRecommended
                          ? 'border-blue-300 bg-blue-50/30'
                          : 'border-gray-200 bg-gray-50/50'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">{analysis.name}</h4>
                          <Badge variant="outline" className="text-xs">
                            {analysis.duration}
                          </Badge>
                          {isFromLockedReqs && (
                            <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200">
                              ✓ From Your Goals
                            </Badge>
                          )}
                          {isFromSmartRec && !isFromLockedReqs && (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200">
                              AI Recommended
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{analysis.description}</p>
                        {isFromSmartRec && (
                          <p className="text-xs text-blue-700 mt-1 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3" />
                            {recommendation?.reason}
                          </p>
                        )}
                      </div>
                      {selectedAnalyses.includes(analysis.id) && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedAnalyses.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      {selectedAnalyses.length} analysis{selectedAnalyses.length > 1 ? 'es' : ''} will run
                    </p>
                    <p className="text-xs text-blue-700">
                      Estimated duration: {getEstimatedDuration()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      To modify analysis selection, return to the Plan step.
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    Ready to execute
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Journey-specific Configuration */}
      {journeyType === 'non-tech' && selectedAnalyses.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Brain className="w-5 h-5" />
              AI Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700 mb-3">
              Our AI will automatically configure optimal parameters for your selected analyses:
            </p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Best statistical methods for your data type</li>
              <li>Optimal visualization styles</li>
              <li>Automated insight generation</li>
              <li>Plain English explanations</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {journeyType === 'technical' && selectedAnalyses.length > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Settings className="w-5 h-5" />
              Advanced Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-700 mb-3">
              Advanced configuration options available:
            </p>
            <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
              <li>Custom statistical parameters</li>
              <li>Machine learning algorithms</li>
              <li>Cross-validation settings</li>
              <li>Feature selection methods</li>
            </ul>
            <Button variant="outline" size="sm" className="mt-3 border-purple-300 text-purple-700 hover:bg-purple-100">
              Configure Advanced Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Execution Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {getExecutionStatusIcon()}
                Analysis Execution
              </CardTitle>
              <CardDescription>
                {getExecutionStatusText()}
              </CardDescription>
            </div>
            {/* Subscription & Quota Status */}
            <QuotaStatusIndicator
              featureId="statistical_analysis"
              complexity="small"
              className="hidden md:flex"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Billing/Subscription Error Banners */}
            {billingError?.type === 'TIER_UPGRADE_REQUIRED' && (
              <SubscriptionRequiredBanner
                message={billingError.message}
                minimumTier={billingError.minimumTier}
                onUpgrade={() => {
                  setBillingError(null);
                  window.location.href = billingError.options?.upgradeTier?.url || '/billing/upgrade';
                }}
              />
            )}

            {billingError?.type === 'QUOTA_EXCEEDED' && (
              <QuotaExceededBanner
                quotaStatus={billingError.quotaStatus}
                options={billingError.options}
                onUpgrade={() => {
                  setBillingError(null);
                  window.location.href = billingError.options?.upgradeTier?.url || '/billing/upgrade';
                }}
                onPayOverage={() => {
                  setBillingError(null);
                  if (billingError.options?.payOverage?.url) {
                    window.location.href = billingError.options.payOverage.url;
                  }
                }}
                onPayPerProject={() => {
                  setBillingError(null);
                  window.location.href = billingError.options?.payPerProject?.url || `/projects/${projectId}/payment`;
                }}
              />
            )}

            {billingError?.type === 'PAYMENT_REQUIRED' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-800">Payment Required</h4>
                    <p className="text-sm text-blue-700 mt-1">{billingError.message}</p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() => {
                          setBillingError(null);
                          window.location.href = billingError.options?.payPerProject?.url || `/projects/${projectId}/payment`;
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Pay for Analysis
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBillingError(null);
                          window.location.href = '/billing/subscribe';
                        }}
                      >
                        Subscribe Instead
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {executionStatus === 'idle' && !billingError && (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  Select analyses above to begin execution
                </p>
                <Button
                  onClick={() => {
                    // FIX: Production Readiness - Show confirmation before auto-selecting defaults
                    if (journeyType === 'non-tech' && selectedAnalyses.length === 0) {
                      const defaults = ['descriptive', 'correlation', 'regression'];
                      // Show what will be selected before executing
                      const confirmed = window.confirm(
                        `No analyses selected. Would you like to run the recommended analyses?\n\n` +
                        `• Descriptive Statistics\n• Correlation Analysis\n• Regression Analysis\n\n` +
                        `Click OK to proceed or Cancel to select manually.`
                      );
                      if (confirmed) {
                        setSelectedAnalyses(defaults);
                        // Delay execute slightly to allow state update
                        setTimeout(() => handleExecuteAnalysis(), 50);
                      }
                      return;
                    }
                    handleExecuteAnalysis();
                  }}
                  disabled={journeyType !== 'non-tech' ? selectedAnalyses.length === 0 : false}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Execute Analysis
                </Button>
              </div>
            )}

            {(executionStatus === 'configuring' || executionStatus === 'running') && (
              <ExecutionProgressTracker
                executionState={executionState}
                projectId={resolvedProjectId || undefined}
                onStateChange={setExecutionState}
              />
            )}

            {/* FIX Phase 3: Add proper error recovery UI for failed execution */}
            {executionStatus === 'failed' && (
              <div className="space-y-4">
                <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertCircle className="w-5 h-5" />
                      <div>
                        <span className="font-semibold">Analysis Execution Failed</span>
                        <p className="text-sm mt-1">{executionState.error || 'An unexpected error occurred. Please try again.'}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        // Reset state and allow retry
                        setExecutionState({
                          status: 'idle',
                          overallProgress: 0,
                          currentStep: { id: 'init', name: 'Ready to Retry', status: 'pending', description: 'Click Execute Analysis to try again...' },
                          completedSteps: [],
                          pendingSteps: [],
                          analysisTypes: selectedAnalyses,
                          startedAt: new Date().toISOString(),
                          executionId: '',
                          projectId: resolvedProjectId || '',
                          totalSteps: 0,
                          error: undefined
                        });
                        toast({
                          title: "Ready to Retry",
                          description: "Click 'Execute Analysis' to try again."
                        });
                      }}
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-100"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                  <div className="mt-3 text-sm text-red-700">
                    <p><strong>Troubleshooting tips:</strong></p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Ensure your data has been properly uploaded and verified</li>
                      <li>Check that at least one analysis type is selected</li>
                      <li>Try refreshing the page and re-running the analysis</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {executionStatus === 'completed' && executionResults && (
              <div className="space-y-4">
                {/* Server Validation Status */}
                {validationStatus === 'validated' && (
                  <div className="p-3 bg-green-50 border-2 border-green-300 rounded-lg">
                    <div className="flex items-center gap-2 text-green-800">
                      <ShieldCheck className="w-5 h-5" />
                      <span className="font-semibold">✅ Results Verified</span>
                      <span className="text-sm">- Server has validated your execution results for pricing</span>
                    </div>
                  </div>
                )}

                {validationStatus === 'validating' && (
                  <div className="p-3 bg-blue-50 border border-blue-300 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-800">
                      <Shield className="w-5 h-5 animate-pulse" />
                      <span className="font-semibold">Validating results with server...</span>
                    </div>
                  </div>
                )}

                {/* FIX Phase 3: Add retry button for validation failures */}
                {validationStatus === 'failed' && (
                  <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-semibold">Validation Failed</span>
                        <span className="text-sm">- Results could not be verified with server</span>
                      </div>
                      <Button
                        onClick={() => {
                          setValidationStatus('validating');
                          // Re-trigger validation by fetching results again
                          if (resolvedProjectId) {
                            apiClient.getAnalysisResults(resolvedProjectId)
                              .then(() => setValidationStatus('validated'))
                              .catch(() => setValidationStatus('failed'));
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="border-red-300 text-red-700 hover:bg-red-100"
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Retry Validation
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.totalAnalyses}</p>
                    <p className="text-sm text-green-700">Analyses Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.executionTime}</p>
                    <p className="text-sm text-green-700">Execution Time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.resultsGenerated}</p>
                    <p className="text-sm text-green-700">Results Generated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.qualityScore}%</p>
                    <p className="text-sm text-green-700">Quality Score</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={handlePreviewResults}
                    disabled={previewLoading || (!executionResults && executionStatus !== 'completed')}
                  >
                    {previewLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    Preview Results
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={handleDownloadArtifacts}
                    disabled={artifactLoading}
                  >
                    {artifactLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download Report
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Execution Summary */}
      {executionStatus === 'completed' && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Analysis Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-800 font-medium mb-3">
              ✅ Your analysis has been completed successfully! Results are ready for review and pricing.
            </p>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionSummary.totalAnalyses} analyses completed
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionSummary.resultsGenerated} results generated
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionSummary.qualityScore}% quality score
              </Badge>
            </div>

            {/* P1-3 FIX: Artifact Generation Status Indicator */}
            <div className="mb-4 p-3 rounded-md border bg-white">
              <div className="flex items-center gap-2">
                {artifactStatus === 'generating' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="text-sm text-blue-800 font-medium">
                      Generating artifacts ({artifactPollCount}/{MAX_ARTIFACT_POLLS})...
                    </span>
                    {artifacts.length > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {artifacts.filter((a: any) => a.status === 'ready' || a.status === 'completed').length}/{artifacts.length} ready
                      </Badge>
                    )}
                  </>
                )}
                {artifactStatus === 'ready' && (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-800 font-medium">
                      {artifacts.length} artifact(s) ready for download
                    </span>
                  </>
                )}
                {artifactStatus === 'error' && (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-800 font-medium">
                      Artifact generation timed out. Check Results page later.
                    </span>
                  </>
                )}
                {artifactStatus === 'idle' && artifacts.length === 0 && (
                  <>
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">
                      Artifacts will be generated shortly...
                    </span>
                  </>
                )}
              </div>
              {/* Show available artifacts */}
              {artifacts.length > 0 && artifactStatus === 'ready' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {artifacts.map((artifact: any) => (
                    <Badge
                      key={artifact.id}
                      variant="outline"
                      className="text-xs bg-blue-50 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-100"
                      title={`Type: ${artifact.type}`}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {artifact.type}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {onNext && (
              <Button
                onClick={async () => {
                  // Validate project exists
                  if (!projectId) {
                    toast({
                      title: "Project Not Found",
                      description: "No project ID found. Please go back to previous step.",
                      variant: "destructive"
                    });
                    return;
                  }

                  // Validate execution is completed
                  if (executionStatus !== 'completed') {
                    toast({
                      title: "Execution Not Complete",
                      description: "Please wait for execution to complete before continuing.",
                      variant: "destructive"
                    });
                    return;
                  }

                  // Mark step as complete and save execution data
                  try {
                    updateProgress({
                      currentStep: 'pricing',
                      completedSteps: [...(journeyProgress?.completedSteps || []), 'execute'],
                      executionCompletedAt: new Date().toISOString(),
                      executionId: executionState.executionId || journeyProgress?.executionId,
                      executionSummary: journeyProgress?.executionSummary || (executionResults ? {
                        totalAnalyses: executionState.analysisTypes?.length || 0,
                        resultsGenerated: executionResults?.results?.length || 0,
                        datasetCount: 1, // Could be enhanced with actual count
                      } : undefined),
                      stepTimestamps: {
                        ...(journeyProgress?.stepTimestamps || {}),
                        executeCompleted: new Date().toISOString()
                      }
                    });

                    // Navigate to next step
                    if (onNext) {
                      onNext();
                    }
                  } catch (error: any) {
                    console.error('Failed to save execute step progress:', error);
                    toast({
                      title: "Error Saving Progress",
                      description: error.message || "Failed to save step completion. Please try again.",
                      variant: "destructive"
                    });
                  }
                }}
                className="bg-green-600 hover:bg-green-700 w-full"
                size="lg"
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>
                    Continue to Billing & Payment
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {projectId && (
        <div className="mt-6">
          <AgentCheckpoints projectId={projectId} />
        </div>
      )}

      {/* Navigation Buttons */}
      {(onNext || onPrevious) && (
        <div className="flex items-center justify-between pt-4 border-t">
          {onPrevious && (
            <Button variant="outline" onClick={onPrevious}>
              Previous Step
            </Button>
          )}
          {onNext && executionStatus === 'completed' && (
            <Button
              onClick={async () => {
                // Validate project exists
                if (!projectId) {
                  toast({
                    title: "Project Not Found",
                    description: "No project ID found. Please go back to previous step.",
                    variant: "destructive"
                  });
                  return;
                }

                // Mark step as complete and save execution data
                try {
                  updateProgress({
                    currentStep: 'pricing',
                    completedSteps: [...(journeyProgress?.completedSteps || []), 'execute'],
                    executionCompletedAt: new Date().toISOString(),
                    executionId: executionState.executionId || journeyProgress?.executionId,
                    executionSummary: journeyProgress?.executionSummary || (executionResults ? {
                      totalAnalyses: executionState.analysisTypes?.length || 0,
                      resultsGenerated: executionResults?.results?.length || 0,
                      datasetCount: 1,
                    } : undefined),
                    stepTimestamps: {
                      ...(journeyProgress?.stepTimestamps || {}),
                      executeCompleted: new Date().toISOString()
                    }
                  });

                  // Navigate to next step
                  if (onNext) {
                    onNext();
                  }
                } catch (error: any) {
                  console.error('Failed to save execute step progress:', error);
                  toast({
                    title: "Error Saving Progress",
                    description: error.message || "Failed to save step completion. Please try again.",
                    variant: "destructive"
                  });
                }
              }}
              className="ml-auto bg-blue-600 hover:bg-blue-700"
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  Continue to Billing & Payment
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}