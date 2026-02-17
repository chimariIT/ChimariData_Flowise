import { useState, useEffect, useMemo } from "react";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Calculator, Clock, Database, BarChart3, Zap, Crown, Eye, ShieldCheck, Loader2, Ticket, X, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ResultsPreview } from '@/components/results-preview';
import { useProject } from '@/hooks/useProject';
import { useJourneyState } from '@/hooks/useJourneyState';
import { useLocation } from 'wouter';

// Load Stripe only if a valid key is configured
const stripePublicKey = (import.meta.env.VITE_STRIPE_PUBLIC_KEY || '').trim();

// Validate: real Stripe keys are 'pk_test_...' or 'pk_live_...' (>20 chars)
const isValidStripeKey = stripePublicKey.startsWith('pk_') && stripePublicKey.length > 20;

const stripePromise = isValidStripeKey ? loadStripe(stripePublicKey) : null;

// Diagnostic logging for Stripe key status
if (!isValidStripeKey) {
  const keyPrefix = stripePublicKey ? stripePublicKey.substring(0, 12) + '...' : '(empty)';
  console.warn(`[Stripe] Key invalid or missing. Prefix: ${keyPrefix}, Length: ${stripePublicKey.length}. Set VITE_STRIPE_PUBLIC_KEY in .env and restart Vite dev server.`);
} else {
  console.log(`[Stripe] Loaded key: ${stripePublicKey.substring(0, 12)}... (${stripePublicKey.length} chars)`);
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
          // P1-4 FIX: Redirect to execute step (matches Stripe success_url) instead of project dashboard
          // Extract journeyType from current URL path (e.g., /journeys/non-tech/payment) or default to 'non-tech'
          return_url: window.location.origin + `/journeys/${window.location.pathname.match(/\/journeys\/([^/]+)/)?.[1] || 'non-tech'}/execute?projectId=${projectId}&payment=success`,
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
  const [, setLocation] = useLocation();
  const [analysisType, setAnalysisType] = useState<'standard' | 'advanced' | 'custom'>('standard');
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [dataComplexity, setDataComplexity] = useState<string>('');
  const [clientSecret, setClientSecret] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [intentMetrics, setIntentMetrics] = useState<{ lockedCostCents?: number; spentCostCents?: number; remainingCostCents?: number; payableCents?: number } | null>(null);
  const [audienceContext, setAudienceContext] = useState<any>(null);
  // Coupon / discount state
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<{
    campaignId: string;
    couponCode: string;
    discountType: string;
    discountValue: number;
    discountAmountCents: number;
    campaignName: string;
  } | null>(null);
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

  const derivedRemainingCostCents = useMemo(() => {
    if (remainingCostCents !== null && remainingCostCents !== undefined) {
      return remainingCostCents;
    }
    if (lockedCostCents !== null && lockedCostCents !== undefined &&
        spentCostCents !== null && spentCostCents !== undefined) {
      return Math.max(lockedCostCents - spentCostCents, 0);
    }
    return null;
  }, [remainingCostCents, lockedCostCents, spentCostCents]);

  const displayLockedCents = lockedCostCents ?? pricing?.priceInCents ?? null;

  const chargeableCents = useMemo(() => {
    if (intentMetrics?.payableCents !== undefined) {
      return intentMetrics.payableCents;
    }
    if (lockedCostCents !== null && lockedCostCents !== undefined) {
      return derivedRemainingCostCents ?? lockedCostCents;
    }
    return pricing?.priceInCents ?? null;
  }, [intentMetrics, lockedCostCents, derivedRemainingCostCents, pricing]);

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

      // Show error state instead of client-side fallback pricing (which can diverge from server)
      setPricing(null);
      setDataComplexity('');

      toast({
        title: "Pricing Unavailable",
        description: "Unable to calculate pricing from the server. Please refresh the page to try again.",
        variant: "destructive"
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

      // Use discounted amount if coupon is applied
      const amountForIntent = appliedDiscount ? discountedChargeableCents : chargeableCents;

      // If coupon covers full cost, handle differently
      if (appliedDiscount && (amountForIntent === 0 || amountForIntent === null)) {
        // Full discount - no Stripe payment needed, create intent will handle it
        try {
          const response = await apiRequest("POST", "/api/analysis-payment/create-intent", {
            projectId,
            analysisType,
            dataSizeMB: projectData.dataSizeMB,
            recordCount: projectData.recordCount,
            questionsCount: projectData.questions.length,
            payableCents: 0,
            couponCode: appliedDiscount.couponCode
          });

          const data = await response.json();
          if (data?.paymentComplete) {
            toast({
              title: "Coupon Covers Full Cost!",
              description: "Your analysis is starting — no payment required.",
            });
            onSuccess();
            return;
          }
        } catch (err: any) {
          console.error("Full-discount intent error:", err);
          toast({
            title: "Error",
            description: "Failed to apply full discount. Please try again.",
            variant: "destructive",
          });
          return;
        }
      }

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
        payableCents: amountForIntent,
        ...(appliedDiscount ? { couponCode: appliedDiscount.couponCode } : {})
      });

      const data = await response.json();
      if (!data?.success) {
        // If payment was completed via coupon (full discount), handle success
        if (data?.paymentComplete) {
          toast({
            title: "Coupon Covers Full Cost!",
            description: "Your analysis is starting — no payment required.",
          });
          onSuccess();
          return;
        }
        toast({
          title: "Payment Error",
          description: data?.error || 'Failed to create payment intent.',
          variant: "destructive",
        });
        return;
      }

      // If response indicates full payment via coupon
      if (data.paymentComplete) {
        toast({
          title: "Coupon Applied Successfully!",
          description: "Your analysis is starting — coupon covered the full cost.",
        });
        onSuccess();
        return;
      }

      setClientSecret(data.clientSecret);
      setPricing(data.pricing ?? null);
      setDataComplexity(data.dataComplexity ?? dataComplexity);

      const computedRemaining = typeof data.remainingCostCents === 'number'
        ? data.remainingCostCents
        : (typeof data.lockedCostCents === 'number' && typeof data.spentCostCents === 'number'
            ? Math.max(data.lockedCostCents - data.spentCostCents, 0)
            : undefined);

      const payableFromResponse = typeof data.payableCents === 'number'
        ? data.payableCents
        : (computedRemaining ?? amountForIntent ?? undefined);

      setIntentMetrics({
        lockedCostCents: typeof data.lockedCostCents === 'number' ? data.lockedCostCents : undefined,
        spentCostCents: typeof data.spentCostCents === 'number' ? data.spentCostCents : undefined,
        remainingCostCents: computedRemaining,
        payableCents: payableFromResponse,
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

  // --- Coupon handling ---
  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) {
      toast({ title: 'Enter a coupon code', variant: 'destructive' });
      return;
    }

    setCouponLoading(true);
    try {
      const response = await apiRequest('POST', '/api/analysis-payment/validate-coupon', {
        projectId,
        couponCode: code
      });
      const data = await response.json();

      if (!data?.success || !data?.valid) {
        toast({
          title: 'Invalid Coupon',
          description: data?.reason || 'This coupon code is not valid.',
          variant: 'destructive'
        });
        setCouponLoading(false);
        return;
      }

      setAppliedDiscount({
        campaignId: data.campaignId,
        couponCode: data.couponCode,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountAmountCents: data.discountAmountCents,
        campaignName: data.campaignName || data.couponCode
      });

      toast({
        title: 'Coupon Applied!',
        description: `${data.discountType === 'percentage_discount' ? `${data.discountValue}% off` : `$${(data.discountAmountCents / 100).toFixed(2)} off`} applied to your order.`,
      });
    } catch (error: any) {
      console.error('Coupon validation error:', error);
      toast({
        title: 'Coupon Error',
        description: 'Unable to validate coupon. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedDiscount(null);
    setCouponCode('');
  };

  // Compute discounted chargeable amount
  const discountedChargeableCents = useMemo(() => {
    if (!appliedDiscount || chargeableCents === null || chargeableCents === undefined) {
      return chargeableCents;
    }
    return Math.max(0, chargeableCents - appliedDiscount.discountAmountCents);
  }, [chargeableCents, appliedDiscount]);

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
                    {formatCurrency(derivedRemainingCostCents ?? chargeableCents)}
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
                  Cost Details
                </CardTitle>
                <CardDescription>Amount due based on your locked estimate</CardDescription>
              </CardHeader>
              <CardContent>
                {isCalculating ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
                  </div>
                ) : pricing ? (
                  <div className="space-y-4">
                    {/* Per-analysis breakdown when available */}
                    {(pricing.breakdown as any).perAnalysisBreakdown?.length > 1 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Per-analysis costs:</p>
                        {(pricing.breakdown as any).perAnalysisBreakdown.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="capitalize">{item.type.replace(/_/g, ' ')}</span>
                            <span>{formatCurrency(toCents(item.cost))}</span>
                          </div>
                        ))}
                        <Separator className="my-2" />
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Amount Due</span>
                      <span>{formatCurrency(chargeableCents ?? toCents(pricing.finalPrice))}</span>
                    </div>
                    {pricing.source === 'locked' && (
                      <p className="text-xs text-muted-foreground">
                        Based on locked estimate from plan approval.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    Unable to load pricing. Please refresh the page.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Coupon Code Section */}
            {pricing && !clientSecret && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Ticket className="w-4 h-4" />
                    Have a coupon code?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {appliedDiscount ? (
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-200">
                            {appliedDiscount.couponCode}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            {appliedDiscount.discountType === 'percentage_discount'
                              ? `${appliedDiscount.discountValue}% off`
                              : `$${(appliedDiscount.discountAmountCents / 100).toFixed(2)} off`}
                            {' '}&mdash; saving {formatCurrency(appliedDiscount.discountAmountCents)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveCoupon}
                        className="text-green-700 hover:text-red-600 hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter coupon code"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                        className="flex-1"
                        disabled={couponLoading}
                      />
                      <Button
                        onClick={handleApplyCoupon}
                        variant="outline"
                        disabled={couponLoading || !couponCode.trim()}
                      >
                        {couponLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Apply'
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Show discounted total when coupon is applied */}
                  {appliedDiscount && chargeableCents !== null && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Original total</span>
                        <span className="line-through">{formatCurrency(chargeableCents)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Discount</span>
                        <span>-{formatCurrency(appliedDiscount.discountAmountCents)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between text-lg font-semibold">
                        <span>New Total</span>
                        <span>{formatCurrency(discountedChargeableCents)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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
                  {appliedDiscount
                    ? `Proceed to Payment (${formatCurrency(discountedChargeableCents)})`
                    : `Proceed to Payment${chargeableCents !== null ? ` (${formatCurrency(chargeableCents)})` : ''}`
                  }
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
                        onSuccess={() => {
                          // FIX F5: Navigate to execute step after payment success
                          const jType = (project as any)?.journeyType || 'non-tech';
                          setLocation(`/journeys/${jType}/execute?projectId=${projectId}&payment=success`);
                        }}
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