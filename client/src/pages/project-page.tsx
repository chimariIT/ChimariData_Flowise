import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getResumeRoute } from "@/utils/journey-routing";
import { ArrowLeft, Database, FileText, BarChart3, Brain, Layers, Route, Bot, Upload, Timer, Activity, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
// AIInsights, DashboardBuilder, AudienceTranslatedResults, UserQuestionAnswers, PaymentStatusBanner
// removed — results & payment gating now handled exclusively by dashboard-step.tsx
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

// MEDIUM PRIORITY FIX: Extract tab configuration to reduce duplication
const PROJECT_TABS = [
  { value: 'overview', label: 'Overview', icon: 'Database', testId: 'workflow-tab', requiresJourneyComplete: false },
  { value: 'agents', label: 'AI Agents', icon: 'Bot', testId: 'agents-tab', requiresJourneyComplete: false },
  { value: 'datasets', label: 'Data', icon: 'Layers', testId: null, requiresJourneyComplete: false },
  { value: 'timeline', label: 'Timeline', icon: 'FileText', testId: 'decisions-tab', requiresJourneyComplete: false },
  { value: 'analysis', label: 'Visualizations', icon: 'BarChart3', testId: null, requiresJourneyComplete: true },
  { value: 'insights', label: 'Insights', icon: 'Brain', testId: null, requiresJourneyComplete: true },
] as const;

type TabValue = typeof PROJECT_TABS[number]['value'];

export default function ProjectPage({ projectId }: ProjectPageProps) {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  // showGuidedAnalysis state removed - analysis is now gated through user journey flow
  const hasAutoNavigatedRef = useRef(false);
  const hasProcessedPaymentRef = useRef(false);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      return await apiClient.getProject(projectId);
    },
  });

  // Feature flag defaults to false for safety - only enable when explicitly set
  const enableSlaMetrics = import.meta.env.VITE_FEATURE_SLA_METRICS === 'true';

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
        // MEDIUM PRIORITY FIX: Show user feedback when resume fails
        toast({
          title: "Resume Failed",
          description: "Unable to resume your journey. Please try again or select a step manually.",
          variant: "destructive",
        });
      });
  }, [journeyState, projectId, location, currentSearch, setLocation]);

  // Handle payment success/cancel URL parameters (fallback from Stripe redirect)
  // This catches users who land on project page after payment even though we redirect to pricing step
  useEffect(() => {
    if (hasProcessedPaymentRef.current) return; // Prevent infinite loop

    const params = new URLSearchParams(currentSearch);
    const paymentStatus = params.get('payment');
    const sessionId = params.get('session_id');

    if (!paymentStatus || !projectId) return;

    // Set guard to prevent re-entry while async call is in progress
    hasProcessedPaymentRef.current = true;

    const handlePaymentCallback = async () => {
      if (paymentStatus === 'success' && sessionId) {
        // Verify payment with backend
        try {
          const response = await apiClient.post('/api/payment/verify-session', {
            sessionId,
            projectId
          });

          if (response.success && response.paymentStatus === 'paid') {
            toast({
              title: "Payment Successful!",
              description: "Your payment has been verified. Triggering analysis execution...",
            });

            // Safety net: Trigger analysis execution from project page
            // This handles the case where Stripe redirect didn't land on pricing-step
            try {
              const jp = (project as any)?.journeyProgress || {};
              const analysisPath = jp?.executionConfig?.analysisPath ||
                                   jp?.requirementsDocument?.analysisPath || [];
              const analysisTypes = analysisPath.length > 0
                ? analysisPath.map((a: any) => a.analysisType || a.type || 'statistical_analysis')
                : ['statistical_analysis', 'exploratory_data_analysis'];

              console.log(`📊 [ProjectPage] Triggering post-payment analysis execution (${analysisTypes.length} types)`);

              const analysisData = await apiClient.post('/api/analysis-execution/execute', {
                projectId,
                analysisTypes,
                analysisPath
              });

              if (analysisData.success) {
                console.log('✅ [ProjectPage] Analysis execution completed');
                toast({
                  title: "Analysis Complete",
                  description: "Your analysis results are ready. Redirecting to results...",
                });
              }
            } catch (analysisError: any) {
              console.error('Post-payment analysis execution error:', analysisError);
              toast({
                title: "Analysis Processing",
                description: "Your payment was successful. Analysis results will appear shortly.",
              });
            }

            // Navigate to results page
            const jType = (project as any)?.journeyType
              || (project as any)?.journeyProgress?.journeyType
              || 'non-tech';
            const cleanPath = location.split('?')[0];
            setLocation(cleanPath, { replace: true });
            // Try to navigate to results step
            setTimeout(() => {
              setLocation(`/journeys/${jType}/results?projectId=${projectId}`);
            }, 500);
          } else {
            toast({
              title: "Payment Verification",
              description: response.message || "Your payment is being processed.",
            });
          }
        } catch (error: any) {
          console.error('Payment verification error:', error);
          // Reset guard on failure so user can retry
          hasProcessedPaymentRef.current = false;
          toast({
            title: "Payment Status",
            description: "If you completed payment, your results will be available shortly.",
            variant: "default"
          });
          return; // Don't clear URL params on failure so retry is possible
        }
      } else if (paymentStatus === 'cancelled') {
        toast({
          title: "Payment Cancelled",
          description: "You can resume payment from the pricing step when ready.",
          variant: "default"
        });

        // Clear URL parameters
        const cleanPath = location.split('?')[0];
        setLocation(cleanPath, { replace: true });
      }
    };

    handlePaymentCallback();
  }, [currentSearch, projectId, location, setLocation]);

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

  // Auto-redirect to results page when analysis is complete
  // Users who completed analysis should see dashboard-step.tsx (actual results), not this monitoring page
  const hasRedirectedToResultsRef = useRef(false);
  useEffect(() => {
    if (!project || isLoading || hasRedirectedToResultsRef.current) return;
    const jp = (project as any)?.journeyProgress;
    const hasResults = !!(project as any)?.analysisResults || jp?.executionStatus === 'completed';
    // Only redirect if user didn't explicitly navigate to a specific tab
    const params = new URLSearchParams(currentSearch);
    const hasExplicitTab = params.has('tab');
    const hasPaymentParam = params.has('payment');
    const hasResumeParam = params.has('resume');
    if (hasResults && !hasExplicitTab && !hasPaymentParam && !hasResumeParam) {
      hasRedirectedToResultsRef.current = true;
      setLocation(`/projects/${projectId}/results`);
    }
  }, [project, isLoading, projectId, currentSearch, setLocation]);

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
              {journeyState?.canResume && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={async () => {
                    // FIX: Use async/await and check route validity (consistent with card button)
                    const route = await getResumeRoute(projectId, journeyState);
                    if (route) {
                      setLocation(route);
                    }
                  }}
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Resume Journey
                </Button>
              )}
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
        {/* Journey Start/Resume Card - Guide users through proper journey flow */}
        {!journeyState ? (
          // No journey started - prompt user to start one
          <Card className="mb-4 border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-600" />
                Start Your Data Journey
              </CardTitle>
              <CardDescription className="text-sm">
                To get started with analysis, please select a guided journey that matches your needs.
                Our journeys ensure your data is properly prepared and your analysis goals are captured.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setLocation('/')}
                data-testid="button-choose-journey-project"
              >
                <Route className="w-4 h-4 mr-2" />
                Choose Your Journey
              </Button>
            </CardContent>
          </Card>
        ) : journeyState.percentComplete < 100 ? (
          // Journey in progress - prompt user to resume
          <Card className="mb-4 border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-amber-600" />
                Continue Your Journey
              </CardTitle>
              <CardDescription className="text-sm">
                You have an active journey in progress ({journeyState.percentComplete}% complete).
                Please complete all journey steps to unlock full analysis capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-sm text-gray-600 mb-2">
                  Current step: <span className="font-medium">{journeyState.currentStep?.name}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all"
                    style={{ width: `${journeyState.percentComplete}%` }}
                  />
                </div>
              </div>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                onClick={async () => {
                  const route = await getResumeRoute(projectId, journeyState);
                  if (route) {
                    setLocation(route);
                  }
                }}
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                Resume Journey
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
          {/* Show journey-relevant tabs only - gate analysis tabs when journey incomplete */}
          {/* CRITICAL: Analysis tabs are gated to ensure users complete the journey flow */}
          {/* MEDIUM FIX: Tabs now driven by PROJECT_TABS constant for maintainability */}
          <TabsList className="grid w-full mb-3 grid-cols-6">
            {PROJECT_TABS.map((tab) => {
              const isJourneyIncomplete = !journeyState || journeyState.percentComplete < 100;
              // Unlock tabs if results exist, even if journey is incomplete
              const hasResults = !!project?.analysisResults;
              const isDisabled = tab.requiresJourneyComplete && isJourneyIncomplete && !hasResults;
              const IconComponent = { Database, Bot, Layers, FileText, BarChart3, Brain }[tab.icon];

              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`flex items-center gap-1 text-xs ${isDisabled ? 'opacity-50' : ''}`}
                  disabled={isDisabled}
                  data-testid={tab.testId || undefined}
                >
                  {IconComponent && <IconComponent className="w-3 h-3" />}
                  {tab.label}
                  {isDisabled && <span className="ml-1 text-[10px]">🔒</span>}
                </TabsTrigger>
              );
            })}
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

          {/* Visualizations tab — redirects to results page (no duplicate payment gate) */}
          <TabsContent value="analysis" className="mt-6">
            {(project as any)?.analysisResults ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-blue-500 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Analysis Results Available</h3>
                  <p className="text-gray-600 mb-4">
                    Your analysis has completed. View your full results including visualizations,
                    Q&A answers, and business insights.
                  </p>
                  <Button onClick={() => setLocation(`/projects/${projectId}/results`)}>
                    View Results
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-amber-600" />
                    Complete Your Journey to Access Visualizations
                  </CardTitle>
                  <CardDescription>
                    Visualizations are available after completing the guided user journey.
                    This ensures your data is properly prepared and validated for accurate analysis.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={async () => {
                      if (journeyState) {
                        const route = await getResumeRoute(projectId, journeyState);
                        if (route) setLocation(route);
                      } else {
                        setLocation('/');
                      }
                    }}
                  >
                    {journeyState ? 'Resume Journey' : 'Start Journey'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Insights tab — redirects to results page (no duplicate payment gate) */}
          <TabsContent value="insights" className="mt-6 space-y-6">
            {(project as any)?.analysisResults ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Brain className="w-12 h-12 mx-auto text-blue-500 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Insights Ready</h3>
                  <p className="text-gray-600 mb-4">
                    Your AI-powered insights, translated results, Q&A answers, and evidence chains
                    are available on the results page.
                  </p>
                  <Button onClick={() => setLocation(`/projects/${projectId}/results`)}>
                    View Results & Insights
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-amber-600" />
                    Complete Your Journey to Access Insights
                  </CardTitle>
                  <CardDescription>
                    AI-powered insights are available after completing the guided user journey.
                    This ensures your analysis questions are captured and your data is properly analyzed.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={async () => {
                      if (journeyState) {
                        const route = await getResumeRoute(projectId, journeyState);
                        if (route) setLocation(route);
                      } else {
                        setLocation('/');
                      }
                    }}
                  >
                    {journeyState ? 'Resume Journey' : 'Start Journey'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Guided Analysis Modal removed - analysis is now gated through user journey flow */}
    </div>
  );
}