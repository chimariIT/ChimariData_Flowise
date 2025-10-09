import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { HardDrive, ExternalLink, FileText, CheckCircle, Loader2, AlertCircle } from "lucide-react";

interface GoogleDriveImportProps {
  onSuccess: (project: any) => void;
}

export default function GoogleDriveImport({ onSuccess }: GoogleDriveImportProps) {
  const [driveUrl, setDriveUrl] = useState("");
  const [formData, setFormData] = useState({
    projectName: "",
    description: "",
    questions: ""
  });
  const [isImporting, setIsImporting] = useState(false);
  const [authStep, setAuthStep] = useState<'input' | 'auth' | 'importing'>('input');
  const [authUrl, setAuthUrl] = useState("");
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const isValidDriveUrl = (url: string) => {
    return url.includes('drive.google.com') || url.includes('docs.google.com');
  };

  const handleInitiateImport = async () => {
    if (!driveUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Google Drive URL",
        variant: "destructive"
      });
      return;
    }

    if (!isValidDriveUrl(driveUrl)) {
      toast({
        title: "Error",
        description: "Please enter a valid Google Drive URL",
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

    setIsImporting(true);
    setAuthStep('auth');

    try {
      const response = await fetch("/api/google-drive-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveUrl,
          projectName: formData.projectName,
          description: formData.description,
          questions: formData.questions.split('\n').filter(q => q.trim())
        })
      });

      const result = await response.json();

      if (result.success) {
        if (result.authUrl) {
          setAuthUrl(result.authUrl);
          window.open(result.authUrl, '_blank');
          
          // Poll for completion
          const pollInterval = setInterval(async () => {
            const statusResponse = await fetch(`/api/google-drive-status/${result.sessionId}`);
            const statusResult = await statusResponse.json();
            
            if (statusResult.completed) {
              clearInterval(pollInterval);
              setAuthStep('importing');
              
              if (statusResult.success) {
                onSuccess(statusResult.project);
                toast({
                  title: "Success",
                  description: "Google Drive file imported successfully"
                });
              } else {
                throw new Error(statusResult.error || "Import failed");
              }
            }
          }, 2000);
        } else {
          onSuccess(result.project);
          toast({
            title: "Success",
            description: "Google Drive file imported successfully"
          });
        }
      } else {
        throw new Error(result.error || "Failed to initiate import");
      }
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import from Google Drive",
        variant: "destructive"
      });
      setAuthStep('input');
    } finally {
      setIsImporting(false);
    }
  };

  const renderAuthStep = () => {
    switch (authStep) {
      case 'input':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="driveUrl">Google Drive URL</Label>
              <Input
                id="driveUrl"
                placeholder="https://drive.google.com/file/d/..."
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
              />
              <p className="text-sm text-gray-500 mt-1">
                Paste the share link from Google Drive (must be publicly accessible or you'll need to authenticate)
              </p>
            </div>

            <div>
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                name="projectName"
                placeholder="Enter a name for this project"
                value={formData.projectName}
                onChange={handleInputChange}
              />
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe your dataset..."
                rows={3}
                value={formData.description}
                onChange={handleInputChange}
              />
            </div>

            <div>
              <Label htmlFor="questions">Analysis Questions (Optional)</Label>
              <Textarea
                id="questions"
                name="questions"
                placeholder="What questions do you want to answer?&#10;• Question 1&#10;• Question 2"
                rows={3}
                value={formData.questions}
                onChange={handleInputChange}
              />
            </div>

            <Button 
              onClick={handleInitiateImport}
              disabled={isImporting}
              className="w-full"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Initiating Import...
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4 mr-2" />
                  Import from Google Drive
                </>
              )}
            </Button>
          </div>
        );

      case 'auth':
        return (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <ExternalLink className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Authentication Required</h3>
              <p className="text-gray-600">
                A new tab has opened for Google Drive authentication. Please complete the process and return here.
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => window.open(authUrl, '_blank')}
            >
              Re-open Authentication Tab
            </Button>
          </div>
        );

      case 'importing':
        return (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Importing File</h3>
              <p className="text-gray-600">
                Processing your Google Drive file. This may take a few moments...
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          Import from Google Drive
        </CardTitle>
        <CardDescription>
          Import data directly from Google Drive (Sheets, CSV, Excel files)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {renderAuthStep()}
      </CardContent>
    </Card>
  );
}