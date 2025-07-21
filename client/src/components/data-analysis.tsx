import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BarChart3, PieChart, TrendingUp, Calculator, Play, Download, Brain, Zap, Shield, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdvancedAnalysisModal from "./advanced-analysis-modal";
import AnonymizationToolkit from "./AnonymizationToolkit";

interface DataAnalysisProps {
  project: any;
}

export default function DataAnalysis({ project }: DataAnalysisProps) {
  const { toast } = useToast();
  const [selectedAnalysis, setSelectedAnalysis] = useState("");
  const [analysisConfig, setAnalysisConfig] = useState<any>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [showAnonymizationToolkit, setShowAnonymizationToolkit] = useState(false);
  const [visualizations, setVisualizations] = useState<any[]>([]);
  const [isCreatingVisualization, setIsCreatingVisualization] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const schema = project.schema || {};
  const numericFields = Object.entries(schema)
    .filter(([_, info]: [string, any]) => info.type === 'number')
    .map(([name]) => name);
  const categoricalFields = Object.entries(schema)
    .filter(([_, info]: [string, any]) => info.type === 'text')
    .map(([name]) => name);

  const analysisTypes = [
    {
      value: "descriptive",
      label: "Descriptive Statistics",
      description: "Summary statistics, mean, median, mode, etc.",
      icon: Calculator,
      fields: "numeric"
    },
    {
      value: "distribution",
      label: "Data Distribution",
      description: "Histograms, frequency distributions",
      icon: BarChart3,
      fields: "any"
    },
    {
      value: "correlation",
      label: "Correlation Analysis",
      description: "Relationships between variables",
      icon: TrendingUp,
      fields: "numeric"
    },
    {
      value: "advanced",
      label: "Advanced Analysis",
      description: "ANOVA, ANCOVA, MANOVA, Regression, ML",
      icon: Brain,
      fields: "advanced"
    },
    {
      value: "categorical",
      label: "Categorical Analysis",
      description: "Frequency counts, cross-tabulations",
      icon: PieChart,
      fields: "categorical"
    },
    {
      value: "custom",
      label: "Custom Analysis",
      description: "Define your own analysis requirements",
      icon: Calculator,
      fields: "any"
    }
  ];

  const executeAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      // Here you would send the analysis request to the backend
      await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate processing
      
      // Mock results
      const mockResults = {
        type: selectedAnalysis,
        summary: `Analysis completed for ${selectedAnalysis}`,
        data: generateMockData(selectedAnalysis),
        timestamp: new Date().toISOString()
      };
      
      setResults(mockResults);
      
      toast({
        title: "Analysis complete",
        description: "Your data analysis has been successfully completed",
      });
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: "There was an error running the analysis",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateMockData = (type: string) => {
    switch (type) {
      case "descriptive":
        return {
          statistics: numericFields.map(field => ({
            field,
            mean: (Math.random() * 100).toFixed(2),
            median: (Math.random() * 100).toFixed(2),
            std: (Math.random() * 20).toFixed(2),
            min: (Math.random() * 10).toFixed(2),
            max: (Math.random() * 200).toFixed(2)
          }))
        };
      case "distribution":
        return {
          distributions: (analysisConfig.fields || [...numericFields, ...categoricalFields]).map(field => ({
            field,
            type: numericFields.includes(field) ? 'numeric' : 'categorical',
            histogram: numericFields.includes(field) ? 
              Array.from({ length: 10 }, (_, i) => ({
                bin: `${i * 10}-${(i + 1) * 10}`,
                count: Math.floor(Math.random() * 100)
              })) :
              Array.from({ length: 5 }, (_, i) => ({
                category: `Category ${i + 1}`,
                count: Math.floor(Math.random() * 100)
              })),
            statistics: numericFields.includes(field) ? {
              mean: (Math.random() * 100).toFixed(2),
              median: (Math.random() * 100).toFixed(2),
              mode: (Math.random() * 100).toFixed(2),
              std: (Math.random() * 20).toFixed(2),
              skewness: ((Math.random() - 0.5) * 4).toFixed(2),
              kurtosis: ((Math.random() - 0.5) * 4).toFixed(2)
            } : {
              mode: `Category ${Math.floor(Math.random() * 5) + 1}`,
              uniqueValues: Math.floor(Math.random() * 10) + 2
            }
          }))
        };
      case "correlation":
        return {
          correlations: (analysisConfig.fields || numericFields).map((field1, i) => 
            (analysisConfig.fields || numericFields).slice(i + 1).map(field2 => ({
              field1,
              field2,
              correlation: ((Math.random() - 0.5) * 2).toFixed(3)
            }))
          ).flat()
        };
      case "categorical":
        return {
          frequencies: categoricalFields.map(field => ({
            field,
            values: Array.from({ length: 5 }, (_, i) => ({
              value: `Category ${i + 1}`,
              count: Math.floor(Math.random() * 1000),
              percentage: (Math.random() * 100).toFixed(1)
            }))
          }))
        };
      default:
        return { message: "Analysis results would appear here" };
    }
  };

  const createVisualization = async (type: string, selectedColumns?: string[]) => {
    setIsCreatingVisualization(true);
    try {
      const response = await fetch('/api/visualizations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          projectId: project.id,
          visualizationType: type,
          selectedColumns: selectedColumns || (analysisConfig.fields ? analysisConfig.fields : [])
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create visualization');
      }

      const result = await response.json();
      
      setVisualizations(prev => [...prev, result.visualization]);
      
      toast({
        title: "Visualization created",
        description: "Your chart has been generated successfully",
      });

    } catch (error: any) {
      toast({
        title: "Visualization failed",
        description: error.message || "Failed to create visualization",
        variant: "destructive",
      });
    } finally {
      setIsCreatingVisualization(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/export-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export PDF');
      }

      // Download the PDF file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis_report_${project.name || 'project'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export successful",
        description: "PDF report has been downloaded",
      });

    } catch (error: any) {
      toast({
        title: "Export failed", 
        description: error.message || "Failed to export PDF",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const renderAnalysisConfig = () => {
    if (!selectedAnalysis) return null;

    switch (selectedAnalysis) {
      case "descriptive":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Numeric Fields</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {numericFields.map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`desc-${field}`}
                      checked={analysisConfig.fields?.includes(field) || false}
                      onChange={(e) => {
                        const currentFields = analysisConfig.fields || [];
                        const newFields = e.target.checked 
                          ? [...currentFields, field]
                          : currentFields.filter(f => f !== field);
                        setAnalysisConfig({
                          ...analysisConfig,
                          fields: newFields
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor={`desc-${field}`} className="text-sm">
                      {field}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: numericFields
                  })}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: []
                  })}
                >
                  Clear All
                </Button>
              </div>
            </div>
            
            {/* Visualization Options */}
            <div>
              <label className="text-sm font-medium mb-2 block">Create Visualization</label>
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  onClick={() => createVisualization('correlation_matrix')}
                  disabled={isCreatingVisualization || numericFields.length < 2}
                  variant="outline"
                  className="h-auto py-3 px-4"
                >
                  <div className="text-center">
                    <TrendingUp className="mx-auto mb-1" size={20} />
                    <div>Correlation Matrix</div>
                  </div>
                </Button>
                <Button 
                  onClick={() => createVisualization('multivariate')}
                  disabled={isCreatingVisualization || numericFields.length < 3}
                  variant="outline"
                  className="h-auto py-3 px-4"
                >
                  <div className="text-center">
                    <BarChart3 className="mx-auto mb-1" size={20} />
                    <div>Multivariate Plot</div>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        );

      case "distribution":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Fields for Distribution Analysis</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {[...numericFields, ...categoricalFields].map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`dist-${field}`}
                      checked={analysisConfig.fields?.includes(field) || false}
                      onChange={(e) => {
                        const currentFields = analysisConfig.fields || [];
                        const newFields = e.target.checked 
                          ? [...currentFields, field]
                          : currentFields.filter(f => f !== field);
                        setAnalysisConfig({
                          ...analysisConfig,
                          fields: newFields
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor={`dist-${field}`} className="text-sm">
                      {field}
                      <Badge variant="outline" className="ml-1 text-xs">
                        {numericFields.includes(field) ? 'numeric' : 'categorical'}
                      </Badge>
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: [...numericFields, ...categoricalFields]
                  })}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: []
                  })}
                >
                  Clear All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: numericFields
                  })}
                >
                  Numeric Only
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: categoricalFields
                  })}
                >
                  Categorical Only
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Distribution Analysis Options</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-histograms"
                    checked={analysisConfig.showHistograms !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      showHistograms: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="show-histograms" className="text-sm">
                    Show histograms
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-frequencies"
                    checked={analysisConfig.showFrequencies !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      showFrequencies: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="show-frequencies" className="text-sm">
                    Show frequency tables
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-percentiles"
                    checked={analysisConfig.showPercentiles !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      showPercentiles: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="show-percentiles" className="text-sm">
                    Show percentiles
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="detect-outliers"
                    checked={analysisConfig.detectOutliers !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      detectOutliers: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="detect-outliers" className="text-sm">
                    Detect outliers
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case "correlation":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Numeric Fields for Correlation</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {numericFields.map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`corr-${field}`}
                      checked={analysisConfig.fields?.includes(field) || false}
                      onChange={(e) => {
                        const currentFields = analysisConfig.fields || [];
                        const newFields = e.target.checked 
                          ? [...currentFields, field]
                          : currentFields.filter(f => f !== field);
                        setAnalysisConfig({
                          ...analysisConfig,
                          fields: newFields
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor={`corr-${field}`} className="text-sm">
                      {field}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: numericFields
                  })}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: []
                  })}
                >
                  Clear All
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Correlation Method</label>
              <Select
                value={analysisConfig.method || 'pearson'}
                onValueChange={(value) => setAnalysisConfig({
                  ...analysisConfig,
                  method: value
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select correlation method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pearson">Pearson</SelectItem>
                  <SelectItem value="spearman">Spearman</SelectItem>
                  <SelectItem value="kendall">Kendall</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "categorical":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Categorical Fields</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {categoricalFields.map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`cat-${field}`}
                      checked={analysisConfig.fields?.includes(field) || false}
                      onChange={(e) => {
                        const currentFields = analysisConfig.fields || [];
                        const newFields = e.target.checked 
                          ? [...currentFields, field]
                          : currentFields.filter(f => f !== field);
                        setAnalysisConfig({
                          ...analysisConfig,
                          fields: newFields
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor={`cat-${field}`} className="text-sm">
                      {field}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: categoricalFields
                  })}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAnalysisConfig({
                    ...analysisConfig,
                    fields: []
                  })}
                >
                  Clear All
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Analysis Options</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-frequencies"
                    checked={analysisConfig.showFrequencies !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      showFrequencies: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="show-frequencies" className="text-sm">
                    Show frequency tables
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-crosstabs"
                    checked={analysisConfig.showCrosstabs !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      showCrosstabs: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="show-crosstabs" className="text-sm">
                    Show cross-tabulations
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-percentages"
                    checked={analysisConfig.showPercentages !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      showPercentages: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="show-percentages" className="text-sm">
                    Show percentages
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="chi-square-test"
                    checked={analysisConfig.chiSquareTest !== false}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      chiSquareTest: e.target.checked
                    })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="chi-square-test" className="text-sm">
                    Chi-square test
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case "advanced":
        return (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Advanced Statistical Analysis</h4>
              <p className="text-sm text-blue-800 mb-4">
                Access professional statistical methods including ANOVA, ANCOVA, MANOVA, MANCOVA, Regression, and Machine Learning algorithms.
              </p>
              <Button 
                onClick={() => setShowAdvancedModal(true)}
                className="w-full"
              >
                <Brain className="w-4 h-4 mr-2" />
                Open Advanced Analysis
              </Button>
            </div>
          </div>
        );

      case "custom":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Analysis Requirements</label>
              <Textarea
                placeholder="Describe what you want to analyze. For example: 'Find patterns in sales data by region and product category' or 'Identify outliers in customer spending behavior'"
                value={analysisConfig.requirements || ''}
                onChange={(e) => setAnalysisConfig({
                  ...analysisConfig,
                  requirements: e.target.value
                })}
                className="min-h-[100px]"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderResults = () => {
    if (!results) return null;

    switch (results.type) {
      case "descriptive":
        return (
          <div className="space-y-4">
            {results.data.statistics.map((stat: any) => (
              <div key={stat.field} className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">{stat.field}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Mean:</span>
                    <span className="font-medium ml-2">{stat.mean}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Median:</span>
                    <span className="font-medium ml-2">{stat.median}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Std Dev:</span>
                    <span className="font-medium ml-2">{stat.std}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Min:</span>
                    <span className="font-medium ml-2">{stat.min}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Max:</span>
                    <span className="font-medium ml-2">{stat.max}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case "distribution":
        return (
          <div className="space-y-6">
            {results.data.distributions.map((dist: any) => (
              <div key={dist.field} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium">{dist.field}</h4>
                  <Badge variant="outline">{dist.type}</Badge>
                </div>
                
                {dist.type === 'numeric' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Mean:</span>
                        <span className="font-medium ml-2">{dist.statistics.mean}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Median:</span>
                        <span className="font-medium ml-2">{dist.statistics.median}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Std Dev:</span>
                        <span className="font-medium ml-2">{dist.statistics.std}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Skewness:</span>
                        <span className="font-medium ml-2">{dist.statistics.skewness}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Kurtosis:</span>
                        <span className="font-medium ml-2">{dist.statistics.kurtosis}</span>
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="font-medium mb-2">Distribution Histogram</h5>
                      <div className="grid grid-cols-5 gap-2">
                        {dist.histogram.map((bin: any, i: number) => (
                          <div key={i} className="text-center">
                            <div 
                              className="bg-blue-500 mb-1 rounded-t" 
                              style={{height: `${Math.max(bin.count / 10, 5)}px`}}
                            ></div>
                            <div className="text-xs text-gray-600">{bin.bin}</div>
                            <div className="text-xs font-medium">{bin.count}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {dist.type === 'categorical' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Mode:</span>
                        <span className="font-medium ml-2">{dist.statistics.mode}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Unique Values:</span>
                        <span className="font-medium ml-2">{dist.statistics.uniqueValues}</span>
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="font-medium mb-2">Frequency Distribution</h5>
                      <div className="space-y-2">
                        {dist.histogram.map((cat: any, i: number) => (
                          <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <span className="text-sm">{cat.category}</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-500 h-2 rounded-full"
                                  style={{width: `${(cat.count / 100) * 100}%`}}
                                ></div>
                              </div>
                              <span className="text-sm font-medium">{cat.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      case "correlation":
        return (
          <div className="space-y-4">
            {results.data.correlations.map((corr: any, index: number) => (
              <div key={index} className="flex justify-between items-center p-3 border rounded">
                <span className="text-sm">
                  {corr.field1} ↔ {corr.field2}
                </span>
                <Badge variant={Math.abs(corr.correlation) > 0.5 ? "default" : "secondary"}>
                  {corr.correlation}
                </Badge>
              </div>
            ))}
          </div>
        );

      case "categorical":
        return (
          <div className="space-y-6">
            {results.data.frequencies.map((freq: any) => (
              <div key={freq.field} className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">{freq.field}</h4>
                <div className="space-y-2">
                  {freq.values.map((value: any, index: number) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm">{value.value}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{value.count}</span>
                        <Badge variant="outline">{value.percentage}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      default:
        return <p className="text-gray-600">{results.data.message}</p>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Analysis Type Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Choose Analysis Type
              </CardTitle>
              <CardDescription>
                Select the type of analysis you want to perform on your data
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAnonymizationToolkit(true)}
              className="flex items-center space-x-2"
            >
              <Shield className="h-4 w-4" />
              <span>Anonymization Toolkit</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {analysisTypes.map((analysis) => {
              const Icon = analysis.icon;
              return (
                <Button
                  key={analysis.value}
                  variant={selectedAnalysis === analysis.value ? "default" : "outline"}
                  className="h-auto flex-col items-start space-y-2 p-4"
                  onClick={() => {
                    setSelectedAnalysis(analysis.value);
                    setAnalysisConfig({});
                    setResults(null);
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{analysis.label}</span>
                  </div>
                  <p className="text-xs text-left opacity-75">{analysis.description}</p>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Analysis Configuration */}
      {selectedAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Analysis</CardTitle>
            <CardDescription>
              Set up the parameters for your {analysisTypes.find(t => t.value === selectedAnalysis)?.label}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderAnalysisConfig()}
            
            <div className="flex space-x-2 pt-4">
              <Button
                onClick={executeAnalysis}
                disabled={isAnalyzing}
              >
                <Play className="w-4 h-4 mr-2" />
                {isAnalyzing ? "Analyzing..." : "Run Analysis"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {/* Visualizations Section */}
      {visualizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Visualizations</CardTitle>
            <CardDescription>Charts created from your data analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visualizations.map((viz) => (
                <div key={viz.id} className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2">{viz.type.replace('_', ' ').toUpperCase()}</h4>
                  {viz.imageData && (
                    <img 
                      src={`data:image/png;base64,${viz.imageData}`}
                      alt={viz.type}
                      className="w-full rounded border"
                    />
                  )}
                  {viz.insights && viz.insights.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">Insights:</p>
                      <ul className="text-sm text-gray-600 list-disc list-inside">
                        {viz.insights.map((insight: string, idx: number) => (
                          <li key={idx}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Analysis Results</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={exportToPDF}
                disabled={isExporting}
              >
                <FileText className="w-4 h-4 mr-2" />
                {isExporting ? "Exporting..." : "Export PDF"}
              </Button>
            </CardTitle>
            <CardDescription>
              Results from your {analysisTypes.find(t => t.value === results.type)?.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderResults()}
          </CardContent>
        </Card>
      )}

      {/* Advanced Analysis Modal */}
      <AdvancedAnalysisModal
        isOpen={showAdvancedModal}
        onClose={() => setShowAdvancedModal(false)}
        projectId={project.id}
        schema={project.schema}
      />

      {/* Anonymization Toolkit */}
      <AnonymizationToolkit
        isOpen={showAnonymizationToolkit}
        onClose={() => setShowAnonymizationToolkit(false)}
        projectId={project.id}
        data={project.data || []}
        piiColumns={project.piiColumns || []}
        schema={project.schema}
      />
    </div>
  );
}