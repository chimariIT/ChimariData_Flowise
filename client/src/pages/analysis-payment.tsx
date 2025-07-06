import { useState, useEffect } from "react";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Calculator, Clock, Database, BarChart3, Zap, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// the newest Anthropic model is "claude-sonnet-4-20250514" which was released May 14, 2025. Use this by default unless user has already selected claude-3-7-sonnet-20250219
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface AnalysisPaymentProps {
  projectId: string;
  projectData: {
    name: string;
    recordCount: number;
    dataSizeMB: number;
    schema: any;
    questions: string[];
  };
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
      const authCheck = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      
      if (!authCheck.ok) {
        toast({
          title: "Authentication Error",
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
          return_url: window.location.origin + "/dashboard",
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

export default function AnalysisPaymentPage({ projectId, projectData, onBack, onSuccess }: AnalysisPaymentProps) {
  const [analysisType, setAnalysisType] = useState<'standard' | 'advanced' | 'custom'>('standard');
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [dataComplexity, setDataComplexity] = useState<string>('');
  const [clientSecret, setClientSecret] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const { toast } = useToast();

  const analysisOptions = [
    {
      id: 'standard',
      name: 'Standard Analysis',
      description: 'Essential insights and basic visualizations',
      icon: BarChart3,
      features: ['Basic statistical analysis', 'Standard charts', '2-5 minute processing'],
      multiplier: '1x'
    },
    {
      id: 'advanced',
      name: 'Advanced Analysis',
      description: 'Deep insights with advanced analytics',
      icon: Zap,
      features: ['Advanced statistical models', 'Interactive visualizations', 'Trend analysis', '5-15 minute processing'],
      multiplier: '1.5x'
    },
    {
      id: 'custom',
      name: 'Custom Analysis',
      description: 'Tailored analysis based on your specific questions',
      icon: Crown,
      features: ['Custom AI prompts', 'Specialized insights', 'Custom visualizations', '10-30 minute processing'],
      multiplier: '2x'
    }
  ];

  const calculatePricing = async () => {
    setIsCalculating(true);
    try {
      // Calculate pricing without authentication check
      // Authentication will be checked during payment processing

      const response = await apiRequest("POST", "/api/calculate-pricing", {
        dataSizeMB: projectData.dataSizeMB,
        questionsCount: projectData.questions.length,
        analysisType,
        schema: projectData.schema,
        recordCount: projectData.recordCount
      });
      
      const data = await response.json();
      setPricing(data.pricing);
      setDataComplexity(data.dataComplexity);
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
        }
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
      // Check if user is authenticated via session
      const authCheck = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      
      if (!authCheck.ok) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to proceed with payment.",
          variant: "destructive",
        });
        // Redirect to auth page
        window.location.href = '/auth';
        return;
      }

      const response = await apiRequest("POST", "/api/create-analysis-payment", {
        projectId,
        analysisType
      });
      
      const data = await response.json();
      setClientSecret(data.clientSecret);
      setPricing(data.pricing);
      setDataComplexity(data.dataComplexity);
    } catch (error: any) {
      console.error("Payment creation error:", error);
      
      let errorMessage = "Failed to create payment. Please try again.";
      if (error.message?.includes("401")) {
        errorMessage = "Authentication expired. Please sign in again.";
      } else if (error.message?.includes("404")) {
        errorMessage = "Project not found. Please go back and try again.";
      }
      
      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    calculatePricing();
  }, [analysisType]);

  const selectedOption = analysisOptions.find(opt => opt.id === analysisType);

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
                        <span>${pricing.breakdown.basePrice.toFixed(2)}</span>
                      </div>
                      {pricing.breakdown.dataSizeCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Data Size Charge</span>
                          <span>+${pricing.breakdown.dataSizeCharge.toFixed(2)}</span>
                        </div>
                      )}
                      {pricing.breakdown.complexityCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Complexity Charge</span>
                          <span>+${pricing.breakdown.complexityCharge.toFixed(2)}</span>
                        </div>
                      )}
                      {pricing.breakdown.questionsCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Extra Questions</span>
                          <span>+${pricing.breakdown.questionsCharge.toFixed(2)}</span>
                        </div>
                      )}
                      {pricing.breakdown.analysisTypeCharge > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Analysis Type</span>
                          <span>+${pricing.breakdown.analysisTypeCharge.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total</span>
                      <span>${pricing.finalPrice.toFixed(2)}</span>
                    </div>
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
              <Button 
                onClick={createPaymentIntent} 
                className="w-full" 
                size="lg"
              >
                <Zap className="w-4 h-4 mr-2" />
                Proceed to Payment
              </Button>
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
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <AnalysisPaymentForm 
                      projectId={projectId} 
                      analysisType={analysisType}
                      onSuccess={onSuccess} 
                    />
                  </Elements>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}