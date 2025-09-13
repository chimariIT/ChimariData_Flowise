import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  RotateCcw,
  Sparkles, 
  Briefcase, 
  Settings,
  Users,
  Upload,
  BarChart3,
  Brain,
  FileText,
  CheckCircle,
  ArrowRight,
  Database,
  TrendingUp,
  Zap
} from "lucide-react";
import { Link } from "wouter";

interface DemoStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  duration: number;
  action?: string;
  mockup?: {
    type: 'upload' | 'analysis' | 'suggestions' | 'processing' | 'results' | 'templates' | 'technical';
    data?: any;
  };
}

interface JourneyDemo {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badge: string;
  steps: DemoStep[];
  estimatedTime: string;
}

const JOURNEY_DEMOS: JourneyDemo[] = [
  {
    id: 'non-tech',
    title: 'AI-Guided Journey',
    subtitle: 'Complete automation for non-technical users',
    description: 'Watch how AI orchestrates the entire analytics workflow from start to finish.',
    icon: Sparkles,
    color: 'bg-purple-50 border-purple-200',
    badge: 'Beginner Friendly',
    estimatedTime: '5-10 minutes',
    steps: [
      {
        id: 'upload',
        title: 'Data Onboarding',
        description: 'Upload your data files after signing in to your account',
        icon: Upload,
        duration: 2000,
        action: 'Ready to upload after sign-in',
        mockup: {
          type: 'upload',
          data: { filename: 'sales_data.csv', size: '2.3 MB', rows: 1500, columns: 12 }
        }
      },
      {
        id: 'ai-analyze',
        title: 'AI Analyzes Structure',
        description: 'Our AI automatically detects data types and patterns',
        icon: Brain,
        duration: 3000,
        action: 'Found 12 columns, 1,500 rows',
        mockup: {
          type: 'analysis',
          data: { 
            columns: ['Product', 'Sales', 'Region', 'Date', 'Customer_Type'],
            types: ['Text', 'Number', 'Text', 'Date', 'Category'],
            quality: 95
          }
        }
      },
      {
        id: 'suggest',
        title: 'AI Suggests Analysis',
        description: 'Receive smart recommendations based on your data',
        icon: Sparkles,
        duration: 2500,
        action: 'Suggested 4 analysis types',
        mockup: {
          type: 'suggestions',
          data: {
            recommendations: [
              'Sales Performance Analysis',
              'Regional Comparison',
              'Trend Analysis',
              'Customer Segmentation'
            ]
          }
        }
      },
      {
        id: 'auto-process',
        title: 'Automated Processing',
        description: 'AI runs statistical analysis and creates visualizations',
        icon: BarChart3,
        duration: 4000,
        action: 'Generated 6 insights',
        mockup: {
          type: 'processing',
          data: {
            charts: ['Revenue Trend', 'Regional Performance', 'Top Products'],
            insights: 6,
            correlations: ['Sales vs Season', 'Region vs Customer Type']
          }
        }
      },
      {
        id: 'results',
        title: 'Plain English Results',
        description: 'Get insights explained in simple, actionable language',
        icon: FileText,
        duration: 2000,
        action: 'Analysis complete!',
        mockup: {
          type: 'results',
          data: {
            insights: [
              '📈 Revenue increased 89% in Q2 driven by electronics sales',
              '🏆 Laptop Pro: highest value product at $1,299 per unit', 
              '📱 Smartphones: highest volume with 701 units sold',
              '💡 Recommendation: Bundle smartphones with accessories'
            ]
          }
        }
      }
    ]
  },
  {
    id: 'business',
    title: 'Template-Based Analysis',
    subtitle: 'Business scenarios and guided workflows',
    description: 'See how business templates streamline common analytics tasks.',
    icon: Briefcase,
    color: 'bg-blue-50 border-blue-200',
    badge: 'Most Popular',
    estimatedTime: '10-15 minutes',
    steps: [
      {
        id: 'upload',
        title: 'Data Onboarding',
        description: 'Upload your business data after signing in',
        icon: Upload,
        duration: 2000,
        action: 'Ready for upload after sign-in',
        mockup: {
          type: 'upload',
          data: { filename: 'quarterly_sales.xlsx', size: '1.8 MB', rows: 2500, columns: 8 }
        }
      },
      {
        id: 'template-select',
        title: 'Choose Template',
        description: 'Select from sales, marketing, HR, or financial templates',
        icon: Briefcase,
        duration: 3000,
        action: 'Sales Performance template selected',
        mockup: {
          type: 'templates',
          data: {
            templates: ['Sales Performance', 'Marketing ROI', 'Customer Analytics', 'Financial KPIs']
          }
        }
      },
      {
        id: 'configure',
        title: 'Configure Analysis',
        description: 'Map your data fields to template requirements',
        icon: Settings,
        duration: 2500,
        action: 'Fields mapped successfully',
        mockup: {
          type: 'technical',
          data: {
            mappings: {
              'Revenue': 'Sales Amount',
              'Period': 'Date',
              'Region': 'Territory',
              'Product': 'Item Name'
            }
          }
        }
      },
      {
        id: 'guided-analysis',
        title: 'Guided Analysis',
        description: 'Follow step-by-step business-focused analysis',
        icon: TrendingUp,
        duration: 4000,
        action: 'Generated KPI dashboard',
        mockup: {
          type: 'processing',
          data: {
            charts: ['Revenue by Quarter', 'Sales by Region', 'Top Products'],
            insights: 8,
            correlations: ['Q3 vs Q4 Performance', 'Regional Growth Patterns']
          }
        }
      },
      {
        id: 'report',
        title: 'Executive Report',
        description: 'Get presentation-ready business insights',
        icon: FileText,
        duration: 2000,
        action: 'Report generated!',
        mockup: {
          type: 'results',
          data: {
            insights: [
              '📊 Q4 sales exceeded targets by 23% ($2.1M vs $1.7M goal)',
              '🏆 West region: top performer with 35% growth year-over-year',
              '📈 Premium products: 67% of total revenue despite 18% of volume',
              '💼 Recommendation: Expand premium product line in West region'
            ]
          }
        }
      }
    ]
  },
  {
    id: 'technical',
    title: 'Self-Service Analytics',
    subtitle: 'Full control with expert AI guidance',
    description: 'Explore advanced features for technical users who want complete control.',
    icon: Settings,
    color: 'bg-green-50 border-green-200',
    badge: 'Advanced Features',
    estimatedTime: '15-30 minutes',
    steps: [
      {
        id: 'upload',
        title: 'Data Import',
        description: 'Import from multiple sources after authentication',
        icon: Database,
        duration: 2000,
        action: 'Ready for import after sign-in',
        mockup: {
          type: 'technical',
          data: {
            connection: 'PostgreSQL',
            tables: ['users', 'transactions', 'products'],
            query: 'SELECT * FROM transactions WHERE date >= "2024-01-01"'
          }
        }
      },
      {
        id: 'transform',
        title: 'Data Transformation',
        description: 'Clean, filter, and reshape data with Python tools',
        icon: Zap,
        duration: 3500,
        action: 'Applied 5 transformations',
        mockup: {
          type: 'technical',
          data: {
            transformations: [
              'df.dropna() # Remove null values',
              'df["amount"] = df["amount"].astype(float)',
              'df["date"] = pd.to_datetime(df["date"])',
              'df.groupby("category").sum()'
            ]
          }
        }
      },
      {
        id: 'custom-analysis',
        title: 'Custom Analysis',
        description: 'Choose from 20+ statistical methods and ML algorithms',
        icon: Settings,
        duration: 4000,
        action: 'Running ANOVA analysis',
        mockup: {
          type: 'technical',
          data: {
            methods: ['ANOVA', 'Regression', 'K-Means', 'Random Forest'],
            selected: 'ANOVA',
            parameters: { 'alpha': 0.05, 'method': 'tukey' }
          }
        }
      },
      {
        id: 'advanced-viz',
        title: 'Advanced Visualizations',
        description: 'Create interactive charts with full customization',
        icon: BarChart3,
        duration: 3000,
        action: 'Created heatmap visualization',
        mockup: {
          type: 'processing',
          data: {
            charts: ['Correlation Heatmap', 'Feature Importance', 'Distribution Plot'],
            insights: 12,
            correlations: ['Price vs Quality (0.78)', 'Age vs Purchase Frequency (0.42)']
          }
        }
      },
      {
        id: 'ai-insights',
        title: 'AI Expert Guidance',
        description: 'Get expert-level interpretation of your results',
        icon: Brain,
        duration: 2500,
        action: 'AI insights generated',
        mockup: {
          type: 'results',
          data: {
            insights: [
              '🔍 Strong correlation between price and quality (r=0.78, p<0.001)',
              '🎯 ANOVA reveals significant group differences (F=15.3, p<0.0001)',
              '📊 Random Forest model achieves 89% accuracy with price as top feature',
              '🧮 Statistical power: 0.95 - results are highly reliable'
            ]
          }
        }
      }
    ]
  }
];

export default function DemosPage() {
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);

  const currentDemo = selectedDemo ? JOURNEY_DEMOS.find(d => d.id === selectedDemo) : null;

  // Auto-advance demo steps
  useEffect(() => {
    if (!isPlaying || !currentDemo) return;

    const currentStepData = currentDemo.steps[currentStep];
    if (!currentStepData) return;

    const interval = setInterval(() => {
      setStepProgress(prev => {
        if (prev >= 100) {
          // Move to next step
          if (currentStep < currentDemo.steps.length - 1) {
            setCurrentStep(prev => prev + 1);
            setProgress(((currentStep + 1) / currentDemo.steps.length) * 100);
            return 0;
          } else {
            // Demo complete
            setIsPlaying(false);
            return 100;
          }
        }
        return prev + (100 / (currentStepData.duration / 50));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, currentStep, currentDemo]);

  const resetDemo = () => {
    setCurrentStep(0);
    setProgress(0);
    setStepProgress(0);
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  // Visual mockup component for different step types
  const StepMockup = ({ step }: { step: DemoStep }) => {
    if (!step.mockup) return null;

    const { type, data } = step.mockup;

    switch (type) {
      case 'upload':
        return (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border-2 border-dashed border-blue-300">
            <div className="text-center space-y-4">
              <Upload className="w-12 h-12 text-blue-500 mx-auto" />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-800">Data Upload Interface</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This is what you'll see after signing in to upload your data
                </p>
                <div className="bg-white rounded-lg p-4 text-left space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>📄 {data?.filename}</span>
                    <span className="text-green-600 font-medium">{data?.size}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Rows: {data?.rows?.toLocaleString()}</span>
                    <span>Columns: {data?.columns}</span>
                  </div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
                  <p className="text-sm text-yellow-800 mb-2">
                    🔒 Upload functionality requires authentication
                  </p>
                  <Button 
                    size="sm" 
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => window.location.href = '/auth/login'}
                  >
                    Sign In to Upload Your Data
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'analysis':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-6 h-6 text-purple-600" />
                <h3 className="text-lg font-semibold">Data Structure Analysis</h3>
                <Badge className="ml-auto bg-green-100 text-green-800">{data?.quality}% Quality</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {data?.columns?.slice(0, 5).map((col: string, idx: number) => (
                  <div key={idx} className="bg-gray-50 rounded p-3 text-sm">
                    <div className="font-medium text-gray-800">{col}</div>
                    <div className="text-gray-600 text-xs">{data?.types?.[idx]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'suggestions':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-6 h-6 text-yellow-600" />
                <h3 className="text-lg font-semibold">AI Recommendations</h3>
              </div>
              <div className="space-y-3">
                {data?.recommendations?.map((rec: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-gray-800">{rec}</div>
                      <div className="text-sm text-gray-600">Confidence: {95 - idx * 5}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'processing':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-semibold">Analysis in Progress</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Generated Charts</h4>
                  {data?.charts?.map((chart: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span>{chart}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Key Correlations</h4>
                  {data?.correlations?.map((corr: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span>{corr}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-blue-50 p-3 rounded text-center">
                <span className="text-blue-700 font-medium">✨ {data?.insights} insights discovered</span>
              </div>
            </div>
          </div>
        );

      case 'results':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-6 h-6 text-green-600" />
                <h3 className="text-lg font-semibold">Analysis Results</h3>
              </div>
              <div className="space-y-3">
                {data?.insights?.map((insight: string, idx: number) => (
                  <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-gray-800">{insight}</p>
                  </div>
                ))}
              </div>
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-lg text-center">
                <CheckCircle className="w-6 h-6 mx-auto mb-2" />
                <p className="font-semibold">Analysis Complete!</p>
              </div>
            </div>
          </div>
        );

      case 'templates':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-semibold">Business Templates</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {['Sales Performance', 'Marketing ROI', 'Customer Analytics', 'Financial KPIs'].map((template, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 cursor-pointer">
                    <div className="font-medium text-gray-800">{template}</div>
                    <div className="text-sm text-gray-600">Ready-to-use template</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'technical':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-6 h-6 text-purple-600" />
                <h3 className="text-lg font-semibold">Advanced Analytics</h3>
              </div>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
                <div>{'> Running advanced statistical analysis...'}</div>
                <div>{'> ANOVA: F-statistic = 12.45, p < 0.001'}</div>
                <div>{'> Correlation matrix calculated'}</div>
                <div>{'> Feature importance computed'}</div>
                <div className="text-yellow-400">{'> Analysis complete ✓'}</div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (selectedDemo && currentDemo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Button 
              variant="outline" 
              onClick={() => setSelectedDemo(null)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Demos
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <currentDemo.icon className="w-8 h-8 text-primary" />
                {currentDemo.title}
              </h1>
              <p className="text-gray-600 mt-1">{currentDemo.subtitle}</p>
            </div>
            <Badge variant="secondary">{currentDemo.badge}</Badge>
          </div>

          {/* Demo Player */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Live Demo</CardTitle>
                  <CardDescription>
                    Estimated time: {currentDemo.estimatedTime}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={resetDemo}
                    variant="outline" 
                    size="sm"
                    data-testid="button-reset-demo"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button 
                    onClick={togglePlayPause}
                    className="flex items-center gap-2"
                    data-testid="button-play-pause-demo"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Overall progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>

              {/* Visual step mockup display */}
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-primary/20">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      {React.createElement(currentDemo.steps[currentStep].icon, {
                        className: "w-6 h-6 text-primary"
                      })}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Step {currentStep + 1}: {currentDemo.steps[currentStep].title}
                      </h3>
                      <p className="text-gray-600">
                        {currentDemo.steps[currentStep].description}
                      </p>
                    </div>
                  </div>

                  {/* Step progress */}
                  <div className="space-y-2">
                    <Progress value={stepProgress} className="w-full" />
                    {currentDemo.steps[currentStep].action && stepProgress > 50 && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        {currentDemo.steps[currentStep].action}
                      </div>
                    )}
                  </div>
                </div>

                {/* Visual Interface Mockup */}
                <div className="bg-gray-50 rounded-lg p-6 border-2 border-dashed border-gray-300">
                  <div className="text-center mb-4">
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">
                      ✨ What you'll see in this step:
                    </h4>
                  </div>
                  <StepMockup step={currentDemo.steps[currentStep]} />
                </div>
              </div>

              {/* Step list */}
              <div className="space-y-2">
                {currentDemo.steps.map((step, index) => (
                  <div 
                    key={step.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      index === currentStep 
                        ? 'bg-primary/10 border border-primary/20' 
                        : index < currentStep 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      index < currentStep 
                        ? 'bg-green-500 text-white' 
                        : index === currentStep 
                          ? 'bg-primary text-white' 
                          : 'bg-gray-300 text-gray-600'
                    }`}>
                      {index < currentStep ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{step.title}</div>
                      <div className="text-sm text-gray-600">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Call to action */}
          <div className="text-center">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Ready to try {currentDemo.title}?
              </h3>
              <p className="text-gray-600 mb-4">
                Start your own analysis with this journey type
              </p>
              <Link href="/">
                <Button className="inline-flex items-center gap-2" data-testid="button-get-started">
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Demo selection page
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Interactive Demos
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See how each user journey works with live, interactive demonstrations. 
            Choose your path and watch the magic happen.
          </p>
        </div>

        {/* Demo cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {JOURNEY_DEMOS.map((demo) => (
            <Card 
              key={demo.id}
              className={`${demo.color} hover:shadow-xl transition-all duration-300 hover:scale-105 cursor-pointer`}
              onClick={() => setSelectedDemo(demo.id)}
              data-testid={`card-demo-${demo.id}`}
            >
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-white/80 rounded-full flex items-center justify-center mx-auto mb-4">
                  <demo.icon className="w-8 h-8 text-primary" />
                </div>
                <Badge variant="secondary" className="mb-2 w-fit mx-auto">
                  {demo.badge}
                </Badge>
                <CardTitle className="text-xl text-gray-900">
                  {demo.title}
                </CardTitle>
                <CardDescription className="text-gray-700">
                  {demo.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 text-center">
                  {demo.description}
                </p>
                
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Demo Steps ({demo.steps.length})
                  </div>
                  {demo.steps.slice(0, 3).map((step, index) => (
                    <div key={step.id} className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 bg-white/60 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium">{index + 1}</span>
                      </div>
                      <span className="text-gray-700">{step.title}</span>
                    </div>
                  ))}
                  {demo.steps.length > 3 && (
                    <div className="text-xs text-gray-500 ml-7">
                      +{demo.steps.length - 3} more steps
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/40">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Estimated time:</span>
                    <span className="font-medium text-gray-800">{demo.estimatedTime}</span>
                  </div>
                </div>

                <Button 
                  className="w-full bg-white/20 hover:bg-white/30 text-gray-800 border-white/30"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDemo(demo.id);
                  }}
                  data-testid={`button-watch-demo-${demo.id}`}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Watch Demo
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Back to home */}
        <div className="text-center">
          <Link href="/">
            <Button variant="outline" className="inline-flex items-center gap-2" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}