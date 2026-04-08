// client/src/pages/admin/subscription-management.tsx
import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
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
  status: 'active' | 'completed' | 'overdue' | 'inactive' | 'cancelled' | 'past_due' | 'expired' | 'trialing' | 'paused' | 'grace_period';
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
  unit?: string;
  metadata: Record<string, any>;
  timestamp: Date;
  processed: boolean;
}

// Analytics Dashboard Component
const AnalyticsDashboard: React.FC = () => {
  const [revenueData, setRevenueData] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - (dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90));

        // Fetch revenue analytics
        const revenueJson = await apiClient.get(
          `/api/admin/billing/analytics/revenue?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        );

        // Fetch usage analytics
        const usageJson = await apiClient.get(
          `/api/admin/billing/analytics/usage?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        );

        if (revenueJson.success) {
          setRevenueData(revenueJson.analytics);
        }
        if (usageJson.success) {
          setUsageData(usageJson.analytics);
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const totalRevenue = revenueData?.totalRevenue || 0;
  const revenueByTier = revenueData?.revenueByTier || {};
  const revenueByFeature = revenueData?.revenueByFeature || {};

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Analytics Dashboard</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setDateRange('7d')}
            className={`px-3 py-1 rounded ${
              dateRange === '7d' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setDateRange('30d')}
            className={`px-3 py-1 rounded ${
              dateRange === '30d' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setDateRange('90d')}
            className={`px-3 py-1 rounded ${
              dateRange === '90d' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            90 Days
          </button>
        </div>
      </div>

      {/* Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ${totalRevenue.toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Subscriptions</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {Object.values(revenueByTier).length}
              </p>
            </div>
            <Users className="w-12 h-12 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Usage</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {usageData?.totalUsage?.toFixed(0) || 0} MB
              </p>
            </div>
            <Database className="w-12 h-12 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Revenue by Tier */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">Revenue by Subscription Tier</h4>
        <div className="space-y-3">
          {Object.entries(revenueByTier).map(([tier, amount]: [string, any]) => (
            <div key={tier} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                <span className="font-medium capitalize">{tier}</span>
              </div>
              <span className="text-gray-900 font-semibold">${amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue by Feature */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">Revenue by Feature</h4>
        <div className="space-y-3">
          {Object.entries(revenueByFeature).map(([feature, amount]: [string, any]) => (
            <div key={feature} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4 text-yellow-600" />
                <span className="font-medium">{feature}</span>
              </div>
              <span className="text-gray-900 font-semibold">${amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Usage Trends */}
      {usageData && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">Usage Trends</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{usageData.totalUsers || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Total Files</p>
              <p className="text-2xl font-bold text-gray-900">{usageData.totalFiles || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Total Analysis</p>
              <p className="text-2xl font-bold text-gray-900">{usageData.totalAnalyses || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Avg Cost/User</p>
              <p className="text-2xl font-bold text-gray-900">
                ${(usageData.avgCostPerUser || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PYTHON BACKEND BILLING SECTION (New Feature)
// ============================================================================

function PythonBillingSection() {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'tiers' | 'invoices' | 'campaigns'>('tiers');

  // Fetch billing data from Python backend via Vite proxy
  const { data: pythonTiers, isLoading: tiersLoading, error: tiersError, refetch: refetchTiers } = useQuery({
    queryKey: ['/api/v1/billing/tiers'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/billing/tiers');
      return response?.data?.tiers || response?.tiers || [];
    },
  });
  const { data: invoices, isLoading: invoicesLoading, error: invoicesError, refetch: refetchInvoices } = useQuery({
    queryKey: ['/api/v1/billing/invoices'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/billing/invoices?limit=20');
      return response?.data?.invoices || response?.invoices || [];
    },
  });
  const { data: campaigns, isLoading: campaignsLoading, error: campaignsError, refetch: refetchCampaigns } = useQuery({
    queryKey: ['/api/v1/billing/campaigns'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/billing/campaigns');
      return response?.data?.campaigns || response?.campaigns || [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900">Python Backend Billing</h3>
            <p className="text-sm text-blue-700">
              Managing subscription tiers, invoices, and promotional campaigns via Python backend (port 8000)
            </p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveSubTab('tiers')}
          className={`px-4 py-2 font-medium text-sm ${
            activeSubTab === 'tiers'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Subscription Tiers
        </button>
        <button
          onClick={() => setActiveSubTab('invoices')}
          className={`px-4 py-2 font-medium text-sm ${
            activeSubTab === 'invoices'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Invoices
        </button>
        <button
          onClick={() => setActiveSubTab('campaigns')}
          className={`px-4 py-2 font-medium text-sm ${
            activeSubTab === 'campaigns'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Campaigns
        </button>
      </div>

      {/* Subscription Tiers Tab */}
      {activeSubTab === 'tiers' && (
        <div className="space-y-4">
          {tiersLoading ? (
            <div className="flex items-center gap-2 p-4">
              <Loader className="h-5 w-5 animate-spin text-blue-600" />
              <span>Loading tiers from Python backend...</span>
            </div>
          ) : tiersError ? (
            <div className="text-destructive bg-destructive/10 p-4 rounded">
              Error loading tiers: {(tiersError as Error).message}
            </div>
          ) : (
            <div className="space-y-4">
              {pythonTiers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No subscription tiers found in Python backend
                </div>
              ) : (
                pythonTiers.map((tier: any) => (
                  <div key={tier.id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">{tier.display_name || tier.name}</h4>
                        <p className="text-2xl font-bold text-blue-600">${(tier.monthly_price_usd || 0).toFixed(2)}/month</p>
                      </div>
                      <button
                        onClick={() => refetchTiers()}
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title="Refresh tiers"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                    {tier.features && tier.features.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Features:</h5>
                        <ul className="space-y-1">
                          {tier.features.map((feature: string, idx: number) => (
                            <li key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {tier.analysis_limit && (
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Analysis Limit:</strong> {tier.analysis_limit} per month
                      </div>
                    )}
                    {tier.projects_limit && (
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Projects Limit:</strong> {tier.projects_limit}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {activeSubTab === 'invoices' && (
        <div className="space-y-4">
          {invoicesLoading ? (
            <div className="flex items-center gap-2 p-4">
              <Loader className="h-5 w-5 animate-spin text-blue-600" />
              <span>Loading invoices from Python backend...</span>
            </div>
          ) : invoicesError ? (
            <div className="text-destructive bg-destructive/10 p-4 rounded">
              Error loading invoices: {(invoicesError as Error).message}
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No invoices found in Python backend
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {invoices.map((invoice: any) => (
                        <tr key={invoice.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900">{invoice.id}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{invoice.user_id}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            ${invoice.amount_usd?.toFixed(2) || '0.00'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              invoice.status === 'paid'
                                ? 'bg-green-100 text-green-800'
                                : invoice.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : invoice.status === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                            }`}>
                              {invoice.status || 'unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Campaigns Tab */}
      {activeSubTab === 'campaigns' && (
        <div className="space-y-4">
          {campaignsLoading ? (
            <div className="flex items-center gap-2 p-4">
              <Loader className="h-5 w-5 animate-spin text-blue-600" />
              <span>Loading campaigns from Python backend...</span>
            </div>
          ) : campaignsError ? (
            <div className="text-destructive bg-destructive/10 p-4 rounded">
              Error loading campaigns: {(campaignsError as Error).message}
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No campaigns found in Python backend
                </div>
              ) : (
                campaigns.map((campaign: any) => (
                  <div key={campaign.id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">{campaign.name}</h4>
                        <p className="text-sm text-gray-600">Code: <strong className="text-blue-600">{campaign.code}</strong></p>
                      </div>
                      <div className="flex items-center gap-2">
                        {campaign.active && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">Active</span>
                        )}
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {campaign.discount_percentage}% off
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">{campaign.description}</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <strong className="text-gray-700">Start Date:</strong>
                        <span className="text-gray-600 ml-2">
                          {campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : '-'}
                        </span>
                      </div>
                      <div>
                        <strong className="text-gray-700">End Date:</strong>
                        <span className="text-gray-600 ml-2">
                          {campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : '-'}
                        </span>
                      </div>
                    </div>
                    {campaign.max_uses && (
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Max Uses:</strong> {campaign.max_uses}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SubscriptionManagement: React.FC = () => {
  // LOW PRIORITY FIX: Add toast hook for proper notifications
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tiers' | 'alerts' | 'analytics' | 'python-billing' | 'settings'>('overview');
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
  const [tierSyncStatus, setTierSyncStatus] = useState<Record<string, { state: 'idle' | 'pending' | 'success' | 'error'; message?: string }>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    let isMounted = true;

    const makeSafeSetter = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
      (value: React.SetStateAction<T>) => {
        if (isMounted) {
          setter(value);
        }
      };

    const setLoadingSafe = makeSafeSetter(setLoading);
    const setSubscriptionTiersSafe = makeSafeSetter(setSubscriptionTiers);
    const setUserMetricsSafe = makeSafeSetter(setUserMetrics);
    const setQuotaAlertsSafe = makeSafeSetter(setQuotaAlerts);
    const setBillingEventsSafe = makeSafeSetter(setBillingEvents);

    const mapTierResponse = (tier: any): SubscriptionTier => {
      const tierId = tier.id ?? tier.type ?? 'custom';
      const resolvedMonthly = typeof tier.monthlyPrice === 'number'
        ? tier.monthlyPrice
        : typeof tier.price === 'number'
          ? tier.price
          : 0;
      const resolvedYearly = typeof tier.yearlyPrice === 'number'
        ? tier.yearlyPrice
        : resolvedMonthly > 0
          ? resolvedMonthly * 10
          : typeof tier.price === 'number'
            ? tier.price * 10
            : 0;

      const limits = tier.limits ?? {};
      const overages = tier.overagePricing ?? {};
      const discounts = tier.discounts ?? {};

      const defaultProjects = tierId === 'trial' ? 3 : tierId === 'starter' ? 10 : tierId === 'professional' ? 50 : 100;
      const defaultTeamMembers = tierId === 'trial' ? 1 : tierId === 'starter' ? 3 : tierId === 'professional' ? 15 : 50;
      const defaultRetention = tierId === 'trial' ? 30 : tierId === 'starter' ? 90 : 365;

      const rawMaxDataSize = limits.maxFileSizeMB ?? limits.maxDataSizeMB ?? 0;
      const rawMaxDataProcessing = limits.maxDataProcessingMB ?? limits.totalDataVolumeMB ?? rawMaxDataSize;
      const rawAnalysesPerMonth = limits.analysesPerMonth ?? limits.maxAnalysisComponents ?? 0;
      const rawAiQueries = limits.aiQueries ?? limits.aiInsights ?? 0;
      const rawMaxStorage = limits.maxStorageMB ?? limits.totalDataVolumeMB ?? (rawMaxDataSize ? rawMaxDataSize * 5 : 0);

      return {
        id: tierId,
        name: tierId,
        displayName: tier.displayName ?? tier.name ?? tierId,
        monthlyPrice: resolvedMonthly,
        yearlyPrice: resolvedYearly,
        description: tier.description ?? '',
        features: Array.isArray(tier.features)
          ? tier.features
          : Object.values(tier.features ?? {}).filter(Boolean) as string[],
        limits: {
          maxFilesSizeMB: Number(rawMaxDataSize),
          maxStorageMB: Number(rawMaxStorage),
          maxDataProcessingMB: Number(rawMaxDataProcessing),
          maxComputeMinutes: Number(limits.maxComputeMinutes ?? rawAnalysesPerMonth * 10),
          maxProjects: Number(limits.maxProjects ?? defaultProjects),
          maxTeamMembers: Number(limits.maxTeamMembers ?? (limits.teamCollaboration ? defaultTeamMembers : 1)),
          maxApiCalls: Number(limits.maxApiCalls ?? rawAiQueries * 100),
          maxAgentInteractions: Number(limits.maxAgentInteractions ?? rawAiQueries * 10),
          maxToolExecutions: Number(limits.maxToolExecutions ?? rawAnalysesPerMonth * 2),
          retentionDays: Number(limits.retentionDays ?? defaultRetention)
        },
        overagePricing: {
          dataPerMB: Number(overages.dataPerMB ?? (tierId === 'trial' ? 0.01 : tierId === 'starter' ? 0.008 : tierId === 'professional' ? 0.005 : 0.003)),
          computePerMinute: Number(overages.computePerMinute ?? (tierId === 'trial' ? 0.05 : tierId === 'starter' ? 0.04 : tierId === 'professional' ? 0.03 : 0.02)),
          storagePerMB: Number(overages.storagePerMB ?? (tierId === 'trial' ? 0.002 : tierId === 'starter' ? 0.0015 : tierId === 'professional' ? 0.001 : 0.0005)),
          apiCallsPer1000: Number(overages.apiCallsPer1000 ?? (tierId === 'trial' ? 0.50 : tierId === 'starter' ? 0.40 : tierId === 'professional' ? 0.30 : 0.20)),
          agentInteractionCost: Number(overages.agentInteractionCost ?? (tierId === 'trial' ? 0.02 : tierId === 'starter' ? 0.015 : tierId === 'professional' ? 0.01 : 0.008)),
          toolExecutionCost: Number(overages.toolExecutionCost ?? (tierId === 'trial' ? 0.01 : tierId === 'starter' ? 0.008 : tierId === 'professional' ? 0.005 : 0.003))
        },
        discounts: {
          dataProcessingDiscount: Number(discounts.dataProcessingDiscount ?? (tierId === 'trial' ? 0 : tierId === 'starter' ? 10 : tierId === 'professional' ? 20 : 30)),
          agentUsageDiscount: Number(discounts.agentUsageDiscount ?? (tierId === 'trial' ? 0 : tierId === 'starter' ? 5 : tierId === 'professional' ? 15 : 25)),
          toolUsageDiscount: Number(discounts.toolUsageDiscount ?? (tierId === 'trial' ? 0 : tierId === 'starter' ? 5 : tierId === 'professional' ? 15 : 25)),
          enterpriseDiscount: Number(discounts.enterpriseDiscount ?? (tierId === 'enterprise' ? 10 : 0))
        }
      };
    };

    const mapMetricsFromResponse = (metrics: any): UsageMetrics => {
  const statusCandidates: UsageMetrics['billingPeriod']['status'][] = ['active', 'completed', 'overdue', 'inactive', 'cancelled', 'past_due', 'expired', 'trialing', 'paused', 'grace_period'];
      const billingStatus = statusCandidates.includes(metrics?.billingPeriod?.status)
        ? metrics.billingPeriod.status
        : 'active';

      return {
        userId: metrics.userId ?? 'unknown',
        subscriptionTier: metrics.subscriptionTier ?? 'none',
        billingPeriod: {
          start: metrics.billingPeriod?.start ? new Date(metrics.billingPeriod.start) : new Date(),
          end: metrics.billingPeriod?.end ? new Date(metrics.billingPeriod.end) : new Date(),
          status: billingStatus
        },
        dataUsage: {
          totalFilesUploaded: Number(metrics.dataUsage?.totalFilesUploaded ?? 0),
          totalFileSizeMB: Number(metrics.dataUsage?.totalFileSizeMB ?? 0),
          totalDataProcessedMB: Number(metrics.dataUsage?.totalDataProcessedMB ?? 0),
          storageUsedMB: Number(metrics.dataUsage?.storageUsedMB ?? 0),
          maxFileSize: Number(metrics.dataUsage?.maxFileSize ?? 0),
          fileFormats: metrics.dataUsage?.fileFormats ?? {},
          dataTransformations: Number(metrics.dataUsage?.dataTransformations ?? 0),
          dataExports: Number(metrics.dataUsage?.dataExports ?? 0)
        },
        computeUsage: {
          analysisCount: Number(metrics.computeUsage?.analysisCount ?? 0),
          aiQueryCount: Number(metrics.computeUsage?.aiQueryCount ?? 0),
          mlModelExecutions: Number(metrics.computeUsage?.mlModelExecutions ?? 0),
          visualizationCount: Number(metrics.computeUsage?.visualizationCount ?? 0),
          totalComputeMinutes: Number(metrics.computeUsage?.totalComputeMinutes ?? 0),
          agentInteractions: Number(metrics.computeUsage?.agentInteractions ?? 0),
          toolExecutions: Number(metrics.computeUsage?.toolExecutions ?? 0)
        },
        storageMetrics: {
          projectCount: Number(metrics.storageMetrics?.projectCount ?? 0),
          datasetCount: Number(metrics.storageMetrics?.datasetCount ?? 0),
          artifactCount: Number(metrics.storageMetrics?.artifactCount ?? 0),
          totalStorageMB: Number(metrics.storageMetrics?.totalStorageMB ?? 0),
          archiveStorageMB: Number(metrics.storageMetrics?.archiveStorageMB ?? 0),
          temporaryStorageMB: Number(metrics.storageMetrics?.temporaryStorageMB ?? 0),
          retentionDays: Number(metrics.storageMetrics?.retentionDays ?? 0)
        },
        costBreakdown: {
          baseSubscription: Number(metrics.costBreakdown?.baseSubscription ?? 0),
          dataOverage: Number(metrics.costBreakdown?.dataOverage ?? 0),
          computeOverage: Number(metrics.costBreakdown?.computeOverage ?? 0),
          storageOverage: Number(metrics.costBreakdown?.storageOverage ?? 0),
          premiumFeatures: Number(metrics.costBreakdown?.premiumFeatures ?? 0),
          agentUsage: Number(metrics.costBreakdown?.agentUsage ?? 0),
          toolUsage: Number(metrics.costBreakdown?.toolUsage ?? 0),
          totalCost: Number(metrics.costBreakdown?.totalCost ?? 0)
        },
        quotaUtilization: {
          dataQuotaUsed: Number(metrics.quotaUtilization?.dataQuotaUsed ?? 0),
          dataQuotaLimit: Number(metrics.quotaUtilization?.dataQuotaLimit ?? 0),
          computeQuotaUsed: Number(metrics.quotaUtilization?.computeQuotaUsed ?? 0),
          computeQuotaLimit: Number(metrics.quotaUtilization?.computeQuotaLimit ?? 0),
          storageQuotaUsed: Number(metrics.quotaUtilization?.storageQuotaUsed ?? 0),
          storageQuotaLimit: Number(metrics.quotaUtilization?.storageQuotaLimit ?? 0),
          quotaResetDate: metrics.quotaUtilization?.quotaResetDate ? new Date(metrics.quotaUtilization.quotaResetDate) : new Date()
        }
      };
    };

    const loadData = async () => {
  setLoadingSafe(true);

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      try {
        const [tiersJson, customersJson, alertsJson, eventsJson] = await Promise.all([
          apiClient.get('/api/pricing/tiers').catch(() => ({})),
          apiClient.get('/api/admin/customers?limit=10').catch(() => ({})),
          apiClient.get('/api/admin/quota-alerts?level=all').catch(() => ({})),
          apiClient.get('/api/admin/billing-events?limit=100').catch(() => ({}))
        ]);

        if (tiersJson.success && Array.isArray(tiersJson.tiers)) {
          setSubscriptionTiersSafe(tiersJson.tiers.map(mapTierResponse));
        } else {
          setSubscriptionTiersSafe([]);
          if (tiersJson?.error) {
            console.error('Failed to load subscription tiers:', tiersJson.error);
          }
        }

        const customers: Array<{ id: string }> = customersJson.success && Array.isArray(customersJson.customers)
          ? customersJson.customers
          : [];

        if (customersJson?.error) {
          console.error('Failed to load customers:', customersJson.error);
        }

        if (customers.length === 0) {
          setUserMetricsSafe([]);
        } else {
          const metricsResults = await Promise.all(
            customers.map(async (customer) => {
              try {
                const metricsJson = await apiClient.get(
                  `/api/admin/users/${customer.id}/metrics?startDate=${encodeURIComponent(periodStart.toISOString())}&endDate=${encodeURIComponent(periodEnd.toISOString())}`
                );

                if (metricsJson.success && metricsJson.metrics) {
                  return mapMetricsFromResponse(metricsJson.metrics);
                }

                return null;
              } catch (err) {
                console.error(`Error fetching metrics for ${customer.id}:`, err);
                return null;
              }
            })
          );

          setUserMetricsSafe(metricsResults.filter(Boolean) as UsageMetrics[]);
        }

        if (alertsJson?.error) {
          console.error('Failed to load quota alerts:', alertsJson.error);
        }
        if (alertsJson.success && Array.isArray(alertsJson.alerts)) {
          const mappedAlerts: QuotaAlert[] = alertsJson.alerts.map((alert: any) => ({
            id: alert.id,
            userId: alert.userId,
            quotaType: alert.quotaType,
            currentUsage: alert.currentUsage,
            quotaLimit: alert.quotaLimit,
            utilizationPercent: alert.utilizationPercent,
            alertLevel: alert.alertLevel,
            message: alert.message,
            actionRequired: !!alert.actionRequired,
            suggestedActions: alert.suggestedActions ?? [],
            timestamp: alert.timestamp ? new Date(alert.timestamp) : new Date(),
            acknowledged: !!alert.acknowledged
          }));
          setQuotaAlertsSafe(mappedAlerts);
        } else {
          setQuotaAlertsSafe([]);
        }

        if (eventsJson?.error) {
          console.error('Failed to load billing events:', eventsJson.error);
        }
        if (eventsJson.success && Array.isArray(eventsJson.events)) {
          const mappedEvents: BillingEvent[] = eventsJson.events.map((event: any) => ({
            id: event.id,
            userId: event.userId,
            type: event.type,
            category: event.category,
            description: event.description,
            amount: typeof event.amount === 'number' ? event.amount : undefined,
            quantity: event.quantity ?? 1,
            unit: event.unit ?? undefined,
            metadata: event.metadata ?? {},
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            processed: !!event.processed
          }));
          setBillingEventsSafe(mappedEvents);
        } else {
          setBillingEventsSafe([]);
        }
      } catch (error) {
        console.error('Error loading subscription data:', error);
        setSubscriptionTiersSafe([]);
        setUserMetricsSafe([]);
        setQuotaAlertsSafe([]);
        setBillingEventsSafe([]);
      } finally {
        setLoadingSafe(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
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

  const handleTierSave = async () => {
    if (editingTier && editedTierData) {
      const tierId = editingTier;

      // MEDIUM PRIORITY FIX: Add form validation before saving
      const validationErrors: string[] = [];

      // Validate monthly price
      if (editedTierData.monthlyPrice !== undefined && editedTierData.monthlyPrice < 0) {
        validationErrors.push('Monthly price cannot be negative');
      }

      // Validate limits (-1 means unlimited, otherwise must be positive)
      if (editedTierData.limits) {
        const limits = editedTierData.limits as any;
        const { maxDataProcessingMB, maxStorageMB, maxProjects } = limits;

        if (maxDataProcessingMB !== undefined && maxDataProcessingMB !== -1 && maxDataProcessingMB < 0) {
          validationErrors.push('Max Data Processing must be -1 (unlimited) or a positive number');
        }
        if (maxStorageMB !== undefined && maxStorageMB !== -1 && maxStorageMB < 0) {
          validationErrors.push('Max Storage must be -1 (unlimited) or a positive number');
        }
        if (maxProjects !== undefined && maxProjects !== -1 && maxProjects < 0) {
          validationErrors.push('Max Projects must be -1 (unlimited) or a positive number');
        }
      }

      if (validationErrors.length > 0) {
        alert(`Validation errors:\n\n${validationErrors.join('\n')}`);
        return;
      }

      try {
        // Send update to backend API
        const result = await apiClient.put(`/api/pricing/tiers/${editingTier}`, {
          price: {
            monthly: editedTierData.monthlyPrice,
            yearly: editedTierData.yearlyPrice,
          },
          description: editedTierData.description,
          features: editedTierData.features,
          limits: editedTierData.limits,
          overagePricing: editedTierData.overagePricing,
          discounts: editedTierData.discounts
        });

        if (result.success) {
          // Update local state with saved data
          setSubscriptionTiers(prev =>
            prev.map(tier =>
              tier.id === tierId
                ? { ...tier, ...editedTierData } as SubscriptionTier
                : tier
            )
          );
          setEditingTier(null);
          setEditedTierData({});
          setTierSyncStatus(prev => ({
            ...prev,
            [tierId]: {
              state: 'idle',
              message: 'Saved locally. Sync to Stripe to push pricing changes.'
            }
          }));

          // Show success message with Stripe sync status
          const stripeSyncStatus = result.stripeSync?.synced
            ? `✅ Synced with Stripe (Product: ${result.stripeSync.productId}, Price: ${result.stripeSync.priceId})`
            : result.stripeSync?.error
            ? `⚠️ Stripe sync failed: ${result.stripeSync.error}`
            : '⚠️ Stripe not configured';

          console.log('Subscription tier updated successfully');
          console.log(stripeSyncStatus);

          // LOW PRIORITY FIX: Replaced alert with proper toast notification
          toast({
            title: "Tier Updated Successfully",
            description: result.stripeSync?.synced
              ? `Synced with Stripe (Product: ${result.stripeSync.productId})`
              : result.stripeSync?.error
                ? `Stripe sync failed: ${result.stripeSync.error}`
                : 'Stripe not configured - changes saved locally only',
            variant: result.stripeSync?.synced ? 'default' : 'destructive'
          });
        } else {
          console.error('Failed to update tier:', result.error);
          toast({
            title: "Failed to Update Tier",
            description: result.error || 'An unknown error occurred',
            variant: 'destructive'
          });
        }
      } catch (error) {
        console.error('Error updating subscription tier:', error);
        toast({
          title: "Error",
          description: `Error updating subscription tier: ${error instanceof Error ? error.message : String(error)}`,
          variant: 'destructive'
        });
      }
    }
  };

  const handleTierCancel = () => {
    setEditingTier(null);
    setEditedTierData({});
  };

  const handleTierStripeSync = async (tierId: string) => {
    setTierSyncStatus(prev => ({
      ...prev,
      [tierId]: {
        state: 'pending',
        message: 'Syncing with Stripe...'
      }
    }));

    try {
      const result = await apiClient.post(`/api/pricing/tiers/${tierId}/sync-stripe`);
      if (!result.success) {
        throw new Error(result.error || 'Failed to sync tier with Stripe');
      }

      setTierSyncStatus(prev => ({
        ...prev,
        [tierId]: {
          state: 'success',
          message: result.tierSource === 'seeded_from_default'
            ? 'Synced (seeded from default tier definition)'
            : 'Synced with Stripe'
        }
      }));
    } catch (error: any) {
      console.error(`Failed to sync tier ${tierId} with Stripe:`, error);
      setTierSyncStatus(prev => ({
        ...prev,
        [tierId]: {
          state: 'error',
          message: error?.message || 'Stripe sync failed'
        }
      }));
    }
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
              { id: 'python-billing', label: 'Python Billing', icon: Zap },
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
                      const maxDataProcessing = tier?.limits?.maxDataProcessingMB ?? -1;
                      const maxComputeMinutes = tier?.limits?.maxComputeMinutes ?? -1;
                      const maxStorageMb = tier?.limits?.maxStorageMB ?? -1;

                      const dataUtilization = maxDataProcessing > 0 && user.quotaUtilization.dataQuotaLimit > 0
                        ? (user.quotaUtilization.dataQuotaUsed / user.quotaUtilization.dataQuotaLimit) * 100
                        : 0;
                      const computeUtilization = maxComputeMinutes > 0 && user.quotaUtilization.computeQuotaLimit > 0
                        ? (user.quotaUtilization.computeQuotaUsed / user.quotaUtilization.computeQuotaLimit) * 100
                        : 0;
                      const storageUtilization = maxStorageMb > 0 && user.quotaUtilization.storageQuotaLimit > 0
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
                  {subscriptionTiers.map(tier => {
                    const syncState = tierSyncStatus[tier.id];
                    return (
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
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                          {/* Pricing Section */}
                          <div className="space-y-2">
                            <h5 className="text-sm font-semibold text-gray-800 border-b pb-1">Pricing</h5>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600">Monthly ($)</label>
                                <input type="number" min="0" step="0.01"
                                  value={editedTierData.monthlyPrice || 0}
                                  onChange={(e) => setEditedTierData(prev => ({ ...prev, monthlyPrice: parseFloat(e.target.value) }))}
                                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600">Yearly ($)</label>
                                <input type="number" min="0" step="0.01"
                                  value={editedTierData.yearlyPrice || 0}
                                  onChange={(e) => setEditedTierData(prev => ({ ...prev, yearlyPrice: parseFloat(e.target.value) }))}
                                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Limits Section */}
                          <div>
                            <button onClick={() => toggleSection(`limits-${tier.id}`)} className="w-full text-left text-sm font-semibold text-gray-800 border-b pb-1 flex justify-between items-center">
                              Limits <span className="text-xs text-gray-400">{expandedSections[`limits-${tier.id}`] ? '[-]' : '[+]'}</span>
                            </button>
                            {expandedSections[`limits-${tier.id}`] && (
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                {([
                                  ['maxDataProcessingMB', 'Data Processing (MB)'],
                                  ['maxStorageMB', 'Storage (MB)'],
                                  ['maxFilesSizeMB', 'Max File Size (MB)'],
                                  ['maxComputeMinutes', 'Compute (min)'],
                                  ['maxProjects', 'Projects'],
                                  ['maxTeamMembers', 'Team Members'],
                                  ['maxApiCalls', 'API Calls'],
                                  ['maxAgentInteractions', 'Agent Interactions'],
                                  ['maxToolExecutions', 'Tool Executions'],
                                  ['retentionDays', 'Retention (days)'],
                                ] as [string, string][]).map(([key, label]) => (
                                  <div key={key}>
                                    <label className="block text-xs font-medium text-gray-600">{label}</label>
                                    <input type="number" min="-1"
                                      value={(editedTierData.limits as any)?.[key] ?? 0}
                                      onChange={(e) => setEditedTierData(prev => ({
                                        ...prev,
                                        limits: { ...prev.limits!, [key]: parseInt(e.target.value) }
                                      }))}
                                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                ))}
                                <p className="col-span-2 text-xs text-gray-400">-1 = unlimited</p>
                              </div>
                            )}
                          </div>

                          {/* Overage Pricing Section */}
                          <div>
                            <button onClick={() => toggleSection(`overage-${tier.id}`)} className="w-full text-left text-sm font-semibold text-gray-800 border-b pb-1 flex justify-between items-center">
                              Overage Pricing <span className="text-xs text-gray-400">{expandedSections[`overage-${tier.id}`] ? '[-]' : '[+]'}</span>
                            </button>
                            {expandedSections[`overage-${tier.id}`] && (
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                {([
                                  ['dataPerMB', 'Data ($/MB)'],
                                  ['computePerMinute', 'Compute ($/min)'],
                                  ['storagePerMB', 'Storage ($/MB)'],
                                  ['apiCallsPer1000', 'API ($/1K calls)'],
                                  ['agentInteractionCost', 'Agent ($/use)'],
                                  ['toolExecutionCost', 'Tool ($/exec)'],
                                ] as [string, string][]).map(([key, label]) => (
                                  <div key={key}>
                                    <label className="block text-xs font-medium text-gray-600">{label}</label>
                                    <input type="number" min="0" step="0.001"
                                      value={(editedTierData.overagePricing as any)?.[key] ?? 0}
                                      onChange={(e) => setEditedTierData(prev => ({
                                        ...prev,
                                        overagePricing: { ...prev.overagePricing!, [key]: parseFloat(e.target.value) }
                                      }))}
                                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Discounts Section */}
                          <div>
                            <button onClick={() => toggleSection(`discounts-${tier.id}`)} className="w-full text-left text-sm font-semibold text-gray-800 border-b pb-1 flex justify-between items-center">
                              Discounts <span className="text-xs text-gray-400">{expandedSections[`discounts-${tier.id}`] ? '[-]' : '[+]'}</span>
                            </button>
                            {expandedSections[`discounts-${tier.id}`] && (
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                {([
                                  ['dataProcessingDiscount', 'Data Processing'],
                                  ['agentUsageDiscount', 'Agent Usage'],
                                  ['toolUsageDiscount', 'Tool Usage'],
                                  ['enterpriseDiscount', 'Enterprise'],
                                ] as [string, string][]).map(([key, label]) => (
                                  <div key={key}>
                                    <label className="block text-xs font-medium text-gray-600">{label} (%)</label>
                                    <input type="number" min="0" max="100" step="1"
                                      value={((editedTierData.discounts as any)?.[key] ?? 0) * 100}
                                      onChange={(e) => setEditedTierData(prev => ({
                                        ...prev,
                                        discounts: { ...prev.discounts!, [key]: parseFloat(e.target.value) / 100 }
                                      }))}
                                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                ))}
                                <p className="col-span-2 text-xs text-gray-400">Enter as percentage (e.g. 10 = 10%)</p>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center space-x-2 pt-2">
                            <button
                              onClick={handleTierSave}
                              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center text-sm"
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </button>
                            <button
                              onClick={handleTierCancel}
                              className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 flex items-center justify-center text-sm"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </button>
                          </div>
                          {syncState?.message && (
                            <p className="text-xs text-blue-600">{syncState.message}</p>
                          )}
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

                          <div className="mt-4 pt-4 border-t space-y-2">
                            <button
                              onClick={() => handleTierStripeSync(tier.id)}
                              className="w-full px-3 py-2 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center justify-center disabled:opacity-60"
                              disabled={syncState?.state === 'pending'}
                            >
                              {syncState?.state === 'pending' ? (
                                <>
                                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                                  Syncing…
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Sync tier to Stripe
                                </>
                              )}
                            </button>
                            {syncState?.message && (
                              <p className={`text-xs ${syncState.state === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                                {syncState.message}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })}
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
          <AnalyticsDashboard />
        )}

        {activeTab === 'python-billing' && (
          <PythonBillingSection />
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