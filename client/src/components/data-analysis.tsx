import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BarChart3, PieChart, TrendingUp, Calculator, Play, Download, Brain, Zap, Shield } from "lucide-react";
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
      case "correlation":
        return {
          correlations: numericFields.map((field1, i) => 
            numericFields.slice(i + 1).map(field2 => ({
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

  const renderAnalysisConfig = () => {
    if (!selectedAnalysis) return null;

    switch (selectedAnalysis) {
      case "descriptive":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Numeric Fields</label>
              <Select
                value={analysisConfig.fields?.join(',') || ''}
                onValueChange={(value) => setAnalysisConfig({
                  ...analysisConfig,
                  fields: value ? value.split(',') : []
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose fields to analyze" />
                </SelectTrigger>
                <SelectContent>
                  {numericFields.map(field => (
                    <SelectItem key={field} value={field}>{field}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "correlation":
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Correlation analysis will be performed on all numeric fields
            </p>
            <div className="flex flex-wrap gap-2">
              {numericFields.map(field => (
                <Badge key={field} variant="outline">{field}</Badge>
              ))}
            </div>
          </div>
        );

      case "categorical":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Categorical Fields</label>
              <Select
                value={analysisConfig.fields?.join(',') || ''}
                onValueChange={(value) => setAnalysisConfig({
                  ...analysisConfig,
                  fields: value ? value.split(',') : []
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose fields to analyze" />
                </SelectTrigger>
                <SelectContent>
                  {categoricalFields.map(field => (
                    <SelectItem key={field} value={field}>{field}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Analysis Results</span>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export Results
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