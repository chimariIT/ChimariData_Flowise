import { useState } from "react";
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
  };
}

export function FreeTrialWorkflow({ onComplete, onBack }: FreeTrialWorkflowProps) {
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

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateWorkflowStep = (stepId: string, data: any) => {
    setWorkflowState(prev => {
      const currentIndex = prev.steps.findIndex(s => s.id === stepId);
      const nextIndex = Math.min(currentIndex + 1, prev.steps.length - 1);
      const nextStep = prev.steps[nextIndex];

      return {
        ...prev,
        currentStep: nextStep.id,
        stepIndex: nextIndex,
        steps: prev.steps.map((step, index) => ({
          ...step,
          completed: index <= currentIndex
        })),
        data: { ...prev.data, ...data }
      };
    });
  };

  const handleQuestionsSubmit = async (questions: string[], analysisType: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Simulate processing without authentication
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateWorkflowStep('questions', { questions, analysisType });
    } catch (err) {
      setError('Failed to save questions. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadComplete = async (uploadInfo: any) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Validate file size for free trial (limit to 10MB)
      if (uploadInfo.size && uploadInfo.size > 10 * 1024 * 1024) {
        setError('Free trial is limited to files under 10MB. Please upgrade for larger files.');
        setIsProcessing(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      updateWorkflowStep('upload', { uploadInfo });
    } catch (err) {
      setError('Failed to process upload. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanComplete = async (scanResult: any) => {
    setIsProcessing(true);
    setError(null);

    try {
      if (!scanResult.clean) {
        setError('Security scan failed. Please upload a different file.');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      updateWorkflowStep('scan', { scanResult });
    } catch (err) {
      setError('Failed to complete security scan. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderCurrentStep = () => {
    const { currentStep, data } = workflowState;

    switch (currentStep) {
      case 'questions':
        return (
          <div className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <Gift className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                <strong className="text-blue-800">Free Trial Mode</strong>
                <div className="text-sm mt-1">
                  You're using our free trial. No account required! Limited to basic analysis and 10MB files.
                </div>
              </AlertDescription>
            </Alert>
            <QuestionCollection
              serviceType="free_trial"
              onQuestionsSubmit={handleQuestionsSubmit}
              isLoading={isProcessing}
            />
          </div>
        );

      case 'upload':
        return (
          <div className="space-y-4">
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription>
                <strong className="text-orange-800">File Size Limit</strong>
                <div className="text-sm mt-1">
                  Free trial is limited to files under 10MB. Upgrade for larger files and advanced features.
                </div>
              </AlertDescription>
            </Alert>
            <MultiSourceUpload
              onUploadComplete={handleUploadComplete}
              maxSize={10 * 1024 * 1024} // 10MB limit
              isLoading={isProcessing}
              isFreeTrialMode={true}
            />
          </div>
        );

      case 'scan':
        return (
          <SecurityScan
            uploadId={123}
            filename={data.uploadInfo?.filename || 'uploaded_file.csv'}
            onScanComplete={handleScanComplete}
            isScanning={true}
          />
        );

      case 'schema':
        return (
          <SchemaAnalysis
            uploadId={456}
            filename={data.uploadInfo?.filename || 'uploaded_file.csv'}
            onAnalysisComplete={(schemaData) => {
              updateWorkflowStep('schema', { schemaData });
            }}
            isAnalyzing={true}
          />
        );

      case 'analysis':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-orange-600" />
                <span>Free Trial Analysis</span>
              </CardTitle>
              <CardDescription>
                Running basic analysis with free trial limitations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert className="border-blue-200 bg-blue-50">
                  <Gift className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <strong className="text-blue-800">Free Trial Features</strong>
                    <div className="text-sm mt-2 space-y-1">
                      <div>• Basic descriptive statistics</div>
                      <div>• Simple data visualizations</div>
                      <div>• Column summaries and data quality</div>
                      <div>• Limited to 1,000 records analysis</div>
                    </div>
                  </AlertDescription>
                </Alert>
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
                  <span>Running free trial analysis...</span>
                </div>
                <div className="text-sm text-slate-600">
                  Processing {data.questions?.length || 0} questions with basic analysis features
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'complete':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span>Free Trial Complete</span>
              </CardTitle>
              <CardDescription>
                Your basic analysis is ready for review
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <strong className="text-green-800">Trial Analysis Complete!</strong>
                    <div className="text-sm mt-1">
                      You've experienced our basic analysis capabilities. Upgrade for advanced features.
                    </div>
                  </AlertDescription>
                </Alert>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <Button onClick={() => onComplete?.(workflowState.data)} className="w-full">
                    View Trial Results
                  </Button>
                  <Button variant="outline" className="w-full bg-blue-600 text-white hover:bg-blue-700">
                    Upgrade for Full Features
                  </Button>
                </div>

                <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                  <h4 className="font-medium text-slate-900 mb-2">Upgrade Benefits</h4>
                  <div className="text-sm text-slate-600 space-y-1">
                    <div>• Advanced ML analysis and predictions</div>
                    <div>• Unlimited file size and record count</div>
                    <div>• Multiple AI providers and models</div>
                    <div>• Custom visualizations and reports</div>
                    <div>• Priority support and faster processing</div>
                  </div>
                </div>
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
            <div className="space-y-6">
              {/* Error Display */}
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription>
                    <strong className="text-red-800">Error:</strong> {error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Current Step Content */}
              {renderCurrentStep()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}