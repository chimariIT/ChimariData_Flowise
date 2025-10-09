import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Brain, Sparkles, ArrowLeft, CheckCircle, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FreeTrialProps {
  onBack: () => void;
  onSignUp: () => void;
}

export default function FreeTrial({ onBack, onSignUp }: FreeTrialProps) {
  const [step, setStep] = useState<'upload' | 'question' | 'results'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Check file size (10MB limit for free trial)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Free trial supports files up to 10MB. Please try a smaller file.",
          variant: "destructive",
        });
        return;
      }
      
      // Check file type
      const allowedTypes = ['.csv', '.xlsx', '.xls'];
      const fileExtension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));
      if (!allowedTypes.includes(fileExtension)) {
        toast({
          title: "Unsupported file type",
          description: "Please upload a CSV or Excel file.",
          variant: "destructive",
        });
        return;
      }
      
      setFile(selectedFile);
      setStep('question');
    }
  };

  const handleAnalysis = async () => {
    if (!file || !question.trim()) return;
    
    setIsLoading(true);
    
    try {
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', `Free Trial Analysis - ${file.name}`);
      formData.append('questions', JSON.stringify([question]));
      formData.append('isTrial', 'true');
      
      const response = await fetch('/api/upload-trial', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Analysis failed');
      }
      
      const results = await response.json();
      setAnalysisResults(results);
      setStep('results');
      
      toast({
        title: "Analysis Complete!",
        description: "Your free trial analysis is ready.",
      });
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "There was an error processing your file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Button 
              onClick={onBack}
              variant="ghost"
              className="text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>

          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 px-4 py-2 bg-green-50 border-green-200">
              <Sparkles className="w-4 h-4 mr-2 text-green-600" />
              Free Trial - No Sign-up Required
            </Badge>
            
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Try ChimariData AI Analysis
            </h1>
            
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Upload a small dataset and ask one question to see how our AI transforms your data into insights
            </p>
          </div>

          {/* Step Indicator */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center ${step === 'upload' ? 'text-blue-600' : step === 'question' || step === 'results' ? 'text-green-600' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-blue-100' : step === 'question' || step === 'results' ? 'bg-green-100' : 'bg-slate-100'}`}>
                  {step === 'question' || step === 'results' ? <CheckCircle className="w-5 h-5" /> : <span>1</span>}
                </div>
                <span className="ml-2 font-medium">Upload File</span>
              </div>
              
              <div className={`w-8 h-1 ${step === 'question' || step === 'results' ? 'bg-green-600' : 'bg-slate-200'}`}></div>
              
              <div className={`flex items-center ${step === 'question' ? 'text-blue-600' : step === 'results' ? 'text-green-600' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'question' ? 'bg-blue-100' : step === 'results' ? 'bg-green-100' : 'bg-slate-100'}`}>
                  {step === 'results' ? <CheckCircle className="w-5 h-5" /> : <span>2</span>}
                </div>
                <span className="ml-2 font-medium">Ask Question</span>
              </div>
              
              <div className={`w-8 h-1 ${step === 'results' ? 'bg-green-600' : 'bg-slate-200'}`}></div>
              
              <div className={`flex items-center ${step === 'results' ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'results' ? 'bg-blue-100' : 'bg-slate-100'}`}>
                  <span>3</span>
                </div>
                <span className="ml-2 font-medium">View Results</span>
              </div>
            </div>
          </div>

          {/* Upload Step */}
          {step === 'upload' && (
            <Card className="max-w-2xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center">
                  <Upload className="w-6 h-6 text-blue-600 mr-2" />
                  Upload Your Dataset
                </CardTitle>
                <CardDescription>
                  Upload a CSV or Excel file (max 10MB) to get started
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <div className="space-y-2">
                    <p className="text-slate-600">Drop your file here or click to browse</p>
                    <p className="text-sm text-slate-500">Supports CSV, Excel files up to 10MB</p>
                  </div>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    className="mt-4"
                  />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Free Trial Includes:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 1 file upload (up to 10MB)</li>
                    <li>• Basic data summarization</li>
                    <li>• 1 AI-powered question</li>
                    <li>• Simple visualizations</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Question Step */}
          {step === 'question' && (
            <Card className="max-w-2xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center">
                  <Brain className="w-6 h-6 text-blue-600 mr-2" />
                  Ask Your Question
                </CardTitle>
                <CardDescription>
                  What would you like to know about your data?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center text-sm text-slate-600 mb-2">
                    <FileText className="w-4 h-4 mr-2" />
                    Uploaded: {file?.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    Size: {file ? (file.size / 1024 / 1024).toFixed(2) : 0}MB
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="question">Your Question</Label>
                  <Textarea
                    id="question"
                    placeholder="e.g., What are the main trends in my sales data? What factors drive customer satisfaction?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={4}
                  />
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-900 mb-2">Example Questions:</h4>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    <li>• "What are the key patterns in my data?"</li>
                    <li>• "Which factors have the strongest correlation?"</li>
                    <li>• "What insights can you provide about trends?"</li>
                  </ul>
                </div>
                
                <div className="flex space-x-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setStep('upload')}
                    className="flex-1"
                  >
                    Change File
                  </Button>
                  <Button 
                    onClick={handleAnalysis}
                    disabled={!question.trim() || isLoading}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Analyze Data
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results Step */}
          {step === 'results' && analysisResults && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Brain className="w-6 h-6 text-green-600 mr-2" />
                    Your Analysis Results
                  </CardTitle>
                  <CardDescription>
                    Here's what our AI discovered about your data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Data Summary */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-medium text-slate-900 mb-3">Data Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-slate-600">Records</div>
                        <div className="font-medium">{analysisResults.recordCount || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-slate-600">Columns</div>
                        <div className="font-medium">{analysisResults.columnCount || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-slate-600">File Size</div>
                        <div className="font-medium">{file ? (file.size / 1024 / 1024).toFixed(2) : 0}MB</div>
                      </div>
                      <div>
                        <div className="text-slate-600">Format</div>
                        <div className="font-medium">{file?.name.split('.').pop()?.toUpperCase()}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* AI Insights */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-slate-900">Key Insights</h4>
                    
                    {/* Question-Specific Response */}
                    {analysisResults.questionResponse && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start">
                          <Brain className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                          <div>
                            <h5 className="font-medium text-blue-900 mb-2">Answer to Your Question</h5>
                            <p className="text-blue-800">{analysisResults.questionResponse}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* General Insights */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start">
                        <BarChart3 className="w-5 h-5 text-slate-600 mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <h5 className="font-medium text-slate-900 mb-2">Dataset Overview</h5>
                          <p className="text-slate-700">{analysisResults.insights || "Dataset successfully analyzed and validated."}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Call to Action */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                    <h4 className="font-bold text-slate-900 mb-2">Want More Advanced Analysis?</h4>
                    <p className="text-slate-700 mb-4">
                      Unlock unlimited analyses, larger file uploads, and advanced AI models with a paid plan.
                    </p>
                    <div className="flex space-x-3">
                      <Button onClick={onSignUp} className="bg-blue-600 hover:bg-blue-700">
                        Sign Up for Full Access
                      </Button>
                      <Button variant="outline" onClick={() => window.location.href = '/pricing'}>
                        View Pricing Plans
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}