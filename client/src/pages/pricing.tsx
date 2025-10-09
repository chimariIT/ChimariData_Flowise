import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, Sparkles, Users, Shield, Zap, ArrowLeft, User, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SUBSCRIPTION_TIERS } from "@shared/subscription-tiers";
import { apiClient } from "@/lib/api";

interface PricingTier {
  name: string;
  price: number;
  priceLabel: string;
  type?: string;
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

  // Get current user information
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: () => apiClient.getCurrentUser(),
    retry: false,
  });

  // Get user's capacity summary
  const { data: capacitySummary, isLoading: capacityLoading } = useQuery({
    queryKey: ['/api/billing/capacity-summary'],
    queryFn: () => apiClient.get('/api/billing/capacity-summary'),
    enabled: !!currentUser,
    retry: false,
  });

  // Get available subscription tiers from API (V2)
  const { data: pricingData, isLoading: tiersLoading } = useQuery({
    queryKey: ['/api/pricing-v2/tiers'],
    queryFn: () => apiClient.get('/api/pricing-v2/tiers'),
  });

  // Use API tiers if available, otherwise fallback to static tiers
  const tiers = pricingData?.tiers || Object.values(SUBSCRIPTION_TIERS).map(tier => ({
    name: tier.name,
    price: tier.price,
    priceLabel: `$${tier.price}/month`,
    type: tier.id,
    features: [
      `${tier.features.maxFiles} file${tier.features.maxFiles > 1 ? 's' : ''} per month`,
      `${tier.features.maxFileSizeMB}MB max file size`,
      `${tier.features.totalDataVolumeMB}MB total data volume`,
      `${tier.features.aiInsights === -1 ? 'Unlimited' : tier.features.aiInsights} AI insights`,
      `${tier.features.maxAnalysisComponents === -1 ? 'Unlimited' : tier.features.maxAnalysisComponents} analysis components`,
      `${tier.features.maxVisualizations === -1 ? 'Unlimited' : tier.features.maxVisualizations} visualizations`,
      tier.features.dataTransformation ? 'Data transformation' : null,
      tier.features.statisticalAnalysis ? 'Statistical analysis' : null,
      tier.features.advancedInsights ? 'Advanced insights' : null,
      tier.features.piiDetection ? 'PII detection' : null,
      `${tier.features.exportOptions.join(', ')} export`,
      `${tier.features.support} support`
    ].filter(Boolean),
    limits: {
      analysesPerMonth: tier.features.maxAnalysisComponents,
      maxDataSizeMB: tier.features.maxFileSizeMB,
      maxRecords: tier.features.totalDataVolumeMB * 1000, // Rough estimate
      aiQueries: tier.features.aiInsights,
      supportLevel: tier.features.support,
      customModels: tier.features.advancedInsights,
      apiAccess: tier.id === 'enterprise',
      teamCollaboration: tier.id !== 'trial'
    },
    recommended: tier.id === 'professional'
  }));

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

  const isLoading = userLoading || tiersLoading || capacityLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {onBack && (
            <div className="mb-8">
              <Button 
                onClick={onBack}
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>
          )}
          
          <div className="text-center">
            <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
              <Badge variant="outline" className="mb-6 px-4 py-2 bg-primary/10 border-primary/20">
                <Sparkles className="w-4 h-4 mr-2 text-primary" />
                Transparent Pricing
              </Badge>
            
              <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                Choose the Perfect Plan for Your{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/80">
                  Data Journey
                </span>
              </h1>
              
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Flexible pricing that adapts to your needs. Start with our hybrid model that combines subscription benefits with pay-per-analysis flexibility.
              </p>

              {/* Billing Toggle */}
              <div className="flex items-center justify-center mb-12">
                <div className="bg-card p-1 rounded-lg border border-border flex">
                  <button
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      billingCycle === 'monthly'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('yearly')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      billingCycle === 'yearly'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Yearly
                    <Badge className="ml-2 bg-accent text-accent-foreground text-xs">Save 17%</Badge>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* User Status Section */}
      {currentUser && (
        <section className="pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-foreground mb-4 flex items-center justify-center gap-2">
                  <User className="w-6 h-6" />
                  Your Current Plan & Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Current Tier */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">Current Subscription</h3>
                    <div className="p-4 bg-card rounded-lg border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold text-primary">
                          {currentUser.subscriptionTier ? 
                            SUBSCRIPTION_TIERS[currentUser.subscriptionTier]?.name || currentUser.subscriptionTier :
                            'Trial'
                          }
                        </span>
                        <Badge variant="outline" className="bg-primary/10 border-primary/20">
                          {currentUser.subscriptionTier || 'trial'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {currentUser.subscriptionTier ? 
                          `$${SUBSCRIPTION_TIERS[currentUser.subscriptionTier]?.price || 0}/month` :
                          'Free trial'
                        }
                      </p>
                    </div>
                  </div>

                  {/* Usage Summary */}
                  {capacitySummary && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Usage This Month
                      </h3>
                      <div className="space-y-3">
                        {capacitySummary.utilization && Object.entries(capacitySummary.utilization as Record<string, number>).map(([key, percentage]) => (
                          <div key={key} className="p-3 bg-card rounded-lg border border-border">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium text-foreground capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {Number(percentage).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(Number(percentage), 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Hybrid Model Explanation */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-foreground mb-4">
                Our Hybrid Pricing Model
              </CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Transparent per-analysis pricing with optional subscription benefits for power users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">Subscription Benefits</h3>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>Priority processing and faster results</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>Advanced features and customization</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>Unlimited data storage and project history</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>Premium support and expert guidance</span>
                    </li>
                  </ul>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">Pay-Per-Analysis Flexibility</h3>
                  <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-sm font-medium text-primary">
                      <strong>Starting at $25 per analysis</strong> - Simple datasets with basic insights
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>No monthly commitments or contracts</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>Pay only for what you use</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>Perfect for occasional analysis needs</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span>Transparent pricing based on complexity</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="mt-6 p-4 bg-card rounded-lg border border-border">
                <p className="text-sm text-muted-foreground text-center">
                  <strong>How it works:</strong> Start with any subscription plan for base features and priority access. 
                  Additional analyses beyond your plan limits are charged per-analysis starting at $25. 
                  This hybrid approach ensures you get maximum value while maintaining flexibility.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier: any, index: number) => {
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
                      ? 'border-2 border-primary shadow-xl scale-105' 
                      : 'border border-border'
                  } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                  style={{ animationDelay: `${index * 200}ms` }}
                >
                  {tier.recommended && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-4 py-1">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-xl font-bold text-foreground mb-2">
                      {tier.name}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="pt-4 border-t border-slate-200">
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
                        <Link href="/expert-consultation">
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