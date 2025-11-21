import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Download, Share, Database, Lightbulb, BarChart3, PieChart, Calendar, CheckCircle, Settings, CreditCard, Zap, Brain, MessageSquare, Eye, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, Pie } from "recharts";
import { AIChatLazy, AIInsightsPanelLazy } from "@/components/LazyComponents";

interface ProjectResultsProps {
  projectId: string;
  onBack: () => void;
  onSettings: () => void;
  onPayForAnalysis?: (projectData: any) => void;
  onSchemaEdit?: (projectId: string) => void;
}

export default function ProjectResults({
  projectId,
  onBack,
  onSettings,
  onPayForAnalysis,
  onSchemaEdit,
}: ProjectResultsProps) {
  const { toast } = useToast();

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      if (!projectId) {
        throw new Error("Project id is required");
      }
      return await apiClient.getProject(projectId);
    },
  });

  const {
    data: analysisResults,
    isLoading: analysisLoading,
    error: analysisError,
  } = useQuery({
    queryKey: ["/api/analysis-execution/results", projectId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/analysis-execution/results/${projectId}`);
      if (response?.success && response.results) {
        return response.results;
      }
      throw new Error(response?.error || "Analysis results are not available yet.");
    },
    enabled: !!projectId,
    retry: 1,
  });

  const {
    data: artifacts = [],
    isLoading: artifactsLoading,
    error: artifactsError,
  } = useQuery({
    queryKey: ["/api/projects", projectId, "artifacts"],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await apiClient.getProjectArtifacts(projectId);
      if (Array.isArray(res?.artifacts)) {
        return res.artifacts;
      }
      if (Array.isArray(res)) {
        return res;
      }
      return [];
    },
    enabled: !!projectId,
  });

  const pageLoading = projectLoading || (analysisLoading && !analysisError);

  const insightList = analysisResults?.insights ?? [];
  const recommendationList = analysisResults?.recommendations ?? [];

  const analysisSummary = useMemo(() => {
    const summary = analysisResults?.summary ?? {};
    const totalAnalyses =
      summary.totalAnalyses ??
      analysisResults?.analysisTypes?.length ??
      insightList.length;
    return {
      totalAnalyses,
      dataRowsProcessed: summary.dataRowsProcessed ?? 0,
      qualityScore: summary.qualityScore ?? 0,
      executionTime:
        summary.executionTime ??
        (summary.executionTimeSeconds
          ? `${summary.executionTimeSeconds}s`
          : "—"),
      datasetCount: summary.datasetCount ?? 0,
      confidence:
        typeof summary.confidence === "number"
          ? summary.confidence
          : summary.averageConfidence ?? null,
    };
  }, [analysisResults, insightList.length]);

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">Loading project...</p>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-600">
          {projectError instanceof Error ? projectError.message : "Project not found."}
        </p>
      </div>
    );
  }

  const handleExport = async (format: 'excel' | 'pdf' | 'csv' | 'pptx' = 'excel') => {
    try {
      toast({
        title: "Preparing export...",
        description: `Generating your analysis report in ${format.toUpperCase()} format`
      });
      
      // Call backend to generate export
      const blob = await apiClient.exportProject(projectId, format);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
  // Map 'excel' to csv filename for clarity
  const ext = format === 'excel' ? 'csv' : format;
  link.download = `project-${projectId}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export completed",
        description: `Your analysis report has been downloaded as ${format.toUpperCase()}.`
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error?.message || "There was an error exporting your data.",
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

  const chartData = useMemo(() => {
    const trend = analysisResults?.summary?.trendData;
    if (Array.isArray(trend) && trend.length > 0) {
      return trend.map((item: any, index: number) => ({
        name: item.label || `Period ${index + 1}`,
        value: typeof item.value === "number" ? item.value : 0,
      }));
    }
    return [
      { name: "Jan", value: 40 },
      { name: "Feb", value: 55 },
      { name: "Mar", value: 70 },
      { name: "Apr", value: 45 },
      { name: "May", value: 80 },
      { name: "Jun", value: 65 },
    ];
  }, [analysisResults]);

  const pieData = useMemo(() => {
    const breakdown = analysisResults?.summary?.categoryBreakdown;
    if (Array.isArray(breakdown) && breakdown.length > 0) {
      const fallbackColors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];
      return breakdown.map((item: any, index: number) => ({
        name: item.label || `Segment ${index + 1}`,
        value: typeof item.value === "number" ? item.value : 0,
        color: item.color || fallbackColors[index % fallbackColors.length],
      }));
    }
    return [
      { name: "Category A", value: 35, color: "#3b82f6" },
      { name: "Category B", value: 28, color: "#8b5cf6" },
      { name: "Category C", value: 22, color: "#10b981" },
      { name: "Category D", value: 15, color: "#f59e0b" },
    ];
  }, [analysisResults]);

  const fieldCount = Object.keys(project.schema || {}).length;
  const insightCount = insightList.length;
  const totalRecords = analysisSummary.dataRowsProcessed || project.recordCount || 0;
  const qualityScore = analysisSummary.qualityScore || project.qualityScore || 0;
  const datasetCountBadge = analysisSummary.datasetCount || project.datasets?.length || 0;
  const normalizedArtifacts = useMemo(() => {
    if (!Array.isArray(artifacts)) {
      return [];
    }
    return artifacts.map((artifact: any, index: number) => {
      const primaryRef =
        artifact.fileRefs?.find((ref: any) => ref?.url || ref?.signedUrl) ||
        artifact.fileRefs?.[0];
      const sizeLabel = primaryRef?.sizeMB
        ? `${Number(primaryRef.sizeMB).toFixed(1)} MB`
        : primaryRef?.size
          ? primaryRef.size
          : "—";
      return {
        id: artifact.id || `artifact-${index}`,
        name: artifact.name || artifact.type || `Artifact ${index + 1}`,
        type: (primaryRef?.type || artifact.type || "file").toUpperCase(),
        createdAt: artifact.createdAt,
        url: primaryRef?.url || primaryRef?.signedUrl || null,
        size: sizeLabel,
      };
    });
  }, [artifacts]);

  const handleArtifactDownload = (artifact: { url: string | null }) => {
    if (!artifact?.url) {
      toast({
        title: "Artifact not ready",
        description: "This artifact is still generating. Please check again shortly.",
        variant: "destructive",
      });
      return;
    }
    window.open(artifact.url, "_blank", "noopener,noreferrer");
  };

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
                  <DropdownMenuItem onClick={() => handleExport('pptx')}>
                    <FileText className="w-4 h-4 mr-2" />
                    Export Presentation (PPTX)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={handleShare}>
                <Share className="w-4 h-4 icon-gap" />
                Share
              </Button>
              
              {onSchemaEdit && (
                <Button
                  variant="outline"
                  onClick={() => onSchemaEdit(projectId)}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
                >
                  <Database className="w-4 h-4 icon-gap" />
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
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full flex items-center">
              <CheckCircle className="w-4 h-4 icon-gap" />
              Analysis Complete
            </span>
            <Badge variant="outline" className="text-xs">
              {datasetCountBadge} dataset{datasetCountBadge === 1 ? "" : "s"}
            </Badge>
            {analysisSummary.executionTime !== "—" && (
              <Badge variant="outline" className="text-xs">
                Execution {analysisSummary.executionTime}
              </Badge>
            )}
            {analysisSummary.confidence !== null && (
              <Badge variant="outline" className="text-xs">
                {analysisSummary.confidence}% confidence
              </Badge>
            )}
            <span className="text-slate-600 text-sm whitespace-nowrap">
              {insightCount} insights generated
            </span>
          </div>
        </div>

        {analysisError && (
          <div className="mb-6 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {analysisError instanceof Error
              ? analysisError.message
              : "Analysis results are still processing. You can continue reviewing project data in the meantime."}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">Total Records</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {Number(totalRecords).toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold text-emerald-600">
                    {qualityScore ? `${qualityScore}%` : "—"}
                  </p>
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
            <AIInsightsPanelLazy 
              projectId={projectId} 
              onPaymentRequired={(requestedProjectId: string, analysisType: string) => {
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
              <AIChatLazy projectId={projectId} />
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
                      const isObj = fieldInfo !== null && typeof fieldInfo === 'object';
                      const typeValue = isObj ? (fieldInfo as any).type : fieldInfo;
                      const description = isObj ? (fieldInfo as any).description : '';
                      
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
                      <div key={index} className="p-4 bg-blue-50 rounded-lg border-l-4 border-primary/80">
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

        {(artifactsLoading || normalizedArtifacts.length > 0 || artifactsError) && (
          <Card className="mt-8" data-testid="project-artifacts-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Generated Artifacts
              </CardTitle>
              <CardDescription>
                Export-ready deliverables created during the analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              {artifactsLoading ? (
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Zap className="w-4 h-4 animate-pulse" />
                  Compiling artifact list…
                </div>
              ) : artifactsError ? (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                  {artifactsError instanceof Error
                    ? artifactsError.message
                    : "Artifacts are still generating. Please refresh later."}
                </div>
              ) : normalizedArtifacts.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No artifacts are available yet. Run the analysis to generate reports and exports.
                </p>
              ) : (
                <div className="space-y-3">
                  {normalizedArtifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{artifact.name}</p>
                        <p className="text-sm text-slate-500">
                          {artifact.type}
                          {artifact.size ? ` • ${artifact.size}` : ""}
                          {artifact.createdAt
                            ? ` • ${new Date(artifact.createdAt).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleArtifactDownload(artifact)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}