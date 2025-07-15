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
    targetVariables: [] as string[], // Multiple dependent variables for MANOVA/MANCOVA
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
    // Dynamic ML parameters based on algorithm
    mlParams: {
      // Random Forest
      n_estimators: "100",
      max_depth: "auto",
      min_samples_split: "2",
      min_samples_leaf: "1",
      // Gradient Boosting
      learning_rate: "0.1",
      n_estimators_gb: "100",
      max_depth_gb: "3",
      // SVM
      C: "1.0",
      kernel: "rbf",
      gamma: "scale",
      // Neural Network
      hidden_layer_sizes: "100,50",
      activation: "relu",
      solver: "adam",
      alpha_nn: "0.0001",
      // Linear/Logistic Regression
      regularization: "none",
      C_reg: "1.0",
      penalty: "l2"
    },
    // Descriptive stats configuration
    descriptiveStatsConfig: {
      selectedVariables: [] as string[],
      includeDistribution: true,
      includeCategoricalAnalysis: true,
      includeCorrelation: true,
      includeMissingData: true,
      includeOutliers: true,
      distributionTests: [] as string[] // normality, skewness, kurtosis tests
    },
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

  const handleVariableSelection = (variable: string, type: 'multivariate' | 'covariates' | 'targets' | 'descriptive') => {
    if (type === 'multivariate') {
      setAnalysisConfig(prev => ({
        ...prev,
        multivariateVariables: prev.multivariateVariables.includes(variable)
          ? prev.multivariateVariables.filter(v => v !== variable)
          : [...prev.multivariateVariables, variable]
      }));
    } else if (type === 'covariates') {
      setAnalysisConfig(prev => ({
        ...prev,
        covariates: prev.covariates.includes(variable)
          ? prev.covariates.filter(v => v !== variable)
          : [...prev.covariates, variable]
      }));
    } else if (type === 'targets') {
      setAnalysisConfig(prev => ({
        ...prev,
        targetVariables: prev.targetVariables.includes(variable)
          ? prev.targetVariables.filter(v => v !== variable)
          : [...prev.targetVariables, variable]
      }));
    } else if (type === 'descriptive') {
      setAnalysisConfig(prev => ({
        ...prev,
        descriptiveStatsConfig: {
          ...prev.descriptiveStatsConfig,
          selectedVariables: prev.descriptiveStatsConfig.selectedVariables.includes(variable)
            ? prev.descriptiveStatsConfig.selectedVariables.filter(v => v !== variable)
            : [...prev.descriptiveStatsConfig.selectedVariables, variable]
        }
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

    if (selectedAnalysisType?.requiresTarget && !selectedAnalysisType.multipleTargets && !analysisConfig.targetVariable) {
      toast({
        title: "Error",
        description: "Please select a target variable for this analysis",
        variant: "destructive"
      });
      return;
    }

    if (selectedAnalysisType?.multipleTargets && analysisConfig.targetVariables.length === 0) {
      toast({
        title: "Error",
        description: `Please select at least one dependent variable for ${selectedAnalysisType.name}`,
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
      console.log("Starting advanced analysis with project ID:", projectId);
      console.log("Analysis config:", analysisConfig);
      
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
      console.log("API Response:", result);

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
      console.error("Advanced analysis error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to run analysis";
      
      // Check if it's a project not found error
      if (errorMessage.includes("Project not found")) {
        toast({
          title: "Project Not Found",
          description: "Your project data has been lost (server restart). Please re-upload your data file to continue with analysis.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Analysis Failed",
          description: errorMessage,
          variant: "destructive"
        });
      }
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
              {/* Target Variable (Single) */}
              {selectedAnalysisType.requiresTarget && !selectedAnalysisType.multipleTargets && (
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

              {/* Multiple Target Variables (MANOVA/MANCOVA) */}
              {selectedAnalysisType.multipleTargets && (
                <div>
                  <Label>Dependent Variables (Multiple targets for {selectedAnalysisType.name})</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto border rounded-lg p-2">
                    {numericVariables.map(variable => (
                      <div key={variable} className="flex items-center space-x-2">
                        <Checkbox
                          id={`target-${variable}`}
                          checked={analysisConfig.targetVariables.includes(variable)}
                          onCheckedChange={() => handleVariableSelection(variable, 'targets')}
                        />
                        <Label htmlFor={`target-${variable}`} className="text-sm">
                          {variable} ({schema[variable]?.type})
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Select multiple numeric variables to analyze simultaneously
                  </p>
                  {analysisConfig.targetVariables.length > 0 && (
                    <div className="mt-2">
                      <span className="text-sm font-medium">Selected: </span>
                      <span className="text-sm text-blue-600">
                        {analysisConfig.targetVariables.join(', ')}
                      </span>
                    </div>
                  )}
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

              {/* Dynamic Algorithm-Specific Parameters */}
              <div className="border rounded-lg p-4">
                <Label className="text-base font-medium">Algorithm Parameters</Label>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  
                  {/* Random Forest Parameters */}
                  {analysisConfig.mlAlgorithm === 'random_forest' && (
                    <>
                      <div>
                        <Label>Number of Estimators</Label>
                        <Select 
                          value={analysisConfig.mlParams.n_estimators} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, n_estimators: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100 (Default)</SelectItem>
                            <SelectItem value="200">200</SelectItem>
                            <SelectItem value="500">500</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Max Depth</Label>
                        <Select 
                          value={analysisConfig.mlParams.max_depth} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, max_depth: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto (Default)</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Min Samples Split</Label>
                        <Select 
                          value={analysisConfig.mlParams.min_samples_split} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, min_samples_split: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 (Default)</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Min Samples Leaf</Label>
                        <Select 
                          value={analysisConfig.mlParams.min_samples_leaf} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, min_samples_leaf: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 (Default)</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* Gradient Boosting Parameters */}
                  {analysisConfig.mlAlgorithm === 'gradient_boosting' && (
                    <>
                      <div>
                        <Label>Learning Rate</Label>
                        <Select 
                          value={analysisConfig.mlParams.learning_rate} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, learning_rate: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.01">0.01</SelectItem>
                            <SelectItem value="0.1">0.1 (Default)</SelectItem>
                            <SelectItem value="0.2">0.2</SelectItem>
                            <SelectItem value="0.3">0.3</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Number of Estimators</Label>
                        <Select 
                          value={analysisConfig.mlParams.n_estimators_gb} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, n_estimators_gb: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100 (Default)</SelectItem>
                            <SelectItem value="200">200</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Max Depth</Label>
                        <Select 
                          value={analysisConfig.mlParams.max_depth_gb} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, max_depth_gb: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 (Default)</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* SVM Parameters */}
                  {analysisConfig.mlAlgorithm === 'svm' && (
                    <>
                      <div>
                        <Label>C (Regularization)</Label>
                        <Select 
                          value={analysisConfig.mlParams.C} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, C: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.1">0.1</SelectItem>
                            <SelectItem value="1.0">1.0 (Default)</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Kernel</Label>
                        <Select 
                          value={analysisConfig.mlParams.kernel} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, kernel: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="linear">Linear</SelectItem>
                            <SelectItem value="rbf">RBF (Default)</SelectItem>
                            <SelectItem value="poly">Polynomial</SelectItem>
                            <SelectItem value="sigmoid">Sigmoid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Gamma</Label>
                        <Select 
                          value={analysisConfig.mlParams.gamma} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, gamma: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scale">Scale (Default)</SelectItem>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="0.001">0.001</SelectItem>
                            <SelectItem value="0.01">0.01</SelectItem>
                            <SelectItem value="0.1">0.1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* Neural Network Parameters */}
                  {analysisConfig.mlAlgorithm === 'neural_network' && (
                    <>
                      <div>
                        <Label>Hidden Layer Sizes</Label>
                        <Select 
                          value={analysisConfig.mlParams.hidden_layer_sizes} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, hidden_layer_sizes: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="100">100</SelectItem>
                            <SelectItem value="100,50">100,50 (Default)</SelectItem>
                            <SelectItem value="100,100">100,100</SelectItem>
                            <SelectItem value="200,100,50">200,100,50</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Activation Function</Label>
                        <Select 
                          value={analysisConfig.mlParams.activation} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, activation: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="relu">ReLU (Default)</SelectItem>
                            <SelectItem value="tanh">Tanh</SelectItem>
                            <SelectItem value="logistic">Logistic</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Solver</Label>
                        <Select 
                          value={analysisConfig.mlParams.solver} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, solver: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="adam">Adam (Default)</SelectItem>
                            <SelectItem value="lbfgs">L-BFGS</SelectItem>
                            <SelectItem value="sgd">SGD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Alpha (L2 regularization)</Label>
                        <Select 
                          value={analysisConfig.mlParams.alpha_nn} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, alpha_nn: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.0001">0.0001 (Default)</SelectItem>
                            <SelectItem value="0.001">0.001</SelectItem>
                            <SelectItem value="0.01">0.01</SelectItem>
                            <SelectItem value="0.1">0.1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* Linear/Logistic Regression Parameters */}
                  {(analysisConfig.mlAlgorithm === 'linear_regression' || analysisConfig.mlAlgorithm === 'logistic_regression') && (
                    <>
                      <div>
                        <Label>Regularization</Label>
                        <Select 
                          value={analysisConfig.mlParams.regularization} 
                          onValueChange={(value) => setAnalysisConfig(prev => ({ 
                            ...prev, 
                            mlParams: { ...prev.mlParams, regularization: value } 
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None (Default)</SelectItem>
                            <SelectItem value="l1">L1 (Lasso)</SelectItem>
                            <SelectItem value="l2">L2 (Ridge)</SelectItem>
                            <SelectItem value="elasticnet">Elastic Net</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {analysisConfig.mlParams.regularization !== 'none' && (
                        <div>
                          <Label>Regularization Strength</Label>
                          <Select 
                            value={analysisConfig.mlParams.C_reg} 
                            onValueChange={(value) => setAnalysisConfig(prev => ({ 
                              ...prev, 
                              mlParams: { ...prev.mlParams, C_reg: value } 
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0.1">0.1</SelectItem>
                              <SelectItem value="1.0">1.0 (Default)</SelectItem>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      {analysisConfig.mlAlgorithm === 'logistic_regression' && (
                        <div>
                          <Label>Penalty</Label>
                          <Select 
                            value={analysisConfig.mlParams.penalty} 
                            onValueChange={(value) => setAnalysisConfig(prev => ({ 
                              ...prev, 
                              mlParams: { ...prev.mlParams, penalty: value } 
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="l2">L2 (Default)</SelectItem>
                              <SelectItem value="l1">L1</SelectItem>
                              <SelectItem value="elasticnet">Elastic Net</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}
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