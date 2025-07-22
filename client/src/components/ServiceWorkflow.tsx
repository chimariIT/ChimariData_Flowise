import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  BarChart3
} from "lucide-react";

interface ServiceWorkflowProps {
  serviceType: 'pay_per_analysis' | 'expert_consulting' | 'automated_analysis' | 'enterprise';
  projectId?: string;
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

export function ServiceWorkflow({ 
  serviceType, 
  projectId, 
  onComplete, 
  onBack 
}: ServiceWorkflowProps) {
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    currentStep: 'questions',
    stepIndex: 0,
    steps: [
      { id: 'questions', title: 'Analysis Questions', description: 'Define your analysis objectives', required: true, completed: false },
      { id: 'upload', title: 'Data Upload', description: 'Upload from multiple sources', required: true, completed: false },
      { id: 'scan', title: 'Security Scan', description: 'Malware and security validation', required: true, completed: false },
      { id: 'schema', title: 'Schema Analysis', description: 'Data structure detection', required: true, completed: false },
      { id: 'analysis', title: 'Analysis', description: 'Execute data analysis', required: true, completed: false },
      { id: 'complete', title: 'Results', description: 'Review and download', required: false, completed: false }
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
      // Here you would call your API to save questions
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
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
      // Check if project was created successfully
      if (uploadInfo.success && uploadInfo.projectId) {
        // Navigate directly to project page
        if (onComplete) {
          onComplete({
            projectId: uploadInfo.projectId,
            ...uploadInfo
          });
        }
        return;
      }
      
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

      // Here you would call your API to update scan status
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
      
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
          <QuestionCollection
            serviceType={serviceType}
            onQuestionsSubmit={handleQuestionsSubmit}
            isLoading={isProcessing}
          />
        );

      case 'upload':
        return (
          <MultiSourceUpload
            onComplete={handleUploadComplete}
            isLoading={isProcessing}
            serviceType="automated_analysis"
          />
        );

      case 'scan':
        return (
          <SecurityScan
            uploadId={123} // This would come from upload step
            filename={data.uploadInfo?.filename || 'uploaded_file.csv'}
            onScanComplete={handleScanComplete}
            isScanning={true}
          />
        );

      case 'schema':
        return (
          <SchemaAnalysis
            uploadId={456} // This would come from upload step
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
                <span>Data Analysis</span>
              </CardTitle>
              <CardDescription>
                Executing {serviceType.replace('_', ' ')} analysis on your data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
                  <span>Running analysis...</span>
                </div>
                <Progress value={45} />
                <div className="text-sm text-slate-600">
                  Processing {data.questions?.length || 0} questions using {data.analysisType || 'standard'} analysis
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
                <span>Analysis Complete</span>
              </CardTitle>
              <CardDescription>
                Your analysis is ready for review and download
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <strong className="text-green-800">Success!</strong> Your analysis has been completed successfully.
                  </AlertDescription>
                </Alert>
                <div className="flex space-x-3">
                  <Button onClick={() => onComplete?.(workflowState.data)}>
                    View Results
                  </Button>
                  <Button variant="outline">
                    Download Report
                  </Button>
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
            <Badge variant="outline" className="capitalize">
              {serviceType.replace('_', ' ')}
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
              serviceType={serviceType}
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