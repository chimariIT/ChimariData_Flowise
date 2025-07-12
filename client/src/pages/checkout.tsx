import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, ShieldCheck, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

// Load Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

interface CheckoutData {
  clientSecret: string;
  analysisId?: string;
  analysisConfig: any;
  pricing: any;
  projectId: string;
}

const CheckoutForm: React.FC<{ checkoutData: CheckoutData }> = ({ checkoutData }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout-success?analysis_id=${checkoutData.analysisId}`,
        },
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment succeeded - execute guided analysis
        try {
          const response = await fetch('/api/execute-guided-analysis', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              analysisId: checkoutData.analysisId,
              paymentIntentId: paymentIntent.id
            })
          });

          if (response.ok) {
            const result = await response.json();
            localStorage.removeItem('guidedAnalysisCheckout');
            toast({
              title: "Payment Successful",
              description: "Your guided analysis has been started and will be processed shortly!",
            });
            setLocation(`/guided-analysis-results/${checkoutData.analysisId}`);
          } else {
            const error = await response.json();
            toast({
              title: "Analysis Start Failed",
              description: error.error || "Payment succeeded but analysis failed to start. Please contact support.",
              variant: "destructive",
            });
          }
        } catch (analysisError) {
          console.error('Analysis execution error:', analysisError);
          toast({
            title: "Analysis Start Failed",
            description: "Payment succeeded but analysis failed to start. Please contact support.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Payment Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <ShieldCheck className="w-4 h-4" />
          <span>Secure payment processing with Stripe</span>
        </div>
        <PaymentElement />
      </div>

      <div className="pt-4 border-t">
        <Button 
          type="submit" 
          className="w-full" 
          disabled={!stripe || isProcessing}
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Processing Payment...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 mr-2" />
              Pay ${checkoutData.pricing.total.toFixed(2)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

const GuidedAnalysisCheckout: React.FC = () => {
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Load checkout data from localStorage
    const storedData = localStorage.getItem('guidedAnalysisCheckout');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setCheckoutData(data);
      } catch (error) {
        console.error('Failed to parse checkout data:', error);
        toast({
          title: "Error",
          description: "Invalid checkout data. Please start over.",
          variant: "destructive",
        });
        setLocation('/dashboard');
      }
    } else {
      toast({
        title: "Error",
        description: "No checkout data found. Please start over.",
        variant: "destructive",
      });
      setLocation('/dashboard');
    }
  }, [setLocation, toast]);

  if (!checkoutData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p>Loading checkout...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Analysis Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Analysis Summary
              </CardTitle>
              <CardDescription>
                Review your guided analysis configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Business Context</h3>
                <p className="text-sm">{checkoutData.analysisConfig.selectedScenario?.scenario || 'Custom Analysis'}</p>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Analysis Type</h3>
                <Badge variant="secondary">{checkoutData.analysisConfig.analysisType}</Badge>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Variables Selected</h3>
                <p className="text-sm">{checkoutData.analysisConfig.selectedVariables?.length || 0} variables</p>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Deliverables</h3>
                <div className="flex flex-wrap gap-1">
                  {checkoutData.analysisConfig.deliverables?.map((deliverable: string, index: number) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {deliverable}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Timeline</h3>
                <p className="text-sm">{checkoutData.analysisConfig.timeline}</p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Payment
              </CardTitle>
              <CardDescription>
                Complete your payment to start the analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Guided Analysis</span>
                  <span className="font-semibold">${checkoutData.pricing.total.toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-500">One-time payment</div>
              </div>

              <Elements 
                stripe={stripePromise} 
                options={{
                  clientSecret: checkoutData.clientSecret,
                  appearance: {
                    theme: 'stripe',
                  },
                }}
              >
                <CheckoutForm checkoutData={checkoutData} />
              </Elements>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GuidedAnalysisCheckout;