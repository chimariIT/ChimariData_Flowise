import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { 
  FolderOpen, 
  Target, 
  CheckCircle, 
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Database,
  Brain,
  Clock,
  Users,
  Lightbulb
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProjectSetupStepProps {
  journeyType: string;
}

interface AnalysisApproach {
  id: string;
  name: string;
  description: string;
  complexity: "basic" | "intermediate" | "advanced";
  estimatedTime: string;
  dataRequirements: string[];
  icon: any;
  confidence: number;
}

export default function ProjectSetupStep({ journeyType }: ProjectSetupStepProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Mock data - in real implementation, this would come from previous step or API
  const [extractedGoals] = useState([
    { goal: "Identify customer churn patterns", category: "Customer Analytics", priority: "high" },
    { goal: "Predict high-risk customers", category: "Predictive Modeling", priority: "high" },
    { goal: "Analyze usage behavior trends", category: "Behavioral Analysis", priority: "medium" }
  ]);

  const [suggestedApproaches] = useState<AnalysisApproach[]>([
    {
      id: "statistical-analysis",
      name: "Statistical Analysis",
      description: "Correlation analysis, hypothesis testing, and descriptive statistics to identify churn patterns",
      complexity: "basic",
      estimatedTime: "2-4 hours",
      dataRequirements: ["Customer demographics", "Usage history", "Subscription data"],
      icon: BarChart3,
      confidence: 85
    },
    {
      id: "machine-learning",
      name: "Machine Learning Model",
      description: "Predictive modeling using classification algorithms to identify at-risk customers",
      complexity: "advanced",
      estimatedTime: "4-6 hours",
      dataRequirements: ["Customer features", "Historical churn data", "Behavioral metrics"],
      icon: Brain,
      confidence: 92
    },
    {
      id: "cohort-analysis",
      name: "Cohort Analysis",
      description: "Time-based analysis to understand customer behavior patterns over time",
      complexity: "intermediate",
      estimatedTime: "3-5 hours",
      dataRequirements: ["Time-series data", "Customer journey data", "Event tracking"],
      icon: Clock,
      confidence: 78
    }
  ]);

  const [selectedApproaches, setSelectedApproaches] = useState<string[]>(["statistical-analysis"]);
  const [projectCreated, setProjectCreated] = useState(false);

  const handleApproachToggle = (approachId: string) => {
    setSelectedApproaches(prev => 
      prev.includes(approachId) 
        ? prev.filter(id => id !== approachId)
        : [...prev, approachId]
    );
  };

  const handleCreateProject = () => {
    if (selectedApproaches.length === 0) {
      toast({
        title: "Select Analysis Approach",
        description: "Please select at least one analysis approach to continue.",
        variant: "destructive",
      });
      return;
    }

    // Mock project creation logic
    setProjectCreated(true);
    
    toast({
      title: "Project Created",
      description: "Your analysis project has been created with the selected approaches.",
    });
  };

  const handleContinueToData = () => {
    if (!projectCreated) {
      handleCreateProject();
      return;
    }

    // Navigate to data step
    setLocation(`/journeys/${journeyType}/data`);
  };

  const handleBackToPrepare = () => {
    setLocation(`/journeys/${journeyType}/prepare`);
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'basic': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6" data-testid="project-setup-step">
        
      {/* Header */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <FolderOpen className="w-6 h-6" />
            Project Setup & Requirements
          </CardTitle>
          <CardDescription className="text-blue-700">
            Create your analysis project and confirm the approach based on your defined goals
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Analysis Goals Summary */}
      <Card data-testid="card-goals-summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Your Analysis Goals
          </CardTitle>
          <CardDescription>
            Goals identified from your requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {extractedGoals.map((goal, index) => (
              <div key={index} className="flex items-start justify-between p-3 border rounded-lg" data-testid={`goal-summary-${index}`}>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{goal.goal}</h4>
                  <p className="text-sm text-gray-600">{goal.category}</p>
                </div>
                <Badge 
                  variant={goal.priority === 'high' ? 'default' : 'secondary'}
                  className={goal.priority === 'high' ? 'bg-red-100 text-red-800' : ''}
                >
                  {goal.priority} priority
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommended Analysis Approaches */}
      <Card data-testid="card-analysis-approaches">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-purple-600" />
            Recommended Analysis Approaches
          </CardTitle>
          <CardDescription>
            Select the analysis methods that best align with your goals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {suggestedApproaches.map((approach) => {
              const Icon = approach.icon;
              const isSelected = selectedApproaches.includes(approach.id);
              
              return (
                <div 
                  key={approach.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleApproachToggle(approach.id)}
                  data-testid={`approach-${approach.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-gray-900">{approach.name}</h4>
                          <Badge className={getComplexityColor(approach.complexity)}>
                            {approach.complexity}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {approach.confidence}% confidence
                          </Badge>
                        </div>
                        <p className="text-gray-600 text-sm mb-3">{approach.description}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {approach.estimatedTime}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                  
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <div className="text-sm">
                        <div>
                          <span className="font-medium text-blue-900">Data Requirements:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {approach.dataRequirements.map((req) => (
                              <Badge key={req} variant="secondary" className="text-xs">
                                {req}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedApproaches.length > 0 && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                You've selected {selectedApproaches.length} analysis approach{selectedApproaches.length > 1 ? 'es' : ''}. 
                These will guide your data requirements and analysis execution.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Project Creation Status */}
      {projectCreated && (
        <Card className="bg-green-50 border-green-200" data-testid="card-project-created">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Project Created Successfully
            </CardTitle>
            <CardDescription className="text-green-700">
              Your analysis project is ready. You can now proceed to data preparation.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button 
          variant="outline"
          onClick={handleBackToPrepare}
          data-testid="button-back-prepare"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Preparation
        </Button>
        
        <Button 
          onClick={handleContinueToData}
          disabled={selectedApproaches.length === 0}
          size="lg"
          data-testid="button-continue-data"
        >
          {projectCreated ? 'Continue to Data Preparation' : 'Create Project & Continue'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

    </div>
  );
}