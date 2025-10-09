import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { apiClient } from "@/lib/api";
import {
  Crown,
  ArrowUp,
  Check,
  X,
  Zap,
  TrendingUp,
  Shield,
  Star,
  Clock,
  Users,
  BarChart3,
  Sparkles,
  AlertTriangle,
  CheckCircle
} from "lucide-react";

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  limits: {
    aiQueries: number;
    projects: number;
    dataSizeMB: number;
    visualizations: number;
  };
  highlighted?: boolean;
  popular?: boolean;
}

interface UpgradeContext {
  reason: 'limit_reached' | 'feature_locked' | 'journey_locked' | 'recommendation';
  currentUsage?: {
    aiQueries: number;
    projects: number;
    dataUsage: number;
  };
  blockedFeature?: string;
  blockedJourney?: string;
  recommendedTier?: string;
}

interface SubscriptionUpgradeFlowProps {
  isOpen: boolean;
  onClose: () => void;
  context?: UpgradeContext;
  redirectAfterUpgrade?: string;
}

export function SubscriptionUpgradeFlow({
  isOpen,
  onClose,
  context,
  redirectAfterUpgrade
}: SubscriptionUpgradeFlowProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { userRoleData, refreshUserRole } = useUserRole();

  const [subscriptionTiers, setSubscriptionTiers] = useState<SubscriptionTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    if (isOpen && userRoleData) {
      loadSubscriptionOptions();
    }
  }, [isOpen, userRoleData]);

  const loadSubscriptionOptions = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/user/subscription-pricing');

      if (response.ok) {
        const data = await response.json();
        const tiers = generateSubscriptionTiers(data.pricing, data.featureComparison, data.userRole);
        setSubscriptionTiers(tiers);

        // Pre-select recommended tier based on context
        if (context?.recommendedTier) {
          setSelectedTier(context.recommendedTier);
        } else {
          // Default to starter tier
          setSelectedTier('starter');
        }
      }
    } catch (error) {
      console.error('Error loading subscription options:', error);
      toast({
        title: "Error",
        description: "Failed to load subscription options",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSubscriptionTiers = (pricing: any, featureComparison: any, userRole: UserRole): SubscriptionTier[] => {
    const roleLabels = {
      'non-tech': 'AI-Guided',
      'business': 'Business',
      'technical': 'Technical',
      'consultation': 'Expert'
    };

    return [
      {
        id: 'starter',
        name: `${roleLabels[userRole]} Starter`,
        price: pricing.starter,
        yearlyPrice: Math.round(pricing.starter * 12 * 0.8), // 20% annual discount
        description: 'Perfect for getting started with enhanced features',
        features: [
          'Enhanced AI query limits',
          'Priority support',
          'Advanced visualizations',
          'Export capabilities',
          'Email support'
        ],
        limits: {
          aiQueries: featureComparison.features.maxAiQueriesPerMonth?.starter || 100,
          projects: featureComparison.features.maxConcurrentProjects?.starter || 3,
          dataSizeMB: featureComparison.features.maxDatasetSizeMB?.starter || 50,
          visualizations: featureComparison.features.maxVisualizationsPerProject?.starter || 10
        },
        popular: true
      },
      {
        id: 'professional',
        name: `${roleLabels[userRole]} Professional`,
        price: pricing.professional,
        yearlyPrice: Math.round(pricing.professional * 12 * 0.8),
        description: 'Advanced features for power users and teams',
        features: [
          'Advanced AI models',
          'Custom integrations',
          'Team collaboration',
          'Advanced analytics',
          'Priority phone support',
          'Custom reporting'
        ],
        limits: {
          aiQueries: featureComparison.features.maxAiQueriesPerMonth?.professional || 1000,
          projects: featureComparison.features.maxConcurrentProjects?.professional || 15,
          dataSizeMB: featureComparison.features.maxDatasetSizeMB?.professional || 500,
          visualizations: featureComparison.features.maxVisualizationsPerProject?.professional || 50
        },
        highlighted: context?.recommendedTier === 'professional'
      },
      {
        id: 'enterprise',
        name: `${roleLabels[userRole]} Enterprise`,
        price: pricing.enterprise,
        yearlyPrice: Math.round(pricing.enterprise * 12 * 0.8),
        description: 'Enterprise-grade features with unlimited scale',
        features: [
          'Unlimited AI queries',
          'White-label options',
          'Dedicated support',
          'Custom integrations',
          'SLA guarantees',
          'Advanced security'
        ],
        limits: {
          aiQueries: 999999,
          projects: 100,
          dataSizeMB: 10000,
          visualizations: 500
        }
      }
    ];
  };

  const getUpgradeReason = () => {
    if (!context) return "Unlock more powerful features";

    switch (context.reason) {
      case 'limit_reached':
        return "You've reached your current plan limits";
      case 'feature_locked':
        return `"${context.blockedFeature}" requires a higher plan`;
      case 'journey_locked':
        return `Access to ${context.blockedJourney} journey requires an upgrade`;
      case 'recommendation':
        return "Based on your usage, we recommend upgrading";
      default:
        return "Upgrade to unlock more features";
    }
  };

  const getCurrentUsagePercentage = (type: 'aiQueries' | 'projects' | 'dataUsage') => {
    if (!context?.currentUsage || !userRoleData?.permissions) return 0;

    const current = context.currentUsage[type];
    let limit = 0;

    switch (type) {
      case 'aiQueries':
        limit = userRoleData.permissions.maxAiQueriesPerMonth;
        break;
      case 'projects':
        limit = userRoleData.permissions.maxConcurrentProjects;
        break;
      case 'dataUsage':
        limit = userRoleData.permissions.maxDatasetSizeMB;
        break;
    }

    if (!limit) return 0;
    return Math.round((current / limit) * 100);
  };

  const handleUpgrade = async () => {
    if (!selectedTier || !userRoleData) return;

    setUpgrading(true);
    try {
      // Create Stripe checkout session for the selected tier
      const response = await apiClient.post('/api/payment/create-subscription', {
        tier: selectedTier,
        billingCycle,
        userRole: userRoleData.userRole,
        redirectUrl: redirectAfterUpgrade || window.location.href
      });

      if (response.ok) {
        const { checkoutUrl } = await response.json();

        // Redirect to Stripe checkout
        window.location.href = checkoutUrl;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      toast({
        title: "Upgrade Failed",
        description: "There was an error processing your upgrade. Please try again.",
        variant: "destructive"
      });
    } finally {
      setUpgrading(false);
    }
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading subscription options...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                Upgrade Your Plan
              </CardTitle>
              <CardDescription>{getUpgradeReason()}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {/* Current Usage Alert */}
          {context?.reason === 'limit_reached' && context.currentUsage && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <h3 className="font-medium text-yellow-800">Usage Limits Reached</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['aiQueries', 'projects', 'dataUsage'].map((type) => {
                  const percentage = getCurrentUsagePercentage(type as any);
                  const labels = {
                    aiQueries: 'AI Queries',
                    projects: 'Projects',
                    dataUsage: 'Data Usage'
                  };

                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{labels[type as keyof typeof labels]}</span>
                        <span className="font-medium">{percentage}%</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Billing Cycle Toggle */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <Button
                variant={billingCycle === 'monthly' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setBillingCycle('monthly')}
              >
                Monthly
              </Button>
              <Button
                variant={billingCycle === 'yearly' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setBillingCycle('yearly')}
                className="relative"
              >
                Yearly
                <Badge className="absolute -top-2 -right-2 text-xs bg-green-500">
                  20% off
                </Badge>
              </Button>
            </div>
          </div>

          {/* Subscription Tiers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {subscriptionTiers.map((tier) => {
              const isSelected = selectedTier === tier.id;
              const price = billingCycle === 'yearly' ? tier.yearlyPrice : tier.price * 12;
              const monthlyPrice = billingCycle === 'yearly' ? tier.yearlyPrice / 12 : tier.price;

              return (
                <Card
                  key={tier.id}
                  className={`cursor-pointer transition-all ${
                    isSelected ? 'ring-2 ring-blue-500' : ''
                  } ${tier.highlighted ? 'border-blue-200 bg-blue-50' : ''} ${
                    tier.popular ? 'relative' : ''
                  }`}
                  onClick={() => setSelectedTier(tier.id)}
                >
                  {tier.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500">
                      Most Popular
                    </Badge>
                  )}

                  <CardHeader className="text-center">
                    <CardTitle className="text-lg">{tier.name}</CardTitle>
                    <div className="text-3xl font-bold">
                      ${monthlyPrice.toFixed(0)}
                      <span className="text-lg font-normal text-gray-500">/month</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="text-sm text-green-600">
                        ${tier.yearlyPrice}/year (save ${(tier.price * 12 - tier.yearlyPrice)})
                      </p>
                    )}
                    <CardDescription>{tier.description}</CardDescription>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-3 mb-4">
                      <div className="text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>AI Queries/month:</span>
                          <span className="font-medium">
                            {tier.limits.aiQueries === 999999 ? 'Unlimited' : tier.limits.aiQueries.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Projects:</span>
                          <span className="font-medium">{tier.limits.projects}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Data Size:</span>
                          <span className="font-medium">{tier.limits.dataSizeMB}MB</span>
                        </div>
                      </div>
                    </div>

                    <Separator className="my-4" />

                    <ul className="space-y-2">
                      {tier.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              Maybe Later
            </Button>
            <Button
              onClick={handleUpgrade}
              disabled={!selectedTier || upgrading}
              className="min-w-[120px]"
            >
              {upgrading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <ArrowUp className="w-4 h-4 mr-2" />
                  Upgrade Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Context-aware upgrade trigger component
export function UpgradeTrigger({
  children,
  reason,
  blockedFeature,
  blockedJourney,
  className = ""
}: {
  children: React.ReactNode;
  reason: UpgradeContext['reason'];
  blockedFeature?: string;
  blockedJourney?: string;
  className?: string;
}) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { userRoleData } = useUserRole();

  const handleTrigger = () => {
    const context: UpgradeContext = {
      reason,
      blockedFeature,
      blockedJourney,
      currentUsage: userRoleData?.currentUsage ? {
        aiQueries: userRoleData.currentUsage.monthlyAIInsights,
        projects: 1, // This would need to be tracked
        dataUsage: userRoleData.currentUsage.monthlyDataVolume
      } : undefined
    };

    setShowUpgrade(true);
  };

  return (
    <>
      <div onClick={handleTrigger} className={className}>
        {children}
      </div>
      <SubscriptionUpgradeFlow
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        context={{
          reason,
          blockedFeature,
          blockedJourney,
          currentUsage: userRoleData?.currentUsage ? {
            aiQueries: userRoleData.currentUsage.monthlyAIInsights,
            projects: 1,
            dataUsage: userRoleData.currentUsage.monthlyDataVolume
          } : undefined
        }}
      />
    </>
  );
}