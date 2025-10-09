import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUserRole } from "@/hooks/useUserRole";
import { useUsageMonitoring, useUsageStats } from "@/hooks/useUsageMonitoring";
import { SubscriptionUpgradeFlow } from "./SubscriptionUpgradeFlow";
import { JourneyStepUpgradeSuggestion, UsageLimitWarning } from "./JourneyUpgradePrompts";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Gift,
  Clock,
  Zap,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Crown,
  ArrowRight,
  Sparkles,
  Target,
  BarChart3,
  Database
} from "lucide-react";

interface TrialProgress {
  completedSteps: string[];
  totalSteps: number;
  progressPercentage: number;
  timeRemaining: string;
  nextMilestone: string;
}

interface TrialBenefit {
  icon: React.ElementType;
  title: string;
  description: string;
  completed: boolean;
  action?: () => void;
}

export function EnhancedTrialWorkflow() {
  const { userRoleData } = useUserRole();
  const { currentUsage, limits, shouldShowUpgradePrompt } = useUsageMonitoring();
  const usageStats = useUsageStats();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [trialProgress, setTrialProgress] = useState<TrialProgress | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [extendedTrial, setExtendedTrial] = useState(false);

  // Only show for free/trial users
  if (!userRoleData || (userRoleData.subscriptionTier !== 'none' && userRoleData.subscriptionTier !== 'trial')) {
    return null;
  }

  useEffect(() => {
    loadTrialProgress();
  }, [userRoleData]);

  const loadTrialProgress = async () => {
    try {
      const response = await apiClient.get('/api/trial/progress');
      if (response.ok) {
        const data = await response.json();
        setTrialProgress(data);
      }
    } catch (error) {
      console.error('Error loading trial progress:', error);
      // Fallback to mock data
      setTrialProgress({
        completedSteps: ['signup', 'role_selection'],
        totalSteps: 6,
        progressPercentage: 33,
        timeRemaining: '7 days',
        nextMilestone: 'Upload your first dataset'
      });
    }
  };

  const getTrialBenefits = (): TrialBenefit[] => {
    const benefits: TrialBenefit[] = [
      {
        icon: Database,
        title: "Upload Your Data",
        description: "Try our data upload and analysis with up to 5MB files",
        completed: (currentUsage?.dataUploads || 0) > 0,
        action: () => setLocation('/journeys/non-tech/data')
      },
      {
        icon: Sparkles,
        title: "AI-Powered Insights",
        description: `Get ${limits?.maxAiQueries || 10} AI-powered analysis insights`,
        completed: (currentUsage?.aiQueries || 0) > 0,
        action: () => setLocation('/journeys/non-tech/execute')
      },
      {
        icon: BarChart3,
        title: "Create Visualizations",
        description: "Generate beautiful charts and graphs from your data",
        completed: (currentUsage?.visualizationsGenerated || 0) > 0,
        action: () => setLocation('/journeys/non-tech/results')
      },
      {
        icon: Target,
        title: "Explore Journey Types",
        description: "Try different analysis approaches for your use case",
        completed: trialProgress?.completedSteps.includes('journey_exploration') || false,
        action: () => setLocation('/')
      }
    ];

    return benefits;
  };

  const handleExtendTrial = async () => {
    try {
      const response = await apiClient.post('/api/trial/extend');
      if (response.ok) {
        setExtendedTrial(true);
        toast({
          title: "Trial Extended!",
          description: "You've received an additional 7 days to explore our features.",
        });
        await loadTrialProgress();
      }
    } catch (error) {
      toast({
        title: "Extension Failed",
        description: "Unable to extend trial. Please contact support.",
        variant: "destructive"
      });
    }
  };

  const benefits = getTrialBenefits();
  const completedBenefits = benefits.filter(b => b.completed).length;

  return (
    <div className="space-y-4">
      {/* Trial Progress Header */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Gift className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Free Trial Active
                  <Badge variant="secondary">
                    {trialProgress?.timeRemaining || '7 days'} remaining
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Explore our platform with {completedBenefits}/{benefits.length} features unlocked
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowUpgrade(true)}>
              <Crown className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Trial Progress</span>
                <span>{trialProgress?.progressPercentage || 33}%</span>
              </div>
              <Progress value={trialProgress?.progressPercentage || 33} className="h-3" />
              <p className="text-xs text-gray-600 mt-1">
                Next: {trialProgress?.nextMilestone || 'Upload your first dataset'}
              </p>
            </div>

            {/* Usage Overview */}
            {usageStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {usageStats.aiQueries.current}
                  </div>
                  <p className="text-sm text-gray-600">AI Queries Used</p>
                  <p className="text-xs text-gray-500">
                    of {usageStats.aiQueries.limit} included
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {usageStats.dataStorage.current.toFixed(1)}MB
                  </div>
                  <p className="text-sm text-gray-600">Data Uploaded</p>
                  <p className="text-xs text-gray-500">
                    of {usageStats.dataStorage.limit}MB limit
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {usageStats.projects.current}
                  </div>
                  <p className="text-sm text-gray-600">Projects Created</p>
                  <p className="text-xs text-gray-500">
                    of {usageStats.projects.limit} allowed
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage Warnings */}
      <UsageLimitWarning />

      {/* Trial Benefits Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Make the Most of Your Trial</CardTitle>
          <CardDescription>
            Try these key features to see how our platform can help you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    benefit.completed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      benefit.completed
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {benefit.completed ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium">{benefit.title}</h4>
                      <p className="text-sm text-gray-600">{benefit.description}</p>
                    </div>
                  </div>
                  {!benefit.completed && benefit.action && (
                    <Button size="sm" variant="outline" onClick={benefit.action}>
                      Try Now
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Incentives */}
      {shouldShowUpgradePrompt() && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertTriangle className="w-5 h-5" />
              Almost at Your Limits
            </CardTitle>
            <CardDescription>
              You're getting great value from our platform! Upgrade to continue without interruption.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button onClick={() => setShowUpgrade(true)} className="bg-orange-600 hover:bg-orange-700">
                <TrendingUp className="w-4 h-4 mr-2" />
                Upgrade to Continue
              </Button>
              {!extendedTrial && (
                <Button variant="outline" onClick={handleExtendTrial}>
                  <Clock className="w-4 h-4 mr-2" />
                  Extend Trial (7 days)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role-Specific Trial Suggestions */}
      {userRoleData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-800">Perfect for {userRoleData.userRole} Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {userRoleData.userRole === 'non-tech' && (
                  <>
                    <p className="text-sm">• AI guides you through analysis</p>
                    <p className="text-sm">• No coding required</p>
                    <p className="text-sm">• Plain-English insights</p>
                  </>
                )}
                {userRoleData.userRole === 'business' && (
                  <>
                    <p className="text-sm">• Business intelligence templates</p>
                    <p className="text-sm">• KPI dashboards</p>
                    <p className="text-sm">• Executive reporting</p>
                  </>
                )}
                {userRoleData.userRole === 'technical' && (
                  <>
                    <p className="text-sm">• Advanced statistical methods</p>
                    <p className="text-sm">• Code generation</p>
                    <p className="text-sm">• Raw data access</p>
                  </>
                )}
              </div>
              <Button
                size="sm"
                className="w-full mt-3 bg-blue-600"
                onClick={() => setLocation(`/journeys/${userRoleData.userRole}`)}
              >
                Try {userRoleData.userRole.replace('-', ' ')} Features
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardHeader>
              <CardTitle className="text-purple-800">Upgrade Benefits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">• 5x more AI queries</p>
                <p className="text-sm">• 10x larger file uploads</p>
                <p className="text-sm">• Priority support</p>
                <p className="text-sm">• Advanced features</p>
              </div>
              <Button
                size="sm"
                className="w-full mt-3 bg-purple-600"
                onClick={() => setShowUpgrade(true)}
              >
                <Crown className="w-4 h-4 mr-2" />
                See Pricing
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Success Stories / Testimonials */}
      <Card>
        <CardHeader>
          <CardTitle>Others Like You Are Getting Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm italic">
                "I uploaded my sales data and got insights I never would have found manually.
                The AI suggestions were spot-on!"
              </p>
              <p className="text-xs text-gray-600 mt-2">- Marketing Manager, Tech Startup</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm italic">
                "The business templates saved me hours of work. I had executive-ready reports
                in minutes instead of days."
              </p>
              <p className="text-xs text-gray-600 mt-2">- Business Analyst, Fortune 500</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Flow */}
      <SubscriptionUpgradeFlow
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        context={{
          reason: 'recommendation',
          currentUsage: currentUsage ? {
            aiQueries: currentUsage.aiQueries,
            projects: currentUsage.projectsCreated,
            dataUsage: currentUsage.dataVolumeMB
          } : undefined
        }}
      />
    </div>
  );
}

// Mini trial progress widget for showing in journey steps
export function TrialProgressWidget({ className = "" }: { className?: string }) {
  const { userRoleData } = useUserRole();
  const { currentUsage, limits } = useUsageMonitoring();

  if (!userRoleData || userRoleData.subscriptionTier !== 'none') {
    return null;
  }

  if (!currentUsage || !limits) {
    return null;
  }

  const aiUsagePercent = Math.round((currentUsage.aiQueries / limits.maxAiQueries) * 100);
  const dataUsagePercent = Math.round((currentUsage.dataVolumeMB / limits.maxDataVolumeMB) * 100);

  return (
    <Card className={`bg-blue-50 border-blue-200 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-blue-900">Trial Usage</h4>
          <Badge variant="secondary" className="text-xs">
            Free Plan
          </Badge>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>AI Queries</span>
              <span>{currentUsage.aiQueries}/{limits.maxAiQueries}</span>
            </div>
            <Progress value={aiUsagePercent} className="h-2" />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Data Storage</span>
              <span>{currentUsage.dataVolumeMB.toFixed(1)}/{limits.maxDataVolumeMB}MB</span>
            </div>
            <Progress value={dataUsagePercent} className="h-2" />
          </div>
        </div>

        {(aiUsagePercent > 80 || dataUsagePercent > 80) && (
          <Alert className="mt-3 p-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">
              Approaching limits. Consider upgrading to continue.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}