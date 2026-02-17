/**
 * Admin Analysis Pricing Configuration Page
 *
 * PHASE 6 + Tiered Pricing: Allows admins to configure:
 * - Platform fee ($25 per project)
 * - Data volume tier thresholds
 * - Per-analysis-type tiered cost matrix (type x volume tier x complexity -> price)
 * - Cost preview with tiered lookup
 */

import { useState, useEffect, useCallback } from "react";
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
  Activity,
  ChevronDown,
  ChevronRight,
  Layers,
  Grid3X3
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ==========================================
// Types matching shared/pricing-config.ts
// ==========================================

interface ComplexityCosts {
  basic: number;
  intermediate: number;
  advanced: number;
}

interface VolumeTierCosts {
  small: ComplexityCosts;
  medium: ComplexityCosts;
  large: ComplexityCosts;
  xlarge: ComplexityCosts;
}

interface VolumeTierThreshold {
  maxRows: number;
  label: string;
}

type AnalysisTypePricing = Record<string, VolumeTierCosts>;

interface AnalysisPricingConfig {
  baseCost: number;
  dataSizeCostPer1K: number;
  platformFee: number;
  complexityMultipliers: {
    basic: number;
    intermediate: number;
    advanced: number;
  };
  analysisTypeFactors: Record<string, number>;
  analysisTypePricing?: AnalysisTypePricing;
  dataVolumeTiers?: Record<string, VolumeTierThreshold>;
}

interface CostPreview {
  analysisType: string;
  recordCount: number;
  complexity: string;
  volumeTier?: string;
  pricingModel?: string;
  analysisCost: number | { baseCost: number; dataSizeCost: number; complexityCost: number; totalCost: number };
  platformFee: number;
  totalProjectCost: number;
}

// ==========================================
// Constants
// ==========================================

const VOLUME_TIER_KEYS = ['small', 'medium', 'large', 'xlarge'] as const;
const COMPLEXITY_KEYS = ['basic', 'intermediate', 'advanced'] as const;

const ANALYSIS_TYPE_ICONS: Record<string, typeof Activity> = {
  descriptive: BarChart3,
  statistical: TrendingUp,
  correlation: TrendingUp,
  regression: TrendingUp,
  clustering: Database,
  time_series: Clock,
  machine_learning: Brain,
  visualization: BarChart3,
  business_intelligence: Activity,
  sentiment: Activity,
  diagnostic: Activity,
  predictive: Brain,
  prescriptive: Brain,
  default: Calculator
};

const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  descriptive: "Descriptive",
  statistical: "Statistical",
  correlation: "Correlation",
  regression: "Regression",
  clustering: "Clustering",
  time_series: "Time Series",
  machine_learning: "Machine Learning",
  visualization: "Visualization",
  business_intelligence: "Business Intelligence",
  sentiment: "Sentiment",
  diagnostic: "Diagnostic",
  predictive: "Predictive",
  prescriptive: "Prescriptive",
  default: "Default / Other"
};

const COMPLEXITY_COLORS: Record<string, string> = {
  basic: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  advanced: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

// ==========================================
// Sub-components
// ==========================================

/** Editable cost matrix grid for a single analysis type */
function TypeCostMatrix({
  typeName,
  tierCosts,
  volumeTiers,
  onChange
}: {
  typeName: string;
  tierCosts: VolumeTierCosts;
  volumeTiers: Record<string, VolumeTierThreshold>;
  onChange: (volumeTier: string, complexity: string, value: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-40">Volume Tier</th>
            {COMPLEXITY_KEYS.map(c => (
              <th key={c} className="text-center py-2 px-3 font-medium">
                <Badge variant="outline" className={COMPLEXITY_COLORS[c]}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </Badge>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {VOLUME_TIER_KEYS.map(vt => {
            const tierDef = volumeTiers[vt];
            const costs = tierCosts[vt] || { basic: 0, intermediate: 0, advanced: 0 };
            return (
              <tr key={vt} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-2 pr-4">
                  <div className="font-medium text-xs">{tierDef?.label || vt}</div>
                </td>
                {COMPLEXITY_KEYS.map(c => (
                  <td key={c} className="py-2 px-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.50"
                        min="0"
                        value={costs[c]}
                        onChange={(e) => onChange(vt, c, parseFloat(e.target.value) || 0)}
                        className="h-8 pl-5 text-right w-24"
                      />
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Accordion for a single analysis type with its cost matrix */
function AnalysisTypeAccordion({
  typeName,
  tierCosts,
  volumeTiers,
  isOpen,
  onToggle,
  onChange
}: {
  typeName: string;
  tierCosts: VolumeTierCosts;
  volumeTiers: Record<string, VolumeTierThreshold>;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (volumeTier: string, complexity: string, value: number) => void;
}) {
  const Icon = ANALYSIS_TYPE_ICONS[typeName] || Calculator;
  const label = ANALYSIS_TYPE_LABELS[typeName] || typeName;

  // Calculate min/max prices for summary
  const allPrices: number[] = [];
  for (const vt of VOLUME_TIER_KEYS) {
    const costs = tierCosts[vt];
    if (costs) {
      for (const c of COMPLEXITY_KEYS) {
        allPrices.push(costs[c] || 0);
      }
    }
  }
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;

  return (
    <Card className={`border ${isOpen ? 'ring-1 ring-primary/30' : ''}`}>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            ${minPrice.toFixed(0)} – ${maxPrice.toFixed(0)}
          </Badge>
        </div>
      </div>
      {isOpen && (
        <CardContent className="pt-0 pb-4">
          <TypeCostMatrix
            typeName={typeName}
            tierCosts={tierCosts}
            volumeTiers={volumeTiers}
            onChange={onChange}
          />
        </CardContent>
      )}
    </Card>
  );
}

// ==========================================
// Main Component
// ==========================================

interface AnalysisPricingPageProps {
  onBack: () => void;
}

export default function AnalysisPricingPage({ onBack }: AnalysisPricingPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState<AnalysisPricingConfig | null>(null);
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());
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
  useEffect(() => {
    if (data?.config && !localConfig) {
      setLocalConfig(data.config);
    }
  }, [data?.config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview cost mutation
  const previewMutation = useMutation({
    mutationFn: async (params: { analysisType: string; recordCount: number; complexity: string; proposedConfig?: Partial<AnalysisPricingConfig> }) => {
      return apiClient.post('/api/admin/billing/analysis-pricing/preview', params);
    }
  });

  // Update config mutation
  const updateMutation = useMutation({
    mutationFn: async (config: Partial<AnalysisPricingConfig>) => {
      return apiClient.put('/api/admin/billing/analysis-pricing', config);
    },
    onSuccess: (resData: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/analysis-pricing'] });
      if (resData?.config) setLocalConfig(resData.config);
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
    onSuccess: (resData: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/analysis-pricing'] });
      setLocalConfig(resData.config || null);
      toast({ title: "Success", description: "Pricing reset to defaults" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reset pricing", variant: "destructive" });
    }
  });

  // Resolve current config (local edits > fetched > fallback)
  const config: AnalysisPricingConfig = localConfig || data?.config || {
    baseCost: 5.00,
    dataSizeCostPer1K: 0.10,
    platformFee: 25.00,
    complexityMultipliers: { basic: 1, intermediate: 1.5, advanced: 2.5 },
    analysisTypeFactors: { default: 1.0 },
    analysisTypePricing: {},
    dataVolumeTiers: {
      small: { maxRows: 1000, label: 'Small (≤1K rows)' },
      medium: { maxRows: 10000, label: 'Medium (1K–10K rows)' },
      large: { maxRows: 100000, label: 'Large (10K–100K rows)' },
      xlarge: { maxRows: Infinity, label: 'Extra Large (100K+ rows)' },
    }
  };

  const volumeTiers = config.dataVolumeTiers || {
    small: { maxRows: 1000, label: 'Small (≤1K rows)' },
    medium: { maxRows: 10000, label: 'Medium (1K–10K rows)' },
    large: { maxRows: 100000, label: 'Large (10K–100K rows)' },
    xlarge: { maxRows: Infinity, label: 'Extra Large (100K+ rows)' },
  };

  const analysisTypePricing = config.analysisTypePricing || {};

  // Get sorted list of analysis types from the pricing matrix
  const analysisTypeKeys = Object.keys(analysisTypePricing).sort((a, b) => {
    // default goes last
    if (a === 'default') return 1;
    if (b === 'default') return -1;
    return (ANALYSIS_TYPE_LABELS[a] || a).localeCompare(ANALYSIS_TYPE_LABELS[b] || b);
  });

  // Handlers
  const handlePlatformFeeChange = useCallback((value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalConfig(prev => ({
      ...(prev || config),
      platformFee: numValue
    }));
  }, [config]);

  const handleVolumeTierChange = useCallback((tierKey: string, field: 'maxRows' | 'label', value: string) => {
    setLocalConfig(prev => {
      const prevConfig = prev || config;
      const prevTiers = { ...(prevConfig.dataVolumeTiers || volumeTiers) };
      prevTiers[tierKey] = {
        ...prevTiers[tierKey],
        [field]: field === 'maxRows' ? (parseInt(value) || 0) : value
      };
      return { ...prevConfig, dataVolumeTiers: prevTiers };
    });
  }, [config, volumeTiers]);

  const handleTypePriceChange = useCallback((typeName: string, volumeTier: string, complexity: string, value: number) => {
    setLocalConfig(prev => {
      const prevConfig = prev || config;
      const prevPricing = { ...(prevConfig.analysisTypePricing || {}) };
      const prevType = { ...(prevPricing[typeName] || { small: { basic: 0, intermediate: 0, advanced: 0 }, medium: { basic: 0, intermediate: 0, advanced: 0 }, large: { basic: 0, intermediate: 0, advanced: 0 }, xlarge: { basic: 0, intermediate: 0, advanced: 0 } }) };
      prevType[volumeTier as keyof VolumeTierCosts] = {
        ...prevType[volumeTier as keyof VolumeTierCosts],
        [complexity]: value
      };
      prevPricing[typeName] = prevType;
      return { ...prevConfig, analysisTypePricing: prevPricing };
    });
  }, [config]);

  const toggleType = useCallback((typeName: string) => {
    setOpenTypes(prev => {
      const next = new Set(prev);
      if (next.has(typeName)) {
        next.delete(typeName);
      } else {
        next.add(typeName);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setOpenTypes(new Set(analysisTypeKeys));
  }, [analysisTypeKeys]);

  const collapseAll = useCallback(() => {
    setOpenTypes(new Set());
  }, []);

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

  const preview: CostPreview | null = previewMutation.data?.preview || null;

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
              <p className="text-muted-foreground">
                Configure tiered pricing for each analysis type by data volume and complexity
              </p>
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

        <Tabs defaultValue="platform" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="platform">
              <DollarSign className="w-4 h-4 mr-1" />
              Platform &amp; Tiers
            </TabsTrigger>
            <TabsTrigger value="types">
              <Grid3X3 className="w-4 h-4 mr-1" />
              Cost Matrix
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Calculator className="w-4 h-4 mr-1" />
              Cost Preview
            </TabsTrigger>
            <TabsTrigger value="legacy">
              <Layers className="w-4 h-4 mr-1" />
              Legacy Config
            </TabsTrigger>
          </TabsList>

          {/* ============================== */}
          {/* Platform Fee & Volume Tiers Tab */}
          {/* ============================== */}
          <TabsContent value="platform">
            <div className="space-y-6">
              {/* Platform Fee */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Platform Fee
                  </CardTitle>
                  <CardDescription>
                    One-time fee charged per project. This is added to the analysis type cost.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-4">
                    <div className="space-y-2 w-48">
                      <Label htmlFor="platformFee">Platform Fee ($)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          id="platformFee"
                          type="number"
                          step="1.00"
                          min="0"
                          value={config.platformFee}
                          onChange={(e) => handlePlatformFeeChange(e.target.value)}
                          className="pl-7"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground pb-2">
                      Charged once per project, regardless of the number of analyses
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Data Volume Tiers */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Data Volume Tier Thresholds
                  </CardTitle>
                  <CardDescription>
                    Define the row count boundaries for each volume tier. Pricing is looked up based on which tier the dataset falls into.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    {VOLUME_TIER_KEYS.map(tierKey => {
                      const tierDef = volumeTiers[tierKey] || { maxRows: 0, label: tierKey };
                      return (
                        <Card key={tierKey} className="border">
                          <CardContent className="pt-4 space-y-3">
                            <div className="font-medium text-sm capitalize">{tierKey}</div>
                            <div className="space-y-1">
                              <Label className="text-xs">Max Rows</Label>
                              <Input
                                type="number"
                                min="0"
                                value={tierKey === 'xlarge' ? '' : tierDef.maxRows}
                                placeholder={tierKey === 'xlarge' ? 'Unlimited' : ''}
                                disabled={tierKey === 'xlarge'}
                                onChange={(e) => handleVolumeTierChange(tierKey, 'maxRows', e.target.value)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Display Label</Label>
                              <Input
                                type="text"
                                value={tierDef.label}
                                onChange={(e) => handleVolumeTierChange(tierKey, 'label', e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Pricing Formula Summary */}
              <Card className="bg-muted/30">
                <CardContent className="pt-6">
                  <h4 className="font-medium mb-2">How pricing is calculated</h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p><strong>Total Cost</strong> = Platform Fee + Analysis Type Cost</p>
                    <p><strong>Analysis Type Cost</strong> = looked up from the cost matrix below based on:</p>
                    <ul className="list-disc pl-6">
                      <li>The analysis type (statistical, regression, ML, etc.)</li>
                      <li>The data volume tier (determined by row count)</li>
                      <li>The complexity level (basic, intermediate, advanced)</li>
                    </ul>
                    <p className="mt-2">
                      Example: Statistical analysis, 5K rows (medium tier), intermediate complexity =&nbsp;
                      <strong>${config.platformFee.toFixed(2)} + type cost from matrix</strong>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ============================== */}
          {/* Cost Matrix Tab (main feature) */}
          {/* ============================== */}
          <TabsContent value="types">
            <div className="space-y-4">
              {/* Header with expand/collapse all */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Per-Type Cost Matrix</h3>
                  <p className="text-sm text-muted-foreground">
                    Set the dollar price for each combination of analysis type, data volume, and complexity
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={expandAll}>
                    Expand All
                  </Button>
                  <Button variant="outline" size="sm" onClick={collapseAll}>
                    Collapse All
                  </Button>
                </div>
              </div>

              {/* Analysis type accordions */}
              {analysisTypeKeys.length > 0 ? (
                <div className="space-y-2">
                  {analysisTypeKeys.map(typeName => (
                    <AnalysisTypeAccordion
                      key={typeName}
                      typeName={typeName}
                      tierCosts={analysisTypePricing[typeName]}
                      volumeTiers={volumeTiers}
                      isOpen={openTypes.has(typeName)}
                      onToggle={() => toggleType(typeName)}
                      onChange={(vt, c, val) => handleTypePriceChange(typeName, vt, c, val)}
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    <p>No tiered pricing data available. Click "Reset to Defaults" to load the default pricing matrix.</p>
                  </CardContent>
                </Card>
              )}

              {/* Quick summary table */}
              {analysisTypeKeys.length > 0 && (
                <Card className="mt-6">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Quick Reference: Intermediate Complexity Prices
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Type</th>
                            {VOLUME_TIER_KEYS.map(vt => (
                              <th key={vt} className="text-center py-1.5 px-3 font-medium text-muted-foreground capitalize">
                                {vt}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analysisTypeKeys.filter(t => t !== 'default').map(typeName => (
                            <tr key={typeName} className="border-b last:border-0">
                              <td className="py-1.5 pr-4 font-medium">{ANALYSIS_TYPE_LABELS[typeName] || typeName}</td>
                              {VOLUME_TIER_KEYS.map(vt => {
                                const cost = analysisTypePricing[typeName]?.[vt]?.intermediate ?? 0;
                                return (
                                  <td key={vt} className="text-center py-1.5 px-3">
                                    ${cost.toFixed(2)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ============================== */}
          {/* Cost Preview Tab */}
          {/* ============================== */}
          <TabsContent value="preview">
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    Cost Calculator
                  </CardTitle>
                  <CardDescription>
                    Preview how the tiered pricing applies to a specific scenario
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Analysis Type</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={previewParams.analysisType}
                      onChange={(e) => setPreviewParams(prev => ({ ...prev, analysisType: e.target.value }))}
                    >
                      {analysisTypeKeys.filter(t => t !== 'default').map(type => (
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
                    <p className="text-xs text-muted-foreground">Number of rows in the dataset</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Complexity</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
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
                    {previewMutation.isPending ? 'Calculating...' : 'Calculate Preview'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cost Breakdown</CardTitle>
                  <CardDescription>
                    {preview
                      ? `Using ${preview.pricingModel || 'tiered'} pricing model`
                      : 'Click Calculate to see preview'}
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

                        {preview.volumeTier && (
                          <>
                            <span className="text-muted-foreground">Volume Tier:</span>
                            <span className="font-medium">{preview.volumeTier}</span>
                          </>
                        )}
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Analysis Type Cost</span>
                          <span className="font-medium">
                            ${typeof preview.analysisCost === 'number'
                              ? preview.analysisCost.toFixed(2)
                              : preview.analysisCost.totalCost.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span>Platform Fee</span>
                          <span className="font-medium">${preview.platformFee.toFixed(2)}</span>
                        </div>

                        <Separator />

                        <div className="flex justify-between text-lg font-bold text-primary">
                          <span>Total Project Cost</span>
                          <span>${preview.totalProjectCost.toFixed(2)}</span>
                        </div>
                      </div>

                      {preview.pricingModel && (
                        <div className="mt-4">
                          <Badge variant="outline" className="text-xs">
                            {preview.pricingModel === 'tiered' ? 'Tiered Pricing' : 'Legacy Formula'}
                          </Badge>
                        </div>
                      )}
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

          {/* ============================== */}
          {/* Legacy Config Tab */}
          {/* ============================== */}
          <TabsContent value="legacy">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Legacy Configuration (Fallback)
                </CardTitle>
                <CardDescription>
                  These settings are used as fallbacks when tiered pricing is not available for a type.
                  The tiered cost matrix above takes precedence.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Base Costs */}
                <div>
                  <h4 className="font-medium mb-3">Base Costs</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="baseCost">Base Cost per Analysis ($)</Label>
                      <Input
                        id="baseCost"
                        type="number"
                        step="0.01"
                        min="0"
                        value={config.baseCost}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setLocalConfig(prev => ({ ...(prev || config), baseCost: val }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dataSizeCostPer1K">Data Cost per 1K Records ($)</Label>
                      <Input
                        id="dataSizeCostPer1K"
                        type="number"
                        step="0.001"
                        min="0"
                        value={config.dataSizeCostPer1K}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setLocalConfig(prev => ({ ...(prev || config), dataSizeCostPer1K: val }));
                        }}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Complexity Multipliers */}
                <div>
                  <h4 className="font-medium mb-3">Complexity Multipliers</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {COMPLEXITY_KEYS.map(level => (
                      <div key={level} className="space-y-2">
                        <Label className="capitalize">{level}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={config.complexityMultipliers[level]}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setLocalConfig(prev => ({
                                ...(prev || config),
                                complexityMultipliers: {
                                  ...(prev || config).complexityMultipliers,
                                  [level]: val
                                }
                              }));
                            }}
                            className="h-8"
                          />
                          <span className="text-sm text-muted-foreground">x</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Legacy Analysis Type Factors */}
                <div>
                  <h4 className="font-medium mb-3">Analysis Type Factors (Legacy Multipliers)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {Object.entries(config.analysisTypeFactors || {}).map(([type, factor]) => {
                      const Icon = ANALYSIS_TYPE_ICONS[type] || Calculator;
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <Label className="text-xs">{ANALYSIS_TYPE_LABELS[type] || type}</Label>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={factor}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setLocalConfig(prev => ({
                                  ...(prev || config),
                                  analysisTypeFactors: {
                                    ...(prev || config).analysisTypeFactors,
                                    [type]: val
                                  }
                                }));
                              }}
                              className="h-7 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">x</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2 text-sm">Legacy Formula</h4>
                  <code className="text-xs">
                    Total = Platform Fee + (Base Cost + Data Size Cost) x Type Factor + Complexity Cost
                  </code>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
