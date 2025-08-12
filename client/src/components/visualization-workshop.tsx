import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  LineChart, 
  PieChart, 
  ScatterChart, 
  Activity,
  TrendingUp,
  Loader2,
  Download,
  Palette,
  Settings,
  Eye,
  Grid,
  Save,
  RotateCcw,
  Zap,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VisualizationWorkshopProps {
  project: any;
  onClose: () => void;
}

export default function VisualizationWorkshop({ project, onClose }: VisualizationWorkshopProps) {
  const { toast } = useToast();
  const [selectedVisualization, setSelectedVisualization] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [groupByColumn, setGroupByColumn] = useState("");
  const [colorByColumn, setColorByColumn] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedChart, setGeneratedChart] = useState<any>(null);
  
  // Enhanced configuration options
  const [chartConfig, setChartConfig] = useState({
    xAxis: "",
    yAxis: "",
    title: "",
    xlabel: "",
    ylabel: "",
    aggregation: "sum", // sum, avg, count, min, max
    chartStyle: "default", // default, minimal, colorful
    showGrid: true,
    showLegend: true,
    orientation: "vertical" // for bar charts
  });
  
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // Handle URL query parameters for chart type selection
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const chartType = urlParams.get('type');
    if (chartType && visualizationTypes.some(v => v.type === chartType)) {
      setSelectedVisualization(chartType);
    }
  }, []);

  // Get fields from schema or infer from data
  const schema = project?.schema || {};
  let fields = Object.keys(schema);
  
  // Fallback: infer fields from project data if schema is empty
  if (fields.length === 0 && project?.data && Array.isArray(project.data) && project.data.length > 0) {
    fields = Object.keys(project.data[0]);
  }

  // If no project data is available, show sample field types for demo purposes
  if (fields.length === 0) {
    fields = ['sales', 'date', 'category', 'region']; // Sample fields for demo
  }
  
  const numericFields = fields.filter(field => {
    if (schema[field]) {
      return schema[field]?.type === 'number' || schema[field]?.type === 'float' || schema[field]?.type === 'int';
    }
    // Fallback: infer from data
    if (project?.data && project.data.length > 0) {
      const value = project.data[0][field];
      return typeof value === 'number';
    }
    return false;
  });
  
  const categoricalFields = fields.filter(field => {
    if (schema[field]) {
      return schema[field]?.type === 'string' || schema[field]?.type === 'text';
    }
    // Fallback: infer from data
    if (project?.data && project.data.length > 0) {
      const value = project.data[0][field];
      return typeof value === 'string' && !numericFields.includes(field);
    }
    return false;
  });

  const visualizationTypes = [
    {
      type: "bar_chart",
      name: "Bar Chart",
      description: "Compare categories or show distributions",
      icon: BarChart3,
      requiredFields: { numeric: 1, categorical: 1 },
      recommended: "categorical data with numeric values",
      configFields: ["xAxis", "yAxis", "aggregation", "orientation"],
      supportsGrouping: true,
      supportsColor: true
    },
    {
      type: "line_chart", 
      name: "Line Chart",
      description: "Show trends over time or continuous data",
      icon: LineChart,
      requiredFields: { numeric: 1, any: 1 },
      recommended: "time series or trend data",
      configFields: ["xAxis", "yAxis", "aggregation"],
      supportsGrouping: true,
      supportsColor: true
    },
    {
      type: "scatter_plot",
      name: "Scatter Plot", 
      description: "Explore relationships between two variables",
      icon: ScatterChart,
      requiredFields: { numeric: 2 },
      recommended: "exploring correlations",
      configFields: ["xAxis", "yAxis"],
      supportsGrouping: false,
      supportsColor: true
    },
    {
      type: "pie_chart",
      name: "Pie Chart",
      description: "Show proportions of a whole",
      icon: PieChart,
      requiredFields: { categorical: 1, numeric: 1 },
      recommended: "categorical proportions",
      configFields: ["xAxis", "yAxis"],
      supportsGrouping: false,
      supportsColor: false
    },
    {
      type: "histogram",
      name: "Histogram",
      description: "Show distribution of numeric data",
      icon: Activity,
      requiredFields: { numeric: 1 },
      recommended: "data distribution analysis",
      configFields: ["xAxis"],
      supportsGrouping: false,
      supportsColor: false
    },
    {
      type: "box_plot",
      name: "Box Plot",
      description: "Show quartiles and outliers",
      icon: Activity,
      requiredFields: { numeric: 1 },
      recommended: "statistical distributions",
      configFields: ["xAxis", "yAxis"],
      supportsGrouping: true,
      supportsColor: true
    },
    {
      type: "heatmap",
      name: "Heatmap",
      description: "Show correlations with color intensity",
      icon: Grid,
      requiredFields: { numeric: 2 },
      recommended: "correlation analysis",
      configFields: [],
      supportsGrouping: false,
      supportsColor: false
    },
    {
      type: "violin_plot",
      name: "Violin Plot",
      description: "Show distribution shape and density",
      icon: Activity,
      requiredFields: { numeric: 1 },
      recommended: "distribution analysis",
      configFields: ["xAxis", "yAxis"],
      supportsGrouping: true,
      supportsColor: true
    }
  ];

  const canCreateVisualization = (vizType: any) => {
    const numericCount = numericFields.length;
    const categoricalCount = categoricalFields.length;
    
    if (vizType.requiredFields.numeric && numericCount < vizType.requiredFields.numeric) {
      return false;
    }
    if (vizType.requiredFields.categorical && categoricalCount < vizType.requiredFields.categorical) {
      return false;
    }
    return true;
  };

  const generateVisualization = async () => {
    // Validation based on chart type
    const requiredFields = [];
    if (selectedVizType?.configFields.includes("xAxis") && !chartConfig.xAxis) {
      requiredFields.push("X-Axis field");
    }
    if (selectedVizType?.configFields.includes("yAxis") && !chartConfig.yAxis) {
      requiredFields.push("Y-Axis field");
    }

    if (!selectedVisualization) {
      toast({
        title: "Select Chart Type",
        description: "Please choose a visualization type first",
        variant: "destructive",
      });
      return;
    }

    if (requiredFields.length > 0) {
      toast({
        title: "Configuration Required",
        description: `Please select: ${requiredFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      if (!project?.id) {
        // Demo mode - show enhanced placeholder
        setTimeout(() => {
          setGeneratedChart({
            type: selectedVisualization,
            demo: true,
            message: "Demo visualization - Sign in to create actual charts from your data",
            config: chartConfig,
            fields: {
              xAxis: chartConfig.xAxis,
              yAxis: chartConfig.yAxis,
              groupBy: groupByColumn,
              colorBy: colorByColumn
            }
          });
          setIsGenerating(false);
          toast({
            title: "Demo Visualization",
            description: `${selectedVizType?.name} preview generated. Sign in to create with your data.`,
          });
        }, 1500);
        return;
      }

      const response = await fetch(`/api/create-visualization/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          type: selectedVisualization,
          config: {
            xAxis: chartConfig.xAxis,
            yAxis: chartConfig.yAxis,
            title: chartConfig.title || `${selectedVizType?.name} - ${chartConfig.xAxis} vs ${chartConfig.yAxis}`,
            xlabel: chartConfig.xlabel || chartConfig.xAxis,
            ylabel: chartConfig.ylabel || chartConfig.yAxis,
            aggregation: chartConfig.aggregation,
            orientation: chartConfig.orientation,
            chartStyle: chartConfig.chartStyle,
            showGrid: chartConfig.showGrid,
            showLegend: chartConfig.showLegend
          },
          groupByColumn: groupByColumn || undefined,
          colorByColumn: colorByColumn || undefined
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create visualization');
      }

      const result = await response.json();
      setGeneratedChart(result);

      toast({
        title: "Visualization Created",
        description: `${selectedVizType?.name} chart generated successfully`,
      });

    } catch (error: any) {
      console.error('Visualization error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to create visualization. Please check your authentication.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadVisualization = () => {
    if (!generatedChart?.imageData) {
      toast({
        title: "No Chart Available",
        description: "Please generate a visualization first",
        variant: "destructive",
      });
      return;
    }

    // Create download link for the chart
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${generatedChart.imageData}`;
    link.download = `${selectedVisualization}_${project.name || 'chart'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Download Complete",
      description: "Visualization saved to your downloads",
    });
  };

  const resetConfiguration = () => {
    setSelectedVisualization("");
    setSelectedColumns([]);
    setGroupByColumn("");
    setColorByColumn("");
    setGeneratedChart(null);
    setChartConfig({
      xAxis: "",
      yAxis: "",
      title: "",
      xlabel: "",
      ylabel: "",
      aggregation: "sum",
      chartStyle: "default",
      showGrid: true,
      showLegend: true,
      orientation: "vertical"
    });
    setShowAdvancedConfig(false);
  };

  // Get the currently selected visualization type configuration
  const selectedVizType = visualizationTypes.find(v => v.type === selectedVisualization);

  // Auto-suggest field assignments based on chart type
  const suggestFields = (vizType: any) => {
    if (!vizType || fields.length === 0) return;
    
    let newConfig = { ...chartConfig };
    
    switch (vizType.type) {
      case "bar_chart":
      case "pie_chart":
        if (categoricalFields.length > 0) newConfig.xAxis = categoricalFields[0];
        if (numericFields.length > 0) newConfig.yAxis = numericFields[0];
        break;
      case "line_chart":
        if (fields.length > 0) newConfig.xAxis = fields[0];
        if (numericFields.length > 0) newConfig.yAxis = numericFields[0];
        break;
      case "scatter_plot":
        if (numericFields.length >= 2) {
          newConfig.xAxis = numericFields[0];
          newConfig.yAxis = numericFields[1];
        }
        break;
      case "histogram":
      case "box_plot":
      case "violin_plot":
        if (numericFields.length > 0) newConfig.xAxis = numericFields[0];
        break;
    }
    
    setChartConfig(newConfig);
  };

  // Auto-suggest when visualization type changes
  useEffect(() => {
    if (selectedVisualization && !chartConfig.xAxis && !chartConfig.yAxis) {
      const vizType = visualizationTypes.find(v => v.type === selectedVisualization);
      suggestFields(vizType);
    }
  }, [selectedVisualization, fields.length]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visualization Workshop</h1>
          <p className="text-gray-600">Create interactive charts from your data</p>
          {!project && (
            <p className="text-sm text-orange-600 mt-1">
              Demo mode - Sign in to use with your actual data
            </p>
          )}
        </div>
        <Button variant="outline" onClick={onClose}>
          Back to Project
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Visualization Type Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Chart Type
              </CardTitle>
              <CardDescription>
                Choose the type of visualization for your data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {visualizationTypes.map((viz) => {
                const Icon = viz.icon;
                const isAvailable = canCreateVisualization(viz);
                
                return (
                  <div
                    key={viz.type}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${
                      selectedVisualization === viz.type
                        ? 'border-blue-500 bg-blue-50'
                        : isAvailable
                        ? 'border-gray-200 hover:border-gray-300'
                        : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                    }`}
                    onClick={() => isAvailable && setSelectedVisualization(viz.type)}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="w-5 h-5 mt-0.5 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm">{viz.name}</h3>
                          {!isAvailable && (
                            <Badge variant="secondary" className="text-xs">
                              Unavailable
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{viz.description}</p>
                        <p className="text-xs text-blue-600 mt-1">Best for: {viz.recommended}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Column Selection */}
          {selectedVisualization && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Chart Configuration
                </CardTitle>
                <CardDescription>
                  Configure your {selectedVizType?.name} with field mappings and styling options
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="fields" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="fields">Field Mapping</TabsTrigger>
                    <TabsTrigger value="styling">Chart Styling</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="fields" className="space-y-4 mt-4">
                    {/* Chart-specific field configuration */}
                    {selectedVizType?.configFields.includes("xAxis") && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          X-Axis Field * 
                          <span className="text-xs font-normal text-gray-500 ml-1">
                            (categorical/discrete data)
                          </span>
                        </Label>
                        <Select 
                          value={chartConfig.xAxis} 
                          onValueChange={(value) => setChartConfig({...chartConfig, xAxis: value})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose X-axis field" />
                          </SelectTrigger>
                          <SelectContent>
                            {fields.map(field => (
                              <SelectItem key={field} value={field}>
                                {field}
                                <span className="ml-2 text-xs text-gray-500">
                                  ({schema[field]?.type || 'unknown'})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {selectedVizType?.configFields.includes("yAxis") && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Y-Axis Field *
                          <span className="text-xs font-normal text-gray-500 ml-1">
                            (numeric values for measurement)
                          </span>
                        </Label>
                        <Select 
                          value={chartConfig.yAxis} 
                          onValueChange={(value) => setChartConfig({...chartConfig, yAxis: value})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose Y-axis field" />
                          </SelectTrigger>
                          <SelectContent>
                            {numericFields.map(field => (
                              <SelectItem key={field} value={field}>
                                {field}
                                <span className="ml-2 text-xs text-gray-500">
                                  ({schema[field]?.type || 'number'})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Aggregation for bar/line charts */}
                    {selectedVizType?.configFields.includes("aggregation") && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Data Aggregation</Label>
                        <Select 
                          value={chartConfig.aggregation} 
                          onValueChange={(value) => setChartConfig({...chartConfig, aggregation: value})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sum">Sum</SelectItem>
                            <SelectItem value="avg">Average</SelectItem>
                            <SelectItem value="count">Count</SelectItem>
                            <SelectItem value="min">Minimum</SelectItem>
                            <SelectItem value="max">Maximum</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Orientation for bar charts */}
                    {selectedVizType?.configFields.includes("orientation") && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Chart Orientation</Label>
                        <Select 
                          value={chartConfig.orientation} 
                          onValueChange={(value) => setChartConfig({...chartConfig, orientation: value})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vertical">Vertical Bars</SelectItem>
                            <SelectItem value="horizontal">Horizontal Bars</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Group By */}
                    {selectedVizType?.supportsGrouping && categoricalFields.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Group By (Optional)</Label>
                        <Select value={groupByColumn} onValueChange={setGroupByColumn}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select grouping field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {categoricalFields.map(field => (
                              <SelectItem key={field} value={field}>{field}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Color By */}
                    {selectedVizType?.supportsColor && categoricalFields.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Color By (Optional)
                          <span className="text-xs font-normal text-gray-500 ml-1">
                            (categorical field for color differentiation)
                          </span>
                        </Label>
                        <Select value={colorByColumn} onValueChange={setColorByColumn}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select color field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Default Colors</SelectItem>
                            {categoricalFields.map(field => (
                              <SelectItem key={field} value={field}>{field}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <Separator />
                    
                    {/* Auto-suggest button */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => suggestFields(selectedVizType)}
                      className="w-full"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Auto-suggest Fields
                    </Button>
                  </TabsContent>
                  
                  <TabsContent value="styling" className="space-y-4 mt-4">
                    {/* Chart Title */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Chart Title</Label>
                      <Input
                        value={chartConfig.title}
                        onChange={(e) => setChartConfig({...chartConfig, title: e.target.value})}
                        placeholder="Enter chart title"
                      />
                    </div>

                    {/* Axis Labels */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">X-Axis Label</Label>
                        <Input
                          value={chartConfig.xlabel}
                          onChange={(e) => setChartConfig({...chartConfig, xlabel: e.target.value})}
                          placeholder="X-axis label"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Y-Axis Label</Label>
                        <Input
                          value={chartConfig.ylabel}
                          onChange={(e) => setChartConfig({...chartConfig, ylabel: e.target.value})}
                          placeholder="Y-axis label"
                        />
                      </div>
                    </div>

                    {/* Chart Style */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Chart Style</Label>
                      <Select 
                        value={chartConfig.chartStyle} 
                        onValueChange={(value) => setChartConfig({...chartConfig, chartStyle: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="minimal">Minimal</SelectItem>
                          <SelectItem value="colorful">Colorful</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Grid and Legend */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="show-grid"
                          checked={chartConfig.showGrid}
                          onCheckedChange={(checked) => setChartConfig({...chartConfig, showGrid: !!checked})}
                        />
                        <Label htmlFor="show-grid" className="text-sm">Show Grid</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="show-legend"
                          checked={chartConfig.showLegend}
                          onCheckedChange={(checked) => setChartConfig({...chartConfig, showLegend: !!checked})}
                        />
                        <Label htmlFor="show-legend" className="text-sm">Show Legend</Label>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="mt-6 flex gap-2">
                  <Button 
                    onClick={generateVisualization}
                    disabled={isGenerating || (!chartConfig.xAxis && selectedVizType?.configFields.includes("xAxis"))}
                    className="flex-1"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Generate Chart
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={resetConfiguration}
                    disabled={isGenerating}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Visualization Display */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>Chart Preview</span>
                  {selectedVizType && (
                    <Badge variant="outline" className="text-xs">
                      {selectedVizType.name}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {generatedChart && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {/* Save to project */}}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save to Project
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={downloadVisualization}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </>
                  )}
                </div>
              </CardTitle>
              {selectedVisualization && !generatedChart && (
                <CardDescription className="flex items-center gap-2">
                  <div className="text-sm">
                    Ready to generate: {chartConfig.xAxis && chartConfig.yAxis ? 
                      `${chartConfig.xAxis} vs ${chartConfig.yAxis}` : 
                      'Configure fields to preview'
                    }
                  </div>
                  {chartConfig.xAxis && chartConfig.yAxis && (
                    <Badge variant="secondary" className="text-xs">
                      {chartConfig.aggregation}
                    </Badge>
                  )}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="h-96">
              {!generatedChart ? (
                <div className="flex items-center justify-center h-96 border-2 border-dashed border-gray-300 rounded-lg">
                  <div className="text-center">
                    <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No Visualization Yet
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Select a chart type and configure your data to generate a visualization
                    </p>
                    {fields.length === 0 && (
                      <p className="text-sm text-red-600">
                        No data fields available in this project
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Chart Display */}
                  <div className="border rounded-lg overflow-hidden">
                    {generatedChart.imageData ? (
                      <img 
                        src={`data:image/png;base64,${generatedChart.imageData}`}
                        alt="Generated Visualization"
                        className="w-full h-auto"
                      />
                    ) : generatedChart.demo ? (
                      <div className="p-8 text-center bg-gradient-to-br from-blue-50 to-indigo-50">
                        <div className="max-w-md mx-auto">
                          <TrendingUp className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">
                            {selectedVisualization?.replace('_', ' ').toUpperCase()} Chart Preview
                          </h3>
                          <p className="text-blue-700 mb-4">{generatedChart.message}</p>
                          <div className="text-xs text-gray-600">
                            Chart configuration: {selectedColumns.join(', ')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <p className="text-gray-600">Chart generated but image not available</p>
                      </div>
                    )}
                  </div>

                  {/* Insights */}
                  {generatedChart.insights && generatedChart.insights.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Insights</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {generatedChart.insights.map((insight: string, index: number) => (
                            <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-blue-600 font-bold">•</span>
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}