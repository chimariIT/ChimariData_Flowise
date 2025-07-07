import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Upload, FileText, Database, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import FileUploader from "@/components/file-uploader";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const { data: projectsData, isLoading, refetch } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      return await apiClient.getProjects();
    },
  });

  const projects = projectsData?.projects || [];

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const result = await apiClient.uploadFile(file);
      
      if (result.success) {
        toast({
          title: "File uploaded successfully!",
          description: `Processed ${result.project.recordCount} records from ${file.name}`,
        });
        refetch();
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
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">ChimariData</h1>
        <p className="text-xl text-gray-600 mb-8">
          Upload and process your data files - Excel, CSV, JSON, and more
        </p>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Data File
          </CardTitle>
          <CardDescription>
            Supported formats: Excel (.xlsx, .xls), CSV, JSON, and text files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUploader
            onFileUpload={handleFileUpload}
            isUploading={isUploading}
          />
        </CardContent>
      </Card>

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
    </div>
  );
}