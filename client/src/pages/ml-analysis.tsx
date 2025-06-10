import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Brain, TrendingUp, Users, Clock, Target, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MLAnalysisProps {
  projectId: string;
  projectData: {
    name: string;
    schema: Record<string, string>;
    recordCount: number;
  };
  onBack: () => void;
}

interface AnalysisType {
  name: string;
  description: string;
  algorithms: string[];
  useCase: string;
  requirements: string;
  outputMetrics: string[];
}

interface MLAnalysisResult {
  analysisType: string;
  results: {
    summary: string;
    metrics?: Record<string, any>;
    insights: string[];
    recommendations: string[];
    modelPerformance?: Record<string, number>;
    visualizations?: Array<{
      type: string;
      title: string;
      data: any;
      config: any;
    }>;
  };
  processingTime: number;
  dataQuality: {
    completeness: number;
    consistency: number;
    accuracy: number;
    issues: string[];
  };
}

export default function MLAnalysisPage({ projectId, projectData, onBack }: MLAnalysisProps) {
  const [selectedAnalysis, setSelectedAnalysis] = useState<string>("");
  const [targetColumn, setTargetColumn] = useState<string>("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<MLAnalysisResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get available analysis types
  const { data: analysisTypes } = useQuery({
    queryKey: ["/api/ml/analysis-types"],
    retry: false,
  });

  // Get recommended analysis types for this project
  const { data: recommendations } = useQuery({
    queryKey: ["/api/ml/recommend-analysis", projectId],
    retry: false,
  });

  // Validate analysis request
  const validateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/ml/validate-request", data);
      return response.json();
    },
    onSuccess: (data) => {
      setValidationErrors(data.valid ? [] : data.errors);
    }
  });

  // Run ML analysis
  const runAnalysisMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/ml/run-analysis", data);
      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Analysis Complete",
        description: `${selectedAnalysis} analysis completed successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to run ML analysis",
        variant: "destructive",
      });
    }
  });

  const columns = Object.keys(projectData.schema);
  const numericalColumns = columns.filter(col => 
    ['number', 'float', 'int', 'numeric'].includes(projectData.schema[col].toLowerCase())
  );
  const categoricalColumns = columns.filter(col => 
    ['text', 'string', 'category', 'categorical'].includes(projectData.schema[col].toLowerCase())
  );

  const handleAnalysisChange = (value: string) => {
    setSelectedAnalysis(value);
    setTargetColumn("");
    setSelectedFeatures([]);
    setValidationErrors([]);
    setAnalysisResult(null);
  };

  const handleValidation = () => {
    validateMutation.mutate({
      projectId,
      analysisType: selectedAnalysis,
      targetColumn,
      features: selectedFeatures
    });
  };

  const handleRunAnalysis = () => {
    runAnalysisMutation.mutate({
      projectId,
      analysisType: selectedAnalysis,
      targetColumn: targetColumn || undefined,
      features: selectedFeatures.length > 0 ? selectedFeatures : undefined,
      parameters: {}
    });
  };

  const getAnalysisIcon = (type: string) => {
    switch (type) {
      case 'regression': return <TrendingUp className="h-5 w-5" />;
      case 'classification': return <Target className="h-5 w-5" />;
      case 'clustering': return <Users className="h-5 w-5" />;
      case 'timeseries': return <Clock className="h-5 w-5" />;
      case 'anomaly': return <AlertCircle className="h-5 w-5" />;
      case 'association': return <Zap className="h-5 w-5" />;
      default: return <Brain className="h-5 w-5" />;
    }
  };

  const isRecommended = (type: string) => {
    return recommendations?.recommendations?.includes(type);
  };

  const requiresTarget = ['regression', 'classification'].includes(selectedAnalysis);

  if (analysisResult) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Button variant="outline" onClick={() => setAnalysisResult(null)}>
            ← Back to Analysis Setup
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getAnalysisIcon(analysisResult.analysisType)}
              {analysisResult.analysisType.charAt(0).toUpperCase() + analysisResult.analysisType.slice(1)} Analysis Results
            </CardTitle>
            <CardDescription>
              Analysis completed in {(analysisResult.processingTime / 1000).toFixed(1)} seconds
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Summary</h3>
              <p className="text-gray-700 dark:text-gray-300">{analysisResult.results.summary}</p>
            </div>

            {/* Model Performance Metrics */}
            {analysisResult.results.modelPerformance && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Model Performance</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(analysisResult.results.modelPerformance).map(([metric, value]) => (
                    <Card key={metric}>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {typeof value === 'number' ? (value * 100).toFixed(1) + '%' : value}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {metric.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Data Quality */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Data Quality Assessment</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Completeness</span>
                    <span className="text-sm">{analysisResult.dataQuality.completeness}%</span>
                  </div>
                  <Progress value={analysisResult.dataQuality.completeness} />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Consistency</span>
                    <span className="text-sm">{analysisResult.dataQuality.consistency}%</span>
                  </div>
                  <Progress value={analysisResult.dataQuality.consistency} />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Accuracy</span>
                    <span className="text-sm">{analysisResult.dataQuality.accuracy}%</span>
                  </div>
                  <Progress value={analysisResult.dataQuality.accuracy} />
                </div>
              </div>
              {analysisResult.dataQuality.issues?.length > 0 && (
                <div className="mt-3">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Data quality issues: {analysisResult.dataQuality.issues.filter(Boolean).join(', ')}
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>

            {/* Insights */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Key Insights</h3>
              <ul className="space-y-2">
                {analysisResult.results.insights.map((insight, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommendations */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {analysisResult.results.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Detailed Metrics */}
            {analysisResult.results.metrics && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Detailed Metrics</h3>
                <ScrollArea className="h-40">
                  <pre className="text-sm bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-x-auto">
                    {JSON.stringify(analysisResult.results.metrics, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button variant="outline" onClick={onBack}>
          ← Back to Project
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-6 w-6" />
              Machine Learning Analysis
            </CardTitle>
            <CardDescription>
              Choose an analysis type for your dataset: {projectData.name} ({projectData.recordCount} records)
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Analysis Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Analysis Type</CardTitle>
            <CardDescription>
              Choose the type of machine learning analysis you want to perform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysisTypes && Object.entries(analysisTypes).map(([key, type]: [string, any]) => (
                <Card 
                  key={key} 
                  className={`cursor-pointer transition-colors ${
                    selectedAnalysis === key 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => handleAnalysisChange(key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getAnalysisIcon(key)}
                        <h3 className="font-semibold">{type.name}</h3>
                      </div>
                      {isRecommended(key) && (
                        <Badge variant="secondary" className="text-xs">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {type.description}
                    </p>
                    <div className="text-xs text-gray-500 dark:text-gray-500">
                      <div className="mb-1">
                        <strong>Use case:</strong> {type.useCase}
                      </div>
                      <div>
                        <strong>Requirements:</strong> {type.requirements}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        {selectedAnalysis && (
          <Card>
            <CardHeader>
              <CardTitle>Analysis Configuration</CardTitle>
              <CardDescription>
                Configure the parameters for {analysisTypes?.[selectedAnalysis]?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Target Column Selection */}
              {requiresTarget && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Target Column (What you want to predict)
                  </label>
                  <Select value={targetColumn} onValueChange={setTargetColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target column" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedAnalysis === 'regression' 
                        ? numericalColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))
                        : columns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Feature Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Feature Columns (Leave empty to use all suitable columns)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {columns
                    .filter(col => col !== targetColumn)
                    .map(col => (
                      <label key={col} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedFeatures.includes(col)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFeatures([...selectedFeatures, col]);
                            } else {
                              setSelectedFeatures(selectedFeatures.filter(f => f !== col));
                            }
                          }}
                          className="rounded"
                        />
                        <span>{col}</span>
                        <Badge variant="outline" className="text-xs">
                          {projectData.schema[col]}
                        </Badge>
                      </label>
                    ))}
                </div>
              </div>

              {/* Validation */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleValidation}
                  disabled={!selectedAnalysis || (requiresTarget && !targetColumn)}
                >
                  Validate Configuration
                </Button>
                <Button
                  onClick={handleRunAnalysis}
                  disabled={
                    !selectedAnalysis || 
                    (requiresTarget && !targetColumn) || 
                    validationErrors.length > 0 ||
                    runAnalysisMutation.isPending
                  }
                >
                  {runAnalysisMutation.isPending ? "Running Analysis..." : "Run Analysis"}
                </Button>
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      {validationErrors.map((error, index) => (
                        <div key={index}>• {error}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Expected Output */}
              {selectedAnalysis && analysisTypes?.[selectedAnalysis] && (
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded">
                  <h4 className="font-medium mb-2">Expected Output Metrics:</h4>
                  <div className="flex flex-wrap gap-2">
                    {analysisTypes[selectedAnalysis].outputMetrics.map((metric: string) => (
                      <Badge key={metric} variant="secondary">
                        {metric}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}