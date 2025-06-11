import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  Upload, 
  Brain, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  ArrowRight,
  Play,
  RotateCcw,
  Home,
  Lightbulb,
  Target,
  DollarSign,
  FileSpreadsheet,
  Zap,
  Eye
} from "lucide-react";

interface AnimatedDemoProps {
  onGetStarted: () => void;
}

const steps = {
  dataToInsights: [
    { 
      id: 1, 
      title: "File Upload", 
      description: "Uploading sales_data.csv (2.3MB, 15,847 records)",
      duration: 2000,
      icon: Upload,
      color: "bg-blue-500"
    },
    { 
      id: 2, 
      title: "Data Validation", 
      description: "Checking data quality and detecting column types",
      duration: 1500,
      icon: CheckCircle,
      color: "bg-green-500"
    },
    { 
      id: 3, 
      title: "Schema Analysis", 
      description: "Mapping relationships and identifying key metrics",
      duration: 2000,
      icon: FileSpreadsheet,
      color: "bg-purple-500"
    },
    { 
      id: 4, 
      title: "Visualization Generation", 
      description: "Creating interactive charts and dashboards",
      duration: 2500,
      icon: BarChart3,
      color: "bg-indigo-500"
    },
    { 
      id: 5, 
      title: "Insights Ready", 
      description: "Analysis complete - interactive dashboard available",
      duration: 1000,
      icon: Eye,
      color: "bg-emerald-500"
    }
  ],
  aiRecommendations: [
    { 
      id: 1, 
      title: "Data Ingestion", 
      description: "Processing customer behavior dataset",
      duration: 1800,
      icon: Upload,
      color: "bg-blue-500"
    },
    { 
      id: 2, 
      title: "Pattern Recognition", 
      description: "AI analyzing customer purchase patterns",
      duration: 2200,
      icon: Brain,
      color: "bg-purple-500"
    },
    { 
      id: 3, 
      title: "Predictive Modeling", 
      description: "Building revenue optimization models",
      duration: 2800,
      icon: TrendingUp,
      color: "bg-orange-500"
    },
    { 
      id: 4, 
      title: "Insight Generation", 
      description: "Generating actionable business recommendations",
      duration: 2000,
      icon: Lightbulb,
      color: "bg-yellow-500"
    },
    { 
      id: 5, 
      title: "Recommendations Ready", 
      description: "AI insights and strategies generated",
      duration: 1000,
      icon: Target,
      color: "bg-green-500"
    }
  ]
};

const insights = {
  dataToInsights: [
    "📊 Revenue by region: Northeast leads with $2.4M (32% of total)",
    "📈 Sales trend: 23% month-over-month growth in Q4",
    "🎯 Top products: Premium line drives 67% of profit margin",
    "⏰ Peak hours: 2-4 PM generates 41% of daily sales"
  ],
  aiRecommendations: [
    {
      type: "Revenue Opportunity",
      insight: "Customers making 3+ purchases have 89% retention vs 23% for single purchases",
      recommendation: "Deploy loyalty program targeting customers after 2nd purchase",
      impact: "Projected +$340K annual revenue",
      confidence: 94
    },
    {
      type: "Market Expansion", 
      insight: "High-income segment (>$75K) shows 3.2x purchase frequency but represents only 28% of customer base",
      recommendation: "Launch premium acquisition campaign targeting affluent demographics",
      impact: "Potential 45% revenue increase",
      confidence: 87
    },
    {
      type: "Churn Prevention",
      insight: "Purchase frequency drops 67% after 45-day inactivity period",
      recommendation: "Implement automated re-engagement sequence at 30-day mark",
      impact: "Reduce churn by 35%",
      confidence: 91
    }
  ]
};

export default function AnimatedDemo({ onGetStarted }: AnimatedDemoProps) {
  const [activeDemo, setActiveDemo] = useState<"dataToInsights" | "aiRecommendations" | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (activeDemo && currentStep < steps[activeDemo].length && !isComplete) {
      const currentStepData = steps[activeDemo][currentStep];
      const stepDuration = currentStepData.duration;
      const incrementInterval = 50;
      const totalIncrements = stepDuration / incrementInterval;
      const progressIncrement = 100 / totalIncrements;
      
      interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + progressIncrement;
          if (newProgress >= 100) {
            setCurrentStep(prevStep => {
              const nextStep = prevStep + 1;
              if (nextStep >= steps[activeDemo].length) {
                setIsComplete(true);
                setTimeout(() => setShowResults(true), 500);
              }
              return nextStep;
            });
            return 0;
          }
          return newProgress;
        });
      }, incrementInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeDemo, currentStep, isComplete]);

  const resetDemo = () => {
    setCurrentStep(0);
    setProgress(0);
    setIsComplete(false);
    setShowResults(false);
  };

  const startDemo = (type: "dataToInsights" | "aiRecommendations") => {
    resetDemo();
    setActiveDemo(type);
  };

  const DataVisualization = () => (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-6 rounded-lg">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white p-3 rounded shadow">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-600">Monthly Sales</span>
            <span className="text-xs text-green-600">+23%</span>
          </div>
          <div className="flex items-end space-x-1 h-12">
            {[40, 55, 35, 70, 85, 60, 95].map((height, i) => (
              <div 
                key={i} 
                className="bg-blue-500 rounded-sm animate-pulse"
                style={{ 
                  height: `${height}%`, 
                  width: '12px',
                  animationDelay: `${i * 0.2}s`
                }}
              />
            ))}
          </div>
        </div>
        <div className="bg-white p-3 rounded shadow">
          <div className="text-xs text-gray-600 mb-2">Revenue by Region</div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Northeast</span>
              <span className="font-semibold text-blue-600">$2.4M</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>West</span>
              <span className="font-semibold">$1.8M</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>South</span>
              <span className="font-semibold">$1.2M</span>
            </div>
          </div>
        </div>
      </div>
      {showResults && (
        <div className="space-y-2 animate-in fade-in duration-1000">
          {insights.dataToInsights.map((insight, i) => (
            <div 
              key={i} 
              className="bg-white/80 backdrop-blur p-2 rounded text-xs animate-in slide-in-from-left duration-500"
              style={{ animationDelay: `${i * 200}ms` }}
            >
              {insight}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const AIRecommendations = () => (
    <div className="space-y-4">
      {showResults && insights.aiRecommendations.map((rec, i) => (
        <div 
          key={i}
          className="bg-white p-4 rounded-lg border-l-4 border-purple-500 shadow-sm animate-in slide-in-from-right duration-700"
          style={{ animationDelay: `${i * 300}ms` }}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-purple-600" />
              <h4 className="font-semibold text-sm">{rec.type}</h4>
            </div>
            <Badge variant="outline" className="text-xs">
              {rec.confidence}% confidence
            </Badge>
          </div>
          <p className="text-xs text-gray-600 mb-2">{rec.insight}</p>
          <div className="bg-purple-50 p-2 rounded text-xs">
            <strong>Recommendation:</strong> {rec.recommendation}
          </div>
          <div className="mt-2 text-xs text-green-700 font-medium">
            💰 {rec.impact}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BarChart3 className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">DataInsight Pro</h1>
                <p className="text-sm text-slate-600">Interactive Demo</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = "/"}
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {!activeDemo ? (
          <>
            {/* Demo Selection */}
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-slate-900 mb-4">
                See DataInsight Pro in Action
              </h2>
              <p className="text-xl text-slate-600 max-w-3xl mx-auto">
                Choose a demo to see how we transform data into actionable insights
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* Demo 1: Data to Insights */}
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-blue-500">
                <CardHeader className="pb-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="p-3 bg-blue-100 rounded-xl">
                      <Clock className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Data to Insights in Minutes</CardTitle>
                      <p className="text-sm text-slate-500">~3 minute demo</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-slate-600">
                    Watch a complete workflow from file upload to interactive visualizations
                  </p>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 mb-2">Demo Includes:</h4>
                    <ul className="space-y-1 text-sm text-slate-600">
                      <li>• Real-time data processing</li>
                      <li>• Automatic chart generation</li>
                      <li>• Key insights extraction</li>
                      <li>• Interactive dashboard</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={() => startDemo("dataToInsights")} 
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <Play className="w-4 h-4" />
                    Start Demo
                  </Button>
                </CardContent>
              </Card>

              {/* Demo 2: AI Business Insights */}
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-purple-500">
                <CardHeader className="pb-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="p-3 bg-purple-100 rounded-xl">
                      <Brain className="w-8 h-8 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">AI Business Recommendations</CardTitle>
                      <p className="text-sm text-slate-500">~4 minute demo</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-slate-600">
                    See how AI analyzes patterns to generate actionable business strategies
                  </p>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 mb-2">Demo Includes:</h4>
                    <ul className="space-y-1 text-sm text-slate-600">
                      <li>• AI pattern recognition</li>
                      <li>• Revenue optimization</li>
                      <li>• Customer behavior analysis</li>
                      <li>• Strategic recommendations</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={() => startDemo("aiRecommendations")} 
                    className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    <Play className="w-4 h-4" />
                    Start Demo
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <>
            {/* Active Demo */}
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">
                    {activeDemo === "dataToInsights" ? "Data Processing Demo" : "AI Insights Demo"}
                  </h2>
                  <p className="text-slate-600">
                    {activeDemo === "dataToInsights" 
                      ? "Real-time data analysis and visualization"
                      : "AI-powered business intelligence generation"
                    }
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetDemo} className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                  <Button variant="outline" onClick={() => setActiveDemo(null)}>
                    Choose Different Demo
                  </Button>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Processing Steps */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      Processing Pipeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {steps[activeDemo].map((step, index) => {
                        const Icon = step.icon;
                        return (
                          <div key={step.id} className="flex items-center space-x-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              index < currentStep ? 'bg-green-500 text-white' :
                              index === currentStep ? `${step.color} text-white` :
                              'bg-slate-200 text-slate-500'
                            }`}>
                              {index < currentStep ? (
                                <CheckCircle className="w-5 h-5" />
                              ) : (
                                <Icon className="w-5 h-5" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className={`font-medium ${
                                  index <= currentStep ? 'text-slate-900' : 'text-slate-500'
                                }`}>
                                  {step.title}
                                </h4>
                                {index === currentStep && (
                                  <span className="text-sm text-slate-500">
                                    {Math.round(progress)}%
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm ${
                                index <= currentStep ? 'text-slate-600' : 'text-slate-400'
                              }`}>
                                {step.description}
                              </p>
                              {index === currentStep && (
                                <Progress value={progress} className="mt-2 h-2" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Results Visualization */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      {activeDemo === "dataToInsights" ? "Live Dashboard" : "AI Recommendations"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activeDemo === "dataToInsights" ? <DataVisualization /> : <AIRecommendations />}
                  </CardContent>
                </Card>
              </div>

              {/* Completion Message */}
              {isComplete && (
                <Card className="mt-8 border-green-200 bg-green-50/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-green-900 mb-2">
                        {activeDemo === "dataToInsights" ? "Analysis Complete!" : "AI Insights Generated!"}
                      </h3>
                      <p className="text-green-800 mb-6">
                        {activeDemo === "dataToInsights" 
                          ? "Your dashboard is ready with interactive visualizations and key insights"
                          : "Strategic recommendations have been generated based on your data patterns"
                        }
                      </p>
                      <div className="flex justify-center gap-4">
                        <Button onClick={onGetStarted} className="flex items-center gap-2">
                          Get Started Now
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" onClick={() => setActiveDemo(null)}>
                          Try Another Demo
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}