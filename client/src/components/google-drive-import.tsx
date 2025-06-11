import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileText, Download, Calendar, HardDrive, Loader2, ExternalLink } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
}

interface GoogleDriveImportProps {
  onImportSuccess: (project: any) => void;
  onClose: () => void;
}

export default function GoogleDriveImport({ onImportSuccess, onClose }: GoogleDriveImportProps) {
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null);
  const [projectName, setProjectName] = useState("");
  const [questions, setQuestions] = useState("");
  const { toast } = useToast();

  // Fetch Google Drive files
  const { data: filesData, isLoading: isLoadingFiles, error: filesError } = useQuery({
    queryKey: ["/api/google-drive/files"],
    retry: false,
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (data: { fileId: string; fileName: string; name: string; questions: string[] }) => {
      return await apiRequest("POST", "/api/projects/import-from-drive", data);
    },
    onSuccess: (data) => {
      toast({
        title: "Import Successful",
        description: "Your Google Drive file has been imported successfully",
      });
      onImportSuccess(data.project);
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import file from Google Drive",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: GoogleDriveFile) => {
    setSelectedFile(file);
    if (!projectName) {
      // Auto-generate project name from file name
      const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
      setProjectName(nameWithoutExtension);
    }
  };

  const handleImport = () => {
    if (!selectedFile || !projectName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a file and enter a project name",
        variant: "destructive",
      });
      return;
    }

    let questionsArray: string[] = [];
    if (questions.trim()) {
      questionsArray = questions.split('\n').filter(q => q.trim().length > 0);
    }

    importMutation.mutate({
      fileId: selectedFile.id,
      fileName: selectedFile.name,
      name: projectName.trim(),
      questions: questionsArray,
    });
  };

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getMimeTypeIcon = (mimeType: string) => {
    if (mimeType.includes('csv')) return <FileText className="w-4 h-4 text-green-600" />;
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return <FileText className="w-4 h-4 text-blue-600" />;
    return <FileText className="w-4 h-4 text-gray-600" />;
  };

  // Handle Google Drive authorization error
  if (filesError && filesError.message.includes('not authorized')) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Google Drive Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-8">
            <HardDrive className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">Connect Google Drive</h3>
            <p className="text-gray-600 mb-4">
              To import files from Google Drive, you need to connect your Google account first.
            </p>
            <div className="space-y-2">
              <Button 
                onClick={() => window.location.href = '/auth/google'}
                className="flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Connect Google Drive
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          Import from Google Drive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* File Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">Select File</Label>
              <p className="text-sm text-gray-600 mb-3">
                Choose a CSV or Excel file from your Google Drive
              </p>
            </div>

            {isLoadingFiles ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="ml-2">Loading your Google Drive files...</span>
              </div>
            ) : filesData?.files?.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <FileText className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600">No compatible files found in your Google Drive</p>
                <p className="text-sm text-gray-500">Upload CSV or Excel files to see them here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg">
                {filesData?.files?.map((file: GoogleDriveFile) => (
                  <div
                    key={file.id}
                    className={`p-3 border-b last:border-b-0 cursor-pointer transition-colors ${
                      selectedFile?.id === file.id
                        ? 'bg-blue-50 border-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleFileSelect(file)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {getMimeTypeIcon(file.mimeType)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{file.name}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              {formatFileSize(file.size)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(file.modifiedTime)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {selectedFile?.id === file.id && (
                        <Badge className="bg-blue-100 text-blue-700">Selected</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Project Configuration */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="questions">Analysis Questions (Optional)</Label>
              <p className="text-sm text-gray-600 mb-2">
                Enter specific questions you want answered (one per line)
              </p>
              <Textarea
                id="questions"
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder="What factors influence sales performance?&#10;Which regions show the highest growth?&#10;Are there seasonal patterns in the data?"
                rows={6}
                className="mt-1"
              />
            </div>

            {selectedFile && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Selected File:</h4>
                <div className="flex items-center gap-2">
                  {getMimeTypeIcon(selectedFile.mimeType)}
                  <span className="font-medium">{selectedFile.name}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {formatFileSize(selectedFile.size)} • Modified {formatDate(selectedFile.modifiedTime)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={handleImport}
            disabled={!selectedFile || !projectName.trim() || importMutation.isPending}
            className="flex-1"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Import Project
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}