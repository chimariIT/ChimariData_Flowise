import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Custom hooks for Streaming Sources
export function useStreamingSources(filters?: {
  projectId?: string;
  datasetId?: string;
  status?: string;
  protocol?: string;
}) {
  return useQuery({
    queryKey: ['/api/streaming-sources', filters],
    queryFn: () => apiClient.getStreamingSources(filters),
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useStreamingSource(id: string) {
  return useQuery({
    queryKey: ['/api/streaming-sources', id],
    queryFn: () => apiClient.getStreamingSource(id),
    enabled: !!id,
    staleTime: 10000, // Cache for 10 seconds for real-time data
  });
}

export function useCreateStreamingSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.createStreamingSource,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources'] });
      toast({
        title: "Streaming Source Created",
        description: `Successfully created streaming source: ${data.data?.name || 'Unnamed'}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Streaming Source",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateStreamingSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      apiClient.updateStreamingSource(id, updates),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources', variables.id] });
      toast({
        title: "Streaming Source Updated",
        description: "Configuration updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useStartStreamingSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.startStreamingSource,
    onSuccess: (data, sourceId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources', sourceId] });
      toast({
        title: "Streaming Started",
        description: "Successfully started streaming data source",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Start Streaming",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useStopStreamingSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.stopStreamingSource,
    onSuccess: (data, sourceId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources', sourceId] });
      toast({
        title: "Streaming Stopped",
        description: "Successfully stopped streaming data source",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Stop Streaming",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteStreamingSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.deleteStreamingSource,
    onSuccess: (data, sourceId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/streaming-sources'] });
      queryClient.removeQueries({ queryKey: ['/api/streaming-sources', sourceId] });
      toast({
        title: "Streaming Source Deleted",
        description: "Successfully deleted streaming source",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useTestStreamingConnection() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.testStreamingConnection,
    onSuccess: (data) => {
      toast({
        title: "Connection Test Successful",
        description: data.message || "Connection established successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Custom hooks for Scraping Jobs
export function useScrapingJobs(filters?: {
  projectId?: string;
  datasetId?: string;
  status?: string;
  strategy?: string;
}) {
  return useQuery({
    queryKey: ['/api/scraping-jobs', filters],
    queryFn: () => apiClient.getScrapingJobs(filters),
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useScrapingJob(id: string) {
  return useQuery({
    queryKey: ['/api/scraping-jobs', id],
    queryFn: () => apiClient.getScrapingJob(id),
    enabled: !!id,
    staleTime: 10000, // Cache for 10 seconds for real-time data
  });
}

export function useCreateScrapingJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.createScrapingJob,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs'] });
      toast({
        title: "Scraping Job Created",
        description: `Successfully created scraping job: ${data.data?.name || 'Unnamed'}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Scraping Job",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateScrapingJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      apiClient.updateScrapingJob(id, updates),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs', variables.id] });
      toast({
        title: "Scraping Job Updated",
        description: "Configuration updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useStartScrapingJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.startScrapingJob,
    onSuccess: (data, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs', jobId] });
      toast({
        title: "Scraping Job Started",
        description: "Successfully started scraping job",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Start Scraping Job",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useStopScrapingJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.stopScrapingJob,
    onSuccess: (data, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs', jobId] });
      toast({
        title: "Scraping Job Stopped",
        description: "Successfully stopped scraping job",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Stop Scraping Job",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRunScrapingJobOnce() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.runScrapingJobOnce,
    onSuccess: (data, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs', jobId] });
      toast({
        title: "Scraping Job Started",
        description: "Job is running, check status for progress",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Run Scraping Job",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteScrapingJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.deleteScrapingJob,
    onSuccess: (data, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/scraping-jobs'] });
      queryClient.removeQueries({ queryKey: ['/api/scraping-jobs', jobId] });
      toast({
        title: "Scraping Job Deleted",
        description: "Successfully deleted scraping job",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useScrapingJobRuns(jobId: string) {
  return useQuery({
    queryKey: ['/api/scraping-jobs', jobId, 'runs'],
    queryFn: () => apiClient.getScrapingJobRuns(jobId),
    enabled: !!jobId,
    staleTime: 5000, // Cache for 5 seconds
  });
}

export function useTestScrapingExtraction() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: apiClient.testScrapingExtraction,
    onSuccess: (data) => {
      toast({
        title: "Extraction Test Successful",
        description: `Found ${data.results?.length || 0} items`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Combined hook for live sources overview
export function useLiveSourcesOverview(projectId?: string) {
  return useQuery({
    queryKey: ['/api/live-sources/overview', projectId],
    queryFn: () => apiClient.getLiveSourcesOverview(projectId),
    staleTime: 15000, // Cache for 15 seconds
  });
}

// Real-time polling hooks for status updates
export function useStreamingSourceStatus(id: string, enabled = true) {
  return useQuery({
    queryKey: ['/api/streaming-sources', id, 'status'],
    queryFn: () => apiClient.getStreamingSource(id),
    enabled: enabled && !!id,
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 0, // Always refetch
  });
}

export function useScrapingJobStatus(id: string, enabled = true) {
  return useQuery({
    queryKey: ['/api/scraping-jobs', id, 'status'],
    queryFn: () => apiClient.getScrapingJob(id),
    enabled: enabled && !!id,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 0, // Always refetch
  });
}

// Utility hook for managing multiple sources
export function useAllLiveSources(projectId?: string) {
  const streamingQuery = useStreamingSources({ projectId });
  const scrapingQuery = useScrapingJobs({ projectId });

  return {
    streamingSources: streamingQuery.data?.data || [],
    scrapingJobs: scrapingQuery.data?.data || [],
    isLoading: streamingQuery.isLoading || scrapingQuery.isLoading,
    error: streamingQuery.error || scrapingQuery.error,
    refetch: () => {
      streamingQuery.refetch();
      scrapingQuery.refetch();
    },
  };
}