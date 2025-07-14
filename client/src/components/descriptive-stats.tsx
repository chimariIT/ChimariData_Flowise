import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Settings, TrendingUp, BarChart3, PieChart } from "lucide-react";
import { DataProject } from "@shared/schema";

interface DescriptiveStatsProps {
  project: DataProject;
  analysisResult?: any;
}

export function DescriptiveStats({ project, analysisResult }: DescriptiveStatsProps) {
  const { schema, recordCount, data } = project;
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [analysisConfig, setAnalysisConfig] = useState({
    includeDistribution: true,
    includeCategoricalAnalysis: true,
    includeCorrelation: true,
    includeMissingData: true,
    includeOutliers: true,
    distributionTests: ['normality', 'skewness'] as string[],
    categoricalTests: ['chi_square', 'frequencies'] as string[],
    correlationMethod: 'pearson' as string,
    outlierMethod: 'iqr' as string
  });

  const availableVariables = schema ? Object.keys(schema) : [];
  const numericVariables = availableVariables.filter(variable => 
    schema[variable]?.type === 'number' || schema[variable]?.type === 'integer'
  );
  const categoricalVariables = availableVariables.filter(variable => 
    schema[variable]?.type === 'text' || schema[variable]?.type === 'string' || schema[variable]?.type === 'boolean'
  );

  // Initialize selected variables to all variables if none selected
  if (selectedVariables.length === 0 && availableVariables.length > 0) {
    setSelectedVariables(availableVariables);
  }

  const handleVariableToggle = (variable: string) => {
    setSelectedVariables(prev => 
      prev.includes(variable) 
        ? prev.filter(v => v !== variable)
        : [...prev, variable]
    );
  };

  const handleDistributionTestToggle = (test: string) => {
    setAnalysisConfig(prev => ({
      ...prev,
      distributionTests: prev.distributionTests.includes(test)
        ? prev.distributionTests.filter(t => t !== test)
        : [...prev.distributionTests, test]
    }));
  };

  const handleCategoricalTestToggle = (test: string) => {
    setAnalysisConfig(prev => ({
      ...prev,
      categoricalTests: prev.categoricalTests.includes(test)
        ? prev.categoricalTests.filter(t => t !== test)
        : [...prev.categoricalTests, test]
    }));
  };
  
  // Calculate descriptive statistics from the data
  const calculateStats = () => {
    if (!data || data.length === 0) return null;
    
    const stats = {
      totalRecords: data.length,
      variables: {} as any,
      selectedVariables: selectedVariables,
      correlationMatrix: {} as any,
      outliers: {} as any,
      distributionTests: {} as any
    };
    
    // Process only selected columns
    const columnsToProcess = selectedVariables.length > 0 ? selectedVariables : Object.keys(schema || {});
    
    columnsToProcess.forEach(column => {
      if (!schema[column]) return;
      const columnData = data.map(row => row[column]).filter(val => val !== null && val !== undefined);
      const columnSchema = schema[column];
      
      if (columnSchema.type === 'number') {
        // Numeric statistics
        const numericValues = columnData.map(val => parseFloat(val)).filter(val => !isNaN(val));
        if (numericValues.length > 0) {
          numericValues.sort((a, b) => a - b);
          const mean = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
          const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (numericValues.length - 1);
          const standardDeviation = Math.sqrt(variance);
          
          stats.variables[column] = {
            type: 'numeric',
            count: numericValues.length,
            mean: mean,
            median: numericValues[Math.floor(numericValues.length / 2)],
            standardDeviation: standardDeviation,
            variance: variance,
            min: numericValues[0],
            max: numericValues[numericValues.length - 1],
            range: numericValues[numericValues.length - 1] - numericValues[0],
            missing: data.length - numericValues.length
          };
        }
      } else {
        // Categorical statistics
        const frequencies = columnData.reduce((acc, val) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        }, {});
        
        const sortedFrequencies = Object.entries(frequencies)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .slice(0, 10); // Top 10 most frequent
        
        stats.variables[column] = {
          type: 'categorical',
          count: columnData.length,
          uniqueValues: Object.keys(frequencies).length,
          frequencies: Object.fromEntries(sortedFrequencies),
          mode: sortedFrequencies[0]?.[0] || 'N/A',
          missing: data.length - columnData.length
        };
      }
    });
    
    return stats;
  };
  
  const stats = calculateStats();
  
  if (!stats) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">No data available for analysis</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Analysis Configuration
            </CardTitle>
            <Button 
              variant="outline" 
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              size="sm"
            >
              {isConfigOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {isConfigOpen ? 'Hide' : 'Show'} Options
            </Button>
          </div>
        </CardHeader>
        <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              
              {/* Variable Selection */}
              <div>
                <Label className="text-base font-medium mb-3 block">Select Variables to Analyze</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-40 overflow-y-auto border rounded-lg p-3">
                  {availableVariables.map(variable => (
                    <div key={variable} className="flex items-center space-x-2">
                      <Checkbox
                        id={`var-${variable}`}
                        checked={selectedVariables.includes(variable)}
                        onCheckedChange={() => handleVariableToggle(variable)}
                      />
                      <Label htmlFor={`var-${variable}`} className="text-sm font-normal">
                        {variable}
                        <Badge variant="outline" className="ml-1 text-xs">
                          {schema[variable]?.type}
                        </Badge>
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedVariables(availableVariables)}
                  >
                    Select All
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedVariables([])}
                  >
                    Clear All
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedVariables(numericVariables)}
                  >
                    Numeric Only
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedVariables(categoricalVariables)}
                  >
                    Categorical Only
                  </Button>
                </div>
              </div>

              {/* Analysis Type Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Distribution Analysis */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <Label className="font-medium">Distribution Analysis</Label>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeDistribution"
                        checked={analysisConfig.includeDistribution}
                        onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, includeDistribution: checked as boolean }))}
                      />
                      <Label htmlFor="includeDistribution" className="text-sm">Include distribution analysis</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeOutliers"
                        checked={analysisConfig.includeOutliers}
                        onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, includeOutliers: checked as boolean }))}
                      />
                      <Label htmlFor="includeOutliers" className="text-sm">Detect outliers</Label>
                    </div>
                  </div>
                  
                  {/* Distribution Tests */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Distribution Tests</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {['normality', 'skewness', 'kurtosis'].map(test => (
                        <div key={test} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dist-${test}`}
                            checked={analysisConfig.distributionTests.includes(test)}
                            onCheckedChange={() => handleDistributionTestToggle(test)}
                          />
                          <Label htmlFor={`dist-${test}`} className="text-xs">
                            {test.charAt(0).toUpperCase() + test.slice(1)}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Outlier Method */}
                  <div>
                    <Label className="text-sm font-medium">Outlier Detection Method</Label>
                    <Select 
                      value={analysisConfig.outlierMethod} 
                      onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, outlierMethod: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="iqr">IQR Method</SelectItem>
                        <SelectItem value="zscore">Z-Score Method</SelectItem>
                        <SelectItem value="isolation_forest">Isolation Forest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Categorical Analysis */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    <Label className="font-medium">Categorical Analysis</Label>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeCategoricalAnalysis"
                        checked={analysisConfig.includeCategoricalAnalysis}
                        onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, includeCategoricalAnalysis: checked as boolean }))}
                      />
                      <Label htmlFor="includeCategoricalAnalysis" className="text-sm">Include categorical analysis</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeCorrelation"
                        checked={analysisConfig.includeCorrelation}
                        onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, includeCorrelation: checked as boolean }))}
                      />
                      <Label htmlFor="includeCorrelation" className="text-sm">Include correlation analysis</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeMissingData"
                        checked={analysisConfig.includeMissingData}
                        onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, includeMissingData: checked as boolean }))}
                      />
                      <Label htmlFor="includeMissingData" className="text-sm">Analyze missing data</Label>
                    </div>
                  </div>
                  
                  {/* Categorical Tests */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Categorical Tests</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {['chi_square', 'frequencies', 'associations'].map(test => (
                        <div key={test} className="flex items-center space-x-2">
                          <Checkbox
                            id={`cat-${test}`}
                            checked={analysisConfig.categoricalTests.includes(test)}
                            onCheckedChange={() => handleCategoricalTestToggle(test)}
                          />
                          <Label htmlFor={`cat-${test}`} className="text-xs">
                            {test.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Correlation Method */}
                  <div>
                    <Label className="text-sm font-medium">Correlation Method</Label>
                    <Select 
                      value={analysisConfig.correlationMethod} 
                      onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, correlationMethod: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pearson">Pearson</SelectItem>
                        <SelectItem value="spearman">Spearman</SelectItem>
                        <SelectItem value="kendall">Kendall</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Dataset Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Dataset Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Records</p>
              <p className="text-2xl font-bold">{stats.totalRecords}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Selected Variables</p>
              <p className="text-2xl font-bold">{selectedVariables.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Numeric Variables</p>
              <p className="text-2xl font-bold">
                {selectedVariables.filter(v => numericVariables.includes(v)).length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Categorical Variables</p>
              <p className="text-2xl font-bold">
                {selectedVariables.filter(v => categoricalVariables.includes(v)).length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Variable Statistics */}
      <div className="grid gap-6">
        {Object.entries(stats.variables).map(([variable, varStats]) => (
          <Card key={variable}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{variable}</CardTitle>
                <Badge variant={(varStats as any).type === 'numeric' ? 'default' : 'secondary'}>
                  {(varStats as any).type === 'numeric' ? 'Numeric' : 'Categorical'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {(varStats as any).type === 'numeric' ? (
                // Numeric variable statistics
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Count</p>
                      <p className="font-semibold">{(varStats as any).count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Missing</p>
                      <p className="font-semibold">{(varStats as any).missing}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Mean</p>
                      <p className="font-semibold">{(varStats as any).mean.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Median</p>
                      <p className="font-semibold">{(varStats as any).median.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Std Dev</p>
                      <p className="font-semibold">{(varStats as any).standardDeviation.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Variance</p>
                      <p className="font-semibold">{(varStats as any).variance.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Min</p>
                      <p className="font-semibold">{(varStats as any).min}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Max</p>
                      <p className="font-semibold">{(varStats as any).max}</p>
                    </div>
                  </div>
                </div>
              ) : (
                // Categorical variable statistics
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Count</p>
                      <p className="font-semibold">{(varStats as any).count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Missing</p>
                      <p className="font-semibold">{(varStats as any).missing}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Unique Values</p>
                      <p className="font-semibold">{(varStats as any).uniqueValues}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Mode</p>
                      <p className="font-semibold">{(varStats as any).mode}</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Top Categories</p>
                    <div className="space-y-2">
                      {Object.entries((varStats as any).frequencies).map(([category, count]) => (
                        <div key={category} className="flex justify-between items-center">
                          <span className="text-sm">{category}</span>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Analysis Results */}
      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Research Question</p>
                <p className="font-semibold">{analysisResult.question}</p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground">Analysis Type</p>
                <Badge>{analysisResult.analysisType.toUpperCase()}</Badge>
              </div>
              
              {analysisResult.targetVariable && (
                <div>
                  <p className="text-sm text-muted-foreground">Target Variable</p>
                  <p className="font-semibold">{analysisResult.targetVariable}</p>
                </div>
              )}
              
              {analysisResult.multivariateVariables && analysisResult.multivariateVariables.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Factor Variables</p>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.multivariateVariables.map((variable: string) => (
                      <Badge key={variable} variant="outline">{variable}</Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {analysisResult.analysisResult && (
                <div>
                  <p className="text-sm text-muted-foreground">Interpretation</p>
                  <p className="text-sm">{analysisResult.analysisResult.results?.interpretation}</p>
                </div>
              )}
              
              {analysisResult.analysisResult?.groupStats && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Group Statistics</p>
                  <div className="space-y-2">
                    {Object.entries(analysisResult.analysisResult.groupStats).map(([group, stats]) => (
                      <div key={group} className="flex justify-between items-center p-2 bg-muted rounded">
                        <span className="text-sm font-medium">{group}</span>
                        <div className="text-sm text-muted-foreground">
                          n={stats.n}, mean={stats.mean.toFixed(2)}, sd={stats.standardDeviation.toFixed(2)}
                        </div>
                      </div>
                    ))}
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