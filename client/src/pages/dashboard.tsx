import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { ChartLine, Folder, FileText, Lightbulb, Plus, Search, Calendar, Database, Bell, LogOut, Settings, BarChart3, Target, Brain, AlertCircle, RefreshCw } from "lucide-react";
import UploadModal from "@/components/upload-modal";
import { AdvancedAnalysisModalLazy } from "@/components/LazyComponents";
import UpgradeDialog from "@/components/upgrade-dialog";
import { JourneyProgressCard } from "@/components/JourneyProgressCard";

interface DashboardProps {
  user: { id: number; email: string; firstName?: string; lastName?: string; username?: string };
  onLogout: () => void;
  onProjectSelect: (projectId: string) => void;
  onSettings: () => void;
  onVisualizationPage?: () => void;
  onAskQuestionPage?: () => void;
}

export default function Dashboard({ user, onLogout, onProjectSelect, onSettings, onVisualizationPage, onAskQuestionPage }: DashboardProps) {
  const [, setLocation] = useLocation();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAdvancedAnalysisOpen, setIsAdvancedAnalysisOpen] = useState(false);
  const [selectedProjectForAnalysis, setSelectedProjectForAnalysis] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [upgradeDialog, setUpgradeDialog] = useState<{
    isOpen: boolean;
    reason?: string;
    details?: any;
  }>({ isOpen: false });
  const { toast } = useToast();

  // Listen for upgrade dialog events
  useEffect(() => {
    const handleUpgradeEvent = (event: CustomEvent) => {
      setUpgradeDialog({
        isOpen: true,
        reason: event.detail.reason,
        details: event.detail
      });
    };

    window.addEventListener('showUpgradeDialog', handleUpgradeEvent as EventListener);
    return () => {
      window.removeEventListener('showUpgradeDialog', handleUpgradeEvent as EventListener);
    };
  }, []);

  const { data: projectsData, isLoading, error: projectsError, refetch } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 2,
  });

  const filteredProjects = projectsData?.projects?.filter((project: any) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // MEDIUM PRIORITY FIX: Memoize stats to avoid recalculation on every render
  const stats = useMemo(() => {
    const projects = projectsData?.projects || [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return {
      totalProjects: projects.length,
      insights: projects.reduce((acc: number, p: any) => acc + Object.keys(p.insights || {}).length, 0),
      files: projects.length,
      thisMonth: projects.filter((p: any) => {
        const created = new Date(p.createdAt);
        return created.getMonth() === currentMonth && created.getFullYear() === currentYear;
      }).length
    };
  }, [projectsData?.projects]);

  const handleLogout = async () => {
    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      onLogout();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive"
      });
    }
  };

  const handleUploadSuccess = () => {
    setIsUploadModalOpen(false);
    refetch();
    toast({
      title: "Success",
      description: "Project created successfully!"
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <ChartLine className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold text-slate-900">ChimariData+AI</span>
              </div>
              <div className="hidden md:flex items-center space-x-6 ml-8">
                <a href="#" className="text-slate-700 hover:text-primary font-medium">Dashboard</a>
                <a href="#" className="text-slate-500 hover:text-primary">Projects</a>
                <a href="#" className="text-slate-500 hover:text-primary">Analytics</a>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm">
                <Bell className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onSettings}>
                <Settings className="w-4 h-4" />
              </Button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {(user.firstName || user.email).substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <span className="text-slate-700 font-medium">
                  {user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user.email
                  }
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="dashboard-content">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
          <p className="text-slate-600">Manage your data projects and insights</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Total Projects</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.totalProjects}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Folder className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Insights Generated</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.insights}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Data Files</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.files}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Database className="w-6 h-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">This Month</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.thisMonth}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions & Recent Projects */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={() => setLocation('/')}
                  className="w-full justify-between bg-blue-600 hover:bg-blue-700"
                  data-testid="button-choose-journey-dashboard"
                >
                  <div className="flex items-center space-x-3">
                    <Target className="w-4 h-4" />
                    <span>Choose Analytics Journey</span>
                  </div>
                </Button>

                <Button 
                  onClick={() => setIsUploadModalOpen(true)}
                  className="w-full justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <Plus className="w-4 h-4" />
                    <span>Upload New Dataset</span>
                  </div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={onVisualizationPage}
                >
                  <div className="flex items-center space-x-3">
                    <ChartLine className="w-4 h-4" />
                    <span>Create Visualization</span>
                  </div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={onAskQuestionPage}
                >
                  <div className="flex items-center space-x-3">
                    <Lightbulb className="w-4 h-4" />
                    <span>Ask Business Question</span>
                  </div>
                </Button>

                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={() => {
                    if (filteredProjects.length === 0) {
                      toast({
                        title: "No Projects",
                        description: "Please upload a project first to use advanced analysis",
                        variant: "destructive"
                      });
                      return;
                    }
                    const mostRecent = filteredProjects
                      .slice()
                      .sort((a: any, b: any) => {
                        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return dateB - dateA;
                      })[0];
                    setSelectedProjectForAnalysis(mostRecent);
                    setIsAdvancedAnalysisOpen(true);
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <BarChart3 className="w-4 h-4" />
                    <span>Advanced Analysis</span>
                  </div>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Projects */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Projects</CardTitle>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search projects..."
                      className="pl-10 w-64"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {projectsError ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <p className="text-slate-600 mb-2">Failed to load projects</p>
                    <p className="text-slate-500 text-sm mb-4">
                      {projectsError instanceof Error ? projectsError.message : 'An unexpected error occurred'}
                    </p>
                    <Button variant="outline" onClick={() => refetch()}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                ) : isLoading ? (
                  <div className="text-center py-8">
                    <p className="text-slate-600">Loading projects...</p>
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    {/* LOW PRIORITY FIX: Distinguish between no projects vs no search results */}
                    {projectsData?.projects?.length > 0 ? (
                      <>
                        <p className="text-slate-600 mb-2">No projects match "{searchQuery}"</p>
                        <Button variant="outline" onClick={() => setSearchQuery("")}>
                          <Search className="w-4 h-4 mr-2" />
                          Clear search
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-600 mb-2">No projects yet</p>
                        <p className="text-slate-500 text-sm mb-4">Upload your first dataset to get started</p>
                        <Button onClick={() => setIsUploadModalOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Create your first project
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {/* P1 FIX: Sort projects by updatedAt/createdAt descending before display */}
                    {filteredProjects
                      .slice()
                      .sort((a: any, b: any) => {
                        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return dateB - dateA;
                      })
                      .slice(0, 4)
                      .map((project: any) => (
                        <JourneyProgressCard
                          key={project.id}
                          project={project}
                          onSelect={onProjectSelect}
                        />
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* Advanced Analysis Modal */}
      {isAdvancedAnalysisOpen && selectedProjectForAnalysis && (
        <AdvancedAnalysisModalLazy
          isOpen={isAdvancedAnalysisOpen}
          onClose={() => {
            setIsAdvancedAnalysisOpen(false);
            setSelectedProjectForAnalysis(null);
          }}
          projectId={selectedProjectForAnalysis.id}
          schema={selectedProjectForAnalysis.schema}
        />
      )}

      {/* Upgrade Dialog */}
      <UpgradeDialog
        isOpen={upgradeDialog.isOpen}
        onClose={() => setUpgradeDialog({ isOpen: false })}
        reason={upgradeDialog.reason}
        details={upgradeDialog.details}
      />
    </div>
  );
}
