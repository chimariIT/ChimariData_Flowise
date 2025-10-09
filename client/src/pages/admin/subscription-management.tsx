// client/src/pages/admin/subscription-management.tsx
import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CreditCard,
  Database,
  DollarSign,
  Download,
  Filter,
  Globe,
  HardDrive,
  Loader,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  Edit,
  Save,
  X
} from 'lucide-react';

interface UsageMetrics {
  userId: string;
  subscriptionTier: string;
  billingPeriod: {
    start: Date;
    end: Date;
    status: 'active' | 'completed' | 'overdue';
  };
  dataUsage: {
    totalFilesUploaded: number;
    totalFileSizeMB: number;
    totalDataProcessedMB: number;
    storageUsedMB: number;
    maxFileSize: number;
    fileFormats: Record<string, number>;
    dataTransformations: number;
    dataExports: number;
  };
  computeUsage: {
    analysisCount: number;
    aiQueryCount: number;
    mlModelExecutions: number;
    visualizationCount: number;
    totalComputeMinutes: number;
    agentInteractions: number;
    toolExecutions: number;
  };
  storageMetrics: {
    projectCount: number;
    datasetCount: number;
    artifactCount: number;
    totalStorageMB: number;
    archiveStorageMB: number;
    temporaryStorageMB: number;
    retentionDays: number;
  };
  costBreakdown: {
    baseSubscription: number;
    dataOverage: number;
    computeOverage: number;
    storageOverage: number;
    premiumFeatures: number;
    agentUsage: number;
    toolUsage: number;
    totalCost: number;
  };
  quotaUtilization: {
    dataQuotaUsed: number;
    dataQuotaLimit: number;
    computeQuotaUsed: number;
    computeQuotaLimit: number;
    storageQuotaUsed: number;
    storageQuotaLimit: number;
    quotaResetDate: Date;
  };
}

interface SubscriptionTier {
  id: string;
  name: string;
  displayName: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  limits: {
    maxFilesSizeMB: number;
    maxStorageMB: number;
    maxDataProcessingMB: number;
    maxComputeMinutes: number;
    maxProjects: number;
    maxTeamMembers: number;
    maxApiCalls: number;
    maxAgentInteractions: number;
    maxToolExecutions: number;
    retentionDays: number;
  };
  overagePricing: {
    dataPerMB: number;
    computePerMinute: number;
    storagePerMB: number;
    apiCallsPer1000: number;
    agentInteractionCost: number;
    toolExecutionCost: number;
  };
  discounts: {
    dataProcessingDiscount: number;
    agentUsageDiscount: number;
    toolUsageDiscount: number;
    enterpriseDiscount: number;
  };
}

interface QuotaAlert {
  id: string;
  userId: string;
  quotaType: 'data' | 'compute' | 'storage' | 'api' | 'agent' | 'tool';
  currentUsage: number;
  quotaLimit: number;
  utilizationPercent: number;
  alertLevel: 'warning' | 'critical' | 'exceeded';
  message: string;
  actionRequired: boolean;
  suggestedActions: string[];
  timestamp: Date;
  acknowledged: boolean;
}

interface BillingEvent {
  id: string;
  userId: string;
  type: 'usage' | 'subscription_change' | 'payment' | 'overage' | 'quota_warning';
  category: 'data' | 'compute' | 'storage' | 'agent' | 'tool' | 'collaboration';
  description: string;
  amount?: number;
  quantity: number;
  unit: string;
  metadata: Record<string, any>;
  timestamp: Date;
  processed: boolean;
}

const SubscriptionManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tiers' | 'alerts' | 'analytics' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [userMetrics, setUserMetrics] = useState<UsageMetrics[]>([]);
  const [subscriptionTiers, setSubscriptionTiers] = useState<SubscriptionTier[]>([]);
  const [quotaAlerts, setQuotaAlerts] = useState<QuotaAlert[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterAlertLevel, setFilterAlertLevel] = useState<string>('all');
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editedTierData, setEditedTierData] = useState<Partial<SubscriptionTier>>({});

  // Mock data - in real app, fetch from API
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Simulate API calls
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Mock subscription tiers
        const mockTiers: SubscriptionTier[] = [
          {
            id: 'trial',
            name: 'trial',
            displayName: 'Free Trial',
            monthlyPrice: 0,
            yearlyPrice: 0,
            description: 'Perfect for getting started with basic data analysis',
            features: ['Up to 100MB data processing', '500MB storage', 'Basic analysis tools'],
            limits: {
              maxFilesSizeMB: 100,
              maxStorageMB: 500,
              maxDataProcessingMB: 100,
              maxComputeMinutes: 60,
              maxProjects: 3,
              maxTeamMembers: 1,
              maxApiCalls: 1000,
              maxAgentInteractions: 50,
              maxToolExecutions: 100,
              retentionDays: 30
            },
            overagePricing: {
              dataPerMB: 0.01,
              computePerMinute: 0.05,
              storagePerMB: 0.002,
              apiCallsPer1000: 0.50,
              agentInteractionCost: 0.02,
              toolExecutionCost: 0.01
            },
            discounts: {
              dataProcessingDiscount: 0,
              agentUsageDiscount: 0,
              toolUsageDiscount: 0,
              enterpriseDiscount: 0
            }
          },
          {
            id: 'starter',
            name: 'starter',
            displayName: 'Starter',
            monthlyPrice: 29,
            yearlyPrice: 290,
            description: 'For individuals and small teams starting their data journey',
            features: ['Up to 5GB data processing', '25GB storage', 'Advanced analysis tools'],
            limits: {
              maxFilesSizeMB: 5000,
              maxStorageMB: 25000,
              maxDataProcessingMB: 5000,
              maxComputeMinutes: 500,
              maxProjects: 10,
              maxTeamMembers: 3,
              maxApiCalls: 10000,
              maxAgentInteractions: 1000,
              maxToolExecutions: 2000,
              retentionDays: 90
            },
            overagePricing: {
              dataPerMB: 0.008,
              computePerMinute: 0.04,
              storagePerMB: 0.0015,
              apiCallsPer1000: 0.40,
              agentInteractionCost: 0.015,
              toolExecutionCost: 0.008
            },
            discounts: {
              dataProcessingDiscount: 10,
              agentUsageDiscount: 5,
              toolUsageDiscount: 5,
              enterpriseDiscount: 0
            }
          },
          {
            id: 'professional',
            name: 'professional',
            displayName: 'Professional',
            monthlyPrice: 99,
            yearlyPrice: 990,
            description: 'For growing teams with advanced analytics needs',
            features: ['Up to 50GB data processing', '500GB storage', 'Premium analysis suite'],
            limits: {
              maxFilesSizeMB: 50000,
              maxStorageMB: 500000,
              maxDataProcessingMB: 50000,
              maxComputeMinutes: 5000,
              maxProjects: 50,
              maxTeamMembers: 15,
              maxApiCalls: 100000,
              maxAgentInteractions: 10000,
              maxToolExecutions: 25000,
              retentionDays: 365
            },
            overagePricing: {
              dataPerMB: 0.005,
              computePerMinute: 0.03,
              storagePerMB: 0.001,
              apiCallsPer1000: 0.25,
              agentInteractionCost: 0.01,
              toolExecutionCost: 0.005
            },
            discounts: {
              dataProcessingDiscount: 20,
              agentUsageDiscount: 15,
              toolUsageDiscount: 15,
              enterpriseDiscount: 5
            }
          },
          {
            id: 'enterprise',
            name: 'enterprise',
            displayName: 'Enterprise',
            monthlyPrice: 299,
            yearlyPrice: 2990,
            description: 'For large organizations with enterprise requirements',
            features: ['Unlimited data processing', 'Unlimited storage', 'Enterprise analysis suite'],
            limits: {
              maxFilesSizeMB: -1,
              maxStorageMB: -1,
              maxDataProcessingMB: -1,
              maxComputeMinutes: -1,
              maxProjects: -1,
              maxTeamMembers: -1,
              maxApiCalls: -1,
              maxAgentInteractions: -1,
              maxToolExecutions: -1,
              retentionDays: -1
            },
            overagePricing: {
              dataPerMB: 0.002,
              computePerMinute: 0.02,
              storagePerMB: 0.0005,
              apiCallsPer1000: 0.10,
              agentInteractionCost: 0.005,
              toolExecutionCost: 0.002
            },
            discounts: {
              dataProcessingDiscount: 30,
              agentUsageDiscount: 25,
              toolUsageDiscount: 25,
              enterpriseDiscount: 15
            }
          }
        ];

        // Mock user metrics
        const mockUserMetrics: UsageMetrics[] = [
          {
            userId: 'user_1',
            subscriptionTier: 'professional',
            billingPeriod: {
              start: new Date('2024-01-01'),
              end: new Date('2024-01-31'),
              status: 'active'
            },
            dataUsage: {
              totalFilesUploaded: 125,
              totalFileSizeMB: 15750,
              totalDataProcessedMB: 23400,
              storageUsedMB: 45600,
              maxFileSize: 2500,
              fileFormats: { csv: 45, json: 30, xlsx: 25, xml: 15, txt: 10 },
              dataTransformations: 89,
              dataExports: 34
            },
            computeUsage: {
              analysisCount: 156,
              aiQueryCount: 2340,
              mlModelExecutions: 45,
              visualizationCount: 78,
              totalComputeMinutes: 1250,
              agentInteractions: 890,
              toolExecutions: 1567
            },
            storageMetrics: {
              projectCount: 23,
              datasetCount: 67,
              artifactCount: 134,
              totalStorageMB: 45600,
              archiveStorageMB: 12300,
              temporaryStorageMB: 890,
              retentionDays: 365
            },
            costBreakdown: {
              baseSubscription: 99,
              dataOverage: 0,
              computeOverage: 0,
              storageOverage: 0,
              premiumFeatures: 15,
              agentUsage: 8.90,
              toolUsage: 7.84,
              totalCost: 130.74
            },
            quotaUtilization: {
              dataQuotaUsed: 23400,
              dataQuotaLimit: 50000,
              computeQuotaUsed: 1250,
              computeQuotaLimit: 5000,
              storageQuotaUsed: 45600,
              storageQuotaLimit: 500000,
              quotaResetDate: new Date('2024-02-01')
            }
          },
          {
            userId: 'user_2',
            subscriptionTier: 'starter',
            billingPeriod: {
              start: new Date('2024-01-01'),
              end: new Date('2024-01-31'),
              status: 'active'
            },
            dataUsage: {
              totalFilesUploaded: 67,
              totalFileSizeMB: 4850,
              totalDataProcessedMB: 6200,
              storageUsedMB: 18750,
              maxFileSize: 850,
              fileFormats: { csv: 25, json: 20, xlsx: 15, pdf: 7 },
              dataTransformations: 34,
              dataExports: 12
            },
            computeUsage: {
              analysisCount: 78,
              aiQueryCount: 890,
              mlModelExecutions: 12,
              visualizationCount: 34,
              totalComputeMinutes: 425,
              agentInteractions: 456,
              toolExecutions: 678
            },
            storageMetrics: {
              projectCount: 8,
              datasetCount: 23,
              artifactCount: 45,
              totalStorageMB: 18750,
              archiveStorageMB: 5600,
              temporaryStorageMB: 340,
              retentionDays: 90
            },
            costBreakdown: {
              baseSubscription: 29,
              dataOverage: 9.60,
              computeOverage: 0,
              storageOverage: 0,
              premiumFeatures: 0,
              agentUsage: 6.84,
              toolUsage: 5.42,
              totalCost: 50.86
            },
            quotaUtilization: {
              dataQuotaUsed: 6200,
              dataQuotaLimit: 5000,
              computeQuotaUsed: 425,
              computeQuotaLimit: 500,
              storageQuotaUsed: 18750,
              storageQuotaLimit: 25000,
              quotaResetDate: new Date('2024-02-01')
            }
          }
        ];

        // Mock quota alerts
        const mockAlerts: QuotaAlert[] = [
          {
            id: 'alert_1',
            userId: 'user_2',
            quotaType: 'data',
            currentUsage: 6200,
            quotaLimit: 5000,
            utilizationPercent: 124,
            alertLevel: 'exceeded',
            message: 'Data usage quota exceeded! You are now incurring overage charges.',
            actionRequired: true,
            suggestedActions: ['Consider upgrading to Professional plan', 'Optimize data processing workflows'],
            timestamp: new Date(),
            acknowledged: false
          },
          {
            id: 'alert_2',
            userId: 'user_1',
            quotaType: 'storage',
            currentUsage: 45600,
            quotaLimit: 500000,
            utilizationPercent: 91.2,
            alertLevel: 'critical',
            message: 'Storage usage is at 91.2% of your quota limit. Consider upgrading soon.',
            actionRequired: false,
            suggestedActions: ['Archive old projects', 'Clean up temporary files'],
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
            acknowledged: false
          }
        ];

        setSubscriptionTiers(mockTiers);
        setUserMetrics(mockUserMetrics);
        setQuotaAlerts(mockAlerts);
        setBillingEvents([]);
      } catch (error) {
        console.error('Error loading subscription data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 0) return 'Unlimited';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getQuotaUtilizationColor = (percent: number): string => {
    if (percent >= 100) return 'text-red-600';
    if (percent >= 90) return 'text-orange-500';
    if (percent >= 75) return 'text-yellow-500';
    return 'text-green-600';
  };

  const getQuotaUtilizationBg = (percent: number): string => {
    if (percent >= 100) return 'bg-red-100';
    if (percent >= 90) return 'bg-orange-100';
    if (percent >= 75) return 'bg-yellow-100';
    return 'bg-green-100';
  };

  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'exceeded':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
  };

  const filteredUsers = userMetrics.filter(user => {
    const matchesSearch = user.userId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTier = filterTier === 'all' || user.subscriptionTier === filterTier;
    return matchesSearch && matchesTier;
  });

  const filteredAlerts = quotaAlerts.filter(alert => {
    return filterAlertLevel === 'all' || alert.alertLevel === filterAlertLevel;
  });

  const handleTierEdit = (tierId: string) => {
    const tier = subscriptionTiers.find(t => t.id === tierId);
    if (tier) {
      setEditingTier(tierId);
      setEditedTierData({ ...tier });
    }
  };

  const handleTierSave = () => {
    if (editingTier && editedTierData) {
      setSubscriptionTiers(prev => 
        prev.map(tier => 
          tier.id === editingTier 
            ? { ...tier, ...editedTierData } as SubscriptionTier
            : tier
        )
      );
      setEditingTier(null);
      setEditedTierData({});
    }
  };

  const handleTierCancel = () => {
    setEditingTier(null);
    setEditedTierData({});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading subscription management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <CreditCard className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Subscription Management</h1>
                <p className="text-sm text-gray-500">Monitor usage, billing, and subscription tiers</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <RefreshCw className="h-5 w-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <Download className="h-5 w-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'users', label: 'User Metrics', icon: Users },
              { id: 'tiers', label: 'Subscription Tiers', icon: CreditCard },
              { id: 'alerts', label: 'Quota Alerts', icon: AlertTriangle },
              { id: 'analytics', label: 'Analytics', icon: TrendingUp },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <Icon className="h-4 w-4 mr-2" />
                    {tab.label}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-2xl font-semibold text-gray-900">{userMetrics.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(userMetrics.reduce((sum, user) => sum + user.costBreakdown.totalCost, 0))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Active Alerts</p>
                    <p className="text-2xl font-semibold text-gray-900">{quotaAlerts.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Database className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Storage</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatBytes(userMetrics.reduce((sum, user) => sum + user.storageMetrics.totalStorageMB * 1024 * 1024, 0))}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Usage Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-medium text-gray-900">Subscription Distribution</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {subscriptionTiers.map(tier => {
                      const userCount = userMetrics.filter(user => user.subscriptionTier === tier.id).length;
                      const percentage = userMetrics.length > 0 ? (userCount / userMetrics.length) * 100 : 0;
                      
                      return (
                        <div key={tier.id} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{tier.displayName}</p>
                            <p className="text-sm text-gray-500">{formatCurrency(tier.monthlyPrice)}/month</p>
                          </div>
                          <div className="flex items-center">
                            <div className="w-24 bg-gray-200 rounded-full h-2 mr-3">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-900 w-12 text-right">
                              {userCount}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-medium text-gray-900">Recent Quota Alerts</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {quotaAlerts.slice(0, 5).map(alert => (
                      <div key={alert.id} className="flex items-center justify-between">
                        <div className="flex items-center">
                          {getAlertIcon(alert.alertLevel)}
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              User {alert.userId} - {alert.quotaType} quota
                            </p>
                            <p className="text-sm text-gray-500">
                              {alert.utilizationPercent.toFixed(1)}% used
                            </p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          alert.alertLevel === 'exceeded' ? 'bg-red-100 text-red-800' :
                          alert.alertLevel === 'critical' ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {alert.alertLevel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">User Usage Metrics</h3>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={filterTier}
                    onChange={(e) => setFilterTier(e.target.value)}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Tiers</option>
                    {subscriptionTiers.map(tier => (
                      <option key={tier.id} value={tier.id}>{tier.displayName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subscription
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data Usage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Compute Usage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Storage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Monthly Cost
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map(user => {
                      const tier = subscriptionTiers.find(t => t.id === user.subscriptionTier);
                      const dataUtilization = tier?.limits.maxDataProcessingMB > 0 
                        ? (user.quotaUtilization.dataQuotaUsed / user.quotaUtilization.dataQuotaLimit) * 100 
                        : 0;
                      const computeUtilization = tier?.limits.maxComputeMinutes > 0 
                        ? (user.quotaUtilization.computeQuotaUsed / user.quotaUtilization.computeQuotaLimit) * 100 
                        : 0;
                      const storageUtilization = tier?.limits.maxStorageMB > 0 
                        ? (user.quotaUtilization.storageQuotaUsed / user.quotaUtilization.storageQuotaLimit) * 100 
                        : 0;

                      return (
                        <tr key={user.userId} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{user.userId}</div>
                            <div className="text-sm text-gray-500">
                              {user.billingPeriod.status === 'active' ? 'Active' : 'Inactive'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              user.subscriptionTier === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                              user.subscriptionTier === 'professional' ? 'bg-blue-100 text-blue-800' :
                              user.subscriptionTier === 'starter' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {tier?.displayName || user.subscriptionTier}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatBytes(user.dataUsage.totalDataProcessedMB * 1024 * 1024)}
                            </div>
                            <div className={`text-xs ${getQuotaUtilizationColor(dataUtilization)}`}>
                              {dataUtilization > 0 ? `${dataUtilization.toFixed(1)}% used` : 'Unlimited'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {user.computeUsage.totalComputeMinutes} min
                            </div>
                            <div className={`text-xs ${getQuotaUtilizationColor(computeUtilization)}`}>
                              {computeUtilization > 0 ? `${computeUtilization.toFixed(1)}% used` : 'Unlimited'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatBytes(user.storageMetrics.totalStorageMB * 1024 * 1024)}
                            </div>
                            <div className={`text-xs ${getQuotaUtilizationColor(storageUtilization)}`}>
                              {storageUtilization > 0 ? `${storageUtilization.toFixed(1)}% used` : 'Unlimited'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(user.costBreakdown.totalCost)}
                            </div>
                            {user.costBreakdown.dataOverage + user.costBreakdown.computeOverage + user.costBreakdown.storageOverage > 0 && (
                              <div className="text-xs text-orange-600">
                                +{formatCurrency(user.costBreakdown.dataOverage + user.costBreakdown.computeOverage + user.costBreakdown.storageOverage)} overage
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {Math.max(dataUtilization, computeUtilization, storageUtilization) >= 100 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Over Quota
                              </span>
                            ) : Math.max(dataUtilization, computeUtilization, storageUtilization) >= 90 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                Near Limit
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Good
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tiers' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Subscription Tiers</h3>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Tier
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                  {subscriptionTiers.map(tier => (
                    <div key={tier.id} className="border rounded-lg p-6 relative">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-gray-900">{tier.displayName}</h4>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleTierEdit(tier.id)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {editingTier === tier.id ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Monthly Price
                            </label>
                            <input
                              type="number"
                              value={editedTierData.monthlyPrice || 0}
                              onChange={(e) => setEditedTierData(prev => ({
                                ...prev,
                                monthlyPrice: parseFloat(e.target.value)
                              }))}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Max Data Processing (MB)
                            </label>
                            <input
                              type="number"
                              value={editedTierData.limits?.maxDataProcessingMB || 0}
                              onChange={(e) => setEditedTierData(prev => ({
                                ...prev,
                                limits: {
                                  ...prev.limits!,
                                  maxDataProcessingMB: parseInt(e.target.value)
                                }
                              }))}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Max Storage (MB)
                            </label>
                            <input
                              type="number"
                              value={editedTierData.limits?.maxStorageMB || 0}
                              onChange={(e) => setEditedTierData(prev => ({
                                ...prev,
                                limits: {
                                  ...prev.limits!,
                                  maxStorageMB: parseInt(e.target.value)
                                }
                              }))}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={handleTierSave}
                              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </button>
                            <button
                              onClick={handleTierCancel}
                              className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 flex items-center justify-center"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mb-4">
                            <div className="text-3xl font-bold text-gray-900">
                              {formatCurrency(tier.monthlyPrice)}
                              <span className="text-lg font-normal text-gray-500">/month</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
                          </div>

                          <div className="space-y-3">
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Data Processing:</span>
                              <span className="ml-2 text-gray-600">
                                {tier.limits.maxDataProcessingMB === -1 
                                  ? 'Unlimited' 
                                  : formatBytes(tier.limits.maxDataProcessingMB * 1024 * 1024)
                                }
                              </span>
                            </div>

                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Storage:</span>
                              <span className="ml-2 text-gray-600">
                                {tier.limits.maxStorageMB === -1 
                                  ? 'Unlimited' 
                                  : formatBytes(tier.limits.maxStorageMB * 1024 * 1024)
                                }
                              </span>
                            </div>

                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Compute Minutes:</span>
                              <span className="ml-2 text-gray-600">
                                {tier.limits.maxComputeMinutes === -1 
                                  ? 'Unlimited' 
                                  : `${tier.limits.maxComputeMinutes} min`
                                }
                              </span>
                            </div>

                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Projects:</span>
                              <span className="ml-2 text-gray-600">
                                {tier.limits.maxProjects === -1 ? 'Unlimited' : tier.limits.maxProjects}
                              </span>
                            </div>

                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Agent Interactions:</span>
                              <span className="ml-2 text-gray-600">
                                {tier.limits.maxAgentInteractions === -1 
                                  ? 'Unlimited' 
                                  : tier.limits.maxAgentInteractions
                                }
                              </span>
                            </div>

                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Tool Executions:</span>
                              <span className="ml-2 text-gray-600">
                                {tier.limits.maxToolExecutions === -1 
                                  ? 'Unlimited' 
                                  : tier.limits.maxToolExecutions
                                }
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t">
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">Overage Pricing:</span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-gray-500">
                              <div>Data: {formatCurrency(tier.overagePricing.dataPerMB)}/MB</div>
                              <div>Compute: {formatCurrency(tier.overagePricing.computePerMinute)}/min</div>
                              <div>Storage: {formatCurrency(tier.overagePricing.storagePerMB)}/MB</div>
                              <div>Agents: {formatCurrency(tier.overagePricing.agentInteractionCost)}/interaction</div>
                              <div>Tools: {formatCurrency(tier.overagePricing.toolExecutionCost)}/execution</div>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t">
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">Discounts:</span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-gray-500">
                              <div>Data Processing: {tier.discounts.dataProcessingDiscount}%</div>
                              <div>Agent Usage: {tier.discounts.agentUsageDiscount}%</div>
                              <div>Tool Usage: {tier.discounts.toolUsageDiscount}%</div>
                              <div>Enterprise: {tier.discounts.enterpriseDiscount}%</div>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t">
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              Current Users: {userMetrics.filter(user => user.subscriptionTier === tier.id).length}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Quota Alerts</h3>
                  <select
                    value={filterAlertLevel}
                    onChange={(e) => setFilterAlertLevel(e.target.value)}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Levels</option>
                    <option value="exceeded">Exceeded</option>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  {filteredAlerts.map(alert => (
                    <div key={alert.id} className={`border rounded-lg p-4 ${getQuotaUtilizationBg(alert.utilizationPercent)}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start">
                          {getAlertIcon(alert.alertLevel)}
                          <div className="ml-3">
                            <div className="flex items-center">
                              <h4 className="text-sm font-medium text-gray-900">
                                User {alert.userId} - {alert.quotaType.toUpperCase()} Quota Alert
                              </h4>
                              <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${
                                alert.alertLevel === 'exceeded' ? 'bg-red-100 text-red-800' :
                                alert.alertLevel === 'critical' ? 'bg-orange-100 text-orange-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {alert.alertLevel}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                            <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                              <span>Usage: {alert.currentUsage.toLocaleString()}</span>
                              <span>Limit: {alert.quotaLimit.toLocaleString()}</span>
                              <span>Utilization: {alert.utilizationPercent.toFixed(1)}%</span>
                              <span>
                                <Clock className="h-3 w-3 inline mr-1" />
                                {new Date(alert.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            
                            {alert.suggestedActions.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-gray-700 mb-1">Suggested Actions:</p>
                                <ul className="text-xs text-gray-600 space-y-1">
                                  {alert.suggestedActions.map((action, index) => (
                                    <li key={index} className="flex items-start">
                                      <span className="mr-2">•</span>
                                      {action}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {alert.actionRequired && (
                            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                              Action Required
                            </span>
                          )}
                          <button className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                            Acknowledge
                          </button>
                          <button className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                            Contact User
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {filteredAlerts.length === 0 && (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <p className="text-gray-500">No quota alerts at this level</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-medium text-gray-900">Usage Analytics</h3>
              </div>
              <div className="p-6">
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Advanced analytics dashboard coming soon</p>
                  <p className="text-sm text-gray-400 mt-2">
                    This will include usage trends, revenue forecasting, and subscription optimization insights
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-medium text-gray-900">Billing Settings</h3>
              </div>
              <div className="p-6">
                <div className="text-center py-8">
                  <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Billing configuration settings coming soon</p>
                  <p className="text-sm text-gray-400 mt-2">
                    This will include global billing policies, notification settings, and integration configurations
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionManagement;