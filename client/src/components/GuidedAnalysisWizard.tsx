import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { 
  ArrowRight, 
  ArrowLeft, 
  Target, 
  Users, 
  TrendingUp, 
  BarChart3, 
  Brain, 
  FileText, 
  CheckCircle,
  HelpCircle,
  Building2,
  DollarSign,
  ShoppingCart,
  UserCheck,
  Settings,
  Globe,
  Briefcase,
  Star,
  AlertCircle,
  CreditCard,
  Calculator
} from 'lucide-react';

interface GuidedAnalysisWizardProps {
  projectId: string;
  schema: any;
  onComplete: (analysisConfig: any) => void;
  onClose: () => void;
}

interface BusinessScenario {
  id: string;
  role: string;
  department: string;
  scenario: string;
  businessQuestion: string;
  dataTypes: string[];
  recommendedAnalysis: string[];
  expectedOutcome: string;
  icon: React.ReactNode;
}

const BUSINESS_SCENARIOS: BusinessScenario[] = [
  {
    id: 'hr_engagement',
    role: 'HR Analyst',
    department: 'Human Resources',
    scenario: 'Employee engagement survey analysis',
    businessQuestion: 'I want to analyze engagement scores across different managers and departments',
    dataTypes: ['Employee surveys', 'Manager ratings', 'Department data', 'Tenure information'],
    recommendedAnalysis: ['ANOVA', 'Regression Analysis', 'Descriptive Statistics'],
    expectedOutcome: 'Identify which managers/departments have highest engagement and key drivers',
    icon: <Users className="w-5 h-5" />
  },
  {
    id: 'sales_performance',
    role: 'Sales Manager',
    department: 'Sales',
    scenario: 'Sales performance analysis',
    businessQuestion: 'I want to identify top-performing products and regions for strategic planning',
    dataTypes: ['Sales data', 'Product information', 'Regional data', 'Customer segments'],
    recommendedAnalysis: ['Descriptive Statistics', 'Trend Analysis', 'Comparative Analysis'],
    expectedOutcome: 'Strategic insights on product performance and market opportunities',
    icon: <TrendingUp className="w-5 h-5" />
  },
  {
    id: 'marketing_roi',
    role: 'Marketing Analyst',
    department: 'Marketing',
    scenario: 'Marketing campaign effectiveness',
    businessQuestion: 'I want to measure ROI and effectiveness of different marketing channels',
    dataTypes: ['Campaign data', 'Conversion rates', 'Cost data', 'Customer acquisition'],
    recommendedAnalysis: ['ROI Analysis', 'A/B Testing', 'Attribution Analysis'],
    expectedOutcome: 'Optimize marketing spend and channel allocation',
    icon: <Target className="w-5 h-5" />
  },
  {
    id: 'customer_satisfaction',
    role: 'Customer Success Manager',
    department: 'Customer Experience',
    scenario: 'Customer satisfaction analysis',
    businessQuestion: 'I want to understand factors driving customer satisfaction and retention',
    dataTypes: ['Customer feedback', 'Support tickets', 'Usage data', 'Satisfaction scores'],
    recommendedAnalysis: ['Regression Analysis', 'Correlation Analysis', 'Sentiment Analysis'],
    expectedOutcome: 'Improve customer satisfaction and reduce churn',
    icon: <Star className="w-5 h-5" />
  },
  {
    id: 'operations_efficiency',
    role: 'Operations Manager',
    department: 'Operations',
    scenario: 'Process efficiency analysis',
    businessQuestion: 'I want to identify bottlenecks and optimize operational processes',
    dataTypes: ['Process data', 'Time tracking', 'Resource utilization', 'Quality metrics'],
    recommendedAnalysis: ['Process Mining', 'Efficiency Analysis', 'Bottleneck Analysis'],
    expectedOutcome: 'Streamline operations and reduce costs',
    icon: <Settings className="w-5 h-5" />
  },
  {
    id: 'financial_performance',
    role: 'Financial Analyst',
    department: 'Finance',
    scenario: 'Financial performance analysis',
    businessQuestion: 'I want to analyze revenue drivers and cost optimization opportunities',
    dataTypes: ['Financial statements', 'Budget data', 'Cost centers', 'Revenue streams'],
    recommendedAnalysis: ['Financial Modeling', 'Variance Analysis', 'Profitability Analysis'],
    expectedOutcome: 'Optimize financial performance and identify growth opportunities',
    icon: <DollarSign className="w-5 h-5" />
  }
];

const ANALYSIS_TYPES = {
  'descriptive': {
    name: 'Descriptive Analysis',
    description: 'What happened? Summary statistics and data exploration',
    icon: <BarChart3 className="w-4 h-4" />,
    complexity: 'Basic',
    basePrice: 25,
    features: ['transformation', 'analysis']
  },
  'comparative': {
    name: 'Comparative Analysis',
    description: 'How do groups compare? Statistical testing and comparisons',
    icon: <Target className="w-4 h-4" />,
    complexity: 'Intermediate',
    basePrice: 40,
    features: ['transformation', 'analysis', 'visualization']
  },
  'predictive': {
    name: 'Predictive Analysis',
    description: 'What will happen? Forecasting and trend analysis',
    icon: <TrendingUp className="w-4 h-4" />,
    complexity: 'Advanced',
    basePrice: 70,
    features: ['transformation', 'analysis', 'visualization', 'ai_insights']
  },
  'diagnostic': {
    name: 'Diagnostic Analysis',
    description: 'Why did it happen? Root cause and relationship analysis',
    icon: <HelpCircle className="w-4 h-4" />,
    complexity: 'Advanced',
    basePrice: 60,
    features: ['transformation', 'analysis', 'visualization', 'ai_insights']
  }
};

// Question templates based on scenario + analysis type combinations
const QUESTION_TEMPLATES = {
  'hr_engagement': {
    'descriptive': [
      'What is the overall employee engagement score?',
      'How are engagement scores distributed across departments?',
      'What are the most and least engaged teams?',
      'What percentage of employees are highly engaged vs. disengaged?'
    ],
    'comparative': [
      'Do engagement scores differ significantly between departments?',
      'Are there differences in engagement between managers?',
      'How do engagement scores vary by employee tenure?',
      'Which departments have the highest vs. lowest engagement?'
    ],
    'predictive': [
      'Which employees are at risk of leaving based on engagement scores?',
      'What factors predict high employee engagement?',
      'How will engagement trends change over the next quarter?',
      'Which teams are likely to improve or decline in engagement?'
    ],
    'diagnostic': [
      'What factors are driving low engagement in specific departments?',
      'Why do certain managers have higher engagement scores?',
      'What is the relationship between engagement and performance?',
      'What specific issues are causing disengagement?'
    ]
  },
  'sales_performance': {
    'descriptive': [
      'What are our total sales by product and region?',
      'Which products are top performers?',
      'What are the sales trends over time?',
      'How are sales distributed across our sales team?'
    ],
    'comparative': [
      'Which regions are outperforming others?',
      'How do different products compare in profitability?',
      'Are there seasonal differences in sales performance?',
      'Which sales representatives are top performers?'
    ],
    'predictive': [
      'What will next quarter\'s sales look like?',
      'Which products will be our top sellers next year?',
      'How will seasonal trends affect future sales?',
      'Which customers are likely to make large purchases?'
    ],
    'diagnostic': [
      'Why are certain products underperforming?',
      'What factors drive regional sales differences?',
      'Why do some sales reps consistently outperform others?',
      'What causes seasonal sales variations?'
    ]
  },
  'financial_performance': {
    'descriptive': [
      'What are our key financial metrics and trends?',
      'How is revenue distributed across business units?',
      'What are our main cost drivers?',
      'How has profitability changed over time?'
    ],
    'comparative': [
      'Which business units are most profitable?',
      'How do our costs compare to industry benchmarks?',
      'Which revenue streams are growing vs. declining?',
      'How do seasonal patterns affect different business areas?'
    ],
    'predictive': [
      'What will our revenue look like next quarter?',
      'Which business units will drive future growth?',
      'How will cost changes affect profitability?',
      'What are our projected cash flow needs?'
    ],
    'diagnostic': [
      'What factors are driving cost increases?',
      'Why are certain business units underperforming?',
      'What causes revenue volatility?',
      'Which investments provide the best ROI?'
    ]
  }
};

const DELIVERABLE_PRICING = {
  'executive_summary': { name: 'Executive Summary', price: 15 },
  'detailed_report': { name: 'Detailed Report', price: 25 },
  'data_visualizations': { name: 'Data Visualizations', price: 20 },
  'statistical_tables': { name: 'Statistical Tables', price: 10 },
  'presentation_deck': { name: 'Presentation Deck', price: 30 },
  'action_plan': { name: 'Action Plan', price: 20 }
};

const VARIABLE_PRICING = {
  baseVariables: 5, // Free variables included
  additionalVariablePrice: 2 // Per additional variable
};

// Timeline multipliers removed - pricing now based on analysis complexity and data size only

export default function GuidedAnalysisWizard({ 
  projectId, 
  schema, 
  onComplete, 
  onClose 
}: GuidedAnalysisWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [analysisConfig, setAnalysisConfig] = useState({
    businessContext: '',
    role: '',
    department: '',
    businessQuestion: '',
    dataDescription: '',
    analysisType: '',
    specificQuestions: [] as string[],
    expectedOutcome: '',
    // timeline field removed
    stakeholders: '',
    selectedScenario: null as BusinessScenario | null,
    customScenario: false,
    selectedVariables: [] as string[],
    hypotheses: [] as string[],
    deliverables: [] as string[],
    templateApplied: false
  });

  const [pricing, setPricing] = useState({
    analysisBasePrice: 0,
    variablePrice: 0,
    deliverablesPrice: 0,
    subtotal: 0,
    total: 0
  });

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const { toast } = useToast();

  const totalSteps = 7; // Added payment step
  const progress = (currentStep / totalSteps) * 100;

  const availableVariables = schema ? Object.keys(schema) : [];
  const numericVariables = availableVariables.filter(variable => 
    schema[variable]?.type === 'number' || schema[variable]?.type === 'integer'
  );
  const categoricalVariables = availableVariables.filter(variable => 
    schema[variable]?.type === 'text' || schema[variable]?.type === 'string'
  );

  // Calculate pricing whenever analysis config changes
  useEffect(() => {
    calculatePricing();
  }, [analysisConfig.analysisType, analysisConfig.selectedVariables, analysisConfig.deliverables]);

  const calculatePricing = () => {
    if (!analysisConfig.analysisType) {
      setPricing({
        analysisBasePrice: 0,
        variablePrice: 0,
        deliverablesPrice: 0,
        subtotal: 0,
        total: 0
      });
      return;
    }

    const analysisType = ANALYSIS_TYPES[analysisConfig.analysisType];
    const analysisBasePrice = analysisType ? analysisType.basePrice : 0;

    // Calculate variable pricing
    const variableCount = analysisConfig.selectedVariables.length;
    const additionalVariables = Math.max(0, variableCount - VARIABLE_PRICING.baseVariables);
    const variablePrice = additionalVariables * VARIABLE_PRICING.additionalVariablePrice;

    // Calculate deliverables pricing
    const deliverablesPrice = analysisConfig.deliverables.reduce((total, deliverableId) => {
      const deliverable = DELIVERABLE_PRICING[deliverableId];
      return total + (deliverable ? deliverable.price : 0);
    }, 0);

    const subtotal = analysisBasePrice + variablePrice + deliverablesPrice;
    const total = Math.round(subtotal);

    setPricing({
      analysisBasePrice,
      variablePrice,
      deliverablesPrice,
      subtotal,
      total
    });
  };

  const handleScenarioSelect = (scenario: BusinessScenario) => {
    setAnalysisConfig(prev => ({
      ...prev,
      selectedScenario: scenario,
      role: scenario.role,
      department: scenario.department,
      businessQuestion: scenario.businessQuestion,
      expectedOutcome: scenario.expectedOutcome,
      customScenario: false
    }));
  };

  const addCustomQuestion = () => {
    const newQuestion = (document.getElementById('custom-question') as HTMLInputElement)?.value;
    if (newQuestion && !analysisConfig.specificQuestions.includes(newQuestion)) {
      setAnalysisConfig(prev => ({
        ...prev,
        specificQuestions: [...prev.specificQuestions, newQuestion]
      }));
      (document.getElementById('custom-question') as HTMLInputElement).value = '';
    }
  };

  const addHypothesis = () => {
    const newHypothesis = (document.getElementById('hypothesis') as HTMLInputElement)?.value;
    if (newHypothesis && !analysisConfig.hypotheses.includes(newHypothesis)) {
      setAnalysisConfig(prev => ({
        ...prev,
        hypotheses: [...prev.hypotheses, newHypothesis]
      }));
      (document.getElementById('hypothesis') as HTMLInputElement).value = '';
    }
  };

  const generateAnalysisPlan = () => {
    const plan = {
      projectId,
      businessContext: analysisConfig,
      dataVariables: analysisConfig.selectedVariables,
      analysisType: analysisConfig.analysisType,
      questions: analysisConfig.specificQuestions,
      hypotheses: analysisConfig.hypotheses,
      deliverables: analysisConfig.deliverables,
      // timeline field removed
      pricing: pricing
    };
    
    onComplete(plan);
  };

  const handlePayment = async () => {
    if (pricing.total === 0) {
      toast({
        title: "Error",
        description: "Please complete your analysis configuration first.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessingPayment(true);
    try {
      // Create guided analysis payment intent
      const response = await apiClient.createGuidedAnalysisPayment(
        analysisConfig,
        pricing
      );

      if (response.clientSecret) {
        // Store checkout data in localStorage for retrieval after payment
        const checkoutData = {
          clientSecret: response.clientSecret,
          analysisId: response.analysisId,
          analysisConfig: analysisConfig,
          pricing: pricing,
          projectId: projectId
        };
        
        localStorage.setItem('guidedAnalysisCheckout', JSON.stringify(checkoutData));
        
        // Navigate to checkout page
        window.location.href = `/checkout?type=guided_analysis&amount=${pricing.total}`;
      }
    } catch (error) {
      console.error('Payment initialization failed:', error);
      toast({
        title: "Payment Error",
        description: "Failed to initialize payment. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Tell Us About Your Business Context</h2>
              <p className="text-gray-600">Select a scenario that matches your situation or create a custom one</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {BUSINESS_SCENARIOS.map((scenario) => (
                <Card 
                  key={scenario.id} 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    analysisConfig.selectedScenario?.id === scenario.id 
                      ? 'ring-2 ring-blue-500 bg-blue-50' 
                      : ''
                  }`}
                  onClick={() => handleScenarioSelect(scenario)}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {scenario.icon}
                      {scenario.role}
                    </CardTitle>
                    <CardDescription>{scenario.department}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-700 mb-3">{scenario.businessQuestion}</p>
                    <div className="flex flex-wrap gap-1">
                      {scenario.dataTypes.slice(0, 2).map((type) => (
                        <Badge key={type} variant="secondary" className="text-xs">
                          {type}
                        </Badge>
                      ))}
                      {scenario.dataTypes.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{scenario.dataTypes.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  Custom Business Scenario
                </CardTitle>
                <CardDescription>
                  Don't see your scenario? Create a custom analysis plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  onClick={() => setAnalysisConfig(prev => ({ ...prev, customScenario: true, selectedScenario: null }))}
                  className="w-full"
                >
                  Create Custom Scenario
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Define Your Business Question</h2>
              <p className="text-gray-600">What specific business problem are you trying to solve?</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="role">Your Role</Label>
                <Input
                  id="role"
                  value={analysisConfig.role}
                  onChange={(e) => setAnalysisConfig(prev => ({ ...prev, role: e.target.value }))}
                  placeholder="e.g., HR Analyst, Sales Manager"
                />
              </div>

              <div>
                <Label htmlFor="department">Department</Label>
                <Select value={analysisConfig.department} onValueChange={(value) => setAnalysisConfig(prev => ({ ...prev, department: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Human Resources">Human Resources</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Customer Experience">Customer Experience</SelectItem>
                    <SelectItem value="IT">Information Technology</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="businessQuestion">Primary Business Question</Label>
                <Textarea
                  id="businessQuestion"
                  value={analysisConfig.businessQuestion}
                  onChange={(e) => setAnalysisConfig(prev => ({ ...prev, businessQuestion: e.target.value }))}
                  placeholder="Describe the main business question you want to answer..."
                  className="min-h-[100px]"
                />
              </div>

              <div>
                <Label htmlFor="dataDescription">Describe Your Data</Label>
                <Textarea
                  id="dataDescription"
                  value={analysisConfig.dataDescription}
                  onChange={(e) => setAnalysisConfig(prev => ({ ...prev, dataDescription: e.target.value }))}
                  placeholder="What data do you have? e.g., employee survey responses, sales transactions, customer feedback..."
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <Label htmlFor="expectedOutcome">Expected Outcome</Label>
                <Textarea
                  id="expectedOutcome"
                  value={analysisConfig.expectedOutcome}
                  onChange={(e) => setAnalysisConfig(prev => ({ ...prev, expectedOutcome: e.target.value }))}
                  placeholder="What do you hope to achieve with this analysis?"
                  className="min-h-[80px]"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Choose Your Analysis Type</h2>
              <p className="text-gray-600">Select the type of analysis that best fits your needs</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(ANALYSIS_TYPES).map(([key, analysis]) => (
                <Card 
                  key={key}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    analysisConfig.analysisType === key 
                      ? 'ring-2 ring-blue-500 bg-blue-50' 
                      : ''
                  }`}
                  onClick={() => setAnalysisConfig(prev => ({ ...prev, analysisType: key }))}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {analysis.icon}
                          {analysis.name}
                        </CardTitle>
                        <CardDescription>{analysis.description}</CardDescription>
                      </div>
                      <Badge variant="secondary" className="text-green-700 bg-green-100">
                        ${analysis.basePrice}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <Badge variant="outline">{analysis.complexity}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {analysisConfig.selectedScenario && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    Recommended for Your Scenario
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-green-700 mb-2">
                    Based on your selected scenario, we recommend:
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {analysisConfig.selectedScenario.recommendedAnalysis.map((rec) => (
                      <Badge key={rec} variant="default" className="bg-green-600">
                        {rec}
                      </Badge>
                    ))}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      // Map recommended analysis to analysis types
                      const recommendation = analysisConfig.selectedScenario.recommendedAnalysis[0];
                      let analysisType = '';
                      
                      if (recommendation.toLowerCase().includes('roi') || recommendation.toLowerCase().includes('financial')) {
                        analysisType = 'diagnostic';
                      } else if (recommendation.toLowerCase().includes('a/b') || recommendation.toLowerCase().includes('testing')) {
                        analysisType = 'comparative';
                      } else if (recommendation.toLowerCase().includes('attribution') || recommendation.toLowerCase().includes('predictive')) {
                        analysisType = 'predictive';
                      } else {
                        analysisType = 'descriptive'; // Default fallback
                      }
                      
                      // Apply template configuration including questions and variables
                      const templateQuestions = analysisConfig.selectedScenario.businessQuestion ? 
                        [analysisConfig.selectedScenario.businessQuestion] : [];
                      
                      setAnalysisConfig(prev => ({ 
                        ...prev, 
                        analysisType,
                        templateApplied: true,
                        specificQuestions: [...prev.specificQuestions, ...templateQuestions.filter(q => !prev.specificQuestions.includes(q))]
                      }));
                      
                      // Auto-advance to next step after template is applied
                      setTimeout(() => {
                        setCurrentStep(4); // Move to variable selection
                      }, 500);
                    }}
                    className="text-green-700 border-green-300 hover:bg-green-100"
                  >
                    <Target className="w-4 h-4 mr-2" />
                    Use Template
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Select Your Data Variables</h2>
              <p className="text-gray-600">Choose the variables you want to analyze</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Numeric Variables
                  </CardTitle>
                  <CardDescription>
                    Numbers, measurements, counts (e.g., sales amounts, ratings, ages)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {numericVariables.map((variable) => (
                      <div key={variable} className="flex items-center space-x-2">
                        <Checkbox
                          id={`numeric-${variable}`}
                          checked={analysisConfig.selectedVariables.includes(variable)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAnalysisConfig(prev => ({
                                ...prev,
                                selectedVariables: [...prev.selectedVariables, variable]
                              }));
                            } else {
                              setAnalysisConfig(prev => ({
                                ...prev,
                                selectedVariables: prev.selectedVariables.filter(v => v !== variable)
                              }));
                            }
                          }}
                        />
                        <label 
                          htmlFor={`numeric-${variable}`} 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {variable}
                        </label>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Categorical Variables
                  </CardTitle>
                  <CardDescription>
                    Groups, categories, text (e.g., departments, regions, yes/no)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {categoricalVariables.map((variable) => (
                      <div key={variable} className="flex items-center space-x-2">
                        <Checkbox
                          id={`categorical-${variable}`}
                          checked={analysisConfig.selectedVariables.includes(variable)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAnalysisConfig(prev => ({
                                ...prev,
                                selectedVariables: [...prev.selectedVariables, variable]
                              }));
                            } else {
                              setAnalysisConfig(prev => ({
                                ...prev,
                                selectedVariables: prev.selectedVariables.filter(v => v !== variable)
                              }));
                            }
                          }}
                        />
                        <label 
                          htmlFor={`categorical-${variable}`} 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {variable}
                        </label>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <AlertCircle className="w-5 h-5" />
                  Variable Selection Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-blue-700 space-y-1 text-sm">
                  <li>• Select variables that directly relate to your business question</li>
                  <li>• Include outcome variables (what you want to measure)</li>
                  <li>• Include potential explanatory variables (what might influence the outcome)</li>
                  <li>• You can always add more variables later</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Define Specific Questions & Hypotheses</h2>
              <p className="text-gray-600">What specific questions do you want answered?</p>
            </div>

            <div className="space-y-4">
              {/* Template Questions */}
              {analysisConfig.selectedScenario && analysisConfig.analysisType && 
               QUESTION_TEMPLATES[analysisConfig.selectedScenario.id] && 
               QUESTION_TEMPLATES[analysisConfig.selectedScenario.id][analysisConfig.analysisType] && (
                <Card className="bg-green-50 border-green-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-800">
                      <Target className="w-5 h-5" />
                      Suggested Questions Template
                    </CardTitle>
                    <CardDescription>
                      Based on your scenario and analysis type, here are relevant questions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        {QUESTION_TEMPLATES[analysisConfig.selectedScenario.id][analysisConfig.analysisType].map((question, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                            <span className="text-sm text-gray-700">{question}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!analysisConfig.specificQuestions.includes(question)) {
                                  setAnalysisConfig(prev => ({
                                    ...prev,
                                    specificQuestions: [...prev.specificQuestions, question]
                                  }));
                                }
                              }}
                              disabled={analysisConfig.specificQuestions.includes(question)}
                            >
                              {analysisConfig.specificQuestions.includes(question) ? 'Added' : 'Add'}
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const templateQuestions = QUESTION_TEMPLATES[analysisConfig.selectedScenario.id][analysisConfig.analysisType];
                          const newQuestions = templateQuestions.filter(q => !analysisConfig.specificQuestions.includes(q));
                          setAnalysisConfig(prev => ({
                            ...prev,
                            specificQuestions: [...prev.specificQuestions, ...newQuestions]
                          }));
                        }}
                        className="w-full text-green-700 border-green-300 hover:bg-green-100"
                      >
                        <Target className="w-4 h-4 mr-2" />
                        Add All Template Questions
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    Specific Questions
                  </CardTitle>
                  <CardDescription>
                    Add specific questions you want the analysis to answer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="custom-question"
                        placeholder="e.g., Which manager has the highest team engagement?"
                        className="flex-1"
                      />
                      <Button onClick={addCustomQuestion} variant="outline">
                        Add Question
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysisConfig.specificQuestions.map((question, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {question}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-1 h-auto p-0"
                            onClick={() => setAnalysisConfig(prev => ({
                              ...prev,
                              specificQuestions: prev.specificQuestions.filter((_, i) => i !== index)
                            }))}
                          >
                            ×
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Hypotheses
                  </CardTitle>
                  <CardDescription>
                    What do you think you'll find? (Optional but helpful)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="hypothesis"
                        placeholder="e.g., Teams with newer managers will have lower engagement"
                        className="flex-1"
                      />
                      <Button onClick={addHypothesis} variant="outline">
                        Add Hypothesis
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysisConfig.hypotheses.map((hypothesis, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {hypothesis}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-1 h-auto p-0"
                            onClick={() => setAnalysisConfig(prev => ({
                              ...prev,
                              hypotheses: prev.hypotheses.filter((_, i) => i !== index)
                            }))}
                          >
                            ×
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Choose Your Deliverables</h2>
              <p className="text-gray-600">What outputs do you need for your stakeholders?</p>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Select Deliverables</CardTitle>
                  <CardDescription>
                    Choose the outputs you need (you can select multiple)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { id: 'executive_summary', label: 'Executive Summary', description: 'High-level insights for leadership' },
                      { id: 'detailed_report', label: 'Detailed Report', description: 'Full analysis with methodology' },
                      { id: 'data_visualizations', label: 'Data Visualizations', description: 'Charts and graphs' },
                      { id: 'statistical_tables', label: 'Statistical Tables', description: 'Detailed statistical results' },
                      { id: 'presentation_deck', label: 'Presentation Deck', description: 'PowerPoint-ready slides' },
                      { id: 'action_plan', label: 'Action Plan', description: 'Recommended next steps' }
                    ].map((deliverable) => (
                      <div key={deliverable.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={deliverable.id}
                          checked={analysisConfig.deliverables.includes(deliverable.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAnalysisConfig(prev => ({
                                ...prev,
                                deliverables: [...prev.deliverables, deliverable.id]
                              }));
                            } else {
                              setAnalysisConfig(prev => ({
                                ...prev,
                                deliverables: prev.deliverables.filter(d => d !== deliverable.id)
                              }));
                            }
                          }}
                        />
                        <div>
                          <label 
                            htmlFor={deliverable.id} 
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {deliverable.label}
                          </label>
                          <p className="text-xs text-gray-500 mt-1">{deliverable.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="stakeholders">Key Stakeholders</Label>
                <Input
                  id="stakeholders"
                  value={analysisConfig.stakeholders}
                  onChange={(e) => setAnalysisConfig(prev => ({ ...prev, stakeholders: e.target.value }))}
                  placeholder="e.g., VP of HR, Department Heads"
                />
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Review & Payment</h2>
              <p className="text-gray-600">Review your analysis configuration and complete payment</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Configuration Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Analysis Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Business Context</Label>
                    <p className="text-sm text-gray-600">{analysisConfig.role} - {analysisConfig.department}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Analysis Type</Label>
                    <p className="text-sm text-gray-600">{analysisConfig.analysisType ? ANALYSIS_TYPES[analysisConfig.analysisType].name : 'Not selected'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Variables ({analysisConfig.selectedVariables.length})</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysisConfig.selectedVariables.slice(0, 3).map((variable) => (
                        <Badge key={variable} variant="secondary" className="text-xs">
                          {variable}
                        </Badge>
                      ))}
                      {analysisConfig.selectedVariables.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{analysisConfig.selectedVariables.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Deliverables ({analysisConfig.deliverables.length})</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysisConfig.deliverables.slice(0, 2).map((deliverable) => (
                        <Badge key={deliverable} variant="secondary" className="text-xs">
                          {DELIVERABLE_PRICING[deliverable]?.name}
                        </Badge>
                      ))}
                      {analysisConfig.deliverables.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{analysisConfig.deliverables.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Timeline</Label>
                    <p className="text-sm text-gray-600">Standard delivery - based on analysis complexity</p>
                  </div>
                </CardContent>
              </Card>

              {/* Pricing Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    Price Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Analysis Base Price</span>
                    <span className="text-sm font-medium">${pricing.analysisBasePrice}</span>
                  </div>
                  
                  {pricing.variablePrice > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Additional Variables ({analysisConfig.selectedVariables.length - VARIABLE_PRICING.baseVariables})</span>
                      <span className="text-sm font-medium">${pricing.variablePrice}</span>
                    </div>
                  )}
                  
                  {pricing.deliverablesPrice > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Deliverables</span>
                      <span className="text-sm font-medium">${pricing.deliverablesPrice}</span>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Subtotal</span>
                    <span className="text-sm font-medium">${pricing.subtotal}</span>
                  </div>
                  

                  
                  <Separator />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Total</span>
                    <span className="text-lg font-bold text-green-600">${pricing.total}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payment Section */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <CreditCard className="w-5 h-5" />
                  Secure Payment
                </CardTitle>
                <CardDescription>
                  Complete your payment to start your guided analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">Analysis Package</h3>
                        <p className="text-sm text-gray-600">
                          {analysisConfig.analysisType ? ANALYSIS_TYPES[analysisConfig.analysisType].name : 'Selected Analysis'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">${pricing.total}</div>
                      <div className="text-sm text-gray-500">One-time payment</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Secure payment processing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Expert analysis team</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Delivery guarantee</span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handlePayment}
                    disabled={isProcessingPayment || pricing.total === 0}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    {isProcessingPayment ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Processing Payment...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Pay ${pricing.total} & Start Analysis
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Questions Summary */}
            {analysisConfig.specificQuestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    Your Questions ({analysisConfig.specificQuestions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysisConfig.specificQuestions.map((question, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <Badge variant="outline" className="text-xs mt-1">
                          {index + 1}
                        </Badge>
                        <p className="text-sm text-gray-700">{question}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-6 h-6" />
                Guided Analysis Setup
              </CardTitle>
              <CardDescription>
                Step {currentStep} of {totalSteps} - Let's build your analysis plan
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
          <Progress value={progress} className="mt-2" />
        </CardHeader>
        
        <CardContent>
          {renderStep()}
        </CardContent>
        
        <div className="flex justify-between items-center p-6 border-t">
          <Button 
            variant="outline" 
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            {pricing.total > 0 && currentStep > 3 && (
              <div className="flex items-center gap-2 mr-4">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">Total: ${pricing.total}</span>
              </div>
            )}
            {currentStep < totalSteps ? (
              <Button 
                onClick={() => setCurrentStep(Math.min(totalSteps, currentStep + 1))}
                disabled={
                  (currentStep === 1 && !analysisConfig.selectedScenario && !analysisConfig.customScenario) ||
                  (currentStep === 2 && !analysisConfig.businessQuestion) ||
                  (currentStep === 3 && !analysisConfig.analysisType) ||
                  (currentStep === 4 && analysisConfig.selectedVariables.length === 0) ||
                  (currentStep === 6 && analysisConfig.deliverables.length === 0)
                }
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={generateAnalysisPlan}
                disabled={pricing.total === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Analysis Setup
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}