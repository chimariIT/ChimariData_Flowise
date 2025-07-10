import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { X, Upload, File, CheckCircle, FileSpreadsheet, AlertCircle, HardDrive } from "lucide-react";
import GoogleDriveImport from "./google-drive-import";
import { PIIInterimDialog } from "./PIIInterimDialog";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    projectName: "",
    description: "",
    questions: "",
    selectedSheet: "",
    headerRow: "0",
    encoding: "utf8"
  });
  const [fileType, setFileType] = useState<'csv' | 'excel' | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [tempFileInfo, setTempFileInfo] = useState<any>(null);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleGoogleDriveImportSuccess = (project: any) => {
    onSuccess();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // Determine file type
      const extension = file.name.toLowerCase().split('.').pop();
      if (extension === 'csv') {
        setFileType('csv');
        setShowAdvancedOptions(true);
      } else if (extension === 'xlsx' || extension === 'xls') {
        setFileType('excel');
        setShowAdvancedOptions(true);
      } else {
        setFileType(null);
        setShowAdvancedOptions(false);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive"
      });
      return;
    }

    if (!formData.projectName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      let questionsArray = formData.questions
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);

      // If no questions provided, add default analysis questions
      if (questionsArray.length === 0) {
        questionsArray = [
          "What are the key trends in this data?",
          "What insights can you provide about this dataset?",
          "What are the most important patterns or correlations?"
        ];
      }

      const result = await apiClient.uploadFile(selectedFile, {
        name: formData.projectName,
        description: formData.description,
        questions: questionsArray
      });
      
      // Check if PII decision is required
      if (result.requiresPIIDecision && result.piiResult) {
        console.log('PII detected - storing temp file info', result);
        // Store PII detection result and temp file info for handling
        setTempFileInfo({
          tempFileId: result.tempFileId,
          name: result.name || formData.projectName,
          description: formData.description,
          questions: questionsArray,
          piiResult: result.piiResult,
          sampleData: result.sampleData,
          file: selectedFile
        });
        setShowPIIDialog(true);
        console.log('PII dialog should be shown now', { showPIIDialog: true });
        return; // Don't call onSuccess yet
      }
      
      onSuccess();
      
      // Reset form
      setSelectedFile(null);
      setFormData({
        projectName: "",
        description: "",
        questions: "",
        selectedSheet: "",
        headerRow: "0",
        encoding: "utf8"
      });
      
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePIIDecision = async (decision: 'include' | 'exclude' | 'anonymize', anonymizationConfig?: any) => {
    if (!tempFileInfo) return;
    
    try {
      setIsUploading(true);
      
      // Use the unified JSON approach like the free trial uploader
      const requestData = {
        tempFileId: tempFileInfo.tempFileId,
        decision: decision,
        anonymizationConfig: anonymizationConfig,
        // Include project metadata for full uploads
        projectData: {
          name: tempFileInfo.name,
          description: tempFileInfo.description,
          questions: tempFileInfo.questions
        }
      };

      const response = await fetch('/api/pii-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        // Add timeout for long-running anonymization operations
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Close PII dialog
        setShowPIIDialog(false);
        setTempFileInfo(null);
        
        onSuccess();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
      
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to process PII decision",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Upload New Dataset</CardTitle>
              <CardDescription>Upload your CSV, JSON, or Excel file to get started with analysis</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Local Upload
              </TabsTrigger>
              <TabsTrigger value="drive" className="flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                Google Drive
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="mt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Project Name */}
                <div>
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                name="projectName"
                placeholder="Enter a descriptive name for your project"
                value={formData.projectName}
                onChange={handleInputChange}
                required
              />
            </div>

            {/* File Upload Area */}
            <div>
              <Label>Data File</Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-primary transition duration-200">
                {selectedFile ? (
                  <div className="space-y-4">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                    <div>
                      <p className="font-medium text-slate-900">{selectedFile.name}</p>
                      <p className="text-sm text-slate-500">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedFile(null)}
                    >
                      Remove file
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 text-slate-400 mx-auto" />
                    <div>
                      <p className="text-lg font-medium text-slate-700 mb-2">Drop your file here or click to browse</p>
                      <p className="text-sm text-slate-500">Supports CSV, JSON, and Excel files up to 10MB</p>
                    </div>
                    <div>
                      <input
                        type="file"
                        accept=".csv,.json,.xlsx,.xls"
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
                  </div>
                )}
              </div>
            </div>

            {/* Dataset Description */}
            <div>
              <Label htmlFor="description">Dataset Description (Optional)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Briefly describe your dataset and what it contains.&#10;&#10;Examples:&#10;• Customer transaction records from e-commerce platform&#10;• Marketing campaign performance data from Q4 2024&#10;• Employee survey responses about workplace satisfaction"
                rows={3}
                value={formData.description || ""}
                onChange={handleInputChange}
              />
            </div>

            {/* Business Questions */}
            <div>
              <Label htmlFor="questions">Business Questions (Optional)</Label>
              <Textarea
                id="questions"
                name="questions"
                placeholder="What insights are you looking for? Enter one question per line.&#10;&#10;Examples:&#10;• What are the top-performing products?&#10;• Which customer segments have the highest retention?&#10;• What seasonal trends are evident in the data?"
                rows={6}
                value={formData.questions}
                onChange={handleInputChange}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? "Uploading..." : "Upload & Analyze"}
              </Button>
            </div>
          </form>
            </TabsContent>
            
            <TabsContent value="drive" className="mt-6">
              <GoogleDriveImport 
                onImportSuccess={handleGoogleDriveImportSuccess}
                onClose={onClose}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* PII Detection Dialog */}
      {showPIIDialog && tempFileInfo && (
        <PIIInterimDialog
          isOpen={showPIIDialog}
          piiData={tempFileInfo.piiResult}
          sampleData={tempFileInfo.sampleData}
          onProceed={(decision, anonymizationConfig) => {
            handlePIIDecision(decision, anonymizationConfig);
          }}
          onClose={() => {
            setShowPIIDialog(false);
            setTempFileInfo(null);
          }}
        />
      )}
    </div>
  );
}
