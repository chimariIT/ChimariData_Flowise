import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Shield
} from "lucide-react";

interface UserDashboardProps {
  user?: any;
  onLogout?: () => void;
}

export default function UserDashboard({ user, onLogout }: UserDashboardProps) {
  const [, setLocation] = useLocation();

  // Check if user has admin permissions
  const { data: permissions } = useQuery({
    queryKey: ['/api/admin/permissions'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/admin/permissions', {
          credentials: 'include',
        });
        if (!response.ok) {
          return null;
        }
        const result = await response.json();
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    },
  });

  const isAdmin = permissions?.role?.id === 'admin' || permissions?.role?.id === 'super_admin';

  // Fetch real user projects from API
  const { data: userProjects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/projects', user?.id],
    queryFn: async () => {
      try {
        const response = await fetch('/api/projects', {
          credentials: 'include',
        });
        if (!response.ok) {
          console.warn('Failed to fetch projects, using empty array');
          return [];
        }
        const result = await response.json();
        return result.projects || [];
      } catch (error) {
        console.error('Error fetching projects:', error);
        return [];
      }
    },
    enabled: !!user?.id,
  });

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
    setLocation('/');
  };

  const handleViewProject = (projectId: string) => {
    setLocation(`/project/${projectId}`);
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

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation('/')}>
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
                const TypeIcon = getTypeIcon(project.type);
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
                          <Badge className={getStatusColor(project.status)}>
                            {project.status.replace('-', ' ')}
                          </Badge>
                          <Badge variant="outline">
                            {project.type}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Brain className="w-4 h-4" />
                            {project.insights} insights
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-4 h-4" />
                            {project.visualizations} visualizations
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleViewProject(project.id)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          {project.status === 'completed' && (
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

        {/* Recent Activity */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Recent Activity</h3>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    Completed analysis: Customer Behavior Analysis Q4 2024
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">2 hours ago</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    Started new project: Sales Performance Review
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">1 day ago</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    Created draft: Technical Data Pipeline Analysis
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">2 days ago</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}



















