import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { ChartLine, Folder, FileText, Lightbulb, Plus, Search, Calendar, Database, TrendingUp, Bell, LogOut, Settings } from "lucide-react";
import UploadModal from "@/components/upload-modal";

interface DashboardProps {
  user: { id: number; email: string; firstName?: string; lastName?: string; username?: string };
  onLogout: () => void;
  onProjectSelect: (projectId: string) => void;
  onSettings: () => void;
}

export default function Dashboard({ user, onLogout, onProjectSelect, onSettings }: DashboardProps) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: projectsData, isLoading, refetch } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
  });

  const filteredProjects = projectsData?.projects?.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const stats = {
    totalProjects: projectsData?.projects?.length || 0,
    insights: projectsData?.projects?.reduce((acc, p) => acc + Object.keys(p.insights || {}).length, 0) || 0,
    files: projectsData?.projects?.length || 0,
    thisMonth: projectsData?.projects?.filter(p => {
      const created = new Date(p.createdAt);
      const now = new Date();
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length || 0
  };

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

  const getProjectStatus = (project: any) => {
    if (Object.keys(project.insights || {}).length > 0) {
      return { label: "Complete", color: "bg-emerald-100 text-emerald-700" };
    }
    return { label: "Active", color: "bg-blue-100 text-blue-700" };
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
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
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-green-600" />
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
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Database className="w-6 h-6 text-purple-600" />
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
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-orange-600" />
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
                  onClick={() => setIsUploadModalOpen(true)}
                  className="w-full justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <Plus className="w-4 h-4" />
                    <span>Upload New Dataset</span>
                  </div>
                </Button>
                
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center space-x-3">
                    <ChartLine className="w-4 h-4" />
                    <span>Create Visualization</span>
                  </div>
                </Button>
                
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center space-x-3">
                    <Lightbulb className="w-4 h-4" />
                    <span>Ask Business Question</span>
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
                {isLoading ? (
                  <div className="text-center py-8">
                    <p className="text-slate-600">Loading projects...</p>
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 mb-2">No projects found</p>
                    <Button onClick={() => setIsUploadModalOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create your first project
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredProjects.slice(0, 4).map((project) => {
                      const status = getProjectStatus(project);
                      return (
                        <div
                          key={project.id}
                          onClick={() => onProjectSelect(project.id)}
                          className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition duration-150 cursor-pointer"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <FileText className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-medium text-slate-900">{project.name}</h3>
                              <p className="text-sm text-slate-600">
                                Created {formatDate(project.createdAt)} • {Object.keys(project.insights || {}).length} insights
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>
                              {status.label}
                            </span>
                            <TrendingUp className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                      );
                    })}
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
    </div>
  );
}
