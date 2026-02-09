import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import {
  Code,
  Globe,
  AlertCircle,
  Loader2,
  Shield,
  Eye,
  Download,
  Plus,
  Trash2,
} from "lucide-react";

interface APIConnectorTabProps {
  projectId: string | null;
  onComplete: (result: any) => void;
}

export function APIConnectorTab({ projectId, onComplete }: APIConnectorTabProps) {
  const { toast } = useToast();
  const [apiType, setApiType] = useState<'rest_api' | 'graphql'>('rest_api');
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [previewData, setPreviewData] = useState<any[] | null>(null);

  // REST API fields
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [body, setBody] = useState('');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'basic'>('none');
  const [bearerToken, setBearerToken] = useState('');
  const [basicUsername, setBasicUsername] = useState('');
  const [basicPassword, setBasicPassword] = useState('');

  // GraphQL fields
  const [gqlEndpoint, setGqlEndpoint] = useState('');
  const [gqlQuery, setGqlQuery] = useState('query {\n  \n}');
  const [gqlVariables, setGqlVariables] = useState('{}');
  const [gqlAuthType, setGqlAuthType] = useState<'none' | 'bearer' | 'api_key'>('none');
  const [gqlToken, setGqlToken] = useState('');
  const [gqlApiKeyHeader, setGqlApiKeyHeader] = useState('X-API-Key');
  const [gqlApiKeyValue, setGqlApiKeyValue] = useState('');

  if (!projectId) {
    return (
      <div className="p-6 text-center">
        <Code className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <p className="text-gray-600 font-medium">Project Required</p>
        <p className="text-sm text-gray-500 mt-1">
          Please create a project first by uploading a file, then connect API sources here.
        </p>
      </div>
    );
  }

  const buildConfig = () => {
    if (apiType === 'graphql') {
      let parsedVars = {};
      try {
        parsedVars = gqlVariables.trim() ? JSON.parse(gqlVariables) : {};
      } catch {
        throw new Error('Invalid GraphQL variables JSON');
      }

      const config: any = {
        endpoint: gqlEndpoint,
        query: gqlQuery,
        variables: parsedVars,
      };

      if (gqlAuthType === 'bearer' && gqlToken) {
        config.auth = { type: 'bearer', token: gqlToken };
      } else if (gqlAuthType === 'api_key' && gqlApiKeyValue) {
        config.auth = { type: 'api_key', apiKeyHeader: gqlApiKeyHeader, apiKeyValue: gqlApiKeyValue };
      }

      return config;
    }

    // REST API
    const headerObj: Record<string, string> = {};
    headers.forEach(h => {
      if (h.key.trim()) headerObj[h.key.trim()] = h.value;
    });

    const config: any = {
      url,
      method,
      headers: Object.keys(headerObj).length > 0 ? headerObj : undefined,
    };

    if (method === 'POST' && body.trim()) {
      try {
        config.body = JSON.parse(body);
      } catch {
        config.body = body;
      }
    }

    if (authType === 'bearer' && bearerToken) {
      config.auth = { type: 'bearer', token: bearerToken };
    } else if (authType === 'basic' && basicUsername) {
      config.auth = { type: 'basic', username: basicUsername, password: basicPassword };
    }

    return config;
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    setError('');
    setPreviewData(null);

    try {
      const config = buildConfig();
      const result = await apiClient.ingestDataSource({
        sourceType: apiType,
        projectId: projectId!,
        config,
        label: `Preview_${apiType}`,
      });

      if (result.success) {
        setPreviewData(result.preview || []);
        toast({
          title: "Preview Ready",
          description: `Fetched ${result.recordCount} records. Review below.`,
        });
      } else {
        throw new Error(result.error || 'Preview failed');
      }
    } catch (err: any) {
      setError(err.message || 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    setError('');

    try {
      const config = buildConfig();
      const label = apiType === 'graphql' ? `GraphQL_${gqlEndpoint}` : `API_${url}`;

      const result = await apiClient.ingestDataSource({
        sourceType: apiType,
        projectId: projectId!,
        config,
        label,
      });

      if (result.success) {
        toast({
          title: "Data Imported",
          description: `Successfully imported ${result.recordCount} records from API.`,
        });
        onComplete(result);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (err: any) {
      setError(err.message || 'Import failed');
      toast({
        title: "Import Failed",
        description: err.message || 'Could not import data from API',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addHeader = () => setHeaders(prev => [...prev, { key: '', value: '' }]);
  const removeHeader = (index: number) => setHeaders(prev => prev.filter((_, i) => i !== index));
  const updateHeader = (index: number, field: 'key' | 'value', val: string) => {
    setHeaders(prev => prev.map((h, i) => i === index ? { ...h, [field]: val } : h));
  };

  return (
    <div className="space-y-4 pt-4">
      <Alert className="border-blue-200 bg-blue-50">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          API credentials are used for this session only and are not stored.
        </AlertDescription>
      </Alert>

      <Tabs value={apiType} onValueChange={v => { setApiType(v as any); setError(''); setPreviewData(null); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rest_api" className="text-xs">
            <Globe className="w-3 h-3 mr-1" /> REST API
          </TabsTrigger>
          <TabsTrigger value="graphql" className="text-xs">
            <Code className="w-3 h-3 mr-1" /> GraphQL
          </TabsTrigger>
        </TabsList>

        {/* REST API Form */}
        <TabsContent value="rest_api">
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="w-24">
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={v => setMethod(v as 'GET' | 'POST')}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">URL</Label>
                <Input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://api.example.com/data"
                  className="text-sm"
                />
              </div>
            </div>

            {/* Headers */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Headers</Label>
                <Button variant="ghost" size="sm" onClick={addHeader} className="h-6 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              {headers.map((h, i) => (
                <div key={i} className="flex gap-2 mt-1">
                  <Input
                    value={h.key}
                    onChange={e => updateHeader(i, 'key', e.target.value)}
                    placeholder="Header name"
                    className="text-xs flex-1"
                  />
                  <Input
                    value={h.value}
                    onChange={e => updateHeader(i, 'value', e.target.value)}
                    placeholder="Value"
                    className="text-xs flex-1"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeHeader(i)} className="h-8 w-8 p-0">
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Request Body (POST only) */}
            {method === 'POST' && (
              <div>
                <Label className="text-xs">Request Body (JSON)</Label>
                <Textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="text-sm font-mono h-20"
                />
              </div>
            )}

            {/* Auth */}
            <div>
              <Label className="text-xs">Authentication</Label>
              <Select value={authType} onValueChange={v => setAuthType(v as any)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {authType === 'bearer' && (
              <Input
                type="password"
                value={bearerToken}
                onChange={e => setBearerToken(e.target.value)}
                placeholder="Bearer token"
                className="text-sm"
              />
            )}
            {authType === 'basic' && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={basicUsername}
                  onChange={e => setBasicUsername(e.target.value)}
                  placeholder="Username"
                  className="text-sm"
                />
                <Input
                  type="password"
                  value={basicPassword}
                  onChange={e => setBasicPassword(e.target.value)}
                  placeholder="Password"
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </TabsContent>

        {/* GraphQL Form */}
        <TabsContent value="graphql">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Endpoint URL</Label>
              <Input
                value={gqlEndpoint}
                onChange={e => setGqlEndpoint(e.target.value)}
                placeholder="https://api.example.com/graphql"
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Query</Label>
              <Textarea
                value={gqlQuery}
                onChange={e => setGqlQuery(e.target.value)}
                placeholder={'query {\n  users {\n    id\n    name\n    email\n  }\n}'}
                className="text-sm font-mono h-32"
              />
            </div>
            <div>
              <Label className="text-xs">Variables (JSON)</Label>
              <Textarea
                value={gqlVariables}
                onChange={e => setGqlVariables(e.target.value)}
                placeholder='{"limit": 100}'
                className="text-sm font-mono h-16"
              />
            </div>

            {/* GraphQL Auth */}
            <div>
              <Label className="text-xs">Authentication</Label>
              <Select value={gqlAuthType} onValueChange={v => setGqlAuthType(v as any)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {gqlAuthType === 'bearer' && (
              <Input
                type="password"
                value={gqlToken}
                onChange={e => setGqlToken(e.target.value)}
                placeholder="Bearer token"
                className="text-sm"
              />
            )}
            {gqlAuthType === 'api_key' && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={gqlApiKeyHeader}
                  onChange={e => setGqlApiKeyHeader(e.target.value)}
                  placeholder="Header name (e.g., X-API-Key)"
                  className="text-sm"
                />
                <Input
                  type="password"
                  value={gqlApiKeyValue}
                  onChange={e => setGqlApiKeyValue(e.target.value)}
                  placeholder="API key value"
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Data */}
      {previewData && previewData.length > 0 && (
        <div className="border rounded-lg p-3 max-h-48 overflow-auto">
          <p className="text-xs font-medium text-gray-700 mb-2">Preview ({previewData.length} rows)</p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b">
                  {Object.keys(previewData[0]).slice(0, 6).map(key => (
                    <th key={key} className="text-left p-1 font-medium text-gray-600">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Object.keys(previewData[0]).slice(0, 6).map(key => (
                      <td key={key} className="p-1 text-gray-800 truncate max-w-[120px]">
                        {String(row[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handlePreview}
          disabled={isPreviewing || isLoading}
          className="flex-1"
        >
          {isPreviewing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching...</>
          ) : (
            <><Eye className="w-4 h-4 mr-2" /> Preview</>
          )}
        </Button>
        <Button
          onClick={handleImport}
          disabled={isLoading || isPreviewing}
          className="flex-1"
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
          ) : (
            <><Download className="w-4 h-4 mr-2" /> Import Data</>
          )}
        </Button>
      </div>
    </div>
  );
}
