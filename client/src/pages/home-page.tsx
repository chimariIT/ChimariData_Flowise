import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Upload, FileText, Database, Trash2, Eye, Zap, TrendingUp, BarChart3, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import FileUploader from "@/components/file-uploader";
import FreeTrialUploader from "@/components/free-trial-uploader";
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
  const [activeTab, setActiveTab] = useState(user ? "upload" : "trial");
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
      
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">ChimariData</h1>
        <p className="text-xl text-gray-600 mb-2">
          Progressive Data Analytics Platform
        </p>
        <p className="text-gray-500 mb-8">
          Four progressive paths: Transformation • Analysis • Visualization • AI Insights
        </p>
      </div>

      {/* Feature Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="text-center">
          <CardContent className="pt-6">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-blue-600" />
            <h3 className="font-semibold text-sm">Transformation</h3>
            <p className="text-xs text-gray-500 mt-1">Clean & reshape data</p>
            <Badge variant="outline" className="mt-2">$15</Badge>
          </CardContent>
        </Card>
        
        <Card className="text-center">
          <CardContent className="pt-6">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-green-600" />
            <h3 className="font-semibold text-sm">Analysis</h3>
            <p className="text-xs text-gray-500 mt-1">Statistical insights</p>
            <Badge variant="outline" className="mt-2">$25</Badge>
          </CardContent>
        </Card>
        
        <Card className="text-center">
          <CardContent className="pt-6">
            <Database className="w-8 h-8 mx-auto mb-2 text-purple-600" />
            <h3 className="font-semibold text-sm">Visualization</h3>
            <p className="text-xs text-gray-500 mt-1">Charts & graphs</p>
            <Badge variant="outline" className="mt-2">$20</Badge>
          </CardContent>
        </Card>
        
        <Card className="text-center">
          <CardContent className="pt-6">
            <Brain className="w-8 h-8 mx-auto mb-2 text-orange-600" />
            <h3 className="font-semibold text-sm">AI Insights</h3>
            <p className="text-xs text-gray-500 mt-1">Intelligent analysis</p>
            <Badge variant="outline" className="mt-2">$35</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Progressive Discount Info */}
      <Card className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50">
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-semibold text-gray-900 mb-2">Progressive Discounts</h3>
            <div className="flex justify-center space-x-6 text-sm">
              <span>2 features: <strong>15% off</strong></span>
              <span>3 features: <strong>25% off</strong></span>
              <span>4 features: <strong>35% off</strong></span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className={`grid w-full ${user ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!user && (
            <TabsTrigger value="trial" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Free Trial (10MB)
            </TabsTrigger>
          )}
          <TabsTrigger value={user ? "upload" : "paid"} className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {user ? "Upload Data" : "Full Features"}
          </TabsTrigger>
        </TabsList>

        {!user && (
          <TabsContent value="trial">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-green-600" />
                  Free Trial
                </CardTitle>
                <CardDescription>
                  Upload up to 10MB and get instant schema detection, descriptive analysis, and basic visualizations - no signup required!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FreeTrialUploader />
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