import { useState, useEffect } from "react";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ArrowLeft, Sparkles, TrendingUp, Users } from "lucide-react";

// Load Stripe
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface SubscribePageProps {
  onBack: () => void;
  selectedPlan?: string;
}

interface PlanFeature {
  name: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: PlanFeature[];
  popular?: boolean;
}

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    period: "month",
    description: "Perfect for trying out AI-powered data analysis",
    features: [
      { name: "50 AI queries per month", included: true },
      { name: "Basic data upload (CSV, Excel)", included: true },
      { name: "Standard AI insights", included: true },
      { name: "Email support", included: true },
      { name: "Advanced analytics", included: false },
      { name: "Priority support", included: false },
      { name: "Custom AI models", included: false }
    ]
  },
  {
    id: "professional",
    name: "Professional",
    price: 29,
    period: "month",
    description: "For serious data analysis and business insights",
    popular: true,
    features: [
      { name: "1,000 AI queries per month", included: true },
      { name: "All data formats supported", included: true },
      { name: "Advanced AI insights", included: true },
      { name: "Priority email support", included: true },
      { name: "Advanced analytics dashboard", included: true },
      { name: "Export capabilities", included: true },
      { name: "Custom AI models", included: false }
    ]
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 99,
    period: "month",
    description: "Unlimited power for enterprise teams",
    features: [
      { name: "Unlimited AI queries", included: true },
      { name: "All data formats + APIs", included: true },
      { name: "Custom AI insights", included: true },
      { name: "24/7 phone & email support", included: true },
      { name: "Advanced analytics dashboard", included: true },
      { name: "Export & integration APIs", included: true },
      { name: "Custom AI models", included: true }
    ]
  }
];

const CheckoutForm = ({ planId, onSuccess }: { planId: string; onSuccess: () => void }) => {
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
          description: "Your subscription is now active!",
        });
        onSuccess();
      }
    } catch (error) {
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        disabled={!stripe || isProcessing}
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
        size="lg"
      >
        {isProcessing ? "Processing..." : "Complete Subscription"}
      </Button>
    </form>
  );
};

export default function SubscribePage({ onBack, selectedPlan = "professional" }: SubscribePageProps) {
  const [clientSecret, setClientSecret] = useState("");
  const [currentStep, setCurrentStep] = useState<"select" | "payment">("select");
  const [selectedPlanId, setSelectedPlanId] = useState(selectedPlan);
  const { toast } = useToast();

  const selectedPlanData = plans.find(p => p.id === selectedPlanId);

  const handlePlanSelect = async (planId: string) => {
    if (planId === "starter") {
      toast({
        title: "Already on Starter Plan",
        description: "You're currently on the free starter plan.",
      });
      return;
    }

    setSelectedPlanId(planId);
    
    try {
      const response = await apiRequest("POST", "/api/subscription", {
        planType: planId
      });
      
      const data = await response.json();
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setCurrentStep("payment");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initialize payment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePaymentSuccess = () => {
    toast({
      title: "Subscription Active!",
      description: `Welcome to ${selectedPlanData?.name}! You now have access to all premium features.`,
    });
    onBack();
  };

  if (currentStep === "payment" && clientSecret) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
        <div className="max-w-2xl mx-auto py-8">
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentStep("select")}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Plans
            </Button>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Complete Your Subscription</span>
                  <Badge variant="secondary">{selectedPlanData?.name}</Badge>
                </CardTitle>
                <CardDescription>
                  You're subscribing to {selectedPlanData?.name} for ${selectedPlanData?.price}/{selectedPlanData?.period}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <CheckoutForm planId={selectedPlanId} onSuccess={handlePaymentSuccess} />
                </Elements>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="max-w-6xl mx-auto py-8">
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={onBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="text-center">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">
              Choose Your Plan
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Unlock the full power of AI-driven data analysis with our flexible pricing plans
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <Card 
              key={plan.id}
              className={`relative ${plan.popular ? 'ring-2 ring-blue-500 scale-105' : ''} hover:shadow-lg transition-all duration-200`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-blue-500 text-white px-4 py-1">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-slate-900">
                    ${plan.price}
                  </span>
                  <span className="text-slate-600">/{plan.period}</span>
                </div>
                <CardDescription className="mt-2">
                  {plan.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center space-x-3">
                      <CheckCircle 
                        className={`w-5 h-5 ${
                          feature.included ? 'text-green-500' : 'text-slate-300'
                        }`} 
                      />
                      <span className={feature.included ? 'text-slate-700' : 'text-slate-400'}>
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  onClick={() => handlePlanSelect(plan.id)}
                  className={`w-full ${
                    plan.id === "starter" 
                      ? "bg-slate-600 hover:bg-slate-700" 
                      : "bg-gradient-to-r from-blue-600 to-indigo-600"
                  }`}
                  variant={plan.id === "starter" ? "secondary" : "default"}
                  size="lg"
                >
                  {plan.id === "starter" ? "Current Plan" : `Upgrade to ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200 max-w-4xl mx-auto">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">
                Why Upgrade to Premium?
              </h3>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Advanced Analytics</h4>
                  <p className="text-sm text-slate-600">
                    Get deeper insights with advanced AI models and predictive analytics
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Priority Support</h4>
                  <p className="text-sm text-slate-600">
                    Get help when you need it with priority email and phone support
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-purple-600" />
                  </div>
                  <h4 className="font-semibold mb-2">Custom AI Models</h4>
                  <p className="text-sm text-slate-600">
                    Train AI models specifically for your industry and data patterns
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}