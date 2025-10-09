import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { SubscriptionUpgradeFlow, UpgradeTrigger } from "./SubscriptionUpgradeFlow";
import {
  Sparkles,
  Briefcase,
  Settings,
  MessageSquare,
  Crown,
  TrendingUp,
  BarChart3,
  Code,
  Database,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Lock,
  Zap,
  Users,
  Clock
} from "lucide-react";

interface JourneyUpgradePromptProps {
  journeyType: string;
  currentStep?: string;
  blockedFeature?: string;
  className?: string;
}

export function JourneyUpgradePrompt({
  journeyType,
  currentStep,
  blockedFeature,
  className = ""
}: JourneyUpgradePromptProps) {
  const { userRoleData, canAccessJourney, hasPermission } = useUserRole();
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Don't show if user can already access this journey
  if (!userRoleData || canAccessJourney(journeyType)) {
    return null;
  }

  const getJourneyUpgradeInfo = () => {
    switch (journeyType) {
      case "business":
      case "template_based":
        return {
          title: "Unlock Business Analysis Templates",
          description: "Access pre-built templates for common business scenarios",
          icon: Briefcase,
          features: [
            "KPI dashboard templates",
            "Financial analysis workflows",
            "Market research templates",
            "ROI calculation tools"
          ],
          recommendedTier: "starter",
          color: "blue"
        };

      case "technical":
      case "self_service":
        return {
          title: "Unlock Advanced Technical Tools",
          description: "Full data science toolkit with code generation",
          icon: Settings,
          features: [
            "Python/R code generation",
            "Advanced statistical methods",
            "Custom model parameters",
            "Raw data access",
            "API integrations"
          ],
          recommendedTier: "professional",
          color: "green"
        };

      case "consultation":
        return {
          title: "Expert Consultation Access",
          description: "Work directly with data science experts",
          icon: MessageSquare,
          features: [
            "1-on-1 expert sessions",
            "Custom analysis design",
            "Collaborative workspace",
            "Methodology guidance",
            "Results interpretation"
          ],
          recommendedTier: "professional",
          color: "purple"
        };

      default:
        return {
          title: "Upgrade Required",
          description: "This journey requires a higher subscription tier",
          icon: Crown,
          features: ["Enhanced capabilities", "Priority support"],
          recommendedTier: "starter",
          color: "yellow"
        };
    }
  };

  const upgradeInfo = getJourneyUpgradeInfo();
  const Icon = upgradeInfo.icon;

  return (
    <>
      <Card className={`border-2 border-dashed ${className}`}>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <Icon className={`w-8 h-8 text-${upgradeInfo.color}-500`} />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <Lock className="w-5 h-5 text-gray-400" />
            {upgradeInfo.title}
          </CardTitle>
          <CardDescription>{upgradeInfo.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            {upgradeInfo.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 text-${upgradeInfo.color}-500`} />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>

          <UpgradeTrigger
            reason="journey_locked"
            blockedJourney={journeyType}
            className="w-full"
          >
            <Button className="w-full" size="lg">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to Access
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </UpgradeTrigger>

          <div className="text-center">
            <Badge variant="outline" className="text-xs">
              Current: {userRoleData?.userRole} • {userRoleData?.subscriptionTier}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// Feature-specific upgrade prompts
export function FeatureUpgradePrompt({
  feature,
  description,
  className = ""
}: {
  feature: string;
  description?: string;
  className?: string;
}) {
  const { userRoleData, hasPermission } = useUserRole();

  // Check if user already has access to this feature
  const featurePermissions = {
    'codeGeneration': 'canGenerateCode',
    'advancedAnalytics': 'canAccessAdvancedAnalytics',
    'customAiKeys': 'canUseCustomAiKeys',
    'rawDataAccess': 'canAccessRawData',
    'exportResults': 'canExportResults'
  };

  const permissionKey = featurePermissions[feature as keyof typeof featurePermissions];
  if (permissionKey && hasPermission(permissionKey as any)) {
    return null;
  }

  const getFeatureInfo = () => {
    switch (feature) {
      case 'codeGeneration':
        return {
          title: "Code Generation",
          description: description || "Generate Python/R code for your analysis",
          icon: Code,
          recommendedTier: "professional"
        };
      case 'advancedAnalytics':
        return {
          title: "Advanced Analytics",
          description: description || "Access sophisticated statistical methods",
          icon: BarChart3,
          recommendedTier: "professional"
        };
      case 'customAiKeys':
        return {
          title: "Custom AI Models",
          description: description || "Use your own AI provider API keys",
          icon: Zap,
          recommendedTier: "professional"
        };
      case 'rawDataAccess':
        return {
          title: "Raw Data Access",
          description: description || "Direct access to your datasets",
          icon: Database,
          recommendedTier: "starter"
        };
      default:
        return {
          title: "Premium Feature",
          description: description || "This feature requires an upgrade",
          icon: Crown,
          recommendedTier: "starter"
        };
    }
  };

  const featureInfo = getFeatureInfo();
  const Icon = featureInfo.icon;

  return (
    <Alert className={`border-dashed ${className}`}>
      <Lock className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span>
            <strong>{featureInfo.title}</strong> - {featureInfo.description}
          </span>
        </div>
        <UpgradeTrigger
          reason="feature_locked"
          blockedFeature={feature}
        >
          <Button size="sm" variant="outline">
            Upgrade
          </Button>
        </UpgradeTrigger>
      </AlertDescription>
    </Alert>
  );
}

// Usage limit warning component
export function UsageLimitWarning({ className = "" }: { className?: string }) {
  const { userRoleData } = useUserRole();
  const [showDetails, setShowDetails] = useState(false);

  if (!userRoleData?.currentUsage || !userRoleData?.permissions) {
    return null;
  }

  const { currentUsage, permissions } = userRoleData;
  const derivedLimits = {
    maxAiQueriesPerMonth: permissions.maxAiQueriesPerMonth,
    maxDatasetSizeMB: permissions.maxDatasetSizeMB
  };
  const aiUsagePercent = Math.round((currentUsage.monthlyAIInsights / derivedLimits.maxAiQueriesPerMonth) * 100);
  const dataUsagePercent = Math.round((currentUsage.monthlyDataVolume / derivedLimits.maxDatasetSizeMB) * 100);

  // Only show if approaching limits (75%+)
  if (aiUsagePercent < 75 && dataUsagePercent < 75) {
    return null;
  }

  const getWarningLevel = (percent: number) => {
    if (percent >= 95) return { level: 'critical', color: 'red' };
    if (percent >= 85) return { level: 'high', color: 'orange' };
    return { level: 'medium', color: 'yellow' };
  };

  const aiWarning = getWarningLevel(aiUsagePercent);
  const dataWarning = getWarningLevel(dataUsagePercent);
  const highestWarning = aiUsagePercent > dataUsagePercent ? aiWarning : dataWarning;

  return (
    <Alert className={`border-${highestWarning.color}-200 bg-${highestWarning.color}-50 ${className}`}>
      <AlertTriangle className={`h-4 w-4 text-${highestWarning.color}-600`} />
      <AlertDescription>
        <div className="flex items-center justify-between">
          <div>
            <strong>Approaching Usage Limits</strong>
            <div className="text-sm mt-1">
              {aiUsagePercent >= 75 && (
                <div>AI Queries: {currentUsage.monthlyAIInsights}/{derivedLimits.maxAiQueriesPerMonth} ({aiUsagePercent}%)</div>
              )}
              {dataUsagePercent >= 75 && (
                <div>Data Usage: {currentUsage.monthlyDataVolume}MB/{derivedLimits.maxDatasetSizeMB}MB ({dataUsagePercent}%)</div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDetails(!showDetails)}
            >
              Details
            </Button>
            <UpgradeTrigger reason="limit_reached">
              <Button size="sm">
                Upgrade
              </Button>
            </UpgradeTrigger>
          </div>
        </div>

        {showDetails && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>AI Queries</span>
                <span>{currentUsage.monthlyAIInsights}/{derivedLimits.maxAiQueriesPerMonth}</span>
              </div>
              <Progress value={aiUsagePercent} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Data Storage</span>
                <span>{currentUsage.monthlyDataVolume}MB/{derivedLimits.maxDatasetSizeMB}MB</span>
              </div>
              <Progress value={dataUsagePercent} className="h-2" />
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

// In-journey contextual upgrade suggestions
export function JourneyStepUpgradeSuggestion({
  journeyType,
  currentStep,
  className = ""
}: {
  journeyType: string;
  currentStep: string;
  className?: string;
}) {
  const { userRoleData } = useUserRole();

  if (!userRoleData || userRoleData.subscriptionTier !== 'none') {
    return null;
  }

  const getSuggestionForStep = () => {
    const suggestions: Record<string, Record<string, any>> = {
      'non-tech': {
        'data': {
          title: "Upload Larger Files",
          description: "Increase your data upload limit to 50MB",
          feature: "Higher upload limits"
        },
        'execute': {
          title: "Get More AI Insights",
          description: "Increase from 10 to 50 AI queries per month",
          feature: "Enhanced AI limits"
        }
      },
      'business': {
        'prepare': {
          title: "Business Templates",
          description: "Access pre-built templates for your industry",
          feature: "Industry templates"
        },
        'execute': {
          title: "Advanced Business Analytics",
          description: "KPI dashboards and ROI analysis tools",
          feature: "Business intelligence"
        }
      },
      'technical': {
        'execute': {
          title: "Code Generation",
          description: "Generate Python/R code for your analysis",
          feature: "Technical features"
        },
        'results': {
          title: "Export & Integrate",
          description: "Export results and integrate with external tools",
          feature: "Advanced export"
        }
      }
    };

    return suggestions[journeyType]?.[currentStep];
  };

  const suggestion = getSuggestionForStep();

  if (!suggestion) {
    return null;
  }

  return (
    <Card className={`bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">{suggestion.title}</h4>
              <p className="text-sm text-gray-600">{suggestion.description}</p>
            </div>
          </div>
          <UpgradeTrigger reason="recommendation">
            <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade
            </Button>
          </UpgradeTrigger>
        </div>
      </CardContent>
    </Card>
  );
}

// Collaborative upgrade prompt for team features
export function TeamCollaborationUpgrade({ className = "" }: { className?: string }) {
  const { userRoleData } = useUserRole();

  if (!userRoleData || userRoleData.subscriptionTier === 'professional' || userRoleData.subscriptionTier === 'enterprise') {
    return null;
  }

  return (
    <Card className={`border-purple-200 bg-purple-50 ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600" />
          Invite Your Team
        </CardTitle>
        <CardDescription>
          Collaborate with colleagues and share insights across your organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-purple-600" />
            <span className="text-sm">Share projects and datasets</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-purple-600" />
            <span className="text-sm">Collaborative workspaces</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-purple-600" />
            <span className="text-sm">Team usage analytics</span>
          </div>
        </div>
        <UpgradeTrigger reason="feature_locked" blockedFeature="teamCollaboration">
          <Button className="w-full bg-purple-600 hover:bg-purple-700">
            <Users className="w-4 h-4 mr-2" />
            Enable Team Features
          </Button>
        </UpgradeTrigger>
      </CardContent>
    </Card>
  );
}