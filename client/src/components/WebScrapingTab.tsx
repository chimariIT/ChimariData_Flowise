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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCreateScrapingJob, useTestScrapingExtraction } from "@/hooks/useLiveDataSources";
import { 
  Globe, 
  Code, 
  Clock, 
  Play, 
  AlertCircle, 
  CheckCircle,
  Settings,
  Info,
  Calendar,
  Shield,
  Search,
  Target,
  Zap
} from "lucide-react";

const scrapingJobSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  strategy: z.enum(['http', 'puppeteer']),
  targetUrl: z.string().url("Please enter a valid URL"),
  schedule: z.string().optional(),
  extractionType: z.enum(['selectors', 'table', 'json']),
  selectors: z.string().optional(),
  tableSelector: z.string().optional(),
  jsonPath: z.string().optional(),
  followPagination: z.boolean(),
  nextPageSelector: z.string().optional(),
  maxPages: z.number().min(1).max(100),
  waitTime: z.number().min(0).max(30000),
  rateLimitRPM: z.number().min(1).max(300),
  respectRobots: z.boolean(),
  loginRequired: z.boolean(),
  loginType: z.enum(['form', 'basic', 'header']).optional(),
  usernameSelector: z.string().optional(),
  passwordSelector: z.string().optional(),
  loginHeaders: z.string().optional()
});

type ScrapingJobFormData = z.infer<typeof scrapingJobSchema>;

interface WebScrapingTabProps {
  projectId?: string;
  onComplete: (result: any) => void;
}

export function WebScrapingTab({ projectId, onComplete }: WebScrapingTabProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResults, setExtractionResults] = useState<any[]>([]);
  const [extractionStatus, setExtractionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [extractionError, setExtractionError] = useState<string>('');
  const { toast } = useToast();
  
  const createScrapingJob = useCreateScrapingJob();
  const testExtraction = useTestScrapingExtraction();

  const form = useForm<ScrapingJobFormData>({
    resolver: zodResolver(scrapingJobSchema),
    defaultValues: {
      strategy: 'http',
      extractionType: 'selectors',
      followPagination: false,
      maxPages: 10,
      waitTime: 2000,
      rateLimitRPM: 60,
      respectRobots: true,
      loginRequired: false,
      loginType: 'form'
    }
  });

  const watchedStrategy = form.watch('strategy');
  const watchedExtractionType = form.watch('extractionType');
  const watchedFollowPagination = form.watch('followPagination');
  const watchedLoginRequired = form.watch('loginRequired');
  const watchedTargetUrl = form.watch('targetUrl');

  const strategyOptions = [
    {
      value: 'http',
      label: 'HTTP Client',
      description: 'Fast static content scraping',
      icon: Zap,
      recommended: 'Static websites, APIs, simple pages',
      pros: ['Faster execution', 'Lower resource usage', 'Simple setup'],
      cons: ['No JavaScript support', 'Limited dynamic content'],
      useCases: ['News articles', 'Product listings', 'Blog posts']
    },
    {
      value: 'puppeteer',
      label: 'Browser Automation',
      description: 'Full browser with JavaScript support',
      icon: Globe,
      recommended: 'Dynamic content, SPAs, complex interactions',
      pros: ['JavaScript execution', 'Dynamic content', 'Full browser features'],
      cons: ['Slower execution', 'Higher resource usage', 'More complex'],
      useCases: ['React/Vue apps', 'Infinite scroll', 'Login required']
    }
  ];

  const schedulePresets = [
    { label: 'Every hour', value: '0 * * * *', description: 'Run at the start of every hour' },
    { label: 'Every 6 hours', value: '0 */6 * * *', description: 'Run every 6 hours' },
    { label: 'Daily at midnight', value: '0 0 * * *', description: 'Run once per day at midnight' },
    { label: 'Daily at 9 AM', value: '0 9 * * *', description: 'Run every day at 9:00 AM' },
    { label: 'Weekly (Mondays)', value: '0 0 * * 1', description: 'Run every Monday at midnight' },
    { label: 'Custom', value: 'custom', description: 'Enter your own cron expression' }
  ];

  const extractionTypeOptions = [
    {
      value: 'selectors',
      label: 'CSS Selectors',
      description: 'Extract specific elements using CSS selectors',
      example: '{ "title": "h1", "price": ".price", "description": ".content p" }'
    },
    {
      value: 'table',
      label: 'Table Data',
      description: 'Extract structured data from HTML tables',
      example: 'table.data-table or #results-table'
    },
    {
      value: 'json',
      label: 'JSON Path',
      description: 'Extract data from JSON responses or JSON-LD',
      example: '$.products[*].name or $..price'
    }
  ];

  const handleTestExtraction = async () => {
    const targetUrl = form.getValues('targetUrl');
    const strategy = form.getValues('strategy');
    const extractionType = form.getValues('extractionType');

    if (!targetUrl) {
      toast({
        title: "Missing URL",
        description: "Please enter a target URL first",
        variant: "destructive"
      });
      return;
    }

    setExtractionStatus('testing');
    setExtractionError('');
    setExtractionResults([]);

    try {
      // Build extraction spec based on form data
      let extractionSpec = {};
      
      if (extractionType === 'selectors' && form.getValues('selectors')) {
        try {
          extractionSpec = { selectors: JSON.parse(form.getValues('selectors') || '{}') };
        } catch (error) {
          throw new Error("Invalid JSON format in selectors");
        }
      } else if (extractionType === 'table' && form.getValues('tableSelector')) {
        extractionSpec = { tableSelector: form.getValues('tableSelector') };
      } else if (extractionType === 'json' && form.getValues('jsonPath')) {
        extractionSpec = { jsonPath: form.getValues('jsonPath') };
      } else {
        // Use default selectors for testing
        extractionSpec = { 
          selectors: {
            title: 'h1, title, .title',
            text: 'p, .content, .description'
          }
        };
      }

      const results = await testExtraction.mutateAsync({
        strategy,
        targetUrl,
        extractionSpec
      });

      setExtractionResults(results.results || []);
      setExtractionStatus('success');
      
      toast({
        title: "Extraction Test Successful",
        description: `Found ${results.results?.length || 0} items`
      });
    } catch (error: any) {
      setExtractionStatus('error');
      setExtractionError(error.message);
      toast({
        title: "Extraction Test Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const onSubmit = async (data: ScrapingJobFormData) => {
    if (!projectId) {
      toast({
        title: "Missing Project",
        description: "A project is required to create scraping jobs",
        variant: "destructive"
      });
      return;
    }

    try {
      // Build extraction spec
      let extractionSpec: any = {};
      
      if (data.extractionType === 'selectors' && data.selectors) {
        try {
          extractionSpec.selectors = JSON.parse(data.selectors);
        } catch (error) {
          throw new Error("Invalid JSON format in selectors");
        }
      } else if (data.extractionType === 'table' && data.tableSelector) {
        extractionSpec.tableSelector = data.tableSelector;
      } else if (data.extractionType === 'json' && data.jsonPath) {
        extractionSpec.jsonPath = data.jsonPath;
      }

      // Add pagination settings
      if (data.followPagination && data.nextPageSelector) {
        extractionSpec.followPagination = {
          enabled: true,
          nextSelector: data.nextPageSelector,
          maxPages: data.maxPages,
          waitTime: data.waitTime
        };
      }

      // Build login spec
      let loginSpec = undefined;
      if (data.loginRequired) {
        loginSpec = {
          type: data.loginType!
        };

        if (data.loginType === 'form') {
          loginSpec = {
            ...loginSpec,
            usernameSelector: data.usernameSelector,
            passwordSelector: data.passwordSelector
          };
        } else if (data.loginType === 'header' && data.loginHeaders) {
          try {
            loginSpec.headers = JSON.parse(data.loginHeaders);
          } catch (error) {
            throw new Error("Invalid JSON format in login headers");
          }
        }
      }

      await createScrapingJob.mutateAsync({
        name: data.name,
        description: data.description,
        datasetId: `temp-${Date.now()}`, // This would be a real dataset ID
        strategy: data.strategy,
        targetUrl: data.targetUrl,
        schedule: data.schedule,
        extractionSpec,
        loginSpec,
        rateLimitRPM: data.rateLimitRPM,
        maxConcurrency: 1,
        respectRobots: data.respectRobots
      });

      onComplete({
        success: true,
        type: 'scraping_job',
        name: data.name,
        strategy: data.strategy,
        targetUrl: data.targetUrl
      });
    } catch (error: any) {
      toast({
        title: "Failed to Create Scraping Job",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Globe className="h-6 w-6 text-orange-600" />
          Configure Web Scraping Job
        </h2>
        <p className="text-muted-foreground mt-2">
          Extract data from websites with scheduled scraping jobs
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Settings</TabsTrigger>
              <TabsTrigger value="extraction">Data Extraction</TabsTrigger>
              <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Configuration</CardTitle>
                  <CardDescription>
                    Configure the basic settings for your web scraping job
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="My Scraping Job" data-testid="input-job-name" />
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
                          <Input {...field} placeholder="Description of your scraping job..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="strategy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scraping Strategy</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid grid-cols-1 gap-4"
                          >
                            {strategyOptions.map((option) => {
                              const Icon = option.icon;
                              return (
                                <div key={option.value} className="flex items-center space-x-2">
                                  <RadioGroupItem value={option.value} id={option.value} data-testid={`radio-strategy-${option.value}`} />
                                  <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                                    <Card className={`p-4 ${field.value === option.value ? 'ring-2 ring-primary' : ''}`}>
                                      <div className="flex items-start space-x-3">
                                        <Icon className="w-5 h-5 text-primary mt-1" />
                                        <div className="flex-1">
                                          <div className="font-medium">{option.label}</div>
                                          <div className="text-sm text-muted-foreground mb-2">{option.description}</div>
                                          <div className="text-xs text-muted-foreground mb-1">Best for: {option.recommended}</div>
                                          <div className="text-xs text-muted-foreground">
                                            Use cases: {option.useCases.join(', ')}
                                          </div>
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
                    name="targetUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target URL</FormLabel>
                        <FormControl>
                          <div className="flex space-x-2">
                            <Input 
                              {...field} 
                              placeholder="https://example.com/data"
                              data-testid="input-target-url"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleTestExtraction}
                              disabled={!watchedTargetUrl || extractionStatus === 'testing'}
                              data-testid="button-test-extraction"
                            >
                              {extractionStatus === 'testing' ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                                  Testing...
                                </>
                              ) : (
                                <>
                                  <Search className="w-4 h-4 mr-2" />
                                  Test
                                </>
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Enter the URL of the website to scrape
                        </FormDescription>
                        <FormMessage />
                        
                        {extractionStatus === 'success' && extractionResults.length > 0 && (
                          <Alert className="mt-2 border-green-200 bg-green-50">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                              Extraction successful! Found {extractionResults.length} items. Check the extraction tab for details.
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {extractionStatus === 'error' && (
                          <Alert variant="destructive" className="mt-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              Extraction failed: {extractionError}
                            </AlertDescription>
                          </Alert>
                        )}
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="extraction" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Data Extraction Configuration</CardTitle>
                  <CardDescription>
                    Configure how data should be extracted from the target website
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="extractionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Extraction Method</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid grid-cols-1 gap-3"
                          >
                            {extractionTypeOptions.map((option) => (
                              <div key={option.value} className="flex items-center space-x-2">
                                <RadioGroupItem value={option.value} id={option.value} />
                                <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                                  <div className={`p-3 rounded-lg border ${field.value === option.value ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                                    <div className="font-medium">{option.label}</div>
                                    <div className="text-sm text-muted-foreground">{option.description}</div>
                                    <div className="text-xs text-muted-foreground mt-1 font-mono bg-gray-50 p-1 rounded">
                                      Example: {option.example}
                                    </div>
                                  </div>
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedExtractionType === 'selectors' && (
                    <FormField
                      control={form.control}
                      name="selectors"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CSS Selectors (JSON)</FormLabel>
                          <FormControl>
                            <textarea 
                              {...field} 
                              placeholder='{"title": "h1", "price": ".price", "description": ".content p"}'
                              className="min-h-[100px] w-full p-3 border rounded-md font-mono text-sm"
                              data-testid="textarea-selectors"
                            />
                          </FormControl>
                          <FormDescription>
                            JSON object mapping field names to CSS selectors
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {watchedExtractionType === 'table' && (
                    <FormField
                      control={form.control}
                      name="tableSelector"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Table Selector</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="table.data-table" />
                          </FormControl>
                          <FormDescription>
                            CSS selector for the table containing your data
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {watchedExtractionType === 'json' && (
                    <FormField
                      control={form.control}
                      name="jsonPath"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>JSON Path</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="$.products[*] or $..price" />
                          </FormControl>
                          <FormDescription>
                            JSONPath expression to extract data from JSON responses
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <Separator />

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="followPagination"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Follow Pagination</FormLabel>
                            <FormDescription>
                              Automatically follow "Next" links to scrape multiple pages
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch 
                              checked={field.value} 
                              onCheckedChange={field.onChange}
                              data-testid="switch-pagination"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {watchedFollowPagination && (
                      <>
                        <FormField
                          control={form.control}
                          name="nextPageSelector"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Next Page Selector</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder='a[aria-label="Next"] or .pagination .next' />
                              </FormControl>
                              <FormDescription>
                                CSS selector for the "Next" page link
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="maxPages"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Max Pages</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    {...field} 
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    min={1}
                                    max={100}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Maximum pages to follow (1-100)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="waitTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Wait Time (ms)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    {...field} 
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    min={0}
                                    max={30000}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Delay between pages (0-30000ms)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {extractionResults.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Extraction Preview</h4>
                      <div className="max-h-60 overflow-auto border rounded-lg p-4 bg-gray-50">
                        <pre className="text-xs">{JSON.stringify(extractionResults.slice(0, 3), null, 2)}</pre>
                        {extractionResults.length > 3 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            ... and {extractionResults.length - 3} more items
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scheduling" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Scheduling Configuration</CardTitle>
                  <CardDescription>
                    Set up when and how often the scraping job should run
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="schedule"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Schedule</FormLabel>
                        <FormControl>
                          <Select onValueChange={(value) => {
                            if (value === 'custom') {
                              field.onChange('');
                            } else {
                              field.onChange(value === 'none' ? '' : value);
                            }
                          }}>
                            <SelectTrigger data-testid="select-schedule">
                              <SelectValue placeholder="Select schedule or leave empty to run once" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Run once (no schedule)</SelectItem>
                              {schedulePresets.map((preset) => (
                                <SelectItem key={preset.value} value={preset.value}>
                                  <div>
                                    <div>{preset.label}</div>
                                    <div className="text-xs text-muted-foreground">{preset.description}</div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription>
                          Choose a preset schedule or leave empty to run the job once
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch('schedule') === '' && form.watch('schedule') !== undefined && (
                    <FormField
                      control={form.control}
                      name="schedule"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom Cron Expression</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="0 9 * * 1-5 (Monday-Friday at 9 AM)" />
                          </FormControl>
                          <FormDescription>
                            Enter a custom cron expression. Format: minute hour day month weekday
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Cron Expression Help:</strong>
                      <br />• <code>0 * * * *</code> - Every hour
                      <br />• <code>0 9 * * *</code> - Every day at 9 AM
                      <br />• <code>0 9 * * 1-5</code> - Weekdays at 9 AM
                      <br />• <code>*/15 * * * *</code> - Every 15 minutes
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>
                    Configure rate limiting, authentication, and other advanced options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="rateLimitRPM"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Rate Limit (requests/minute)</FormLabel>
                          <Badge variant="secondary">{field.value}</Badge>
                        </div>
                        <FormControl>
                          <Slider
                            min={1}
                            max={300}
                            step={5}
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                          />
                        </FormControl>
                        <FormDescription>
                          Limit requests per minute to be respectful to the target website (1-300)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="respectRobots"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Respect robots.txt</FormLabel>
                          <FormDescription>
                            Check and respect the website's robots.txt rules
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                            data-testid="switch-robots"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <FormField
                    control={form.control}
                    name="loginRequired"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Authentication Required</FormLabel>
                          <FormDescription>
                            The website requires login or authentication
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                            data-testid="switch-login-required"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {watchedLoginRequired && (
                    <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                      <FormField
                        control={form.control}
                        name="loginType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Authentication Type</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex space-x-4"
                              >
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="form" id="form" />
                                  <Label htmlFor="form">Form Login</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="basic" id="basic" />
                                  <Label htmlFor="basic">Basic Auth</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="header" id="header" />
                                  <Label htmlFor="header">Header Auth</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {form.watch('loginType') === 'form' && (
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="usernameSelector"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Username Field Selector</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder='input[name="username"]' />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="passwordSelector"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password Field Selector</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder='input[name="password"]' />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {form.watch('loginType') === 'header' && (
                        <FormField
                          control={form.control}
                          name="loginHeaders"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Authentication Headers (JSON)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder='{"Authorization": "Bearer your-token"}' />
                              </FormControl>
                              <FormDescription>
                                JSON object with headers for authentication
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex space-x-2">
            <Button
              type="submit"
              disabled={createScrapingJob.isPending}
              className="flex-1"
              data-testid="button-create-job"
            >
              {createScrapingJob.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  Create Scraping Job
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}