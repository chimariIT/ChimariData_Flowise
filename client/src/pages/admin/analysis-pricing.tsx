/**
 * Admin Analysis Pricing Configuration Page
 *
 * PHASE 6: Allows admins to configure the cost basis for analysis pricing:
 * - Base cost per analysis
 * - Data size cost per 1K records
 * - Platform fee
 * - Complexity multipliers (basic, intermediate, advanced)
 * - Analysis type factors (statistical, ML, visualization, etc.)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  DollarSign,
  Save,
  RotateCcw,
  Calculator,
  TrendingUp,
  Database,
  Brain,
  BarChart3,
  Clock,
  Activity
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePricingConfig } from "@/hooks/usePricingConfig";

interface AnalysisPricingConfig {
  baseCost: number;
  dataSizeCostPer1K: number;
  platformFee: number;
  complexityMultipliers: {
    basic: number;
    intermediate: number;
    advanced: number;
  };
  analysisTypeFactors: {
    statistical: number;
    machine_learning: number;
    visualization: number;
    business_intelligence: number;
    time_series: number;
    correlation: number;
    regression: number;
    clustering: number;
    sentiment: number;
    default: number;
  };
}

interface CostPreview {
  analysisType: string;
  recordCount: number;
  complexity: string;
  analysisCost: {
    baseCost: number;
    dataSizeCost: number;
    complexityCost: number;
    totalCost: number;
  };
  platformFee: number;
  totalProjectCost: number;
}

const ANALYSIS_TYPE_ICONS: Record<string, typeof Activity> = {
  statistical: TrendingUp,
  machine_learning: Brain,
  visualization: BarChart3,
  business_intelligence: Activity,
  time_series: Clock,
  correlation: TrendingUp,
  regression: TrendingUp,
  clustering: Database,
  sentiment: Activity,
  default: Calculator
};

const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  statistical: "Statistical Analysis",
  machine_learning: "Machine Learning",
  visualization: "Visualization",
  business_intelligence: "Business Intelligence",
  time_series: "Time Series",
  correlation: "Correlation Analysis",
  regression: "Regression Analysis",
  clustering: "Clustering",
  sentiment: "Sentiment Analysis",
  default: "Default"
};

interface AnalysisPricingPageProps {
  onBack: () => void;
}

export default function AnalysisPricingPage({ onBack }: AnalysisPricingPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState<AnalysisPricingConfig | null>(null);
  const { data: runtimeConfig } = usePricingConfig();
  const [previewParams, setPreviewParams] = useState({
    analysisType: 'statistical',
    recordCount: 10000,
    complexity: 'intermediate' as 'basic' | 'intermediate' | 'advanced'
  });

  // Fetch current config
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/admin/billing/analysis-pricing'],
    queryFn: () => apiClient.get('/api/admin/billing/analysis-pricing')
  });

  // Set local config when data loads
  if (data?.config && !localConfig) {
    setLocalConfig(data.config);
  }

  // Preview cost mutation
  const previewMutation = useMutation({
    mutationFn: async (params: { analysisType: string; recordCount: number; complexity: string; proposedConfig?: AnalysisPricingConfig }) => {
      return apiClient.post('/api/admin/billing/analysis-pricing/preview', params);
    }
  });

  // Update config mutation
  const updateMutation = useMutation({
    mutationFn: async (config: Partial<AnalysisPricingConfig>) => {
      return apiClient.put('/api/admin/billing/analysis-pricing', config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/analysis-pricing'] });
      toast({ title: "Success", description: "Analysis pricing updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update pricing", variant: "destructive" });
    }
  });

  // Reset config mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post('/api/admin/billing/analysis-pricing/reset', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/analysis-pricing'] });
      setLocalConfig(data.config);
      toast({ title: "Success", description: "Pricing reset to defaults" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reset pricing", variant: "destructive" });
    }
  });

  const config: AnalysisPricingConfig = localConfig || data?.config || {
    baseCost: runtimeConfig?.baseAnalysisCost ?? 0.50,
    dataSizeCostPer1K: runtimeConfig?.dataProcessingPer1K ?? 0.10,
    platformFee: runtimeConfig?.basePlatformFee ?? 0.25,
    complexityMultipliers: { basic: runtimeConfig?.complexityMultipliers?.basic ?? 1, intermediate: runtimeConfig?.complexityMultipliers?.intermediate ?? 1.5, advanced: runtimeConfig?.complexityMultipliers?.advanced ?? 2.5 },
    analysisTypeFactors: { ...(runtimeConfig?.analysisTypeFactors ?? { default: 1.0 }) }
  };

  const handleBaseCostChange = (field: 'baseCost' | 'dataSizeCostPer1K' | 'platformFee', value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalConfig(prev => ({
      ...(prev || config),
      [field]: numValue
    }));
  };

  const handleComplexityChange = (level: 'basic' | 'intermediate' | 'advanced', value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalConfig(prev => ({
      ...(prev || config),
      complexityMultipliers: {
        ...(prev || config).complexityMultipliers,
        [level]: numValue
      }
    }));
  };

  const handleTypeFactorChange = (type: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalConfig(prev => ({
      ...(prev || config),
      analysisTypeFactors: {
        ...(prev || config).analysisTypeFactors,
        [type]: numValue
      }
    }));
  };

  const handleSave = () => {
    if (localConfig) {
      updateMutation.mutate(localConfig);
    }
  };

  const handleReset = () => {
    resetMutation.mutate();
  };

  const handlePreview = () => {
    previewMutation.mutate({
      ...previewParams,
      proposedConfig: localConfig || undefined
    });
  };

  const preview: CostPreview | null = previewMutation.data?.preview;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Button onClick={onBack} variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Admin
        </Button>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load pricing configuration</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button onClick={onBack} variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Analysis Pricing Configuration</h1>
              <p className="text-muted-foreground">Configure the cost basis for data analysis pricing</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} disabled={resetMutation.isPending}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="base" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="base">Base Costs</TabsTrigger>
            <TabsTrigger value="complexity">Complexity</TabsTrigger>
            <TabsTrigger value="types">Analysis Types</TabsTrigger>
            <TabsTrigger value="preview">Cost Preview</TabsTrigger>
          </TabsList>

          {/* Base Costs Tab */}
          <TabsContent value="base">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Base Cost Configuration
                </CardTitle>
                <CardDescription>
                  Set the fundamental cost parameters that apply to all analyses
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="baseCost">Base Cost per Analysis ($)</Label>
                    <Input
                      id="baseCost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={config.baseCost}
                      onChange={(e) => handleBaseCostChange('baseCost', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Base charge for any analysis type
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataSizeCostPer1K">Data Cost per 1K Records ($)</Label>
                    <Input
                      id="dataSizeCostPer1K"
                      type="number"
                      step="0.001"
                      min="0"
                      value={config.dataSizeCostPer1K}
                      onChange={(e) => handleBaseCostChange('dataSizeCostPer1K', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Additional charge based on data volume
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="platformFee">Platform Fee ($)</Label>
                    <Input
                      id="platformFee"
                      type="number"
                      step="0.01"
                      min="0"
                      value={config.platformFee}
                      onChange={(e) => handleBaseCostChange('platformFee', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Fixed fee added to each project
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Formula</h4>
                  <code className="text-sm">
                    Total = Platform Fee + Σ((Base Cost + Data Cost) × Type Factor + Complexity Cost)
                  </code>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Complexity Tab */}
          <TabsContent value="complexity">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Complexity Multipliers
                </CardTitle>
                <CardDescription>
                  Set multipliers based on analysis complexity level
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-6">
                  {(['basic', 'intermediate', 'advanced'] as const).map((level) => (
                    <Card key={level} className="border-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg capitalize flex items-center justify-between">
                          {level}
                          <Badge variant={level === 'basic' ? 'secondary' : level === 'intermediate' ? 'default' : 'destructive'}>
                            {config.complexityMultipliers[level]}x
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <Label>Multiplier</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={config.complexityMultipliers[level]}
                            onChange={(e) => handleComplexityChange(level, e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            {level === 'basic' && 'Simple analyses with standard methods'}
                            {level === 'intermediate' && 'Moderate complexity with custom parameters'}
                            {level === 'advanced' && 'Complex analyses with ML optimization'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis Types Tab */}
          <TabsContent value="types">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Analysis Type Factors
                </CardTitle>
                <CardDescription>
                  Set cost multipliers for each type of analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {Object.entries(config.analysisTypeFactors).map(([type, factor]) => {
                    const Icon = ANALYSIS_TYPE_ICONS[type] || Calculator;
                    return (
                      <Card key={type} className="border">
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {ANALYSIS_TYPE_LABELS[type] || type}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={factor}
                              onChange={(e) => handleTypeFactorChange(type, e.target.value)}
                              className="h-8"
                            />
                            <span className="text-sm text-muted-foreground">x</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview">
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    Cost Calculator
                  </CardTitle>
                  <CardDescription>
                    Preview how pricing changes affect costs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Analysis Type</Label>
                    <select
                      className="w-full p-2 border rounded-md"
                      value={previewParams.analysisType}
                      onChange={(e) => setPreviewParams(prev => ({ ...prev, analysisType: e.target.value }))}
                    >
                      {Object.keys(config.analysisTypeFactors).map(type => (
                        <option key={type} value={type}>
                          {ANALYSIS_TYPE_LABELS[type] || type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Record Count</Label>
                    <Input
                      type="number"
                      min="0"
                      value={previewParams.recordCount}
                      onChange={(e) => setPreviewParams(prev => ({ ...prev, recordCount: parseInt(e.target.value) || 0 }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Complexity</Label>
                    <select
                      className="w-full p-2 border rounded-md"
                      value={previewParams.complexity}
                      onChange={(e) => setPreviewParams(prev => ({ ...prev, complexity: e.target.value as any }))}
                    >
                      <option value="basic">Basic</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>

                  <Button onClick={handlePreview} className="w-full" disabled={previewMutation.isPending}>
                    <Calculator className="w-4 h-4 mr-2" />
                    Calculate Preview
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cost Breakdown</CardTitle>
                  <CardDescription>
                    {preview ? 'Calculated with proposed configuration' : 'Click Calculate to see preview'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {preview ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Analysis Type:</span>
                        <span className="font-medium">{ANALYSIS_TYPE_LABELS[preview.analysisType] || preview.analysisType}</span>

                        <span className="text-muted-foreground">Records:</span>
                        <span className="font-medium">{preview.recordCount.toLocaleString()}</span>

                        <span className="text-muted-foreground">Complexity:</span>
                        <span className="font-medium capitalize">{preview.complexity}</span>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Base Cost</span>
                          <span>${preview.analysisCost.baseCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Data Size Cost</span>
                          <span>${preview.analysisCost.dataSizeCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Complexity Cost</span>
                          <span>${preview.analysisCost.complexityCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium">
                          <span>Analysis Total</span>
                          <span>${preview.analysisCost.totalCost.toFixed(2)}</span>
                        </div>

                        <Separator />

                        <div className="flex justify-between text-sm">
                          <span>Platform Fee</span>
                          <span>${preview.platformFee.toFixed(2)}</span>
                        </div>

                        <Separator />

                        <div className="flex justify-between text-lg font-bold text-primary">
                          <span>Total Project Cost</span>
                          <span>${preview.totalProjectCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-muted-foreground">
                      Enter parameters and click Calculate
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
