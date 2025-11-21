import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  CheckCircle,
  CreditCard,
  Zap,
  Shield,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { apiClient } from "@/lib/api";
import BillingCapacityDisplay from "@/components/BillingCapacityDisplay";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useJourneyState } from "@/hooks/useJourneyState";

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

const mapCapacityBlock = (block: any): Record<string, number> | null => {
  if (!block || typeof block !== 'object') return null;
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

  // 🔒 CRITICAL: Use server-validated session data ONLY
  const {
    session,
    getExecuteData,
    loading: sessionLoading
  } = useProjectSession({
    journeyType: journeyType as 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom'
  });

  const projectId = session?.projectId ?? null;
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

    if (session) {
      if (!session.serverValidated) {
        warning = '⚠️ SECURITY: Execution results have NOT been validated by the server. Pricing may be inaccurate. Please re-run your analysis.';
        console.error('SECURITY ALERT: Attempting to use unvalidated execution results for pricing');
      }

      const serverData = getExecuteData();
      if (serverData) {
        summary = {
          totalAnalyses: serverData.totalAnalyses || serverData.selectedAnalyses?.length || 1,
          dataSize: serverData.dataSize || serverData.resultsGenerated || 1000,
          complexity: serverData.complexity || 'moderate',
          executionTime: serverData.executionTime || '5 minutes',
          resultsGenerated: serverData.resultsGenerated || 0,
          insightsFound: serverData.insightsFound || 0
        };
        return { summary, warning };
      }
    }

    try {
      const cached = localStorage.getItem('chimari_execution_results');
      if (cached) {
        const parsed = JSON.parse(cached);
        warning = warning ?? 'Using cached data. For accurate pricing, please ensure your analysis completed successfully.';
        console.warn('⚠️  Using localStorage fallback (not server-validated)');
        summary = {
          totalAnalyses: parsed.totalAnalyses || parsed.selectedAnalyses?.length || 1,
          dataSize: parsed.dataSize || parsed.resultsGenerated || 1000,
          complexity: parsed.complexity || 'moderate',
          executionTime: parsed.executionTime || '5 minutes',
          resultsGenerated: parsed.resultsGenerated || 0,
          insightsFound: parsed.insightsFound || 0
        };
        return { summary, warning };
      }
    } catch (error) {
      console.error('Failed to load execution results:', error);
      warning = warning ?? '⚠️ We could not load your execution results. Please rerun analysis before payment.';
    }

    warning = warning ?? '⚠️ No execution results found. Please run analysis before viewing pricing.';
    return { summary, warning };
  }, [session, getExecuteData]);

  // Compute dataset size in MB from rows (rough estimate: 10,000 rows ~ 100 MB)
  const datasetSizeMB = useMemo(() =>
    Math.max(1, Math.round(analysisResults.dataSize / 100)),
    [analysisResults.dataSize]
  );

  const calculatePricing = () => {
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
  };

  const finalPrice = calculatePricing();

  const toCents = (amount: unknown): number | null => {
    if (amount === null || amount === undefined) return null;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric * 100);
  };

  const lockedCostCents = useMemo(() => toCents(journeyState?.costs?.estimated), [journeyState]);
  const spentCostCents = useMemo(() => toCents(journeyState?.costs?.spent), [journeyState]);
  const remainingCostCents = useMemo(() => toCents(journeyState?.costs?.remaining), [journeyState]);

  const authoritativeCostCents = useMemo(() => {
    if (lockedCostCents !== null) return lockedCostCents;
    if (typeof billingBreakdown?.totalCost === 'number') return billingBreakdown.totalCost;
    return Math.round(finalPrice * 100);
  }, [lockedCostCents, billingBreakdown?.totalCost, finalPrice]);

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

  const paymentMethods = [
    { id: 'card', name: 'Credit/Debit Card', icon: CreditCard, description: 'Visa, Mastercard, American Express' },
    { id: 'paypal', name: 'PayPal', icon: CreditCard, description: 'Pay with your PayPal account' },
    { id: 'bank', name: 'Bank Transfer', icon: CreditCard, description: 'Direct bank transfer' }
  ];

  const handlePayment = () => {
    // Mock payment processing
    console.log('Processing payment...');
    if (onNext) onNext();
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
      {session?.serverValidated && (
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
                <div className="rounded-lg border border-blue-100 bg-white p-3">
                  <p className="text-xs text-blue-700">Locked estimate</p>
                  <p className="text-lg font-semibold text-blue-900" data-testid="pricing-locked-cost">
                    {formatCurrency(lockedCostCents ?? authoritativeCostCents, true)}
                  </p>
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

      {/* Session Loading Indicator */}
      {sessionLoading && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Shield className="w-4 h-4 animate-pulse" />
              <span>Synchronizing session data from server...</span>
            </div>
          </CardContent>
        </Card>
      )}

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
            breakdown={billingBreakdown} 
            currentTier={currentTier || 'trial'}
            showDetailedBreakdown={false}
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
                className={`p-6 border rounded-lg cursor-pointer transition-all ${
                  selectedPlan === plan.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                } ${plan.popular ? 'ring-2 ring-blue-500' : ''} ${
                  plan.locked && plan.id !== 'per-analysis' ? 'pointer-events-none opacity-60' : ''
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
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    paymentMethod === method.id
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
              
              <Button 
                onClick={handlePayment}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
                disabled={!selectedPlan}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Complete Payment
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}