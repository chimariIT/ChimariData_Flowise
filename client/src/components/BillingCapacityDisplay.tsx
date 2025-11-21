import React from 'react';
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
  Info
} from 'lucide-react';

interface CapacityUsage {
  dataVolumeMB: number;
  aiInsights: number;
  analysisComponents: number;
  visualizations: number;
  fileUploads: number;
}

interface CapacityLimits {
  maxDataVolumeMB: number;
  maxAiInsights: number;
  maxAnalysisComponents: number;
  maxVisualizations: number;
  maxFileUploads: number;
}

interface UtilizationPercentage {
  dataVolume: number;
  aiInsights: number;
  analysisComponents: number;
  visualizations: number;
  fileUploads: number;
}

interface BillingBreakdown {
  journeyType: string;
  datasetSizeMB: number;
  totalCost: number;
  baseCost: number;
  subscriptionCredits: number;
  capacityUsed: CapacityUsage;
  capacityRemaining: CapacityUsage;
  utilizationPercentage: UtilizationPercentage;
  breakdown: {
    description: string;
    cost: number;
    capacityImpact: {
      used: Partial<CapacityUsage>;
      remaining: Partial<CapacityUsage>;
    };
  }[];
}

interface BillingCapacityDisplayProps {
  breakdown: BillingBreakdown;
  currentTier: string;
  showDetailedBreakdown?: boolean;
}

export default function BillingCapacityDisplay({ 
  breakdown, 
  currentTier, 
  showDetailedBreakdown = true 
}: BillingCapacityDisplayProps) {
  
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

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
    return 'good';
  };

  const getCapacityIcon = (status: string) => {
    switch (status) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
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
      case 'good':
        return 'bg-green-500';
      default:
        return 'bg-blue-500';
    }
  };

  // Safely access breakdown properties with fallbacks
  const capacityUsed = breakdown?.capacityUsed || {
    dataVolumeMB: 0,
    aiInsights: 0,
    analysisComponents: 0,
    visualizations: 0,
    fileUploads: 0
  };

  const capacityRemaining = breakdown?.capacityRemaining || {
    dataVolumeMB: 0,
    aiInsights: 0,
    analysisComponents: 0,
    visualizations: 0,
    fileUploads: 0
  };

  const utilizationPercentage = breakdown?.utilizationPercentage || {
    dataVolume: 0,
    aiInsights: 0,
    analysisComponents: 0,
    visualizations: 0,
    fileUploads: 0
  };

  const capacityItems = [
    {
      key: 'dataVolume',
      label: 'Data Volume',
      icon: <Database className="h-4 w-4" />,
      used: capacityUsed.dataVolumeMB,
      remaining: capacityRemaining.dataVolumeMB,
      limit:
        capacityUsed.dataVolumeMB === -1 || capacityRemaining.dataVolumeMB === -1
          ? -1
          : capacityUsed.dataVolumeMB + capacityRemaining.dataVolumeMB,
      percentage: utilizationPercentage.dataVolume,
      format: formatBytes,
    },
    {
      key: 'aiInsights',
      label: 'AI Insights',
      icon: <Brain className="h-4 w-4" />,
      used: capacityUsed.aiInsights,
      remaining: capacityRemaining.aiInsights,
      limit:
        capacityUsed.aiInsights === -1 || capacityRemaining.aiInsights === -1
          ? -1
          : capacityUsed.aiInsights + capacityRemaining.aiInsights,
      percentage: utilizationPercentage.aiInsights,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
    },
    {
      key: 'analysisComponents',
      label: 'Analysis Components',
      icon: <BarChart3 className="h-4 w-4" />,
      used: capacityUsed.analysisComponents,
      remaining: capacityRemaining.analysisComponents,
      limit:
        capacityUsed.analysisComponents === -1 || capacityRemaining.analysisComponents === -1
          ? -1
          : capacityUsed.analysisComponents + capacityRemaining.analysisComponents,
      percentage: utilizationPercentage.analysisComponents,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
    },
    {
      key: 'visualizations',
      label: 'Visualizations',
      icon: <Image className="h-4 w-4" />,
      used: capacityUsed.visualizations,
      remaining: capacityRemaining.visualizations,
      limit:
        capacityUsed.visualizations === -1 || capacityRemaining.visualizations === -1
          ? -1
          : capacityUsed.visualizations + capacityRemaining.visualizations,
      percentage: utilizationPercentage.visualizations,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
    },
    {
      key: 'fileUploads',
      label: 'File Uploads',
      icon: <Upload className="h-4 w-4" />,
      used: capacityUsed.fileUploads,
      remaining: capacityRemaining.fileUploads,
      limit:
        capacityUsed.fileUploads === -1 || capacityRemaining.fileUploads === -1
          ? -1
          : capacityUsed.fileUploads + capacityRemaining.fileUploads,
      percentage: utilizationPercentage.fileUploads,
      format: (value: number) => value === -1 ? 'Unlimited' : value.toString(),
    },
  ];

  // Derive per-category "bank impact" (requested vs from quota vs overage vs remaining)
  type CatKey = 'dataVolumeMB' | 'aiInsights' | 'analysisComponents' | 'visualizations' | 'fileUploads';
  const categoryMeta: Record<CatKey, { label: string; unitLabel: (v: number) => string; testId: string; }>= {
    dataVolumeMB: { label: 'Data Volume', unitLabel: (v) => formatBytes(v), testId: 'data-volume' },
    aiInsights: { label: 'AI Insights', unitLabel: (v) => (v === -1 ? 'Unlimited' : `${v}`), testId: 'ai-insights' },
    analysisComponents: { label: 'Analysis Components', unitLabel: (v) => (v === -1 ? 'Unlimited' : `${v}`), testId: 'analysis-components' },
    visualizations: { label: 'Visualizations', unitLabel: (v) => (v === -1 ? 'Unlimited' : `${v}`), testId: 'visualizations' },
    fileUploads: { label: 'File Uploads', unitLabel: (v) => (v === -1 ? 'Unlimited' : `${v}`), testId: 'file-uploads' },
  };

  const computeBankImpact = (cat: CatKey) => {
    let requested = 0;
    let fromQuota = 0;
    let overageUnits = 0;
    let overageCost = 0;
    const breakdownEntries = breakdown?.breakdown ?? [];
    for (const item of breakdownEntries) {
      const used = (item.capacityImpact.used as any)[cat];
      if (!used || used <= 0) continue;
      requested += used;
      if (item.cost > 0) {
        // beyond quota entry
        overageUnits += used;
        overageCost += item.cost;
      } else {
        // from quota entry (cost 0)
        fromQuota += used;
      }
    }
    const afterRemaining = (capacityRemaining as any)[cat] ?? 0;
    const usedTotal = (capacityUsed as any)[cat] ?? 0;
    const limit =
      usedTotal === -1 || afterRemaining === -1 ? -1 : usedTotal + afterRemaining;
    const beforeRemaining = limit === -1 ? -1 : afterRemaining + fromQuota;
    return { requested, fromQuota, overageUnits, overageCost, beforeRemaining, afterRemaining, limit };
  };

  return (
    <div className="space-y-6" data-testid="billing-capacity-display">
      {/* Journey Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Journey Billing Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {breakdown?.journeyType 
                  ? breakdown.journeyType.charAt(0).toUpperCase() + breakdown.journeyType.slice(1)
                  : 'Standard'}
              </div>
              <div className="text-sm text-gray-500">Journey Type</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatBytes(typeof breakdown?.datasetSizeMB === 'number' ? breakdown.datasetSizeMB : 0)}
              </div>
              <div className="text-sm text-gray-500">Dataset Size</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatCurrency(typeof breakdown?.totalCost === 'number' ? breakdown.totalCost : 0)}
              </div>
              <div className="text-sm text-gray-500">Total Cost</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span>Base Cost</span>
              <span className="font-medium">{formatCurrency(typeof breakdown?.baseCost === 'number' ? breakdown.baseCost : 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Subscription Credits ({currentTier})</span>
              <span className="font-medium text-green-600">-{formatCurrency(typeof breakdown?.subscriptionCredits === 'number' ? breakdown.subscriptionCredits : 0)}</span>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Final Cost</span>
                <span className="text-blue-600">{formatCurrency(typeof breakdown?.totalCost === 'number' ? breakdown.totalCost : 0)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Impact by Category */}
      <Card>
        <CardHeader>
          <CardTitle>How This Analysis Uses Your Subscription Bank</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(
              [
                'dataVolumeMB',
                'aiInsights',
                'analysisComponents',
                'visualizations',
                'fileUploads',
              ] as CatKey[]
            ).map((cat) => {
              const meta = categoryMeta[cat];
              const s = computeBankImpact(cat);
              const isUnlimited = s.limit === -1 || s.beforeRemaining === -1 || s.afterRemaining === -1;
              return (
                <div key={cat} className="p-3 bg-gray-50 rounded-lg" data-testid={`capacity-card`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.label}</span>
                      {isUnlimited && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700" data-testid="unlimited-badge">Unlimited</Badge>
                      )}
                    </div>
                    {!isUnlimited && (
                      <span className="text-xs text-gray-600">Bank before: {meta.unitLabel(s.beforeRemaining)}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-gray-500">Requested</div>
                      <div className="font-medium">{meta.unitLabel(s.requested)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">From Bank</div>
                      <div className="font-medium text-green-700">{meta.unitLabel(s.fromQuota)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Overage</div>
                      <div className="font-medium text-red-700">
                        {meta.unitLabel(s.overageUnits)}{s.overageCost > 0 ? ` · ${formatCurrency(s.overageCost)}` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Bank after</div>
                      <div className="font-medium">{isUnlimited ? 'Unlimited' : meta.unitLabel(s.afterRemaining)}</div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Progress value={isUnlimited ? 0 : Math.min(100, (breakdown.utilizationPercentage as any)[meta.testId] || 0)} className="h-2" data-testid="capacity-progress" />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Capacity Utilization */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Capacity Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {capacityItems.map((item) => {
              const status = getCapacityStatus(item.used, item.limit);
              return (
                <div key={item.key} className="space-y-2" data-testid="capacity-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getCapacityIcon(status)}
                      <span className="text-sm text-gray-500">
                        {item.format(item.used)} / {item.format(item.limit)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Progress 
                      value={item.percentage} 
                      className="h-2"
                      data-testid="capacity-progress"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Used: {item.format(item.used)}</span>
                      <span>Remaining: {item.format(item.remaining)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      {showDetailedBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdown.breakdown.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">{item.description}</div>
                    {Object.entries(item.capacityImpact.used).map(([key, value]) => (
                      value !== undefined && value > 0 && (
                        <div key={key} className="text-xs text-gray-500">
                          {key}: {value}
                        </div>
                      )
                    ))}
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(item.cost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capacity Warnings */}
      {Object.values(breakdown.utilizationPercentage).some(p => p >= 75) && (
        <Alert data-testid="capacity-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You're approaching your subscription limits. Consider upgrading your plan to avoid capacity restrictions.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}































