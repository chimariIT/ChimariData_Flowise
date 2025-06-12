import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, Sparkles, Users, Shield, Zap, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

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
  onPayPerAnalysis?: () => void;
  onExpertConsultation?: () => void;
}

export default function PricingPage({ onGetStarted, onSubscribe, onBack, onPayPerAnalysis, onExpertConsultation }: PricingPageProps) {
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
                    
                    <CardTitle className="text-2xl font-bold text-slate-900 mb-2">
                      {tier.name}
                    </CardTitle>
                    
                    <div className="mb-4">
                      <div className="text-4xl font-bold text-slate-900">
                        {tier.price === 0 ? 'Free' : 
                         tier.price === -1 ? 'Custom' : 
                         `$${displayPrice}`}
                      </div>
                      {tier.price > 0 && tier.price !== -1 && (
                        <div className="text-slate-600">
                          {billingCycle === 'yearly' ? '/year' : '/month'}
                        </div>
                      )}
                      {tier.price === -1 && (
                        <div className="text-slate-600">
                          Contact for quote
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      {tier.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start">
                          <CheckCircle className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-700 text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-6 border-t border-slate-200">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-slate-900">Analyses</div>
                          <div className="text-slate-600">{formatLimit(tier.limits.analysesPerMonth)}/month</div>
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">Data Size</div>
                          <div className="text-slate-600">{formatLimit(tier.limits.maxDataSizeMB)}MB</div>
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">Records</div>
                          <div className="text-slate-600">{formatLimit(tier.limits.maxRecords)}</div>
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">Support</div>
                          <div className="text-slate-600 capitalize">{tier.limits.supportLevel}</div>
                        </div>
                      </div>
                    </div>

                    {tier.price === -1 ? (
                      <Button asChild className="w-full bg-purple-600 hover:bg-purple-700">
                        <Link href="/enterprise-contact">
                          Contact for Quote
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Link>
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => tier.price === 0 ? onGetStarted() : onSubscribe?.(tier.name)}
                        className={`w-full ${
                          tier.recommended 
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg' 
                            : tier.price === 0
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                      >
                        {tier.price === 0 ? 'Get Started Free' : 'Choose Plan'}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Special Services Section */}
          <div className="mt-16">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Additional Services
              </h2>
              <p className="text-slate-600">
                Professional options for one-time analysis and expert guidance
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-red-50">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <div className="w-6 h-6 bg-orange-600 rounded flex items-center justify-center">
                        <span className="text-white text-sm font-bold">$</span>
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-xl text-slate-900">Pay-per-Analysis</CardTitle>
                      <div className="text-2xl font-bold text-orange-600">$25</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-700 mb-4">
                    Perfect for one-time insights without monthly commitment. Upload your data, get comprehensive analysis and actionable recommendations.
                  </CardDescription>
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      Complete data analysis
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      AI-powered insights
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      Visual reports & charts
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      Downloadable results
                    </div>
                  </div>
                  <Button 
                    onClick={onPayPerAnalysis}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    Start Analysis ($25)
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-slate-900">Expert Consultation</CardTitle>
                      <div className="text-2xl font-bold text-purple-600">$150</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-700 mb-4">
                    1-hour session with our data science experts. Get strategic guidance, data interpretation, and implementation roadmaps.
                  </CardDescription>
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      60-minute video call
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      Data strategy planning
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      Custom recommendations
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      Follow-up summary
                    </div>
                  </div>
                  <Button 
                    onClick={onExpertConsultation}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    Book Consultation ($150)
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}