import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Brain, 
  Target, 
  Sparkles, 
  ArrowRight, 
  CheckCircle,
  BarChart3,
  Zap,
  TrendingUp,
  Users,
  Clock,
  AlertCircle,
  Loader2,
  Lightbulb
} from "lucide-react";
import type { GoalExtractionRequest, GoalExtractionResponse } from "@shared/schema";

// Form validation schema
const prepareFormSchema = z.object({
  userDescription: z.string().min(20, "Please provide a detailed description (at least 20 characters)"),
  industry: z.string().optional(),
  businessRole: z.string().optional(),
  technicalLevel: z.enum(["basic", "intermediate", "advanced"]),
  dataTypes: z.array(z.string()).optional(),
});

type PrepareFormData = z.infer<typeof prepareFormSchema>;

interface AnalysisPath {
  name: string;
  type: string;
  description: string;
  complexity: string;
  estimatedDuration: string;
  expectedOutcomes: string[];
  requiredFeatures: string[];
  confidence: number;
}

interface ExtractedGoal {
  goal: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
}

interface BusinessQuestion {
  question: string;
  type: string;
  complexity: string;
  dataRequirements: string[];
}

interface PrepareStepProps {
  journeyType: string;
}

export default function PrepareStep({ journeyType }: PrepareStepProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [extractedGoals, setExtractedGoals] = useState<ExtractedGoal[]>([]);
  const [businessQuestions, setBusinessQuestions] = useState<BusinessQuestion[]>([]);
  const [suggestedPaths, setSuggestedPaths] = useState<AnalysisPath[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [aiProvider, setAiProvider] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);

  const form = useForm<PrepareFormData>({
    resolver: zodResolver(prepareFormSchema),
    defaultValues: {
      userDescription: "",
      industry: "",
      businessRole: "",
      technicalLevel: "basic",
      dataTypes: [],
    }
  });

  // Goal extraction mutation
  const extractGoalsMutation = useMutation({
    mutationFn: async (data: GoalExtractionRequest): Promise<GoalExtractionResponse> => {
      const response = await apiRequest("POST", "/api/analysis/extract-goals", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setExtractedGoals(data.extractedGoals);
        setBusinessQuestions(data.businessQuestions);
        setSuggestedPaths(data.suggestedAnalysisPaths);
        setAiProvider(data.aiProvider);
        
        // Note: Features will be determined later in the pricing step
        
        // Auto-select high-confidence analysis paths
        const highConfidencePaths = data.suggestedAnalysisPaths
          .filter(path => path.confidence >= 80)
          .map(path => path.name);
        setSelectedPaths(highConfidencePaths.slice(0, 3)); // Limit to top 3
        
        toast({
          title: "Goals Extracted Successfully",
          description: `Found ${data.extractedGoals.length} goals and ${data.suggestedAnalysisPaths.length} analysis suggestions.`,
        });
      }
    },
    onError: (error: any) => {
      console.error('Goal extraction failed:', error);
      toast({
        title: "Goal Extraction Failed",
        description: "Failed to analyze your description. Please try again or contact support.",
        variant: "destructive",
      });
    }
  });

  const handleExtractGoals = async (formData: PrepareFormData) => {
    setIsExtracting(true);
    
    const context = {
      industry: formData.industry,
      businessRole: formData.businessRole,
      technicalLevel: formData.technicalLevel,
      dataTypes: formData.dataTypes
    };

    const request: GoalExtractionRequest = {
      userDescription: formData.userDescription,
      journeyType,
      context,
      journeyId: undefined // Will be set when journey is created
    };

    await extractGoalsMutation.mutateAsync(request);
    setIsExtracting(false);
  };

  const handlePathToggle = (pathName: string) => {
    setSelectedPaths(prev => 
      prev.includes(pathName) 
        ? prev.filter(p => p !== pathName)
        : [...prev, pathName]
    );
  };

  const handleProceedToDataStep = () => {
    if (selectedPaths.length === 0) {
      toast({
        title: "Select Analysis Paths",
        description: "Please select at least one analysis approach to continue.",
        variant: "destructive",
      });
      return;
    }

    // TODO: Save journey data to database here
    // Need to implement journey storage methods in IStorage interface:
    // - createJourney(journey: InsertJourney): Promise<Journey>
    // - updateJourney(id: string, updates: Partial<Journey>): Promise<Journey>
    // 
    // const journeyData = {
    //   userId: user?.id,
    //   journeyType,
    //   currentStep: 'data',
    //   title: `${journeyType.charAt(0).toUpperCase() + journeyType.slice(1)} Analysis Journey`,
    //   description: form.getValues().userDescription,
    //   goals: extractedGoals.map(g => g.goal),
    //   questions: businessQuestions.map(q => q.question),
    //   suggestedPlan: {
    //     analysisSteps: selectedPaths,
    //     estimatedDuration: "2-6 hours",
    //   }
    // };
    // 
    // await storage.createJourney(journeyData);

    toast({
      title: "Goals Saved",
      description: "Your analysis goals have been prepared. Proceeding to data upload.",
    });

    // Navigate to next step
    setLocation(`/journeys/${journeyType}/project-setup`);
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'basic': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAnalysisTypeIcon = (type: string) => {
    switch (type) {
      case 'statistical': return <BarChart3 className="w-4 h-4" />;
      case 'machine_learning': return <Brain className="w-4 h-4" />;
      case 'visualization': return <TrendingUp className="w-4 h-4" />;
      case 'business_intelligence': return <Users className="w-4 h-4" />;
      case 'time_series': return <Clock className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6" data-testid="prepare-step">
        
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Target className="w-6 h-6" />
              Analysis Preparation
            </CardTitle>
            <CardDescription className="text-blue-700">
              Describe your analysis needs and let AI help you design the perfect approach
            </CardDescription>
          </CardHeader>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleExtractGoals)} className="space-y-6">
            
            {/* Goal Input Section */}
            <Card data-testid="card-goal-input">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5" />
                  What do you want to learn from your data?
                </CardTitle>
                <CardDescription>
                  Describe your business question, analysis goals, or what insights you're looking for. 
                  Be as specific as possible - this helps our AI suggest the best approach.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="userDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Analysis Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="For example: I want to understand customer churn patterns in my subscription business. I have 2 years of customer data including demographics, usage patterns, and subscription history. I need to identify which customers are most likely to cancel and what factors drive churn."
                          className="min-h-[120px]"
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Context Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-industry">
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="technology">Technology</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                            <SelectItem value="healthcare">Healthcare</SelectItem>
                            <SelectItem value="retail">Retail & E-commerce</SelectItem>
                            <SelectItem value="manufacturing">Manufacturing</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="education">Education</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="technicalLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Technical Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-technical-level">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="basic">Basic - I need guidance</SelectItem>
                            <SelectItem value="intermediate">Intermediate - Some experience</SelectItem>
                            <SelectItem value="advanced">Advanced - I'm technical</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                <Button 
                  type="submit" 
                  disabled={isExtracting || !form.getValues().userDescription?.trim()}
                  className="w-full"
                  data-testid="button-extract-goals"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing with AI...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      Extract Goals with AI
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>

        {/* Extracted Goals Section */}
        {extractedGoals.length > 0 && (
          <Card data-testid="card-extracted-goals">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Extracted Goals
                {aiProvider && (
                  <Badge variant="secondary" className="ml-2">
                    Powered by {aiProvider}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                AI identified {extractedGoals.length} key goals from your description
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {extractedGoals.map((goal, index) => (
                  <div key={index} className="border rounded-lg p-4" data-testid={`goal-${index}`}>
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{goal.goal}</h4>
                      <div className="flex gap-2">
                        <Badge 
                          variant={goal.priority === 'high' ? 'default' : 'secondary'}
                          className={goal.priority === 'high' ? 'bg-red-100 text-red-800' : ''}
                        >
                          {goal.priority} priority
                        </Badge>
                        <Badge variant="outline">{goal.category}</Badge>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">{goal.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Business Questions Section */}
        {businessQuestions.length > 0 && (
          <Card data-testid="card-business-questions">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                Key Business Questions
              </CardTitle>
              <CardDescription>
                Questions your analysis should answer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {businessQuestions.map((question, index) => (
                  <div key={index} className="flex items-start space-x-3" data-testid={`question-${index}`}>
                    <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">{question.question}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className={getComplexityColor(question.complexity)}>
                          {question.complexity}
                        </Badge>
                        <Badge variant="secondary">{question.type}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Suggested Analysis Paths */}
        {suggestedPaths.length > 0 && (
          <Card data-testid="card-analysis-paths">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Recommended Analysis Approaches
              </CardTitle>
              <CardDescription>
                Select the analysis methods that best fit your goals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {suggestedPaths.map((path, index) => (
                  <div 
                    key={index}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedPaths.includes(path.name) 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handlePathToggle(path.name)}
                    data-testid={`path-${index}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <Checkbox
                          checked={selectedPaths.includes(path.name)}
                          onChange={() => {}} // Handled by parent click
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getAnalysisTypeIcon(path.type)}
                            <h4 className="font-medium text-gray-900">{path.name}</h4>
                            <Badge className={getComplexityColor(path.complexity)}>
                              {path.complexity}
                            </Badge>
                          </div>
                          <p className="text-gray-600 text-sm mb-2">{path.description}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {path.estimatedDuration}
                            </span>
                            <span className="flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {path.confidence}% confidence
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {selectedPaths.includes(path.name) && (
                      <div className="mt-3 pt-3 border-t border-blue-200 bg-blue-25">
                        <div className="text-sm">
                          <div className="mb-2">
                            <span className="font-medium text-blue-900">Expected Outcomes:</span>
                            <ul className="list-disc list-inside text-blue-700 mt-1">
                              {path.expectedOutcomes.map((outcome, i) => (
                                <li key={i}>{outcome}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <span className="font-medium text-blue-900">Required Features:</span>
                            <div className="flex gap-1 mt-1">
                              {path.requiredFeatures.map((feature) => (
                                <Badge key={feature} variant="secondary" className="text-xs">
                                  {feature.replace('_', ' ')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedPaths.length > 0 && (
                <Alert className="mt-4">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    You've selected {selectedPaths.length} analysis approach{selectedPaths.length > 1 ? 'es' : ''}. 
                    These will guide your data preparation and analysis steps.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Next Steps Information */}
        {selectedPaths.length > 0 && (
          <Card className="bg-green-50 border-green-200" data-testid="card-next-steps">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-900">
                <CheckCircle className="w-5 h-5" />
                Analysis Plan Ready
              </CardTitle>
              <CardDescription className="text-green-700">
                Your analysis goals and approach have been defined. Features and pricing will be determined in later steps based on your data requirements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-900">Selected Analysis Approaches:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedPaths.map((path) => (
                    <Badge key={path} variant="secondary" className="bg-green-100 text-green-800">
                      {path}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end">
          <Button 
            onClick={handleProceedToDataStep}
            disabled={selectedPaths.length === 0}
            size="lg"
            data-testid="button-proceed-data"
          >
            Continue to Project Setup
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

    </div>
  );
}