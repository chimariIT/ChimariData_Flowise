import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Shield, 
  Globe,
  Cloud,
  HardDrive,
  Database,
  AlertTriangle,
  Gift
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { PIIDetectionDialog } from "./PIIDetectionDialog";

interface MultiSourceUploadProps {
  onComplete: (uploadInfo: any) => void;
  serviceType?: 'pay_per_analysis' | 'expert_consulting' | 'automated_analysis' | 'enterprise' | 'free_trial' | 'default';
  questions?: string[];
  allowedTypes?: string[];
  maxSize?: number;
  isLoading?: boolean;
}

const UPLOAD_SOURCES = [
  {
    id: 'computer',
    name: 'Computer Files',
    description: 'Upload files from your device',
    icon: HardDrive,
    color: 'bg-blue-600',
    supported: true
  },
  {
    id: 'google',
    name: 'Google Drive',
    description: 'Import from Google Drive',
    icon: Cloud,
    color: 'bg-green-600',
    supported: false
  },
  {
    id: 'microsoft',
    name: 'OneDrive',
    description: 'Import from Microsoft OneDrive',
    icon: Cloud,
    color: 'bg-blue-500',
    supported: false
  },
  {
    id: 'apple',
    name: 'iCloud',
    description: 'Import from Apple iCloud',
    icon: Cloud,
    color: 'bg-gray-600',
    supported: false
  },
  {
    id: 'rest_api',
    name: 'REST API',
    description: 'Connect via REST API endpoint',
    icon: Database,
    color: 'bg-purple-600',
    supported: true
  }
];

export function MultiSourceUpload({ 
  onComplete, 
  serviceType = 'default',
  questions = [],
  allowedTypes = ['.csv', '.xlsx', '.xls', '.json'],
  maxSize = 10 * 1024 * 1024,
  isLoading = false
}: MultiSourceUploadProps) {
  const [selectedSource, setSelectedSource] = useState<string>('computer');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'pii_check' | 'complete' | 'error'>('idle');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [apiConfig, setApiConfig] = useState({
    url: '',
    method: 'GET',
    headers: '',
    body: ''
  });
  const [cloudAuthStatus, setCloudAuthStatus] = useState<Record<string, boolean>>({});
  const [piiDetectionResult, setPiiDetectionResult] = useState<any>(null);
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [tempFileId, setTempFileId] = useState<string | null>(null);

  const uploadFileToBackend = useCallback(async (file: File, piiOptions?: {
    piiHandled: boolean;
    anonymizationApplied: boolean;
    selectedColumns?: string[];
  }) => {
    try {
      setUploadProgress(20);
      setUploadStatus('uploading');

      const result = await apiClient.uploadFile(file, {
        name: file.name.split('.')[0],
        questions: questions,
        isTrial: serviceType === 'free_trial',
        ...piiOptions
      });

      setUploadProgress(60);
      setUploadStatus('pii_check');

      console.log('API Response:', result);
      console.log('PII Decision Required:', result.requiresPIIDecision);
      console.log('PII Result:', result.piiResult);

      if (result.requiresPIIDecision && result.piiResult) {
        console.log('PII detected - showing dialog');
        setUploadProgress(100);
        setPiiDetectionResult(result.piiResult);
        setTempFileId(result.tempFileId ?? null);
        setShowPIIDialog(true);
        console.log('Dialog state set - showPIIDialog:', true);
      } else {
        // Upload complete - pass the complete analysis results
        setUploadProgress(100);
        setUploadStatus('complete');
        
        onComplete({
          id: result.id,
          name: result.name,
          sourceType: selectedSource,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          uploadPath: `/uploads/${Date.now()}_${file.name}`,
          piiHandled: piiOptions?.piiHandled || false,
          anonymizationApplied: piiOptions?.anonymizationApplied || false,
          // Include the actual analysis results from backend
          insights: result.insights,
          questionResponse: result.questionResponse,
          recordCount: result.recordCount,
          columnCount: result.columnCount,
          schema: result.schema,
          metadata: result.metadata,
          questions: questions,
          analysisType: 'descriptive', // Default analysis type for free trial
          isTrial: result.isTrial
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
    }
  }, [onComplete, selectedSource, serviceType, questions]);

  const handleFileUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    const file = files[0];
    setUploadedFile(file);
    await uploadFileToBackend(file);
  }, [uploadFileToBackend]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    handleFileUpload(acceptedFiles);
  }, [handleFileUpload]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json']
    },
    maxSize,
    multiple: false,
    onDropRejected: (rejectedFiles) => {
      const rejection = rejectedFiles[0];
      if (rejection.errors.some(e => e.code === 'file-too-large')) {
        const sizeMB = Math.round(maxSize / (1024 * 1024));
        setUploadStatus('error');
        onComplete({
          error: `File size exceeds ${sizeMB}MB limit. Please choose a smaller file or upgrade to a paid plan for larger file support.`,
          errorType: 'FILE_SIZE_EXCEEDED'
        });
      } else if (rejection.errors.some(e => e.code === 'file-invalid-type')) {
        setUploadStatus('error');
        onComplete({
          error: 'File type not supported. Please upload CSV, Excel (.xlsx, .xls), or JSON files.',
          errorType: 'INVALID_FILE_TYPE'
        });
      }
    }
  });

  const handlePIIDecision = async (requiresPII: boolean, anonymizeData: boolean, selectedColumns: string[]) => {
    setShowPIIDialog(false);
    
    if (uploadedFile) {
      // Re-upload with PII decision
      await uploadFileToBackend(uploadedFile, {
        piiHandled: true,
        anonymizationApplied: anonymizeData,
        selectedColumns: selectedColumns
      });
    }
  };

  const handleCloudAuth = (provider: string) => {
    setCloudAuthStatus(prev => ({ ...prev, [provider]: true }));
    // In a real implementation, this would trigger OAuth flow
    alert(`${provider} authentication would be implemented here`);
  };

  const handleApiConnect = async () => {
    try {
      setUploadStatus('uploading');
      
      // Simulate API connection and data fetch
      const response = await fetch(apiConfig.url, {
        method: apiConfig.method,
        headers: apiConfig.headers ? JSON.parse(apiConfig.headers) : {},
        body: apiConfig.method !== 'GET' ? apiConfig.body : undefined
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      setUploadStatus('complete');
      
      onComplete({
        sourceType: 'rest_api',
        data: data,
        endpoint: apiConfig.url,
        method: apiConfig.method
      });
    } catch (error) {
      console.error('API connection error:', error);
      setUploadStatus('error');
    }
  };

  const renderCloudUpload = (providerName: string) => (
    <div className="space-y-4">
      <Alert>
        <Cloud className="h-4 w-4" />
        <AlertDescription>
          {providerName} integration is coming soon. Currently in development.
        </AlertDescription>
      </Alert>
      
      <Button 
        onClick={() => handleCloudAuth(providerName)}
        disabled={true}
        variant="outline"
        className="w-full"
      >
        <Cloud className="w-4 h-4 mr-2" />
        Connect to {providerName}
      </Button>
    </div>
  );

  const renderApiUpload = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            className="w-full px-3 py-2 border border-slate-300 rounded-md"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="api-headers">Headers (JSON format)</Label>
        <Textarea
          id="api-headers"
          placeholder='{"Authorization": "Bearer your-token", "Content-Type": "application/json"}'
          value={apiConfig.headers}
          onChange={(e) => setApiConfig(prev => ({ ...prev, headers: e.target.value }))}
          rows={3}
        />
      </div>

      {apiConfig.method !== 'GET' && (
        <div>
          <Label htmlFor="api-body">Request Body</Label>
          <Textarea
            id="api-body"
            placeholder="Request body content"
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
          {/* File Upload Content Based on Selected Source */}
          {selectedSource === 'computer' && (
            <div className="mt-6">
              <div 
                {...getRootProps()} 
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}
                  ${uploadStatus === 'uploading' ? 'pointer-events-none opacity-50' : ''}
                `}
              >
                <input {...getInputProps()} />
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                {isDragActive ? (
                  <p className="text-lg font-medium text-blue-600 mb-2">Drop your file here</p>
                ) : (
                  <div>
                    <p className="text-lg font-medium text-slate-900 mb-2">
                      Drag & drop your file here, or click to browse
                    </p>
                    <p className="text-sm text-slate-500 mb-4">
                      Supports CSV, Excel (.xlsx, .xls), and JSON files up to {Math.round(maxSize / (1024 * 1024))}MB
                    </p>
                  </div>
                )}
                
                {serviceType === 'free_trial' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700">
                      <Gift className="w-4 h-4 inline mr-1" />
                      Free trial: Basic analysis with file size limit of {Math.round(maxSize / (1024 * 1024))}MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {selectedSource === 'google' && renderCloudUpload('Google Drive')}
          {selectedSource === 'microsoft' && renderCloudUpload('Microsoft OneDrive')}
          {selectedSource === 'apple' && renderCloudUpload('iCloud')}
          {selectedSource === 'rest_api' && renderApiUpload()}

          {/* Upload Progress and Status */}
          <div className="mt-6 space-y-4">
            {uploadStatus === 'uploading' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading {uploadedFile?.name}...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {uploadStatus === 'pii_check' && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-blue-600 animate-pulse" />
                  <span className="text-sm font-medium">Scanning for sensitive data...</span>
                </div>
                <div className="text-xs text-slate-500">
                  Detecting PII, SSN, addresses, and other sensitive information
                </div>
                <Progress value={100} className="animate-pulse" />
              </div>
            )}

            {uploadStatus === 'complete' && uploadedFile && (
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {uploadedFile.name} processed successfully
                </span>
              </div>
            )}

            {uploadStatus === 'error' && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Upload failed. Please try again with a valid file.
                </AlertDescription>
              </Alert>
            )}

            {uploadStatus === 'error' && (
              <div className="flex items-center space-x-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Upload failed. Please try again.</span>
              </div>
            )}
          </div>

          {/* Security Notice */}
          {uploadStatus === 'idle' && selectedSource === 'computer' && (
            <Alert className="mt-4">
              <Shield className="w-4 h-4" />
              <AlertDescription>
                Your files are scanned for malware and checked for sensitive data (PII). 
                {serviceType === 'free_trial' ? ' Trial uploads are automatically deleted after analysis.' : ''}
                Sensitive information is detected and you'll be asked for consent before processing.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* PII Detection Dialog */}
      {showPIIDialog && piiDetectionResult && (
        <PIIDetectionDialog
          isOpen={showPIIDialog}
          onClose={() => setShowPIIDialog(false)}
          piiResult={piiDetectionResult}
          onDecision={handlePIIDecision}
        />
      )}
    </div>
  );
}