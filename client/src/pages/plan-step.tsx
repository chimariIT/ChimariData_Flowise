import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Database,
  BarChart3,
  Brain,
  Clock,
  DollarSign,
  Users,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Eye,
  Settings,
  Sparkles,
  ArrowRight,
  RefreshCw,
  XCircle,
  Info,
  MessageCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
// FIX: Production Readiness - Import useProject for SSOT journey progress
import { useProject } from "@/hooks/useProject";
import type {
  DataAssessment,
  AnalysisStep,
  VisualizationSpec,
  MLModelSpec,
  CostBreakdown,
  AgentContribution
} from "@shared/schema";

interface PlanStepProps {
  projectId?: string;
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean;
}

// Per-analysis breakdown item (Phase 4 - Jan 2026)
interface AnalysisBreakdownItem {
  analysisId: string;
  analysisName: string;
  analysisType: string;
  techniques: string[];
  requiredElements: string[];
  estimatedDuration: string;
  dependencies: string[];
  status: string;
  description: string;
  expectedOutputs: string[];
}

interface AnalysisPlan {
  id: string;
  projectId: string;
  version: number;
  status: string;
  executiveSummary: string;
  dataAssessment: DataAssessment;
  analysisSteps: AnalysisStep[];
  visualizations: VisualizationSpec[];
  businessContext: any;
  mlModels: MLModelSpec[];
  estimatedCost: CostBreakdown;
  estimatedDuration: string;
  complexity: string;
  risks: string[];
  recommendations: string[];
  agentContributions: Record<string, AgentContribution>;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  modificationsRequested?: string;
  // NEW: Per-analysis breakdown (Phase 4 - Jan 2026)
  analyses?: AnalysisBreakdownItem[];
  totalEstimatedDuration?: string;
  datasetSize?: number;
}

// Expected visualization types per analysis type - helps users understand what they'll get
const ANALYSIS_VISUALIZATION_MAP: Record<string, string[]> = {
  descriptive: ['Distribution histograms', 'Box plots', 'Summary statistics table'],
  correlation: ['Correlation heatmap', 'Scatter plot matrix', 'Top correlations bar chart'],
  regression: ['Scatter plot with regression line', 'Residual plot', 'Coefficient bar chart'],
  clustering: ['Cluster scatter plot', 'Elbow curve', 'Silhouette diagram'],
  time_series: ['Time series line chart', 'Trend decomposition', 'Forecast plot'],
  classification: ['Confusion matrix', 'ROC curve', 'Feature importance bar chart'],
  sentiment: ['Sentiment distribution', 'Word cloud', 'Sentiment over time'],
  business_intelligence: ['KPI dashboard cards', 'Trend indicators', 'Benchmark comparison'],
  visualization: ['Interactive charts', 'Custom dashboards'],
  statistical: ['Hypothesis test results', 'Distribution plots', 'Statistical summary'],
};

function getExpectedVisualizations(analysisType: string): string[] {
  const normalized = analysisType?.toLowerCase().replace(/[\s-]+/g, '_') || '';
  return ANALYSIS_VISUALIZATION_MAP[normalized] ||
    ANALYSIS_VISUALIZATION_MAP[normalized.split('_')[0]] ||
    ['Charts and visual summaries'];
}

export default function PlanStep({
  projectId: propProjectId,
  journeyType,
  onNext,
  onPrevious,
  renderAsContent = false
}: PlanStepProps) {
  const params = useParams();
  // CRITICAL FIX: Check localStorage as fallback (consistent with other steps)
  // JourneyWizard doesn't pass projectId prop, and URL may not have it
  const projectId = propProjectId || params.projectId || localStorage.getItem('currentProjectId') || undefined;
  const { toast } = useToast();

  // FIX: Production Readiness - Use useProject hook for SSOT journey progress
  const { project, journeyProgress, updateProgress, updateProgressAsync, queryClient } = useProject(projectId);

  // State management
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [planProgress, setPlanProgress] = useState<any>(null);
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [modificationsRequested, setModificationsRequested] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [creationStartTime, setCreationStartTime] = useState<number | null>(null);
  const [pendingElapsedMs, setPendingElapsedMs] = useState(0);
  const [requirementsConfirmed, setRequirementsConfirmed] = useState(false);

  // P1-1 FIX: Skip confirmation dialog state
  const [showSkipConfirmDialog, setShowSkipConfirmDialog] = useState(false);

  // Load existing plan or create new one
  useEffect(() => {
    if (projectId) {
      loadPlan();
    } else {
      // CRITICAL FIX: If no projectId, stop loading and show error
      // This prevents infinite "Loading analysis plan..." screen
      setIsLoading(false);
      setPlanError("No project found. Please go back to Data Upload and start a new project.");
      toast({
        title: "Project Not Found",
        description: "No project ID found. Please ensure you have uploaded data before viewing the analysis plan.",
        variant: "destructive"
      });
    }
  }, [projectId]);

  // P1-A FIX: Poll for progress with max poll count and ref-based interval to prevent overlaps
  const pollCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [planPollRetryCount, setPlanPollRetryCount] = useState(0);
  const MAX_PLAN_POLLS = 120; // 60 seconds at 500ms intervals

  useEffect(() => {
    if (plan?.status === 'pending' || isCreatingPlan) {
      // Clear any existing interval before creating new one
      if (intervalRef.current) clearInterval(intervalRef.current);
      pollCountRef.current = 0;
      setPollTimedOut(false);

      intervalRef.current = setInterval(async () => {
        pollCountRef.current++;
        if (pollCountRef.current >= MAX_PLAN_POLLS) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          if (planPollRetryCount < 1) {
            // Auto-retry once before showing manual retry
            console.warn(`⚠️ [Plan] Polling timed out — auto-retrying (attempt ${planPollRetryCount + 1})`);
            setPlanPollRetryCount(prev => prev + 1);
            pollCountRef.current = 0;
            // Re-trigger by force-regenerating the plan
            handleForcePlanRegeneration();
          } else {
            setPollTimedOut(true);
            console.warn(`⚠️ [Plan] Polling timed out after ${MAX_PLAN_POLLS} attempts and auto-retry`);
          }
          return;
        }
        await checkPlanProgress();
      }, 500);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [plan?.status, isCreatingPlan]);

  const loadPlan = async (retryCount: number = 0) => {
    const MAX_RETRIES = 3;
    try {
      setIsLoading(true);
      setPlanError(null);

      // Only set creation start time on first attempt
      if (retryCount === 0) {
        setCreationStartTime(Date.now());
      }

      const response = await apiClient.get(`/api/projects/${projectId}/plan`);

      // Handle both wrapped { success: true, plan } and direct plan responses
      const planData = response?.plan || response?.data?.plan || response?.data;

      if (planData && (planData.id || planData.projectId)) {
        // Gap D: If journeyProgress says plan was approved but plan status disagrees,
        // trust the backend plan status (source of truth) but log the discrepancy.
        // Previously this overrode the status which caused approval button mismatches.
        let enhancedPlanData = planData;
        if (journeyProgress?.planApproved && planData.status !== 'approved') {
          console.warn('📋 [Gap D] journeyProgress says approved but plan status is:', planData.status, '- trusting backend status');
          // Only override to approved if the plan actually has content and user navigated away mid-approval
          if (planData.status === 'ready' && journeyProgress.planApprovedAt) {
            console.log('📋 [Gap D] Plan is ready and was previously approved - restoring approved status');
            enhancedPlanData = {
              ...planData,
              status: 'approved',
              approvedAt: journeyProgress.planApprovedAt
            };
          }
        }
        setPlan(enhancedPlanData);
        if (enhancedPlanData.status !== 'pending') {
          setCreationStartTime(null);
        }
        setPlanError(null);
        console.log('✅ Plan loaded successfully:', enhancedPlanData.id || enhancedPlanData.projectId, 'Status:', enhancedPlanData.status);
      } else {
        // No plan exists, trigger creation
        console.log('📋 No plan found, creating new plan...');
        await createPlan();
      }
    } catch (error: any) {
      // Check if it's a 404 (no plan exists) or other error
      // Use case-insensitive matching for "not found" and "no.*plan.*found"
      const errorMsg = (error?.message || '').toLowerCase();
      const is404 = error?.response?.status === 404 ||
                    errorMsg.includes('404') ||
                    errorMsg.includes('not found') ||
                    errorMsg.includes('no analysis plan found');

      if (is404) {
        // No plan exists, trigger creation
        console.log('📋 Plan not found (404), creating new plan...');
        await createPlan();
      } else if (retryCount < MAX_RETRIES) {
        // Retry on non-404 errors up to MAX_RETRIES times
        console.warn(`⚠️ Error loading plan (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return loadPlan(retryCount + 1);
      } else {
        console.error('❌ Error loading plan after', MAX_RETRIES, 'retries:', error);
        setPlanError(error.message || "Failed to load analysis plan");
        setCreationStartTime(null);
        toast({
          title: "Error Loading Plan",
          description: error.message || "Failed to load analysis plan after multiple attempts. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      // ✅ ALWAYS reset loading state to prevent infinite loading
      setIsLoading(false);
    }
  };

  const createPlan = async () => {
    try {
      setIsCreatingPlan(true);
      setPlanError(null);
      setCreationStartTime(Date.now());
      toast({
        title: "Creating Analysis Plan",
        description: "Coordinating with Data Engineer, Data Scientist, and Business Expert agents...",
      });

      // ✅ SLA: Client-side timeout (30 seconds - matches server timeout for <1 minute journey lifecycle)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30 * 1000);

      try {
        const response = await apiClient.post(`/api/projects/${projectId}/plan/create`, {}, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response?.success) {
          console.log('✅ Plan creation initiated successfully');

          // If plan was created immediately, load it
          if (response.planId && response.plan) {
            setPlan(response.plan);
            setCreationStartTime(null);
            toast({
              title: "Analysis Plan Ready",
              description: "Your analysis plan has been created and is ready for review.",
            });
          } else if (response.planId) {
            // Plan creation initiated, poll until ready
            console.log('📋 Plan creation in progress, polling for updates...');
            // Start polling via the useEffect hook
          } else {
            // No planId returned, wait for polling to find it
            console.log('📋 Plan creation in progress, waiting for completion...');
          }
        } else {
          throw new Error(response?.error || 'Plan creation returned no data');
        }
      } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          throw new Error('Plan creation timed out after 30 seconds. Please try again or contact support if the issue persists.');
        }
        throw error;
      }
    } catch (error: any) {
      console.error('❌ Plan creation failed:', error);
      setPlanError(error.response?.data?.error || error.message || "Failed to create analysis plan");
      setCreationStartTime(null);
      setIsCreatingPlan(false);
      setIsLoading(false);
      toast({
        title: "Error Creating Plan",
        description: error.response?.data?.error || error.message || "Failed to create analysis plan",
        variant: "destructive"
      });
    }
  };

  const checkPlanProgress = async () => {
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/plan/progress`);

      if (response?.success) {
        setPlanProgress(response.progress);

        // If plan is ready, reload full plan
        if (response.progress?.status === 'ready') {
          await loadPlan();
          setIsCreatingPlan(false);
          setCreationStartTime(null);
        }

        // ✅ FIX: Check for all failure statuses including 'rejected' (which backend uses on error)
        const failureStatuses = ['failed', 'error', 'rejected', 'cancelled'];
        if (failureStatuses.includes(response.progress?.status)) {
          console.log(`❌ [Plan Progress] Plan creation failed with status: ${response.progress?.status}`);
          setIsCreatingPlan(false);
          setCreationStartTime(null);
          const errorMessage = response.progress?.error ||
                              response.progress?.rejectionReason ||
                              `Plan creation ${response.progress?.status}. Please retry.`;
          setPlanError(errorMessage);
          toast({
            title: "Plan Creation Failed",
            description: errorMessage,
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      // Silently fail progress checks to avoid spamming the user
      console.error('Progress check failed:', error);
    }
  };

  useEffect(() => {
    if (plan?.status === 'pending' && !creationStartTime) {
      const createdAt = plan?.createdAt ? new Date(plan.createdAt).getTime() : Date.now();
      setCreationStartTime(createdAt);
    } else if (plan && plan.status !== 'pending' && creationStartTime) {
      setCreationStartTime(null);
    }

    if (!plan && !isCreatingPlan) {
      setCreationStartTime(null);
    }
  }, [plan, creationStartTime, isCreatingPlan]);

  useEffect(() => {
    if (!creationStartTime) {
      setPendingElapsedMs(0);
      return;
    }

    const updateElapsed = () => setPendingElapsedMs(Date.now() - creationStartTime);
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [creationStartTime]);

  useEffect(() => {
    setRequirementsConfirmed(false);
  }, [plan?.id]);

  // ✅ Plan is stuck if it's been pending for more than 45 seconds (30s + 15s buffer)
  const isPlanStuck = creationStartTime !== null && pendingElapsedMs > 45_000;

  // ✅ Auto-detect stuck plans and offer recovery after 60 seconds
  useEffect(() => {
    if (isPlanStuck && pendingElapsedMs > 60_000 && (plan?.status === 'pending' || isCreatingPlan)) {
      console.warn('⚠️  Plan creation stuck for >60 seconds, suggesting retry');
      toast({
        title: "Plan Creation Delayed",
        description: "Plan creation is taking longer than expected. Please try the Retry button below.",
        variant: "destructive"
      });
    }
  }, [isPlanStuck, pendingElapsedMs, plan?.status, isCreatingPlan]);
  const requiredDataFields = useMemo(() => {
    if (!plan) return [];

    // ✅ PHASE 2 FIX: First check plan.metadata.requiredDataElements (from requirementsDocument)
    // This is the primary source of truth set by the PM Agent
    const metadataElements = (plan as any).metadata?.requiredDataElements || [];
    if (metadataElements.length > 0) {
      // Extract element names from the structured requiredDataElements
      return metadataElements.map((el: any) =>
        el.elementName || el.name || el.sourceColumn || el.sourceField || 'Unknown Element'
      );
    }

    // Fallback: Extract from analysis step inputs, visualizations, and ML models
    const stepInputs = plan.analysisSteps?.flatMap(step => step.inputs || []) ?? [];
    const vizFields = plan.visualizations?.flatMap(viz => viz.dataFields || []) ?? [];
    const mlFields = plan.mlModels?.flatMap(model => {
      const features = Array.isArray(model.features) ? model.features : [];
      return [model.targetVariable, ...features];
    }) ?? [];

    const rawIds = [...stepInputs, ...vizFields, ...mlFields].filter(Boolean);

    // ✅ PHASE 11 FIX: Build element ID to name mapping from journeyProgress.requirementsDocument
    // TASK 3 FIX: Use plan.metadata as fallback if journeyProgress.requirementsDocument is missing
    const requirementsDoc = (journeyProgress as any)?.requirementsDocument;
    const elementMap = new Map<string, string>();
    const requirementsElements = requirementsDoc?.requiredDataElements
      || (plan as any)?.metadata?.requiredDataElements // TASK 3 FIX: Fallback to plan.metadata
      || [];

    if (!requirementsDoc?.requiredDataElements && (plan as any)?.metadata?.requiredDataElements?.length > 0) {
      console.log(`📋 [TASK 3 FIX] Using ${(plan as any).metadata.requiredDataElements.length} elements from plan.metadata fallback`);
    }

    requirementsElements.forEach((el: any) => {
      if (el.elementId) {
        elementMap.set(el.elementId, el.elementName || el.name || el.elementId);
      }
      // Also map by name for duplicate prevention
      if (el.elementName) {
        elementMap.set(el.elementName, el.elementName);
      }
    });

    // Map IDs to names using the lookup, fall back to original if not found
    const mappedFields = rawIds.map(id => {
      // Check if this is an element ID that we can resolve
      if (elementMap.has(id)) {
        return elementMap.get(id)!;
      }
      // Filter out obvious element IDs (elem-XXXX pattern) that weren't resolved
      if (id.startsWith('elem-')) {
        console.warn(`⚠️ [Plan] Unresolved element ID: ${id}`);
        return null; // Will be filtered out
      }
      return id;
    }).filter(Boolean) as string[];

    return Array.from(new Set(mappedFields));
  }, [plan, journeyProgress]);

  // P3-3: Question-to-Analysis Mapping
  // Build lookup: analysisId/type → questions it addresses
  const questionsByAnalysis = useMemo(() => {
    const mapping = new Map<string, { questionText: string; confidence?: number }[]>();
    // TASK 3 FIX: Use plan.metadata as fallback for questionAnswerMapping
    const qaMapping = (journeyProgress as any)?.requirementsDocument?.questionAnswerMapping ||
                      (journeyProgress as any)?.questionAnswerMapping ||
                      (plan as any)?.metadata?.questionAnswerMapping || // TASK 3 FIX: Fallback to plan.metadata
                      [];
    if (qaMapping.length === 0) return mapping;

    for (const qa of qaMapping) {
      const analysisIds = qa.analysisIds || qa.recommendedAnalyses || [];
      for (const analysisRef of analysisIds) {
        const key = typeof analysisRef === 'string' ? analysisRef : analysisRef?.analysisId || '';
        if (!key) continue;
        if (!mapping.has(key)) mapping.set(key, []);
        mapping.get(key)!.push({
          questionText: qa.questionText || qa.question || '',
          confidence: qa.confidence
        });
      }
    }
    return mapping;
  }, [journeyProgress]);

  const missingDataSignals = plan?.dataAssessment?.missingData ?? [];
  const transformationRecommendations = plan?.dataAssessment?.recommendedTransformations ?? [];
  const businessContext = plan?.businessContext ?? null;

  const handleForcePlanRegeneration = async () => {
    if (isCreatingPlan) return;
    setPlan(null);
    setPlanProgress(null);
    await createPlan();
  };

  const handleApprovePlan = async () => {
    // CRITICAL FIX: Show feedback instead of silent return
    if (!plan) {
      toast({
        title: "No Plan Available",
        description: "Please wait for the analysis plan to be generated before approving.",
        variant: "destructive"
      });
      return;
    }
    if (!requirementsConfirmed) {
      toast({
        title: "Confirm data requirements",
        description: "Please check the checkbox to confirm the required data elements before approving the plan.",
        variant: "destructive"
      });
      return;
    }

    // P1-3 FIX: Validate plan has at least one analysis step
    const hasAnalyses = (plan.analyses && plan.analyses.length > 0) ||
      (plan.analysisSteps && plan.analysisSteps.length > 0);
    if (!hasAnalyses) {
      toast({
        title: "No Analyses in Plan",
        description: "The plan must contain at least one analysis step before it can be approved. Please regenerate the plan or add analysis steps.",
        variant: "destructive"
      });
      return;
    }

    // Guard against approving a plan with no cost locked (prevents checkout mismatch later)
    const estimatedTotal = plan.estimatedCost?.total ?? 0;
    const fallbackTotal = Object.values(plan.estimatedCost?.breakdown || {}).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
    if ((estimatedTotal || fallbackTotal) <= 0) {
      toast({
        title: "Cost Not Ready",
        description: "We could not find a valid cost estimate for this plan. Please regenerate the plan to refresh pricing before approval.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      // P2-3 FIX: Include per-analysis breakdown in approval to persist it
      const analysisBreakdown = plan.analyses?.map((a: any) => ({
        analysisId: a.analysisId || a.id,
        analysisName: a.analysisName || a.name,
        analysisType: a.analysisType || a.type,
        estimatedCost: a.estimatedCost,
        estimatedDuration: a.estimatedDuration,
        requiredDataElements: a.requiredDataElements || []
      })) || plan.analysisSteps?.map((s: any) => ({
        analysisId: s.id || s.name,
        analysisName: s.name,
        analysisType: s.type || 'statistical',
        estimatedDuration: s.estimatedDuration
      })) || [];

      const response = await apiClient.post(`/api/projects/${projectId}/plan/${plan.id}/approve`, {
        analysisBreakdown
      });

      if (response?.success) {
        toast({
          title: "Plan Approved",
          description: "Your analysis plan has been approved and is ready for execution.",
        });

        setPlan({ ...plan, status: 'approved', approvedAt: new Date().toISOString() });

        // FIX: Production Readiness - Update journeyProgress SSOT with plan approval
        // Uses schema-defined fields: analysisPlanId, planApprovedAt
        // Mark step as complete and advance to next step
        // FIX: Use async version and await before navigation to prevent race condition
        try {
          await updateProgressAsync({
            currentStep: 'execute',
            completedSteps: [...(journeyProgress?.completedSteps || []), 'plan'],
            analysisPlanId: plan.id,
            planApprovedAt: new Date().toISOString(),
            planApproved: true,
            stepTimestamps: {
              ...(journeyProgress?.stepTimestamps || {}),
              planCompleted: new Date().toISOString()
            }
          });

          // Force cache refresh before navigation
          await queryClient.refetchQueries({ queryKey: ["project", projectId] });

          // Verify approval was actually persisted in database
          const refreshedData = queryClient.getQueryData(["project", projectId]) as any;
          const refreshedProgress = refreshedData?.journeyProgress || refreshedData?.project?.journeyProgress;
          if (refreshedProgress && !refreshedProgress.planApproved) {
            console.error('❌ [SSOT] Plan approval write succeeded but verification read shows planApproved=false');
            toast({
              title: "Approval Verification Failed",
              description: "Plan approval could not be confirmed. Please try again.",
              variant: "destructive"
            });
            return;
          }

          console.log('✅ [SSOT] Updated journeyProgress with plan approval and step completion (verified)');
        } catch (progressError) {
          console.error('❌ Failed to update journeyProgress with plan approval:', progressError);
          toast({
            title: "Error Saving Progress",
            description: "Plan approved but failed to save completion status. Please refresh the page.",
            variant: "destructive"
          });
          return;
        }

        // Navigate to next step (only after data is persisted)
        if (onNext) onNext();
      }
    } catch (error: any) {
      toast({
        title: "Error Approving Plan",
        description: error.response?.data?.error || error.message || "Failed to approve analysis plan",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectPlan = async () => {
    // FIX: Validate plan.id exists before making API call
    if (!plan || !plan.id) {
      toast({
        title: "Plan Not Ready",
        description: "The analysis plan is not ready yet. Please wait for it to load completely.",
        variant: "destructive"
      });
      console.error('❌ [Plan Rejection] Cannot reject: plan or plan.id is missing', { plan: !!plan, planId: plan?.id });
      return;
    }

    if (!rejectionReason.trim()) {
      toast({
        title: "Rejection Reason Required",
        description: "Please provide a reason for rejecting the plan.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      console.log(`📋 [Plan Rejection] Submitting rejection for plan ${plan.id}...`);
      console.log(`📋 [Plan Rejection] Reason: ${rejectionReason.substring(0, 100)}...`);
      console.log(`📋 [Plan Rejection] API URL: /api/projects/${projectId}/plan/${plan.id}/reject`);

      const response = await apiClient.post(`/api/projects/${projectId}/plan/${plan.id}/reject`, {
        reason: rejectionReason,
        modifications: modificationsRequested || undefined
      });

      console.log(`📋 [Plan Rejection] Response:`, response);

      if (response?.success) {
        // FIX Issue #8: Handle regenerated plan from backend
        const hasNewPlan = response.newPlanId;

        toast({
          title: hasNewPlan ? "Plan Regenerated" : "Plan Rejected",
          description: hasNewPlan
            ? "A new plan has been generated based on your feedback."
            : response.message || "Please create a new plan manually.",
        });

        setPlan({ ...plan, status: 'rejected', rejectionReason });
        setShowRejectionForm(false);
        setRejectionReason('');
        setModificationsRequested('');

        // Reload plan to get regenerated version
        // FIX Phase 3: Backend already completed DB write when it returned response
        // No delay needed - loadPlan can be called immediately
        if (hasNewPlan) {
          // Backend returned newPlanId, meaning it's already in DB - load immediately
          await loadPlan();
        } else {
          // No new plan was generated - show loading and try to load what exists
          setIsLoading(true);
          await loadPlan();
        }
      } else {
        // FIX: Handle non-success response (response received but success is false)
        console.error('❌ [Plan Rejection] Response was not successful:', response);
        toast({
          title: "Rejection Failed",
          description: response?.error || response?.message || "The server could not process the rejection. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('❌ [Plan Rejection] Error:', error);
      console.error('❌ [Plan Rejection] Error details:', {
        message: error.message,
        status: error.status,
        response: error.response?.data
      });
      toast({
        title: "Error Rejecting Plan",
        description: error.response?.data?.error || error.message || "Failed to reject analysis plan",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'low': return 'green';
      case 'medium': return 'blue';
      case 'high': return 'yellow';
      case 'very_high': return 'red';
      default: return 'gray';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'green';
      case 'partial': return 'yellow';
      case 'failed': return 'red';
      case 'timeout': return 'orange';
      default: return 'gray';
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analysis plan...</p>
        </div>
      </div>
    );
  }

  // Plan creation in progress
  if (isCreatingPlan || plan?.status === 'pending') {
    const progress = planProgress?.percentComplete || 0;
    const agentProgress = planProgress?.agentProgress || {};

    return (
      <div className="container max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Creating Your Analysis Plan
            </CardTitle>
            <CardDescription>
              Our agents are analyzing your data and creating a comprehensive analysis plan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid gap-4">
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <Database className="h-6 w-6 text-blue-500" />
                <div className="flex-1">
                  <div className="font-medium">Data Engineer</div>
                  <div className="text-sm text-muted-foreground">
                    {agentProgress.dataEngineer === 'completed' || agentProgress.dataEngineer === 'success'
                      ? 'Data assessment complete'
                      : agentProgress.dataEngineer === 'in_progress'
                        ? 'Assessing data quality...'
                        : 'Waiting to assess data quality and infrastructure'}
                  </div>
                </div>
                <Badge variant={agentProgress.dataEngineer === 'completed' || agentProgress.dataEngineer === 'success' ? 'default' : 'secondary'}>
                  {agentProgress.dataEngineer || 'pending'}
                </Badge>
              </div>

              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <Brain className="h-6 w-6 text-purple-500" />
                <div className="flex-1">
                  <div className="font-medium">Data Scientist</div>
                  <div className="text-sm text-muted-foreground">
                    {agentProgress.dataScientist === 'completed' || agentProgress.dataScientist === 'success'
                      ? 'Analysis design complete'
                      : agentProgress.dataScientist === 'in_progress'
                        ? 'Designing analysis steps...'
                        : 'Waiting to design analysis steps and ML models'}
                  </div>
                </div>
                <Badge variant={agentProgress.dataScientist === 'completed' || agentProgress.dataScientist === 'success' ? 'default' : 'secondary'}>
                  {agentProgress.dataScientist || 'pending'}
                </Badge>
              </div>

              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <Users className="h-6 w-6 text-green-500" />
                <div className="flex-1">
                  <div className="font-medium">Business Expert</div>
                  <div className="text-sm text-muted-foreground">
                    {agentProgress.businessAgent === 'completed' || agentProgress.businessAgent === 'success'
                      ? 'Industry insights added'
                      : agentProgress.businessAgent === 'in_progress'
                        ? 'Adding industry context...'
                        : 'Waiting to add industry context and compliance insights'}
                  </div>
                </div>
                <Badge variant={agentProgress.businessAgent === 'completed' || agentProgress.businessAgent === 'success' ? 'default' : 'secondary'}>
                  {agentProgress.businessAgent || 'pending'}
                </Badge>
              </div>
            </div>

            {/* GAP 4 FIX: Display real-time progress message */}
            {planProgress?.progressMessage && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-blue-800 font-medium">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  {planProgress.progressMessage}
                </div>
                {planProgress.currentStep > 0 && planProgress.totalSteps > 0 && (
                  <div className="text-sm text-blue-600 mt-1">
                    Step {planProgress.currentStep} of {planProgress.totalSteps}
                  </div>
                )}
              </div>
            )}

            {planProgress?.estimatedTimeRemaining && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Estimated time remaining: {planProgress.estimatedTimeRemaining}
              </div>
            )}

            {isPlanStuck && (
              <div className="p-4 border border-orange-200 rounded-lg bg-orange-50 space-y-3">
                <div className="flex items-center gap-2 text-orange-800 font-medium">
                  <AlertCircle className="h-4 w-4" />
                  Plan creation is taking longer than expected
                </div>
                <p className="text-sm text-orange-800">
                  Our agents usually finish within 30-45 seconds. This delay might be due to:
                </p>
                <ul className="text-sm text-orange-800 list-disc list-inside space-y-1">
                  <li>Complex dataset requiring additional analysis</li>
                  <li>Server load or temporary service disruption</li>
                  <li>Large number of user questions to process</li>
                </ul>
                <p className="text-sm text-orange-700 font-medium">
                  You can retry plan creation or continue waiting. The system will keep trying in the background.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleForcePlanRegeneration} disabled={isCreatingPlan}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Plan Creation
                  </Button>
                  <Button variant="outline" onClick={() => { setIsCreatingPlan(false); setPlan(null); }}>
                    Cancel & Go Back
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="container max-w-3xl mx-auto p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <AlertCircle className="h-5 w-5" />
              Plan Unavailable
            </CardTitle>
            <CardDescription className="text-red-700">
              {planError || 'We could not load your analysis plan. Please try again.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={createPlan} disabled={!projectId}>
              Retry Plan Creation
            </Button>
            <Button variant="outline" onClick={() => loadPlan()} disabled={!projectId}>
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // FIX: Show loading overlay when plan is pending (being generated)
  const isPlanPending = plan.status === 'pending' || isCreatingPlan;

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-6">
      {/* Plan Generation Loading Overlay */}
      {isPlanPending && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-blue-900">Generating Your Analysis Plan</h3>
                <p className="text-blue-700 max-w-md">
                  Our AI agents are analyzing your data requirements and creating a customized analysis plan.
                  This typically takes 15-30 seconds.
                </p>
                {pollTimedOut && (
                  <div className="mt-4">
                    <p className="text-amber-700 mb-2">Taking longer than expected...</p>
                    <Button onClick={() => loadPlan()} variant="outline" size="sm">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Analysis Plan
          </h1>
          <p className="text-muted-foreground mt-1">
            {plan.analyses?.length
              ? `${plan.analyses.length} analyses planned${plan.datasetSize ? ` across ${plan.datasetSize.toLocaleString()} data rows` : ''}${(project as any)?.name ? ` for "${(project as any).name}"` : ''}`
              : `Review the analysis plan${(project as any)?.name ? ` for "${(project as any).name}"` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-lg px-4 py-2">
            Version {plan.version}
          </Badge>
          <Badge
            variant={plan.status === 'approved' ? 'default' : isPlanPending ? 'outline' : 'secondary'}
            className={`text-lg px-4 py-2 ${isPlanPending ? 'animate-pulse' : ''}`}
          >
            {isPlanPending ? 'Generating...' : plan.status}
          </Badge>
        </div>
      </div>

      {/* Executive Summary - Hide placeholder when pending */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">{plan.executiveSummary}</p>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-sm text-muted-foreground">Complexity</div>
                <div className="text-2xl font-bold">
                  <Badge variant="outline" className={`bg-${getComplexityColor(plan.complexity)}-100`}>
                    {plan.complexity}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-sm text-muted-foreground">Duration</div>
                <div className="text-2xl font-bold">{plan.estimatedDuration}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-sm text-muted-foreground">Estimated Cost</div>
                <div className="text-2xl font-bold">
                  ${plan.estimatedCost?.total?.toFixed(2) ?? '0.00'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Settings className="h-8 w-8 text-orange-500" />
              <div>
                <div className="text-sm text-muted-foreground">Analysis Steps</div>
                {/* PHASE 7 FIX: Prefer plan.analyses (DS recommendations) over plan.analysisSteps */}
                <div className="text-2xl font-bold">
                  {(plan as any).analyses?.length > 0
                    ? (plan as any).analyses.length
                    : plan.analysisSteps.length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Requirements & Business Context */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Requirements & Business Context
          </CardTitle>
          <CardDescription>
            {requiredDataFields.length > 0
              ? `${requiredDataFields.length} data fields identified. Confirm requirements and review KPIs driving this plan.`
              : 'Confirm the fields our agents need and review the KPIs and compliance considerations driving this plan'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Required Data Elements</div>
                {requiredDataFields.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {requiredDataFields.map((field: string) => (
                      <Badge key={field} variant="outline">
                        {field}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The plan did not identify specific data columns. Review analysis steps to confirm inputs.
                  </p>
                )}
              </div>

              {missingDataSignals.length > 0 && (
                <div className="p-3 rounded border border-yellow-200 bg-yellow-50 text-sm text-yellow-900">
                  <div className="font-medium mb-1">Missing data detected</div>
                  <p>{missingDataSignals.join(", ")}</p>
                </div>
              )}

              {transformationRecommendations.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Transformations to plan for</div>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {transformationRecommendations.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* P1 FIX: Added visual feedback for checkbox requirement */}
              <div
                id="requirements-checkbox-container"
                className={`flex items-start gap-3 p-3 border rounded-lg transition-all duration-300 ${
                  !requirementsConfirmed ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'
                }`}
              >
                <Checkbox
                  id="requirements-confirmed"
                  checked={requirementsConfirmed}
                  onCheckedChange={(checked) => setRequirementsConfirmed(!!checked)}
                />
                <div>
                  <Label htmlFor="requirements-confirmed" className="font-medium flex items-center gap-2">
                    Confirm data requirements
                    {!requirementsConfirmed && (
                      <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Required</span>
                    )}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    I reviewed these fields and confirm our datasets contain or will capture them for this analysis.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Relevant KPIs</div>
                {businessContext?.relevantKPIs?.length ? (
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {businessContext.relevantKPIs.map((kpi: string, idx: number) => (
                      <li key={idx}>{kpi}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No KPIs were highlighted for this plan.</p>
                )}
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Compliance & Reporting</div>
                {businessContext?.complianceRequirements?.length || businessContext?.reportingStandards?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {businessContext?.complianceRequirements?.map((item: string, idx: number) => (
                      <Badge key={`compliance-${idx}`} variant="secondary">
                        {item}
                      </Badge>
                    ))}
                    {businessContext?.reportingStandards?.map((item: string, idx: number) => (
                      <Badge key={`standard-${idx}`} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No specific compliance or reporting standards noted.</p>
                )}
              </div>

              {businessContext?.recommendations?.length ? (
                <div>
                  <div className="text-sm font-medium mb-2">Business Recommendations</div>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {businessContext.recommendations.map((rec: string, idx: number) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {businessContext?.industryBenchmarks?.length ? (
                <div>
                  <div className="text-sm font-medium mb-2">Industry Benchmarks</div>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {businessContext.industryBenchmarks.map((benchmark: string, idx: number) => (
                      <li key={idx}>{benchmark}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for detailed information */}
      <Tabs defaultValue="steps" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="steps">Analysis Steps</TabsTrigger>
          <TabsTrigger value="data">Data Assessment</TabsTrigger>
          <TabsTrigger value="viz">Visualizations</TabsTrigger>
          <TabsTrigger value="ml">ML Models</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="agents">Agent Contributions</TabsTrigger>
        </TabsList>

        {/* Analysis Steps Tab */}
        <TabsContent value="steps" className="space-y-4">
          {/* ==========================================
              PHASE 4: Per-Analysis Breakdown (Jan 2026)
              Shows DS-recommended analyses with per-analysis estimates
              ========================================== */}
          {plan.analyses && plan.analyses.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Analysis Breakdown ({plan.analyses.length} analyses)
                </CardTitle>
                <CardDescription>
                  Per-analysis time estimates based on your data ({(plan.datasetSize || 0).toLocaleString()} rows)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {plan.analyses.map((analysis, idx) => (
                    <div
                      key={analysis.analysisId}
                      className="flex items-center justify-between p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{idx + 1}</Badge>
                          <span className="font-medium">{analysis.analysisName}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {analysis.techniques?.length > 0
                            ? analysis.techniques.join(', ')
                            : analysis.analysisType.replace(/_/g, ' ')}
                        </div>
                        {analysis.requiredElements?.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Database className="h-3 w-3" />
                            {analysis.requiredElements.length} data elements required
                          </div>
                        )}
                        {analysis.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {analysis.description}
                          </div>
                        )}
                        {/* Expected visualizations per analysis type */}
                        <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <BarChart3 className="h-3 w-3 mt-0.5 shrink-0 text-indigo-500" />
                          <span className="text-indigo-600">
                            {getExpectedVisualizations(analysis.analysisType).join(' / ')}
                          </span>
                        </div>
                        {/* P3-3: Show which user questions this analysis addresses */}
                        {(() => {
                          const questions = questionsByAnalysis.get(analysis.analysisId) ||
                                           questionsByAnalysis.get(analysis.analysisType) || [];
                          if (questions.length === 0) return null;
                          return (
                            <div className="mt-2 flex items-start gap-1.5">
                              <MessageCircle className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                              <div className="text-xs text-blue-700">
                                {questions.length === 1
                                  ? <span>Answers: <em className="line-clamp-1">{questions[0].questionText}</em></span>
                                  : <span>Answers {questions.length} questions: <em className="line-clamp-1">{questions.map(q => q.questionText).join('; ')}</em></span>
                                }
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-right ml-4">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {analysis.estimatedDuration}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {analysis.status === 'ready' ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Ready
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <span className="font-medium">Total Estimated Time:</span>
                  <Badge variant="default" className="text-base px-3 py-1">
                    <Clock className="h-4 w-4 mr-2" />
                    {plan.totalEstimatedDuration || 'Calculating...'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Legacy Analysis Steps (from DS generatePlanBlueprint) */}
          {plan.analysisSteps.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Execution Plan Details</CardTitle>
                <CardDescription>Technical steps the analysis engine will execute</CardDescription>
              </CardHeader>
            </Card>
          )}
          {plan.analysisSteps.map((step, index) => (
            <Card key={step.stepNumber}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline">{step.stepNumber}</Badge>
                  {step.name}
                </CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium mb-2">Method</div>
                  <Badge variant="secondary">{step.method}</Badge>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Confidence</div>
                  <Progress value={step.confidence} className="h-2" />
                  <div className="text-sm text-muted-foreground mt-1">{step.confidence}%</div>
                </div>
                {step.inputs && step.inputs.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Inputs</div>
                    <div className="flex flex-wrap gap-2">
                      {step.inputs.map((input, i) => (
                        <Badge key={i} variant="outline">{input}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium mb-2">Expected Outputs</div>
                  <ul className="list-disc list-inside space-y-1">
                    {step.expectedOutputs.map((output, i) => (
                      <li key={i} className="text-sm">{output}</li>
                    ))}
                  </ul>
                </div>
                {step.tools && step.tools.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Tools</div>
                    <div className="flex flex-wrap gap-2">
                      {step.tools.map((tool, i) => (
                        <Badge key={i} variant="outline">{tool}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Estimated duration: {step.estimatedDuration}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Data Assessment Tab */}
        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>Data Quality & Infrastructure Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium mb-2">Quality Score</div>
                  <Progress value={plan.dataAssessment.qualityScore} className="h-2" />
                  <div className="text-sm text-muted-foreground mt-1">
                    {plan.dataAssessment.qualityScore}%
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Completeness</div>
                  <Progress value={plan.dataAssessment.completenessScore} className="h-2" />
                  <div className="text-sm text-muted-foreground mt-1">
                    {plan.dataAssessment.completenessScore}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium mb-2">Dataset Size</div>
                  <p>{plan.dataAssessment.recordCount} rows × {plan.dataAssessment.columnCount} columns</p>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Processing Time</div>
                  <p>{plan.dataAssessment.estimatedProcessingTime}</p>
                </div>
              </div>

              {plan.dataAssessment.infrastructureNeeds.useSpark && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="h-5 w-5 text-blue-600" />
                    <div className="font-medium">Spark Processing Required</div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Estimated Memory: {plan.dataAssessment.infrastructureNeeds.estimatedMemoryGB} GB
                  </p>
                </div>
              )}

              {plan.dataAssessment.recommendedTransformations && plan.dataAssessment.recommendedTransformations.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Recommended Transformations</div>
                  <div className="space-y-2">
                    {plan.dataAssessment.recommendedTransformations.map((transform, i) => (
                      <div key={i} className="p-3 border rounded">
                        <p className="text-sm">{transform}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visualizations Tab */}
        <TabsContent value="viz" className="space-y-4">
          {plan.visualizations && plan.visualizations.length > 0 ? (
            plan.visualizations.map((viz, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {viz.title}
                    <Badge variant="outline" className="ml-auto">{viz.type}</Badge>
                  </CardTitle>
                  <CardDescription>{viz.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {viz.dataFields && viz.dataFields.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">Data Fields</div>
                      <div className="flex flex-wrap gap-2">
                        {viz.dataFields.map((field, i) => (
                          <Badge key={i} variant="secondary">{field}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-6">
                <div className="text-center mb-4">
                  <BarChart3 className="h-10 w-10 mx-auto mb-2 text-indigo-400" />
                  <p className="text-muted-foreground">Visualizations will be generated based on your analysis types</p>
                </div>
                {plan.analyses && plan.analyses.length > 0 && (
                  <div className="space-y-3">
                    {plan.analyses.map((analysis, idx) => {
                      const vizTypes = getExpectedVisualizations(analysis.analysisType);
                      return (
                        <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg bg-indigo-50/50">
                          <Badge variant="outline" className="text-xs shrink-0 mt-0.5">{analysis.analysisType.replace(/_/g, ' ')}</Badge>
                          <div className="text-sm text-muted-foreground">
                            {vizTypes.join(', ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ML Models Tab */}
        <TabsContent value="ml" className="space-y-4">
          {plan.mlModels && plan.mlModels.length > 0 ? (
            plan.mlModels.map((model, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    {model.modelType} - {model.algorithm}
                    <Badge variant="outline" className="ml-auto">{model.modelType}</Badge>
                  </CardTitle>
                  <CardDescription>
                    Target: {model.targetVariable} | Expected Accuracy: {model.expectedAccuracy}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm font-medium mb-2">Target Variable</div>
                    <Badge variant="secondary">{model.targetVariable}</Badge>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">Features ({model.features.length})</div>
                    <div className="flex flex-wrap gap-2">
                      {model.features.map((feature, i) => (
                        <Badge key={i} variant="outline">{feature}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium">Training Time</div>
                      <p className="text-sm text-muted-foreground">{model.trainingTime}</p>
                    </div>
                    {model.interpretability && (
                      <div>
                        <div className="text-sm font-medium">Interpretability</div>
                        <p className="text-sm text-muted-foreground">{model.interpretability}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No ML models planned for this analysis</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Costs Tab */}
        <TabsContent value="costs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Cost Breakdown
              </CardTitle>
              <CardDescription>
                Detailed cost estimation for the analysis plan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {plan.estimatedCost?.breakdown && Object.keys(plan.estimatedCost.breakdown).length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-3">Detailed Breakdown</div>
                  <div className="space-y-2">
                    {Object.entries(plan.estimatedCost.breakdown).map(([key, value], i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">{key}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">${typeof value === 'number' ? value.toFixed(2) : '0.00'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex items-center justify-between text-lg font-bold">
                  <span>Total Estimated Cost</span>
                  <span>${plan.estimatedCost?.total?.toFixed(2) ?? '0.00'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Contributions Tab */}
        <TabsContent value="agents" className="space-y-4">
          {plan.agentContributions && Object.keys(plan.agentContributions).length > 0 ? (
            Object.entries(plan.agentContributions).map(([agentId, contribution]) => (
              <Card key={agentId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {agentId === 'data_engineer' && <Database className="h-5 w-5 text-blue-500" />}
                    {agentId === 'data_scientist' && <Brain className="h-5 w-5 text-purple-500" />}
                    {agentId === 'business_agent' && <Users className="h-5 w-5 text-green-500" />}
                    {agentId === 'project_manager' && <Users className="h-5 w-5 text-orange-500" />}
                    {agentId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    <Badge
                      variant="outline"
                      className={`ml-auto bg-${getStatusColor(contribution.status)}-100`}
                    >
                      {contribution.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Completed at {new Date(contribution.completedAt).toLocaleString()}
                    {contribution.duration && ` • Duration: ${(contribution.duration / 1000).toFixed(1)}s`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm font-medium mb-2">Contribution</div>
                    <p className="text-sm">{contribution.contribution}</p>
                  </div>

                  {contribution.error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-medium">Error:</span>
                        <span>{contribution.error}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Agent contributions are being collected...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  This will update automatically when the plan is fully generated.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Risks and Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plan.risks && plan.risks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Potential Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {plan.risks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <span className="text-sm">{risk}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {plan.recommendations && plan.recommendations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {plan.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <span className="text-sm">{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Buttons */}
      {/* Show action buttons for 'ready' and 'approved' status - users can reject even approved plans */}
      {(plan.status === 'ready' || plan.status === 'approved') && (
        <Card>
          <CardContent className="pt-6">
            {!showRejectionForm ? (
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">
                  Review the analysis plan and approve to proceed with execution
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowRejectionForm(true)}
                    disabled={isSubmitting}
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Reject Plan
                  </Button>
                  <div className="flex flex-col items-end">
                    <Button
                      onClick={handleApprovePlan}
                      disabled={isSubmitting || !requirementsConfirmed}
                      className={!requirementsConfirmed ? 'opacity-50' : ''}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4 mr-2" />
                      )}
                      Approve & Continue
                    </Button>
                    {/* P1 FIX: Show helper text when button is disabled */}
                    {!requirementsConfirmed && (
                      <p className="text-xs text-amber-600 mt-1">
                        Check the confirmation above to enable
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Please explain why you're rejecting this plan..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="modifications">Requested Modifications (Optional)</Label>
                  <Textarea
                    id="modifications"
                    placeholder="Describe any specific changes you'd like to see in the regenerated plan..."
                    value={modificationsRequested}
                    onChange={(e) => setModificationsRequested(e.target.value)}
                    rows={3}
                    className="mt-2"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectionForm(false);
                      setRejectionReason('');
                      setModificationsRequested('');
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRejectPlan}
                    disabled={isSubmitting || !rejectionReason.trim()}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ThumbsDown className="h-4 w-4 mr-2" />
                    )}
                    Submit Rejection
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {plan.status === 'approved' && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="flex-1">
                <div className="font-medium text-green-900">Plan Approved</div>
                <p className="text-sm text-green-700">
                  This analysis plan has been approved and is ready for execution
                </p>
              </div>
              {onNext && (
                <Button onClick={onNext}>
                  Continue to Execution
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {plan.status === 'rejected' && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-yellow-600" />
              <div>
                <div className="font-medium text-yellow-900">Plan Rejected</div>
                <p className="text-sm text-yellow-700">
                  The PM agent is regenerating the plan based on your feedback
                </p>
                {plan.rejectionReason && (
                  <p className="text-sm text-yellow-800 mt-2 italic">
                    Reason: {plan.rejectionReason}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      {(onNext || onPrevious) && (
        <div className="flex items-center justify-between pt-6 border-t">
          {onPrevious && (
            <Button variant="outline" onClick={onPrevious}>
              Previous Step
            </Button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            {/* P1-1 FIX: Gate skip button with confirmation dialog */}
            {onNext && plan.status !== 'approved' && plan.status !== 'ready' && (
              <Button variant="outline" onClick={() => setShowSkipConfirmDialog(true)}>
                Skip to Execution
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {onNext && plan.status === 'approved' && (
              <Button onClick={onNext}>
                Continue to Execution
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* P1-1 FIX: Skip Confirmation Dialog */}
      <Dialog open={showSkipConfirmDialog} onOpenChange={setShowSkipConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Skip Analysis Plan?
            </DialogTitle>
            <DialogDescription>
              The analysis plan helps optimize your results. Are you sure you want to proceed without it?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>Warning:</strong> Skipping the plan approval means:
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Analysis may not be optimally configured</li>
                  <li>Cost estimates won't be reviewed</li>
                  <li>Recommended analyses may not be applied</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-600">
                <strong>Plan Status:</strong>{' '}
                <Badge variant="secondary">{plan?.status || 'pending'}</Badge>
              </p>
              {plan?.status === 'pending' && (
                <p className="text-xs text-gray-500 mt-1">
                  The plan is still being generated. Consider waiting for completion.
                </p>
              )}
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can always return to this step later to review and approve the plan.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSkipConfirmDialog(false)}>
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowSkipConfirmDialog(false);
                // Log skip action
                console.log('⚠️ [P1-1] User skipped plan approval');
                // Update journeyProgress to note the skip
                updateProgress({
                  planSkipped: true,
                  planSkippedAt: new Date().toISOString()
                });
                if (onNext) onNext();
              }}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Skip Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
