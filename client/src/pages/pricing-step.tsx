import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DollarSign,
  CheckCircle,
  CreditCard,
  Zap,
  Shield,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  ThumbsUp,
  Info
} from "lucide-react";
import { apiClient } from "@/lib/api";
import BillingCapacityDisplay from "@/components/BillingCapacityDisplay";
import { useProject } from "@/hooks/useProject";
import { useJourneyState } from "@/hooks/useJourneyState";
import { useToast } from "@/hooks/use-toast";

interface PricingStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

type AnalysisSummary = {
  totalAnalyses: number;
  dataSize: number;
  complexity: string;
  executionTime: string;
  resultsGenerated: number;
  insightsFound: number;
};

type NormalizedBreakdown = {
  journeyType: string;
  datasetSizeMB: number;
  totalCost: number;
  baseCost: number;
  subscriptionCredits: number;
  capacityUsed: Record<string, number> | null;
  capacityRemaining: Record<string, number> | null;
  utilizationPercentage: Record<string, number> | null;
  breakdown: Array<{
    description: string;
    cost: number;
    capacityImpact?: {
      used?: Record<string, number>;
      remaining?: Record<string, number>;
    };
  }>;
};

const formatCurrency = (centsOrDollars: number | null | undefined, isCents = false) => {
  if (centsOrDollars === null || centsOrDollars === undefined || Number.isNaN(centsOrDollars)) {
    return '—';
  }
  const value = isCents ? centsOrDollars / 100 : centsOrDollars;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const pickNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
};

const mapCapacityBlock = (block: any): Record<string, number> => {
  if (!block || typeof block !== 'object') {
    // Return default zeros instead of null to prevent crashes
    return {
      dataVolumeMB: 0,
      aiInsights: 0,
      analysisComponents: 0,
      visualizations: 0,
      fileUploads: 0,
    };
  }
  return {
    dataVolumeMB: pickNumber(block.dataVolumeMB, block.dataMB, block.data, block.volumeMB),
    aiInsights: pickNumber(block.aiInsights, block.ai, block.aiQueries),
    analysisComponents: pickNumber(block.analysisComponents, block.components),
    visualizations: pickNumber(block.visualizations, block.charts),
    fileUploads: pickNumber(block.fileUploads, block.uploads),
  };
};

const normalizeBillingBreakdown = (
  raw: any,
  fallbackCostCents: number,
  fallbackJourneyType: string,
  fallbackDatasetSizeMB: number
): NormalizedBreakdown => {
  const toCents = (value: unknown, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value * 100);
    }
    return fallback;
  };

  const normalizedItems = Array.isArray(raw?.breakdown)
    ? raw.breakdown.map((item: any, index: number) => ({
      description: item.description || item.item || `Line item ${index + 1}`,
      cost: toCents(item.cost, 0),
      capacityImpact: item.capacityImpact
        ? {
          used: mapCapacityBlock(item.capacityImpact.used) || undefined,
          remaining: mapCapacityBlock(item.capacityImpact.remaining) || undefined,
        }
        : undefined,
    }))
    : [];

  return {
    journeyType: typeof raw?.journeyType === 'string' ? raw.journeyType : fallbackJourneyType,
    datasetSizeMB: typeof raw?.datasetSizeMB === 'number' ? raw.datasetSizeMB : fallbackDatasetSizeMB,
    totalCost: toCents(raw?.totalCost, fallbackCostCents),
    baseCost: toCents(raw?.baseCost, fallbackCostCents),
    subscriptionCredits: toCents(raw?.subscriptionCredits, 0),
    capacityUsed: mapCapacityBlock(raw?.capacityUsed),
    capacityRemaining: mapCapacityBlock(raw?.capacityRemaining),
    utilizationPercentage: raw?.utilizationPercentage ?? null,
    breakdown: normalizedItems,
  };
};

export default function PricingStep({ journeyType, onNext, onPrevious }: PricingStepProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('per-analysis');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal' | 'bank'>('card');
  const [billingLoading, setBillingLoading] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBreakdown, setBillingBreakdown] = useState<NormalizedBreakdown | null>(null);
  const [currentTier, setCurrentTier] = useState<string>('');
  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // P0-3 FIX: Guards to prevent infinite payment verification loop
  const [hasProcessedPayment, setHasProcessedPayment] = useState<boolean>(false);
  const [paymentVerificationResult, setPaymentVerificationResult] = useState<'success' | 'pending' | 'failed' | 'cancelled' | null>(null);

  // ✅ PHASE 7 FIX: Backend cost estimate - single source of truth for pricing
  // P1 FIX: Added perAnalysisBreakdown to type definition (was missing, causing fallback to display)
  const [backendCostEstimate, setBackendCostEstimate] = useState<{
    totalCost: number;
    breakdown: {
      basePlatformFee?: number;
      dataProcessing?: number;
      analysisExecution?: number;
      rowsProcessed?: number;
      analysisTypes?: number;
      perAnalysisBreakdown?: Array<{ type: string; cost: number }>;
    };
    isLocked: boolean;
  } | null>(null);
  const [backendCostLoading, setBackendCostLoading] = useState(false);

  // Cost confirmation checkpoint state (U2A2A2U pattern)
  const [showCostConfirmation, setShowCostConfirmation] = useState<boolean>(false);
  const [costConfirmed, setCostConfirmed] = useState<boolean>(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 🔒 SSOT: Use useProject hook instead of useProjectSession
  const {
    projectId,
    journeyProgress,
    updateProgress,
    isLoading: projectLoading
  } = useProject(localStorage.getItem('currentProjectId') || undefined);

  // ✅ PHASE 3 FIX: Fetch datasets to get actual recordCount for pricing display
  // This fixes "Data Rows = 0" issue - previously read from executionSummary which is only populated after execution
  const { data: datasetsResponse } = useQuery({
    queryKey: ['project-datasets', projectId],
    queryFn: async () => {
      if (!projectId) return { datasets: [] };
      const response = await apiClient.get(`/api/projects/${projectId}/datasets`);
      return response as { datasets: Array<{ id: string; recordCount?: number; name?: string; [key: string]: any }> };
    },
    enabled: Boolean(projectId),
    staleTime: 1000 * 60, // 1 minute cache
  });
  const datasets = datasetsResponse?.datasets || [];

  const {
    data: journeyState,
    isLoading: journeyStateLoading,
    isFetching: journeyStateFetching,
    error: journeyStateError
  } = useJourneyState(projectId ?? undefined, { enabled: Boolean(projectId) });

  // ✅ PHASE 7 FIX: Fetch cost estimate from backend - AUTHORITATIVE pricing source
  // This ensures frontend displays the SAME price that will be charged at checkout
  useEffect(() => {
    if (!projectId) {
      setBackendCostEstimate(null);
      return;
    }

    let cancelled = false;
    async function fetchCostEstimate() {
      setBackendCostLoading(true);
      try {
        // Use apiClient instead of raw fetch to include auth headers
        const data = await apiClient.get(`/api/projects/${projectId}/cost-estimate`);
        if (!cancelled && data.success) {
          // P1 FIX: Enhanced logging to verify breakdown is received from backend
          console.log(`✅ [Pricing] Backend cost estimate: $${data.totalCost} (${data.isLocked ? 'LOCKED' : 'estimated'})`);
          console.log(`📊 [Pricing] Breakdown received:`, {
            basePlatformFee: data.breakdown?.basePlatformFee,
            dataProcessing: data.breakdown?.dataProcessing,
            analysisExecution: data.breakdown?.analysisExecution,
            perAnalysisBreakdownCount: data.breakdown?.perAnalysisBreakdown?.length || 0,
            perAnalysisTypes: data.breakdown?.perAnalysisBreakdown?.map((a: any) => a.type) || [],
            hasRawBreakdown: !!data.rawBreakdown,
            rawBreakdownCount: data.rawBreakdown?.length || 0
          });

          // Warn if breakdown is missing key fields
          if (!data.breakdown?.perAnalysisBreakdown?.length) {
            console.warn(`⚠️ [Pricing] No perAnalysisBreakdown received - check if analysisPath was saved in journeyProgress`);
          }

          setBackendCostEstimate({
            totalCost: data.totalCost,
            breakdown: data.breakdown || {},
            isLocked: data.isLocked || false
          });
        }
      } catch (error) {
        console.warn('⚠️ [Pricing] Failed to fetch backend cost estimate:', error);
        // Don't fail - fall back to billing service calculation
      } finally {
        if (!cancelled) setBackendCostLoading(false);
      }
    }

    fetchCostEstimate();
    return () => { cancelled = true; };
  }, [projectId]);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Analysis Pricing",
          description: "Simple pricing for AI-assisted analysis",
          icon: DollarSign,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Analysis Pricing",
          description: "Pricing for business template-based analysis",
          icon: DollarSign,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Analysis Pricing",
          description: "Pricing for advanced technical analysis",
          icon: DollarSign,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Expert Consultation Pricing",
          description: "Pricing for expert consultation and analysis",
          icon: DollarSign,
          color: "yellow"
        };
      default:
        return {
          title: "Analysis Pricing",
          description: "Pricing for your data analysis",
          icon: DollarSign,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  const defaultAnalysisSummary: AnalysisSummary = {
    totalAnalyses: 0,
    dataSize: 0,
    complexity: 'moderate',
    executionTime: 'N/A',
    resultsGenerated: 0,
    insightsFound: 0,
  };

  const { summary: analysisResults, warning: validationWarning, isPreExecution } = useMemo(() => {
    let warning: string | null = null;
    let summary: AnalysisSummary = { ...defaultAnalysisSummary };

    // 1. Priority: journeyProgress.executionSummary (SSOT - post-execution)
    if (journeyProgress?.executionSummary) {
      const summaryData = journeyProgress.executionSummary;
      summary = {
        totalAnalyses: summaryData.totalAnalyses || 1,
        dataSize: summaryData.dataSize || 1000,
        complexity: summaryData.complexity || 'moderate',
        executionTime: summaryData.executionTime || '5 minutes',
        resultsGenerated: summaryData.resultsGenerated || (summaryData.insightsFound || 0) + (summaryData.recommendationsFound || 0),
        insightsFound: summaryData.insightsFound || 0
      };

      if (!journeyProgress.analysisResultsId) {
        warning = '⚠️ SECURITY: Execution results missing analysisResultsId. Results may be unvalidated.';
      }

      return { summary, warning, isPreExecution: false };
    }

    // 2. Fallback: Check if execution was completed but summary not saved
    if (journeyProgress?.executionCompletedAt && !journeyProgress?.executionSummary) {
      warning = '⚠️ Execution completed but summary not available. Please refresh the page.';
      summary = {
        ...defaultAnalysisSummary,
        totalAnalyses: 1,
      };
      return { summary, warning, isPreExecution: false };
    }

    // 3. Pre-execution: Use requirementsDocument for planned analysis count
    const analysisPath = journeyProgress?.requirementsDocument?.analysisPath;
    const plannedAnalyses = Array.isArray(analysisPath) ? analysisPath.length : 0;
    summary = {
      ...defaultAnalysisSummary,
      totalAnalyses: Math.max(1, plannedAnalyses),
      complexity: 'intermediate',
    };
    // No warning when we have a backend cost estimate - this is a valid pre-execution estimate
    return { summary, warning: null, isPreExecution: true };
  }, [journeyProgress]);

  // ✅ PHASE 3 FIX: Compute dataset size from actual datasets.recordCount first
  // Previously read from executionSummary.dataSize which is only populated AFTER execution
  // Now reads from datasets fetched via useQuery - this shows correct row count on pricing page
  const datasetSizeMB = useMemo(() => {
    // Priority 1: Get actual row counts from datasets (BEFORE execution)
    if (datasets && datasets.length > 0) {
      const totalRows = datasets.reduce((sum, ds) => sum + (ds.recordCount || 0), 0);
      if (totalRows > 0) {
        console.log(`✅ [Pricing] Using datasets recordCount: ${totalRows} rows`);
        // Convert rows to MB (rough estimate: 10,000 rows ~ 100 MB)
        return Math.max(1, Math.round(totalRows / 100));
      }
    }

    // Priority 2: Use execution summary if available (AFTER execution)
    const size = analysisResults.dataSize || 0;
    // If size is less than 1000, assume it's already in MB; otherwise assume it's row count
    if (size < 1000) {
      return Math.max(1, size);
    }
    // Convert rows to MB (rough estimate: 10,000 rows ~ 100 MB)
    return Math.max(1, Math.round(size / 100));
  }, [datasets, analysisResults.dataSize]);

  // ✅ Also compute actual row count for display purposes
  const totalDataRows = useMemo(() => {
    if (datasets && datasets.length > 0) {
      return datasets.reduce((sum, ds) => sum + (ds.recordCount || 0), 0);
    }
    return analysisResults.dataSize || 0;
  }, [datasets, analysisResults.dataSize]);

  // Client-side fallback pricing aligned with CostEstimationService
  // Only used when backend estimate is unavailable (Priority 4 in authoritativeCostCents)
  const calculatePricing = useMemo(() => {
    const basePlatformFee = 0.50;
    const dataProcessingPer1K = 0.10;
    const baseAnalysisCost = 1.00;

    // Complexity multiplier (matching CostEstimationService)
    let complexityMultiplier = 1.0;
    if (analysisResults.complexity === 'moderate' || analysisResults.complexity === 'intermediate') complexityMultiplier = 1.5;
    if (analysisResults.complexity === 'complex' || analysisResults.complexity === 'advanced') complexityMultiplier = 2.5;
    if (analysisResults.complexity === 'expert') complexityMultiplier = 4.0;

    // Data processing cost
    const dataRows = totalDataRows || analysisResults.dataSize || 0;
    const dataCost = (dataRows / 1000) * dataProcessingPer1K;

    // Analysis cost (default type factor = 1.0 per analysis)
    const analysisCount = Math.max(1, analysisResults.totalAnalyses);
    const analysisCost = baseAnalysisCost * analysisCount * complexityMultiplier;

    const totalCost = basePlatformFee + dataCost + analysisCost;
    return parseFloat(totalCost.toFixed(2));
  }, [analysisResults.dataSize, analysisResults.complexity, analysisResults.totalAnalyses, totalDataRows]);

  const finalPrice = calculatePricing;

  const toCents = (amount: unknown): number | null => {
    if (amount === null || amount === undefined) return null;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric * 100);
  };

  const lockedCostCents = useMemo(() => toCents(journeyState?.costs?.estimated), [journeyState]);
  const spentCostCents = useMemo(() => toCents(journeyState?.costs?.spent), [journeyState]);
  const remainingCostCents = useMemo(() => toCents(journeyState?.costs?.remaining), [journeyState]);

  // ✅ PHASE 7 FIX: Unified cost calculation with clear source hierarchy
  // Priority: 1. Backend cost estimate (authoritative), 2. Billing calculation, 3. Client fallback
  // NOTE: Removed "server-locked cost" from priority 2 as it often contains stale/incorrect values
  const authoritativeCostCents = useMemo(() => {
    // Priority 1: Backend cost estimate from /api/projects/:id/cost-estimate (AUTHORITATIVE)
    if (backendCostEstimate?.totalCost && backendCostEstimate.totalCost > 0) {
      const costCents = Math.round(backendCostEstimate.totalCost * 100);
      console.log(`💰 [Pricing] Using backend cost estimate: $${backendCostEstimate.totalCost} (${backendCostEstimate.isLocked ? 'LOCKED' : 'calculated'})`);
      return costCents;
    }
    // Priority 2: Billing service calculation (from /api/billing/journey-breakdown)
    if (typeof billingBreakdown?.totalCost === 'number' && billingBreakdown.totalCost > 0) {
      console.log('💰 [Pricing] Using server billing calculation:', billingBreakdown.totalCost / 100);
      return billingBreakdown.totalCost;
    }
    // Priority 3: Fallback to client-side calculation
    console.warn('⚠️ [Pricing] Using client-side fallback pricing. Server cost not available.');
    return Math.round(finalPrice * 100);
  }, [backendCostEstimate, billingBreakdown?.totalCost, finalPrice]);

  // Track if we're using estimated vs locked pricing
  const isEstimatedPricing = useMemo(() => {
    // Not estimated if we have backend locked cost or backend estimate or billing calculation
    if (backendCostEstimate?.isLocked) return false;
    if (backendCostEstimate?.totalCost && backendCostEstimate.totalCost > 0) return false;
    if (typeof billingBreakdown?.totalCost === 'number' && billingBreakdown.totalCost > 0) return false;
    return true;
  }, [backendCostEstimate, billingBreakdown?.totalCost]);

  const pricingPlans = useMemo(() => {
    const perAnalysisPriceDisplay = formatCurrency(authoritativeCostCents, true);
    return [
      {
        id: 'per-analysis',
        name: 'Per-Analysis Pricing',
        description: 'Pay only for what you use - transparent usage-based pricing',
        priceCents: authoritativeCostCents,
        priceDisplay: perAnalysisPriceDisplay,
        features: [
          'Complete analysis execution',
          'Detailed results report',
          'Data visualizations',
          'Insights and recommendations',
          'Downloadable artifacts',
          '30-day access to results'
        ],
        popular: true,
        locked: Boolean(backendCostEstimate?.isLocked || lockedCostCents),
        // ✅ PHASE 7 FIX: Use backend breakdown when available for accurate display
        pricingDetails: backendCostEstimate?.breakdown ? {
          baseCost: backendCostEstimate.breakdown.basePlatformFee || 0.50,
          dataSizeCost: backendCostEstimate.breakdown.dataProcessing || 0,
          analysisExecutionCost: backendCostEstimate.breakdown.analysisExecution || 0,
          rowsProcessed: backendCostEstimate.breakdown.rowsProcessed || 0,
          analysisCount: backendCostEstimate.breakdown.analysisTypes || 1
        } : {
          baseCost: 0.50, // CostEstimationService basePlatformFee
          dataSizeCost: (totalDataRows / 1000) * 0.10,
          complexityMultiplier: analysisResults.complexity === 'intermediate' ? 1.5 : analysisResults.complexity === 'advanced' ? 2.5 : analysisResults.complexity === 'expert' ? 4.0 : 1.0,
          analysisCount: analysisResults.totalAnalyses || 1
        }
      },
      {
        id: 'volume-discount',
        name: 'Volume Discount',
        description: 'Contact us for volume pricing on 5+ analyses',
        priceCents: null,
        priceDisplay: 'Contact Us',
        features: [
          'Same features as per-analysis',
          'Custom volume pricing',
          'Bulk processing priority',
          'Extended result access (90 days)',
          'Batch report generation'
        ],
        popular: false,
        locked: false,
        minQuantity: 5
      },
      {
        id: 'enterprise',
        name: 'Enterprise Usage',
        description: 'Custom pricing for high-volume usage',
        priceCents: null,
        priceDisplay: 'Custom',
        features: [
          'Custom analysis workflows',
          'Dedicated processing resources',
          'On-premise deployment options',
          'Custom integrations',
          'SLA guarantees',
          'Training and onboarding'
        ],
        popular: false,
        locked: Boolean(lockedCostCents),
        minVolume: '100+ analyses/month'
      }
    ];
  }, [analysisResults, authoritativeCostCents, lockedCostCents, backendCostEstimate, totalDataRows]);

  // Load billing breakdown from server so subscription credits are applied
  useEffect(() => {
    if (!projectId) {
      setBillingBreakdown(null);
      return;
    }

    let cancelled = false;
    async function loadBreakdown() {
      setBillingLoading(true);
      setBillingError(null);
      const fallbackJourneyType = ['non-tech', 'business', 'technical', 'consultation'].includes(journeyType)
        ? journeyType
        : 'non-tech';
      const fallbackCostCents = Math.round(finalPrice * 100);

      try {
        try {
          const cap: any = await apiClient.get('/api/billing/capacity-summary');
          if (!cancelled && cap?.success && cap.summary?.currentTier) {
            setCurrentTier(cap.summary.currentTier);
          }
        } catch {
          // optional diagnostic only
        }

        const payload = {
          journeyType: fallbackJourneyType,
          datasetSizeMB,
          additionalFeatures: [],
        };
        const res: any = await apiClient.post('/api/billing/journey-breakdown', payload);
        if (!cancelled && res?.success) {
          setBillingBreakdown(
            normalizeBillingBreakdown(res.breakdown, fallbackCostCents, payload.journeyType, payload.datasetSizeMB)
          );
          return;
        }
        throw new Error(res?.error || 'Unable to load subscription-adjusted pricing');
      } catch (err: any) {
        if (cancelled) return;
        console.error('Billing breakdown error:', err);
        const errorMsg = err?.message || err?.error || 'Unable to load subscription-adjusted pricing';
        setBillingError(errorMsg);
        const fallbackCostDollars = finalPrice;
        setBillingBreakdown(
          normalizeBillingBreakdown(
            {
              journeyType: fallbackJourneyType,
              datasetSizeMB,
              baseCost: fallbackCostDollars,
              subscriptionCredits: 0,
              totalCost: fallbackCostDollars,
              breakdown: [],
              capacityUsed: null,
              capacityRemaining: null,
              utilizationPercentage: null,
            },
            fallbackCostCents,
            fallbackJourneyType,
            datasetSizeMB
          )
        );
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    }
    loadBreakdown();
    return () => {
      cancelled = true;
    };
  }, [projectId, journeyType, datasetSizeMB, finalPrice]);

  // Handle payment success/cancel URL parameters (after Stripe redirect)
  // P0-3 FIX: Prevent infinite loop by using hasProcessedPayment guard and removing toast from deps
  useEffect(() => {
    if (hasProcessedPayment) return; // Guard: prevent re-runs

    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (!paymentStatus || !projectId || !sessionId) return;

    const handlePaymentCallback = async () => {
      if (paymentStatus === 'success') {
        // Verify payment with backend
        try {
          setPaymentProcessing(true);
          setHasProcessedPayment(true); // Set guard BEFORE async call to prevent race conditions

          const response = await apiClient.post('/api/payment/verify-session', {
            sessionId,
            projectId
          });

          if (response.success && response.paymentStatus === 'paid') {
            setPaymentVerificationResult('success');

            // P0-3 FIX: Invalidate project caches so results unlock immediately
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
            queryClient.invalidateQueries({ queryKey: ['project-datasets', projectId] });

            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);

            // =====================================================
            // FIX: Trigger analysis execution after successful payment
            // The user pays FIRST, then analysis runs, then results are shown
            // =====================================================
            console.log('💳 [Payment] Payment verified, triggering analysis execution...');

            try {
              // ✅ FIX: Get actual analysis types from the approved plan/requirements document
              const analysisPath = journeyProgress?.requirementsDocument?.analysisPath ||
                                   journeyProgress?.executionConfig?.analysisPath || [];
              const analysisTypesFromPlan = analysisPath.length > 0
                ? analysisPath.map((a: any) => a.analysisType || a.type || 'statistical_analysis')
                : ['statistical_analysis', 'exploratory_data_analysis']; // Fallback only if no plan

              console.log(`📊 [Payment] Using ${analysisTypesFromPlan.length} analysis types from plan: [${analysisTypesFromPlan.join(', ')}]`);

              // Execute analysis now that payment is confirmed
              const analysisResponse = await fetch('/api/analysis-execution/execute', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                },
                body: JSON.stringify({
                  projectId,
                  analysisTypes: analysisTypesFromPlan,
                  analysisPath // Pass full analysis path for evidence chain
                })
              });

              const analysisData = await analysisResponse.json();

              if (analysisData.success) {
                console.log('✅ [Payment] Analysis execution completed successfully');
                console.log(`   Insights: ${analysisData.results?.insights?.length || 0}`);
                console.log(`   Recommendations: ${analysisData.results?.recommendations?.length || 0}`);

                // Invalidate again to get fresh results
                queryClient.invalidateQueries({ queryKey: ["project", projectId] });

                // Navigate to dashboard
                setTimeout(() => {
                  if (onNext) {
                    onNext();
                  }
                }, 500);
              } else {
                console.error('❌ [Payment] Analysis execution failed:', analysisData.error);
                // Still navigate to dashboard - they paid, so show what we have
                setTimeout(() => {
                  if (onNext) {
                    onNext();
                  }
                }, 1500);
              }
            } catch (analysisError) {
              console.error('❌ [Payment] Analysis execution error:', analysisError);
              // Still navigate to dashboard - they paid, so show what we have
              setTimeout(() => {
                if (onNext) {
                  onNext();
                }
              }, 1500);
            }
          } else if (response.paymentStatus === 'pending') {
            setPaymentVerificationResult('pending');
          } else {
            setPaymentVerificationResult('failed');
          }
        } catch (error: any) {
          console.error('Payment verification error:', error);
          setPaymentVerificationResult('failed');
        } finally {
          setPaymentProcessing(false);
        }
      } else if (paymentStatus === 'cancelled') {
        setHasProcessedPayment(true);
        setPaymentVerificationResult('cancelled');

        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);

        // Notify backend about cancellation
        try {
          await apiClient.post('/api/payment/cancel', { projectId });
        } catch (e) {
          console.warn('Failed to notify backend of cancellation:', e);
        }
      }
    };

    handlePaymentCallback();
  }, [projectId, hasProcessedPayment, onNext]);

  // P0-3 FIX: Separate effect for toast notifications based on verification result
  useEffect(() => {
    if (!paymentVerificationResult) return;

    if (paymentVerificationResult === 'success') {
      toast({
        title: "Payment Successful!",
        description: "Your payment has been verified. Redirecting to results...",
      });
    } else if (paymentVerificationResult === 'pending') {
      toast({
        title: "Payment Processing",
        description: "Your payment is still being processed. Please wait...",
      });
    } else if (paymentVerificationResult === 'failed') {
      toast({
        title: "Payment Issue",
        description: "There was an issue with your payment. Please try again.",
        variant: "destructive"
      });
    } else if (paymentVerificationResult === 'cancelled') {
      toast({
        title: "Payment Cancelled",
        description: "You cancelled the payment. You can try again when ready.",
        variant: "default"
      });
    }
  }, [paymentVerificationResult, toast]);

  const paymentMethods = [
    { id: 'card', name: 'Credit/Debit Card', icon: CreditCard, description: 'Visa, Mastercard, American Express' },
    { id: 'paypal', name: 'PayPal', icon: CreditCard, description: 'Pay with your PayPal account' },
    { id: 'bank', name: 'Bank Transfer', icon: CreditCard, description: 'Direct bank transfer' }
  ];

  // Cost confirmation checkpoint handler (U2A2A2U pattern)
  const handleConfirmCost = () => {
    setCostConfirmed(true);
    setShowCostConfirmation(false);
    toast({
      title: "Cost Confirmed",
      description: "You have approved the cost breakdown. Proceeding to payment...",
    });
    // After confirmation, proceed with actual payment
    processPayment();
  };

  // Actual payment processing (called after cost confirmation)
  const processPayment = async () => {
    setPaymentProcessing(true);
    setPaymentError(null);

    try {
      // PHASE 6 FIX: Lock cost to project BEFORE creating checkout session
      // This ensures Stripe checkout uses the SAME cost displayed in UI
      const costToCharge = authoritativeCostCents ? authoritativeCostCents / 100 : finalPrice;
      console.log(`💰 [Payment] Locking cost $${costToCharge.toFixed(2)} to project before checkout`);

      // Save locked cost to project so backend uses it
      try {
        await fetch(`/api/projects/${projectId}/lock-cost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ lockedCostEstimate: costToCharge })
        });
        console.log(`✅ [Payment] Locked cost estimate saved: $${costToCharge.toFixed(2)}`);
      } catch (lockError) {
        console.warn('⚠️ [Payment] Could not lock cost estimate, proceeding anyway:', lockError);
      }

      // Call the payment endpoint to create Stripe checkout session
      const response: any = await apiClient.post('/api/payment/create-checkout-session', {
        projectId,
        paymentMethod,
        costConfirmed: true, // Indicate cost was explicitly confirmed
        amount: costToCharge, // Pass the exact amount displayed to user
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.url) {
        window.location.href = response.url;
        return;
      }

      if (response?.id && !response?.url) {
        const checkoutUrl = `https://checkout.stripe.com/pay/${response.id}`;
        window.location.href = checkoutUrl;
        return;
      }

      // If payment was free (covered by subscription credits)
      if (authoritativeCostCents === 0) {
        try {
          updateProgress({
            currentStep: 'results',
            completedSteps: [...(journeyProgress?.completedSteps || []), 'pricing'],
            paymentStatus: 'paid',
            paymentCompletedAt: new Date().toISOString(),
            stepTimestamps: {
              ...(journeyProgress?.stepTimestamps || {}),
              pricingCompleted: new Date().toISOString()
            }
          });
        } catch (progressError) {
          console.warn('Failed to update pricing step completion:', progressError);
        }

        if (onNext) onNext();
        return;
      }

      throw new Error('Payment session created but no checkout URL received.');
    } catch (error: any) {
      console.error('Payment error:', error);
      const errorMessage = error?.message || error?.error || 'Payment processing failed. Please try again.';
      setPaymentError(errorMessage);
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handlePayment = async () => {
    // Validate we have required data before proceeding
    if (!projectId) {
      setPaymentError('No project selected. Please start a new analysis journey.');
      return;
    }

    if (!selectedPlan) {
      setPaymentError('Please select a pricing plan.');
      return;
    }

    // Enterprise plan requires contact sales
    if (selectedPlan === 'enterprise') {
      window.location.href = '/contact-sales?plan=enterprise';
      return;
    }

    // Get the final amount to charge
    const amountCents = authoritativeCostCents;
    if (!amountCents || amountCents <= 0) {
      setPaymentError('Unable to determine payment amount. Please refresh and try again.');
      return;
    }

    // U2A2A2U Checkpoint: Require explicit cost confirmation before payment
    if (!costConfirmed) {
      setShowCostConfirmation(true);
      return;
    }

    // If already confirmed, proceed directly
    processPayment();
  };

  return (
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

      {/* 🔒 Server Validation Status */}
      {journeyProgress?.analysisResultsId && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">✅ Results Verified by Server</p>
                <p className="text-sm text-green-700">
                  Your execution results have been validated and secured. Pricing is based on verified data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ⚠️ Validation Warning */}
      {validationWarning && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-900">⚠️ Validation Warning</p>
                <p className="text-sm text-yellow-800">{validationWarning}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locked Cost Overview */}
      {projectId && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <ShieldCheck className="w-5 h-5" />
              Journey Cost Summary
            </CardTitle>
            <CardDescription className="text-blue-800">
              {journeyStateError ? 'Unable to load journey state. Displaying latest estimate.' : 'Locked at plan approval and updated after execution.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(journeyStateLoading || journeyStateFetching) && (
              <div className="flex items-center gap-2 text-sm text-blue-800">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Syncing journey cost...</span>
              </div>
            )}
            {!journeyStateLoading && !journeyStateFetching && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className={`rounded-lg border p-3 ${isEstimatedPricing ? 'border-yellow-200 bg-yellow-50' : 'border-blue-100 bg-white'}`}>
                  {/* FIX Issue #10: Show different label for estimated vs locked pricing */}
                  <p className={`text-xs ${isEstimatedPricing ? 'text-yellow-700' : 'text-blue-700'}`}>
                    {isEstimatedPricing ? 'Estimated cost *' : 'Locked cost'}
                  </p>
                  {/* P0-2 FIX: Show skeleton while cost is loading */}
                  {backendCostLoading ? (
                    <Skeleton className="h-7 w-24 mt-1" />
                  ) : (
                    <p className={`text-lg font-semibold ${isEstimatedPricing ? 'text-yellow-900' : 'text-blue-900'}`} data-testid="pricing-locked-cost">
                      {formatCurrency(lockedCostCents ?? authoritativeCostCents, true)}
                    </p>
                  )}
                  {isEstimatedPricing && (
                    <p className="text-xs text-yellow-600 mt-1">* Final cost calculated at checkout</p>
                  )}
                </div>
                <div className="rounded-lg border border-blue-100 bg-white p-3">
                  <p className="text-xs text-blue-700">Spent to date</p>
                  <p className="text-lg font-semibold text-blue-900" data-testid="pricing-spent-cost">
                    {spentCostCents !== null ? formatCurrency(spentCostCents, true) : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-white p-3">
                  <p className="text-xs text-blue-700">Remaining balance</p>
                  <p className="text-lg font-semibold text-blue-900" data-testid="pricing-remaining-cost">
                    {remainingCostCents !== null ? formatCurrency(remainingCostCents, true) : '—'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Project Loading Indicator */}
      {projectLoading && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Shield className="w-4 h-4 animate-pulse" />
              <span>Synchronizing project data from server...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* [STEP 6→7 FIX] Show actual key findings from analysis results */}
      {(journeyProgress as any)?.analysisResults && Array.isArray((journeyProgress as any).analysisResults) && (journeyProgress as any).analysisResults.length > 0 && (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-900">
              <CheckCircle className="w-5 h-5" />
              Key Findings from Your Analysis
            </CardTitle>
            <CardDescription className="text-emerald-700">
              Here's a preview of what was discovered in your data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {((journeyProgress as any).analysisResults as any[]).slice(0, 3).map((result: any, idx: number) => (
                <div key={idx} className="p-3 bg-white rounded-lg border border-emerald-100">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 shrink-0">
                      {result.type || result.analysisType || 'Analysis'}
                    </Badge>
                    <div className="flex-1">
                      {result.title && <p className="font-medium text-emerald-900">{result.title}</p>}
                      {result.summary && <p className="text-sm text-emerald-700 mt-1">{result.summary.slice(0, 150)}{result.summary.length > 150 ? '...' : ''}</p>}
                      {result.keyFindings && Array.isArray(result.keyFindings) && result.keyFindings.length > 0 && (
                        <ul className="mt-2 text-sm text-emerald-600 list-disc list-inside">
                          {result.keyFindings.slice(0, 2).map((finding: string, i: number) => (
                            <li key={i}>{finding.slice(0, 80)}{finding.length > 80 ? '...' : ''}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(journeyProgress as any).analysisResults.length > 3 && (
                <p className="text-sm text-emerald-600 text-center">
                  + {(journeyProgress as any).analysisResults.length - 3} more results available after payment
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Teaser - Preview of what they'll get (only shown after execution) */}
      {!isPreExecution && <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <Zap className="w-5 h-5" />
            Results Preview
          </CardTitle>
          <CardDescription className="text-indigo-700">
            Here's what you'll unlock after payment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-white rounded-lg border border-indigo-100">
              <p className="text-2xl font-bold text-indigo-900">{analysisResults.insightsFound}</p>
              <p className="text-sm text-indigo-600">Key Insights</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border border-indigo-100">
              <p className="text-2xl font-bold text-indigo-900">{analysisResults.resultsGenerated}</p>
              <p className="text-sm text-indigo-600">Recommendations</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border border-indigo-100">
              <p className="text-2xl font-bold text-indigo-900">{analysisResults.totalAnalyses}</p>
              <p className="text-sm text-indigo-600">Visualizations</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border border-indigo-100">
              <p className="text-2xl font-bold text-indigo-900">{journeyType === 'non-tech' ? 3 : 4}</p>
              <p className="text-sm text-indigo-600">Export Formats</p>
            </div>
          </div>
          <div className="p-3 bg-indigo-100/50 rounded-lg border border-indigo-200">
            <p className="text-sm text-indigo-800 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Full access to insights, recommendations, and downloadable reports after payment</span>
            </p>
          </div>
        </CardContent>
      </Card>}

      {/* Analysis Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Analysis Summary
          </CardTitle>
          <CardDescription>
            {isPreExecution ? 'Review your planned analysis scope' : 'Review your completed analysis before payment'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{analysisResults.totalAnalyses}</p>
              <p className="text-sm text-gray-600">{isPreExecution ? 'Planned Analyses' : 'Analyses Completed'}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{(totalDataRows || analysisResults.dataSize).toLocaleString()}</p>
              <p className="text-sm text-gray-600">Data Rows</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{analysisResults.executionTime}</p>
              <p className="text-sm text-gray-600">Execution Time</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{analysisResults.resultsGenerated}</p>
              <p className="text-sm text-gray-600">Results Generated</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              {analysisResults.totalAnalyses} analyses
            </Badge>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              {(totalDataRows || analysisResults.dataSize).toLocaleString()} rows
            </Badge>
            <Badge variant="secondary" className="bg-purple-100 text-purple-800">
              {analysisResults.complexity} complexity
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Usage-Based Pricing Breakdown
          </CardTitle>
          <CardDescription>
            Transparent pricing based on your actual usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {backendCostLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Platform Fee</span>
                  <span className="font-medium">${backendCostEstimate?.breakdown?.basePlatformFee?.toFixed(2) ?? '0.50'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Data Processing ({(totalDataRows || analysisResults.dataSize).toLocaleString()} rows)</span>
                  <span className="font-medium">${backendCostEstimate?.breakdown?.dataProcessing?.toFixed(2) ?? ((totalDataRows / 1000) * 0.10).toFixed(2)}</span>
                </div>

                {/* P0-8 FIX: Show per-analysis breakdown if available */}
                {backendCostEstimate?.breakdown?.perAnalysisBreakdown && backendCostEstimate.breakdown.perAnalysisBreakdown.length > 0 ? (
                  <>
                    <div className="text-sm text-gray-600 font-medium mt-2">Analysis Breakdown ({backendCostEstimate.breakdown.perAnalysisBreakdown.length} types):</div>
                    <div className="pl-4 space-y-1 border-l-2 border-blue-100 ml-2">
                      {backendCostEstimate.breakdown.perAnalysisBreakdown.map((analysis: { type: string; cost: number }, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">{analysis.type}</span>
                          <span className="font-medium text-gray-700">${analysis.cost.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center border-t pt-2">
                      <span className="text-sm text-gray-600">Analysis Subtotal</span>
                      <span className="font-medium">${backendCostEstimate?.breakdown?.analysisExecution?.toFixed(2) ?? '0.00'}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Analysis Execution ({analysisResults.totalAnalyses || 1} {analysisResults.totalAnalyses === 1 ? 'type' : 'types'})</span>
                    <span className="font-medium">${backendCostEstimate?.breakdown?.analysisExecution?.toFixed(2) ?? (1.0 * Math.max(1, analysisResults.totalAnalyses)).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Analysis Count</span>
                  <span className="font-medium">{analysisResults.totalAnalyses || backendCostEstimate?.breakdown?.perAnalysisBreakdown?.length || 1} {isPreExecution ? '(planned)' : ''}</span>
                </div>
              </>
            )}
            <Separator />
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>{isPreExecution ? 'Estimated Total' : 'Final Total'}</span>
              <span className="text-blue-600">{formatCurrency(authoritativeCostCents, true)}</span>
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              {isPreExecution
                ? '💡 This is an estimated cost based on your planned analyses. Final cost is determined after execution.'
                : '💡 This is a one-time cost for this specific analysis. No monthly subscriptions required.'
              }
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Credits Applied (Server) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Subscription Credits Applied
          </CardTitle>
          <CardDescription>
            Your subscription capacity is applied to reduce usage-based pricing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billingLoading && (
            <div className="text-sm text-gray-600">Calculating with your subscription...</div>
          )}
          {!billingLoading && billingError && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Please sign in to see subscription discounts. Pricing shown is standard rate.
              </p>
            </div>
          )}
          {!billingLoading && billingBreakdown && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Gross Usage Cost</span>
                <span className="font-medium">{formatCurrency(billingBreakdown.baseCost, true)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Subscription Credits</span>
                <span className="font-medium text-green-600">- {formatCurrency(billingBreakdown.subscriptionCredits, true)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Final Total</span>
                <span className="text-blue-600">{formatCurrency(lockedCostCents ?? billingBreakdown.totalCost, true)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capacity & Billing Visualization */}
      {billingBreakdown && (
        <div>
          <BillingCapacityDisplay
            breakdown={billingBreakdown as any}
            currentTier={currentTier || 'trial'}
            showDetailedBreakdown={false}
            overrideFinalCost={lockedCostCents ?? billingBreakdown.totalCost}
          />
        </div>
      )}

      {/* Pricing Plans */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Choose Your Plan
          </CardTitle>
          <CardDescription>
            Select the plan that best fits your needs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={`p-6 border rounded-lg cursor-pointer transition-all ${selectedPlan === plan.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  } ${plan.popular ? 'ring-2 ring-blue-500' : ''} ${plan.locked && plan.id !== 'per-analysis' ? 'pointer-events-none opacity-60' : ''
                  }`}
                onClick={() => {
                  if (plan.locked && plan.id !== 'per-analysis') return;
                  setSelectedPlan(plan.id);
                }}
              >
                <div className="text-center mb-4">
                  {plan.popular && (
                    <Badge className="mb-2 bg-blue-600 text-white">Most Popular</Badge>
                  )}
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
                  <div className="mt-3">
                    <span className="text-3xl font-bold text-gray-900">
                      {plan.priceDisplay}
                    </span>
                    {plan.id !== 'enterprise' && (
                      <span className="text-sm text-gray-600 ml-1">/analysis</span>
                    )}
                    {/* P1-1 FIX: Show locked badge when cost is confirmed */}
                    {plan.locked && plan.id === 'per-analysis' && (
                      <Badge className="ml-2 bg-green-100 text-green-800 text-xs">
                        <Shield className="w-3 h-3 mr-1" />
                        Price Locked
                      </Badge>
                    )}
                  </div>
                </div>

                <ul className="space-y-2 text-sm">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                {selectedPlan === plan.id && (
                  <div className="mt-4 text-center">
                    <CheckCircle className="w-5 h-5 text-blue-600 mx-auto" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      {selectedPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Method
            </CardTitle>
            <CardDescription>
              Choose your preferred payment method
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${paymentMethod === method.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  onClick={() => setPaymentMethod(method.id as any)}
                >
                  <div className="flex items-center gap-3">
                    <method.icon className="w-5 h-5 text-gray-600" />
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{method.name}</h4>
                      <p className="text-sm text-gray-600">{method.description}</p>
                    </div>
                    {paymentMethod === method.id && (
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security & Trust */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-900">
            <Shield className="w-5 h-5" />
            Secure Payment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-green-700">
              <Shield className="w-4 h-4" />
              <span>SSL Encrypted</span>
            </div>
            <div className="flex items-center gap-2 text-green-700">
              <Zap className="w-4 h-4" />
              <span>Instant Access</span>
            </div>
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span>30-Day Guarantee</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      {selectedPlan && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <DollarSign className="w-5 h-5" />
              Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Analysis Package</span>
                <span className="font-medium">
                  {pricingPlans.find(p => p.id === selectedPlan)?.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Data Processing</span>
                <span className="font-medium">{(totalDataRows || analysisResults.dataSize).toLocaleString()} rows</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Analyses Included</span>
                <span className="font-medium">{analysisResults.totalAnalyses} analyses</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-lg font-semibold">
                <span className="text-blue-900">Total</span>
                <span className="text-blue-900">
                  {billingBreakdown
                    ? formatCurrency(lockedCostCents ?? billingBreakdown.totalCost, true)
                    : pricingPlans.find(p => p.id === selectedPlan)?.priceDisplay || 'Contact Sales'}
                </span>
              </div>

              {/* Payment Error Display */}
              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-900">Payment Error</p>
                      <p className="text-sm text-red-700">{paymentError}</p>
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={handlePayment}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
                disabled={!selectedPlan || paymentProcessing || !projectId}
              >
                {paymentProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Complete Payment
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Confirmation Checkpoint Dialog (U2A2A2U Pattern) */}
      <Dialog open={showCostConfirmation} onOpenChange={setShowCostConfirmation}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              Confirm Cost Before Payment
            </DialogTitle>
            <DialogDescription>
              Please review and confirm the cost breakdown before proceeding to payment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert className="border-blue-200 bg-blue-50">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                This is a checkpoint to ensure you understand and approve the costs before payment.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Selected Plan</span>
                <span className="font-medium">{pricingPlans.find(p => p.id === selectedPlan)?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Journey Type</span>
                <span className="font-medium capitalize">{journeyType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Data Processed</span>
                <span className="font-medium">{(totalDataRows || analysisResults.dataSize).toLocaleString()} rows</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Analyses Executed</span>
                <span className="font-medium">{analysisResults.totalAnalyses}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total Amount</span>
                <span className="text-blue-600">
                  {formatCurrency(authoritativeCostCents, true)}
                </span>
              </div>
              {billingBreakdown && billingBreakdown.subscriptionCredits > 0 && (
                <div className="text-sm text-green-600 text-center">
                  Includes {formatCurrency(billingBreakdown.subscriptionCredits, true)} in subscription credits applied
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-700">
                By clicking "Confirm and Proceed", you acknowledge that:
              </p>
              <ul className="mt-2 text-sm text-gray-600 list-disc list-inside space-y-1">
                <li>You have reviewed the cost breakdown above</li>
                <li>You authorize the payment amount shown</li>
                <li>You understand this is for one-time analysis access</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCostConfirmation(false)}
            >
              Review Again
            </Button>
            <Button
              onClick={handleConfirmCost}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              Confirm and Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}