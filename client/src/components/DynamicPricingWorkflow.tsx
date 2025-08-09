import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Clock, DollarSign, FileText, Settings, Zap, BarChart, Brain } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface PricingWorkflowProps {
  projectId: string;
  onComplete?: (workflowId: string) => void;
}

interface WorkflowStep {
  step: string;
  title: string;
  description: string;
  estimatedTime: number;
  requirements: string[];
  optional: boolean;
  completed?: boolean;
}

interface PricingBreakdown {
  category: string;
  description: string;
  cost: number;
  isDiscount: boolean;
}

interface FeatureRecommendation {
  feature: string;
  reason: string;
  priority: 'required' | 'recommended' | 'optional';
  estimatedCost: number;
}

export function DynamicPricingWorkflow({ projectId, onComplete }: PricingWorkflowProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('feature_selection');
  const [featureConfigurations, setFeatureConfigurations] = useState<Record<string, any>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch project analysis and recommendations
  const { data: projectAnalysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['/api/project-analysis', projectId],
    enabled: !!projectId
  });

  // Fetch current workflow state
  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ['/api/pricing-workflow', projectId],
    enabled: !!projectId
  });

  // Calculate dynamic pricing
  const { data: pricingData, isLoading: pricingLoading } = useQuery({
    queryKey: ['/api/dynamic-pricing', projectId, selectedFeatures, featureConfigurations],
    enabled: !!projectId && selectedFeatures.length > 0,
    select: (data) => ({
      ...data,
      breakdown: data.breakdown || [],
      estimatedTime: data.estimatedProcessing?.timeMinutes || 0
    })
  });

  // Update workflow mutation
  const updateWorkflowMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('PUT', `/api/pricing-workflow/${projectId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing-workflow', projectId] });
    }
  });

  // Create payment intent mutation
  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/create-payment-intent', {
        projectId,
        selectedFeatures,
        featureConfigurations,
        amount: pricingData?.finalTotal || 0
      });
    },
    onSuccess: (data) => {
      // Redirect to payment flow
      window.location.href = `/payment/${data.paymentIntentId}?projectId=${projectId}`;
    },
    onError: (error) => {
      toast({
        title: 'Payment Error',
        description: 'Failed to create payment. Please try again.',
        variant: 'destructive'
      });
    }
  });

  const featureIcons = {
    data_transformation: Settings,
    data_visualization: BarChart,
    data_analysis: FileText,
    ai_insights: Brain
  };

  const featureColors = {
    data_transformation: 'bg-blue-100 text-blue-800 border-blue-200',
    data_visualization: 'bg-green-100 text-green-800 border-green-200',
    data_analysis: 'bg-purple-100 text-purple-800 border-purple-200',
    ai_insights: 'bg-orange-100 text-orange-800 border-orange-200'
  };

  const handleFeatureToggle = (feature: string) => {
    setSelectedFeatures(prev => 
      prev.includes(feature) 
        ? prev.filter(f => f !== feature)
        : [...prev, feature]
    );
  };

  const handleConfigurationUpdate = (feature: string, config: any) => {
    setFeatureConfigurations(prev => ({
      ...prev,
      [feature]: config
    }));
  };

  const proceedToPayment = () => {
    if (!pricingData || selectedFeatures.length === 0) {
      toast({
        title: 'Selection Required',
        description: 'Please select at least one feature before proceeding.',
        variant: 'destructive'
      });
      return;
    }

    // Update workflow state
    updateWorkflowMutation.mutate({
      currentStep: 'payment',
      selectedFeatures,
      featureConfigurations,
      estimatedCost: Math.round(pricingData.finalTotal * 100) // Convert to cents
    });

    // Create payment intent
    createPaymentMutation.mutate();
  };

  if (analysisLoading || workflowLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        <span className="ml-3">Loading analysis...</span>
      </div>
    );
  }

  const recommendations = projectAnalysis?.recommendations || [];
  const workflowSteps = projectAnalysis?.workflowSteps || [];
  const currentStepIndex = workflowSteps.findIndex((step: WorkflowStep) => step.step === currentStep);
  const progressPercentage = currentStepIndex >= 0 ? ((currentStepIndex + 1) / workflowSteps.length) * 100 : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Dynamic Pricing Workflow</CardTitle>
              <CardDescription>
                Customized pricing based on your data complexity and requirements
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              Step {currentStepIndex + 1} of {workflowSteps.length}
            </Badge>
          </div>
          <Progress value={progressPercentage} className="mt-4" />
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Configuration Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Data Analysis Summary */}
          {projectAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Data Analysis Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">File Size</div>
                    <div className="font-medium">
                      {((projectAnalysis.fileSizeBytes || 0) / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Records</div>
                    <div className="font-medium">
                      {(projectAnalysis.recordCount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Columns</div>
                    <div className="font-medium">{projectAnalysis.columnCount || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Complexity</div>
                    <Badge variant="outline">
                      {projectAnalysis.estimatedComplexity || 'Medium'}
                    </Badge>
                  </div>
                </div>

                {/* Data Quality Indicators */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {projectAnalysis.piiDetected && (
                    <Badge variant="secondary">PII Detected</Badge>
                  )}
                  {projectAnalysis.missingDataPercentage > 5 && (
                    <Badge variant="secondary">
                      {projectAnalysis.missingDataPercentage.toFixed(1)}% Missing Data
                    </Badge>
                  )}
                  {projectAnalysis.outliersDetected && (
                    <Badge variant="secondary">Outliers Present</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feature Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Recommended Features
              </CardTitle>
              <CardDescription>
                Based on your data characteristics and common use cases
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recommendations.map((rec: FeatureRecommendation) => {
                  const Icon = featureIcons[rec.feature as keyof typeof featureIcons];
                  const isSelected = selectedFeatures.includes(rec.feature);
                  
                  return (
                    <div
                      key={rec.feature}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/5' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleFeatureToggle(rec.feature)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {Icon && <Icon className="h-5 w-5 mt-0.5" />}
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">
                                {rec.feature.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </h4>
                              <Badge 
                                variant={rec.priority === 'required' ? 'default' : 'outline'}
                                className="text-xs"
                              >
                                {rec.priority}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {rec.reason}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${rec.estimatedCost}+</div>
                          <div className="text-xs text-muted-foreground">Starting price</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Feature Configuration */}
          {selectedFeatures.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Configure Selected Features</CardTitle>
                <CardDescription>
                  Customize the processing options for your selected features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {selectedFeatures.map(feature => (
                    <FeatureConfiguration
                      key={feature}
                      feature={feature}
                      configuration={featureConfigurations[feature] || {}}
                      onUpdate={(config) => handleConfigurationUpdate(feature, config)}
                      projectAnalysis={projectAnalysis}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pricing Sidebar */}
        <div className="space-y-6">
          {/* Pricing Summary */}
          {pricingData && (
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Pricing Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Pricing Breakdown */}
                  <div className="space-y-2">
                    {pricingData.breakdown.map((item: PricingBreakdown, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className={item.isDiscount ? 'text-green-600' : ''}>
                          {item.description}
                        </span>
                        <span className={item.isDiscount ? 'text-green-600' : ''}>
                          {item.isDiscount ? '-' : ''}${Math.abs(item.cost).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="flex justify-between font-medium text-lg">
                    <span>Total</span>
                    <span>${pricingData.finalTotal.toFixed(2)}</span>
                  </div>

                  {/* Processing Time Estimate */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>~{pricingData.estimatedTime} minutes processing time</span>
                  </div>

                  {/* Payment Button */}
                  <Button 
                    onClick={proceedToPayment}
                    className="w-full mt-4"
                    disabled={selectedFeatures.length === 0 || createPaymentMutation.isPending}
                  >
                    {createPaymentMutation.isPending ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        Processing...
                      </div>
                    ) : (
                      `Proceed to Payment - $${pricingData.finalTotal.toFixed(2)}`
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Workflow Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {workflowSteps.map((step: WorkflowStep, index: number) => (
                  <div key={step.step} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      index <= currentStepIndex 
                        ? 'bg-primary text-white' 
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {index < currentStepIndex ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div>
                      <div className={`text-sm font-medium ${
                        index === currentStepIndex ? 'text-primary' : ''
                      }`}>
                        {step.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ~{step.estimatedTime} min
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Feature Configuration Component
function FeatureConfiguration({ 
  feature, 
  configuration, 
  onUpdate, 
  projectAnalysis 
}: {
  feature: string;
  configuration: any;
  onUpdate: (config: any) => void;
  projectAnalysis: any;
}) {
  const featureName = feature.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-medium mb-3">{featureName} Configuration</h4>
      
      {feature === 'data_transformation' && (
        <TransformationConfig 
          configuration={configuration}
          onUpdate={onUpdate}
          projectAnalysis={projectAnalysis}
        />
      )}
      
      {feature === 'data_visualization' && (
        <VisualizationConfig 
          configuration={configuration}
          onUpdate={onUpdate}
          projectAnalysis={projectAnalysis}
        />
      )}
      
      {feature === 'data_analysis' && (
        <AnalysisConfig 
          configuration={configuration}
          onUpdate={onUpdate}
          projectAnalysis={projectAnalysis}
        />
      )}
      
      {feature === 'ai_insights' && (
        <AIInsightsConfig 
          configuration={configuration}
          onUpdate={onUpdate}
          projectAnalysis={projectAnalysis}
        />
      )}
    </div>
  );
}

// Individual feature configuration components would go here
function TransformationConfig({ configuration, onUpdate, projectAnalysis }: any) {
  return (
    <div className="text-sm text-muted-foreground">
      Data transformation options will be configured based on detected issues...
    </div>
  );
}

function VisualizationConfig({ configuration, onUpdate, projectAnalysis }: any) {
  return (
    <div className="text-sm text-muted-foreground">
      Visualization options will be configured based on data types...
    </div>
  );
}

function AnalysisConfig({ configuration, onUpdate, projectAnalysis }: any) {
  return (
    <div className="text-sm text-muted-foreground">
      Analysis options will be configured based on data characteristics...
    </div>
  );
}

function AIInsightsConfig({ configuration, onUpdate, projectAnalysis }: any) {
  return (
    <div className="text-sm text-muted-foreground">
      AI insights options will be configured based on business goals...
    </div>
  );
}