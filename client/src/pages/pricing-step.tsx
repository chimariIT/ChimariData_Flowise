import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

  // Cost confirmation checkpoint state (U2A2A2U pattern)
  const [showCostConfirmation, setShowCostConfirmation] = useState<boolean>(false);
  const [costConfirmed, setCostConfirmed] = useState<boolean>(false);
  const { toast } = useToast();

  // 🔒 SSOT: Use useProject hook instead of useProjectSession
  const {
    projectId,
    journeyProgress,
    updateProgress,
    isLoading: projectLoading
  } = useProject(localStorage.getItem('currentProjectId') || undefined);

  const {
    data: journeyState,
    isLoading: journeyStateLoading,
    isFetching: journeyStateFetching,
    error: journeyStateError
  } = useJourneyState(projectId ?? undefined, { enabled: Boolean(projectId) });

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Analysis Pricing",
          description: "Simple pricing for AI-assisted analysis",
          basePrice: 29,
          icon: DollarSign,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Analysis Pricing",
          description: "Pricing for business template-based analysis",
          basePrice: 39,
          icon: DollarSign,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Analysis Pricing",
          description: "Pricing for advanced technical analysis",
          basePrice: 49,
          icon: DollarSign,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Expert Consultation Pricing",
          description: "Pricing for expert consultation and analysis",
          basePrice: 99,
          icon: DollarSign,
          color: "yellow"
        };
      default:
        return {
          title: "Analysis Pricing",
          description: "Pricing for your data analysis",
          basePrice: 39,
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

  const { summary: analysisResults, warning: validationWarning } = useMemo(() => {
    let warning: string | null = null;
    let summary: AnalysisSummary = { ...defaultAnalysisSummary };

    // 1. Priority: journeyProgress.executionSummary (SSOT)
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

      return { summary, warning };
    }

    // 2. Fallback: Check if execution was completed but summary not saved
    if (journeyProgress?.executionCompletedAt && !journeyProgress?.executionSummary) {
      warning = '⚠️ Execution completed but summary not available. Please refresh the page.';
      // Use defaults but indicate execution happened
      summary = {
        ...defaultAnalysisSummary,
        totalAnalyses: 1, // Assume at least one analysis was run
      };
      return { summary, warning };
    }

    // 3. No execution yet
    warning = '⚠️ No execution results found. Please run analysis before viewing pricing.';
    return { summary, warning };
  }, [journeyProgress]);

  // Compute dataset size in MB from rows (rough estimate: 10,000 rows ~ 100 MB)
  // If dataSize is already in MB, use it directly; otherwise convert from rows
  const datasetSizeMB = useMemo(() => {
    const size = analysisResults.dataSize || 0;
    // If size is less than 1000, assume it's already in MB; otherwise assume it's row count
    if (size < 1000) {
      return Math.max(1, size);
    }
    // Convert rows to MB (rough estimate: 10,000 rows ~ 100 MB)
    return Math.max(1, Math.round(size / 100));
  }, [analysisResults.dataSize]);

  const calculatePricing = useMemo(() => {
    let basePrice = journeyInfo.basePrice;

    // Data size multiplier (per MB)
    const dataSizeCost = Math.max(0, (analysisResults.dataSize - 1000) * 0.001); // $0.001 per MB over 1GB

    // Complexity multiplier
    let complexityMultiplier = 1.0;
    if (analysisResults.complexity === 'moderate') complexityMultiplier = 1.2;
    if (analysisResults.complexity === 'complex') complexityMultiplier = 1.5;
    if (analysisResults.complexity === 'expert') complexityMultiplier = 2.0;

    // Analysis count multiplier (per analysis)
    let analysisMultiplier = 1.0;
    if (analysisResults.totalAnalyses > 2) analysisMultiplier = 1.1;
    if (analysisResults.totalAnalyses > 4) analysisMultiplier = 1.2;

    // Calculate per-analysis cost
    const perAnalysisCost = Math.round((basePrice + dataSizeCost) * complexityMultiplier * analysisMultiplier);

    return perAnalysisCost;
  }, [journeyInfo.basePrice, analysisResults.dataSize, analysisResults.complexity, analysisResults.totalAnalyses]);

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

  // FIX Issue #10: Unified cost calculation with clear source hierarchy
  // Priority: 1. Server-locked cost from plan, 2. Server billing calculation, 3. Client fallback (with warning)
  const authoritativeCostCents = useMemo(() => {
    if (lockedCostCents !== null) {
      console.log('💰 [Issue #10 Fix] Using server-locked cost from plan:', lockedCostCents / 100);
      return lockedCostCents;
    }
    if (typeof billingBreakdown?.totalCost === 'number') {
      console.log('💰 [Issue #10 Fix] Using server billing calculation:', billingBreakdown.totalCost / 100);
      return billingBreakdown.totalCost;
    }
    // Fallback to client-side calculation - warn about potential mismatch
    console.warn('⚠️ [Issue #10 Fix] Using client-side fallback pricing. Server cost not available.');
    console.warn('⚠️ [Issue #10 Fix] This may differ from actual server pricing. User should see "estimate" label.');
    return Math.round(finalPrice * 100);
  }, [lockedCostCents, billingBreakdown?.totalCost, finalPrice]);

  // Track if we're using estimated vs locked pricing
  const isEstimatedPricing = useMemo(() => {
    return lockedCostCents === null && typeof billingBreakdown?.totalCost !== 'number';
  }, [lockedCostCents, billingBreakdown?.totalCost]);

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
        locked: Boolean(lockedCostCents),
        pricingDetails: {
          baseCost: journeyInfo.basePrice,
          dataSizeCost: Math.max(0, (analysisResults.dataSize - 1000) * 0.001),
          complexityMultiplier: analysisResults.complexity === 'moderate' ? 1.2 : analysisResults.complexity === 'complex' ? 1.5 : analysisResults.complexity === 'expert' ? 2.0 : 1.0,
          analysisCount: analysisResults.totalAnalyses
        }
      },
      {
        id: 'volume-discount',
        name: 'Volume Discount',
        description: 'Save 15% when you purchase 5+ analyses',
        priceCents: authoritativeCostCents !== null ? Math.round(authoritativeCostCents * 0.85) : null,
        priceDisplay:
          authoritativeCostCents !== null ? formatCurrency(Math.round(authoritativeCostCents * 0.85), true) : 'Custom',
        features: [
          'Same features as per-analysis',
          '15% volume discount',
          'Bulk processing priority',
          'Extended result access (90 days)',
          'Batch report generation'
        ],
        popular: false,
        locked: Boolean(lockedCostCents),
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
  }, [analysisResults, authoritativeCostCents, journeyInfo.basePrice, lockedCostCents]);

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
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (!paymentStatus || !projectId) return;

    const handlePaymentCallback = async () => {
      if (paymentStatus === 'success' && sessionId) {
        // Verify payment with backend
        try {
          setPaymentProcessing(true);
          const response = await apiClient.post('/api/payment/verify-session', {
            sessionId,
            projectId
          });

          if (response.success && response.paymentStatus === 'paid') {
            toast({
              title: "Payment Successful!",
              description: "Your payment has been verified. Redirecting to results...",
            });

            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);

            // Navigate to dashboard after short delay
            setTimeout(() => {
              if (onNext) {
                onNext();
              }
            }, 1500);
          } else if (response.paymentStatus === 'pending') {
            toast({
              title: "Payment Processing",
              description: "Your payment is still being processed. Please wait...",
            });
          } else {
            toast({
              title: "Payment Issue",
              description: response.message || "There was an issue with your payment. Please try again.",
              variant: "destructive"
            });
          }
        } catch (error: any) {
          console.error('Payment verification error:', error);
          toast({
            title: "Verification Failed",
            description: "Could not verify payment. Please contact support if you were charged.",
            variant: "destructive"
          });
        } finally {
          setPaymentProcessing(false);
        }
      } else if (paymentStatus === 'cancelled') {
        // Handle cancelled payment
        toast({
          title: "Payment Cancelled",
          description: "You cancelled the payment. You can try again when ready.",
          variant: "default"
        });

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
  }, [projectId, onNext, toast]);

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
      // Call the payment endpoint to create Stripe checkout session
      const response: any = await apiClient.post('/api/payment/create-checkout-session', {
        projectId,
        paymentMethod,
        costConfirmed: true, // Indicate cost was explicitly confirmed
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
                  <p className={`text-lg font-semibold ${isEstimatedPricing ? 'text-yellow-900' : 'text-blue-900'}`} data-testid="pricing-locked-cost">
                    {formatCurrency(lockedCostCents ?? authoritativeCostCents, true)}
                  </p>
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

      {/* Results Teaser - Preview of what they'll get */}
      <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
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
              <p className="text-2xl font-bold text-indigo-900">3+</p>
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
      </Card>

      {/* Analysis Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Analysis Summary
          </CardTitle>
          <CardDescription>
            Review your completed analysis before payment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{analysisResults.totalAnalyses}</p>
              <p className="text-sm text-gray-600">Analyses Completed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{analysisResults.dataSize.toLocaleString()}</p>
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
              {analysisResults.dataSize.toLocaleString()} rows
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
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Base Analysis Cost ({journeyType} journey)</span>
              <span className="font-medium">${journeyInfo.basePrice}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Data Processing ({analysisResults.dataSize.toLocaleString()} rows)</span>
              <span className="font-medium">${Math.max(0, (analysisResults.dataSize - 1000) * 0.001).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Complexity Multiplier ({analysisResults.complexity})</span>
              <span className="font-medium">×{analysisResults.complexity === 'moderate' ? '1.2' : analysisResults.complexity === 'complex' ? '1.5' : analysisResults.complexity === 'expert' ? '2.0' : '1.0'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Analysis Count ({analysisResults.totalAnalyses} analyses)</span>
              <span className="font-medium">×{analysisResults.totalAnalyses > 2 ? '1.1' : analysisResults.totalAnalyses > 4 ? '1.2' : '1.0'}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Total Per Analysis</span>
              <span className="text-blue-600">{formatCurrency(authoritativeCostCents, true)}</span>
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              💡 This is a one-time cost for this specific analysis. No monthly subscriptions required.
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
                <span className="font-medium">{analysisResults.dataSize.toLocaleString()} rows</span>
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
                <span className="font-medium">{analysisResults.dataSize.toLocaleString()} rows</span>
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