import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DollarSign
} from "lucide-react";
import { Link } from "wouter";

// Sample data for demonstrations
const sampleDatasets = {
  sales: {
    name: "Q4_Sales_Data.csv",
    size: "2.3 MB",
    records: 15847,
    columns: ["Date", "Product", "Sales_Amount", "Region", "Customer_Segment"]
  },
  customer: {
    name: "Customer_Analytics.xlsx", 
    size: "1.8 MB",
    records: 8932,
    columns: ["Customer_ID", "Age", "Income", "Purchase_Frequency", "Lifetime_Value"]
  }
};

const analysisSteps = [
  { id: 1, title: "Data Upload", description: "Uploading and validating dataset", duration: 2000 },
  { id: 2, title: "Schema Detection", description: "Analyzing data structure and types", duration: 1500 },
  { id: 3, title: "Quality Assessment", description: "Checking for missing values and outliers", duration: 2000 },
  { id: 4, title: "Pattern Recognition", description: "Identifying trends and correlations", duration: 3000 },
  { id: 5, title: "Insight Generation", description: "AI-powered analysis and recommendations", duration: 2500 }
];

const businessInsights = {
  sales: [
    {
      type: "Revenue Opportunity",
      insight: "Northeast region shows 34% higher conversion rates but 20% lower traffic",
      recommendation: "Increase marketing spend in Northeast by $50K for projected $280K revenue gain",
      impact: "high",
      confidence: 87
    },
    {
      type: "Product Performance",
      insight: "Premium products have 67% higher margins but represent only 15% of sales volume", 
      recommendation: "Implement tiered pricing strategy and premium product upselling campaigns",
      impact: "medium",
      confidence: 92
    },
    {
      type: "Seasonal Trend",
      insight: "Q4 sales spike occurs 2 weeks earlier than industry average",
      recommendation: "Advance holiday marketing campaigns by 3 weeks to capture early demand",
      impact: "medium",
      confidence: 78
    }
  ],
  customer: [
    {
      type: "Customer Retention",
      insight: "Customers with 3+ purchases have 89% retention rate vs 23% for single purchases",
      recommendation: "Implement loyalty program targeting customers after 2nd purchase",
      impact: "high", 
      confidence: 94
    },
    {
      type: "Revenue Optimization",
      insight: "High-income customers (>$75K) purchase 3.2x more frequently but represent only 28% of base",
      recommendation: "Create premium customer acquisition campaign targeting high-income demographics",
      impact: "high",
      confidence: 91
    },
    {
      type: "Churn Prevention",
      insight: "Purchase frequency drops 67% after 45-day inactivity period",
      recommendation: "Deploy automated re-engagement campaign at 30-day mark",
      impact: "medium",
      confidence: 83
    }
  ]
};

export default function DemoPage() {
  const [activeDemo, setActiveDemo] = useState<"data-to-insights" | "ai-recommendations" | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<"sales" | "customer">("sales");
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (activeDemo && currentStep < analysisSteps.length && !isComplete) {
      const currentStepData = analysisSteps[currentStep];
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
              if (nextStep >= analysisSteps.length) {
                setIsComplete(true);
                if (activeDemo === "ai-recommendations") {
                  setTimeout(() => setShowInsights(true), 500);
                }
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
    setShowInsights(false);
  };

  const startDemo = (type: "data-to-insights" | "ai-recommendations") => {
    resetDemo();
    setActiveDemo(type);
  };

  const getInsightBadgeColor = (impact: string) => {
    switch(impact) {
      case "high": return "bg-red-100 text-red-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "low": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getInsightIcon = (type: string) => {
    switch(type) {
      case "Revenue Opportunity": return <DollarSign className="w-4 h-4" />;
      case "Customer Retention": return <Target className="w-4 h-4" />;
      case "Revenue Optimization": return <TrendingUp className="w-4 h-4" />;
      default: return <Lightbulb className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BarChart3 className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">ChimariData+AI</h1>
                <p className="text-sm text-slate-600">Interactive Demo</p>
              </div>
            </div>
            <Link href="/">
              <Button variant="outline" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {!activeDemo ? (
          <>
            {/* Demo Selection */}
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-slate-900 mb-4">
                Experience the Power of AI-Driven Analytics
              </h2>
              <p className="text-xl text-slate-600 max-w-3xl mx-auto">
                See how ChimariData+AI transforms raw data into actionable business intelligence in minutes, not hours.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* Demo 1: Data to Insights */}
              <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/50">
                <CardHeader className="pb-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Clock className="w-6 h-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-xl">From Data to Insights in Minutes</CardTitle>
                  </div>
                  <CardDescription className="text-base">
                    Watch how our platform processes uploaded data and generates comprehensive analytics in under 2 minutes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 mb-2">Demo Highlights:</h4>
                    <ul className="space-y-1 text-sm text-slate-600">
                      <li>• Automated data validation and cleaning</li>
                      <li>• Real-time pattern recognition</li>
                      <li>• Interactive visualization generation</li>
                      <li>• Statistical analysis and correlations</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={() => startDemo("data-to-insights")} 
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Start Demo
                  </Button>
                </CardContent>
              </Card>

              {/* Demo 2: AI Business Insights */}
              <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/50">
                <CardHeader className="pb-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Brain className="w-6 h-6 text-purple-600" />
                    </div>
                    <CardTitle className="text-xl">AI-Driven Business Insights</CardTitle>
                  </div>
                  <CardDescription className="text-base">
                    Discover how our AI analyzes your data patterns to generate actionable business recommendations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 mb-2">Demo Highlights:</h4>
                    <ul className="space-y-1 text-sm text-slate-600">
                      <li>• Revenue optimization opportunities</li>
                      <li>• Customer behavior predictions</li>
                      <li>• Market trend analysis</li>
                      <li>• Actionable business recommendations</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={() => startDemo("ai-recommendations")} 
                    className="w-full flex items-center justify-center gap-2"
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
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">
                    {activeDemo === "data-to-insights" ? "Data Processing Demo" : "AI Business Insights Demo"}
                  </h2>
                  <p className="text-slate-600">
                    {activeDemo === "data-to-insights" 
                      ? "Real-time data analysis and visualization generation"
                      : "AI-powered business intelligence and recommendations"
                    }
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetDemo} className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                  <Button variant="outline" onClick={() => setActiveDemo(null)}>
                    Back to Selection
                  </Button>
                </div>
              </div>

              {/* Dataset Selection for AI Demo */}
              {activeDemo === "ai-recommendations" && !isComplete && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg">Select Dataset for Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {Object.entries(sampleDatasets).map(([key, dataset]) => (
                        <div 
                          key={key}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            selectedDataset === key ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => setSelectedDataset(key as "sales" | "customer")}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold">{dataset.name}</h4>
                            <Badge variant="secondary">{dataset.size}</Badge>
                          </div>
                          <p className="text-sm text-slate-600 mb-2">{dataset.records.toLocaleString()} records</p>
                          <div className="flex flex-wrap gap-1">
                            {dataset.columns.slice(0, 3).map(col => (
                              <Badge key={col} variant="outline" className="text-xs">{col}</Badge>
                            ))}
                            {dataset.columns.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{dataset.columns.length - 3} more</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Processing Steps */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Processing Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysisSteps.map((step, index) => (
                      <div key={step.id} className="flex items-center space-x-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          index < currentStep ? 'bg-green-500 text-white' :
                          index === currentStep ? 'bg-primary text-white' :
                          'bg-slate-200 text-slate-500'
                        }`}>
                          {index < currentStep ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <span className="text-sm font-medium">{step.id}</span>
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
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Results */}
              {isComplete && (
                <Card className="border-green-200 bg-green-50/50">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <CardTitle className="text-green-900">
                        {activeDemo === "data-to-insights" ? "Analysis Complete!" : "AI Insights Generated!"}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activeDemo === "data-to-insights" ? (
                      <div className="space-y-4">
                        <p className="text-green-800">
                          Your data has been successfully processed and analyzed. In a real scenario, you would now see:
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold mb-2">Generated Visualizations</h4>
                            <ul className="text-sm space-y-1">
                              <li>• Interactive charts and graphs</li>
                              <li>• Correlation matrices</li>
                              <li>• Trend analysis plots</li>
                              <li>• Distribution histograms</li>
                            </ul>
                          </div>
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold mb-2">Statistical Insights</h4>
                            <ul className="text-sm space-y-1">
                              <li>• Data quality assessment</li>
                              <li>• Key performance metrics</li>
                              <li>• Outlier detection</li>
                              <li>• Pattern recognition results</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-green-800 mb-4">
                          AI analysis complete! Here are the key insights and recommendations for your {selectedDataset} data:
                        </p>
                        
                        {showInsights && (
                          <div className="space-y-4">
                            {businessInsights[selectedDataset].map((insight, index) => (
                              <div 
                                key={index} 
                                className="bg-white rounded-lg p-4 border-l-4 border-primary animate-in slide-in-from-left duration-500"
                                style={{ animationDelay: `${index * 200}ms` }}
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    {getInsightIcon(insight.type)}
                                    <h4 className="font-semibold text-slate-900">{insight.type}</h4>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className={getInsightBadgeColor(insight.impact)}>
                                      {insight.impact.toUpperCase()} IMPACT
                                    </Badge>
                                    <Badge variant="outline">
                                      {insight.confidence}% confidence
                                    </Badge>
                                  </div>
                                </div>
                                
                                <div className="space-y-3">
                                  <div>
                                    <h5 className="font-medium text-slate-700 mb-1">Insight:</h5>
                                    <p className="text-slate-600">{insight.insight}</p>
                                  </div>
                                  
                                  <div>
                                    <h5 className="font-medium text-slate-700 mb-1">Recommendation:</h5>
                                    <p className="text-slate-600">{insight.recommendation}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="mt-6 pt-4 border-t">
                      <p className="text-center text-slate-600 mb-4">
                        Ready to analyze your own data?
                      </p>
                      <div className="flex justify-center gap-4">
                        <Link href="/auth">
                          <Button className="flex items-center gap-2">
                            Get Started Now
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
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