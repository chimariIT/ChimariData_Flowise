import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload, 
  Database, 
  FileText, 
  Plus, 
  ArrowRight,
  CheckCircle,
  Layers,
  Radio,
  Globe
} from "lucide-react";
import { DatasetSelector } from "./DatasetSelector";
import { MultiSourceUpload } from "./MultiSourceUpload";
import { StreamingDataTab } from "./StreamingDataTab";
import { WebScrapingTab } from "./WebScrapingTab";
import { LiveSourcesManagement } from "./LiveSourcesManagement";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useAllLiveSources } from "@/hooks/useLiveDataSources";

interface EnhancedDataWorkflowProps {
  onComplete: (result: any) => void;
  serviceType?: 'pay_per_analysis' | 'expert_consulting' | 'automated_analysis' | 'enterprise' | 'free_trial' | 'default';
  questions?: string[];
  projectId?: string;
  allowMultipleDatasets?: boolean;
}

type WorkflowStep = 'select_option' | 'upload_new' | 'select_existing' | 'streaming_config' | 'scraping_config' | 'manage_sources' | 'configure_project' | 'complete';

export function EnhancedDataWorkflow({ 
  onComplete, 
  serviceType = 'default',
  questions = [],
  projectId,
  allowMultipleDatasets = true
}: EnhancedDataWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('select_option');
  const [selectedDatasets, setSelectedDatasets] = useState<any[]>([]);
  const [createdDatasets, setCreatedDatasets] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workflowOption, setWorkflowOption] = useState<'upload' | 'select' | 'streaming' | 'scraping' | 'manage' | null>(null);
  const { toast } = useToast();
  const { streamingSources, scrapingJobs, refetch: refetchLiveSources } = useAllLiveSources(projectId);

  const workflowOptions = [
    {
      id: 'upload',
      title: 'Upload New Data',
      description: 'Upload files from your computer, API, or cloud sources',
      icon: Upload,
      color: 'bg-blue-100 text-blue-800',
      recommended: !projectId && serviceType === 'default'
    },
    {
      id: 'select',
      title: 'Use Existing Datasets',
      description: 'Select from your previously uploaded datasets',
      icon: Database,
      color: 'bg-green-100 text-green-800',
      recommended: !!projectId
    },
    {
      id: 'streaming',
      title: 'Streaming Data',
      description: 'Connect to live data streams (WebSocket, SSE, API polling)',
      icon: Radio,
      color: 'bg-purple-100 text-purple-800',
      recommended: serviceType === 'enterprise'
    },
    {
      id: 'scraping',
      title: 'Web Scraping',
      description: 'Extract data from websites with scheduled scraping jobs',
      icon: Globe,
      color: 'bg-orange-100 text-orange-800',
      recommended: false
    },
    {
      id: 'manage',
      title: 'Manage Live Sources',
      description: `Monitor ${streamingSources.length + scrapingJobs.length} active live sources`,
      icon: Layers,
      color: 'bg-slate-100 text-slate-800',
      recommended: false,
      disabled: streamingSources.length + scrapingJobs.length === 0
    }
  ];

  const handleOptionSelect = (option: 'upload' | 'select' | 'streaming' | 'scraping' | 'manage') => {
    setWorkflowOption(option);
    switch (option) {
      case 'upload':
        setCurrentStep('upload_new');
        break;
      case 'select':
        setCurrentStep('select_existing');
        break;
      case 'streaming':
        setCurrentStep('streaming_config');
        break;
      case 'scraping':
        setCurrentStep('scraping_config');
        break;
      case 'manage':
        setCurrentStep('manage_sources');
        break;
      default:
        setCurrentStep('select_option');
    }
  };

  const handleUploadComplete = useCallback(async (uploadResult: any) => {
    if (uploadResult.error) {
      onComplete(uploadResult);
      return;
    }

    try {
      setIsProcessing(true);

      // If we have a project ID, upload creates a dataset and associates it with the project
      if (projectId && uploadResult.success) {
        // Create dataset from upload result
        const datasetData = {
          name: uploadResult.name || 'Uploaded Dataset',
          description: uploadResult.description || `Dataset created from ${uploadResult.filename}`,
          sourceType: uploadResult.sourceType || 'upload',
          schema: uploadResult.schema,
          content: uploadResult.data,
          ingestionMetadata: {
            recordCount: uploadResult.recordCount,
            fileSize: uploadResult.size,
            fileType: uploadResult.mimeType,
            piiHandled: uploadResult.piiHandled,
            anonymizationApplied: uploadResult.anonymizationApplied
          }
        };

        const dataset = await apiClient.createDataset(datasetData);
        
        // Associate dataset with project
        await apiClient.addDatasetToProject(projectId, dataset.id, 'primary');
        
        // Invalidate related caches to ensure real-time updates
        await queryClient.invalidateQueries({ queryKey: ['/api/datasets'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'datasets'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'artifacts'] });
        
        setCreatedDatasets([dataset]);
        setCurrentStep('complete');
        
        toast({
          title: "Dataset Created",
          description: `Successfully created and added dataset to project.`
        });

        onComplete({
          success: true,
          datasets: [dataset],
          projectId,
          workflowType: 'upload'
        });
      } else {
        // No project ID - continue with legacy flow for project creation
        onComplete(uploadResult);
      }
    } catch (error: any) {
      console.error('Error processing upload:', error);
      toast({
        title: "Upload Error",
        description: error.message || "Failed to process upload",
        variant: "destructive"
      });
      
      onComplete({
        error: error.message || "Failed to process upload",
        errorType: 'PROCESSING_ERROR'
      });
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, onComplete, toast]);

  const handleDatasetSelection = useCallback(async (datasets: any[]) => {
    try {
      setIsProcessing(true);
      setSelectedDatasets(datasets);

      if (projectId) {
        // Associate selected datasets with the project
        for (const dataset of datasets) {
          await apiClient.addDatasetToProject(projectId, dataset.id);
        }
        
        // Invalidate related caches to ensure real-time updates
        await queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'datasets'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'artifacts'] });
        
        toast({
          title: "Datasets Added",
          description: `Successfully added ${datasets.length} dataset${datasets.length !== 1 ? 's' : ''} to project.`
        });

        setCurrentStep('complete');
        onComplete({
          success: true,
          datasets,
          projectId,
          workflowType: 'select'
        });
      } else {
        // No project ID - need to create project or continue workflow
        setCurrentStep('configure_project');
      }
    } catch (error: any) {
      console.error('Error selecting datasets:', error);
      toast({
        title: "Selection Error",
        description: error.message || "Failed to add datasets to project",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, onComplete, toast]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 'select_option':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold mb-2">Choose Your Data Source</h3>
              <p className="text-sm text-muted-foreground">
                Start by uploading new data or selecting from your existing datasets
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workflowOptions.map((option) => {
                const IconComponent = option.icon;
                return (
                  <Card
                    key={option.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      option.recommended ? 'ring-2 ring-primary ring-opacity-50' : ''
                    } ${
                      (option as any).disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    onClick={() => {
                      if (!(option as any).disabled) {
                        handleOptionSelect(option.id as 'upload' | 'select' | 'streaming' | 'scraping' | 'manage');
                      }
                    }}
                    data-testid={`card-option-${option.id}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className={`p-3 rounded-lg ${option.color}`}>
                          <IconComponent className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium">{option.title}</h4>
                            {option.recommended && (
                              <Badge variant="secondary" className="text-xs">
                                Recommended
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );

      case 'upload_new':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('select_option')}
                data-testid="button-back-to-options"
              >
                ← Back to Options
              </Button>
            </div>
            <MultiSourceUpload
              onComplete={handleUploadComplete}
              serviceType={serviceType}
              questions={questions}
              isLoading={isProcessing}
            />
          </div>
        );

      case 'select_existing':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('select_option')}
                data-testid="button-back-to-datasets"
              >
                ← Back to Options
              </Button>
            </div>
            <DatasetSelector
              onSelect={handleDatasetSelection}
              onUploadNew={() => setCurrentStep('upload_new')}
              allowMultiple={allowMultipleDatasets}
              projectId={projectId}
            />
          </div>
        );

      case 'complete':
        const totalDatasets = selectedDatasets.length + createdDatasets.length;
        return (
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold mb-2">Workflow Complete!</h3>
              <p className="text-muted-foreground">
                Successfully processed {totalDatasets} dataset{totalDatasets !== 1 ? 's' : ''}
                {projectId ? ' and added to your project' : ''}
              </p>
            </div>
            
            {/* Summary */}
            <div className="bg-muted rounded-lg p-4 text-left">
              <h4 className="font-medium mb-2 flex items-center">
                <Layers className="w-4 h-4 mr-2" />
                Summary
              </h4>
              <div className="space-y-2 text-sm">
                {createdDatasets.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <Plus className="w-3 h-3 text-green-500" />
                    <span>{createdDatasets.length} new dataset{createdDatasets.length !== 1 ? 's' : ''} created</span>
                  </div>
                )}
                {selectedDatasets.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <Database className="w-3 h-3 text-blue-500" />
                    <span>{selectedDatasets.length} existing dataset{selectedDatasets.length !== 1 ? 's' : ''} selected</span>
                  </div>
                )}
                {projectId && (
                  <div className="flex items-center space-x-2">
                    <FileText className="w-3 h-3 text-purple-500" />
                    <span>Added to project workflow</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'streaming_config':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('select_option')}
                data-testid="button-back-to-options"
              >
                ← Back to Options
              </Button>
            </div>
            <StreamingDataTab
              projectId={projectId}
              onComplete={(result) => {
                if (result.success) {
                  setCurrentStep('complete');
                  toast({
                    title: "Streaming Source Created",
                    description: "Successfully configured streaming data source"
                  });
                  // Refresh live sources data
                  refetchLiveSources();
                }
                onComplete(result);
              }}
            />
          </div>
        );

      case 'scraping_config':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('select_option')}
                data-testid="button-back-to-options"
              >
                ← Back to Options
              </Button>
            </div>
            <WebScrapingTab
              projectId={projectId}
              onComplete={(result) => {
                if (result.success) {
                  setCurrentStep('complete');
                  toast({
                    title: "Scraping Job Created",
                    description: "Successfully configured web scraping job"
                  });
                  // Refresh live sources data
                  refetchLiveSources();
                }
                onComplete(result);
              }}
            />
          </div>
        );

      case 'manage_sources':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep('select_option')}
                data-testid="button-back-to-options"
              >
                ← Back to Options
              </Button>
            </div>
            <LiveSourcesManagement
              projectId={projectId}
              sources={[...streamingSources, ...scrapingJobs]}
              onRefresh={() => {
                refetchLiveSources();
                toast({
                  title: "Sources Refreshed",
                  description: "Live sources data has been updated"
                });
              }}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <span className={currentStep === 'select_option' ? 'text-primary font-medium' : ''}>
          Choose Source
        </span>
        <ArrowRight className="w-4 h-4" />
        <span className={[
          'upload_new', 'select_existing', 'streaming_config', 'scraping_config', 'manage_sources'
        ].includes(currentStep) ? 'text-primary font-medium' : ''}>
          {workflowOption === 'upload' ? 'Upload Data' : 
           workflowOption === 'select' ? 'Select Datasets' : 
           workflowOption === 'streaming' ? 'Configure Stream' : 
           workflowOption === 'scraping' ? 'Setup Scraping' : 
           workflowOption === 'manage' ? 'Manage Sources' : 'Configure'}
        </span>
        <ArrowRight className="w-4 h-4" />
        <span className={currentStep === 'complete' ? 'text-primary font-medium' : ''}>
          Complete
        </span>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-primary" />
            <span>Data Workflow</span>
          </CardTitle>
          <CardDescription>
            Manage your data sources and analysis workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isProcessing ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">Processing your request...</p>
            </div>
          ) : (
            renderStepContent()
          )}
        </CardContent>
      </Card>
    </div>
  );
}