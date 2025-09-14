import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Upload, 
  Database, 
  FileText, 
  Settings, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight,
  AlertTriangle,
  Eye,
  Merge,
  BarChart3,
  Shield,
  Loader2
} from "lucide-react";
import { MultiSourceUpload } from "@/components/MultiSourceUpload";
import SchemaEditor from "@/components/schema-editor";
import DataTransformation from "@/components/data-transformation";
import MultiFileJoiner from "@/components/multi-file-joiner";
import { PricingBanner } from "@/components/PricingBanner";
import { CostChip } from "@/components/CostChip";
import { useProjectContext } from "@/hooks/useProjectContext";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface DataStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean; // Whether to render as content component vs full page
}

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  completed: boolean;
  active: boolean;
}

export default function DataStep({ journeyType, onNext, onPrevious, renderAsContent = true }: DataStepProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject, setCurrentProject, refreshProject } = useProjectContext();
  
  // Workflow state
  const [currentWorkflowStep, setCurrentWorkflowStep] = useState<string>('upload');
  const [workflowData, setWorkflowData] = useState<any>({
    uploadedFiles: [],
    schemaValidated: false,
    piiHandled: false,
    transformationsApplied: false,
    joinedFiles: []
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);

  // Data step workflow
  const workflowSteps: WorkflowStep[] = [
    {
      id: 'upload',
      title: 'Data Upload',
      description: 'Upload files from multiple sources',
      icon: Upload,
      completed: workflowData.uploadedFiles.length > 0,
      active: currentWorkflowStep === 'upload'
    },
    {
      id: 'schema',
      title: 'Schema Review',
      description: 'Validate and define data structure',
      icon: Database,
      completed: workflowData.schemaValidated,
      active: currentWorkflowStep === 'schema'
    },
    {
      id: 'privacy',
      title: 'Privacy Check',
      description: 'Handle PII and sensitive data',
      icon: Shield,
      completed: workflowData.piiHandled,
      active: currentWorkflowStep === 'privacy'
    },
    {
      id: 'transform',
      title: 'Data Preparation',
      description: 'Clean and transform your data',
      icon: Settings,
      completed: workflowData.transformationsApplied,
      active: currentWorkflowStep === 'transform'
    },
    {
      id: 'review',
      title: 'Final Review',
      description: 'Preview and confirm data',
      icon: Eye,
      completed: false,
      active: currentWorkflowStep === 'review'
    }
  ];

  // Fetch user projects for joining
  const { data: projectsData } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
  });

  // Upload completion handler
  const handleUploadComplete = async (uploadInfo: any) => {
    try {
      setIsProcessing(true);
      
      // Update workflow data
      setWorkflowData((prev: any) => ({
        ...prev,
        uploadedFiles: [...prev.uploadedFiles, uploadInfo],
        project: uploadInfo.project
      }));

      // Set as current project
      if (uploadInfo.project) {
        setCurrentProject(uploadInfo.project);
      }

      // Move to schema step
      setCurrentWorkflowStep('schema');
      
      toast({
        title: "Upload Complete",
        description: "Your data has been uploaded successfully. Please review the schema.",
      });

    } catch (error) {
      console.error('Upload completion error:', error);
      toast({
        title: "Upload Error",
        description: "There was an issue processing your upload. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Schema validation handler
  const handleSchemaValidated = () => {
    setWorkflowData((prev: any) => ({ ...prev, schemaValidated: true }));
    
    // Check if PII handling is needed
    if (currentProject?.piiAnalysis?.detectedPII?.length > 0) {
      setCurrentWorkflowStep('privacy');
    } else {
      setWorkflowData((prev: any) => ({ ...prev, piiHandled: true }));
      setCurrentWorkflowStep('transform');
    }
  };

  // PII handling completion
  const handlePIIHandled = () => {
    setWorkflowData((prev: any) => ({ ...prev, piiHandled: true }));
    setCurrentWorkflowStep('transform');
  };

  // Transformation completion
  const handleTransformationComplete = () => {
    setWorkflowData((prev: any) => ({ ...prev, transformationsApplied: true }));
    setCurrentWorkflowStep('review');
  };

  // Project update handler
  const handleProjectUpdate = (updatedProject: any) => {
    setCurrentProject(updatedProject);
    refreshProject();
  };

  // Multi-file join completion
  const handleJoinComplete = (joinedProject: any) => {
    setCurrentProject(joinedProject);
    setWorkflowData((prev: any) => ({
      ...prev,
      joinedFiles: [...prev.joinedFiles, joinedProject.id]
    }));
    toast({
      title: "Files Joined",
      description: "Your datasets have been successfully combined.",
    });
  };

  // Navigation handlers
  const handleNext = () => {
    if (currentWorkflowStep === 'review' && workflowData.transformationsApplied) {
      // Move to execute step
      setLocation(`/journeys/${journeyType}/execute`);
    } else {
      // Move to next workflow step
      const currentIndex = workflowSteps.findIndex(step => step.id === currentWorkflowStep);
      if (currentIndex < workflowSteps.length - 1) {
        setCurrentWorkflowStep(workflowSteps[currentIndex + 1].id);
      }
    }
  };

  const handlePrevious = () => {
    const currentIndex = workflowSteps.findIndex(step => step.id === currentWorkflowStep);
    if (currentIndex > 0) {
      setCurrentWorkflowStep(workflowSteps[currentIndex - 1].id);
    } else {
      // Go back to prepare step
      setLocation(`/journeys/${journeyType}/prepare`);
    }
  };

  // Get journey type specific configuration
  const getJourneyConfig = () => {
    switch (journeyType) {
      case 'guided':
      case 'non-tech':
        return {
          serviceType: 'automated_analysis' as const,
          maxSize: 10 * 1024 * 1024, // 10MB
          showAdvancedOptions: false
        };
      case 'business':
        return {
          serviceType: 'pay_per_analysis' as const,
          maxSize: 50 * 1024 * 1024, // 50MB
          showAdvancedOptions: true
        };
      case 'technical':
        return {
          serviceType: 'enterprise' as const,
          maxSize: 100 * 1024 * 1024, // 100MB
          showAdvancedOptions: true
        };
      default:
        return {
          serviceType: 'default' as const,
          maxSize: 10 * 1024 * 1024,
          showAdvancedOptions: false
        };
    }
  };

  const journeyConfig = getJourneyConfig();

  // Progress calculation
  const completedSteps = workflowSteps.filter(step => step.completed).length;
  const progress = (completedSteps / workflowSteps.length) * 100;

  // Container styles based on render context
  const containerClasses = renderAsContent 
    ? "space-y-6" 
    : "min-h-screen bg-gray-50";
  
  const innerContainerClasses = renderAsContent 
    ? "space-y-6" 
    : "max-w-6xl mx-auto px-4 py-8";

  return (
    <div className={containerClasses} data-testid="page-data-step">
      <div className={innerContainerClasses}>
        
        {/* Header - only show when not rendered as content */}
        {!renderAsContent && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="heading-data-preparation">
                Data Preparation
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Upload, validate, and prepare your data for analysis. Follow the guided workflow below.
              </p>
            </div>

            {/* Cost Transparency Section */}
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <CostChip
                    journeyType={journeyType as 'guided' | 'business' | 'technical'}
                    features={['data_preparation', 'schema_validation', 'privacy_check']}
                    dataSizeMB={Math.round((currentProject?.fileSize || 0) / 1024 / 1024)}
                    complexityLevel="basic"
                    expectedQuestions={3}
                    size="lg"
                    data-testid="cost-chip-data-step"
                  />
                  <Badge variant="secondary" data-testid="badge-data-stage">
                    Data Preparation • Step 2 of 3
                  </Badge>
                </div>
              </div>
              
              <PricingBanner
                journeyType={journeyType as 'guided' | 'business' | 'technical'}
                features={['data_preparation', 'schema_validation', 'privacy_check']}
                dataSizeMB={Math.round((currentProject?.fileSize || 0) / 1024 / 1024)}
                complexityLevel="basic"
                expectedQuestions={3}
                onConfirm={(estimate) => {
                  toast({
                    title: "Data Preparation Confirmed",
                    description: `Proceeding with data preparation for ${formatCurrency(estimate.total)}`,
                  });
                }}
                className="border-blue-200 bg-blue-50"
                data-testid="pricing-banner-data-step"
              />
            </div>
          </>
        )}

        {/* Workflow Progress */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  Data Preparation Workflow
                </CardTitle>
                <CardDescription>
                  Complete each step to prepare your data for analysis
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500 mb-1">Progress</div>
                <div className="flex items-center gap-2">
                  <Progress value={progress} className="w-24" />
                  <span className="text-sm font-medium">{completedSteps}/{workflowSteps.length}</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {workflowSteps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => setCurrentWorkflowStep(step.id)}
                    disabled={!step.completed && !step.active}
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      step.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : step.active
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-gray-100 border-gray-300 text-gray-400'
                    } ${step.completed || step.active ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                    data-testid={`button-workflow-step-${step.id}`}
                  >
                    {step.completed ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </button>
                  {index < workflowSteps.length - 1 && (
                    <div 
                      className={`w-16 h-0.5 mx-2 ${
                        workflowSteps[index + 1].completed || workflowSteps[index + 1].active
                          ? 'bg-blue-500' 
                          : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4">
              {workflowSteps.map((step) => (
                <div key={step.id} className="text-center max-w-[140px]">
                  <div className={`text-sm font-medium ${
                    step.active ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {step.description}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Main Workflow Content */}
          <div className="lg:col-span-3">
            {currentWorkflowStep === 'upload' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-blue-600" />
                    Upload Your Data
                  </CardTitle>
                  <CardDescription>
                    Choose your data source and upload files for analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MultiSourceUpload
                    onComplete={handleUploadComplete}
                    serviceType={journeyConfig.serviceType}
                    maxSize={journeyConfig.maxSize}
                    isLoading={isProcessing}
                  />
                </CardContent>
              </Card>
            )}

            {currentWorkflowStep === 'schema' && currentProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-green-600" />
                    Schema Review & Definition
                  </CardTitle>
                  <CardDescription>
                    Review detected data structure and customize field definitions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SchemaEditor project={currentProject} />
                  <div className="flex justify-end mt-6">
                    <Button 
                      onClick={handleSchemaValidated}
                      data-testid="button-confirm-schema"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Confirm Schema
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentWorkflowStep === 'privacy' && currentProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-yellow-600" />
                    Privacy & PII Handling
                  </CardTitle>
                  <CardDescription>
                    Handle personally identifiable information detected in your data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {currentProject.piiAnalysis?.detectedPII?.length > 0 ? (
                    <div className="space-y-4">
                      <Alert>
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          We detected {currentProject.piiAnalysis.detectedPII.length} column(s) 
                          with personally identifiable information. Please review and decide how to handle this data.
                        </AlertDescription>
                      </Alert>
                      
                      <div className="space-y-2">
                        {currentProject.piiAnalysis.detectedPII.map((pii: string, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-600" />
                              <span className="font-medium">{pii}</span>
                              <Badge variant="outline" className="text-yellow-700">PII Detected</Badge>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={handlePIIHandled}>
                          Continue with PII
                        </Button>
                        <Button onClick={handlePIIHandled}>
                          <Shield className="w-4 h-4 mr-2" />
                          Apply Anonymization
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No PII Detected</h3>
                      <p className="text-gray-600 mb-4">
                        Your data appears to be free of personally identifiable information.
                      </p>
                      <Button onClick={handlePIIHandled}>
                        Continue to Data Preparation
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {currentWorkflowStep === 'transform' && currentProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-600" />
                    Data Transformations
                  </CardTitle>
                  <CardDescription>
                    Clean, filter, and prepare your data for analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="transform" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="transform" data-testid="tab-transform">Transform</TabsTrigger>
                      <TabsTrigger value="join" data-testid="tab-join">Join Data</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="transform" className="space-y-6">
                      <DataTransformation 
                        project={currentProject}
                        onProjectUpdate={handleProjectUpdate}
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleTransformationComplete}>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Complete Transformations
                        </Button>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="join" className="space-y-6">
                      {projectsData && (
                        <MultiFileJoiner
                          currentProject={currentProject}
                          userProjects={projectsData}
                          onJoinComplete={handleJoinComplete}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {currentWorkflowStep === 'review' && currentProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-indigo-600" />
                    Final Review
                  </CardTitle>
                  <CardDescription>
                    Review your prepared data before starting analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Data Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {currentProject.recordCount || 0}
                        </div>
                        <div className="text-sm text-blue-700">Records</div>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {Object.keys(currentProject.schema || {}).length}
                        </div>
                        <div className="text-sm text-green-700">Columns</div>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {Math.round((currentProject.fileSize || 0) / 1024 / 1024 * 100) / 100}MB
                        </div>
                        <div className="text-sm text-purple-700">File Size</div>
                      </div>
                    </div>

                    {/* Data Preview */}
                    {currentProject.data && currentProject.data.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3">Data Preview</h4>
                        <div className="border rounded-lg overflow-hidden">
                          <div className="overflow-x-auto max-h-64">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  {Object.keys(currentProject.data[0]).slice(0, 6).map((header) => (
                                    <th key={header} className="px-4 py-2 text-left font-medium text-gray-600">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {currentProject.data.slice(0, 5).map((row: any, index: number) => (
                                  <tr key={index} className="border-t">
                                    {Object.keys(row).slice(0, 6).map((key) => (
                                      <td key={key} className="px-4 py-2 text-gray-900">
                                        {String(row[key]).slice(0, 50)}
                                        {String(row[key]).length > 50 && '...'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Processing Summary */}
                    <div>
                      <h4 className="font-semibold mb-3">Processing Summary</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Data uploaded successfully</span>
                        </div>
                        {workflowData.schemaValidated && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm">Schema validated and defined</span>
                          </div>
                        )}
                        {workflowData.piiHandled && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm">Privacy compliance completed</span>
                          </div>
                        )}
                        {workflowData.transformationsApplied && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm">Data transformations applied</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-6 sticky top-8">
              
              {/* Current Step Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Current Step</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const currentStep = workflowSteps.find(step => step.active);
                    return currentStep ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <currentStep.icon className="w-5 h-5 text-blue-600" />
                          <span className="font-medium">{currentStep.title}</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {currentStep.description}
                        </p>
                        {isProcessing && (
                          <div className="flex items-center gap-2 text-sm text-blue-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing...
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}
                </CardContent>
              </Card>

              {/* Cost Estimate */}
              {estimatedCost > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Estimated Cost</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CostChip 
                      journeyType={journeyType as 'guided' | 'business' | 'technical'}
                      features={['data_preparation']}
                      dataSizeMB={10}
                      complexityLevel="basic"
                      expectedQuestions={1}
                      size="lg"
                    />
                  </CardContent>
                </Card>
              )}

              {/* Navigation */}
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <Button 
                      variant="outline" 
                      onClick={handlePrevious}
                      className="w-full"
                      data-testid="button-previous-step"
                    >
                      <ChevronLeft className="w-4 h-4 mr-2" />
                      Previous Step
                    </Button>
                    <Button 
                      onClick={handleNext}
                      className="w-full"
                      disabled={currentWorkflowStep === 'upload' && workflowData.uploadedFiles.length === 0}
                      data-testid="button-next-step"
                    >
                      {currentWorkflowStep === 'review' ? 'Start Analysis' : 'Next Step'}
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}