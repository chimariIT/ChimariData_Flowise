import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Upload, FileText, Database, Trash2, Eye, Zap, TrendingUp, BarChart3, Brain, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import FileUploader from "@/components/file-uploader";
import AuthModal from "@/components/auth-modal";
import SubscriptionTierDisplay from "@/components/subscription-tier-display";
import PricingDisplay from "@/components/pricing-display";
import { PIIInterimDialog } from "@/components/PIIInterimDialog";

interface HomePageProps {
  user?: any;
  onLogout?: () => void;
}

export default function HomePage({ user, onLogout }: HomePageProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState(user ? "upload" : "auth");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('register');
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [piiDialogData, setPIIDialogData] = useState<any>(null);

  const { data: projectsData, isLoading, refetch } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      return await apiClient.getProjects();
    },
  });

  const { data: pricingData } = useQuery({
    queryKey: ["/api/pricing"],
    queryFn: async () => {
      return await apiClient.getPricing();
    },
  });

  const projects = projectsData?.projects || [];

  const handleFileUpload = async (file: File, description?: string) => {
    setIsUploading(true);
    try {
      const result = await apiClient.uploadFile(file, {
        name: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension
        description: description || '',
        questions: [
          "What are the key trends in this data?",
          "What insights can you provide about this dataset?",
          "What are the most important patterns or correlations?"
        ]
      });
      
      if (result.success) {
        // Check if PII decision is required
        if (result.requiresPIIDecision) {
          setPIIDialogData({
            file,
            result,
            description
          });
          setShowPIIDialog(true);
          return;
        }
        
        toast({
          title: "File uploaded successfully!",
          description: `Processed ${result.recordCount || 0} records from ${file.name}`,
        });
        refetch();
        setLocation(`/project/${result.projectId}`);
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePIIDecision = async (decision: 'include' | 'exclude' | 'anonymize', anonymizationConfig?: any) => {
    if (!piiDialogData) return;
    
    try {
      setIsUploading(true);
      
      // Create form data for the PII decision endpoint
      const formData = new FormData();
      formData.append('file', piiDialogData.file);
      formData.append('name', piiDialogData.file.name.replace(/\.[^/.]+$/, ""));
      formData.append('description', piiDialogData.description || '');
      formData.append('questions', JSON.stringify([
        "What are the key trends in this data?",
        "What insights can you provide about this dataset?",
        "What are the most important patterns or correlations?"
      ]));
      formData.append('tempFileId', piiDialogData.result.tempFileId);
      formData.append('decision', decision);
      
      // Add anonymization config if provided
      if (anonymizationConfig) {
        formData.append('anonymizationConfig', JSON.stringify(anonymizationConfig));
      }

      // Add authentication headers
      const token = localStorage.getItem('auth_token');
      const headers: any = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/pii-decision', {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setShowPIIDialog(false);
        setPIIDialogData(null);
        
        toast({
          title: "File uploaded successfully!",
          description: `Processed with ${decision} PII decision`,
        });
        refetch();
        setLocation(`/project/${result.projectId}`);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to process PII decision",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    try {
      await apiClient.deleteProject(projectId);
      toast({
        title: "Project deleted",
        description: `${projectName} has been deleted`,
      });
      refetch();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* User Header */}
      {user && (
        <div className="flex justify-between items-center mb-6 p-4 bg-white rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-medium">
                {user.firstName?.[0] || user.email?.[0] || 'U'}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">
                Welcome, {user.firstName || user.email}!
              </p>
              <p className="text-sm text-gray-500">
                Full platform access enabled
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onLogout}
            className="text-gray-600 hover:text-gray-900"
          >
            Logout
          </Button>
        </div>
      )}
      
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="inline-block bg-blue-50 px-4 py-2 rounded-full mb-6">
          <span className="text-sm font-medium text-blue-700">📊 Progressive Insights Generation</span>
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          You don't have to be a <span className="text-blue-600">data expert</span> to have cutting edge insights
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Combining the power of traditional analytics and AI workflows. Upload your data and ask questions in plain English. 
          Our progressive system transforms complex datasets into actionable insights—no technical skills required.
        </p>
        <div className="flex justify-center gap-4">
          {!user && (
            <Button 
              size="lg" 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setActiveTab('auth')}
            >
              🚀 Try Free - No Sign-up
            </Button>
          )}
          {!user && (
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => setLocation('/auth/register')}
            >
              Sign Up for Full Access
            </Button>
          )}
          {user && (
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setActiveTab('upload')}
            >
              🚀 Upload Your Data
            </Button>
          )}
        </div>
      </div>

      {/* Feature Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('transformation')}>
          <CardContent className="pt-6">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-blue-600" />
            <h3 className="font-semibold text-sm">Transformation</h3>
            <p className="text-xs text-gray-500 mt-1">Clean & reshape data</p>
            <div className="mt-2 flex justify-center gap-1">
              <Badge variant="secondary" className="text-xs">Free Trial</Badge>
              <Badge variant="outline" className="text-xs">Full</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('analysis')}>
          <CardContent className="pt-6">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-green-600" />
            <h3 className="font-semibold text-sm">Analysis</h3>
            <p className="text-xs text-gray-500 mt-1">Statistical insights</p>
            <div className="mt-2 flex justify-center gap-1">
              <Badge variant="secondary" className="text-xs">Free Trial</Badge>
              <Badge variant="outline" className="text-xs">Full</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('visualization')}>
          <CardContent className="pt-6">
            <Database className="w-8 h-8 mx-auto mb-2 text-purple-600" />
            <h3 className="font-semibold text-sm">Visualization</h3>
            <p className="text-xs text-gray-500 mt-1">Analytics to Visualisation</p>
            <div className="mt-2 flex justify-center gap-1">
              <Badge variant="secondary" className="text-xs">Free Trial</Badge>
              <Badge variant="outline" className="text-xs">Full</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('insights')}>
          <CardContent className="pt-6">
            <Brain className="w-8 h-8 mx-auto mb-2 text-orange-600" />
            <h3 className="font-semibold text-sm">AI Insights</h3>
            <p className="text-xs text-gray-500 mt-1">Intelligent analysis</p>
            <div className="mt-2 flex justify-center gap-1">
              <Badge variant="secondary" className="text-xs">Free Trial</Badge>
              <Badge variant="outline" className="text-xs">Full</Badge>
            </div>
          </CardContent>
        </Card>
      </div>



      {/* Upload Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className={`grid w-full ${user ? 'grid-cols-6' : 'grid-cols-7'}`}>
          {!user && (
            <TabsTrigger value="auth" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Get Started
            </TabsTrigger>
          )}
          <TabsTrigger value={user ? "upload" : "paid"} className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {user ? "Upload Data" : "Full Features"}
          </TabsTrigger>
          <TabsTrigger value="guided" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Guided Analysis
          </TabsTrigger>
          <TabsTrigger value="transformation" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Transformation
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="visualization" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Visualization
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            AI Insights
          </TabsTrigger>
        </TabsList>

        {!user && (
          <TabsContent value="auth">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-green-600" />
                  Choose Your Plan
                </CardTitle>
                <CardDescription>
                  Start with our tiered subscription model - progressive data analytics with professional email verification
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {/* Trial Plan */}
                  <Card className="border-2 border-blue-200 bg-blue-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center justify-between">
                        Trial
                        <Badge variant="outline">$5/month</Badge>
                      </CardTitle>
                      <CardDescription>Perfect for testing</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div>• 1 file (10MB)</div>
                      <div>• Schema + basic stats</div>
                      <div>• 1 AI insight</div>
                      <div>• PII detection</div>
                    </CardContent>
                  </Card>

                  {/* Starter Plan */}
                  <Card className="border-2 border-green-200 bg-green-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center justify-between">
                        Starter
                        <Badge variant="outline">$10/month</Badge>
                      </CardTitle>
                      <CardDescription>For small teams</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div>• 2 files (50MB each)</div>
                      <div>• Data transformation</div>
                      <div>• Statistical analysis</div>
                      <div>• 3 AI insights</div>
                    </CardContent>
                  </Card>

                  {/* Professional Plan */}
                  <Card className="border-2 border-purple-200 bg-purple-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center justify-between">
                        Professional
                        <Badge variant="outline">$20/month</Badge>
                      </CardTitle>
                      <CardDescription>Growing businesses</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div>• 5 files (100MB each)</div>
                      <div>• Advanced insights</div>
                      <div>• Export options</div>
                      <div>• 5 AI insights</div>
                    </CardContent>
                  </Card>

                  {/* Enterprise Plan */}
                  <Card className="border-2 border-yellow-200 bg-yellow-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center justify-between">
                        Enterprise
                        <Badge variant="outline">$50/month</Badge>
                      </CardTitle>
                      <CardDescription>Full access</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div>• Unlimited files</div>
                      <div>• API access</div>
                      <div>• Priority support</div>
                      <div>• Unlimited insights</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    onClick={() => {
                      setAuthModalTab('register');
                      setShowAuthModal(true);
                    }}
                    className="flex-1 max-w-xs"
                  >
                    Create Account
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setAuthModalTab('login');
                      setShowAuthModal(true);
                    }}
                    className="flex-1 max-w-xs"
                  >
                    Sign In
                  </Button>
                </div>

                <div className="mt-4 text-center text-sm text-gray-600">
                  <p>All plans include email verification from registration@chimaridata.com</p>
                  <p>Start with any tier and upgrade anytime</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value={user ? "upload" : "paid"}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                {user ? "Upload Your Data" : "Full Platform Access"}
              </CardTitle>
              <CardDescription>
                {user 
                  ? "Upload files and access all platform features with your account"
                  : "Upload larger files and choose your data journey with progressive pricing"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user ? (
                <FileUploader
                  onFileUpload={handleFileUpload}
                  isUploading={isUploading}
                  maxSize={100 * 1024 * 1024} // 100MB for authenticated users
                />
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">
                    Sign in to access full platform features
                  </p>
                  <Button 
                    onClick={() => setLocation('/auth/login')}
                    className="mr-2"
                  >
                    Sign In
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setLocation('/auth/register')}
                  >
                    Create Account
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guided Analysis Workflow */}
        <TabsContent value="guided">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                Guided Business Analysis
              </CardTitle>
              <CardDescription>
                Step-by-step guided analysis with business context questions and AI-powered insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Trial Plan ($5)</h3>
                    <p className="text-sm text-gray-600 mb-3">Basic guided analysis with simple questions</p>
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600 mb-2">Sign up to start with our Trial plan</p>
                      <Button variant="outline" onClick={() => setActiveTab('auth')}>
                        Choose Plan
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Full Features</h3>
                    <p className="text-sm text-gray-600 mb-3">Advanced guided analysis with business context and custom questions</p>
                    {user ? (
                      <FileUploader
                        onFileUpload={handleFileUpload}
                        isUploading={isUploading}
                        maxSize={100 * 1024 * 1024}
                      />
                    ) : (
                      <div className="text-center">
                        <Button onClick={() => setLocation('/auth/login')}>Sign In</Button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-medium mb-2 text-blue-900">How Guided Analysis Works</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2">1</div>
                      <p className="font-medium">Upload Data</p>
                      <p className="text-gray-600">Upload your dataset and provide business context</p>
                    </div>
                    <div className="text-center">
                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2">2</div>
                      <p className="font-medium">Ask Questions</p>
                      <p className="text-gray-600">Ask specific business questions in plain English</p>
                    </div>
                    <div className="text-center">
                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2">3</div>
                      <p className="font-medium">Get Insights</p>
                      <p className="text-gray-600">Receive actionable insights and recommendations</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transformation Workflow */}
        <TabsContent value="transformation">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Data Transformation
              </CardTitle>
              <CardDescription>
                Clean, filter, and reshape your data using advanced Python libraries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Trial Plan ($5)</h3>
                    <p className="text-sm text-gray-600 mb-3">Basic data cleaning & reshaping (10MB limit)</p>
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600 mb-2">Sign up to start with our Trial plan</p>
                      <Button variant="outline" onClick={() => setActiveTab('auth')}>
                        Choose Plan
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Full Features</h3>
                    <p className="text-sm text-gray-600 mb-3">Advanced transformations, joins, & large files</p>
                    {user ? (
                      <FileUploader
                        onFileUpload={handleFileUpload}
                        isUploading={isUploading}
                        maxSize={100 * 1024 * 1024}
                      />
                    ) : (
                      <div className="text-center">
                        <Button onClick={() => setLocation('/auth/login')}>Sign In</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Workflow */}
        <TabsContent value="analysis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" />
                Statistical Analysis
              </CardTitle>
              <CardDescription>
                Analytics to Visualisation - ANOVA, regression, machine learning, and advanced statistical testing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Analysis Types */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg bg-blue-50">
                    <h4 className="font-medium mb-2 text-blue-900">Univariate Analysis</h4>
                    <p className="text-sm text-gray-600 mb-2">Single variable analysis</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Descriptive statistics</li>
                      <li>• Distribution analysis</li>
                      <li>• Normality testing</li>
                    </ul>
                  </div>
                  <div className="p-4 border rounded-lg bg-green-50">
                    <h4 className="font-medium mb-2 text-green-900">Bivariate Analysis</h4>
                    <p className="text-sm text-gray-600 mb-2">Two variable relationships</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Correlation analysis</li>
                      <li>• Regression modeling</li>
                      <li>• Categorical associations</li>
                    </ul>
                  </div>
                  <div className="p-4 border rounded-lg bg-purple-50">
                    <h4 className="font-medium mb-2 text-purple-900">Multivariate Analysis</h4>
                    <p className="text-sm text-gray-600 mb-2">Multiple variable interactions</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• ANOVA, ANCOVA, MANOVA</li>
                      <li>• Machine learning algorithms</li>
                      <li>• Multiple regression analysis</li>
                    </ul>
                  </div>
                </div>
                
                {/* Upload Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Trial Plan ($5)</h3>
                    <p className="text-sm text-gray-600 mb-3">Basic descriptive statistics & correlations (univariate & bivariate)</p>
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600 mb-2">Sign up to start with our Trial plan</p>
                      <Button variant="outline" onClick={() => setActiveTab('auth')}>
                        Choose Plan
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Full Features</h3>
                    <p className="text-sm text-gray-600 mb-3">ANOVA, ANCOVA, MANOVA, ML algorithms with multivariate analysis</p>
                    {user ? (
                      <FileUploader
                        onFileUpload={handleFileUpload}
                        isUploading={isUploading}
                        maxSize={100 * 1024 * 1024}
                      />
                    ) : (
                      <div className="text-center">
                        <Button onClick={() => setLocation('/auth/login')}>Sign In</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visualization Workflow */}
        <TabsContent value="visualization">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600" />
                Data Visualization
              </CardTitle>
              <CardDescription>
                Analytics to Visualisation - Create interactive charts, graphs, and multivariate relationship plots
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Visualization Types */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg bg-blue-50">
                    <h4 className="font-medium mb-2 text-blue-900">Univariate Analysis</h4>
                    <p className="text-sm text-gray-600 mb-2">Single variable visualizations</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Histograms & distributions</li>
                      <li>• Box plots & outlier detection</li>
                      <li>• Frequency charts</li>
                    </ul>
                  </div>
                  <div className="p-4 border rounded-lg bg-green-50">
                    <h4 className="font-medium mb-2 text-green-900">Bivariate Analysis</h4>
                    <p className="text-sm text-gray-600 mb-2">Two variable relationships</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Scatter plots & correlations</li>
                      <li>• Categorical vs numerical</li>
                      <li>• Time series trends</li>
                    </ul>
                  </div>
                  <div className="p-4 border rounded-lg bg-purple-50">
                    <h4 className="font-medium mb-2 text-purple-900">Multivariate Analysis</h4>
                    <p className="text-sm text-gray-600 mb-2">Multiple variable interactions</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Grouped categorical analysis</li>
                      <li>• Multi-dimensional scatter plots</li>
                      <li>• Heatmaps & correlation matrices</li>
                    </ul>
                  </div>
                </div>
                
                {/* Upload Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Trial Plan ($5)</h3>
                    <p className="text-sm text-gray-600 mb-3">Basic charts & simple visualizations (univariate & bivariate)</p>
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600 mb-2">Sign up to start with our Trial plan</p>
                      <Button variant="outline" onClick={() => setActiveTab('auth')}>
                        Choose Plan
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Full Features</h3>
                    <p className="text-sm text-gray-600 mb-3">Interactive plots, multivariate analysis, custom charts with categorical grouping</p>
                    {user ? (
                      <FileUploader
                        onFileUpload={handleFileUpload}
                        isUploading={isUploading}
                        maxSize={100 * 1024 * 1024}
                      />
                    ) : (
                      <div className="text-center">
                        <Button onClick={() => setLocation('/auth/login')}>Sign In</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Insights Workflow */}
        <TabsContent value="insights">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-orange-600" />
                AI-Powered Insights
              </CardTitle>
              <CardDescription>
                Intelligent analysis, business recommendations, and automated insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Trial Plan ($5)</h3>
                    <p className="text-sm text-gray-600 mb-3">Basic AI insights & summaries</p>
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600 mb-2">Sign up to start with our Trial plan</p>
                      <Button variant="outline" onClick={() => setActiveTab('auth')}>
                        Choose Plan
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Full Features</h3>
                    <p className="text-sm text-gray-600 mb-3">Advanced AI analysis, business insights, predictive modeling</p>
                    {user ? (
                      <FileUploader
                        onFileUpload={handleFileUpload}
                        isUploading={isUploading}
                        maxSize={100 * 1024 * 1024}
                      />
                    ) : (
                      <div className="text-center">
                        <Button onClick={() => setLocation('/auth/login')}>Sign In</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Projects List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Your Data Projects
          </CardTitle>
          <CardDescription>
            {projects.length === 0 
              ? "No projects yet. Upload a file to get started!" 
              : `${projects.length} project${projects.length === 1 ? '' : 's'} available`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Upload your first data file to see it here</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project: any) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 truncate mr-2">
                        {project.name}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteProject(project.id, project.name)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-1 text-sm text-gray-600 mb-3">
                      <p className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {project.fileName}
                      </p>
                      <p>{formatFileSize(project.fileSize)}</p>
                      <p>{project.recordCount?.toLocaleString()} records</p>
                      <p>{formatDate(project.uploadedAt)}</p>
                    </div>

                    <Button 
                      onClick={() => setLocation(`/project/${project.id}`)}
                      className="w-full"
                      size="sm"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Authentication Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(userData) => {
          toast({
            title: "Welcome!",
            description: "Account setup complete. You can now choose a subscription plan.",
          });
          window.location.reload(); // Refresh to update auth state
        }}
        initialTab={authModalTab}
      />

      {/* PII Detection Dialog */}
      {showPIIDialog && piiDialogData && (
        <PIIInterimDialog
          isOpen={showPIIDialog}
          piiData={piiDialogData.result.piiResult}
          sampleData={piiDialogData.result.sampleData}
          onProceed={handlePIIDecision}
          onClose={() => {
            setShowPIIDialog(false);
            setPIIDialogData(null);
            setIsUploading(false);
          }}
        />
      )}
    </div>
  );
}