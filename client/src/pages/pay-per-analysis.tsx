import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { projects } from "@/lib/api";
import { 
  Upload, 
  Calculator, 
  ArrowRight, 
  FileSpreadsheet, 
  Brain, 
  TrendingUp,
  BarChart3,
  Users,
  Target,
  Zap
} from "lucide-react";

interface PayPerAnalysisProps {
  onBack: () => void;
  onLogin: () => void;
}

export default function PayPerAnalysis({ onBack, onLogin }: PayPerAnalysisProps) {
  const [step, setStep] = useState<'analysis' | 'upload' | 'pricing' | 'payment'>('analysis');
  const [analysisData, setAnalysisData] = useState({
    analysisType: '',
    description: '',
    specificRequirements: '',
    urgency: 'standard',
    createProfile: false
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [pricingResult, setPricingResult] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const analysisTypes = [
    { id: 'regression', name: 'Predictive Analysis', description: 'Forecast trends and predict outcomes', icon: TrendingUp },
    { id: 'classification', name: 'Classification & Segmentation', description: 'Group and categorize your data', icon: Target },
    { id: 'clustering', name: 'Pattern Discovery', description: 'Find hidden patterns and insights', icon: Brain },
    { id: 'timeseries', name: 'Time Series Analysis', description: 'Analyze trends over time', icon: BarChart3 },
    { id: 'custom', name: 'Custom Analysis', description: 'Tailored analysis for specific needs', icon: Zap }
  ];

  const urgencyOptions = [
    { id: 'standard', name: 'Standard (2-3 days)', multiplier: 1 },
    { id: 'priority', name: 'Priority (24 hours)', multiplier: 1.5 },
    { id: 'urgent', name: 'Urgent (4-6 hours)', multiplier: 2.5 }
  ];

  const handleAnalysisSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!analysisData.analysisType || !analysisData.description) {
      toast({
        title: "Error",
        description: "Please select an analysis type and provide a description",
        variant: "destructive"
      });
      return;
    }

    if (analysisData.createProfile) {
      onLogin();
      return;
    }

    setStep('upload');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUploadAndPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile || !projectName) {
      toast({
        title: "Error",
        description: "Please select a file and enter a project name",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Calculate pricing based on file and analysis requirements
      const fileSizeMB = selectedFile.size / (1024 * 1024);
      const basePrice = getBasePrice(analysisData.analysisType);
      const urgencyMultiplier = urgencyOptions.find(u => u.id === analysisData.urgency)?.multiplier || 1;
      const complexityMultiplier = analysisData.specificRequirements.length > 100 ? 1.3 : 1;
      
      const finalPrice = basePrice * urgencyMultiplier * complexityMultiplier;
      
      setPricingResult({
        basePrice,
        urgencyMultiplier,
        complexityMultiplier,
        finalPrice,
        breakdown: {
          baseAnalysis: basePrice,
          urgencyFee: basePrice * (urgencyMultiplier - 1),
          complexityFee: basePrice * (complexityMultiplier - 1),
          total: finalPrice
        },
        estimatedDelivery: getEstimatedDelivery(analysisData.urgency)
      });

      setStep('pricing');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to calculate pricing. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getBasePrice = (analysisType: string) => {
    const prices: Record<string, number> = {
      regression: 49,
      classification: 39,
      clustering: 44,
      timeseries: 59,
      custom: 79
    };
    return prices[analysisType] || 49;
  };

  const getEstimatedDelivery = (urgency: string) => {
    const deliveries: Record<string, string> = {
      standard: '2-3 business days',
      priority: 'Within 24 hours',
      urgent: '4-6 hours'
    };
    return deliveries[urgency] || '2-3 business days';
  };

  const handlePayment = () => {
    // Implement payment processing
    setStep('payment');
    toast({
      title: "Processing Payment",
      description: "Redirecting to secure payment...",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Button variant="ghost" onClick={onBack}>
                ← Back
              </Button>
              <div className="flex items-center space-x-2">
                <Calculator className="w-6 h-6 text-blue-600" />
                <span className="text-xl font-bold text-slate-900">Pay-Per-Analysis</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-slate-600">
              <div className={`w-2 h-2 rounded-full ${step === 'analysis' ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
              <span>Analysis</span>
              <ArrowRight className="w-3 h-3" />
              <div className={`w-2 h-2 rounded-full ${step === 'upload' ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
              <span>Upload</span>
              <ArrowRight className="w-3 h-3" />
              <div className={`w-2 h-2 rounded-full ${step === 'pricing' ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
              <span>Pricing</span>
              <ArrowRight className="w-3 h-3" />
              <div className={`w-2 h-2 rounded-full ${step === 'payment' ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
              <span>Payment</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {step === 'analysis' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">What type of analysis do you need?</CardTitle>
              <CardDescription>
                Tell us about your data analysis requirements and we'll provide instant pricing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAnalysisSubmit} className="space-y-6">
                {/* Analysis Type Selection */}
                <div>
                  <Label className="text-lg font-semibold mb-4 block">Analysis Type</Label>
                  <div className="grid md:grid-cols-2 gap-4">
                    {analysisTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <Card 
                          key={type.id}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            analysisData.analysisType === type.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                          }`}
                          onClick={() => setAnalysisData({...analysisData, analysisType: type.id})}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start space-x-3">
                              <Icon className="w-6 h-6 text-blue-600 mt-1" />
                              <div>
                                <h3 className="font-semibold text-slate-900">{type.name}</h3>
                                <p className="text-sm text-slate-600">{type.description}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <Label htmlFor="description">Describe your analysis needs *</Label>
                  <Textarea
                    id="description"
                    placeholder="What specific insights are you looking for? What questions do you want answered?"
                    rows={4}
                    value={analysisData.description}
                    onChange={(e) => setAnalysisData({...analysisData, description: e.target.value})}
                    required
                  />
                </div>

                {/* Specific Requirements */}
                <div>
                  <Label htmlFor="requirements">Specific Requirements (Optional)</Label>
                  <Textarea
                    id="requirements"
                    placeholder="Any specific models, visualizations, or deliverables you need?"
                    rows={3}
                    value={analysisData.specificRequirements}
                    onChange={(e) => setAnalysisData({...analysisData, specificRequirements: e.target.value})}
                  />
                </div>

                {/* Urgency */}
                <div>
                  <Label htmlFor="urgency">Delivery Timeline</Label>
                  <Select 
                    value={analysisData.urgency} 
                    onValueChange={(value) => setAnalysisData({...analysisData, urgency: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {urgencyOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name} {option.multiplier > 1 && `(+${Math.round((option.multiplier - 1) * 100)}%)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Create Profile Option */}
                <div className="flex items-center space-x-2 p-4 bg-blue-50 rounded-lg">
                  <Checkbox
                    id="createProfile"
                    checked={analysisData.createProfile}
                    onCheckedChange={(checked) => setAnalysisData({...analysisData, createProfile: !!checked})}
                  />
                  <Label htmlFor="createProfile" className="text-sm">
                    Create a profile to track my analysis and get discounts on future projects
                  </Label>
                </div>

                <Button type="submit" className="w-full" size="lg">
                  {analysisData.createProfile ? 'Create Profile & Continue' : 'Continue to Upload'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Upload Your Dataset</CardTitle>
              <CardDescription>
                Upload your data file and we'll calculate the exact cost for your analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUploadAndPrice} className="space-y-6">
                {/* Project Name */}
                <div>
                  <Label htmlFor="projectName">Project Name *</Label>
                  <Input
                    id="projectName"
                    placeholder="Enter a name for this analysis project"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                  />
                </div>

                {/* File Upload */}
                <div>
                  <Label>Dataset File *</Label>
                  <div className="mt-2">
                    {!selectedFile ? (
                      <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                        <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <div className="text-lg font-medium text-slate-900 mb-2">
                          Choose your data file
                        </div>
                        <div className="text-sm text-slate-600 mb-4">
                          Support for CSV, Excel (.xlsx, .xls) files up to 50MB
                        </div>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="file-input"
                        />
                        <Button
                          type="button"
                          onClick={() => document.getElementById('file-input')?.click()}
                        >
                          Choose File
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <FileSpreadsheet className="w-8 h-8 text-green-600" />
                        <div className="flex-1">
                          <div className="font-medium text-green-900">{selectedFile.name}</div>
                          <div className="text-sm text-green-700">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Analysis Summary */}
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Analysis Summary</h3>
                  <div className="space-y-1 text-sm text-slate-700">
                    <div><strong>Type:</strong> {analysisTypes.find(t => t.id === analysisData.analysisType)?.name}</div>
                    <div><strong>Timeline:</strong> {urgencyOptions.find(u => u.id === analysisData.urgency)?.name}</div>
                    <div><strong>Description:</strong> {analysisData.description}</div>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <Button type="button" variant="outline" onClick={() => setStep('analysis')} className="flex-1">
                    Back
                  </Button>
                  <Button type="submit" disabled={isProcessing} className="flex-1">
                    {isProcessing ? 'Calculating...' : 'Calculate Price'}
                    <Calculator className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 'pricing' && pricingResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Analysis Pricing</CardTitle>
              <CardDescription>
                Here's the cost breakdown for your custom analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Price Breakdown */}
                <div className="bg-slate-50 rounded-lg p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-700">Base Analysis Fee</span>
                      <span className="font-medium">${pricingResult.breakdown.baseAnalysis}</span>
                    </div>
                    {pricingResult.breakdown.urgencyFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-700">Priority Delivery Fee</span>
                        <span className="font-medium">+${pricingResult.breakdown.urgencyFee.toFixed(2)}</span>
                      </div>
                    )}
                    {pricingResult.breakdown.complexityFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-700">Complexity Fee</span>
                        <span className="font-medium">+${pricingResult.breakdown.complexityFee.toFixed(2)}</span>
                      </div>
                    )}
                    <hr className="border-slate-300" />
                    <div className="flex justify-between text-lg font-bold">
                      <span className="text-slate-900">Total</span>
                      <span className="text-blue-600">${pricingResult.finalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Delivery Information */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">What You'll Receive</h3>
                  <ul className="space-y-1 text-sm text-blue-800">
                    <li>• Comprehensive analysis report with insights and recommendations</li>
                    <li>• Interactive visualizations and charts</li>
                    <li>• Raw analysis data and methodology notes</li>
                    <li>• Executive summary for stakeholder presentation</li>
                    <li>• Estimated delivery: {pricingResult.estimatedDelivery}</li>
                  </ul>
                </div>

                <div className="flex space-x-4">
                  <Button type="button" variant="outline" onClick={() => setStep('upload')} className="flex-1">
                    Back to Upload
                  </Button>
                  <Button onClick={handlePayment} className="flex-1 bg-blue-600 hover:bg-blue-700">
                    Proceed to Payment
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'payment' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Payment Processing</CardTitle>
              <CardDescription>
                Secure payment for your custom analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-600">Redirecting to secure payment...</p>
                <p className="text-sm text-slate-500 mt-2">
                  You will be redirected to our secure payment partner to complete your purchase.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}