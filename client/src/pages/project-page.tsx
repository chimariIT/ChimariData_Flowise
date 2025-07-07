import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Database, FileText, Settings, BarChart3, Brain, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import SchemaEditor from "@/components/schema-editor";
import DataTransformation from "@/components/data-transformation";
import DataAnalysis from "@/components/data-analysis";
import AIInsights from "@/components/ai-insights";

interface ProjectPageProps {
  projectId: string;
}

export default function ProjectPage({ projectId }: ProjectPageProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      return await apiClient.getProject(projectId);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
          <p className="text-gray-600 mb-4">The requested project could not be found.</p>
          <Button onClick={() => setLocation("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setLocation("/")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-gray-600">{project.fileName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={project.processed ? "default" : "secondary"}>
                {project.processed ? "Processed" : "Processing"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="schema" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Schema
            </TabsTrigger>
            <TabsTrigger value="transform" className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Transform
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              AI Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Project Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    File Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">File Name:</span>
                    <span className="font-medium">{project.fileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">File Size:</span>
                    <span className="font-medium">{formatFileSize(project.fileSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">File Type:</span>
                    <span className="font-medium">{project.fileType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Records:</span>
                    <span className="font-medium">{project.recordCount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Uploaded:</span>
                    <span className="font-medium">{formatDate(project.uploadedAt)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Schema Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Data Schema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {project.schema && Object.keys(project.schema).length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-gray-600 mb-3">
                        {Object.keys(project.schema).length} columns detected
                      </p>
                      {Object.entries(project.schema).slice(0, 5).map(([name, info]: [string, any]) => (
                        <div key={name} className="flex justify-between items-center py-1">
                          <span className="font-medium truncate mr-2">{name}</span>
                          <Badge variant="outline">{info.type}</Badge>
                        </div>
                      ))}
                      {Object.keys(project.schema).length > 5 && (
                        <p className="text-sm text-gray-500 mt-2">
                          ...and {Object.keys(project.schema).length - 5} more columns
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500">No schema information available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Data Journey Options */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Choose Your Data Journey</CardTitle>
                <CardDescription>
                  Select what you'd like to do with your data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <Button
                    variant="outline"
                    className="h-24 flex-col space-y-2"
                    onClick={() => setActiveTab("transform")}
                  >
                    <Wrench className="w-8 h-8" />
                    <div className="text-center">
                      <div className="font-medium">Data Transformation</div>
                      <div className="text-xs text-gray-500">Clean, filter, and reshape your data</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-24 flex-col space-y-2"
                    onClick={() => setActiveTab("analysis")}
                  >
                    <BarChart3 className="w-8 h-8" />
                    <div className="text-center">
                      <div className="font-medium">Data Analysis</div>
                      <div className="text-xs text-gray-500">Statistical analysis and visualizations</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-24 flex-col space-y-2"
                    onClick={() => setActiveTab("insights")}
                  >
                    <Brain className="w-8 h-8" />
                    <div className="text-center">
                      <div className="font-medium">AI Insights</div>
                      <div className="text-xs text-gray-500">Intelligent data interpretation</div>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schema" className="mt-6">
            <SchemaEditor project={project} />
          </TabsContent>

          <TabsContent value="transform" className="mt-6">
            <DataTransformation project={project} />
          </TabsContent>

          <TabsContent value="analysis" className="mt-6">
            <DataAnalysis project={project} />
          </TabsContent>

          <TabsContent value="insights" className="mt-6">
            <AIInsights project={project} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}