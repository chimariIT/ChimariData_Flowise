import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Crown, Zap, BarChart3, Palette, Brain, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  trialResults?: any;
}

const FEATURES = [
  {
    id: 'transformation',
    name: 'Data Transformation',
    description: 'Clean, filter, and reshape your data with advanced Python processing',
    price: 15,
    icon: Zap,
    popular: false
  },
  {
    id: 'analysis',
    name: 'Statistical Analysis',
    description: 'Comprehensive multivariate analysis with correlation, regression, and grouping',
    price: 25,
    icon: BarChart3,
    popular: true
  },
  {
    id: 'visualization',
    name: 'Data Visualizations',
    description: 'Professional charts, graphs, and interactive visualizations',
    price: 20,
    icon: Palette,
    popular: false
  },
  {
    id: 'ai_insights',
    name: 'AI Insights',
    description: 'Intelligent data interpretation with Chimaridata AI technology',
    price: 35,
    icon: Brain,
    popular: true
  }
];

function CheckoutForm({ selectedFeatures, projectId, onSuccess }: { 
  selectedFeatures: string[], 
  projectId?: string,
  onSuccess: () => void
}) {
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
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: 'if_required'
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
          description: "Your features have been unlocked!",
        });
        onSuccess();
      }
    } catch (err) {
      toast({
        title: "Payment Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || isProcessing} className="w-full">
        {isProcessing ? "Processing..." : "Complete Purchase"}
      </Button>
    </form>
  );
}

export function UpgradeModal({ isOpen, onClose, projectId, trialResults }: UpgradeModalProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['analysis']);
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>("");
  const { toast } = useToast();

  const calculatePricing = () => {
    const subtotal = selectedFeatures.reduce((sum, featureId) => {
      const feature = FEATURES.find(f => f.id === featureId);
      return sum + (feature?.price || 0);
    }, 0);

    let discount = 0;
    if (selectedFeatures.length === 2) discount = 0.15;
    else if (selectedFeatures.length === 3) discount = 0.25;
    else if (selectedFeatures.length === 4) discount = 0.35;

    const discountAmount = subtotal * discount;
    const total = subtotal - discountAmount;

    return { subtotal, discount, discountAmount, total };
  };

  const handleFeatureToggle = (featureId: string) => {
    setSelectedFeatures(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const handleProceedToPayment = async () => {
    if (selectedFeatures.length === 0) {
      toast({
        title: "No Features Selected",
        description: "Please select at least one feature to continue",
        variant: "destructive",
      });
      return;
    }

    try {
      const { total } = calculatePricing();
      
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: selectedFeatures,
          amount: total,
          projectId
        })
      });

      const data = await response.json();
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setShowPayment(true);
      } else {
        throw new Error('Failed to create payment intent');
      }
    } catch (error) {
      toast({
        title: "Payment Setup Failed",
        description: "Unable to process payment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    onClose();
    toast({
      title: "Upgrade Successful!",
      description: "Your selected features are now available",
    });
  };

  const pricing = calculatePricing();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Crown className="w-6 h-6 text-yellow-500" />
            Upgrade Your Analysis
          </DialogTitle>
          <DialogDescription>
            Unlock advanced features for deeper insights into your data
          </DialogDescription>
        </DialogHeader>

        {!showPayment ? (
          <div className="space-y-6">
            {/* Current Trial Results Summary */}
            {trialResults && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="text-blue-800">Your Free Trial Results</CardTitle>
                  <CardDescription className="text-blue-600">
                    You've analyzed {trialResults.schema ? Object.keys(trialResults.schema).length : 0} columns
                    with basic insights. Upgrade for advanced multivariate analysis.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            {/* Feature Selection */}
            <div className="grid md:grid-cols-2 gap-4">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                const isSelected = selectedFeatures.includes(feature.id);
                
                return (
                  <Card 
                    key={feature.id} 
                    className={`cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
                    }`}
                    onClick={() => handleFeatureToggle(feature.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-blue-600" />
                          <CardTitle className="text-lg">{feature.name}</CardTitle>
                          {feature.popular && <Badge variant="secondary">Popular</Badge>}
                        </div>
                        <Checkbox 
                          checked={isSelected}
                          onChange={() => handleFeatureToggle(feature.id)}
                        />
                      </div>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        ${feature.price}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pricing Summary */}
            {selectedFeatures.length > 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="text-green-800">Pricing Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal ({selectedFeatures.length} features)</span>
                    <span>${pricing.subtotal}</span>
                  </div>
                  {pricing.discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount ({Math.round(pricing.discount * 100)}%)</span>
                      <span>-${pricing.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold border-t pt-2">
                    <span>Total</span>
                    <span>${pricing.total.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Continue with Free Trial
              </Button>
              <Button 
                onClick={handleProceedToPayment}
                disabled={selectedFeatures.length === 0}
                className="flex-1 flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                Proceed to Payment
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold">Complete Your Purchase</h3>
              <p className="text-gray-600">Total: ${pricing.total.toFixed(2)}</p>
            </div>
            
            {clientSecret && (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm 
                  selectedFeatures={selectedFeatures}
                  projectId={projectId}
                  onSuccess={handlePaymentSuccess}
                />
              </Elements>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}