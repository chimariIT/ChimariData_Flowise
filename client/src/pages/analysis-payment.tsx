import { useState, useEffect, useMemo } from "react";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Calculator, Clock, Database, BarChart3, Zap, Crown, Eye, ShieldCheck, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ResultsPreview } from '@/components/results-preview';
import { useProject } from '@/hooks/useProject';
import { useJourneyState } from '@/hooks/useJourneyState';

// Load Stripe only if a valid key is configured
const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';

// FIX: Check for ALL placeholder/development key patterns
const isValidStripeKey = stripePublicKey &&
  stripePublicKey !== 'pk_test_your_stripe_public_key' &&
  stripePublicKey !== 'pk_test_development_key' &&
  stripePublicKey.startsWith('pk_'); // Real Stripe keys start with 'pk_test_' or 'pk_live_'

const stripePromise = isValidStripeKey ? loadStripe(stripePublicKey) : null;

// Log warning if Stripe isn't properly configured
if (!isValidStripeKey) {
  console.warn('⚠️  Stripe not configured. Set VITE_STRIPE_PUBLIC_KEY to a valid Stripe publishable key.');
}

interface ProjectDataInput {
  name: string;
  recordCount: number;
  dataSizeMB: number;
  schema: any;
  questions: string[];
}

interface AnalysisPaymentProps {
  projectId: string;
  projectData?: ProjectDataInput;  // Made optional - will fetch from API if not provided
  onBack: () => void;
  onSuccess: () => void;
}

interface PricingData {
  finalPrice: number;
  priceInCents: number;
  breakdown: {
    basePrice: number;
    dataSizeCharge: number;
    complexityCharge: number;
    questionsCharge: number;
    analysisTypeCharge: number;
  };
  source?: 'locked' | 'calculated';
}

const AnalysisPaymentForm = ({ projectId, onSuccess }: { projectId: string; analysisType: string; onSuccess: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Check authentication before processing payment
      const token = localStorage.getItem('auth_token');
      if (!token) {
        toast({
          title: "Authentication Error",
          description: "Please sign in again to complete payment.",
          variant: "destructive",
        });
        setIsProcessing(false);
        window.location.href = '/auth';
        return;
      }

      // Verify token is still valid
      const authCheck = await fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!authCheck.ok) {
        // Token expired, clear it and redirect
        localStorage.removeItem('auth_token');
        toast({
          title: "Session Expired",
          description: "Please sign in again to complete payment.",
          variant: "destructive",
        });
        setIsProcessing(false);
        window.location.href = '/auth';
        return;
      }

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + `/projects/${projectId}`,
        },
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment Successful",
          description: "Your analysis is being processed!",
        });
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Payment Error",
        description: "An error occurred during payment processing.",
        variant: "destructive",
      });
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || isProcessing}
        size="lg"
      >
        {isProcessing ? (
          <>
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
            Processing Payment...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 mr-2" />
            Pay & Start Analysis
          </>
        )}
      </Button>
    </form>
  );
};

export default function AnalysisPaymentPage({ projectId, projectData: providedProjectData, onBack, onSuccess }: AnalysisPaymentProps) {
  const [analysisType, setAnalysisType] = useState<'standard' | 'advanced' | 'custom'>('standard');
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [dataComplexity, setDataComplexity] = useState<string>('');
  const [clientSecret, setClientSecret] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [intentMetrics, setIntentMetrics] = useState<{ lockedCostCents?: number; spentCostCents?: number; remainingCostCents?: number; payableCents?: number } | null>(null);
  const [audienceContext, setAudienceContext] = useState<any>(null);
  const { toast } = useToast();

  // 🔒 SSOT: Use useProject hook instead of useProjectSession
  const {
    project,
    journeyProgress,
    isLoading: projectLoading
  } = useProject(projectId);

  // PHASE 10 FIX: Derive projectData from project if not provided
  const projectData: ProjectDataInput = useMemo(() => {
    if (providedProjectData) {
      return providedProjectData;
    }

    // Build from project and journeyProgress
    const jp = journeyProgress || {};
    const joinedData = jp.joinedData || {};

    // Get questions from various sources
    const questions: string[] = [];
    if (Array.isArray(jp.userQuestions)) {
      jp.userQuestions.forEach((q: any) => {
        if (typeof q === 'string') questions.push(q);
        else if (q?.text) questions.push(q.text);
      });
    }

    // Get record count from joinedData or datasets
    const recordCount = joinedData.rowCount || joinedData.recordCount || (project as any)?.recordCount || 0;

    // Estimate data size (rough: 1 row ~ 0.001 MB)
    const dataSizeMB = Math.max(1, Math.ceil(recordCount / 1000));

    return {
      name: (project as any)?.name || 'Unnamed Project',
      recordCount,
      dataSizeMB,
      schema: joinedData.schema || {},
      questions
    };
  }, [providedProjectData, project, journeyProgress]);

  const {
    data: journeyState,
    isLoading: journeyStateLoading,
    isFetching: journeyStateFetching,
    error: journeyStateError
  } = useJourneyState(projectId, { enabled: Boolean(projectId) });

  const toCents = (amount: unknown): number | null => {
    if (amount === null || amount === undefined) return null;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric * 100);
  };

  const lockedCostCents = useMemo(() => {
    if (intentMetrics?.lockedCostCents !== undefined) {
      return intentMetrics.lockedCostCents;
    }
    return toCents(journeyState?.costs?.estimated);
  }, [intentMetrics, journeyState]);

  const spentCostCents = useMemo(() => {
    if (intentMetrics?.spentCostCents !== undefined) {
      return intentMetrics.spentCostCents;
    }
    return toCents(journeyState?.costs?.spent);
  }, [intentMetrics, journeyState]);

  const remainingCostCents = useMemo(() => {
    if (intentMetrics?.remainingCostCents !== undefined) {
      return intentMetrics.remainingCostCents;
    }
    return toCents(journeyState?.costs?.remaining);
  }, [intentMetrics, journeyState]);

  const displayLockedCents = lockedCostCents ?? pricing?.priceInCents ?? null;

  const chargeableCents = useMemo(() => {
    if (intentMetrics?.payableCents !== undefined) {
      return intentMetrics.payableCents;
    }
    if (lockedCostCents !== null && lockedCostCents !== undefined) {
      return remainingCostCents ?? lockedCostCents;
    }
    return pricing?.priceInCents ?? null;
  }, [intentMetrics, lockedCostCents, remainingCostCents, pricing]);

  const formatCurrency = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined || Number.isNaN(cents)) {
      return '—';
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };

  const analysisOptions = [
    {
      id: 'standard',
      name: 'Standard Analysis',
      description: 'Essential insights and basic visualizations',
      icon: BarChart3,
      features: ['Basic statistical analysis', 'Standard charts', '30 minutes processing'],
      multiplier: '1x'
    },
    {
      id: 'advanced',
      name: 'Advanced Analysis',
      description: 'Deep insights with advanced analytics',
      icon: Zap,
      features: ['Advanced statistical models', 'Interactive visualizations', 'Trend analysis', '1-2 hours processing'],
      multiplier: '1.5x'
    },
    {
      id: 'custom',
      name: 'Custom Analysis',
      description: 'Tailored analysis based on your specific questions',
      icon: Crown,
      features: ['Custom AI prompts', 'Specialized insights', 'Custom visualizations', '2-4 hours processing'],
      multiplier: '2x'
    }
  ];

  const calculatePricing = async () => {
    setIsCalculating(true);
    setIntentMetrics(null);
    try {
      // PHASE 11 FIX: First check for locked cost from SSOT (journeyState or journeyProgress)
      const lockedCost = journeyState?.costs?.estimated ||
                         (journeyProgress as any)?.lockedCostEstimate;

      if (typeof lockedCost === 'number' && lockedCost > 0) {
        console.log(`✅ [Payment] Using locked cost from SSOT: $${lockedCost.toFixed(2)}`);
        setPricing({
          finalPrice: lockedCost,
          priceInCents: Math.round(lockedCost * 100),
          breakdown: {
            basePrice: lockedCost,
            dataSizeCharge: 0,
            complexityCharge: 0,
            questionsCharge: 0,
            analysisTypeCharge: 0
          },
          source: 'locked'
        });
        setDataComplexity(projectData.recordCount > 100000 ? 'complex' : projectData.recordCount > 10000 ? 'moderate' : 'simple');
        setIsCalculating(false);
        return;
      }

      // Only call API if no locked cost exists
      const response = await apiRequest("POST", "/api/analysis-payment/calculate", {
        dataSizeMB: projectData.dataSizeMB,
        questionsCount: projectData.questions.length,
        analysisType,
        recordCount: projectData.recordCount
      });

      const data = await response.json();

      if (!data?.success) {
        throw new Error(data?.error || 'Pricing request failed');
      }

      setPricing(data.pricing ?? null);
      setDataComplexity(data.dataComplexity ?? '');
    } catch (error: any) {
      console.error("Pricing calculation error:", error);

      // Fallback pricing calculation if API fails
      const basePrice = 5.00;
      const dataSizeCharge = Math.max(0, (projectData.dataSizeMB - 10) * 0.10);
      const complexityCharge = projectData.recordCount > 100000 ? 15.00 : projectData.recordCount > 10000 ? 8.00 : 0;
      const questionsCharge = Math.max(0, (projectData.questions.length - 3) * 1.00);
      const analysisTypeCharge = analysisType === 'advanced' ? 10.00 : analysisType === 'custom' ? 20.00 : 0;

      const finalPrice = basePrice + dataSizeCharge + complexityCharge + questionsCharge + analysisTypeCharge;

      setPricing({
        finalPrice,
        priceInCents: Math.round(finalPrice * 100),
        breakdown: {
          basePrice,
          dataSizeCharge,
          complexityCharge,
          questionsCharge,
          analysisTypeCharge
        },
        source: 'calculated'
      });

      setDataComplexity(projectData.recordCount > 100000 ? 'complex' : projectData.recordCount > 10000 ? 'moderate' : 'simple');

      toast({
        title: "Using Estimated Pricing",
        description: "Calculated pricing based on project data.",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const createPaymentIntent = async () => {
    try {
      // Check if user is authenticated via token
      const token = localStorage.getItem('auth_token');
      if (!token) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to proceed with payment.",
          variant: "destructive",
        });
        // Redirect to auth page
        window.location.href = '/auth';
        return;
      }

      // Verify token is still valid
      const authCheck = await fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!authCheck.ok) {
        // Token expired, clear it and redirect
        localStorage.removeItem('auth_token');
        toast({
          title: "Session Expired",
          description: "Please sign in again to proceed with payment.",
          variant: "destructive",
        });
        window.location.href = '/auth';
        return;
      }

      const amountForIntent = chargeableCents;
      if (amountForIntent === null || amountForIntent === undefined || Number.isNaN(amountForIntent) || amountForIntent <= 0) {
        toast({
          title: amountForIntent === 0 ? "No Balance Due" : "Pricing Required",
          description: amountForIntent === 0
            ? "This analysis has already been billed in full."
            : "Unable to determine the amount to charge. Please refresh pricing.",
          variant: "destructive",
        });
        return;
      }

      const response = await apiRequest("POST", "/api/analysis-payment/create-intent", {
        projectId,
        analysisType,
        dataSizeMB: projectData.dataSizeMB,
        recordCount: projectData.recordCount,
        questionsCount: projectData.questions.length,
        payableCents: amountForIntent
      });

      const data = await response.json();
      if (!data?.success) {
        toast({
          title: "Payment Error",
          description: data?.error || 'Failed to create payment intent.',
          variant: "destructive",
        });
        return;
      }

      setClientSecret(data.clientSecret);
      setPricing(data.pricing ?? null);
      setDataComplexity(data.dataComplexity ?? dataComplexity);
      setIntentMetrics({
        lockedCostCents: typeof data.lockedCostCents === 'number' ? data.lockedCostCents : undefined,
        spentCostCents: typeof data.spentCostCents === 'number' ? data.spentCostCents : undefined,
        remainingCostCents: typeof data.remainingCostCents === 'number' ? data.remainingCostCents : undefined,
        payableCents: typeof data.payableCents === 'number' ? data.payableCents : undefined,
      });
    } catch (error: any) {
      console.error("Payment creation error:", error);

      let errorMessage = "Failed to create payment. Please try again.";
      if (error.message?.includes("401")) {
        errorMessage = "Authentication expired. Please sign in again.";
      } else if (error.message?.includes("404")) {
        errorMessage = "Project not found. Please go back and try again.";
      } else if (error.message?.includes("400")) {
        errorMessage = "No outstanding balance detected for this analysis.";
      } else if (error.message?.includes("409")) {
        errorMessage = "Payment amount mismatch detected. Refresh the page and retry.";
      }

      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // PHASE 11 FIX: Re-calculate pricing when journeyState or journeyProgress loads
    // to ensure locked cost is picked up from SSOT
    if (!journeyStateLoading && !projectLoading) {
      calculatePricing();
    }
    loadAudienceContext();
  }, [analysisType, journeyState?.costs?.estimated, (journeyProgress as any)?.lockedCostEstimate, journeyStateLoading, projectLoading]);

  const loadAudienceContext = () => {
    // 🔒 Priority: journeyProgress (SSOT)
    if (journeyProgress) {
      setAudienceContext({
        primaryAudience: journeyProgress.audience?.primary || 'mixed',
        secondaryAudiences: journeyProgress.audience?.secondary || [],
        decisionContext: journeyProgress.audience?.decisionContext || '',
        journeyType: 'business'
      });
      return;
    }

    // Fallback defaults
    setAudienceContext({
      primaryAudience: 'mixed',
      secondaryAudiences: [],
      decisionContext: '',
      journeyType: 'business'
    });
  };

  const handleShowPreview = () => {
    setShowPreview(true);
  };

  const handleProceedToPayment = () => {
    setShowPreview(false);
    createPaymentIntent();
  };

  const selectedOption = analysisOptions.find(opt => opt.id === analysisType);

  // Show preview if requested
  if (showPreview && audienceContext) {
    return (
      <ResultsPreview
        projectId={projectId}
        analysisType={analysisType}
        analysisConfig={{
          questions: projectData.questions,
          dataSize: projectData.dataSizeMB,
          recordCount: projectData.recordCount
        }}
        audienceContext={audienceContext}
        onProceedToPayment={handleProceedToPayment}
        onBack={() => setShowPreview(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </Button>
          <div>
            <h1 className="text-3xl font-bold">One-Time Analysis Payment</h1>
            <p className="text-muted-foreground">Pay per analysis • No subscription required</p>
          </div>
        </div>

        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <ShieldCheck className="w-5 h-5" />
              Journey Cost Summary
            </CardTitle>
            <CardDescription className="text-blue-800">
              {journeyStateError ? 'Unable to refresh journey state. Displaying latest estimate.' : 'Locked during plan approval and updated after execution.'}
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
                  <p className="text-lg font-semibold text-blue-900" data-testid="analysis-locked-cost">
                    {formatCurrency(displayLockedCents)}
                  </p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-white p-3">
                  <p className="text-xs text-blue-700">Spent to date</p>
                  <p className="text-lg font-semibold text-blue-900" data-testid="analysis-spent-cost">
                    {formatCurrency(spentCostCents)}
                  </p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-white p-3">
                  <p className="text-xs text-blue-700">Remaining balance</p>
                  <p className="text-lg font-semibold text-blue-900" data-testid="analysis-remaining-cost">
                    {formatCurrency(remainingCostCents ?? chargeableCents)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Project & Analysis Selection */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Project Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium">{projectData.name}</h3>
                  <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-muted-foreground">
                    <div>Records: {projectData.recordCount.toLocaleString()}</div>
                    <div>Size: {projectData.dataSizeMB.toFixed(1)} MB</div>
                    <div>Questions: {projectData.questions.length}</div>
                    <div>Complexity: <Badge variant="outline">{dataComplexity}</Badge></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Analysis Type</CardTitle>
                <CardDescription>Choose your analysis depth and complexity</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={analysisType} onValueChange={(value: any) => setAnalysisType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {analysisOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex items-center gap-2">
                          <option.icon className="w-4 h-4" />
                          {option.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedOption && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <selectedOption.icon className="w-4 h-4" />
                      <span className="font-medium">{selectedOption.name}</span>
                      <Badge variant="secondary">{selectedOption.multiplier}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{selectedOption.description}</p>
                    <ul className="text-sm space-y-1">
                      {selectedOption.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pricing & Payment */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Pricing Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isCalculating ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
                  </div>
                ) : pricing ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Base Analysis</span>
                        <span>{formatCurrency(toCents(pricing.breakdown.basePrice))}</span>
                      </div>
                      {pricing.breakdown.dataSizeCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Data Size Charge</span>
                          <span>+{formatCurrency(toCents(pricing.breakdown.dataSizeCharge))}</span>
                        </div>
                      )}
                      {pricing.breakdown.complexityCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Complexity Charge</span>
                          <span>+{formatCurrency(toCents(pricing.breakdown.complexityCharge))}</span>
                        </div>
                      )}
                      {pricing.breakdown.questionsCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Extra Questions</span>
                          <span>+{formatCurrency(toCents(pricing.breakdown.questionsCharge))}</span>
                        </div>
                      )}
                      {pricing.breakdown.analysisTypeCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Analysis Type</span>
                          <span>+{formatCurrency(toCents(pricing.breakdown.analysisTypeCharge))}</span>
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(pricing.source === 'locked' ? (chargeableCents ?? toCents(pricing.finalPrice)) : toCents(pricing.finalPrice))}</span>
                    </div>
                    {pricing.source === 'locked' && chargeableCents !== null && chargeableCents !== toCents(pricing.finalPrice) && (
                      <p className="text-sm text-muted-foreground">
                        Remaining balance from locked estimate.
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {selectedOption?.features.find(f => f.includes('minute'))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    Calculating pricing...
                  </div>
                )}
              </CardContent>
            </Card>

            {pricing && !clientSecret && (
              <div className="space-y-3">
                <Button
                  onClick={handleShowPreview}
                  className="w-full"
                  size="lg"
                  variant="outline"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Results
                </Button>
                <Button
                  onClick={createPaymentIntent}
                  className="w-full"
                  size="lg"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Proceed to Payment{chargeableCents !== null ? ` (${formatCurrency(chargeableCents)})` : ''}
                </Button>
              </div>
            )}

            {clientSecret && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Details</CardTitle>
                  <CardDescription>
                    Secure payment processing via Stripe
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stripePromise ? (
                    <Elements stripe={stripePromise} options={{ clientSecret }}>
                      <AnalysisPaymentForm
                        projectId={projectId}
                        analysisType={analysisType}
                        onSuccess={onSuccess}
                      />
                    </Elements>
                  ) : (
                    <div className="text-center py-8">
                      <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-amber-500" />
                      <h3 className="text-lg font-semibold mb-2">Payment Processing Unavailable</h3>
                      <p className="text-muted-foreground mb-4">
                        Payment processing is not configured. Please contact support or try again later.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Error: Stripe API key not configured (VITE_STRIPE_PUBLIC_KEY)
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}