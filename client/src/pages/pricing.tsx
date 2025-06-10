import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Zap, Crown, Building, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { auth } from "@/lib/api";

interface PricingPageProps {
  onBack: () => void;
  currentTier?: string;
}

export default function PricingPage({ onBack, currentTier = "starter" }: PricingPageProps) {
  const [selectedTier, setSelectedTier] = useState(currentTier);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: providersData } = useQuery({
    queryKey: ["/api/ai/providers"],
    queryFn: async () => {
      const res = await fetch("/api/ai/providers");
      if (!res.ok) throw new Error("Failed to fetch providers");
      return res.json();
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (tier: string) => {
      const res = await apiRequest("POST", "/api/subscription/upgrade", { tier });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Subscription Updated",
        description: "Your subscription has been successfully updated!"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update subscription. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleUpgrade = (tier: string) => {
    if (tier === currentTier) return;
    upgradeMutation.mutate(tier);
    setSelectedTier(tier);
  };

  const tiers = providersData?.tiers || {};

  const tierIcons = {
    starter: <Zap className="w-6 h-6" />,
    professional: <Crown className="w-6 h-6" />,
    enterprise: <Building className="w-6 h-6" />
  };

  const tierColors = {
    starter: "border-green-200 bg-green-50",
    professional: "border-blue-200 bg-blue-50", 
    enterprise: "border-purple-200 bg-purple-50"
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center space-x-2">
                <Crown className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold text-slate-900">Pricing Plans</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Pricing Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Choose the Right Plan for Your Data Journey
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Start free with our platform AI, then upgrade to unlock custom providers and advanced features. 
            Scale at your own pace with our flexible SOP model.
          </p>
        </div>

        {/* SOP Journey Explanation */}
        <div className="bg-white rounded-lg p-8 mb-12 border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 text-center">
            Our SOP (Scale On-Demand) Model
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-green-600">1</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Start Free</h3>
              <p className="text-slate-600">Begin with our platform AI service. No setup, no API keys needed. Start analyzing data immediately.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">2</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Scale Up</h3>
              <p className="text-slate-600">Upgrade when you need more queries or want to use your own AI providers. Pay only for what you use.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-600">3</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Enterprise Ready</h3>
              <p className="text-slate-600">Full control with dedicated infrastructure, custom models, and on-premise deployment options.</p>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {Object.entries(tiers).map(([tierKey, tier]: [string, any]) => (
            <Card 
              key={tierKey} 
              className={`relative ${tierColors[tierKey as keyof typeof tierColors]} ${
                currentTier === tierKey ? 'ring-2 ring-primary' : ''
              }`}
            >
              {currentTier === tierKey && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
                  Current Plan
                </Badge>
              )}
              
              <CardHeader className="text-center pb-8">
                <div className="flex items-center justify-center mb-4">
                  {tierIcons[tierKey as keyof typeof tierIcons]}
                </div>
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tierKey !== 'starter' && tierKey !== 'enterprise' && (
                    <span className="text-slate-600">/month</span>
                  )}
                </div>
                <CardDescription className="mt-2">
                  {tierKey === 'starter' && "Perfect for getting started"}
                  {tierKey === 'professional' && "For growing businesses"}
                  {tierKey === 'enterprise' && "For large organizations"}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-4 mb-8">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Features Included:</h4>
                    <ul className="space-y-2">
                      {tier.features.map((feature: string, index: number) => (
                        <li key={index} className="flex items-start space-x-2">
                          <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-slate-700">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {tier.limitations && tier.limitations.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">Limitations:</h4>
                      <ul className="space-y-1">
                        {tier.limitations.map((limitation: string, index: number) => (
                          <li key={index} className="text-sm text-slate-500">
                            • {limitation}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <Button 
                  className="w-full"
                  variant={currentTier === tierKey ? "outline" : "default"}
                  disabled={currentTier === tierKey || upgradeMutation.isPending}
                  onClick={() => handleUpgrade(tierKey)}
                >
                  {upgradeMutation.isPending ? "Updating..." : 
                   currentTier === tierKey ? "Current Plan" : 
                   tierKey === 'starter' ? "Downgrade" : "Upgrade"}
                </Button>

                {tierKey === 'enterprise' && (
                  <p className="text-xs text-slate-500 text-center mt-2">
                    Contact sales for custom pricing
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-2">Can I change plans anytime?</h3>
              <p className="text-slate-600 text-sm">Yes! Our SOP model allows you to upgrade or downgrade at any time. Changes take effect immediately.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What happens to my data if I downgrade?</h3>
              <p className="text-slate-600 text-sm">Your data remains safe. You'll just have access to fewer monthly queries and features based on your new plan.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Do I need my own API keys?</h3>
              <p className="text-slate-600 text-sm">Not for the Starter plan! We provide platform AI. Professional+ plans let you use your own keys for full control.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How does usage counting work?</h3>
              <p className="text-slate-600 text-sm">Each AI query counts as one usage. Quotas reset monthly. You can always check your current usage in settings.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}