import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, Sparkles, Users, Shield, Zap, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface PricingTier {
  name: string;
  price: number;
  priceLabel: string;
  features: string[];
  limits: {
    analysesPerMonth: number;
    maxDataSizeMB: number;
    maxRecords: number;
    aiQueries: number;
    supportLevel: string;
    customModels: boolean;
    apiAccess: boolean;
    teamCollaboration: boolean;
  };
  recommended?: boolean;
}

interface PricingPageProps {
  onGetStarted: () => void;
  onSubscribe?: (tier: string) => void;
  onBack?: () => void;
}

export default function PricingPage({ onGetStarted, onSubscribe, onBack }: PricingPageProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const { data: pricingData, isLoading } = useQuery({
    queryKey: ['/api/pricing/tiers'],
  });

  const tiers: PricingTier[] = (pricingData as any)?.tiers || [];

  const getIcon = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'free': return <Sparkles className="w-6 h-6" />;
      case 'professional': return <Zap className="w-6 h-6" />;
      case 'enterprise': return <Shield className="w-6 h-6" />;
      default: return <CheckCircle className="w-6 h-6" />;
    }
  };

  const getYearlyPrice = (monthlyPrice: number) => {
    return Math.round(monthlyPrice * 12 * 0.83); // 17% discount for yearly
  };

  const formatLimit = (value: number) => {
    if (value === -1) return "Unlimited";
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {onBack && (
            <div className="mb-8">
              <Button 
                onClick={onBack}
                variant="ghost"
                className="text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>
          )}
          
          <div className="text-center">
            <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
              <Badge variant="outline" className="mb-6 px-4 py-2 bg-blue-50 border-blue-200">
                <Sparkles className="w-4 h-4 mr-2 text-blue-600" />
                Transparent Pricing
              </Badge>
            
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Choose the Perfect Plan for Your{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                Data Journey
              </span>
            </h1>
            
            <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto">
              Start free with 3 analyses and 10MB data uploads. Scale up as you grow with powerful AI insights and advanced features.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center mb-12">
              <div className="bg-white p-1 rounded-lg border border-slate-200 flex">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    billingCycle === 'monthly'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    billingCycle === 'yearly'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Yearly
                  <Badge className="ml-2 bg-green-100 text-green-700 text-xs">Save 17%</Badge>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier, index) => {
              const displayPrice = billingCycle === 'yearly' && tier.price > 0 
                ? getYearlyPrice(tier.price) 
                : tier.price;
              
              const priceLabel = tier.price === 0 
                ? "Free" 
                : billingCycle === 'yearly' 
                  ? `$${displayPrice}/year` 
                  : `$${tier.price}/month`;

              return (
                <Card 
                  key={tier.name} 
                  className={`relative transition-all duration-300 hover:scale-105 hover:shadow-xl ${
                    tier.recommended 
                      ? 'border-2 border-blue-500 shadow-xl scale-105' 
                      : 'border border-slate-200'
                  } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                  style={{ animationDelay: `${index * 200}ms` }}
                >
                  {tier.recommended && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="text-center pb-6">
                    <div className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${
                      tier.name.toLowerCase() === 'free' ? 'bg-green-100 text-green-600' :
                      tier.name.toLowerCase() === 'professional' ? 'bg-blue-100 text-blue-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      {getIcon(tier.name)}
                    </div>
                    
                    <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                    
                    <div className="mt-4">
                      <div className="text-4xl font-bold text-slate-900">
                        {priceLabel}
                      </div>
                      {tier.price > 0 && billingCycle === 'yearly' && (
                        <div className="text-sm text-slate-500 mt-1">
                          ${tier.price}/month billed annually
                        </div>
                      )}
                    </div>
                    
                    <CardDescription className="mt-4 text-slate-600">
                      {tier.name.toLowerCase() === 'free' && "Perfect for getting started with AI data analysis"}
                      {tier.name.toLowerCase() === 'professional' && "Ideal for growing businesses and data teams"}
                      {tier.name.toLowerCase() === 'enterprise' && "For large organizations with advanced needs"}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Key Limits */}
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Monthly Analyses:</span>
                        <span className="font-medium">{formatLimit(tier.limits.analysesPerMonth)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Max Data Size:</span>
                        <span className="font-medium">{formatLimit(tier.limits.maxDataSizeMB)}MB</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">AI Queries:</span>
                        <span className="font-medium">{formatLimit(tier.limits.aiQueries)}</span>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="space-y-3">
                      {tier.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-start space-x-3">
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-slate-700">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA Button */}
                    <div className="pt-6">
                      <Button 
                        onClick={() => {
                          if (tier.name.toLowerCase() === 'free') {
                            onGetStarted();
                          } else if (onSubscribe) {
                            onSubscribe(tier.name.toLowerCase());
                          }
                        }}
                        className={`w-full py-6 text-lg font-medium transition-all duration-200 ${
                          tier.recommended
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
                            : tier.name.toLowerCase() === 'free'
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        {tier.name.toLowerCase() === 'free' ? 'Start Free' : `Choose ${tier.name}`}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-slate-600">
              Everything you need to know about our pricing and plans
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Can I upgrade or downgrade anytime?</h3>
                <p className="text-slate-600 text-sm">Yes, you can change your plan at any time. Changes take effect immediately with prorated billing.</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">What happens if I exceed my limits?</h3>
                <p className="text-slate-600 text-sm">Free tier users will be prompted to upgrade. Paid plans have overage protection with reasonable additional charges.</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Is my data secure?</h3>
                <p className="text-slate-600 text-sm">Absolutely. We use enterprise-grade encryption and never store your data longer than necessary for analysis.</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Do you offer refunds?</h3>
                <p className="text-slate-600 text-sm">Yes, we offer a 30-day money-back guarantee on all paid plans, no questions asked.</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Can I cancel anytime?</h3>
                <p className="text-slate-600 text-sm">Yes, you can cancel your subscription at any time. You'll continue to have access until your current billing period ends.</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Need a custom plan?</h3>
                <p className="text-slate-600 text-sm">Contact our sales team for custom enterprise solutions with dedicated support and special pricing.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}