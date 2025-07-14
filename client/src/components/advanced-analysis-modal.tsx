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
  const [analysisPath, setAnalysisPath] = useState<'statistical' | 'machine_learning' | 'agentic'>('statistical');
  const [analysisConfig, setAnalysisConfig] = useState({
    question: "",
    targetVariable: "",
    multivariateVariables: [] as string[],
    alpha: "0.05",
    postHoc: "tukey",
    covariates: [] as string[],
    interactions: false,
    assumptions: true,
    // ML specific configs
    mlAlgorithm: "random_forest",
    testSize: "0.2",
    crossValidation: "5",
    metrics: [] as string[],
    // Agentic specific configs
    agenticRole: "",
    businessContext: "",
    stepByStep: true,
    reportFormat: "executive_summary"
  });
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  if (!isOpen) return null;

  const availableVariables = schema ? Object.keys(schema) : [];
  const numericVariables = availableVariables.filter(variable => 
    schema[variable]?.type === 'number' || schema[variable]?.type === 'integer'
  );
  const categoricalVariables = availableVariables.filter(variable => 
    schema[variable]?.type === 'text' || schema[variable]?.type === 'string' || schema[variable]?.type === 'boolean'
  );
  
  // For factor variables, include both categorical and numeric variables
  // (numeric variables can be treated as factors in some analyses)
  const factorVariables = availableVariables.filter(variable => 
    schema[variable]?.type === 'text' || 
    schema[variable]?.type === 'string' || 
    schema[variable]?.type === 'boolean' || 
    schema[variable]?.type === 'number' || 
    schema[variable]?.type === 'integer'
  );
  
  // Debug logging
  console.log('Advanced Analysis Modal - Schema:', schema);
  console.log('Available variables:', availableVariables);
  console.log('Numeric variables:', numericVariables);
  console.log('Categorical variables:', categoricalVariables);
  console.log('Factor variables:', factorVariables);

  const analysisTypes = {
    statistical: [
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
      }
    ],
    machine_learning: [
      {
        id: 'classification',
        name: 'Classification',
        description: 'Predict categorical outcomes (Random Forest, SVM, etc.)',
        icon: <Brain className="w-5 h-5" />,
        requiresTarget: true,
        requiresFactors: false,
        supportsCovariates: false
      },
      {
        id: 'regression_ml',
        name: 'Regression (ML)',
        description: 'Predict continuous outcomes (Linear, Ridge, Lasso)',
        icon: <TrendingUp className="w-5 h-5" />,
        requiresTarget: true,
        requiresFactors: false,
        supportsCovariates: false
      },
      {
        id: 'clustering',
        name: 'Clustering',
        description: 'Unsupervised grouping (K-means, Hierarchical)',
        icon: <Target className="w-5 h-5" />,
        requiresTarget: false,
        requiresFactors: false,
        supportsCovariates: false
      },
      {
        id: 'feature_importance',
        name: 'Feature Importance',
        description: 'Identify most important variables for prediction',
        icon: <BarChart3 className="w-5 h-5" />,
        requiresTarget: true,
        requiresFactors: false,
        supportsCovariates: false
      }
    ],
    agentic: [
      {
        id: 'business_insights',
        name: 'Business Insights',
        description: 'AI-powered analysis with business context understanding',
        icon: <Brain className="w-5 h-5" />,
        requiresTarget: false,
        requiresFactors: false,
        supportsCovariates: false
      },
      {
        id: 'comparative_analysis',
        name: 'Comparative Analysis',
        description: 'AI-driven comparison across different dimensions',
        icon: <Target className="w-5 h-5" />,
        requiresTarget: false,
        requiresFactors: false,
        supportsCovariates: false
      },
      {
        id: 'predictive_insights',
        name: 'Predictive Insights',
        description: 'AI forecasting with business recommendations',
        icon: <TrendingUp className="w-5 h-5" />,
        requiresTarget: false,
        requiresFactors: false,
        supportsCovariates: false
      },
      {
        id: 'root_cause_analysis',
        name: 'Root Cause Analysis',
        description: 'AI-powered investigation of underlying causes',
        icon: <Zap className="w-5 h-5" />,
        requiresTarget: false,
        requiresFactors: false,
        supportsCovariates: false
      }
    ]
  };

  const selectedAnalysisType = analysisTypes[analysisPath]?.find(t => t.id === analysisType);

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
            analysisType,
            analysisPath
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

          {/* Analysis Path Selection */}
          <Tabs value={analysisPath} onValueChange={(value) => {
            setAnalysisPath(value as 'statistical' | 'machine_learning' | 'agentic');
            setAnalysisType(""); // Reset analysis type when changing path
          }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="statistical">Statistical Analysis</TabsTrigger>
              <TabsTrigger value="machine_learning">Machine Learning</TabsTrigger>
              <TabsTrigger value="agentic">Agentic Workflow</TabsTrigger>
            </TabsList>
            
            <TabsContent value="statistical" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysisTypes.statistical.map((analysis) => (
                  <Card 
                    key={analysis.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      analysisType === analysis.id 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : ''
                    }`}
                    onClick={() => setAnalysisType(analysis.id)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {analysis.icon}
                        {analysis.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600">{analysis.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="machine_learning" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysisTypes.machine_learning.map((analysis) => (
                  <Card 
                    key={analysis.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      analysisType === analysis.id 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : ''
                    }`}
                    onClick={() => setAnalysisType(analysis.id)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {analysis.icon}
                        {analysis.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600">{analysis.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="agentic" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysisTypes.agentic.map((analysis) => (
                  <Card 
                    key={analysis.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      analysisType === analysis.id 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : ''
                    }`}
                    onClick={() => setAnalysisType(analysis.id)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {analysis.icon}
                        {analysis.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600">{analysis.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Path-Specific Configuration */}
          {selectedAnalysisType && analysisPath === 'statistical' && (
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
                    {factorVariables.map(variable => (
                      <div key={variable} className="flex items-center space-x-2">
                        <Checkbox
                          id={`factor-${variable}`}
                          checked={analysisConfig.multivariateVariables.includes(variable)}
                          onCheckedChange={() => handleVariableSelection(variable, 'multivariate')}
                        />
                        <Label htmlFor={`factor-${variable}`} className="text-sm">
                          {variable} ({schema[variable]?.type})
                        </Label>
                      </div>
                    ))}
                  </div>
                  {factorVariables.length === 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                      No variables available for factor analysis. Please ensure your dataset contains categorical or grouping variables.
                    </p>
                  )}
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

              {/* Statistical Analysis Options */}
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
                      <SelectItem value="0.10">0.10 (Relaxed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
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
                      <SelectItem value="scheffe">Scheffé</SelectItem>
                      <SelectItem value="duncan">Duncan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Additional Options */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="interactions"
                    checked={analysisConfig.interactions}
                    onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, interactions: checked as boolean }))}
                  />
                  <Label htmlFor="interactions">Include interaction effects</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="assumptions"
                    checked={analysisConfig.assumptions}
                    onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, assumptions: checked as boolean }))}
                  />
                  <Label htmlFor="assumptions">Check statistical assumptions</Label>
                </div>
              </div>
            </div>
          )}

          {/* Machine Learning Configuration */}
          {selectedAnalysisType && analysisPath === 'machine_learning' && (
            <div className="space-y-4">
              {/* Target Variable for ML */}
              {selectedAnalysisType.requiresTarget && (
                <div>
                  <Label>Target Variable (What to predict)</Label>
                  <Select 
                    value={analysisConfig.targetVariable} 
                    onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, targetVariable: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select target variable" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVariables.map(variable => (
                        <SelectItem key={variable} value={variable}>
                          {variable} ({schema[variable]?.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Feature Variables */}
              <div>
                <Label>Feature Variables (Predictors)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto">
                  {availableVariables.filter(v => v !== analysisConfig.targetVariable).map(variable => (
                    <div key={variable} className="flex items-center space-x-2">
                      <Checkbox
                        id={`feature-${variable}`}
                        checked={analysisConfig.multivariateVariables.includes(variable)}
                        onCheckedChange={() => handleVariableSelection(variable, 'multivariate')}
                      />
                      <Label htmlFor={`feature-${variable}`} className="text-sm">
                        {variable} ({schema[variable]?.type})
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* ML Algorithm Selection */}
              <div>
                <Label>Machine Learning Algorithm</Label>
                <Select 
                  value={analysisConfig.mlAlgorithm} 
                  onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, mlAlgorithm: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random_forest">Random Forest</SelectItem>
                    <SelectItem value="gradient_boosting">Gradient Boosting</SelectItem>
                    <SelectItem value="linear_regression">Linear Regression</SelectItem>
                    <SelectItem value="logistic_regression">Logistic Regression</SelectItem>
                    <SelectItem value="svm">Support Vector Machine</SelectItem>
                    <SelectItem value="neural_network">Neural Network</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ML Parameters */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Test Set Size</Label>
                  <Select 
                    value={analysisConfig.testSize} 
                    onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, testSize: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.2">20% (Standard)</SelectItem>
                      <SelectItem value="0.3">30%</SelectItem>
                      <SelectItem value="0.1">10%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Cross-Validation Folds</Label>
                  <Select 
                    value={analysisConfig.crossValidation} 
                    onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, crossValidation: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5-fold</SelectItem>
                      <SelectItem value="10">10-fold</SelectItem>
                      <SelectItem value="3">3-fold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Evaluation Metrics */}
              <div>
                <Label>Evaluation Metrics</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['accuracy', 'precision', 'recall', 'f1_score', 'roc_auc', 'mse', 'rmse', 'mae'].map(metric => (
                    <div key={metric} className="flex items-center space-x-2">
                      <Checkbox
                        id={`metric-${metric}`}
                        checked={analysisConfig.metrics.includes(metric)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setAnalysisConfig(prev => ({ ...prev, metrics: [...prev.metrics, metric] }));
                          } else {
                            setAnalysisConfig(prev => ({ ...prev, metrics: prev.metrics.filter(m => m !== metric) }));
                          }
                        }}
                      />
                      <Label htmlFor={`metric-${metric}`} className="text-sm">
                        {metric.toUpperCase()}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Agentic Workflow Configuration */}
          {selectedAnalysisType && analysisPath === 'agentic' && (
            <div className="space-y-4">
              {/* AI Role Configuration */}
              <div>
                <Label>AI Analysis Role</Label>
                <Select 
                  value={analysisConfig.agenticRole} 
                  onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, agenticRole: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select AI role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="data_analyst">Data Analyst</SelectItem>
                    <SelectItem value="business_consultant">Business Consultant</SelectItem>
                    <SelectItem value="statistician">Statistician</SelectItem>
                    <SelectItem value="domain_expert">Domain Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Business Context */}
              <div>
                <Label>Business Context</Label>
                <Textarea
                  placeholder="Describe your business context, goals, and constraints..."
                  value={analysisConfig.businessContext}
                  onChange={(e) => setAnalysisConfig(prev => ({ ...prev, businessContext: e.target.value }))}
                  rows={3}
                />
              </div>

              {/* Variables of Interest */}
              <div>
                <Label>Variables of Interest</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto">
                  {availableVariables.map(variable => (
                    <div key={variable} className="flex items-center space-x-2">
                      <Checkbox
                        id={`interest-${variable}`}
                        checked={analysisConfig.multivariateVariables.includes(variable)}
                        onCheckedChange={() => handleVariableSelection(variable, 'multivariate')}
                      />
                      <Label htmlFor={`interest-${variable}`} className="text-sm">
                        {variable} ({schema[variable]?.type})
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agentic Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Report Format</Label>
                  <Select 
                    value={analysisConfig.reportFormat} 
                    onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, reportFormat: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="executive_summary">Executive Summary</SelectItem>
                      <SelectItem value="detailed_report">Detailed Report</SelectItem>
                      <SelectItem value="presentation">Presentation Format</SelectItem>
                      <SelectItem value="dashboard">Dashboard Summary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2 mt-6">
                  <Checkbox
                    id="stepByStep"
                    checked={analysisConfig.stepByStep}
                    onCheckedChange={(checked) => setAnalysisConfig(prev => ({ ...prev, stepByStep: checked as boolean }))}
                  />
                  <Label htmlFor="stepByStep">Step-by-step breakdown</Label>
                </div>
              </div>
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