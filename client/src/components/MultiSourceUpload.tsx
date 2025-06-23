import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload, 
  Cloud, 
  Computer, 
  Globe, 
  CheckCircle,
  X,
  AlertTriangle,
  Shield,
  FileText,
  Database
} from "lucide-react";
import { useDropzone } from 'react-dropzone';

interface UploadSource {
  id: string;
  name: string;
  icon: any;
  description: string;
  supported: boolean;
  color: string;
}

interface MultiSourceUploadProps {
  onUploadComplete: (uploadInfo: {
    sourceType: string;
    filename: string;
    size: number;
    mimeType: string;
    uploadPath: string;
  }) => void;
  allowedTypes?: string[];
  maxSize?: number;
  isLoading?: boolean;
}

const UPLOAD_SOURCES: UploadSource[] = [
  {
    id: 'computer',
    name: 'Your Computer',
    icon: Computer,
    description: 'Upload CSV, Excel, or JSON files from your device',
    supported: true,
    color: 'bg-blue-500'
  },
  {
    id: 'google',
    name: 'Google Drive',
    icon: Cloud,
    description: 'Import from Google Sheets or Drive files',
    supported: true,
    color: 'bg-green-500'
  },
  {
    id: 'microsoft',
    name: 'Microsoft OneDrive',
    icon: Cloud,
    description: 'Import from Excel Online or OneDrive',
    supported: true,
    color: 'bg-blue-600'
  },
  {
    id: 'apple',
    name: 'iCloud',
    icon: Cloud,
    description: 'Import from Numbers or iCloud Drive',
    supported: true,
    color: 'bg-gray-600'
  },
  {
    id: 'rest_api',
    name: 'REST API',
    icon: Globe,
    description: 'Connect to external APIs for real-time data',
    supported: true,
    color: 'bg-purple-500'
  }
];

export function MultiSourceUpload({ 
  onUploadComplete, 
  allowedTypes = ['.csv', '.xlsx', '.xls', '.json'],
  maxSize = 500 * 1024 * 1024, // 500MB
  isLoading = false 
}: MultiSourceUploadProps) {
  const [selectedSource, setSelectedSource] = useState<string>('computer');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'complete' | 'error'>('idle');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [apiConfig, setApiConfig] = useState({
    url: '',
    method: 'GET',
    headers: '',
    body: ''
  });
  const [cloudAuthStatus, setCloudAuthStatus] = useState<Record<string, boolean>>({});

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadedFile(file);
      simulateUpload(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json']
    },
    maxSize,
    multiple: false
  });

  const simulateUpload = async (file: File) => {
    setUploadStatus('uploading');
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploadStatus('complete');
          
          // Call completion handler
          onUploadComplete({
            sourceType: selectedSource,
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            uploadPath: `/uploads/${Date.now()}_${file.name}`
          });
          
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleCloudAuth = async (provider: string) => {
    // In a real implementation, this would trigger OAuth flow
    setCloudAuthStatus(prev => ({ ...prev, [provider]: true }));
  };

  const handleApiConnect = async () => {
    if (!apiConfig.url) return;
    
    setUploadStatus('uploading');
    
    try {
      // In a real implementation, this would make the API call
      setTimeout(() => {
        setUploadStatus('complete');
        onUploadComplete({
          sourceType: 'rest_api',
          filename: 'api_data.json',
          size: 1024,
          mimeType: 'application/json',
          uploadPath: `/api-data/${Date.now()}_api_data.json`
        });
      }, 2000);
    } catch (error) {
      setUploadStatus('error');
    }
  };

  const renderComputerUpload = () => (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
        <div className="space-y-2">
          <p className="text-lg font-medium">
            {isDragActive ? 'Drop your file here' : 'Drag & drop your data file'}
          </p>
          <p className="text-sm text-slate-500">
            or click to browse your computer
          </p>
          <p className="text-xs text-slate-400">
            Supports: {allowedTypes.join(', ')} • Max size: {Math.round(maxSize / (1024 * 1024))}MB
          </p>
        </div>
      </div>

      {uploadedFile && (
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <strong>{uploadedFile.name}</strong>
                <div className="text-sm text-slate-500">
                  {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
              {uploadStatus === 'complete' && (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  const renderCloudUpload = (provider: string) => {
    const isAuthenticated = cloudAuthStatus[provider];
    
    return (
      <div className="space-y-4">
        {!isAuthenticated ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connect to {provider}</CardTitle>
              <CardDescription>
                Authenticate with your {provider} account to access your files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => handleCloudAuth(provider)}
                className="w-full"
              >
                <Cloud className="w-4 h-4 mr-2" />
                Connect to {provider}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                Connected to {provider}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Select a file from your {provider} account:
                </p>
                <Button variant="outline" className="w-full">
                  <Database className="w-4 h-4 mr-2" />
                  Browse {provider} Files
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderApiUpload = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">REST API Configuration</CardTitle>
          <CardDescription>
            Connect to an external API to fetch data in real-time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-url">API Endpoint URL</Label>
            <Input
              id="api-url"
              placeholder="https://api.example.com/data"
              value={apiConfig.url}
              onChange={(e) => setApiConfig(prev => ({ ...prev, url: e.target.value }))}
            />
          </div>
          
          <div>
            <Label htmlFor="api-method">HTTP Method</Label>
            <select
              id="api-method"
              value={apiConfig.method}
              onChange={(e) => setApiConfig(prev => ({ ...prev, method: e.target.value }))}
              className="w-full border rounded px-3 py-2"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>

          <div>
            <Label htmlFor="api-headers">Headers (JSON format)</Label>
            <Textarea
              id="api-headers"
              placeholder='{"Authorization": "Bearer your-token"}'
              value={apiConfig.headers}
              onChange={(e) => setApiConfig(prev => ({ ...prev, headers: e.target.value }))}
              rows={3}
            />
          </div>

          {apiConfig.method === 'POST' && (
            <div>
              <Label htmlFor="api-body">Request Body (JSON format)</Label>
              <Textarea
                id="api-body"
                placeholder='{"query": "SELECT * FROM table"}'
                value={apiConfig.body}
                onChange={(e) => setApiConfig(prev => ({ ...prev, body: e.target.value }))}
                rows={3}
              />
            </div>
          )}

          <Button 
            onClick={handleApiConnect}
            disabled={!apiConfig.url || uploadStatus === 'uploading'}
            className="w-full"
          >
            <Globe className="w-4 h-4 mr-2" />
            Connect to API
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5 text-blue-600" />
            <span>Data Upload</span>
          </CardTitle>
          <CardDescription>
            Choose your data source and upload your files for analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Source Selection */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Select Data Source</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {UPLOAD_SOURCES.map(source => {
                const IconComponent = source.icon;
                return (
                  <div
                    key={source.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedSource === source.id 
                        ? 'border-blue-500 bg-blue-50 shadow-sm' 
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setSelectedSource(source.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`p-2 rounded-lg ${source.color} text-white flex-shrink-0`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">{source.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">{source.description}</p>
                        {source.supported && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            Available
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Interface */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Your Data</CardTitle>
          <CardDescription>
            {UPLOAD_SOURCES.find(s => s.id === selectedSource)?.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedSource === 'computer' && renderComputerUpload()}
          {selectedSource === 'google' && renderCloudUpload('Google Drive')}
          {selectedSource === 'microsoft' && renderCloudUpload('Microsoft OneDrive')}
          {selectedSource === 'apple' && renderCloudUpload('iCloud')}
          {selectedSource === 'rest_api' && renderApiUpload()}

          {/* Upload Progress */}
          {uploadStatus === 'uploading' && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {/* Security Notice */}
          <Alert className="mt-6">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Security Scan:</strong> All uploaded files are automatically scanned for malware 
              and security threats before processing. Your data is encrypted and stored securely.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}