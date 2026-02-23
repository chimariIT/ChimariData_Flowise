// client/src/pages/admin/index.tsx

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  ArrowLeft,
  AlertTriangle,
  MessageSquare,
  Receipt,
  Calculator,
  Tag,
  Database,
  ShieldAlert,
  Brain,
} from "lucide-react";
import AdminDashboard from "./admin-dashboard";
import AgentManagement from "./agent-management";
import SubscriptionManagement from "./subscription-management";
import ToolsManagement from "./tools-management";
import Consultations from "./consultations";
import ConsultationPricing from "./consultation-pricing";
import PricingServicesAdmin from "./pricing-services";
import ProjectStateInspector from "./project-state-inspector";
import AnalysisPricing from "./analysis-pricing";
import CampaignManagement from "./campaign-management";
// P2-1, P2-2, P2-3: New admin pages
import UserManagement from "./user-management";
import ErrorTracking from "./error-tracking";
import DatabaseOptimization from "./database-optimization";
import KnowledgeManagement from "./knowledge-management";

interface AdminLayoutProps {
  user?: any;
}

export default function AdminLayout({ user }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Check user permissions
  const { data: permissions, isLoading: permissionsLoading, error: permissionsError } = useQuery({
    queryKey: ['/api/admin/permissions'],
    queryFn: async () => {
      // Get auth token from localStorage
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('/api/admin/permissions', {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        // If 401, token might be invalid or expired
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        throw new Error(`Failed to fetch permissions: ${response.status}`);
      }
      return response.json();
    }
  });

  // Don't redirect - show access denied instead
  // Non-admin users should see access denied message, not be redirected to dashboard

  // Extract tab from URL path
  useEffect(() => {
    const pathParts = location.split('/');
    if (pathParts[2]) {
      setActiveTab(pathParts[2]);
    }
  }, [location]);

  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setLocation(`/admin/${tab}`);
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (permissionsError || !permissions?.success) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                You don't have permission to access the admin panel. Please contact your administrator.
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => setLocation('/dashboard')}
              className="w-full mt-4"
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const userRole = permissions.data.role;
  const userPermissions = permissions.data.permissions;

  // Check if user has admin permissions
  const isAdmin = userRole.id === 'admin' || userRole.id === 'super_admin';
  const isSuperAdmin = userRole.id === 'super_admin';

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                You don't have permission to access the admin panel. Please contact your administrator.
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => setLocation('/dashboard')}
              className="w-full mt-4"
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
                <p className="text-sm text-gray-600">
                  Welcome, {user?.email} ({userRole.name})
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="bg-green-50 text-green-700">
                <Shield className="w-3 h-3 mr-1" />
                {userRole.name}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex flex-wrap w-full gap-1 mb-6 h-auto p-1">
            <TabsTrigger value="dashboard" className="flex items-center gap-1 text-xs">
              <BarChart3 className="w-3 h-3" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="user-management" className="flex items-center gap-1 text-xs">
              <Users className="w-3 h-3" />
              Users
            </TabsTrigger>
            <TabsTrigger value="subscription-management" className="flex items-center gap-1 text-xs">
              <DollarSign className="w-3 h-3" />
              Subscriptions
            </TabsTrigger>
            <TabsTrigger value="service-pricing" className="flex items-center gap-1 text-xs">
              <DollarSign className="w-3 h-3" />
              Service Pricing
            </TabsTrigger>
            <TabsTrigger value="analysis-pricing" className="flex items-center gap-1 text-xs">
              <TrendingUp className="w-3 h-3" />
              Analysis Pricing
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-1 text-xs">
              <Tag className="w-3 h-3" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="consultations" className="flex items-center gap-1 text-xs">
              <MessageSquare className="w-3 h-3" />
              Consultations
            </TabsTrigger>
            <TabsTrigger value="consultation-pricing" className="flex items-center gap-1 text-xs">
              <Receipt className="w-3 h-3" />
              Consult Pricing
            </TabsTrigger>
            <TabsTrigger value="agent-management" className="flex items-center gap-1 text-xs">
              <Bot className="w-3 h-3" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="tools-management" className="flex items-center gap-1 text-xs">
              <Wrench className="w-3 h-3" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="error-tracking" className="flex items-center gap-1 text-xs">
              <ShieldAlert className="w-3 h-3" />
              Errors
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-1 text-xs">
              <Database className="w-3 h-3" />
              Database
            </TabsTrigger>
            <TabsTrigger value="state-inspector" className="flex items-center gap-1 text-xs">
              <Activity className="w-3 h-3" />
              State Inspector
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-1 text-xs">
              <Brain className="w-3 h-3" />
              Knowledge
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <AdminDashboard user={user} />
          </TabsContent>

          <TabsContent value="user-management">
            <UserManagement />
          </TabsContent>

          <TabsContent value="subscription-management">
            <SubscriptionManagement />
          </TabsContent>

          <TabsContent value="service-pricing">
            <PricingServicesAdmin onBack={() => setActiveTab('dashboard')} />
          </TabsContent>

          <TabsContent value="analysis-pricing">
            <AnalysisPricing onBack={() => setActiveTab('dashboard')} />
          </TabsContent>

          <TabsContent value="campaigns">
            <CampaignManagement />
          </TabsContent>

          <TabsContent value="consultations">
            <Consultations />
          </TabsContent>

          <TabsContent value="consultation-pricing">
            <ConsultationPricing />
          </TabsContent>

          <TabsContent value="agent-management">
            <AgentManagement />
          </TabsContent>

          <TabsContent value="tools-management">
            <ToolsManagement />
          </TabsContent>

          <TabsContent value="error-tracking">
            <ErrorTracking />
          </TabsContent>

          <TabsContent value="database">
            <DatabaseOptimization />
          </TabsContent>

          <TabsContent value="state-inspector">
            <ProjectStateInspector />
          </TabsContent>

          <TabsContent value="knowledge">
            <KnowledgeManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}