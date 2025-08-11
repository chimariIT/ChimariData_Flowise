import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Grid
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

  const schema = project?.schema || {};
  const fields = Object.keys(schema);
  const numericFields = fields.filter(field => 
    schema[field]?.type === 'number' || schema[field]?.type === 'float' || schema[field]?.type === 'int'
  );
  const categoricalFields = fields.filter(field => 
    schema[field]?.type === 'string' || schema[field]?.type === 'text'
  );

  const visualizationTypes = [
    {
      type: "bar_chart",
      name: "Bar Chart",
      description: "Compare categories or show distributions",
      icon: BarChart3,
      requiredFields: { numeric: 1, categorical: 1 },
      recommended: "categorical data with numeric values"
    },
    {
      type: "line_chart", 
      name: "Line Chart",
      description: "Show trends over time or continuous data",
      icon: LineChart,
      requiredFields: { numeric: 1, any: 1 },
      recommended: "time series or trend data"
    },
    {
      type: "scatter_plot",
      name: "Scatter Plot", 
      description: "Explore relationships between two variables",
      icon: ScatterChart,
      requiredFields: { numeric: 2 },
      recommended: "exploring correlations"
    },
    {
      type: "pie_chart",
      name: "Pie Chart",
      description: "Show proportions of a whole",
      icon: PieChart,
      requiredFields: { categorical: 1, numeric: 1 },
      recommended: "categorical proportions"
    },
    {
      type: "histogram",
      name: "Histogram",
      description: "Show distribution of numeric data",
      icon: Activity,
      requiredFields: { numeric: 1 },
      recommended: "data distribution analysis"
    },
    {
      type: "correlation_matrix",
      name: "Correlation Matrix",
      description: "Show relationships between all numeric variables",
      icon: Grid,
      requiredFields: { numeric: 2 },
      recommended: "finding variable relationships"
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
    if (!selectedVisualization || selectedColumns.length === 0) {
      toast({
        title: "Configuration Required",
        description: "Please select a visualization type and at least one column",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/create-visualization/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          type: selectedVisualization,
          fields: selectedColumns,
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
        description: "Your chart has been generated successfully",
      });

    } catch (error: any) {
      console.error('Visualization error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to create visualization",
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
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visualization Workshop</h1>
          <p className="text-gray-600">Create interactive charts from your data</p>
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
                  Data Configuration
                </CardTitle>
                <CardDescription>
                  Select the data columns for your visualization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Primary Columns */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Data Columns *
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {fields.map(field => (
                      <div key={field} className="flex items-center space-x-2">
                        <Checkbox
                          id={`field-${field}`}
                          checked={selectedColumns.includes(field)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedColumns([...selectedColumns, field]);
                            } else {
                              setSelectedColumns(selectedColumns.filter(f => f !== field));
                            }
                          }}
                        />
                        <label 
                          htmlFor={`field-${field}`} 
                          className="text-sm flex items-center gap-2"
                        >
                          {field}
                          <Badge variant="outline" className="text-xs">
                            {schema[field]?.type || 'unknown'}
                          </Badge>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Group By Column */}
                {categoricalFields.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Group By (Optional)
                    </label>
                    <Select value={groupByColumn} onValueChange={setGroupByColumn}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select grouping column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {categoricalFields.map(field => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Color By Column */}
                {categoricalFields.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Color By (Optional)
                    </label>
                    <Select value={colorByColumn} onValueChange={setColorByColumn}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select color column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {categoricalFields.map(field => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button 
                    onClick={generateVisualization}
                    disabled={isGenerating || selectedColumns.length === 0}
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
                  >
                    Reset
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
                <span>Chart Preview</span>
                {generatedChart && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={downloadVisualization}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
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