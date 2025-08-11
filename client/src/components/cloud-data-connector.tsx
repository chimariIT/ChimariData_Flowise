import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Cloud, Database, FileText, Download, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CloudDataConnectorProps {
  onDataImported?: (data: any) => void;
}

interface CloudConfig {
  provider: 'aws' | 'azure' | 'gcp';
  credentials: {
    // AWS
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    bucket?: string;
    // Azure
    connectionString?: string;
    containerName?: string;
    // GCP
    serviceAccountKey?: string;
    bucketName?: string;
  };
}

interface CloudFile {
  name: string;
  path: string;
  size: number;
  lastModified: Date;
  contentType: string;
}

export default function CloudDataConnector({ onDataImported }: CloudDataConnectorProps) {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<'aws' | 'azure' | 'gcp'>('aws');
  const [config, setConfig] = useState<CloudConfig>({
    provider: 'aws',
    credentials: {}
  });
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const providers = [
    {
      value: 'aws',
      label: 'Amazon S3',
      description: 'Connect to AWS S3 buckets',
      icon: '☁️'
    },
    {
      value: 'azure',
      label: 'Azure Blob Storage',
      description: 'Connect to Azure storage containers',
      icon: '🔵'
    },
    {
      value: 'gcp',
      label: 'Google Cloud Storage',
      description: 'Connect to Google Cloud buckets',
      icon: '🟡'
    }
  ];

  const updateCredentials = (key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      provider: selectedProvider,
      credentials: {
        ...prev.credentials,
        [key]: value
      }
    }));
  };

  const testConnection = async () => {
    setConnectionStatus('testing');
    setConnectionMessage('');
    
    try {
      const response = await fetch('/api/cloud/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          ...config,
          provider: selectedProvider
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setConnectionStatus('connected');
        setConnectionMessage(result.message);
        toast({
          title: "Connection successful",
          description: result.message
        });
      } else {
        setConnectionStatus('error');
        setConnectionMessage(result.message);
        toast({
          title: "Connection failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionMessage(error.message);
      toast({
        title: "Connection error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const loadFiles = async () => {
    if (connectionStatus !== 'connected') {
      toast({
        title: "Not connected",
        description: "Please test connection first",
        variant: "destructive"
      });
      return;
    }

    setLoadingFiles(true);
    try {
      const response = await fetch('/api/cloud/list-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          config: { ...config, provider: selectedProvider }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setFiles(result.files);
        toast({
          title: "Files loaded",
          description: `Found ${result.files.length} files`
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        title: "Failed to load files",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoadingFiles(false);
    }
  };

  const downloadAndImportFile = async (file: CloudFile) => {
    setDownloadingFile(file.path);
    try {
      const response = await fetch('/api/cloud/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          config: { ...config, provider: selectedProvider },
          filePath: file.path
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "File imported",
          description: `Successfully imported ${file.name}`
        });
        
        if (onDataImported) {
          onDataImported(result.data);
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setDownloadingFile(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'testing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Cloud className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Cloud Data Connector
          </CardTitle>
          <CardDescription>
            Connect to cloud storage providers to import data files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Choose Provider</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                {providers.map((provider) => (
                  <Card 
                    key={provider.value}
                    className={`cursor-pointer transition-colors ${
                      selectedProvider === provider.value 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setSelectedProvider(provider.value as any);
                      setConnectionStatus('idle');
                      setFiles([]);
                    }}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl mb-2">{provider.icon}</div>
                      <h3 className="font-medium">{provider.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {provider.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credentials Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            {providers.find(p => p.value === selectedProvider)?.label} Configuration
          </CardTitle>
          <CardDescription>
            Enter your {selectedProvider.toUpperCase()} credentials to connect
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {selectedProvider === 'aws' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="access-key">Access Key ID</Label>
                    <Input
                      id="access-key"
                      type="password"
                      placeholder="Enter AWS Access Key ID"
                      value={config.credentials.accessKeyId || ''}
                      onChange={(e) => updateCredentials('accessKeyId', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="secret-key">Secret Access Key</Label>
                    <Input
                      id="secret-key"
                      type="password"
                      placeholder="Enter AWS Secret Access Key"
                      value={config.credentials.secretAccessKey || ''}
                      onChange={(e) => updateCredentials('secretAccessKey', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      placeholder="us-east-1"
                      value={config.credentials.region || ''}
                      onChange={(e) => updateCredentials('region', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bucket">Bucket Name</Label>
                    <Input
                      id="bucket"
                      placeholder="your-bucket-name"
                      value={config.credentials.bucket || ''}
                      onChange={(e) => updateCredentials('bucket', e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {selectedProvider === 'azure' && (
              <>
                <div>
                  <Label htmlFor="connection-string">Connection String</Label>
                  <Input
                    id="connection-string"
                    type="password"
                    placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                    value={config.credentials.connectionString || ''}
                    onChange={(e) => updateCredentials('connectionString', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="container">Container Name</Label>
                  <Input
                    id="container"
                    placeholder="your-container-name"
                    value={config.credentials.containerName || ''}
                    onChange={(e) => updateCredentials('containerName', e.target.value)}
                  />
                </div>
              </>
            )}

            {selectedProvider === 'gcp' && (
              <>
                <div>
                  <Label htmlFor="service-account">Service Account Key (JSON)</Label>
                  <Input
                    id="service-account"
                    type="password"
                    placeholder="Paste service account key JSON"
                    value={config.credentials.serviceAccountKey || ''}
                    onChange={(e) => updateCredentials('serviceAccountKey', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="bucket-name">Bucket Name</Label>
                  <Input
                    id="bucket-name"
                    placeholder="your-bucket-name"
                    value={config.credentials.bucketName || ''}
                    onChange={(e) => updateCredentials('bucketName', e.target.value)}
                  />
                </div>
              </>
            )}

            {connectionMessage && (
              <div className={`p-3 rounded-lg text-sm ${
                connectionStatus === 'connected' 
                  ? 'bg-green-50 text-green-800' 
                  : connectionStatus === 'error'
                  ? 'bg-red-50 text-red-800'
                  : 'bg-blue-50 text-blue-800'
              }`}>
                {connectionMessage}
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={testConnection}
                disabled={connectionStatus === 'testing'}
                variant="outline"
              >
                {connectionStatus === 'testing' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>

              {connectionStatus === 'connected' && (
                <Button onClick={loadFiles} disabled={loadingFiles}>
                  {loadingFiles ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Load Files
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Files</CardTitle>
            <CardDescription>
              Select files to import into your project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((file) => (
                <div 
                  key={file.path}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="font-medium">{file.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatFileSize(file.size)} • {new Date(file.lastModified).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant="outline">{file.contentType}</Badge>
                  </div>
                  
                  <Button
                    size="sm"
                    onClick={() => downloadAndImportFile(file)}
                    disabled={downloadingFile === file.path}
                  >
                    {downloadingFile === file.path ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Import
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}