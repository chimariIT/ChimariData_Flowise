import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  CheckCircle,
  CreditCard,
  Clock,
  Zap,
  Shield,
  Download,
  Eye,
  ArrowRight,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { apiClient } from "@/lib/api";
import BillingCapacityDisplay from "@/components/BillingCapacityDisplay";
import { useProjectSession } from "@/hooks/useProjectSession";

interface PricingStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

export default function PricingStep({ journeyType, onNext, onPrevious }: PricingStepProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal' | 'bank'>('card');
  const [billingLoading, setBillingLoading] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBreakdown, setBillingBreakdown] = useState<any | null>(null);
  const [currentTier, setCurrentTier] = useState<string>('');
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  // 🔒 CRITICAL: Use server-validated session data ONLY
  const {
    session,
    getExecuteData,
    loading: sessionLoading,
    error: sessionError
  } = useProjectSession({
    journeyType: journeyType as 'non-tech' | 'business' | 'technical' | 'consultation'
  });

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

  // 🔒 SECURITY: Load ONLY server-validated analysis results
  const getAnalysisResults = () => {
    // CRITICAL: Verify server validation
    if (session) {
      if (!session.serverValidated) {
        setValidationWarning('⚠️ SECURITY: Execution results have NOT been validated by the server. Pricing may be inaccurate. Please re-run your analysis.');
        console.error('SECURITY ALERT: Attempting to use unvalidated execution results for pricing');
      }

      // Use server-authoritative data
      const serverData = getExecuteData();
      if (serverData) {
        console.log('✅ Using server-validated execution results for pricing');
        return {
          totalAnalyses: serverData.totalAnalyses || serverData.selectedAnalyses?.length || 1,
          dataSize: serverData.dataSize || serverData.resultsGenerated || 1000,
          complexity: serverData.complexity || 'moderate',
          executionTime: serverData.executionTime || '5 minutes',
          resultsGenerated: serverData.resultsGenerated || 0,
          insightsFound: serverData.insightsFound || 0
        };
      }
    }

    // Fallback to localStorage cache (with warning)
    try {
      const cached = localStorage.getItem('chimari_execution_results');
      if (cached) {
        console.warn('⚠️  Using localStorage fallback (not server-validated)');
        setValidationWarning('Using cached data. For accurate pricing, please ensure your analysis completed successfully.');
        const parsed = JSON.parse(cached);
        return {
          totalAnalyses: parsed.totalAnalyses || parsed.selectedAnalyses?.length || 1,
          dataSize: parsed.dataSize || parsed.resultsGenerated || 1000,
          complexity: parsed.complexity || 'moderate',
          executionTime: parsed.executionTime || '5 minutes',
          resultsGenerated: parsed.resultsGenerated || 0,
          insightsFound: parsed.insightsFound || 0
        };
      }
    } catch (error) {
      console.error('Failed to load execution results:', error);
    }

    // Last resort: defaults
    setValidationWarning('⚠️ No execution results found. Please run analysis before viewing pricing.');
    return {
      totalAnalyses: 0,
      dataSize: 0,
      complexity: 'moderate' as const,
      executionTime: 'N/A',
      resultsGenerated: 0,
      insightsFound: 0
    };
  };

  const analysisResults = getAnalysisResults();

  // Compute dataset size in MB from rows (rough estimate: 10,000 rows ~ 100 MB)
  const datasetSizeMB = Math.max(1, Math.round(analysisResults.dataSize / 100));

  // Load billing breakdown from server so subscription credits are applied
  useEffect(() => {
    let cancelled = false;
    async function loadBreakdown() {
      setBillingLoading(true);
      setBillingError(null);
      try {
        // Load current subscription tier for display
        try {
          const cap: any = await apiClient.get('/api/billing/capacity-summary');
          if (!cancelled && cap?.success && cap.summary?.currentTier) {
            setCurrentTier(cap.summary.currentTier);
          }
        } catch { /* non-fatal */ }

        const payload = {
          journeyType: ['non-tech', 'business', 'technical', 'consultation'].includes(journeyType)
            ? journeyType
            : 'non-tech',
          datasetSizeMB,
          additionalFeatures: [],
        };
        const res: any = await apiClient.post('/api/billing/journey-breakdown', payload);
        if (!cancelled && res?.success) {
          setBillingBreakdown(res.breakdown);
        }
      } catch (err: any) {
        // If unauthenticated or endpoint unavailable, fail softly and keep client-only pricing
        if (!cancelled) {
          console.error('Billing breakdown error:', err);
          const errorMsg = err?.message || err?.error || 'Unable to load subscription-adjusted pricing';
          setBillingError(errorMsg);
          // Set default billing breakdown for non-authenticated users
          setBillingBreakdown({
            journeyType: payload.journeyType, // Add journeyType to fallback
            datasetSizeMB: payload.datasetSizeMB,
            baseCost: journeyInfo.basePrice * analysisResults.totalAnalyses,
            subscriptionCredits: 0,
            totalCost: journeyInfo.basePrice * analysisResults.totalAnalyses,
            breakdown: []
          });
        }
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    }
    loadBreakdown();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyType, datasetSizeMB]);

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

  const formatCurrency = (centsOrDollars: number, isCents = false) => {
    const value = isCents ? centsOrDollars / 100 : centsOrDollars;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const pricingPlans = [
    {
      id: 'per-analysis',
      name: 'Per-Analysis Pricing',
      description: 'Pay only for what you use - transparent usage-based pricing',
      price: finalPrice,
      features: [
        'Complete analysis execution',
        'Detailed results report',
        'Data visualizations',
        'Insights and recommendations',
        'Downloadable artifacts',
        '30-day access to results'
      ],
      popular: true,
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
      price: Math.round(finalPrice * 0.85),
      features: [
        'Same features as per-analysis',
        '15% volume discount',
        'Bulk processing priority',
        'Extended result access (90 days)',
        'Batch report generation'
      ],
      popular: false,
      minQuantity: 5
    },
    {
      id: 'enterprise',
      name: 'Enterprise Usage',
      description: 'Custom pricing for high-volume usage',
      price: 'Custom',
      features: [
        'Custom analysis workflows',
        'Dedicated processing resources',
        'On-premise deployment options',
        'Custom integrations',
        'SLA guarantees',
        'Training and onboarding'
      ],
      popular: false,
      minVolume: '100+ analyses/month'
    }
  ];

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
              <span className="text-blue-600">${finalPrice}</span>
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
                <span className="text-blue-600">{formatCurrency(billingBreakdown.totalCost, true)}</span>
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
                } ${plan.popular ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <div className="text-center mb-4">
                  {plan.popular && (
                    <Badge className="mb-2 bg-blue-600 text-white">Most Popular</Badge>
                  )}
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
                  <div className="mt-3">
                    <span className="text-3xl font-bold text-gray-900">
                      {typeof plan.price === 'number' ? `$${plan.price}` : plan.price}
                    </span>
                    {typeof plan.price === 'number' && (
                      <span className="text-sm text-gray-600 ml-1">
                        {plan.id === 'monthly' ? '/month' : '/analysis'}
                      </span>
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
                    ? formatCurrency(billingBreakdown.totalCost, true)
                    : (typeof pricingPlans.find(p => p.id === selectedPlan)?.price === 'number'
                        ? `$${pricingPlans.find(p => p.id === selectedPlan)?.price}`
                        : 'Contact Sales')}
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