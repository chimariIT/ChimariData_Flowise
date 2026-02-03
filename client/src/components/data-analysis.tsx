import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart3, PieChart, TrendingUp, Calculator, Play, Download, Brain, Zap, Shield, FileText, Activity, Clock, Cloud, LineChart, ScatterChart, Eye, Grid, Users, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AdvancedAnalysisModalLazy, TimeSeriesAnalysisLazy } from "./LazyComponents";
import AnonymizationToolkit from "./AnonymizationToolkit";
import CloudDataConnector from "./cloud-data-connector";
import { AudienceFormattedResults } from './audience-formatted-results';
import type { LucideIcon } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useJourneyState } from "@/hooks/useJourneyState";
import { useLocation } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  PieChart as RePieChart,
  Pie as RePie,
  Cell,
  ScatterChart as ReScatterChart,
  Scatter
} from 'recharts';

type AnalysisOption = {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  fields: 'numeric' | 'categorical' | 'time_series' | 'any';
};

const DEFAULT_ANALYSIS_TYPES: AnalysisOption[] = [
  {
    value: "descriptive",
    label: "Descriptive Statistics",
    description: "Summary statistics, mean, median, mode, etc.",
    icon: Calculator,
    fields: "numeric"
  },
  {
    value: "correlation",
    label: "Correlation Analysis",
    description: "Relationships between variables",
    icon: TrendingUp,
    fields: "numeric"
  },
  {
    value: "time_series",
    label: "Time Series Analysis",
    description: "Forecasting, trend analysis, seasonal decomposition",
    icon: Clock,
    fields: "time_series"
  },
  {
    value: "regression",
    label: "Regression Analysis",
    description: "Linear and multiple regression models",
    icon: Brain,
    fields: "numeric"
  },
  {
    value: "clustering",
    label: "Clustering Analysis",
    description: "Group data into similar clusters",
    icon: Brain,
    fields: "numeric"
  },
  {
    value: "categorical",
    label: "Categorical Analysis",
    description: "Frequency counts, cross-tabulations",
    icon: BarChart3,
    fields: "categorical"
  },
  {
    value: "segmentation",
    label: "Segmentation Analysis",
    description: "Identify distinct audience or customer segments",
    icon: Users,
    fields: "any"
  },
  {
    value: "trend_analysis",
    label: "Trend Analysis",
    description: "Spot short and long-term changes over time",
    icon: TrendingUp,
    fields: "time_series"
  },
  {
    value: "data_quality",
    label: "Data Quality Review",
    description: "Assess completeness, duplication, and anomalies",
    icon: Shield,
    fields: "any"
  },
  {
    value: "visualization",
    label: "Visualization Workshop",
    description: "Launch the interactive visualization workspace",
    icon: Eye,
    fields: "any"
  },
  {
    value: "custom",
    label: "Custom Analysis",
    description: "Define your own analysis requirements",
    icon: Calculator,
    fields: "any"
  }
];

const ANALYSIS_TYPE_LOOKUP: Record<string, AnalysisOption> = DEFAULT_ANALYSIS_TYPES.reduce((acc, option) => {
  acc[option.value] = option;
  return acc;
}, {} as Record<string, AnalysisOption>);

interface DataAnalysisProps {
  project: any;
}

export default function DataAnalysis({ project }: DataAnalysisProps) {
  // Add error boundary check and debug info
  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Analysis Not Available</CardTitle>
            <CardDescription>Project data is not loaded yet. Please make sure you have uploaded a dataset first.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Debug: Project prop is null or undefined</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Debug: Check project structure
  if (!project.id) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Analysis Configuration Error</CardTitle>
            <CardDescription>Project is missing required information.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Debug: Project missing ID - {JSON.stringify(Object.keys(project))}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Journey completion guard - ensure users go through user journey flow
  const [, setLocation] = useLocation();
  const { data: journeyState } = useJourneyState(project?.id);

  // Check if user has completed minimum required journey steps
  const requiredSteps = ['data', 'prepare', 'data-verification'];
  const completedSteps = journeyState?.completedSteps ||
    (project?.journeyProgress?.completedSteps) ||
    [];
  const canRunAnalysis = requiredSteps.every(step => completedSteps.includes(step));

  // If journey steps are incomplete, show guidance to complete user journey first
  if (!canRunAnalysis && project?.id) {
    const journeyType = journeyState?.journeyType || project?.journeyType || 'non-tech';
    const missingSteps = requiredSteps.filter(step => !completedSteps.includes(step));

    return (
      <div className="p-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Complete User Journey First
            </CardTitle>
            <CardDescription className="text-amber-700">
              To run analysis, please complete the guided user journey. This ensures your data
              is properly prepared, verified, and your analysis goals are captured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-amber-700">
              <p className="font-medium mb-2">Missing steps:</p>
              <ul className="list-disc pl-5 space-y-1">
                {missingSteps.includes('data') && <li>Data Upload - Upload your dataset(s)</li>}
                {missingSteps.includes('prepare') && <li>Prepare - Define your analysis goals and questions</li>}
                {missingSteps.includes('data-verification') && <li>Data Verification - Verify data quality and privacy settings</li>}
              </ul>
            </div>
            <Button
              onClick={() => {
                localStorage.setItem('currentProjectId', project.id);
                // Redirect to the first incomplete step
                const nextStep = missingSteps[0] || 'prepare';
                setLocation(`/journeys/${journeyType}/${nextStep}?projectId=${project.id}&resume=true`);
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Resume Journey
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
  const [visualizationResults, setVisualizationResults] = useState<any[]>([]);
  const [showAudienceResults, setShowAudienceResults] = useState(false);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOption[]>(DEFAULT_ANALYSIS_TYPES);

  const resolveAnalysisOption = (value?: string | null) => {
    if (!value) return undefined;
    return analysisOptions.find(option => option.value === value) || ANALYSIS_TYPE_LOOKUP[value];
  };

  useEffect(() => {
    let cancelled = false;
    async function loadAvailableAnalyses() {
      try {
        const response = await apiClient.getAudienceAnalysisTypes(project.id);
        if (!response?.success || !Array.isArray(response.availableTypes)) {
          return;
        }

        const mapped: AnalysisOption[] = response.availableTypes.map((typeValue: string) => {
          const normalized = typeValue as string;
          const fallback: AnalysisOption = ANALYSIS_TYPE_LOOKUP[normalized] || {
            value: normalized,
            label: normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
            description: "Analysis available for your dataset",
            icon: BarChart3,
            fields: "any"
          };
          return fallback;
        });

        const alwaysAvailable = ['custom', 'visualization'];
        alwaysAvailable.forEach((value) => {
          if (!mapped.some(option => option.value === value) && ANALYSIS_TYPE_LOOKUP[value]) {
            mapped.push(ANALYSIS_TYPE_LOOKUP[value]);
          }
        });

        if (!cancelled && mapped.length > 0) {
          setAnalysisOptions(mapped);
        }
      } catch (error) {
        console.warn('Failed to load available analysis types', error);
      }
    }

    loadAvailableAnalyses();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const schema = project.schema || {};
  const numericFields = Object.entries(schema)
    .filter(([_, info]: [string, any]) => info.type === 'number')
    .map(([name]) => name);
  const categoricalFields = Object.entries(schema)
    .filter(([_, info]: [string, any]) => info.type === 'text')
    .map(([name]) => name);

  const resolvedAnalysisOption = resolveAnalysisOption(selectedAnalysis) ?? resolveAnalysisOption(results?.type);
  const resolvedFields = Array.isArray(analysisConfig.fields)
    ? analysisConfig.fields
    : (analysisConfig.field ? [analysisConfig.field] : []);
  const formattedOutput = results?.formattedResults;
  const pipelineStatus = isAnalyzing ? 'Running' : results ? 'Completed' : 'Awaiting input';
  const totalVisualizations = (visualizationResults.length + visualizations.length);
  const inputDatasetName = project.name || `Project ${project.id}`;
  const inputFieldLabel = resolvedFields.length
    ? resolvedFields.join(', ')
    : resolvedAnalysisOption?.fields === 'numeric'
      ? (numericFields.slice(0, 3).join(', ') || 'Auto-detected numeric fields')
      : resolvedAnalysisOption?.fields === 'categorical'
        ? (categoricalFields.slice(0, 3).join(', ') || 'Auto-detected categorical fields')
        : 'Auto-detected relevant fields';
  const outputInsightCount = formattedOutput?.businessInsights?.length ?? 0;
  const outputRecommendationCount = formattedOutput?.actionableRecommendations?.length ?? 0;

  const visualizationTypes = [
    {
      value: "bar_chart",
      label: "Bar Chart",
      description: "Compare categories or show distributions",
      icon: BarChart3,
      fields: "categorical"
    },
    {
      value: "line_chart",
      label: "Line Chart",
      description: "Show trends over time or continuous data",
      icon: LineChart,
      fields: "time_series"
    },
    {
      value: "scatter_plot",
      label: "Scatter Plot",
      description: "Explore relationships between variables",
      icon: ScatterChart,
      fields: "numeric"
    },
    {
      value: "pie_chart",
      label: "Pie Chart",
      description: "Show proportions of a whole",
      icon: PieChart,
      fields: "categorical"
    },
    {
      value: "histogram",
      label: "Histogram",
      description: "Show distribution of numeric data",
      icon: Activity,
      fields: "numeric"
    },
    {
      value: "box_plot",
      label: "Box Plot",
      description: "Show quartiles and outliers",
      icon: Activity,
      fields: "numeric"
    },
    {
      value: "violin_plot",
      label: "Violin Plot",
      description: "Show distribution shape and density",
      icon: Activity,
      fields: "numeric"
    },
    {
      value: "heatmap",
      label: "Heatmap",
      description: "Show correlations with color intensity",
      icon: Grid,
      fields: "numeric"
    }
  ];

  const executeAnalysis = async () => {
    if (!selectedAnalysis) {
      toast({
        title: "Select an analysis type",
        description: "Choose the type of analysis you want to run before executing.",
        variant: "destructive",
      });
      return;
    }

    if (selectedAnalysis === 'visualization') {
      window.location.href = `/visualization/${project.id}`;
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const payload: Record<string, unknown> = {
        analysisType: selectedAnalysis,
        config: analysisConfig,
      };

      if (project?.audienceContext) {
        payload.audienceContext = project.audienceContext;
      }

      const analysisResponse = await apiClient.runAudienceAnalysis(project.id, payload as any);

      if (!analysisResponse?.success) {
        throw new Error(analysisResponse?.error || 'Analysis failed');
      }

      const rawResults = analysisResponse.rawResults || {};
      const formatted = analysisResponse.formattedResults;

      setCurrentAnalysisId(analysisResponse.analysisId || analysisResponse.metadata?.analysisId || `analysis_${project.id}_${Date.now()}`);
      setResults({
        type: analysisResponse.analysisType,
        data: rawResults?.data || rawResults,
        rawResults,
        formattedResults: formatted,
        summary: analysisResponse.metadata
      });
      if (Array.isArray(rawResults?.visualizations)) {
        setVisualizationResults(prev => [...prev, ...rawResults.visualizations]);
      }
      if (analysisResponse.visualizations?.visualization) {
        setVisualizations(prev => [...prev, analysisResponse.visualizations.visualization]);
      }
      setShowAudienceResults(true);

      toast({
        title: "Analysis complete",
        description: `Generated ${formatted?.businessInsights?.length ?? formatted?.actionableRecommendations?.length ?? 0} insights.`,
      });
    } catch (error: any) {
      console.error('Analysis error:', error);
      const message = error?.message || 'Analysis failed. Please try again.';
      setAnalysisError(message);
      setResults(null);
      toast({
        title: "Analysis failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createVisualization = async (type: string, selectedColumns?: string[]) => {
    setIsCreatingVisualization(true);
    try {
      const result = await apiClient.createProjectVisualization(project.id, {
        chartType: type,
        fields: selectedColumns || analysisConfig.fields || (type === 'correlation_matrix'
          ? numericFields
          : [...numericFields, ...categoricalFields]),
      });

      // Use backend data if available; show pending state otherwise
      const backendData = result?.visualization?.data;

      const enhancedResult = {
        ...result,
        visualization: {
          ...result.visualization,
          type: type,
          data: Array.isArray(backendData) && backendData.length > 0
            ? backendData
            : null
        }
      };

      setVisualizationResults(prev => [...prev, enhancedResult]);
      if (enhancedResult?.visualization) {
        setVisualizations(prev => [...prev, enhancedResult.visualization]);
      }

      toast({
        title: "Visualization created",
        description: `${type.replace('_', ' ')} chart generated interactively`,
      });

    } catch (error: any) {
      console.error('Visualization error:', error);
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
                          : currentFields.filter((f: any) => f !== field);
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

      case "visualization":
        return (
          <div className="space-y-6">
            {/* Chart Type Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Chart Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: 'bar', label: 'Bar Chart', icon: BarChart3, description: 'Compare categories' },
                  { value: 'line', label: 'Line Chart', icon: TrendingUp, description: 'Show trends over time' },
                  { value: 'scatter', label: 'Scatter Plot', icon: Activity, description: 'Explore relationships' },
                  { value: 'pie', label: 'Pie Chart', icon: PieChart, description: 'Show proportions' },
                  { value: 'histogram', label: 'Histogram', icon: BarChart3, description: 'Show distribution' },
                  { value: 'box_plot', label: 'Box Plot', icon: Calculator, description: 'Show quartiles' },
                  { value: 'heatmap', label: 'Heatmap', icon: Brain, description: 'Show correlations' },
                  { value: 'violin', label: 'Violin Plot', icon: Activity, description: 'Distribution shape' }
                ].map((chartType) => (
                  <Button
                    key={chartType.value}
                    variant={analysisConfig.chartType === chartType.value ? "default" : "outline"}
                    className="h-auto p-3 flex flex-col items-center gap-2"
                    onClick={() => setAnalysisConfig({
                      ...analysisConfig,
                      chartType: chartType.value
                    })}
                  >
                    <chartType.icon className="h-5 w-5" />
                    <div className="text-center">
                      <div className="text-xs font-medium">{chartType.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{chartType.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Field Configuration based on chart type */}
            {analysisConfig.chartType && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900">Configure Chart Fields</h4>

                {/* X-Axis Field */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">X-Axis Field</label>
                  <Select
                    value={analysisConfig.xAxis || ''}
                    onValueChange={(value) => setAnalysisConfig({
                      ...analysisConfig,
                      xAxis: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select X-axis field" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...numericFields, ...categoricalFields].filter(field => field && field.trim()).map(field => (
                        <SelectItem key={field} value={field}>
                          {field}
                          <Badge variant="outline" className="ml-2 text-xs">
                            {numericFields.includes(field) ? 'numeric' : 'categorical'}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Y-Axis Field */}
                {!['pie', 'heatmap'].includes(analysisConfig.chartType) && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Y-Axis Field</label>
                    <Select
                      value={analysisConfig.yAxis || ''}
                      onValueChange={(value) => setAnalysisConfig({
                        ...analysisConfig,
                        yAxis: value
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Y-axis field" />
                      </SelectTrigger>
                      <SelectContent>
                        {numericFields.filter(field => field && field.trim()).map(field => (
                          <SelectItem key={field} value={field}>
                            {field}
                            <Badge variant="outline" className="ml-2 text-xs">numeric</Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Group By Field */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Color/Group By (Optional)</label>
                  <Select
                    value={analysisConfig.groupBy || undefined}
                    onValueChange={(value) => setAnalysisConfig({
                      ...analysisConfig,
                      groupBy: value === '__none__' ? '' : value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select grouping field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {categoricalFields.filter(field => field && field.trim()).map(field => (
                        <SelectItem key={field} value={field}>
                          {field}
                          <Badge variant="outline" className="ml-2 text-xs">categorical</Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Aggregation Method */}
                {['bar', 'line'].includes(analysisConfig.chartType) && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Aggregation Method</label>
                    <Select
                      value={analysisConfig.aggregation || 'sum'}
                      onValueChange={(value) => setAnalysisConfig({
                        ...analysisConfig,
                        aggregation: value
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select aggregation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sum">Sum</SelectItem>
                        <SelectItem value="mean">Mean</SelectItem>
                        <SelectItem value="median">Median</SelectItem>
                        <SelectItem value="count">Count</SelectItem>
                        <SelectItem value="min">Minimum</SelectItem>
                        <SelectItem value="max">Maximum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Chart Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Chart Title (Optional)</label>
                  <input
                    type="text"
                    value={analysisConfig.title || ''}
                    onChange={(e) => setAnalysisConfig({
                      ...analysisConfig,
                      title: e.target.value
                    })}
                    placeholder="Enter custom chart title"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {/* Field Interaction Preview */}
                {analysisConfig.xAxis && (analysisConfig.yAxis || ['pie', 'histogram'].includes(analysisConfig.chartType)) && (
                  <div className="bg-green-50 p-3 rounded-lg">
                    <h5 className="font-medium text-green-900 text-sm mb-1">Chart Preview</h5>
                    <p className="text-xs text-green-700">
                      Creating {analysisConfig.chartType} chart with <strong>{analysisConfig.xAxis}</strong>
                      {analysisConfig.yAxis && <span> vs <strong>{analysisConfig.yAxis}</strong></span>}
                      {analysisConfig.groupBy && <span>, grouped by <strong>{analysisConfig.groupBy}</strong></span>}
                      {analysisConfig.aggregation && analysisConfig.aggregation !== 'sum' && (
                        <span> using <strong>{analysisConfig.aggregation}</strong> aggregation</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
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
                          : currentFields.filter((f: string) => f !== field);
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
                          : currentFields.filter((f: string) => f !== field);
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
                          : currentFields.filter((f: any) => f !== field);
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
                              style={{ height: `${Math.max(bin.count / 10, 5)}px` }}
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
                                  style={{ width: `${(cat.count / 100) * 100}%` }}
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

      case "time_series":
        return <TimeSeriesAnalysisLazy project={project} />;



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
            {analysisOptions.map((analysis) => {
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
                    setAnalysisError(null);
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

      {/* Visualization Workshop Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Create Visualizations
          </CardTitle>
          <CardDescription>
            Build interactive charts and graphs from your data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {visualizationTypes.map((viz) => {
              const Icon = viz.icon;
              return (
                <Button
                  key={viz.value}
                  variant="outline"
                  className="h-auto flex-col items-start space-y-2 p-4 hover:bg-blue-50"
                  onClick={() => {
                    // Navigate to visualization workshop with the selected type
                    window.location.href = `/visualization/${project.id}?type=${viz.value}`;
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">{viz.label}</span>
                  </div>
                  <p className="text-xs text-left opacity-75">{viz.description}</p>
                  <Badge variant="outline" className="text-xs">
                    {viz.fields}
                  </Badge>
                </Button>
              );
            })}
          </div>
          <div className="mt-6 pt-4 border-t">
            <Button
              className="w-full"
              onClick={() => window.location.href = `/visualization/${project.id}`}
            >
              <Eye className="w-4 h-4 mr-2" />
              Open Visualization Workshop
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Configuration */}
      {selectedAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Analysis</CardTitle>
            <CardDescription>
              Set up the parameters for your {resolveAnalysisOption(selectedAnalysis)?.label}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderAnalysisConfig()}

            {/* Visualization Creation Section - Positioned BEFORE Run Analysis */}
            {selectedAnalysis === 'visualization' && analysisConfig.chartType && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-gray-700">Create Custom Visualization</h4>
                  <span className="text-xs text-gray-500">Configure and generate</span>
                </div>
                <Button
                  onClick={() => createVisualization(analysisConfig.chartType, [analysisConfig.xAxis, analysisConfig.yAxis].filter(Boolean))}
                  disabled={isCreatingVisualization || !analysisConfig.xAxis || (!analysisConfig.yAxis && !['pie', 'histogram'].includes(analysisConfig.chartType))}
                  className="w-full"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  {isCreatingVisualization ? "Creating Chart..." : `Create ${analysisConfig.chartType?.replace('_', ' ')} Chart`}
                </Button>
              </div>
            )}

            {/* Standard Visualization Options */}
            {selectedAnalysis !== 'visualization' && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-gray-700">Create Visualizations</h4>
                  <span className="text-xs text-gray-500">Choose a chart type</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(selectedAnalysis === 'descriptive' || selectedAnalysis === 'correlation') && numericFields.length >= 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => createVisualization('correlation_heatmap')}
                      disabled={isCreatingVisualization}
                      className="flex flex-col items-center p-4 h-20 hover:bg-blue-50"
                    >
                      <TrendingUp className="w-6 h-6 mb-2 text-blue-600" />
                      <span className="text-xs font-medium">Correlation</span>
                    </Button>
                  )}

                  {(selectedAnalysis === 'descriptive' || selectedAnalysis === 'distribution') && analysisConfig.fields?.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => createVisualization('distribution_overview')}
                      disabled={isCreatingVisualization}
                      className="flex flex-col items-center p-4 h-20 hover:bg-green-50"
                    >
                      <BarChart3 className="w-6 h-6 mb-2 text-green-600" />
                      <span className="text-xs font-medium">Distribution</span>
                    </Button>
                  )}

                  {selectedAnalysis === 'categorical' && analysisConfig.fields?.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => createVisualization('categorical_counts')}
                      disabled={isCreatingVisualization}
                      className="flex flex-col items-center p-4 h-20 hover:bg-purple-50"
                    >
                      <PieChart className="w-6 h-6 mb-2 text-purple-600" />
                      <span className="text-xs font-medium">Categories</span>
                    </Button>
                  )}

                  {numericFields.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => createVisualization('box_plot')}
                      disabled={isCreatingVisualization}
                      className="flex flex-col items-center p-4 h-20 hover:bg-orange-50"
                    >
                      <BarChart3 className="w-6 h-6 mb-2 text-orange-600" />
                      <span className="text-xs font-medium">Box Plot</span>
                    </Button>
                  )}
                </div>
                {isCreatingVisualization && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm text-blue-700">Generating visualization...</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Analysis Execution Section - Positioned AFTER Visualization */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-700">Execute Analysis</h4>
              </div>
              <Button
                onClick={executeAnalysis}
                disabled={isAnalyzing}
                className="w-full"
              >
                <Play className="w-4 h-4 mr-2" />
                {isAnalyzing ? "Analyzing..." : "Run Analysis"}
              </Button>
              {analysisError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{analysisError}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Analysis Pipeline Overview
          </CardTitle>
          <CardDescription>
            Clarity on the data flowing in, the process being executed, and the outputs generated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg border bg-slate-50">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Inputs</p>
              <ul className="text-sm text-slate-700 space-y-2">
                <li>
                  <span className="font-medium">Dataset:</span> {inputDatasetName}
                </li>
                <li>
                  <span className="font-medium">Records:</span>{' '}
                  {(project.recordCount ?? results?.summary?.dataSize ?? 0).toLocaleString()}
                </li>
                <li>
                  <span className="font-medium">Fields:</span> {inputFieldLabel}
                </li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border bg-slate-50">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Process</p>
              <ul className="text-sm text-slate-700 space-y-2">
                <li>
                  <span className="font-medium">Analysis:</span>{' '}
                  {resolvedAnalysisOption?.label || 'Not selected'}
                </li>
                <li>
                  <span className="font-medium">Audience:</span>{' '}
                  {project?.audienceContext?.primaryAudience || 'Mixed'}
                </li>
                <li>
                  <span className="font-medium">Status:</span> {pipelineStatus}
                </li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border bg-slate-50">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Outputs</p>
              <ul className="text-sm text-slate-700 space-y-2">
                <li>
                  <span className="font-medium">Insights:</span> {outputInsightCount}
                </li>
                <li>
                  <span className="font-medium">Recommendations:</span> {outputRecommendationCount}
                </li>
                <li>
                  <span className="font-medium">Visualizations:</span> {totalVisualizations}
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToPDF}
                  disabled={isExporting}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {isExporting ? "Exporting..." : "Export PDF"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const dataStr = JSON.stringify(results, null, 2);
                    const dataBlob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(dataBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `analysis-results-${Date.now()}.json`;
                    link.click();
                    toast({
                      title: "Export successful",
                      description: "Analysis results saved to download",
                    });
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Save Results
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              Results from your {resolveAnalysisOption(results.type)?.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderResults()}

            {/* Enhanced Interactive visualization - always visible when results exist */}
            <div className="mt-6 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 min-h-[400px]">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Interactive Visualization Canvas</h4>
              {visualizations.length > 0 ? (
                <div className="w-full h-[400px] bg-white rounded-lg p-4 border">
                  <ResponsiveContainer width="100%" height="100%">
                    {(() => {
                      const latestViz = visualizations[visualizations.length - 1];
                      const type = latestViz.type || 'bar_chart';
                      const data = latestViz.data;

                      if (!Array.isArray(data) || data.length === 0) {
                        return (
                          <BarChart data={[{ name: 'Pending', value: 0 }]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip content={() => <div className="bg-white p-2 rounded shadow text-sm">Visualization data pending from analysis</div>} />
                            <Bar dataKey="value" fill="#d1d5db" />
                          </BarChart>
                        );
                      }

                      if (type.includes('line')) {
                        return (
                          <ReLineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} />
                          </ReLineChart>
                        );
                      } else if (type.includes('pie') || type.includes('categorical')) {
                        const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
                        return (
                          <RePieChart>
                            <RePie
                              data={data}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              outerRadius={120}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {data.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </RePie>
                            <Tooltip />
                            <Legend />
                          </RePieChart>
                        );
                      } else if (type.includes('scatter')) {
                        return (
                          <ReScatterChart>
                            <CartesianGrid />
                            <XAxis type="number" dataKey="x" name="stature" unit="cm" />
                            <YAxis type="number" dataKey="y" name="weight" unit="kg" />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="A school" data={data} fill="#8884d8" />
                          </ReScatterChart>
                        );
                      }

                      // Default to Bar Chart
                      return (
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="value" fill="#3b82f6" />
                        </BarChart>
                      );
                    })()}
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Create a visualization to see it here interactively</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visualization Results Display */}
      {visualizationResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Visualization Results</CardTitle>
            <CardDescription>Charts and graphs generated from your analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {visualizationResults.map((result, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2">{result.visualization?.title || result.title}</h4>
                  {result.visualization?.insights && (
                    <div className="text-sm text-gray-600">
                      <h5 className="font-medium mb-2">Key Insights:</h5>
                      <ul className="list-disc list-inside space-y-1">
                        {result.visualization.insights.map((insight: string, i: number) => (
                          <li key={i}>{insight}</li>
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

      {/* Advanced Analysis Modal */}
      <AdvancedAnalysisModalLazy
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
        piiColumns={project.piiColumns || []}
      />

      {/* Audience-Formatted Results */}
      {showAudienceResults && (
        <AudienceFormattedResults
          projectId={project.id}
          analysisId={currentAnalysisId || undefined}
          onBack={() => setShowAudienceResults(false)}
        />
      )}
    </div>
  );
}