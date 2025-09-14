import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Briefcase, CheckCircle } from "lucide-react";
import GuidedAnalysisWizard from "@/components/GuidedAnalysisWizard";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

interface TemplateAnalysisProps {
  onBack: () => void;
}

export default function TemplateAnalysis({ onBack }: TemplateAnalysisProps) {
  const [, setLocation] = useLocation();
  const [showWizard, setShowWizard] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const { toast } = useToast();

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
  });

  const handleAnalysisComplete = async (analysisConfig: any) => {
    try {
      toast({
        title: "Analysis Configured",
        description: "Your template-based analysis has been configured successfully.",
      });
      
      // Navigate to checkout or results
      setLocation('/guided-analysis-results/' + analysisConfig.analysisId);
    } catch (error) {
      console.error('Error completing analysis:', error);
      toast({
        title: "Error",
        description: "Failed to complete analysis configuration",
        variant: "destructive",
      });
    }
  };

  if (showWizard) {
    return (
      <GuidedAnalysisWizard
        projectId={selectedProject}
        schema={null} // Will be loaded by the wizard
        onComplete={handleAnalysisComplete}
        onClose={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <Briefcase className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Template-Based Analysis
            </h1>
            <p className="text-lg text-gray-600">
              Business scenarios and guided workflows for proven analytics templates
            </p>
          </div>
        </div>

        {/* Journey Features */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              What You Get
            </CardTitle>
            <CardDescription>
              This journey is designed for business users who need proven analytics templates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Pre-built Business Templates</h4>
                  <p className="text-sm text-gray-600">HR, Sales, Marketing, Customer Success scenarios</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Guided Analysis Workflows</h4>
                  <p className="text-sm text-gray-600">Step-by-step process tailored to your role</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Role-based Scenarios</h4>
                  <p className="text-sm text-gray-600">Templates designed for specific business functions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">AI-assisted Interpretation</h4>
                  <p className="text-sm text-gray-600">Smart insights and business-friendly explanations</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Executive-ready Reports</h4>
                  <p className="text-sm text-gray-600">Professional outputs for stakeholder presentations</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Selection */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Select Your Data Project</CardTitle>
            <CardDescription>
              Choose an existing project with data, or we'll guide you through uploading new data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading your projects...</p>
              </div>
            ) : projectsData?.projects?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {projectsData.projects.map((project: any) => (
                  <Card 
                    key={project.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedProject === project.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedProject(project.id)}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <CardDescription>
                        {project.description || 'No description available'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-gray-600">
                        <p>Records: {project.recordCount || 'Unknown'}</p>
                        <p>Created: {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Unknown'}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">No projects found. The wizard will guide you through uploading data.</p>
              </div>
            )}
            
            <div className="text-center">
              <Button 
                onClick={() => setShowWizard(true)}
                className="bg-blue-600 hover:bg-blue-700"
                size="lg"
                data-testid="button-start-template-analysis"
              >
                Start Template-Based Analysis
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Transparent Pricing</CardTitle>
            <CardDescription>
              Pay only for what you use, with clear pricing for each analysis type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Descriptive Analysis</h4>
                <p className="text-2xl font-bold text-blue-600">$25</p>
                <p className="text-sm text-gray-600">Summary statistics & exploration</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Comparative Analysis</h4>
                <p className="text-2xl font-bold text-blue-600">$40</p>
                <p className="text-sm text-gray-600">Statistical testing & comparisons</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Predictive Analysis</h4>
                <p className="text-2xl font-bold text-blue-600">$70</p>
                <p className="text-sm text-gray-600">Forecasting & trend analysis</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 text-center mt-4">
              Final pricing calculated based on your specific requirements and data complexity
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}