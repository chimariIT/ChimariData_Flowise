import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getResumeRoute } from "@/utils/journey-routing";
import { ArrowLeft, Database, FileText, Settings, BarChart3, Brain, Wrench, Target, Layers, Route, Bot, Upload, Timer, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import SchemaEditor from "@/components/schema-editor";
import { DataTransformationLazy } from "@/components/LazyComponents";
import DataAnalysis from "@/components/data-analysis";
import AIInsights from "@/components/ai-insights";
import GuidedAnalysisWizard from "@/components/GuidedAnalysisWizard";
import { AdvancedVisualizationWorkshop } from "@/components/advanced-visualization-workshop";
import { ProjectArtifactTimeline } from "@/components/ProjectArtifactTimeline";
import { WorkflowTransparencyDashboard } from "@/components/workflow-transparency-dashboard";
import { JourneyLifecycleIndicator } from "@/components/JourneyLifecycleIndicator";
import { EnhancedDataWorkflow } from "@/components/EnhancedDataWorkflow";
import AgentActivityOverview from "@/components/agent-activity-overview";
import AgentCheckpoints from "@/components/agent-checkpoints";
import { useJourneyState } from "@/hooks/useJourneyState";
import { toast } from "@/hooks/use-toast";

interface ProjectPageProps {
  projectId: string;
}

export default function ProjectPage({ projectId }: ProjectPageProps) {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [showGuidedAnalysis, setShowGuidedAnalysis] = useState(false);
  const hasAutoNavigatedRef = useRef(false);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      return await apiClient.getProject(projectId);
    },
  });

  const enableSlaMetrics = (import.meta.env.VITE_FEATURE_SLA_METRICS ?? 'true') === 'true';

  const { data: uploadMetricsSummary, isLoading: isUploadMetricsLoading } = useQuery({
    queryKey: ['performance-metrics', projectId],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/api/performance/metrics/my-uploads?timeWindow=3600000');
        return response?.summary ?? null;
      } catch (metricsError) {
        console.warn('Failed to load upload SLA metrics:', metricsError);
        return null;
      }
    },
    refetchInterval: 60000,
    enabled: enableSlaMetrics
  });

  // Get journey state to determine which tabs to show
  const { data: journeyState } = useJourneyState(projectId, { 
    enabled: !!projectId && !!project?.journeyType 
  });

  const resolveArtifactFileRef = useCallback((artifact: any) => {
    if (!artifact || !Array.isArray(artifact.fileRefs)) {
      return null;
    }
    return (
      artifact.fileRefs.find((ref: any) => ref?.url || ref?.signedUrl) ||
      artifact.fileRefs[0] ||
      null
    );
  }, []);

  const handleArtifactPreview = useCallback((artifact: any) => {
    const ref = resolveArtifactFileRef(artifact);
    const artifactUrl = ref?.url || ref?.signedUrl;
    if (!artifactUrl) {
      toast({
        title: "Artifact not ready",
        description: "This artifact is still generating or unavailable.",
        variant: "destructive",
      });
      return;
    }
    window.open(artifactUrl, "_blank", "noopener,noreferrer");
  }, [resolveArtifactFileRef]);

  const handleArtifactDownload = useCallback((artifact: any) => {
    const ref = resolveArtifactFileRef(artifact);
    const artifactUrl = ref?.url || ref?.signedUrl;
    if (!artifactUrl) {
      toast({
        title: "Download unavailable",
        description: "We couldn't find a downloadable file for this artifact yet.",
        variant: "destructive",
      });
      return;
    }

    try {
      const link = document.createElement("a");
      link.href = artifactUrl;
      link.download = (artifact?.name || ref?.fileName || "chimari-artifact").replace(/\s+/g, "-");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to download artifact:", error);
      toast({
        title: "Download failed",
        description: "Please try again or contact support if the issue persists.",
        variant: "destructive",
      });
    }
  }, [resolveArtifactFileRef]);

  // Handle resume query parameter
  const currentSearch = useMemo(() => {
    const queryIndex = location.indexOf('?');
    return queryIndex >= 0 ? location.slice(queryIndex + 1) : '';
  }, [location]);

  useEffect(() => {
    if (!journeyState || !journeyState.canResume || hasAutoNavigatedRef.current) {
      return;
    }

    const params = new URLSearchParams(currentSearch);
    if (!params.has('resume')) {
      return;
    }

    const currentRoute = location;

    getResumeRoute(projectId, journeyState)
      .then((route) => {
        if (route && route !== currentRoute) {
          hasAutoNavigatedRef.current = true;
          setLocation(route);
        }
      })
      .catch((error) => {
        console.error('Failed to compute resume route:', error);
      });
  }, [journeyState, projectId, location, currentSearch, setLocation]);

  useEffect(() => {
    const params = new URLSearchParams(currentSearch);
    const tabParam = params.get('tab');
    const allowedTabs = new Set([
      'overview',
      'agents',
      'datasets',
      'timeline',
      'schema',
      'transform',
      'analysis',
      'insights'
    ]);

    if (tabParam && allowedTabs.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [currentSearch, activeTab]);

  const handleTabChange = useCallback((nextTab: string) => {
    setActiveTab(nextTab);

    const [path, existingQuery = ''] = location.split('?');
    const params = new URLSearchParams(existingQuery);
    const previousTab = params.get('tab') ?? 'overview';

    if (previousTab === nextTab) {
      return;
    }

    if (nextTab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }

    const nextSearch = params.toString();
    const nextLocation = nextSearch ? `${path}?${nextSearch}` : path;

    if (nextLocation !== location) {
      setLocation(nextLocation, { replace: true });
    }
  }, [location, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
          <p className="text-gray-600 mb-4">
            The requested project could not be found. This may happen if the server was restarted 
            and your project data was lost from memory.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Please re-upload your data file to continue working with your analysis.
          </p>
          <Button onClick={() => setLocation("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms?: number | null) => {
    if (ms === null || ms === undefined) {
      return '—';
    }
    if (ms >= 1000) {
      const seconds = ms / 1000;
      return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
    }
    return `${ms}ms`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const clientUploadMetrics = uploadMetricsSummary?.services?.client_upload?.operations?.upload_flow_total;
  const serverUploadMetrics = uploadMetricsSummary?.services?.project_upload?.operations?.upload_total;
  const totalClientRuns = clientUploadMetrics?.count ?? 0;
  const targetMs = clientUploadMetrics?.slaTargetMs ?? 60000;
  const isSlaMet = clientUploadMetrics?.p95Duration != null
    ? clientUploadMetrics.p95Duration <= targetMs
    : null;
  const complianceText = clientUploadMetrics?.slaCompliance != null
    ? `${clientUploadMetrics.slaCompliance.toFixed(1)}%`
    : '—';
  const serverErrorRate = serverUploadMetrics?.errorRate != null
    ? `${Math.round(serverUploadMetrics.errorRate * 100)}%`
    : '0%';

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-sm text-gray-600">{project.fileName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTabChange('datasets')}
              >
                <Upload className="w-4 h-4 mr-2" />
                Re-upload Data
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLocation(`/stats/${projectId}`)}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Statistics
              </Button>
              <Badge variant={project.processed ? "default" : "secondary"}>
                {project.processed ? "Processed" : "Processing"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-4 max-w-6xl flex-1 overflow-auto">
        {/* Only show journey selection options if no active journey */}
        {!journeyState && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Choose Your Data Journey</CardTitle>
              <CardDescription className="text-sm">
                Select what you'd like to do with your data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <Button
                  variant="outline"
                  className="h-20 flex-col space-y-1 border-blue-200 hover:bg-blue-50 text-sm"
                  onClick={() => setLocation('/')}
                  data-testid="button-choose-journey-project"
                >
                  <Route className="w-6 h-6 text-blue-600" />
                  <div className="text-center">
                    <div className="font-medium">Choose Journey</div>
                    <div className="text-xs text-gray-500">Select your analytics path</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="h-24 flex-col space-y-2"
                  onClick={() => setShowGuidedAnalysis(true)}
                >
                  <Target className="w-8 h-8" />
                  <div className="text-center">
                    <div className="font-medium">Guided Analysis</div>
                    <div className="text-xs text-gray-500">Step-by-step business insights</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="h-24 flex-col space-y-2"
                  onClick={() => setActiveTab("transform")}
                >
                  <Wrench className="w-8 h-8" />
                  <div className="text-center">
                    <div className="font-medium">Data Transformation</div>
                    <div className="text-xs text-gray-500">Clean, filter, and reshape your data</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="h-24 flex-col space-y-2"
                  onClick={() => setActiveTab("analysis")}
                >
                  <BarChart3 className="w-8 h-8" />
                  <div className="text-center">
                    <div className="font-medium">Visualizations</div>
                    <div className="text-xs text-gray-500">Build charts and explore your data</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="h-24 flex-col space-y-2"
                  onClick={() => setActiveTab("insights")}
                >
                  <Brain className="w-8 h-8" />
                  <div className="text-center">
                    <div className="font-medium">AI Insights</div>
                    <div className="text-xs text-gray-500">Intelligent data interpretation</div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

  <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
          {/* Show journey-relevant tabs only - hide old navigation when journey is active */}
    <TabsList className={`grid w-full mb-3 ${journeyState ? 'grid-cols-7' : 'grid-cols-8'}`}>
            <TabsTrigger value="overview" className="flex items-center gap-1 text-xs" data-testid="workflow-tab">
              <Database className="w-3 h-3" />
              Overview
            </TabsTrigger>
            {journeyState ? (
              // Journey-specific navigation - show only relevant tabs
              <>
                <TabsTrigger value="agents" className="flex items-center gap-1 text-xs" data-testid="agents-tab">
                  <Bot className="w-3 h-3" />
                  AI Agents
                </TabsTrigger>
                <TabsTrigger value="datasets" className="flex items-center gap-1 text-xs">
                  <Layers className="w-3 h-3" />
                  Data
                </TabsTrigger>
                <TabsTrigger value="timeline" className="flex items-center gap-1 text-xs" data-testid="decisions-tab">
                  <FileText className="w-3 h-3" />
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="analysis" className="flex items-center gap-1 text-xs">
                  <BarChart3 className="w-3 h-3" />
                  Visualizations
                </TabsTrigger>
                <TabsTrigger value="insights" className="flex items-center gap-1 text-xs">
                  <Brain className="w-3 h-3" />
                  Insights
                </TabsTrigger>
                <TabsTrigger value="schema" className="flex items-center gap-1 text-xs">
                  <Settings className="w-3 h-3" />
                  Schema
                </TabsTrigger>
              </>
            ) : (
              // Legacy navigation - show all tabs when no journey state
              <>
                <TabsTrigger value="agents" className="flex items-center gap-1 text-xs" data-testid="agents-tab">
                  <Bot className="w-3 h-3" />
                  AI Agents
                </TabsTrigger>
                <TabsTrigger value="datasets" className="flex items-center gap-1 text-xs">
                  <Layers className="w-3 h-3" />
                  Datasets
                </TabsTrigger>
                <TabsTrigger value="timeline" className="flex items-center gap-1 text-xs" data-testid="decisions-tab">
                  <FileText className="w-3 h-3" />
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="schema" className="flex items-center gap-1 text-xs" data-testid="artifacts-tab">
                  <Settings className="w-3 h-3" />
                  Schema
                </TabsTrigger>
                <TabsTrigger value="transform" className="flex items-center gap-1 text-xs">
                  <Wrench className="w-3 h-3" />
                  Transform
                </TabsTrigger>
                <TabsTrigger value="analysis" className="flex items-center gap-1 text-xs">
                  <BarChart3 className="w-3 h-3" />
                  Visualizations
                </TabsTrigger>
                <TabsTrigger value="insights" className="flex items-center gap-1 text-xs">
                  <Brain className="w-3 h-3" />
                  Insights
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="mb-6 space-y-6">
              <JourneyLifecycleIndicator projectId={projectId} />
              <WorkflowTransparencyDashboard projectId={projectId} />
            </div>
            {enableSlaMetrics && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="w-5 h-5" />
                    Upload SLA (preview)
                  </CardTitle>
                  <CardDescription>
                    Tracking the last 60 minutes of your upload activity.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isUploadMetricsLoading ? (
                    <p className="text-gray-500">Loading upload metrics...</p>
                  ) : !clientUploadMetrics && !serverUploadMetrics ? (
                    <p className="text-gray-500">No recent uploads recorded yet.</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                          <Activity className="w-4 h-4" />
                          Uploads (60m)
                        </p>
                        <p className="text-2xl font-semibold">{totalClientRuns}</p>
                        <p className="text-xs text-gray-500">Compliance {complianceText}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                          Client p95
                          {isSlaMet !== null && (
                            <Badge variant={isSlaMet ? 'secondary' : 'destructive'}>
                              {isSlaMet ? 'On target' : 'Over target'}
                            </Badge>
                          )}
                        </p>
                        <p className="text-2xl font-semibold">{formatDuration(clientUploadMetrics?.p95Duration)}</p>
                        <p className="text-xs text-gray-500">Goal ≤ {formatDuration(targetMs)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Server avg duration</p>
                        <p className="text-2xl font-semibold">{formatDuration(serverUploadMetrics?.avgDuration)}</p>
                        <p className="text-xs text-gray-500">Error rate {serverErrorRate}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Project Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Project Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Project Name:</span>
                    <span className="font-medium">{project.name}</span>
                  </div>
                  {project.fileName && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">File Name:</span>
                        <span className="font-medium">{project.fileName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">File Size:</span>
                        <span className="font-medium">{formatFileSize(project.fileSize)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">File Type:</span>
                        <span className="font-medium">{project.fileType}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Records:</span>
                    <span className="font-medium">
                      {project.recordCount !== null && project.recordCount !== undefined
                        ? project.recordCount.toLocaleString()
                        : 'Not available'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created:</span>
                    <span className="font-medium">
                      {project.createdAt || project.uploadedAt
                        ? formatDate(project.createdAt || project.uploadedAt)
                        : 'Not available'}
                    </span>
                  </div>
                  {project.journeyType && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Journey Type:</span>
                      <span className="font-medium capitalize">{project.journeyType.replace('_', ' ')}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Schema Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Data Schema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {project.schema && Object.keys(project.schema).length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-gray-600 mb-3">
                        {Object.keys(project.schema).length} columns detected
                      </p>
                      {Object.entries(project.schema).slice(0, 5).map(([name, info]: [string, any]) => (
                        <div key={name} className="flex justify-between items-center py-1">
                          <span className="font-medium truncate mr-2">{name}</span>
                          <Badge variant="outline">{info.type}</Badge>
                        </div>
                      ))}
                      {Object.keys(project.schema).length > 5 && (
                        <p className="text-sm text-gray-500 mt-2">
                          ...and {Object.keys(project.schema).length - 5} more columns
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500">No schema information available</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="agents" className="mt-6 space-y-6">
            <AgentActivityOverview
              project={project}
              journeyState={journeyState}
              onNavigateToInsights={() => handleTabChange('insights')}
            />
            <AgentCheckpoints projectId={projectId} />
          </TabsContent>

          <TabsContent value="datasets" className="mt-6">
            <EnhancedDataWorkflow
              onComplete={(result) => {
                if (result.success) {
                  toast({
                    title: "Datasets Updated",
                    description: `Successfully ${result.workflowType === 'upload' ? 'uploaded' : 'added'} ${result.datasets?.length || 1} dataset${result.datasets?.length !== 1 ? 's' : ''} to project.`
                  });
                  // Refresh project data
                  window.location.reload();
                } else if (result.error) {
                  toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                  });
                }
              }}
              projectId={projectId}
              allowMultipleDatasets={true}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <ProjectArtifactTimeline
              projectId={projectId}
              onViewArtifact={handleArtifactPreview}
              onExportArtifact={handleArtifactDownload}
            />
          </TabsContent>

          <TabsContent value="schema" className="mt-6">
            <SchemaEditor project={project} />
          </TabsContent>

          <TabsContent value="transform" className="mt-6">
            <DataTransformationLazy project={project} />
          </TabsContent>

          <TabsContent value="analysis" className="mt-6">
            <AdvancedVisualizationWorkshop 
              project={project} 
              onSave={() => {
                toast({
                  title: "Visualization saved",
                  description: "Your chart has been saved to the project",
                });
              }}
            />
          </TabsContent>

          <TabsContent value="insights" className="mt-6">
            <AIInsights project={project} />
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Guided Analysis Modal */}
      {showGuidedAnalysis && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <GuidedAnalysisWizard
              projectId={projectId}
              schema={project.schema}
              onComplete={(analysisConfig) => {
                console.log('Analysis completed:', analysisConfig);
                setShowGuidedAnalysis(false);
              }}
              onClose={() => setShowGuidedAnalysis(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}