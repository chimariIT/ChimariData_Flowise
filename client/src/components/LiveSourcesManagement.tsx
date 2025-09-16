import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  useAllLiveSources,
  useStartStreamingSource,
  useStopStreamingSource,
  useDeleteStreamingSource,
  useStartScrapingJob,
  useStopScrapingJob,
  useRunScrapingJobOnce,
  useDeleteScrapingJob,
  useLiveSourcesOverview
} from "@/hooks/useLiveDataSources";
import {
  useRealtimeConnectionState,
  useRealtimeMultiSourceStatus,
  useRealtimeLiveSourcesOverview,
  useRealtimeStreamingStatus,
  useRealtimeScrapingProgress
} from "@/hooks/useRealtimeUpdates";
import { 
  Radio, 
  Globe, 
  Play, 
  Square, 
  Trash2, 
  Edit, 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Database,
  Settings,
  RefreshCw,
  TrendingUp,
  Zap,
  AlertTriangle,
  Eye,
  Calendar,
  Timer,
  Wifi,
  WifiOff
} from "lucide-react";

interface LiveSourcesManagementProps {
  projectId?: string;
  sources?: any[];
  onRefresh?: () => void;
}

export function LiveSourcesManagement({ projectId, sources = [], onRefresh }: LiveSourcesManagementProps) {
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();
  
  // Hooks for API operations
  const { streamingSources, scrapingJobs, isLoading, refetch } = useAllLiveSources(projectId);
  const { data: overview, isLoading: overviewLoading } = useLiveSourcesOverview(projectId);
  
  const startStreamingSource = useStartStreamingSource();
  const stopStreamingSource = useStopStreamingSource();
  const deleteStreamingSource = useDeleteStreamingSource();
  
  const startScrapingJob = useStartScrapingJob();
  const stopScrapingJob = useStopScrapingJob();
  const runScrapingJobOnce = useRunScrapingJobOnce();
  const deleteScrapingJob = useDeleteScrapingJob();

  // Real-time hooks for live updates
  const { connectionState, isConnected } = useRealtimeConnectionState();
  const realtimeOverview = useRealtimeLiveSourcesOverview();
  
  // Combine sources from props and API
  const allStreamingSources = sources?.filter(s => s.type === 'streaming') || streamingSources;
  const allScrapingJobs = sources?.filter(s => s.type === 'scraping') || scrapingJobs;
  
  // Get source IDs for real-time status monitoring
  const sourceIds = [...allStreamingSources.map(s => s.id), ...allScrapingJobs.map(j => j.id)];
  const { statuses: realtimeStatuses } = useRealtimeMultiSourceStatus(sourceIds);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      onRefresh?.();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch, onRefresh]);

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
    toast({
      title: "Refreshed",
      description: "Live sources data has been updated"
    });
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'running':
        return 'text-green-600 bg-green-100';
      case 'inactive':
      case 'stopped':
        return 'text-gray-600 bg-gray-100';
      case 'error':
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'starting':
      case 'stopping':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'running':
        return <CheckCircle className="w-4 h-4" />;
      case 'inactive':
      case 'stopped':
        return <Square className="w-4 h-4" />;
      case 'error':
      case 'failed':
        return <AlertTriangle className="w-4 h-4" />;
      case 'starting':
      case 'stopping':
        return <Clock className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const handleStartSource = async (source: any) => {
    try {
      if (source.type === 'streaming' || source.protocol) {
        await startStreamingSource.mutateAsync(source.id);
      } else {
        await startScrapingJob.mutateAsync(source.id);
      }
    } catch (error: any) {
      toast({
        title: "Failed to Start Source",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleStopSource = async (source: any) => {
    try {
      if (source.type === 'streaming' || source.protocol) {
        await stopStreamingSource.mutateAsync(source.id);
      } else {
        await stopScrapingJob.mutateAsync(source.id);
      }
    } catch (error: any) {
      toast({
        title: "Failed to Stop Source",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleRunOnce = async (source: any) => {
    try {
      await runScrapingJobOnce.mutateAsync(source.id);
    } catch (error: any) {
      toast({
        title: "Failed to Run Job",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDeleteSource = async () => {
    if (!selectedSource) return;
    
    try {
      if (selectedSource.type === 'streaming' || selectedSource.protocol) {
        await deleteStreamingSource.mutateAsync(selectedSource.id);
      } else {
        await deleteScrapingJob.mutateAsync(selectedSource.id);
      }
      setShowDeleteDialog(false);
      setSelectedSource(null);
    } catch (error: any) {
      toast({
        title: "Failed to Delete Source",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const renderSourceCard = (source: any) => {
    const isStreaming = source.type === 'streaming' || source.protocol;
    const icon = isStreaming ? Radio : Globe;
    const IconComponent = icon;
    
    // Get real-time status if available, fallback to static status
    const realtimeStatus = realtimeStatuses[source.id];
    const status = realtimeStatus?.status || source.status || 'unknown';
    const isActive = ['active', 'running', 'connected'].includes(status.toLowerCase());
    const lastUpdate = realtimeStatus?.lastUpdate;
    
    const isProcessing = startStreamingSource.isPending || stopStreamingSource.isPending || 
                        startScrapingJob.isPending || stopScrapingJob.isPending || 
                        runScrapingJobOnce.isPending;

    return (
      <Card key={source.id} className="hover:shadow-md transition-all">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${isStreaming ? 'bg-purple-100' : 'bg-orange-100'}`}>
                <IconComponent className={`w-5 h-5 ${isStreaming ? 'text-purple-600' : 'text-orange-600'}`} />
              </div>
              <div>
                <CardTitle className="text-lg">{source.name || `${isStreaming ? 'Stream' : 'Scraper'} ${source.id}`}</CardTitle>
                <CardDescription>
                  {isStreaming ? `${source.protocol?.toUpperCase()} • ${source.endpoint}` : `${source.strategy?.toUpperCase()} • ${source.targetUrl}`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className={getStatusColor(status)} data-testid={`badge-status-${source.id}`}>
                {getStatusIcon(status)}
                <span className="ml-1">{status}</span>
              </Badge>
              {realtimeStatus?.isActive && (
                <div className="flex items-center text-green-600">
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse mr-1"></div>
                  <span className="text-xs">Live</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4">
            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Records</div>
                <div className="font-medium">{source.recordsProcessed?.toLocaleString() || '0'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Success Rate</div>
                <div className="font-medium">{source.successRate ? `${source.successRate}%` : 'N/A'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Last Activity</div>
                <div className="font-medium">
                  {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 
                   source.lastRunAt ? new Date(source.lastRunAt).toLocaleTimeString() : 'Never'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Next Run</div>
                <div className="font-medium">
                  {source.nextRunAt ? new Date(source.nextRunAt).toLocaleTimeString() : 
                   source.schedule ? 'Scheduled' : 'Manual'}
                </div>
              </div>
            </div>

            {/* Progress Bar for Active Sources */}
            {source.progress && (
              <div>
                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                  <span>Progress</span>
                  <span>{source.progress}%</span>
                </div>
                <Progress value={source.progress} className="h-2" />
              </div>
            )}

            {/* Error Display - Real-time or Static */}
            {(realtimeStatus?.errorCount > 0 || source.lastError) && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {source.lastError || 'Connection errors detected'}
                  {realtimeStatus?.errorCount > 0 && ` (${realtimeStatus.errorCount} recent errors)`}
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-2">
              {!isActive ? (
                <Button 
                  size="sm" 
                  onClick={() => handleStartSource(source)}
                  disabled={isProcessing}
                  data-testid={`button-start-${source.id}`}
                >
                  <Play className="w-4 h-4 mr-1" />
                  Start
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleStopSource(source)}
                  disabled={isProcessing}
                  data-testid={`button-stop-${source.id}`}
                >
                  <Square className="w-4 h-4 mr-1" />
                  Stop
                </Button>
              )}

              {!isStreaming && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleRunOnce(source)}
                  disabled={isProcessing || isActive}
                  data-testid={`button-run-once-${source.id}`}
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Run Once
                </Button>
              )}

              <Button size="sm" variant="outline" disabled>
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>

              <Button 
                size="sm" 
                variant="destructive" 
                onClick={() => {
                  setSelectedSource(source);
                  setShowDeleteDialog(true);
                }}
                data-testid={`button-delete-${source.id}`}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">Loading live sources...</p>
      </div>
    );
  }

  const totalSources = allStreamingSources.length + allScrapingJobs.length;

  return (
    <div className="space-y-6">
      {/* Real-time Connection Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
            isConnected 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4" />
                <span>Real-time Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                <span>Real-time {connectionState === 'reconnecting' ? 'Reconnecting' : 'Disconnected'}</span>
              </>
            )}
          </div>
          {realtimeOverview.recentActivity.length > 0 && (
            <Badge variant="secondary">
              {realtimeOverview.recentActivity.length} recent events
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-600" />
            Live Sources Management
          </h2>
          <p className="text-muted-foreground mt-2">
            Monitor and control your streaming sources and scraping jobs
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overview Metrics */}
      {overview && !overviewLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Radio className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Streaming</div>
                  <div className="text-2xl font-bold">{overview.data?.streaming?.total || 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {overview.data?.streaming?.active || 0} active
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-orange-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Scraping</div>
                  <div className="text-2xl font-bold">{overview.data?.scraping?.total || 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {overview.data?.scraping?.active || 0} active
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Total Data</div>
                  <div className="text-2xl font-bold">
                    {(overview.data?.metrics?.totalDataReceived || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">records</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                  <div className="text-2xl font-bold">
                    {overview.data?.metrics?.errorRate 
                      ? `${(100 - overview.data.metrics.errorRate).toFixed(1)}%`
                      : 'N/A'
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">average</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {totalSources === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Live Sources Configured</h3>
            <p className="text-muted-foreground mb-4">
              Create streaming sources or scraping jobs to monitor and manage them here.
            </p>
            <div className="flex justify-center space-x-2">
              <Button variant="outline" size="sm">
                <Radio className="w-4 h-4 mr-2" />
                Add Streaming Source
              </Button>
              <Button variant="outline" size="sm">
                <Globe className="w-4 h-4 mr-2" />
                Add Scraping Job
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">
              All Sources ({totalSources})
            </TabsTrigger>
            <TabsTrigger value="streaming" data-testid="tab-streaming">
              Streaming ({allStreamingSources.length})
            </TabsTrigger>
            <TabsTrigger value="scraping" data-testid="tab-scraping">
              Scraping ({allScrapingJobs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {[...allStreamingSources, ...allScrapingJobs].map(renderSourceCard)}
          </TabsContent>

          <TabsContent value="streaming" className="space-y-4">
            {allStreamingSources.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No Streaming Sources</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure streaming sources to see them here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              allStreamingSources.map(renderSourceCard)
            )}
          </TabsContent>

          <TabsContent value="scraping" className="space-y-4">
            {allScrapingJobs.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No Scraping Jobs</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure scraping jobs to see them here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              allScrapingJobs.map(renderSourceCard)
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Live Source</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedSource?.name || 'this source'}"? 
              This action cannot be undone and will stop all associated data collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSource}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}