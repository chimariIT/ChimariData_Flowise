import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Database, 
  Brain, 
  BarChart3, 
  Image, 
  Upload,
  AlertTriangle,
  CheckCircle,
  Info,
  DollarSign,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface CapacityUsage {
  // New usage categories based on business requirements
  storageCapacityMB: number;
  analysisComplexityUnits: number;
  dataIngestionSizeMB: number;
  dataTransformationComplexityUnits: number;
  artifactsComplexityUnits: number;
  // Legacy usage for backward compatibility
  dataVolumeMB: number;
  aiInsights: number;
  analysisComponents: number;
  visualizations: number;
  fileUploads: number;
}

interface CapacityLimits {
  // New usage limits based on business requirements
  maxStorageCapacityMB: number;
  maxAnalysisComplexityUnits: number;
  maxDataIngestionSizeMB: number;
  maxDataTransformationComplexityUnits: number;
  maxArtifactsComplexityUnits: number;
  // Legacy limits for backward compatibility
  maxDataVolumeMB: number;
  maxAiInsights: number;
  maxAnalysisComponents: number;
  maxVisualizations: number;
  maxFileUploads: number;
}

interface UserBalanceDisplayProps {
  currentTier: string;
  usage: CapacityUsage;
  limits: CapacityLimits;
  nextResetAt?: Date;
  showUpgradeSuggestions?: boolean;
}

export default function UserBalanceDisplay({ 
  currentTier, 
  usage, 
  limits, 
  nextResetAt,
  showUpgradeSuggestions = true 
}: UserBalanceDisplayProps) {
  const [subscriptionTiers, setSubscriptionTiers] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch subscription tiers dynamically
  useEffect(() => {
    const fetchSubscriptionTiers = async () => {
      try {
        const response = await fetch('/api/billing/subscription-tiers');
        const data = await response.json();
        if (data.success) {
          setSubscriptionTiers(data.tiers);
        }
      } catch (error) {
        console.error('Error fetching subscription tiers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptionTiers();
  }, []);
  
  const formatBytes = (bytes: number) => {
    if (bytes === -1) return 'Unlimited';
    if (bytes === 0) return '0 MB';
    if (bytes < 1024) return `${bytes} MB`;
    return `${(bytes / 1024).toFixed(1)} GB`;
  };

  const getCapacityStatus = (used: number, limit: number) => {
    if (limit === -1) return 'unlimited';
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return 'critical';
    if (percentage >= 75) return 'warning';
    if (percentage >= 50) return 'moderate';
    return 'good';
  };

  const getCapacityIcon = (status: string) => {
    switch (status) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'moderate':
        return <TrendingUp className="h-4 w-4 text-orange-500" />;
      case 'good':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getCapacityColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'bg-red-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'moderate':
        return 'bg-orange-500';
      case 'good':
        return 'bg-green-500';
      default:
        return 'bg-blue-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'warning':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Warning</Badge>;
      case 'moderate':
        return <Badge variant="outline" className="border-orange-500 text-orange-700">Moderate</Badge>;
      case 'good':
        return <Badge variant="outline" className="border-green-500 text-green-700">Good</Badge>;
      default:
        return <Badge variant="outline">Unlimited</Badge>;
    }
  };

  const capacityItems = [
    {
      key: 'storageCapacityMB',
      label: 'Storage Capacity',
      icon: <Database className="h-4 w-4" />,
      used: usage.storageCapacityMB,
      limit: limits.maxStorageCapacityMB,
      format: formatBytes,
      description: 'Storage capacity used this month'
    },
    {
      key: 'analysisComplexityUnits',
      label: 'Analysis Complexity',
      icon: <Brain className="h-4 w-4" />,
      used: usage.analysisComplexityUnits,
      limit: limits.maxAnalysisComplexityUnits,
      format: (value: number) => value === -1 ? 'Unlimited' : `${value} units`,
      description: 'Analysis complexity units consumed'
    },
    {
      key: 'dataIngestionSizeMB',
      label: 'Data Ingestion Size',
      icon: <Upload className="h-4 w-4" />,
      used: usage.dataIngestionSizeMB,
      limit: limits.maxDataIngestionSizeMB,
      format: formatBytes,
      description: 'Data ingestion size processed'
    },
    {
      key: 'dataTransformationComplexityUnits',
      label: 'Data Transformation',
      icon: <BarChart3 className="h-4 w-4" />,
      used: usage.dataTransformationComplexityUnits,
      limit: limits.maxDataTransformationComplexityUnits,
      format: (value: number) => value === -1 ? 'Unlimited' : `${value} units`,
      description: 'Data transformation complexity units'
    },
    {
      key: 'artifactsComplexityUnits',
      label: 'Artifacts Complexity',
      icon: <Image className="h-4 w-4" />,
      used: usage.artifactsComplexityUnits,
      limit: limits.maxArtifactsComplexityUnits,
      format: (value: number) => value === -1 ? 'Unlimited' : `${value} units`,
      description: 'Artifacts complexity and size units'
    },
  ];

  // Legacy capacity items for backward compatibility
  const legacyCapacityItems = [
    {
      key: 'dataVolumeMB',
      label: 'Data Volume (Legacy)',
      icon: <Database className="h-4 w-4" />,
      used: usage.dataVolumeMB,
      limit: limits.maxDataVolumeMB,
      format: formatBytes,
      description: 'Total data processed this month'
    },
    {
      key: 'aiInsights',
      label: 'AI Insights (Legacy)',
      icon: <Brain className="h-4 w-4" />,
      used: usage.aiInsights,
      limit: limits.maxAiInsights,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
      description: 'AI-powered insights generated'
    },
    {
      key: 'analysisComponents',
      label: 'Analysis Components (Legacy)',
      icon: <BarChart3 className="h-4 w-4" />,
      used: usage.analysisComponents,
      limit: limits.maxAnalysisComponents,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
      description: 'Analysis components executed'
    },
    {
      key: 'visualizations',
      label: 'Visualizations (Legacy)',
      icon: <Image className="h-4 w-4" />,
      used: usage.visualizations,
      limit: limits.maxVisualizations,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
      description: 'Charts and visualizations created'
    },
    {
      key: 'fileUploads',
      label: 'File Uploads (Legacy)',
      icon: <Upload className="h-4 w-4" />,
      used: usage.fileUploads,
      limit: limits.maxFileUploads,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
      description: 'Files uploaded this month'
    },
  ];

  const criticalItems = capacityItems.filter(item => {
    const status = getCapacityStatus(item.used, item.limit);
    return status === 'critical' || status === 'warning';
  });

  const getUpgradeSuggestion = () => {
    if (!showUpgradeSuggestions) return null;
    
    const criticalCount = criticalItems.length;
    if (criticalCount === 0) return null;

    const tierMap: Record<string, string> = {
      'trial': 'Starter',
      'starter': 'Professional', 
      'professional': 'Enterprise'
    };

    const nextTier = tierMap[currentTier];
    if (!nextTier) return null;

    return (
      <Alert className="border-orange-200 bg-orange-50">
        <TrendingUp className="h-4 w-4 text-orange-600" />
        <AlertDescription className="text-orange-800">
          <strong>Upgrade Recommendation:</strong> You're approaching your {currentTier} plan limits. 
          Consider upgrading to <strong>{nextTier}</strong> for increased capacity and better value.
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <div className="space-y-6" data-testid="user-balance-display">
      {/* Header */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <DollarSign className="h-5 w-5" />
            Your Subscription Balance - {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} Plan
          </CardTitle>
          <div className="text-sm text-blue-700">
            {nextResetAt && (
              <span>Usage resets on {nextResetAt.toLocaleDateString()}</span>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* New Usage Categories */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Usage Categories</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {capacityItems.map((item) => {
            const status = getCapacityStatus(item.used, item.limit);
            const percentage = item.limit === -1 ? 0 : (item.used / item.limit) * 100;
            const remaining = item.limit === -1 ? -1 : item.limit - item.used;
            
            return (
              <Card key={item.key} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </CardTitle>
                    {getStatusBadge(status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Usage Stats */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Used</span>
                      <span className="font-medium">{item.format(item.used)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Limit</span>
                      <span className="font-medium">{item.format(item.limit)}</span>
                    </div>
                    {remaining !== -1 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Remaining</span>
                        <span className={`font-medium ${remaining <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {item.format(Math.max(0, remaining))}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {item.limit !== -1 && (
                    <div className="space-y-1">
                      <Progress 
                        value={Math.min(percentage, 100)} 
                        className="h-2"
                        data-testid="capacity-progress"
                      />
                      <div className="text-xs text-gray-500 text-center">
                        {percentage.toFixed(1)}% used
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div className="text-xs text-gray-500">
                    {item.description}
                  </div>

                  {/* Status Icon */}
                  <div className="flex justify-center">
                    {getCapacityIcon(status)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Legacy Capacity Overview (Collapsible) */}
      <details className="border rounded-lg p-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-4">
          Legacy Usage Categories (Click to expand)
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {legacyCapacityItems.map((item) => {
            const status = getCapacityStatus(item.used, item.limit);
            const percentage = item.limit === -1 ? 0 : (item.used / item.limit) * 100;
            const remaining = item.limit === -1 ? -1 : item.limit - item.used;
            
            return (
              <Card key={item.key} className="relative opacity-75">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </CardTitle>
                    {getStatusBadge(status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Usage Stats */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Used</span>
                      <span className="font-medium">{item.format(item.used)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Limit</span>
                      <span className="font-medium">{item.format(item.limit)}</span>
                    </div>
                    {remaining !== -1 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Remaining</span>
                        <span className={`font-medium ${remaining <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {item.format(Math.max(0, remaining))}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {item.limit !== -1 && (
                    <div className="space-y-1">
                      <Progress 
                        value={Math.min(percentage, 100)} 
                        className="h-2"
                        data-testid="capacity-progress"
                      />
                      <div className="text-xs text-gray-500 text-center">
                        {percentage.toFixed(1)}% used
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div className="text-xs text-gray-500">
                    {item.description}
                  </div>

                  {/* Status Icon */}
                  <div className="flex justify-center">
                    {getCapacityIcon(status)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </details>

      {/* Upgrade Suggestions */}
      {getUpgradeSuggestion()}

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Usage Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {capacityItems.filter(item => getCapacityStatus(item.used, item.limit) === 'good').length}
              </div>
              <div className="text-sm text-gray-600">Good Status</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {capacityItems.filter(item => getCapacityStatus(item.used, item.limit) === 'moderate').length}
              </div>
              <div className="text-sm text-gray-600">Moderate Usage</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {capacityItems.filter(item => getCapacityStatus(item.used, item.limit) === 'warning').length}
              </div>
              <div className="text-sm text-gray-600">Warning</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {capacityItems.filter(item => getCapacityStatus(item.used, item.limit) === 'critical').length}
              </div>
              <div className="text-sm text-gray-600">Critical</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Capacity Warnings */}
      {criticalItems.length > 0 && (
        <Alert data-testid="capacity-warning" className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Capacity Alert:</strong> You're approaching or have exceeded limits for{' '}
            {criticalItems.map(item => item.label).join(', ')}. 
            {showUpgradeSuggestions && ' Consider upgrading your plan to avoid service interruptions.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
