/**
 * Scenario Explorer - What-If Analysis
 *
 * Allows users to adjust analysis parameters and re-run to explore scenarios.
 * Shows side-by-side comparison of original vs. scenario results.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Loader2, Play, BarChart3, RefreshCw, GitCompare } from "lucide-react";

interface ScenarioExplorerProps {
  projectId: string;
  analysisTypes: string[];
  originalResults?: any;
}

interface ParameterDef {
  key: string;
  label: string;
  type: "slider" | "select";
  min?: number;
  max?: number;
  default: any;
  step?: number;
  options?: string[];
}

interface ScenarioResult {
  executionId: string;
  parameters: Record<string, any>;
  status: "running" | "completed" | "failed";
  result?: any;
}

export function ScenarioExplorer({ projectId, analysisTypes, originalResults }: ScenarioExplorerProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState(analysisTypes[0] || "");
  const [parameterValues, setParameterValues] = useState<Record<string, any>>({});
  const [scenarioResults, setScenarioResults] = useState<ScenarioResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Fetch parameter definitions for the selected analysis type
  const { data: paramDefs, isLoading: paramsLoading } = useQuery({
    queryKey: ["/api/v1/analysis-execution/scenario-params", selectedType],
    queryFn: async () => {
      if (!selectedType) return null;
      const response = await apiClient.getScenarioParameters(selectedType);
      // Initialize parameter values with defaults
      const defaults: Record<string, any> = {};
      (response?.parameters || []).forEach((p: ParameterDef) => {
        defaults[p.key] = p.default;
      });
      setParameterValues(prev => ({ ...defaults, ...prev }));
      return response;
    },
    enabled: !!selectedType,
  });

  const parameters: ParameterDef[] = paramDefs?.parameters || [];

  const handleRunScenario = async () => {
    if (!selectedType || !projectId) return;

    setIsRunning(true);
    try {
      const response = await apiClient.runScenario({
        projectId,
        analysisType: selectedType,
        parameters: parameterValues,
      });

      if (response?.success) {
        setScenarioResults(prev => [
          ...prev,
          {
            executionId: response.execution_id,
            parameters: { ...parameterValues },
            status: "running",
          },
        ]);
        toast({
          title: "Scenario Running",
          description: `Re-running ${selectedType} with modified parameters...`,
        });
      } else {
        toast({
          title: "Scenario Failed",
          description: response?.error || "Failed to start scenario",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to run scenario",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const formatParamValue = (param: ParameterDef, value: any) => {
    if (param.type === "slider" && param.step && param.step < 1) {
      return Number(value).toFixed(2);
    }
    return String(value);
  };

  if (analysisTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Run an analysis first to explore what-if scenarios.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5" />
            What-If Scenario Explorer
          </CardTitle>
          <CardDescription>
            Adjust parameters and re-run analysis to explore different scenarios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Analysis Type Selection */}
          <div className="space-y-2">
            <Label>Analysis Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Select analysis type" />
              </SelectTrigger>
              <SelectContent>
                {analysisTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Parameter Controls */}
          {paramsLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading parameters...
            </div>
          ) : parameters.length === 0 ? (
            <p className="text-sm text-gray-500">
              No configurable parameters for this analysis type.
            </p>
          ) : (
            <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
              <h4 className="text-sm font-medium text-gray-700">Scenario Parameters</h4>
              {parameters.map(param => (
                <div key={param.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{param.label}</Label>
                    <Badge variant="outline">
                      {formatParamValue(param, parameterValues[param.key] ?? param.default)}
                    </Badge>
                  </div>
                  {param.type === "slider" && (
                    <Slider
                      value={[parameterValues[param.key] ?? param.default]}
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      onValueChange={([val]) =>
                        setParameterValues(prev => ({ ...prev, [param.key]: val }))
                      }
                    />
                  )}
                  {param.type === "select" && (
                    <Select
                      value={String(parameterValues[param.key] ?? param.default)}
                      onValueChange={val =>
                        setParameterValues(prev => ({ ...prev, [param.key]: val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(param.options || []).map(opt => (
                          <SelectItem key={opt} value={opt}>
                            {opt.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Run Button */}
          <Button
            onClick={handleRunScenario}
            disabled={isRunning || parameters.length === 0}
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Scenario...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run What-If Scenario
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Scenario Results History */}
      {scenarioResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Scenario Runs ({scenarioResults.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scenarioResults.map((scenario, index) => (
                <div
                  key={scenario.executionId}
                  className="flex items-center justify-between p-3 border rounded-lg bg-white"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Scenario {index + 1}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {Object.entries(scenario.parameters).map(([key, value]) => (
                        <Badge key={key} variant="secondary" className="text-xs">
                          {key}: {String(value)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Badge
                    variant={scenario.status === "completed" ? "default" : scenario.status === "running" ? "secondary" : "destructive"}
                  >
                    {scenario.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
