import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  BarChart3, 
  LineChart, 
  PieChart, 
  ScatterChart, 
  Activity, 
  TrendingUp, 
  Grid3X3, 
  Zap,
  Download,
  Eye,
  Settings,
  Palette,
  Play,
  Box
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ChartContainer } from "@/components/ui/chart";
import { ResponsiveContainer, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Bar, LineChart as RechartsLineChart, Line, PieChart as RechartsPieChart, Cell, Pie, ScatterChart as RechartsScatterChart, Scatter } from 'recharts';

interface VisualizationWorkshopProps {
  project: any;
  onClose?: () => void;
}

interface ChartConfig {
  chartType: string;
  xAxis?: string;
  yAxis?: string | string[];
  groupBy?: string;
  colorBy?: string;
  sizeBy?: string;
  aggregation?: string;
  title?: string;
  filters?: any;
  style?: {
    theme: string;
    colors: string[];
    size: string;
  };
}

export default function VisualizationWorkshop({ project, onClose }: VisualizationWorkshopProps) {
  const { toast } = useToast();
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    chartType: '',
    aggregation: 'sum',
    style: {
      theme: 'default',
      colors: ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00'],
      size: 'medium'
    }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCharts, setGeneratedCharts] = useState<any[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [availableFields, setAvailableFields] = useState<any>({});

  const schema = project?.schema || {};
  const numericFields = Object.entries(schema)
    .filter(([_, info]: [string, any]) => ['number', 'integer', 'float'].includes(info.type))
    .map(([name]) => name);
  const categoricalFields = Object.entries(schema)
    .filter(([_, info]: [string, any]) => ['text', 'string', 'category'].includes(info.type))
    .map(([name]) => name);
  const dateTimeFields = Object.entries(schema)
    .filter(([_, info]: [string, any]) => ['date', 'datetime', 'timestamp'].includes(info.type))
    .map(([name]) => name);

  const chartTypes = [
    {
      value: "bar",
      label: "Bar Chart",
      description: "Compare categories or groups",
      icon: BarChart3,
      requirements: { x: "categorical", y: "numeric" },
      useCase: "Comparing values across categories"
    },
    {
      value: "line",
      label: "Line Chart", 
      description: "Show trends over time",
      icon: LineChart,
      requirements: { x: "datetime|numeric", y: "numeric" },
      useCase: "Tracking changes over time"
    },
    {
      value: "scatter",
      label: "Scatter Plot",
      description: "Explore relationships between variables",
      icon: ScatterChart,
      requirements: { x: "numeric", y: "numeric" },
      useCase: "Finding correlations and patterns"
    },
    {
      value: "pie",
      label: "Pie Chart",
      description: "Show proportions and percentages",
      icon: PieChart,
      requirements: { category: "categorical", value: "numeric" },
      useCase: "Displaying parts of a whole"
    },
    {
      value: "histogram",
      label: "Histogram",
      description: "Show data distribution",
      icon: Activity,
      requirements: { x: "numeric" },
      useCase: "Understanding data distribution"
    },
    {
      value: "boxplot",
      label: "Box Plot",
      description: "Show data spread and outliers",
      icon: Grid3X3,
      requirements: { category: "categorical", value: "numeric" },
      useCase: "Comparing distributions across groups"
    },
    {
      value: "heatmap",
      label: "Heatmap",
      description: "Show correlation matrix",
      icon: Palette,
      requirements: { variables: "numeric[]" },
      useCase: "Visualizing correlations"
    },
    {
      value: "violin",
      label: "Violin Plot",
      description: "Detailed distribution analysis",
      icon: TrendingUp,
      requirements: { category: "categorical", value: "numeric" },
      useCase: "Advanced distribution comparison"
    }
  ];

  const aggregationOptions = [
    { value: "sum", label: "Sum" },
    { value: "mean", label: "Average" },
    { value: "median", label: "Median" },
    { value: "count", label: "Count" },
    { value: "min", label: "Minimum" },
    { value: "max", label: "Maximum" },
    { value: "std", label: "Standard Deviation" }
  ];

  useEffect(() => {
    if (project?.data && Array.isArray(project.data)) {
      setPreviewData(project.data.slice(0, 100)); // Sample for preview
      setAvailableFields({
        numeric: numericFields,
        categorical: categoricalFields,
        datetime: dateTimeFields,
        all: Object.keys(schema)
      });
    }
  }, [project]);

  const updateChartConfig = (key: string, value: any) => {
    setChartConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const generateVisualization = async () => {
    if (!chartConfig.chartType) {
      toast({
        title: "Chart Type Required",
        description: "Please select a chart type to generate visualization.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/generate-visualization/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          chartConfig,
          dataSlice: previewData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Visualization generation failed');
      }

      const result = await response.json();
      
      setGeneratedCharts(prev => [...prev, {
        id: Date.now(),
        type: chartConfig.chartType,
        config: chartConfig,
        data: result.processedData,
        chart: result.chart,
        insights: result.insights,
        timestamp: new Date().toISOString()
      }]);

      toast({
        title: "Visualization Generated",
        description: `${chartConfig.chartType} chart created successfully!`
      });

    } catch (error: any) {
      console.error('Visualization generation error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate visualization",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const exportVisualization = async (chartId: number) => {
    const chart = generatedCharts.find(c => c.id === chartId);
    if (!chart) return;

    try {
      const response = await fetch(`/api/export-visualization/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          chartData: chart,
          format: 'png'
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${chart.type}_chart_${chart.id}.png`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export visualization",
        variant: "destructive"
      });
    }
  };

  const renderPreviewChart = () => {
    if (!chartConfig.chartType || !previewData.length) return null;

    const chartData = previewData.slice(0, 20); // Small sample for preview
    
    const config = {
      [chartConfig.yAxis || 'value']: {
        label: chartConfig.yAxis || 'Value',
        color: chartConfig.style?.colors?.[0] || '#8884d8',
      },
    };

    switch (chartConfig.chartType) {
      case 'bar':
        return (
          <ChartContainer config={config} className="h-64">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={chartConfig.xAxis} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={chartConfig.yAxis} fill={chartConfig.style?.colors?.[0]} />
            </BarChart>
          </ChartContainer>
        );
      
      case 'line':
        return (
          <ChartContainer config={config} className="h-64">
            <RechartsLineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={chartConfig.xAxis} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey={chartConfig.yAxis} stroke={chartConfig.style?.colors?.[0]} />
            </RechartsLineChart>
          </ChartContainer>
        );
      
      case 'scatter':
        return (
          <ChartContainer config={config} className="h-64">
            <RechartsScatterChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={chartConfig.xAxis} />
              <YAxis dataKey={chartConfig.yAxis} />
              <Tooltip />
              <Scatter fill={chartConfig.style?.colors?.[0]} />
            </RechartsScatterChart>
          </ChartContainer>
        );
      
      default:
        return (
          <div className="h-64 flex items-center justify-center bg-muted rounded">
            <p className="text-muted-foreground">Chart preview will appear here</p>
          </div>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Visualization Workshop</h1>
          <p className="text-muted-foreground">Create interactive charts and graphs from your data</p>
        </div>
        {onClose && (
          <Button variant="outline" onClick={onClose}>Close</Button>
        )}
      </div>

      <Tabs defaultValue="builder" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="builder">Chart Builder</TabsTrigger>
          <TabsTrigger value="gallery">Chart Gallery</TabsTrigger>
          <TabsTrigger value="insights">Data Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Configuration Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Chart Configuration
                </CardTitle>
                <CardDescription>
                  Configure your visualization settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Chart Type Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Chart Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {chartTypes.map((type) => (
                      <Button
                        key={type.value}
                        variant={chartConfig.chartType === type.value ? "default" : "outline"}
                        className="h-auto p-3"
                        onClick={() => updateChartConfig('chartType', type.value)}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <type.icon className="h-4 w-4" />
                          <span className="text-xs">{type.label}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Field Selection */}
                {chartConfig.chartType && (
                  <div className="space-y-4">
                    <Separator />
                    
                    {/* X-Axis */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">X-Axis Field</label>
                      <Select 
                        value={chartConfig.xAxis} 
                        onValueChange={(value) => updateChartConfig('xAxis', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select X-axis field" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFields.all?.map((field: string) => (
                            <SelectItem key={field} value={field}>
                              {field}
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {schema[field]?.type}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Y-Axis */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Y-Axis Field</label>
                      <Select 
                        value={chartConfig.yAxis} 
                        onValueChange={(value) => updateChartConfig('yAxis', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Y-axis field" />
                        </SelectTrigger>
                        <SelectContent>
                          {numericFields.map((field: string) => (
                            <SelectItem key={field} value={field}>
                              {field}
                              <Badge variant="secondary" className="ml-2 text-xs">
                                numeric
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Enhanced Field Interaction Section */}
                    <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                      <h4 className="font-medium text-blue-900 text-sm">Field Interaction Configuration</h4>
                      <p className="text-xs text-blue-700">Configure how fields interact to reveal data patterns and insights.</p>
                    </div>

                    {/* Color By Field */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Color By (Optional)</label>
                      <Select 
                        value={chartConfig.groupBy} 
                        onValueChange={(value) => updateChartConfig('groupBy', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select color grouping field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {categoricalFields.map((field: string) => (
                            <SelectItem key={field} value={field}>
                              {field} <Badge variant="outline" className="ml-1 text-xs">categorical</Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Size By Field (for scatter plots primarily) */}
                    {chartConfig.chartType === 'scatter' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Size By (Optional)</label>
                        <Select 
                          value={chartConfig.sizeBy} 
                          onValueChange={(value) => updateChartConfig('sizeBy', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select size field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {numericFields.map((field: string) => (
                              <SelectItem key={field} value={field}>
                                {field} <Badge variant="outline" className="ml-1 text-xs">numeric</Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Aggregation */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Aggregation Method</label>
                      <Select 
                        value={chartConfig.aggregation} 
                        onValueChange={(value) => updateChartConfig('aggregation', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select aggregation method" />
                        </SelectTrigger>
                        <SelectContent>
                          {aggregationOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Chart Title */}
                    <div className="space-y-2">  
                      <label className="text-sm font-medium">Chart Title (Optional)</label>
                      <input
                        type="text"
                        value={chartConfig.title || ''}
                        onChange={(e) => updateChartConfig('title', e.target.value)}
                        placeholder="Enter custom chart title"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    {/* Field Interaction Analysis Display */}
                    {chartConfig.xAxis && chartConfig.yAxis && (
                      <div className="bg-green-50 p-3 rounded-lg">
                        <h5 className="font-medium text-green-900 text-sm mb-1">Field Interaction Analysis</h5>
                        <p className="text-xs text-green-700">
                          Analyzing relationship between <strong>{chartConfig.xAxis}</strong> and <strong>{chartConfig.yAxis}</strong>
                          {chartConfig.groupBy && (
                            <span>, grouped by <strong>{chartConfig.groupBy}</strong></span>
                          )}
                          {chartConfig.sizeBy && (
                            <span>, with size based on <strong>{chartConfig.sizeBy}</strong></span>
                          )}. This will reveal patterns, correlations, and insights in your data.
                        </p>
                      </div>
                    )}

                    <Button 
                      onClick={generateVisualization} 
                      disabled={isGenerating || !chartConfig.xAxis || !chartConfig.yAxis}
                      className="w-full"
                    >
                      {isGenerating ? (
                        <>Generating...</>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Generate Visualization
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preview Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Chart Preview
                </CardTitle>
                <CardDescription>
                  Live preview of your visualization
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderPreviewChart()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gallery" className="space-y-6">
          {generatedCharts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Charts Generated Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first visualization using the Chart Builder
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {generatedCharts.map((chart) => (
                <Card key={chart.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="capitalize">{chart.type} Chart</CardTitle>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => exportVisualization(chart.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardDescription>
                      Created {new Date(chart.timestamp).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Chart would be rendered here */}
                      <div className="h-64 bg-muted rounded flex items-center justify-center">
                        <span className="text-muted-foreground">Chart: {chart.config.xAxis} vs {chart.config.yAxis}</span>
                      </div>
                      
                      {chart.insights && (
                        <div className="p-3 bg-muted rounded">
                          <h4 className="font-medium mb-2">Key Insights</h4>
                          <p className="text-sm text-muted-foreground">{chart.insights}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Data Overview</CardTitle>
                <CardDescription>Overview of your data structure and field types</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{previewData.length}</div>
                      <div className="text-sm text-muted-foreground">Total Records</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{Object.keys(schema).length}</div>
                      <div className="text-sm text-muted-foreground">Total Fields</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center p-2 bg-blue-50 rounded">
                      <div className="font-medium text-blue-700">{numericFields.length}</div>
                      <div className="text-blue-600">Numeric</div>
                    </div>
                    <div className="text-center p-2 bg-green-50 rounded">
                      <div className="font-medium text-green-700">{categoricalFields.length}</div>
                      <div className="text-green-600">Categorical</div>
                    </div>
                    <div className="text-center p-2 bg-purple-50 rounded">
                      <div className="font-medium text-purple-700">{dateTimeFields.length}</div>
                      <div className="text-purple-600">DateTime</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Smart Chart Recommendations</CardTitle>
                <CardDescription>AI-powered field interaction suggestions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {numericFields.length >= 2 && (
                    <div 
                      className="p-3 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors"
                      onClick={() => {
                        setChartConfig(prev => ({
                          ...prev,
                          chartType: 'scatter',
                          xAxis: numericFields[0],
                          yAxis: numericFields[1],
                          title: `${numericFields[1]} vs ${numericFields[0]} Correlation`
                        }));
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <ScatterChart className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">Correlation Analysis</span>
                        <Badge variant="outline" className="text-xs">Click to apply</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Explore relationships between <strong>{numericFields[0]}</strong> and <strong>{numericFields[1]}</strong> using scatter plots
                      </p>
                    </div>
                  )}
                  
                  {categoricalFields.length > 0 && numericFields.length > 0 && (
                    <div 
                      className="p-3 border rounded-lg cursor-pointer hover:bg-green-50 transition-colors"
                      onClick={() => {
                        setChartConfig(prev => ({
                          ...prev,
                          chartType: 'bar',
                          xAxis: categoricalFields[0],
                          yAxis: numericFields[0],
                          aggregation: 'mean',
                          title: `${numericFields[0]} by ${categoricalFields[0]}`
                        }));
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-sm">Category Comparison</span>
                        <Badge variant="outline" className="text-xs">Click to apply</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Compare <strong>{numericFields[0]}</strong> across <strong>{categoricalFields[0]}</strong> categories
                      </p>
                    </div>
                  )}
                  
                  {dateTimeFields.length > 0 && numericFields.length > 0 && (
                    <div 
                      className="p-3 border rounded-lg cursor-pointer hover:bg-purple-50 transition-colors"
                      onClick={() => {
                        setChartConfig(prev => ({
                          ...prev,
                          chartType: 'line',
                          xAxis: dateTimeFields[0],
                          yAxis: numericFields[0],
                          title: `${numericFields[0]} Trends Over Time`
                        }));
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <LineChart className="h-4 w-4 text-purple-500" />
                        <span className="font-medium text-sm">Trend Analysis</span>
                        <Badge variant="outline" className="text-xs">Click to apply</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Track <strong>{numericFields[0]}</strong> trends over <strong>{dateTimeFields[0]}</strong>
                      </p>
                    </div>
                  )}

                  {numericFields.length >= 3 && categoricalFields.length > 0 && (
                    <div 
                      className="p-3 border rounded-lg cursor-pointer hover:bg-yellow-50 transition-colors"
                      onClick={() => {
                        setChartConfig(prev => ({
                          ...prev,
                          chartType: 'scatter',
                          xAxis: numericFields[0],
                          yAxis: numericFields[1],
                          sizeBy: numericFields[2],
                          groupBy: categoricalFields[0],
                          title: `Multi-dimensional Analysis`
                        }));
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Box className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium text-sm">Multi-Field Interaction</span>
                        <Badge variant="outline" className="text-xs">Click to apply</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Analyze <strong>{numericFields[0]}</strong> vs <strong>{numericFields[1]}</strong>, sized by <strong>{numericFields[2]}</strong>, grouped by <strong>{categoricalFields[0]}</strong>
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Field Interaction Matrix */}
          <Card>
            <CardHeader>
              <CardTitle>Field Interaction Matrix</CardTitle>
              <CardDescription>Discover how your fields can work together to create meaningful visualizations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Field Combination</th>
                      <th className="text-left p-2">Best Chart Type</th>
                      <th className="text-left p-2">Insights Revealed</th>
                      <th className="text-left p-2">Use Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numericFields.slice(0, 2).map((numField, i) => 
                      categoricalFields.slice(0, 2).map((catField, j) => (
                        <tr key={`${i}-${j}`} className="border-b hover:bg-gray-50">
                          <td className="p-2">
                            <span className="font-medium text-blue-600">{numField}</span> × <span className="font-medium text-green-600">{catField}</span>
                          </td>
                          <td className="p-2">
                            <Badge variant="outline">Bar Chart</Badge>
                          </td>
                          <td className="p-2 text-xs text-gray-600">Compare {numField} across {catField} groups</td>
                          <td className="p-2 text-xs text-gray-500">Performance by category</td>
                        </tr>
                      ))
                    )}
                    {numericFields.slice(0, 2).map((field1, i) => 
                      numericFields.slice(i + 1, 3).map((field2, j) => (
                        <tr key={`num-${i}-${j}`} className="border-b hover:bg-gray-50">
                          <td className="p-2">
                            <span className="font-medium text-blue-600">{field1}</span> × <span className="font-medium text-blue-600">{field2}</span>
                          </td>
                          <td className="p-2">
                            <Badge variant="outline">Scatter Plot</Badge>
                          </td>
                          <td className="p-2 text-xs text-gray-600">Correlation and patterns</td>
                          <td className="p-2 text-xs text-gray-500">Relationship analysis</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}