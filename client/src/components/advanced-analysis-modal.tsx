import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { X, TrendingUp, BarChart3, Zap, Target, Brain, Calculator } from "lucide-react";

interface AdvancedAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  schema: any;
}

export default function AdvancedAnalysisModal({ 
  isOpen, 
  onClose, 
  projectId, 
  schema 
}: AdvancedAnalysisModalProps) {
  const [analysisType, setAnalysisType] = useState<string>("");
  const [analysisConfig, setAnalysisConfig] = useState({
    question: "",
    targetVariable: "",
    multivariateVariables: [] as string[],
    alpha: "0.05",
    postHoc: "tukey",
    covariates: [] as string[],
    interactions: false,
    assumptions: true
  });
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  if (!isOpen) return null;

  const availableVariables = schema ? Object.keys(schema) : [];
  const numericVariables = availableVariables.filter(var => 
    schema[var]?.type === 'number' || schema[var]?.type === 'integer'
  );
  const categoricalVariables = availableVariables.filter(var => 
    schema[var]?.type === 'string' || schema[var]?.type === 'boolean'
  );

  const analysisTypes = [
    {
      id: 'anova',
      name: 'ANOVA',
      description: 'Analysis of Variance - Compare means across groups',
      icon: <BarChart3 className="w-5 h-5" />,
      requiresTarget: true,
      requiresFactors: true,
      supportsCovariates: false
    },
    {
      id: 'ancova',
      name: 'ANCOVA',
      description: 'Analysis of Covariance - ANOVA with continuous covariates',
      icon: <TrendingUp className="w-5 h-5" />,
      requiresTarget: true,
      requiresFactors: true,
      supportsCovariates: true
    },
    {
      id: 'manova',
      name: 'MANOVA',
      description: 'Multivariate Analysis of Variance - Multiple dependent variables',
      icon: <Target className="w-5 h-5" />,
      requiresTarget: false,
      requiresFactors: true,
      supportsCovariates: false,
      multipleTargets: true
    },
    {
      id: 'mancova',
      name: 'MANCOVA',
      description: 'Multivariate Analysis of Covariance - MANOVA with covariates',
      icon: <Zap className="w-5 h-5" />,
      requiresTarget: false,
      requiresFactors: true,
      supportsCovariates: true,
      multipleTargets: true
    },
    {
      id: 'regression',
      name: 'Regression Analysis',
      description: 'Linear and multiple regression analysis',
      icon: <Calculator className="w-5 h-5" />,
      requiresTarget: true,
      requiresFactors: false,
      supportsCovariates: false
    },
    {
      id: 'machine_learning',
      name: 'Machine Learning',
      description: 'Advanced ML algorithms for prediction and classification',
      icon: <Brain className="w-5 h-5" />,
      requiresTarget: true,
      requiresFactors: false,
      supportsCovariates: false
    }
  ];

  const selectedAnalysisType = analysisTypes.find(t => t.id === analysisType);

  const handleVariableSelection = (variable: string, type: 'multivariate' | 'covariates') => {
    if (type === 'multivariate') {
      setAnalysisConfig(prev => ({
        ...prev,
        multivariateVariables: prev.multivariateVariables.includes(variable)
          ? prev.multivariateVariables.filter(v => v !== variable)
          : [...prev.multivariateVariables, variable]
      }));
    } else {
      setAnalysisConfig(prev => ({
        ...prev,
        covariates: prev.covariates.includes(variable)
          ? prev.covariates.filter(v => v !== variable)
          : [...prev.covariates, variable]
      }));
    }
  };

  const handleRunAnalysis = async () => {
    if (!analysisType || !analysisConfig.question.trim()) {
      toast({
        title: "Error",
        description: "Please select an analysis type and enter a research question",
        variant: "destructive"
      });
      return;
    }

    if (selectedAnalysisType?.requiresTarget && !analysisConfig.targetVariable) {
      toast({
        title: "Error",
        description: "Please select a target variable for this analysis",
        variant: "destructive"
      });
      return;
    }

    if (selectedAnalysisType?.requiresFactors && analysisConfig.multivariateVariables.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one factor variable",
        variant: "destructive"
      });
      return;
    }

    setIsRunning(true);
    setResults(null);

    try {
      const response = await fetch("/api/step-by-step-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          config: {
            ...analysisConfig,
            analysisType
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        setResults(result.result);
        toast({
          title: "Analysis Complete",
          description: `${selectedAnalysisType?.name} analysis completed successfully`
        });
      } else {
        throw new Error(result.error || "Analysis failed");
      }
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to run analysis",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Advanced Statistical Analysis</CardTitle>
              <CardDescription>
                Step-by-step guided analysis with ANOVA, ANCOVA, MANOVA, MANCOVA, Regression, and ML
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Research Question */}
          <div>
            <Label htmlFor="question">Research Question</Label>
            <Textarea
              id="question"
              placeholder="What specific question do you want to answer with your data?&#10;&#10;Examples:&#10;• Does treatment type significantly affect patient recovery time?&#10;• Are there differences in sales performance across regions and seasons?&#10;• Which factors predict customer satisfaction scores?"
              rows={3}
              value={analysisConfig.question}
              onChange={(e) => setAnalysisConfig(prev => ({ ...prev, question: e.target.value }))}
            />
          </div>

          {/* Analysis Type Selection */}
          <div>
            <Label>Analysis Type</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {analysisTypes.map((type) => (
                <Card 
                  key={type.id}
                  className={`cursor-pointer transition-all ${
                    analysisType === type.id 
                      ? 'ring-2 ring-primary bg-primary/5' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setAnalysisType(type.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-primary">{type.icon}</div>
                      <div className="flex-1">
                        <h4 className="font-semibold">{type.name}</h4>
                        <p className="text-sm text-gray-600">{type.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Variable Selection */}
          {selectedAnalysisType && (
            <div className="space-y-4">
              {/* Target Variable */}
              {selectedAnalysisType.requiresTarget && (
                <div>
                  <Label>Target Variable (Dependent Variable)</Label>
                  <Select 
                    value={analysisConfig.targetVariable} 
                    onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, targetVariable: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select target variable" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericVariables.map(variable => (
                        <SelectItem key={variable} value={variable}>
                          {variable} ({schema[variable]?.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Factor Variables */}
              {selectedAnalysisType.requiresFactors && (
                <div>
                  <Label>Factor Variables (Independent Variables)</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto">
                    {categoricalVariables.map(variable => (
                      <div key={variable} className="flex items-center space-x-2">
                        <Checkbox
                          id={`factor-${variable}`}
                          checked={analysisConfig.multivariateVariables.includes(variable)}
                          onCheckedChange={() => handleVariableSelection(variable, 'multivariate')}
                        />
                        <Label htmlFor={`factor-${variable}`} className="text-sm">
                          {variable}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Covariates */}
              {selectedAnalysisType.supportsCovariates && (
                <div>
                  <Label>Covariates (Continuous Control Variables)</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto">
                    {numericVariables.map(variable => (
                      <div key={variable} className="flex items-center space-x-2">
                        <Checkbox
                          id={`covariate-${variable}`}
                          checked={analysisConfig.covariates.includes(variable)}
                          onCheckedChange={() => handleVariableSelection(variable, 'covariates')}
                        />
                        <Label htmlFor={`covariate-${variable}`} className="text-sm">
                          {variable}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Significance Level (α)</Label>
                  <Select 
                    value={analysisConfig.alpha} 
                    onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, alpha: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.01">0.01 (Very Strict)</SelectItem>
                      <SelectItem value="0.05">0.05 (Standard)</SelectItem>
                      <SelectItem value="0.10">0.10 (Lenient)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {analysisType === 'anova' && (
                  <div>
                    <Label>Post-Hoc Test</Label>
                    <Select 
                      value={analysisConfig.postHoc} 
                      onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, postHoc: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tukey">Tukey HSD</SelectItem>
                        <SelectItem value="bonferroni">Bonferroni</SelectItem>
                        <SelectItem value="scheff">Scheffé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Additional Options */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="assumptions"
                  checked={analysisConfig.assumptions}
                  onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, assumptions: checked as boolean }))}
                />
                <Label htmlFor="assumptions">
                  Test statistical assumptions (normality, homogeneity of variance, etc.)
                </Label>
              </div>

              {(analysisType === 'ancova' || analysisType === 'mancova') && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="interactions"
                    checked={analysisConfig.interactions}
                    onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, interactions: checked as boolean }))}
                  />
                  <Label htmlFor="interactions">
                    Include interaction effects between factors and covariates
                  </Label>
                </div>
              )}
            </div>
          )}

          {/* Results Display */}
          {results && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Analysis Results</h3>
              <div className="space-y-2">
                <p><strong>Analysis Type:</strong> {results.analysis_type}</p>
                <p><strong>Question:</strong> {results.question}</p>
                <p><strong>Target Variable:</strong> {results.target_variable}</p>
                <p><strong>Interpretation:</strong> {results.interpretation}</p>
                
                {results.recommendations && (
                  <div>
                    <strong>Recommendations:</strong>
                    <ul className="list-disc ml-4 mt-1">
                      {results.recommendations.map((rec: string, index: number) => (
                        <li key={index}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleRunAnalysis} 
              disabled={isRunning || !analysisType}
            >
              {isRunning ? "Running Analysis..." : "Run Analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}