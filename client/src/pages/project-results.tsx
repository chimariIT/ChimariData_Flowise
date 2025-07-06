import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Download, Share, Database, Lightbulb, BarChart3, PieChart, Calendar, CheckCircle, Settings, CreditCard, Zap, Brain, MessageSquare, Eye, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, Pie } from "recharts";
import AIChat from "@/components/ai-chat";
import AIInsightsPanel from "@/components/ai-insights-panel";

interface ProjectResultsProps {
  projectId: string;
  onBack: () => void;
  onSettings: () => void;
  onPayForAnalysis?: (projectData: any) => void;
  onSchemaEdit?: (projectId: string) => void;
}

export default function ProjectResults({ projectId, onBack, onSettings, onPayForAnalysis, onSchemaEdit }: ProjectResultsProps) {
  const { toast } = useToast();

  const { data: project, isLoading } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result.projects?.find((p: any) => p.id === projectId);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-600">Project not found.</p>
      </div>
    );
  }

  const handleExport = async (format: 'excel' | 'pdf' | 'csv' = 'excel') => {
    try {
      toast({
        title: "Preparing export...",
        description: `Generating your analysis report in ${format.toUpperCase()} format`
      });
      
      // Call backend to generate export
      const response = await apiClient.exportProject(projectId, format);
      
      if (response.success) {
        // Create download link
        const link = document.createElement('a');
        link.href = response.downloadUrl;
        link.download = response.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Export completed",
          description: `Your analysis report has been downloaded as ${format.toUpperCase()}.`
        });
      } else {
        throw new Error(response.message || 'Export failed');
      }
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "There was an error exporting your data.",
        variant: "destructive"
      });
    }
  };

  const handleShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/project/${projectId}`;
      
      if (navigator.share) {
        await navigator.share({
          title: `Analysis: ${project.name}`,
          text: `Check out this data analysis for ${project.name}`,
          url: shareUrl
        });
        toast({
          title: "Shared successfully",
          description: "Analysis has been shared."
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Link copied",
          description: "Share link has been copied to clipboard."
        });
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        toast({
          title: "Link copied",
          description: "Share link has been copied to clipboard."
        });
      }
    } catch (error) {
      toast({
        title: "Share failed",
        description: "There was an error sharing the link.",
        variant: "destructive"
      });
    }
  };

  // Sample chart data
  const chartData = [
    { name: "Jan", value: 40 },
    { name: "Feb", value: 55 },
    { name: "Mar", value: 70 },
    { name: "Apr", value: 45 },
    { name: "May", value: 80 },
    { name: "Jun", value: 65 }
  ];

  const pieData = [
    { name: "Category A", value: 35, color: "#3b82f6" },
    { name: "Category B", value: 28, color: "#8b5cf6" },
    { name: "Category C", value: 22, color: "#10b981" },
    { name: "Category D", value: 15, color: "#f59e0b" }
  ];

  const fieldCount = Object.keys(project.schema || {}).length;
  const insightCount = Object.keys(project.insights || {}).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold text-slate-900">ChimariData+AI</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {onPayForAnalysis && (
                <Button variant="default" onClick={() => onPayForAnalysis({
                  name: project.name,
                  recordCount: project.recordCount || 0,
                  dataSizeMB: Math.max(1, Math.round((project.recordCount || 0) * 0.001)),
                  schema: project.schema || {},
                  questions: Array.isArray(project.questions) ? project.questions : []
                })}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Pay for Analysis
                </Button>
              )}
              <Button variant="outline" onClick={onSettings}>
                <Settings className="w-4 h-4 mr-2" />
                AI Settings
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport('excel')}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('csv')}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export to CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>
                    <FileText className="w-4 h-4 mr-2" />
                    Export to PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={handleShare}>
                <Share className="w-4 h-4 mr-2" />
                Share
              </Button>
              
              {onSchemaEdit && (
                <Button
                  variant="outline"
                  onClick={() => onSchemaEdit(projectId)}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
                >
                  <Database className="w-4 h-4 mr-2" />
                  Data Schema
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Project Results Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Project Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
              <p className="text-slate-600">
                Created on {new Date(project.createdAt).toLocaleDateString()} at {new Date(project.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full flex items-center">
              <CheckCircle className="w-4 h-4 mr-1" />
              Analysis Complete
            </span>
            <span className="text-slate-600 text-sm">{insightCount} insights generated</span>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Total Records</p>
                  <p className="text-2xl font-bold text-slate-900">{project.recordCount}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Database className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Data Fields</p>
                  <p className="text-2xl font-bold text-slate-900">{fieldCount}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Insights</p>
                  <p className="text-2xl font-bold text-slate-900">{insightCount}</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Data Quality</p>
                  <p className="text-2xl font-bold text-emerald-600">98%</p>
                </div>
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Analysis Tabs */}
        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              AI Chat
            </TabsTrigger>
            <TabsTrigger value="visualizations" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Charts
            </TabsTrigger>
            <TabsTrigger value="data" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Data Schema
            </TabsTrigger>
          </TabsList>

          {/* AI Insights Tab */}
          <TabsContent value="insights">
            <AIInsightsPanel 
              projectId={projectId} 
              onPaymentRequired={(projectId, type) => {
                if (onPayForAnalysis) {
                  onPayForAnalysis({
                    name: project.name,
                    recordCount: project.recordCount || 0,
                    dataSizeMB: Math.max(1, Math.round((project.recordCount || 0) * 0.001)),
                    schema: project.schema || {},
                    questions: Array.isArray(project.questions) ? project.questions : []
                  });
                }
              }}
            />
          </TabsContent>

          {/* AI Chat Tab */}
          <TabsContent value="chat">
            <div className="max-w-4xl mx-auto">
              <AIChat projectId={projectId} />
            </div>
          </TabsContent>

          {/* Visualizations Tab */}
          <TabsContent value="visualizations">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sample Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="w-5 h-5 text-primary mr-2" />
                    Data Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Sample Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChart className="w-5 h-5 text-primary mr-2" />
                    Distribution Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Data Schema Tab */}
          <TabsContent value="data">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Data Schema */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Database className="w-5 h-5 text-primary mr-2" />
                    Data Schema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {Object.entries(project.schema || {}).map(([field, fieldInfo]) => {
                      // Handle both old string format and new object format
                      const typeValue = typeof fieldInfo === 'object' ? fieldInfo.type : fieldInfo;
                      const description = typeof fieldInfo === 'object' ? fieldInfo.description : '';
                      
                      return (
                        <div key={field} className="flex justify-between items-center py-2 border-b border-slate-100">
                          <div className="flex-1">
                            <span className="font-medium text-slate-700">{field}</span>
                            {description && (
                              <p className="text-xs text-slate-500 mt-1">{description}</p>
                            )}
                          </div>
                          <span className="text-slate-500 bg-slate-100 px-2 py-1 rounded text-xs">
                            {String(typeValue)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Business Questions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Lightbulb className="w-5 h-5 text-primary mr-2" />
                    Business Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {project.questions && Array.isArray(project.questions) && project.questions.length > 0 ? (
                    project.questions.map((question: string, index: number) => (
                      <div key={index} className="p-4 bg-blue-50 rounded-lg border-l-4 border-primary">
                        <p className="font-medium text-slate-900 mb-2">{question}</p>
                        <p className="text-sm text-slate-600">
                          {project.insights?.[question] || "Analysis in progress..."}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 text-sm">No business questions specified.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}