import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File as FileIcon, X, Check, BarChart3, Database, Crown, CreditCard, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { UpgradeModal } from "./upgrade-modal";
import { FreeTrialPIIDialog } from "./FreeTrialPIIDialog";
import { useLocation } from 'wouter';

export default function FreeTrialUploader() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [piiDialogData, setPIIDialogData] = useState<any>(null);

  // Hoisted helper to avoid use-before-declaration errors
  function renderUpgradePrompt() {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            Unlock Full ChimariData Power
          </CardTitle>
          <CardDescription>
            Save this analysis, explore all visualizations, run advanced models, and collaborate with your team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-purple-600 mt-1" />
              <div>
                <div className="font-medium">Advanced Analytics</div>
                <div className="text-sm text-gray-600">Run regressions, clustering, forecasting, and more.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-1" />
              <div>
                <div className="font-medium">Save & Share</div>
                <div className="text-sm text-gray-600">Persist projects, version artifacts, and collaborate.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-blue-600 mt-1" />
              <div>
                <div className="font-medium">Flexible Pricing</div>
                <div className="text-sm text-gray-600">Start free, upgrade anytime with subscription or pay-as-you-go.</div>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowUpgrade(true)} className="bg-blue-600 hover:bg-blue-700">
              Upgrade to Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: "Trial is limited to 10MB files",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      setResults(null);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    disabled: isProcessing
  });

  const handleTrialUpload = async () => {
    if (!selectedFile) return;

    console.log('🚀 Starting trial upload for file:', selectedFile.name);
    setIsProcessing(true);
    try {
      console.log('📡 Calling uploadTrialFile...');
      const result = await apiClient.uploadTrialFile(selectedFile);
      console.log('📥 Upload result received:', result);
      
      if (result.success) {
        console.log('✅ Upload successful');
        // Check for PII detection
        if (result.requiresPIIDecision) {
          console.log('🔍 PII decision required, showing dialog');
          console.log('📋 PII data:', result.piiResult);
          setPIIDialogData({
            file: selectedFile,
            result: result,
            isTrial: true
          });
          setShowPIIDialog(true);
          setIsProcessing(false); // Reset processing state when showing PII dialog
          console.log('🎭 PII dialog shown, processing state reset');
          return;
        }
        
        if (result.trialResults) {
          console.log('📊 Setting trial results:', result.trialResults);
          setResults(result.trialResults);
          toast({
            title: "Trial analysis complete!",
            description: "Your data has been processed successfully",
          });
        }
      } else {
        console.error('❌ Upload failed:', result.error);
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('🚨 Upload error:', error);
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : 'Upload failed',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      console.log('🔄 Processing state reset in finally block');
    }
  };

  const handleProceedWithPII = async () => {
    if (!piiDialogData) return;
    
    try {
      console.log('🔐 Starting PII decision processing');
      setIsProcessing(true);
      setShowPIIDialog(false); // Close dialog immediately when processing starts
      console.log('🎭 PII dialog closed, processing started');
      
      // For trial uploads, proceed with PII data included
      const requestData = {
        tempFileId: piiDialogData.result.tempFileId,
        decision: 'include' // Simple: include PII data in analysis
      };

      console.log('📡 Sending PII decision request:', requestData);
      
      // Use a more robust timeout and error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for Python processing
      
      const response = await fetch('/api/trial-pii-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('📡 PII decision response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('📥 PII decision result received:', {
        success: result.success,
        hasTrialResults: !!result.trialResults,
        trialResultsKeys: result.trialResults ? Object.keys(result.trialResults) : []
      });
      
      if (result.success && result.trialResults) {
        console.log('✅ PII decision successful, setting results');
        console.log('📊 Trial results received:', {
          schema: result.trialResults.schema ? Object.keys(result.trialResults.schema) : 'missing',
          analysis: result.trialResults.descriptiveAnalysis ? Object.keys(result.trialResults.descriptiveAnalysis) : 'missing',
          visualizations: result.trialResults.basicVisualizations ? result.trialResults.basicVisualizations.length : 0
        });
        
        // Clear dialog data and set results
        setPIIDialogData(null);
        setResults(result.trialResults);
        
        // Ensure the component stays on the page to show results
        console.log('📊 Trial results set successfully');
        
        toast({
          title: "Trial analysis complete!",
          description: "Analysis completed with PII data included",
        });
      } else {
        console.error('❌ PII decision failed:', result.error);
        console.error('❌ Full result object:', result);
        throw new Error(result.error || 'Processing failed');
      }
    } catch (error) {
      console.error('🚨 PII decision error:', error);
      
      // Handle timeout errors specifically
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast({
          title: "Processing timeout",
          description: "The analysis is taking longer than expected. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Processing failed",
          description: error instanceof Error ? error.message : "Failed to process trial analysis",
          variant: "destructive",
        });
      }
    } finally {
      setIsProcessing(false);
      console.log('🔄 PII processing state reset');
    }
  };

  const handleSignUp = () => {
    // Close the dialog and navigate to sign up
    setShowPIIDialog(false);
    setPIIDialogData(null);
    setIsProcessing(false);
    // Navigate to sign up page
    setLocation('/auth/register');
  };

  const handleCancelUpload = () => {
    // Close the dialog and reset everything
    setShowPIIDialog(false);
    setPIIDialogData(null);
    setSelectedFile(null);
    setResults(null);
    setIsProcessing(false);
    // Don't navigate away - just reset to initial state
    console.log('🔄 Upload cancelled, reset to initial state');
  };

  const removeFile = () => {
    setSelectedFile(null);
    setResults(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderSchema = (schema: any) => {
    if (!schema || Object.keys(schema).length === 0) return null;

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="w-5 h-5" />
            Data Schema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {Object.entries(schema).slice(0, 8).map(([fieldName, fieldInfo]: [string, any]) => (
              <div key={fieldName} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">{fieldName}</h4>
                  {fieldInfo.sampleValues && (
                    <p className="text-sm text-gray-500 mt-1">
                      Sample: {fieldInfo.sampleValues.slice(0, 2).join(', ')}
                    </p>
                  )}
                </div>
                <Badge variant="outline">{fieldInfo.type}</Badge>
              </div>
            ))}
            {Object.keys(schema).length > 8 && (
              <p className="text-sm text-gray-500 text-center">
                ...and {Object.keys(schema).length - 8} more columns
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderAnalysis = (analysis: any) => {
    if (!analysis || !analysis.descriptive_analysis) return null;

    const { basic_info, numerical_summary, insights } = analysis.descriptive_analysis;

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="w-5 h-5" />
            Descriptive Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{basic_info.shape[0]}</div>
              <div className="text-sm text-gray-600">Rows</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{basic_info.shape[1]}</div>
              <div className="text-sm text-gray-600">Columns</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {Object.values(basic_info.missing_values || {}).reduce<number>((a, b) => Number(a) + Number(b as any), 0)}
              </div>
              <div className="text-sm text-gray-600">Missing Values</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {Math.round(basic_info.memory_usage / 1024)} KB
              </div>
              <div className="text-sm text-gray-600">Memory</div>
            </div>
          </div>

          {/* Insights */}
          {insights && insights.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Key Insights</h4>
              <ul className="space-y-1">
                {insights.map((insight: string, index: number) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Numerical Summary (first 3 columns) */}
          {numerical_summary && Object.keys(numerical_summary).length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Numerical Statistics</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Column</th>
                      <th className="text-left p-2">Mean</th>
                      <th className="text-left p-2">Std Dev</th>
                      <th className="text-left p-2">Min</th>
                      <th className="text-left p-2">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(numerical_summary).slice(0, 3).map(([col, stats]: [string, any]) => (
                      <tr key={col} className="border-b">
                        <td className="p-2 font-medium">{col}</td>
                        <td className="p-2">{stats.mean?.toFixed(2) || 'N/A'}</td>
                        <td className="p-2">{stats.std?.toFixed(2) || 'N/A'}</td>
                        <td className="p-2">{stats.min?.toFixed(2) || 'N/A'}</td>
                        <td className="p-2">{stats.max?.toFixed(2) || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderVisualizations = (visualizations: any[]) => {
    if (!visualizations || visualizations.length === 0) return null;

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Basic Visualizations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {visualizations.map((viz, index) => (
              <div key={index} className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">{viz.title}</h4>
                <img 
                  src={`data:image/png;base64,${viz.image}`} 
                  alt={viz.title}
                  className="w-full h-auto rounded"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (results) {
    console.log('🎨 Rendering results page with:', {
      hasSchema: !!results.schema,
      hasAnalysis: !!results.descriptiveAnalysis,
      hasVisualizations: !!results.basicVisualizations,
      schemaKeys: results.schema ? Object.keys(results.schema) : [],
      analysisKeys: results.descriptiveAnalysis ? Object.keys(results.descriptiveAnalysis) : [],
      visualizationCount: results.basicVisualizations ? results.basicVisualizations.length : 0
    });
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="font-medium text-gray-900">Trial Analysis Complete</span>
          </div>
          <Button variant="outline" onClick={removeFile}>
            Start Over
          </Button>
        </div>

        {renderSchema(results.schema)}
        {renderAnalysis(results.descriptiveAnalysis)}
        {renderVisualizations(results.basicVisualizations)}
        {renderUpgradePrompt()}

        <UpgradeModal 
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          projectId={currentProjectId ?? undefined}
          trialResults={results}
        />
      </div>
    );
  }

  

  return (
    <div className="space-y-4">
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? "border-green-500 bg-green-50"
              : "border-gray-300 hover:border-gray-400"
          } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          {isDragActive ? (
            <p className="text-green-600">Drop the file here...</p>
          ) : (
            <div>
              <p className="text-gray-600 mb-2">
                Drag & drop a file here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Trial: Up to 10MB • Excel, CSV, JSON, text files
              </p>
              <Badge variant="outline" className="mt-2">
                No signup required
              </Badge>
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <FileIcon className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeFile}
              disabled={isProcessing}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {isProcessing && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Processing your data...</span>
                <span>Analyzing schema and generating insights</span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          )}

          <Button
            onClick={handleTrialUpload}
            disabled={isProcessing}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? "Processing..." : "Get Free Analysis"}
          </Button>
        </div>
      )}
      
  {/* Trial PII Warning Dialog */}
      {showPIIDialog && piiDialogData && (
        <FreeTrialPIIDialog
          isOpen={showPIIDialog}
          piiData={piiDialogData.result.piiResult}
          onProceedWithPII={handleProceedWithPII}
          onSignUp={handleSignUp}
          onClose={handleCancelUpload}
        />
      )}
    </div>
  );
}