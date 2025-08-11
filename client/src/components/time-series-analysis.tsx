import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, Calendar, Activity, BarChart3, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TimeSeriesAnalysisProps {
  project: any;
}

interface TimeSeriesConfig {
  dateColumn: string;
  valueColumns: string[];
  frequency?: 'D' | 'W' | 'M' | 'Q' | 'Y';
  seasonality?: 'auto' | 'additive' | 'multiplicative';
  forecastPeriods?: number;
  includeHolidays?: boolean;
  confidenceInterval?: number;
}

export default function TimeSeriesAnalysis({ project }: TimeSeriesAnalysisProps) {
  const { toast } = useToast();
  const [detection, setDetection] = useState<any>(null);
  const [config, setConfig] = useState<TimeSeriesConfig>({
    dateColumn: '',
    valueColumns: [],
    frequency: 'D',
    seasonality: 'auto',
    forecastPeriods: 30,
    includeHolidays: false,
    confidenceInterval: 0.8
  });
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    if (project?.id) {
      detectTimeSeriesColumns();
    }
  }, [project?.id]);

  const detectTimeSeriesColumns = async () => {
    setIsDetecting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/time-series/detect`);
      const data = await response.json();
      
      if (data.success) {
        setDetection(data.detection);
        
        // Auto-select first date column if available
        if (data.detection.dateColumns.length > 0) {
          setConfig(prev => ({
            ...prev,
            dateColumn: data.detection.dateColumns[0]
          }));
        }
      }
    } catch (error: any) {
      toast({
        title: "Detection failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const runTimeSeriesAnalysis = async () => {
    if (!config.dateColumn || config.valueColumns.length === 0) {
      toast({
        title: "Configuration incomplete",
        description: "Please select a date column and at least one value column",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/time-series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(config)
      });

      const data = await response.json();
      
      if (data.success) {
        setResults(data.result);
        toast({
          title: "Analysis complete",
          description: "Time series analysis completed successfully"
        });
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleValueColumn = (column: string) => {
    setConfig(prev => ({
      ...prev,
      valueColumns: prev.valueColumns.includes(column)
        ? prev.valueColumns.filter(c => c !== column)
        : [...prev.valueColumns, column]
    }));
  };

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Time Series Analysis</CardTitle>
            <CardDescription>Project data is not loaded yet.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Time Series Analysis
          </CardTitle>
          <CardDescription>
            Analyze temporal patterns, trends, and forecast future values using advanced time series methods
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Column Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Column Detection
          </CardTitle>
          <CardDescription>
            Automatically detect date and numeric columns suitable for time series analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isDetecting ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Detecting time series columns...</span>
            </div>
          ) : detection ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Date Columns Found ({detection.dateColumns.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {detection.dateColumns.map((col: string) => (
                    <Badge key={col} variant="secondary">
                      <Calendar className="w-3 h-3 mr-1" />
                      {col}
                    </Badge>
                  ))}
                  {detection.dateColumns.length === 0 && (
                    <span className="text-sm text-muted-foreground">No date columns detected</span>
                  )}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Numeric Columns Found ({detection.numericColumns.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {detection.numericColumns.map((col: string) => (
                    <Badge key={col} variant="outline">
                      <BarChart3 className="w-3 h-3 mr-1" />
                      {col}
                    </Badge>
                  ))}
                  {detection.numericColumns.length === 0 && (
                    <span className="text-sm text-muted-foreground">No numeric columns detected</span>
                  )}
                </div>
              </div>

              {detection.suggestions.length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium mb-2 text-blue-900">Suggestions</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {detection.suggestions.map((suggestion: string, index: number) => (
                      <li key={index}>• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <Button onClick={detectTimeSeriesColumns} variant="outline">
              <Activity className="w-4 h-4 mr-2" />
              Detect Time Series Columns
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      {detection && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Configuration</CardTitle>
            <CardDescription>
              Configure the time series analysis parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Date Column Selection */}
            <div>
              <Label htmlFor="date-column">Date/Timestamp Column</Label>
              <Select value={config.dateColumn} onValueChange={(value) => 
                setConfig(prev => ({ ...prev, dateColumn: value }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Choose date or timestamp field" />
                </SelectTrigger>
                <SelectContent>
                  {detection?.dateColumns?.map((col: string) => (
                    <SelectItem key={col} value={col}>
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4" />
                        <span>{col}</span>
                      </div>
                    </SelectItem>
                  )) || (
                    <SelectItem value="" disabled>No date columns detected</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Select the column containing dates or timestamps for your time series
              </p>
            </div>

            {/* Value Columns Selection */}
            <div>
              <Label>Variables to Visualize</Label>
              <p className="text-sm text-gray-600 mb-2">
                Choose which variables you want to visualize relationships with over time
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {detection?.numericColumns?.map((col: string) => (
                  <div key={col} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                    <Checkbox
                      id={`value-${col}`}
                      checked={config.valueColumns.includes(col)}
                      onCheckedChange={() => toggleValueColumn(col)}
                    />
                    <label htmlFor={`value-${col}`} className="text-sm flex items-center space-x-1">
                      <BarChart3 className="w-3 h-3 text-blue-500" />
                      <span>{col}</span>
                    </label>
                  </div>
                )) || (
                  <p className="text-sm text-gray-500 p-2">No numeric columns available for visualization</p>
                )}
              </div>
              {config.valueColumns.length > 0 && (
                <p className="text-xs text-green-600 mt-2">
                  ✓ Selected {config.valueColumns.length} variable(s) for time series visualization
                </p>
              )}
            </div>

            {/* Visualization Options */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Time Series Relationships</h4>
              <p className="text-sm text-blue-700">
                This analysis will show how your selected variables change over time and their relationships with the date/timestamp field. 
                You can visualize trends, seasonal patterns, and correlations between different variables.
              </p>
            </div>

            {/* Analysis Parameters */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="frequency">Frequency</Label>
                <Select value={config.frequency} onValueChange={(value: any) => 
                  setConfig(prev => ({ ...prev, frequency: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="D">Daily</SelectItem>
                    <SelectItem value="W">Weekly</SelectItem>
                    <SelectItem value="M">Monthly</SelectItem>
                    <SelectItem value="Q">Quarterly</SelectItem>
                    <SelectItem value="Y">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="forecast-periods">Forecast Periods</Label>
                <Input
                  id="forecast-periods"
                  type="number"
                  value={config.forecastPeriods}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    forecastPeriods: parseInt(e.target.value) || 30 
                  }))}
                  min={1}
                  max={365}
                />
              </div>

              <div>
                <Label htmlFor="confidence">Confidence Interval</Label>
                <Select value={config.confidenceInterval?.toString()} onValueChange={(value) => 
                  setConfig(prev => ({ ...prev, confidenceInterval: parseFloat(value) }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.8">80%</SelectItem>
                    <SelectItem value="0.9">90%</SelectItem>
                    <SelectItem value="0.95">95%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Run Analysis Button */}
            <Button 
              onClick={runTimeSeriesAnalysis}
              disabled={isAnalyzing || !config.dateColumn || config.valueColumns.length === 0}
              className="w-full"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Run Time Series Analysis
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
            <CardDescription>
              Time series analysis results and forecasting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Metrics */}
              <div>
                <h4 className="font-medium mb-3">Model Performance</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{results.metrics.mae.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Mean Absolute Error</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{results.metrics.mape.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Mean Absolute Percentage Error</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{results.metrics.rmse.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Root Mean Square Error</div>
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div>
                <h4 className="font-medium mb-3">Key Insights</h4>
                <div className="space-y-2">
                  {results.insights.map((insight: string, index: number) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-gray-50 rounded">
                      <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Forecast Preview */}
              {results.forecast && results.forecast.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Forecast Preview (First 10 periods)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Date</th>
                          <th className="text-left p-2">Forecast</th>
                          <th className="text-left p-2">Lower Bound</th>
                          <th className="text-left p-2">Upper Bound</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.forecast.slice(0, 10).map((row: any, index: number) => (
                          <tr key={index} className="border-b">
                            <td className="p-2">{new Date(row.date).toLocaleDateString()}</td>
                            <td className="p-2 font-medium">{row.value.toFixed(2)}</td>
                            <td className="p-2 text-red-600">{row.lower_bound.toFixed(2)}</td>
                            <td className="p-2 text-green-600">{row.upper_bound.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}