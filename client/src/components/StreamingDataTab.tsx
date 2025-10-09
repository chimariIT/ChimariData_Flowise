import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCreateStreamingSource, useTestStreamingConnection } from "@/hooks/useLiveDataSources";
import { 
  Radio, 
  Wifi, 
  Database, 
  Play, 
  AlertCircle, 
  CheckCircle,
  Settings,
  Info
} from "lucide-react";

const streamingSourceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  protocol: z.enum(['websocket', 'sse', 'poll']),
  endpoint: z.string().url("Please enter a valid URL"),
  headers: z.string().optional(),
  parseFormat: z.enum(['json', 'text']),
  jsonPath: z.string().optional(),
  delimiter: z.string().optional(),
  timestampPath: z.string().optional(),
  dedupeKeyPath: z.string().optional(),
  batchSize: z.number().min(1).max(10000),
  flushMs: z.number().min(1000).max(300000),
  maxBuffer: z.number().min(100).max(100000),
  pollInterval: z.number().min(1000).max(600000)
});

type StreamingSourceFormData = z.infer<typeof streamingSourceSchema>;

interface StreamingDataTabProps {
  projectId?: string;
  onComplete: (result: any) => void;
}

export function StreamingDataTab({ projectId, onComplete }: StreamingDataTabProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string>('');
  const { toast } = useToast();
  
  const createStreamingSource = useCreateStreamingSource();
  const testConnection = useTestStreamingConnection();

  const form = useForm<StreamingSourceFormData>({
    resolver: zodResolver(streamingSourceSchema),
    defaultValues: {
      protocol: 'poll',
      parseFormat: 'json',
      batchSize: 100,
      flushMs: 10000,
      maxBuffer: 10000,
      pollInterval: 30000
    }
  });

  const watchedProtocol = form.watch('protocol');
  const watchedEndpoint = form.watch('endpoint');

  const protocolOptions = [
    {
      value: 'websocket',
      label: 'WebSocket',
      description: 'Real-time bidirectional connection',
      icon: Radio,
      recommended: 'Real-time data feeds',
      pros: ['Lowest latency', 'Real-time updates', 'Efficient'],
      cons: ['Complex setup', 'Requires persistent connection']
    },
    {
      value: 'sse',
      label: 'Server-Sent Events',
      description: 'One-way server push over HTTP',
      icon: Wifi,
      recommended: 'Event streams, notifications',
      pros: ['Simple setup', 'Auto-reconnection', 'HTTP-based'],
      cons: ['One-way only', 'Limited browser support']
    },
    {
      value: 'poll',
      label: 'HTTP Polling',
      description: 'Periodic requests to REST endpoints',
      icon: Database,
      recommended: 'REST APIs, most common',
      pros: ['Simple', 'Wide compatibility', 'Easy debugging'],
      cons: ['Higher latency', 'More requests']
    }
  ];

  const handleTestConnection = async () => {
    const endpoint = form.getValues('endpoint');
    const protocol = form.getValues('protocol');
    const headers = form.getValues('headers');

    if (!endpoint) {
      toast({
        title: "Missing Endpoint",
        description: "Please enter an endpoint URL first",
        variant: "destructive"
      });
      return;
    }

    setConnectionStatus('testing');
    setConnectionError('');

    try {
      let parsedHeaders = {};
      if (headers) {
        parsedHeaders = JSON.parse(headers);
      }

      await testConnection.mutateAsync({
        protocol,
        endpoint,
        headers: parsedHeaders
      });

      setConnectionStatus('success');
      toast({
        title: "Connection Successful",
        description: "Successfully connected to the streaming endpoint"
      });
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionError(error.message);
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const onSubmit = async (data: StreamingSourceFormData) => {
    if (!projectId) {
      toast({
        title: "Missing Project",
        description: "A project is required to create streaming sources",
        variant: "destructive"
      });
      return;
    }

    try {
      // Parse headers if provided
      let parsedHeaders = {};
      if (data.headers) {
        try {
          parsedHeaders = JSON.parse(data.headers);
        } catch (error) {
          throw new Error("Invalid JSON format in headers");
        }
      }

      // Create dataset first (in real implementation, this would be handled by the backend)
      const datasetName = data.name || `Stream from ${new URL(data.endpoint).hostname}`;
      
      await createStreamingSource.mutateAsync({
        name: data.name,
        description: data.description,
        datasetId: `temp-${Date.now()}`, // This would be a real dataset ID
        protocol: data.protocol,
        endpoint: data.endpoint,
        headers: parsedHeaders,
        parseSpec: {
          format: data.parseFormat,
          jsonPath: data.jsonPath,
          delimiter: data.delimiter,
          timestampPath: data.timestampPath,
          dedupeKeyPath: data.dedupeKeyPath
        },
        batchSize: data.batchSize,
        flushMs: data.flushMs,
        maxBuffer: data.maxBuffer,
        pollInterval: data.pollInterval
      });

      onComplete({
        success: true,
        type: 'streaming_source',
        name: data.name,
        protocol: data.protocol,
        endpoint: data.endpoint
      });
    } catch (error: any) {
      toast({
        title: "Failed to Create Streaming Source",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Radio className="h-6 w-6 text-purple-600" />
          Configure Streaming Data Source
        </h2>
        <p className="text-muted-foreground mt-2">
          Connect to live data streams for real-time analysis
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Settings</TabsTrigger>
              <TabsTrigger value="parsing">Data Parsing</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Configuration</CardTitle>
                  <CardDescription>
                    Configure the basic settings for your streaming data source
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="My Streaming Source" data-testid="input-source-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Description of your streaming source..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="protocol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Connection Protocol</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid grid-cols-1 gap-4"
                          >
                            {protocolOptions.map((option) => {
                              const Icon = option.icon;
                              return (
                                <div key={option.value} className="flex items-center space-x-2">
                                  <RadioGroupItem value={option.value} id={option.value} data-testid={`radio-protocol-${option.value}`} />
                                  <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                                    <Card className={`p-4 ${field.value === option.value ? 'ring-2 ring-primary' : ''}`}>
                                      <div className="flex items-start space-x-3">
                                        <Icon className="w-5 h-5 text-primary mt-1" />
                                        <div className="flex-1">
                                          <div className="font-medium">{option.label}</div>
                                          <div className="text-sm text-muted-foreground">{option.description}</div>
                                          <div className="text-xs text-muted-foreground mt-1">Best for: {option.recommended}</div>
                                        </div>
                                      </div>
                                    </Card>
                                  </Label>
                                </div>
                              );
                            })}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endpoint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endpoint URL</FormLabel>
                        <FormControl>
                          <div className="flex space-x-2">
                            <Input 
                              {...field} 
                              placeholder={
                                watchedProtocol === 'websocket' ? 'wss://api.example.com/stream' :
                                watchedProtocol === 'sse' ? 'https://api.example.com/events' :
                                'https://api.example.com/data'
                              }
                              data-testid="input-endpoint"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleTestConnection}
                              disabled={!watchedEndpoint || connectionStatus === 'testing'}
                              data-testid="button-test-connection"
                            >
                              {connectionStatus === 'testing' ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                                  Testing...
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 mr-2" />
                                  Test
                                </>
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Enter the URL for your streaming endpoint
                        </FormDescription>
                        <FormMessage />
                        
                        {connectionStatus === 'success' && (
                          <Alert className="mt-2 border-green-200 bg-green-50">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                              Connection successful! Endpoint is reachable.
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {connectionStatus === 'error' && (
                          <Alert variant="destructive" className="mt-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              Connection failed: {connectionError}
                            </AlertDescription>
                          </Alert>
                        )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="headers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authentication Headers (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder='{"Authorization": "Bearer your-token", "X-API-Key": "your-key"}'
                            data-testid="input-headers"
                          />
                        </FormControl>
                        <FormDescription>
                          JSON object with headers for authentication (e.g., API keys, tokens)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="parsing" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Data Parsing Configuration</CardTitle>
                  <CardDescription>
                    Configure how incoming data should be parsed and processed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="parseFormat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Format</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex space-x-4"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="json" id="json" />
                              <Label htmlFor="json">JSON</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="text" id="text" />
                              <Label htmlFor="text">Text/CSV</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="jsonPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>JSON Path (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="$.data.items[*]" 
                            disabled={form.watch('parseFormat') !== 'json'}
                          />
                        </FormControl>
                        <FormDescription>
                          JSONPath expression to extract data from JSON responses
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="delimiter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Delimiter (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="," 
                            disabled={form.watch('parseFormat') !== 'text'}
                          />
                        </FormControl>
                        <FormDescription>
                          Delimiter for parsing text/CSV data
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timestampPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timestamp Field (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="$.timestamp or timestamp" />
                        </FormControl>
                        <FormDescription>
                          Field containing timestamp information
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dedupeKeyPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deduplication Key (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="$.id or id" />
                        </FormControl>
                        <FormDescription>
                          Field to use for deduplicating records
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>
                    Fine-tune performance and batching behavior
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="batchSize"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Batch Size</FormLabel>
                          <Badge variant="secondary">{field.value}</Badge>
                        </div>
                        <FormControl>
                          <Slider
                            min={1}
                            max={10000}
                            step={10}
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                          />
                        </FormControl>
                        <FormDescription>
                          Number of records to batch before processing (1-10,000)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="flushMs"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Flush Interval (ms)</FormLabel>
                          <Badge variant="secondary">{field.value.toLocaleString()}</Badge>
                        </div>
                        <FormControl>
                          <Slider
                            min={1000}
                            max={300000}
                            step={1000}
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum time to wait before flushing batch (1s-5min)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxBuffer"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Max Buffer Size</FormLabel>
                          <Badge variant="secondary">{field.value.toLocaleString()}</Badge>
                        </div>
                        <FormControl>
                          <Slider
                            min={100}
                            max={100000}
                            step={100}
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum records to buffer in memory (100-100,000)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedProtocol === 'poll' && (
                    <FormField
                      control={form.control}
                      name="pollInterval"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Poll Interval (ms)</FormLabel>
                            <Badge variant="secondary">{(field.value / 1000).toFixed(1)}s</Badge>
                          </div>
                          <FormControl>
                            <Slider
                              min={1000}
                              max={600000}
                              step={1000}
                              value={[field.value]}
                              onValueChange={(value) => field.onChange(value[0])}
                            />
                          </FormControl>
                          <FormDescription>
                            How often to poll the endpoint (1s-10min)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex space-x-2">
            <Button
              type="submit"
              disabled={createStreamingSource.isPending}
              className="flex-1"
              data-testid="button-create-source"
            >
              {createStreamingSource.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4 mr-2" />
                  Create Streaming Source
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}