import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DataProject } from "@shared/schema";

interface DescriptiveStatsProps {
  project: DataProject;
  analysisResult?: any;
}

export function DescriptiveStats({ project, analysisResult }: DescriptiveStatsProps) {
  const { schema, recordCount, data } = project;
  
  // Calculate descriptive statistics from the data
  const calculateStats = () => {
    if (!data || data.length === 0) return null;
    
    const stats = {
      totalRecords: data.length,
      variables: {}
    };
    
    // Process each column
    Object.keys(schema || {}).forEach(column => {
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
              <p className="text-sm text-muted-foreground">Variables</p>
              <p className="text-2xl font-bold">{Object.keys(stats.variables).length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Numeric Variables</p>
              <p className="text-2xl font-bold">
                {Object.values(stats.variables).filter(v => (v as any).type === 'numeric').length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Categorical Variables</p>
              <p className="text-2xl font-bold">
                {Object.values(stats.variables).filter(v => (v as any).type === 'categorical').length}
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