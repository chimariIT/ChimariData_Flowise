import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  BarChart3, 
  Brain, 
  Zap, 
  Play, 
  Clock, 
  Download, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight,
  AlertCircle,
  Loader2,
  FileText,
  TrendingUp,
  Calculator,
  Settings,
  Sparkles,
  Target,
  Eye,
  Activity
} from "lucide-react";
import GuidedAnalysisWizard from "@/components/GuidedAnalysisWizard";
import DataAnalysis from "@/components/data-analysis";
import AdvancedAnalysisModal from "@/components/advanced-analysis-modal";
import { useProjectContext } from "@/hooks/useProjectContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Form validation schema for analysis configuration
const executeFormSchema = z.object({
  analysisType: z.enum(["guided", "statistical", "machine_learning", "agentic", "custom"]),
  complexity: z.enum(["basic", "intermediate", "advanced"]),
  businessQuestion: z.string().optional(),
  targetVariable: z.string().optional(),
  selectedVariables: z.array(z.string()).optional(),
  analysisGoals: z.array(z.string()).optional(),
  aiProvider: z.enum(["openai", "anthropic", "google"]).optional(),
  generateReport: z.boolean().default(true),
  includeVisualizations: z.boolean().default(true),
  exportFormat: z.enum(["pdf", "json", "csv", "all"]).default("pdf"),
});

type ExecuteFormData = z.infer<typeof executeFormSchema>;

interface ExecuteStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

interface AnalysisOption {
  id: string;
  name: string;
  description: string;
  icon: any;
  complexity: "basic" | "intermediate" | "advanced";
  estimatedTime: string;
  features: string[];
  recommended?: boolean;
}

interface ExecutionStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "error";
  progress: number;
  result?: any;
  error?: string;
}

export default function ExecuteStep({ journeyType, onNext, onPrevious }: ExecuteStepProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject, refreshProject } = useProjectContext();
  
  // State management
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<string>("");
  const [analysisConfig, setAnalysisConfig] = useState<any>({});
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [results, setResults] = useState<any>(null);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [showGuidedWizard, setShowGuidedWizard] = useState(false);
  const [currentExecutionStep, setCurrentExecutionStep] = useState<string>("");

  // Form setup
  const form = useForm<ExecuteFormData>({
    resolver: zodResolver(executeFormSchema),
    defaultValues: {
      analysisType: "guided",
      complexity: "basic",
      businessQuestion: "",
      targetVariable: "",
      selectedVariables: [],
      analysisGoals: [],
      aiProvider: "openai",
      generateReport: true,
      includeVisualizations: true,
      exportFormat: "pdf",
    }
  });

  // Analysis options based on journey type
  const getAnalysisOptions = (): AnalysisOption[] => {
    const baseOptions: AnalysisOption[] = [
      {
        id: "guided",
        name: "Guided Analysis",
        description: "AI-assisted analysis with step-by-step guidance and business insights",
        icon: Brain,
        complexity: "basic",
        estimatedTime: "5-15 minutes",
        features: ["AI Insights", "Business Questions", "Automated Interpretation"],
        recommended: journeyType === "guided" || journeyType === "business"
      },
      {
        id: "statistical",
        name: "Statistical Analysis",
        description: "Comprehensive statistical analysis including descriptive stats, correlations, and hypothesis testing",
        icon: Calculator,
        complexity: "intermediate",
        estimatedTime: "10-30 minutes",
        features: ["Descriptive Statistics", "Correlation Analysis", "Hypothesis Testing", "ANOVA"]
      },
      {
        id: "machine_learning",
        name: "Machine Learning",
        description: "Advanced ML models for prediction, classification, and clustering",
        icon: Zap,
        complexity: "advanced",
        estimatedTime: "15-45 minutes",
        features: ["Predictive Models", "Classification", "Clustering", "Feature Importance"]
      },
      {
        id: "agentic",
        name: "AI Agent Analysis",
        description: "Autonomous AI agent conducts complete analysis with executive summary",
        icon: Sparkles,
        complexity: "basic",
        estimatedTime: "20-60 minutes",
        features: ["Autonomous Analysis", "Executive Summary", "Action Recommendations"],
        recommended: journeyType === "business"
      },
      {
        id: "custom",
        name: "Custom Analysis",
        description: "Configure your own analysis with specific parameters and methods",
        icon: Settings,
        complexity: "advanced",
        estimatedTime: "Variable",
        features: ["Custom Configuration", "Advanced Parameters", "Multiple Methods"]
      }
    ];

    // Filter based on journey type
    switch (journeyType) {
      case "guided":
      case "non-tech":
        return baseOptions.filter(opt => opt.complexity !== "advanced");
      case "business":
        return baseOptions;
      case "technical":
        return baseOptions;
      default:
        return baseOptions.filter(opt => opt.complexity === "basic");
    }
  };

  const analysisOptions = getAnalysisOptions();

  // Project schema for variable selection
  const availableVariables = currentProject?.schema ? Object.keys(currentProject.schema) : [];
  const numericVariables = availableVariables.filter(variable => 
    currentProject?.schema[variable]?.type === 'number' || 
    currentProject?.schema[variable]?.type === 'integer'
  );
  const categoricalVariables = availableVariables.filter(variable => 
    currentProject?.schema[variable]?.type === 'text' || 
    currentProject?.schema[variable]?.type === 'string' || 
    currentProject?.schema[variable]?.type === 'boolean'
  );

  // Initialize execution steps based on analysis type
  const initializeExecutionSteps = (analysisType: string) => {
    const baseSteps: ExecutionStep[] = [
      {
        id: "preparation",
        title: "Analysis Preparation",
        description: "Preparing data and configuration",
        status: "pending",
        progress: 0
      },
      {
        id: "execution",
        title: "Running Analysis",
        description: "Executing analysis algorithms",
        status: "pending",
        progress: 0
      },
      {
        id: "visualization",
        title: "Generating Visualizations",
        description: "Creating charts and graphs",
        status: "pending",
        progress: 0
      },
      {
        id: "interpretation",
        title: "AI Insights",
        description: "Generating insights and recommendations",
        status: "pending",
        progress: 0
      },
      {
        id: "artifacts",
        title: "Creating Artifacts",
        description: "Generating reports and exports",
        status: "pending",
        progress: 0
      }
    ];

    setExecutionSteps(baseSteps);
  };

  // Execution mutation
  const executeMutation = useMutation({
    mutationFn: async (config: any) => {
      const response = await apiRequest("POST", "/api/analysis/execute", {
        projectId: currentProject?.id,
        analysisType: config.analysisType,
        configuration: config,
        journeyType,
        userId: "dev-guest" // TODO: Get from auth context
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setResults(data.results);
        setArtifacts(data.artifacts || []);
        setCurrentExecutionStep("completed");
        
        // Refresh project to get updated analysis results
        refreshProject();
        
        toast({
          title: "Analysis Complete",
          description: "Your analysis has been completed successfully with artifacts generated.",
        });
      }
    },
    onError: (error: any) => {
      console.error('Analysis execution failed:', error);
      setCurrentExecutionStep("error");
      toast({
        title: "Analysis Failed",
        description: "There was an error running your analysis. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Analysis validation
  const validateAnalysisConfig = (analysisType: string, complexity: string) => {
    const option = analysisOptions.find(opt => opt.id === analysisType);
    return !!option && !!complexity;
  };

  // Handlers
  const handleAnalysisTypeSelect = (analysisType: string) => {
    setSelectedAnalysisType(analysisType);
    form.setValue("analysisType", analysisType as any);
    initializeExecutionSteps(analysisType);
    
    // Show appropriate configuration UI
    if (analysisType === "guided") {
      setShowGuidedWizard(true);
    } else if (analysisType === "custom") {
      setShowAdvancedConfig(true);
    }
  };

  const handleExecuteAnalysis = async (formData: ExecuteFormData) => {
    if (!currentProject) {
      toast({
        title: "No Project Selected",
        description: "Please ensure you have uploaded and prepared your data first.",
        variant: "destructive",
      });
      return;
    }

    // Create analysis configuration
    const config = {
      ...formData,
      projectId: currentProject.id,
      variables: {
        numeric: numericVariables,
        categorical: categoricalVariables,
        target: formData.targetVariable,
        selected: formData.selectedVariables
      },
      analysisValidated: true
    };

    // Proceed with analysis execution
    await executeAnalysisWithConfig(config);
  };

  const executeAnalysisWithConfig = async (config: any) => {
    setIsExecuting(true);
    setCurrentExecutionStep("preparation");

    // Simulate execution progress
    let step = 0;
    const steps = executionSteps.map(s => s.id);
    const progressInterval = setInterval(() => {
      if (step < steps.length) {
        setCurrentExecutionStep(steps[step]);
        setExecutionSteps(prev => prev.map(s => 
          s.id === steps[step] 
            ? { ...s, status: "running" as const, progress: 50 }
            : s.id === steps[step - 1]
            ? { ...s, status: "completed" as const, progress: 100 }
            : s
        ));
        step++;
      } else {
        clearInterval(progressInterval);
      }
    }, 2000);

    try {
      await executeMutation.mutateAsync(config);
      clearInterval(progressInterval);
      setExecutionSteps(prev => prev.map(s => ({ ...s, status: "completed" as const, progress: 100 })));
    } catch (error) {
      clearInterval(progressInterval);
      setExecutionSteps(prev => prev.map(s => 
        s.status === "running" ? { ...s, status: "error" as const } : s
      ));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleGuidedAnalysisComplete = (config: any) => {
    setAnalysisConfig(config);
    setShowGuidedWizard(false);
    
    // Apply guided analysis configuration to form
    form.setValue("businessQuestion", config.businessQuestion || "");
    form.setValue("analysisGoals", config.analysisGoals || []);
    form.setValue("complexity", config.complexity || "basic");
  };

  const handlePrevious = () => {
    setLocation(`/journeys/${journeyType}/data`);
  };

  const handleNext = () => {
    if (results) {
      // Navigate to results page or project view
      setLocation(`/project/${currentProject?.id}/results`);
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'basic': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Don't render if no project
  if (!currentProject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              No Project Data
            </CardTitle>
            <CardDescription>
              You need to complete the data preparation step before executing analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation(`/journeys/${journeyType}/data`)}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Data Step
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="execute-step">
      
      {/* Header */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-900">
            <BarChart3 className="w-6 h-6" />
            Analysis Execution
          </CardTitle>
          <CardDescription className="text-green-700">
            Configure and run your analysis to generate insights and artifacts
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Project Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Project Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-lg font-semibold text-blue-600">
                {currentProject.recordCount || 0}
              </div>
              <div className="text-sm text-blue-700">Records</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-lg font-semibold text-green-600">
                {availableVariables.length}
              </div>
              <div className="text-sm text-green-700">Variables</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="text-lg font-semibold text-purple-600">
                {numericVariables.length}
              </div>
              <div className="text-sm text-purple-700">Numeric</div>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="text-lg font-semibold text-orange-600">
                {categoricalVariables.length}
              </div>
              <div className="text-sm text-orange-700">Categorical</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isExecuting && !results && (
        <>
          {/* Analysis Type Selection */}
          <Card data-testid="card-analysis-selection">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Choose Analysis Type
              </CardTitle>
              <CardDescription>
                Select the type of analysis that best fits your goals and expertise level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {analysisOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedAnalysisType === option.id;
                  
                  return (
                    <div
                      key={option.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      } ${option.recommended ? 'ring-2 ring-green-200' : ''}`}
                      onClick={() => handleAnalysisTypeSelect(option.id)}
                      data-testid={`option-${option.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                            isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                          }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-gray-900">{option.name}</h4>
                              <Badge className={getComplexityColor(option.complexity)}>
                                {option.complexity}
                              </Badge>
                              {option.recommended && (
                                <Badge className="bg-green-100 text-green-800">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            <p className="text-gray-600 text-sm mb-3">{option.description}</p>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {option.estimatedTime}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <div className="text-sm">
                            <span className="font-medium text-blue-900">Features included:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {option.features.map((feature) => (
                                <Badge key={feature} variant="secondary" className="text-xs">
                                  {feature}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Configuration Section */}
          {selectedAnalysisType && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleExecuteAnalysis)} className="space-y-6">
                <Card data-testid="card-analysis-config">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-purple-600" />
                      Analysis Configuration
                    </CardTitle>
                    <CardDescription>
                      Customize your analysis parameters and options
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    
                    {/* Basic Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="complexity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Analysis Complexity</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-complexity">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="basic">Basic - Quick insights</SelectItem>
                                <SelectItem value="intermediate">Intermediate - Detailed analysis</SelectItem>
                                <SelectItem value="advanced">Advanced - Comprehensive study</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />

                      {selectedAnalysisType !== "guided" && (
                        <FormField
                          control={form.control}
                          name="targetVariable"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Target Variable (Optional)</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-target-variable">
                                    <SelectValue placeholder="Select target variable" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="">None</SelectItem>
                                  {numericVariables.map(variable => (
                                    <SelectItem key={variable} value={variable}>
                                      {variable}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {/* Business Question */}
                    <FormField
                      control={form.control}
                      name="businessQuestion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Question (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="What specific business question should this analysis answer?"
                              className="min-h-[80px]"
                              data-testid="textarea-business-question"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Output Options */}
                    <div className="space-y-4">
                      <Label className="text-base font-medium">Output Options</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="generateReport"
                            checked={form.watch("generateReport")}
                            onCheckedChange={(checked) => form.setValue("generateReport", !!checked)}
                            data-testid="checkbox-generate-report"
                          />
                          <Label htmlFor="generateReport">Generate Executive Report</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="includeVisualizations"
                            checked={form.watch("includeVisualizations")}
                            onCheckedChange={(checked) => form.setValue("includeVisualizations", !!checked)}
                            data-testid="checkbox-include-visualizations"
                          />
                          <Label htmlFor="includeVisualizations">Include Visualizations</Label>
                        </div>
                      </div>
                    </div>


                    {/* Execute Button */}
                    <div className="flex justify-end">
                      <Button 
                        type="submit"
                        disabled={!selectedAnalysisType || isExecuting}
                        className="min-w-[200px]"
                        data-testid="button-execute-analysis"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Execute Analysis
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </form>
            </Form>
          )}
        </>
      )}

      {/* Execution Progress */}
      {isExecuting && (
        <Card data-testid="card-execution-progress">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
              Analysis in Progress
            </CardTitle>
            <CardDescription>
              Your analysis is running. This may take several minutes depending on complexity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {executionSteps.map((step, index) => (
                <div key={step.id} className="flex items-center space-x-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    step.status === "completed" 
                      ? "bg-green-500 text-white"
                      : step.status === "running"
                      ? "bg-blue-500 text-white"
                      : step.status === "error"
                      ? "bg-red-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}>
                    {step.status === "completed" ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : step.status === "running" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : step.status === "error" ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <span className="text-sm font-medium">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className={`font-medium ${
                        step.status === "running" ? "text-blue-600" 
                        : step.status === "completed" ? "text-green-600"
                        : step.status === "error" ? "text-red-600"
                        : "text-gray-600"
                      }`}>
                        {step.title}
                      </h4>
                      {step.status === "running" && (
                        <span className="text-sm text-blue-600">{step.progress}%</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{step.description}</p>
                    {step.status === "running" && (
                      <Progress value={step.progress} className="w-full mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {results && !isExecuting && (
        <Card data-testid="card-analysis-results">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Analysis Complete
            </CardTitle>
            <CardDescription>
              Your analysis has been completed. Review the results and download artifacts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              
              {/* Quick Results Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {results.insights?.length || 0}
                  </div>
                  <div className="text-sm text-blue-700">Key Insights</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {artifacts.length}
                  </div>
                  <div className="text-sm text-green-700">Generated Artifacts</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {results.visualizations?.length || 0}
                  </div>
                  <div className="text-sm text-purple-700">Visualizations</div>
                </div>
              </div>

              {/* Key Insights */}
              {results.insights && results.insights.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Key Insights
                  </h4>
                  <div className="space-y-2">
                    {results.insights.slice(0, 3).map((insight: string, index: number) => (
                      <div key={index} className="flex items-start space-x-2">
                        <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <p className="text-gray-700">{insight}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Artifacts */}
              {artifacts.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Generated Artifacts
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {artifacts.map((artifact: any, index: number) => (
                      <div key={index} className="border rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                            <FileText className="w-4 h-4 text-gray-600" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{artifact.name}</div>
                            <div className="text-xs text-gray-500">{artifact.type}</div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button onClick={() => setLocation(`/project/${currentProject.id}`)}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Project
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Run Another Analysis
                </Button>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 border-t">
        <Button variant="outline" onClick={handlePrevious}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Data
        </Button>
        
        {results && (
          <Button onClick={handleNext}>
            View Project
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>

      {/* Modals */}
      {showGuidedWizard && (
        <GuidedAnalysisWizard
          projectId={currentProject.id}
          schema={currentProject.schema}
          onComplete={handleGuidedAnalysisComplete}
          onClose={() => setShowGuidedWizard(false)}
        />
      )}

      {showAdvancedConfig && (
        <AdvancedAnalysisModal
          isOpen={showAdvancedConfig}
          onClose={() => setShowAdvancedConfig(false)}
          projectId={currentProject.id}
          schema={currentProject.schema}
        />
      )}

    </div>
  );
}