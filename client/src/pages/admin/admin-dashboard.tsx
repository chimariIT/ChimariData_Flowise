import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomerSelectionModal } from "@/components/CustomerSelectionModal";
import { useConsultant } from "@/contexts/ConsultantContext";
import { apiClient } from "@/lib/api";
import {
  Users,
  Settings,
  BarChart3,
  DollarSign,
  Bot,
  Wrench,
  TrendingUp,
  Activity,
  Shield,
  Eye,
  UserCog,
  UserCheck,
  RefreshCw,
  Loader2
} from "lucide-react";

interface AdminDashboardProps {
  user?: any;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [, setLocation] = useLocation();
  const { isConsultantMode, selectedCustomer, setConsultantMode, clearConsultantMode } = useConsultant();
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Fetch admin stats from Python backend via Vite proxy
  const { data: overview, isLoading: overviewLoading, error: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ['/api/v1/admin/overview'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/admin/overview');
      return response?.data || response;
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['/api/v1/admin/health'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/admin/health');
      return response?.data || response;
    },
    staleTime: 30000,
  });

  const adminSections = [
    {
      title: "Pricing & Billing",
      description: "Manage subscription tiers, service pricing, and billing configuration",
      icon: DollarSign,
      path: "/admin/pricing-billing",
      color: "text-green-600"
    },
    {
      title: "Service Pricing",
      description: "Configure pricing for one-time services (pay-per-analysis, consultation)",
      icon: Settings,
      path: "/admin/pricing-services",
      color: "text-blue-600"
    },
    {
      title: "Subscription Management",
      description: "Manage user subscriptions, tiers, and billing",
      icon: DollarSign,
      path: "/admin/subscription-management",
      color: "text-green-600"
    },
    {
      title: "Agent Management",
      description: "Configure AI agents, checkpoints, and workflows",
      icon: Bot,
      path: "/admin/agent-management",
      color: "text-blue-600"
    },
    {
      title: "Tools Management",
      description: "Manage analysis tools and integrations",
      icon: Wrench,
      path: "/admin/tools-management",
      color: "text-purple-600"
    },
    {
      title: "Technical State Viewer",
      description: "Inspect live journeyProgress (SSOT) JSON state for any project",
      icon: Activity,
      path: "/admin/state-inspector",
      color: "text-indigo-600"
    }
  ];

  // Build stats from Python backend API data
  const stats = [
    {
      title: "Total Users",
      value: overviewLoading ? "..." : (overview?.users?.total?.toLocaleString() || "0"),
      icon: Users,
      color: "text-blue-600"
    },
    {
      title: "Total Projects",
      value: overviewLoading ? "..." : (overview?.projects?.total?.toLocaleString() || "0"),
      icon: TrendingUp,
      color: "text-green-600"
    },
    {
      title: "Total Roles",
      value: overviewLoading ? "..." : (overview?.rbac?.total_roles?.toLocaleString() || "0"),
      icon: UserCog,
      color: "text-indigo-600"
    },
    {
      title: "Total Permissions",
      value: overviewLoading ? "..." : (overview?.rbac?.total_permissions?.toLocaleString() || "0"),
      icon: Shield,
      color: "text-purple-600"
    },
    {
      title: "Active Tiers",
      value: overviewLoading ? "..." : (overview?.billing?.active_tiers?.toLocaleString() || "0"),
      icon: DollarSign,
      color: "text-green-600"
    },
    {
      title: "System Status",
      value: healthLoading ? "..." : (health?.services?.admin_service === "up" ? "Operational" : "Unknown"),
      icon: Activity,
      color: health?.services?.admin_service === "up" ? "text-emerald-600" : "text-red-600"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-8 w-8 text-indigo-600" />
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <Badge variant="secondary" className="ml-2">Admin Mode</Badge>
              </div>
              <p className="text-gray-600">
                Manage system configuration, users, and billing
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCustomerModalOpen(true)}
                className="flex items-center gap-2"
              >
                <UserCog className="h-4 w-4" />
                Act on Behalf of Customer
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">System Overview</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchOverview()}
              disabled={overviewLoading}
            >
              {overviewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
          {overviewError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              Failed to load system overview. Please try refreshing.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                    </div>
                    <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Admin Sections */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Administration</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {adminSections.map((section, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <section.icon className={`h-6 w-6 ${section.color}`} />
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => setLocation(section.path)}
                    className="w-full"
                  >
                    Manage
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Billing Configuration */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Billing Configuration
            </CardTitle>
            <CardDescription>
              Configure subscription tiers, pricing, and quota limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { displayName: 'Trial', pricing: { monthly: 1 }, quotas: { maxProjects: 1, maxAnalyses: 3 }, description: 'Basic features' },
                  { displayName: 'Starter', pricing: { monthly: 10 }, quotas: { maxProjects: 5, maxAnalyses: 30 }, description: 'All journey types' },
                  { displayName: 'Professional', pricing: { monthly: 20 }, quotas: { maxProjects: 25, maxAnalyses: 300 }, description: 'Priority support' },
                  { displayName: 'Enterprise', pricing: { monthly: 50 }, quotas: { maxProjects: 100, maxAnalyses: 1000 }, description: 'Custom solutions' }
                ]).map((tier: any, idx: number) => (
                  <div key={idx} className="p-4 border rounded-lg">
                    <h3 className="font-semibold text-sm text-gray-700 mb-2">
                      {tier.displayName || tier.name} (${tier.pricing?.monthly ?? tier.price ?? 0}/mo)
                    </h3>
                    <p className="text-xs text-gray-600">
                      {tier.quotas?.maxProjects ?? '?'} projects, {tier.quotas?.maxAnalyses ?? '?'} analyses, {tier.description || ''}
                    </p>
                  </div>
                ))}
              </div>
              <Button
                onClick={() => setLocation('/admin/subscription-management')}
                variant="outline"
                className="w-full"
              >
                Configure Billing Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Consultant Mode */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Consultant Mode
            </CardTitle>
            <CardDescription>
              Select a customer to act on behalf of, then access their dashboard to run projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isConsultantMode && selectedCustomer ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <UserCheck className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-green-900 mb-1">
                        Acting on Behalf of: {selectedCustomer.name}
                      </h4>
                      <p className="text-sm text-green-800">
                        {selectedCustomer.email} {selectedCustomer.company && `• ${selectedCustomer.company}`}
                      </p>
                      <p className="text-sm text-green-700 mt-1">
                        All projects created will be attributed to this customer.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => setLocation('/dashboard')}
                    className="flex items-center gap-2"
                  >
                    <UserCog className="h-4 w-4" />
                    Access Customer Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsCustomerModalOpen(true)}
                  >
                    Change Customer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={clearConsultantMode}
                  >
                    Exit Consultant Mode
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-900 mb-1">Acting on Behalf of Customers</h4>
                      <p className="text-sm text-amber-800">
                        Select a customer to act on their behalf. All projects created will be attributed to the selected customer.
                        Your admin credentials will be logged for audit purposes.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => setIsCustomerModalOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <UserCog className="h-4 w-4" />
                    Select Customer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLocation('/dashboard')}
                    disabled
                  >
                    Access Customer Dashboard
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  You must select a customer first to access their dashboard.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => setLocation('/dashboard')}
              >
                Back to Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Refresh Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Selection Modal */}
      <CustomerSelectionModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSelectCustomer={setConsultantMode}
      />
    </div>
  );
}
