import { useState, useEffect } from "react";
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

  // Auto-advance through workflow steps using useEffect
  useEffect(() => {
    const { currentStep, data } = workflowState;
    
    if (currentStep === 'scan' && data.uploadInfo && !isProcessing && !data.scanResult) {
      handleScanComplete({});
    }
    
    if (currentStep === 'schema' && data.scanResult && !isProcessing && !data.schemaData) {
      handleSchemaComplete({});
    }
  }, [workflowState.currentStep, workflowState.data, isProcessing]);

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

      // Check if PII was detected and handled
      if (uploadInfo.piiHandled) {
        // Add PII information to upload info
        uploadInfo.piiDetected = true;
        uploadInfo.anonymized = uploadInfo.anonymizationApplied || false;
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
      // For free trial, simulate a successful scan
      const mockScanResult = {
        clean: true,
        threats: 0,
        scanTime: Date.now(),
        details: 'File passed security validation'
      };

      await new Promise(resolve => setTimeout(resolve, 1500));
      updateWorkflowStep('scan', { scanResult: mockScanResult });
    } catch (err) {
      setError('Failed to complete security scan. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSchemaComplete = async (schemaData: any) => {
    setIsProcessing(true);
    setError(null);

    try {
      // For free trial, simulate schema analysis
      const mockSchemaData = {
        columns: [
          { name: 'id', type: 'integer', summary: 'Unique identifier' },
          { name: 'name', type: 'text', summary: 'Name field' },
          { name: 'value', type: 'numeric', summary: 'Numeric value' },
          { name: 'date', type: 'date', summary: 'Date field' }
        ],
        rowCount: Math.floor(Math.random() * 1000) + 100,
        insights: ['4 columns detected', 'Mixed data types', 'No missing values found']
      };

      await new Promise(resolve => setTimeout(resolve, 2000));
      updateWorkflowStep('schema', { schemaData: mockSchemaData });
    } catch (err) {
      setError('Failed to analyze data schema. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnalysisComplete = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Simulate analysis processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const analysisResults = {
        basicStats: {
          totalRecords: workflowState.data.schemaData?.rowCount || 250,
          completeness: '95%',
          qualityScore: 'Good'
        },
        insights: [
          'Data quality is good with minimal missing values',
          'Numeric columns show normal distribution',
          'Date range spans 6 months',
          'Top category represents 35% of records'
        ],
        recommendations: [
          'Consider data validation for improved quality',
          'Monitor trends in the value column',
          'Explore seasonal patterns in date field'
        ]
      };

      updateWorkflowStep('analysis', { analysisResults });
    } catch (err) {
      setError('Failed to complete analysis. Please try again.');
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-green-600" />
                <span>Security Scan</span>
              </CardTitle>
              <CardDescription>
                Scanning {data.uploadInfo?.filename || 'your file'} for security threats
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                  <span>Analyzing file for malware and security issues...</span>
                </div>
                <div className="text-sm text-slate-600">
                  Free trial includes basic security validation
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'schema':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-blue-600" />
                <span>Data Schema Analysis</span>
              </CardTitle>
              <CardDescription>
                Analyzing data structure and column types for {data.uploadInfo?.filename || 'your file'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span>Detecting columns and data types...</span>
                </div>
                <div className="text-sm text-slate-600">
                  Generating column summaries and quality metrics
                </div>
              </div>
            </CardContent>
          </Card>
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
                {!workflowState.data.analysisResults && (
                  <Button 
                    onClick={handleAnalysisComplete}
                    className="w-full mt-4"
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Start Analysis'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 'complete':
        const analysisData = workflowState.data.analysisResults;
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>Free Trial Analysis Complete</span>
                </CardTitle>
                <CardDescription>
                  Your basic analysis results are ready for review
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      <strong className="text-green-800">Analysis Complete!</strong>
                      <div className="text-sm mt-1">
                        Here's what we found in your data with our free trial features.
                      </div>
                    </AlertDescription>
                  </Alert>

                  {analysisData && (
                    <div className="space-y-4">
                      <div className="grid md:grid-cols-3 gap-4">
                        <div className="p-3 bg-blue-50 rounded-lg text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {analysisData.basicStats?.totalRecords}
                          </div>
                          <div className="text-sm text-blue-700">Total Records</div>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {analysisData.basicStats?.completeness}
                          </div>
                          <div className="text-sm text-green-700">Data Completeness</div>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-lg text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {analysisData.basicStats?.qualityScore}
                          </div>
                          <div className="text-sm text-orange-700">Quality Score</div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-lg">
                        <h4 className="font-medium text-slate-900 mb-2">Key Insights</h4>
                        <ul className="text-sm text-slate-600 space-y-1">
                          {analysisData.insights?.map((insight: string, idx: number) => (
                            <li key={idx}>• {insight}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-medium text-blue-900 mb-2">Recommendations</h4>
                        <ul className="text-sm text-blue-700 space-y-1">
                          {analysisData.recommendations?.map((rec: string, idx: number) => (
                            <li key={idx}>• {rec}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid md:grid-cols-2 gap-4 mt-6">
                    <Button onClick={() => onComplete?.(workflowState.data)} className="w-full">
                      Download Trial Report
                    </Button>
                    <Button variant="outline" className="w-full bg-blue-600 text-white hover:bg-blue-700">
                      Upgrade for Advanced Analysis
                    </Button>
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-slate-900 mb-2">🚀 Upgrade Benefits</h4>
                    <div className="text-sm text-slate-600 space-y-1">
                      <div>• Advanced ML predictions and forecasting</div>
                      <div>• Unlimited file size and record processing</div>
                      <div>• Multiple AI providers (GPT-4, Claude, Gemini)</div>
                      <div>• Interactive visualizations and dashboards</div>
                      <div>• Custom analysis workflows and automation</div>
                      <div>• Priority support and faster processing</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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