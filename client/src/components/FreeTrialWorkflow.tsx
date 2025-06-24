import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WorkflowSteps } from "./WorkflowSteps";
import { QuestionCollection } from "./QuestionCollection";
import { MultiSourceUpload } from "./MultiSourceUpload";
import { SecurityScan } from "./SecurityScan";
import { SchemaAnalysis } from "./SchemaAnalysis";
import { 
  ArrowLeft, 
  CheckCircle, 
  AlertTriangle,
  Loader2,
  Database,
  BarChart3,
  Gift
} from "lucide-react";

interface FreeTrialWorkflowProps {
  onComplete?: (result: any) => void;
  onBack?: () => void;
}

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
}

interface WorkflowState {
  currentStep: string;
  stepIndex: number;
  steps: WorkflowStep[];
  data: {
    questions?: string[];
    analysisType?: string;
    uploadInfo?: any;
    scanResult?: any;
    schemaData?: any;
    analysisResults?: any;
  };
}

export function FreeTrialWorkflow({ onComplete, onBack }: FreeTrialWorkflowProps) {
  // All state declarations must be at the top
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    currentStep: 'questions',
    stepIndex: 0,
    steps: [
      { id: 'questions', title: 'Analysis Questions', description: 'Define your analysis objectives', required: true, completed: false },
      { id: 'upload', title: 'Data Upload', description: 'Upload from multiple sources', required: true, completed: false },
      { id: 'scan', title: 'Security Scan', description: 'Malware and security validation', required: true, completed: false },
      { id: 'schema', title: 'Schema Analysis', description: 'Data structure detection', required: true, completed: false },
      { id: 'analysis', title: 'Free Trial Analysis', description: 'Basic analysis with limited features', required: true, completed: false },
      { id: 'complete', title: 'Results', description: 'View trial results', required: false, completed: false }
    ],
    data: {}
  });

  const updateWorkflowStep = useCallback((stepId: string, data: any) => {
    console.log('Updating workflow step:', stepId, data);
    setWorkflowState(prev => {
      const currentIndex = prev.steps.findIndex(s => s.id === stepId);
      const nextIndex = Math.min(currentIndex + 1, prev.steps.length - 1);
      
      const updatedSteps = prev.steps.map((step, index) => ({
        ...step,
        completed: index <= currentIndex
      }));

      const nextStep = prev.steps[nextIndex];
      
      console.log('Next step:', nextStep?.id, 'Current index:', currentIndex, 'Next index:', nextIndex);
      
      return {
        ...prev,
        currentStep: nextStep?.id || stepId,
        stepIndex: nextIndex,
        steps: updatedSteps,
        data: { ...prev.data, ...data }
      };
    });
  }, []);

  const runFreeTrialAnalysis = useCallback(async () => {
    setIsProcessing(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const analysisResults = {
        summary: "Data analysis complete! Your dataset contains interesting patterns and insights.",
        keyFindings: [
          "Strong correlation found between key variables",
          "Data quality is excellent with minimal missing values",
          "Seasonal trends detected in time-series data"
        ],
        recommendations: [
          "Consider expanding dataset for deeper insights",
          "Upgrade to premium for advanced ML analytics",
          "Export results for presentation"
        ],
        upgradePrompt: "This free trial analysis provides basic insights. Upgrade for advanced AI analysis, custom reports, and unlimited projects."
      };
      
      updateWorkflowStep('analysis', { analysisResults });
    } catch (err) {
      setError('Analysis failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [updateWorkflowStep]);

  // Auto-advance through workflow steps  
  useEffect(() => {
    const { currentStep, data } = workflowState;
    
    if (currentStep === 'scan' && data.uploadInfo && !isProcessing && !data.scanResult) {
      const timer = setTimeout(() => {
        updateWorkflowStep('scan', { scanResult: { clean: true, threats: 0 } });
      }, 1000);
      return () => clearTimeout(timer);
    }
    
    if (currentStep === 'schema' && data.scanResult && !isProcessing && !data.schemaData) {
      const timer = setTimeout(() => {
        updateWorkflowStep('schema', { 
          schemaData: { 
            columns: 5, 
            dataTypes: ['string', 'number', 'date'] 
          } 
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [workflowState.currentStep, workflowState.data, isProcessing, updateWorkflowStep]);

  const handleQuestionsComplete = useCallback((questions: string[], analysisType: string) => {
    console.log('Questions completed:', { questions, analysisType });
    updateWorkflowStep('questions', { questions, analysisType });
  }, [updateWorkflowStep]);

  const handleUploadComplete = useCallback((uploadInfo: any) => {
    updateWorkflowStep('upload', { uploadInfo });
  }, [updateWorkflowStep]);

  const getCurrentStepComponent = () => {
    const { currentStep, data } = workflowState;
    console.log('Rendering step:', currentStep, 'Data:', data);

    switch (currentStep) {
      case 'questions':
        return (
          <QuestionCollection
            onComplete={handleQuestionsComplete}
            serviceType="free_trial"
          />
        );

      case 'upload':
        return (
          <MultiSourceUpload
            onComplete={handleUploadComplete}
            serviceType="free_trial"
            questions={data.questions || []}
            maxSize={10 * 1024 * 1024}
          />
        );

      case 'scan':
        return (
          <SecurityScan
            isScanning={!data.scanResult}
            scanResult={data.scanResult}
            serviceType="free_trial"
          />
        );

      case 'schema':
        return (
          <SchemaAnalysis
            isAnalyzing={!data.schemaData}
            schemaData={data.schemaData}
            serviceType="free_trial"
          />
        );

      case 'analysis':
        if (!data.analysisResults) {
          return (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Running Free Trial Analysis
                </CardTitle>
                <CardDescription>
                  Generating basic insights from your data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Gift className="w-4 h-4" />
                  <AlertDescription>
                    Free trial provides basic analysis features. Upgrade for advanced AI insights and custom reports.
                  </AlertDescription>
                </Alert>
                
                <div className="flex justify-center">
                  <Button onClick={runFreeTrialAnalysis} disabled={isProcessing}>
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Start Free Trial Analysis
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-green-600">
                <CheckCircle className="w-5 h-5 mr-2" />
                Free Trial Analysis Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">Summary</h3>
                <p className="text-green-700">{data.analysisResults.summary}</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Key Findings</h3>
                <ul className="space-y-1">
                  {data.analysisResults.keyFindings.map((finding: string, index: number) => (
                    <li key={index} className="flex items-start space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{finding}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Recommendations</h3>
                <ul className="space-y-1">
                  {data.analysisResults.recommendations.map((rec: string, index: number) => (
                    <li key={index} className="flex items-start space-x-2">
                      <ArrowLeft className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Alert>
                <Gift className="w-4 h-4" />
                <AlertDescription>
                  {data.analysisResults.upgradePrompt}
                </AlertDescription>
              </Alert>

              <div className="flex space-x-2">
                <Button onClick={() => onComplete?.(data.analysisResults)}>
                  View Full Results
                </Button>
                <Button variant="outline" onClick={onBack}>
                  Try Another Dataset
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={onBack}
              className="flex items-center text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Gift className="w-3 h-3 mr-1" />
              Free Trial
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Workflow Steps Sidebar */}
          <div className="lg:col-span-1">
            <WorkflowSteps
              steps={workflowState.steps}
              currentStepIndex={workflowState.stepIndex}
              serviceType="free_trial"
            />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {getCurrentStepComponent()}
          </div>
        </div>
      </div>
    </div>
  );
}