import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { useJourneyState } from "@/hooks/useJourneyState";
import { getResumeRoute, canResumeJourney } from "@/utils/journey-routing";
import { 
  FolderOpen, 
  Plus, 
  Eye, 
  Download, 
  Calendar,
  BarChart3,
  Brain,
  Target,
  ArrowRight,
  User,
  Settings,
  LogOut,
  Shield,
  PlayCircle
} from "lucide-react";

interface UserDashboardProps {
  user?: any;
  onLogout?: () => void;
}

interface DashboardProject {
  id: string;
  name: string;
  type?: string;
  status?: string;
  createdAt?: string;
  lastModified?: string;
  journeyType?: string;
  recordCount?: number;
  insights?: number;
  visualizations?: number;
}

export default function UserDashboard({ user, onLogout }: UserDashboardProps) {
  const [, setLocation] = useLocation();

  // Check if user has admin permissions
  const { data: permissions } = useQuery({
    queryKey: ['/api/admin/permissions'],
    queryFn: async () => {
      try {
        // Use apiClient which includes auth token automatically
        const result = await apiClient.get('/api/admin/permissions');
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    }
  });

  const isAdmin = permissions?.role?.id === 'admin' || permissions?.role?.id === 'super_admin';

  // Fetch real user projects from API
  const { data: userProjects = [], isLoading: projectsLoading } = useQuery<DashboardProject[]>({
    queryKey: ['/api/projects', user?.id],
    queryFn: async () => {
      try {
        // Use apiClient which includes auth token automatically
        const result = await apiClient.get('/api/projects');
        return (result.projects || []) as DashboardProject[];
      } catch (error) {
        console.error('Error fetching projects:', error);
        console.warn('Failed to fetch projects, using empty array');
        return [];
      }
    },
    enabled: !!user?.id
  });

  // ✅ P1 FIX: Format relative time for activity display
  const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return 'Unknown time';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // ✅ P1 FIX: Generate recent activity from real project data
  const recentActivity = useMemo(() => {
    if (!userProjects || userProjects.length === 0) return [];

    return userProjects
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.lastModified || a.createdAt || 0).getTime();
        const dateB = new Date(b.lastModified || b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 5)
      .map(project => ({
        type: project.status === 'completed' ? 'completed' :
              project.status === 'in_progress' || project.status === 'in-progress' ? 'started' : 'created',
        name: project.name,
        timestamp: project.lastModified || project.createdAt,
        color: project.status === 'completed' ? 'bg-green-500' :
               project.status === 'in_progress' || project.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-400'
      }));
  }, [userProjects]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'non-tech': return Brain;
      case 'business': return BarChart3;
      case 'technical': return Settings;
      case 'consultation': return Target;
      default: return FolderOpen;
    }
  };

  const handleNewProject = () => {
    // Go to journey selection page
    setLocation('/');
  };

  const handleViewProject = (projectId: string) => {
    setLocation(`/project/${projectId}`);
  };

  const handleResumeJourney = async (projectId: string, journeyType?: string) => {
    try {
      // Fetch journey state to determine current step
      const journeyState = await apiClient.getJourneyState(projectId);
      const route = await getResumeRoute(projectId, journeyState);
      setLocation(route);
    } catch (error) {
      console.error('Failed to resume journey:', error);
      // Fallback to project page if journey state unavailable
      setLocation(`/project/${projectId}?resume=true`);
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col" data-testid="dashboard-content">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">ChimariData</h1>
                <p className="text-sm text-gray-600">User Dashboard</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {user && (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700">
                      Welcome, {user.firstName || user.email?.split('@')[0] || 'User'}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation('/settings')} data-testid="nav-settings">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setLocation('/admin')} data-testid="nav-admin">
                      <Shield className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={onLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-4 flex-1 overflow-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.firstName || 'User'}!
          </h2>
          <p className="text-lg text-gray-600">
            Manage your data analysis projects and explore new insights.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleNewProject}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Start New Analysis
              </CardTitle>
              <CardDescription>
                Create a new data analysis project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                <ArrowRight className="w-4 h-4 mr-2" />
                Choose Journey
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation('/journeys/template_based/prepare')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-green-600" />
                Browse Templates
              </CardTitle>
              <CardDescription>
                Explore business analysis templates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <ArrowRight className="w-4 h-4 mr-2" />
                View Templates
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation('/pricing')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-600" />
                View Pricing
              </CardTitle>
              <CardDescription>
                See our analysis pricing plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <ArrowRight className="w-4 h-4 mr-2" />
                View Plans
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Projects Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">Your Projects</h3>
            <Button onClick={handleNewProject}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>

          {projectsLoading ? (
            <Card className="text-center py-12">
              <CardContent>
                <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Loading your projects...</h3>
              </CardContent>
            </Card>
          ) : userProjects.length > 0 ? (
            <div className="grid gap-6">
              {userProjects.map((project) => {
                const projectType = project.type ?? 'project';
                const projectStatus = project.status ?? 'draft';
                const TypeIcon = getTypeIcon(projectType);
                const insightsCount = project.insights ?? 0;
                const visualizationCount = project.visualizations ?? 0;
                return (
                  <Card key={project.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <TypeIcon className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{project.name}</CardTitle>
                            <CardDescription className="flex items-center gap-4 mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Created {project.createdAt}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Modified {project.lastModified}
                              </span>
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(projectStatus)}>
                            {projectStatus.replace('-', ' ')}
                          </Badge>
                          <Badge variant="outline">
                            {projectType}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Brain className="w-4 h-4" />
                            {insightsCount} insights
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-4 h-4" />
                            {visualizationCount} visualizations
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Resume Journey button - show if project has a journey and is not completed */}
                          <ProjectResumeButton 
                            projectId={project.id}
                            journeyType={project.journeyType}
                            status={projectStatus}
                            onResume={handleResumeJourney}
                          />
                          <Button variant="outline" size="sm" onClick={() => handleViewProject(project.id)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          {projectStatus === 'completed' && (
                            <Button variant="outline" size="sm">
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
                <p className="text-gray-600 mb-6">
                  Start your first data analysis project to see it here.
                </p>
                <Button onClick={handleNewProject}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Project
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Activity - P1 FIX: Now using real project data */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Recent Activity</h3>
          <Card>
            <CardContent className="p-6">
              {recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className={`w-2 h-2 ${activity.color} rounded-full`}></div>
                      <span className="text-sm text-gray-600">
                        {activity.type === 'completed' ? 'Completed analysis: ' :
                         activity.type === 'started' ? 'Started project: ' : 'Created project: '}
                        {activity.name}
                      </span>
                      <span className="text-xs text-gray-500 ml-auto">
                        {formatRelativeTime(activity.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">No recent activity yet.</p>
                  <p className="text-xs mt-1">Start a new project to see your activity here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Project Resume Button Component
 * Shows Resume Journey button if project has an active journey
 */
function ProjectResumeButton({ 
  projectId, 
  journeyType, 
  status,
  onResume 
}: { 
  projectId: string; 
  journeyType?: string;
  status?: string;
  onResume: (projectId: string, journeyType?: string) => void;
}) {
  const { data: journeyState } = useJourneyState(projectId, { 
    enabled: !!projectId && status !== 'completed' 
  });
  
  const canResume = canResumeJourney(journeyState);
  
  // Don't show if journey cannot resume or already completed
  if (status === 'completed' || !canResume) {
    return null;
  }
  
  return (
    <Button 
      variant="default" 
      size="sm" 
      onClick={() => onResume(projectId, journeyType)}
      className="bg-blue-600 hover:bg-blue-700 text-white"
    >
      <PlayCircle className="w-4 h-4 mr-2" />
      Resume Journey
    </Button>
  );
}






















