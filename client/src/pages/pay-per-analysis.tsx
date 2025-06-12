import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeft, 
  CheckCircle, 
  Upload, 
  Brain, 
  BarChart3, 
  Download,
  CreditCard,
  Clock,
  ArrowRight,
  Calculator,
  Database,
  Zap,
  TrendingUp,
  Settings,
  Cpu,
  Key
} from "lucide-react";
import { Link } from "wouter";

interface PayPerAnalysisProps {
  onBack: () => void;
}

export default function PayPerAnalysis({ onBack }: PayPerAnalysisProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showCalculator, setShowCalculator] = useState(false);
  
  // Price calculator state
  const [fileSize, setFileSize] = useState([1]); // MB
  const [recordCount, setRecordCount] = useState([1000]); // Number of records
  const [analysisType, setAnalysisType] = useState("basic");
  const [features, setFeatures] = useState({
    aiInsights: true,
    visualizations: false,
    predictiveAnalysis: false,
    customReports: false,
    apiAccess: false,
    prioritySupport: false
  });
  const [calculatedPrice, setCalculatedPrice] = useState(25);

  // Price calculation logic
  const calculatePrice = () => {
    let basePrice = 25;
    
    // File size multiplier
    const sizeMB = fileSize[0];
    if (sizeMB > 100) basePrice += 20;
    else if (sizeMB > 50) basePrice += 15;
    else if (sizeMB > 10) basePrice += 10;
    else if (sizeMB > 5) basePrice += 5;
    
    // Record count multiplier
    const records = recordCount[0];
    if (records > 100000) basePrice += 25;
    else if (records > 50000) basePrice += 20;
    else if (records > 10000) basePrice += 15;
    else if (records > 5000) basePrice += 10;
    else if (records > 1000) basePrice += 5;
    
    // Analysis type multiplier
    switch (analysisType) {
      case "advanced":
        basePrice *= 1.5;
        break;
      case "premium":
        basePrice *= 2.0;
        break;
      case "enterprise":
        basePrice *= 2.5;
        break;
      default: // basic
        break;
    }
    
    // Feature add-ons
    if (features.visualizations) basePrice += 15;
    if (features.predictiveAnalysis) basePrice += 25;
    if (features.customReports) basePrice += 20;
    if (features.apiAccess) basePrice += 30;
    if (features.prioritySupport) basePrice += 10;
    
    return Math.round(basePrice);
  };

  useEffect(() => {
    setCalculatedPrice(calculatePrice());
  }, [fileSize, recordCount, analysisType, features]);

  const analysisTypes = [
    {
      value: "basic",
      label: "Basic Analysis",
      description: "Standard data insights and visualizations",
      multiplier: "1x"
    },
    {
      value: "advanced", 
      label: "Advanced Analysis",
      description: "Deep statistical analysis and ML insights",
      multiplier: "1.5x"
    },
    {
      value: "premium",
      label: "Premium Analysis", 
      description: "Advanced ML models and predictive analytics",
      multiplier: "2x"
    },
    {
      value: "enterprise",
      label: "Enterprise Analysis",
      description: "Custom models and comprehensive business intelligence",
      multiplier: "2.5x"
    }
  ];

  const featureOptions = [
    {
      key: "aiInsights",
      label: "AI Insights",
      description: "Natural language insights and recommendations",
      price: "Included",
      required: true
    },
    {
      key: "visualizations",
      label: "Advanced Visualizations",
      description: "Interactive charts and custom dashboards", 
      price: "+$15"
    },
    {
      key: "predictiveAnalysis",
      label: "Predictive Analysis",
      description: "Future trend predictions and forecasting",
      price: "+$25"
    },
    {
      key: "customReports",
      label: "Custom Reports",
      description: "Branded reports with executive summaries",
      price: "+$20"
    },
    {
      key: "apiAccess",
      label: "API Access",
      description: "Programmatic access to results and data",
      price: "+$30"
    },
    {
      key: "prioritySupport",
      label: "Priority Support",
      description: "24/7 priority support and faster processing",
      price: "+$10"
    }
  ];

  const steps = [
    { id: 1, title: "Upload Data", icon: Upload },
    { id: 2, title: "Payment", icon: CreditCard },
    { id: 3, title: "Analysis", icon: Brain },
    { id: 4, title: "Results", icon: Download }
  ];

  const analysisFeatures = [
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Advanced AI algorithms analyze your data patterns and trends"
    },
    {
      icon: BarChart3,
      title: "Visual Reports",
      description: "Beautiful charts, graphs, and dashboards for easy understanding"
    },
    {
      icon: CheckCircle,
      title: "Actionable Insights",
      description: "Clear recommendations and next steps based on your data"
    },
    {
      icon: Download,
      title: "Downloadable Results",
      description: "Export your analysis in multiple formats (PDF, Excel, PNG)"
    }
  ];

  const pricingComparison = [
    { feature: "Data Upload", payper: "✓", starter: "✓", basic: "✓" },
    { feature: "AI Analysis", payper: "✓", starter: "✓", basic: "✓" },
    { feature: "Visual Reports", payper: "✓", starter: "✓", basic: "✓" },
    { feature: "Download Results", payper: "✓", starter: "✓", basic: "✓" },
    { feature: "Monthly Analyses", payper: "1 analysis", starter: "5 analyses", basic: "10 analyses" },
    { feature: "File Size Limit", payper: "50MB", starter: "10MB", basic: "15MB" },
    { feature: "Priority Support", payper: "Standard", starter: "Standard", basic: "Priority" },
    { feature: "Cost", payper: "$25 one-time", starter: "$5/month", basic: "$15/month" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={onBack}
              className="flex items-center text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center">
                <span className="text-white text-sm font-bold">$</span>
              </div>
              <span className="font-semibold text-slate-900">Pay-per-Analysis</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-4 bg-orange-100 text-orange-800 border-orange-200">
            One-Time Analysis
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Pay-per-Analysis Service
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Get comprehensive data analysis without monthly commitment. Perfect for one-time insights, 
            quick decisions, or testing our platform before subscribing.
          </p>
          
          <div className="space-y-6">
            {/* Quick Start Option */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-orange-200">
              <div className="flex items-center justify-center mb-6">
                <div className="text-6xl font-bold text-orange-600">From $25</div>
                <div className="ml-4 text-left">
                  <div className="text-lg font-semibold text-slate-900">Starting price</div>
                  <div className="text-slate-600">Calculated by complexity</div>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <div className="flex items-center text-slate-700">
                  <Clock className="w-5 h-5 text-green-600 mr-3" />
                  Results in 2-5 minutes
                </div>
                <div className="flex items-center text-slate-700">
                  <Upload className="w-5 h-5 text-blue-600 mr-3" />
                  Up to 500MB file size
                </div>
                <div className="flex items-center text-slate-700">
                  <Brain className="w-5 h-5 text-purple-600 mr-3" />
                  AI-powered insights
                </div>
                <div className="flex items-center text-slate-700">
                  <Download className="w-5 h-5 text-indigo-600 mr-3" />
                  Downloadable reports
                </div>
              </div>
              
              <div className="space-y-4">
                <Button 
                  size="lg"
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white px-8 py-4"
                  onClick={() => setCurrentStep(1)}
                >
                  Start Analysis Now (Quick)
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                
                <Button 
                  size="lg"
                  variant="outline"
                  className="w-full border-orange-200 hover:border-orange-400 hover:bg-orange-50"
                  onClick={() => setShowCalculator(!showCalculator)}
                >
                  <Calculator className="w-5 h-5 mr-2" />
                  Calculate Custom Price
                </Button>
              </div>
            </div>

            {/* Price Calculator */}
            {showCalculator && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-blue-200">
                <div className="flex items-center mb-6">
                  <Calculator className="w-6 h-6 text-blue-600 mr-3" />
                  <h3 className="text-2xl font-bold text-slate-900">Price Calculator</h3>
                </div>
                
                <div className="grid lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {/* File Size */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        File Size: {fileSize[0]} MB
                      </label>
                      <Slider
                        value={fileSize}
                        onValueChange={setFileSize}
                        max={500}
                        min={1}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>1 MB</span>
                        <span>500 MB</span>
                      </div>
                    </div>

                    {/* Record Count */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        Estimated Records: {recordCount[0].toLocaleString()}
                      </label>
                      <Slider
                        value={recordCount}
                        onValueChange={setRecordCount}
                        max={500000}
                        min={100}
                        step={100}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>100</span>
                        <span>500,000</span>
                      </div>
                    </div>

                    {/* Analysis Type */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        Analysis Type
                      </label>
                      <Select value={analysisType} onValueChange={setAnalysisType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select analysis type" />
                        </SelectTrigger>
                        <SelectContent>
                          {analysisTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              <div>
                                <div className="font-medium">{type.label} ({type.multiplier})</div>
                                <div className="text-xs text-slate-500">{type.description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Feature Add-ons */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        Feature Add-ons
                      </label>
                      <div className="space-y-3">
                        {featureOptions.map((feature) => (
                          <div key={feature.key} className="flex items-start space-x-3">
                            <Checkbox
                              id={feature.key}
                              checked={features[feature.key as keyof typeof features]}
                              onCheckedChange={(checked) => 
                                setFeatures(prev => ({ ...prev, [feature.key]: checked }))
                              }
                              disabled={feature.required}
                            />
                            <div className="flex-1">
                              <label htmlFor={feature.key} className="text-sm font-medium text-slate-900 cursor-pointer">
                                {feature.label}
                              </label>
                              <div className="text-xs text-slate-500">{feature.description}</div>
                            </div>
                            <div className="text-sm font-medium text-slate-900">
                              {feature.price}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Price Summary */}
                  <div className="bg-slate-50 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-900 mb-4">Price Breakdown</h4>
                    
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span>Base analysis</span>
                        <span>$25</span>
                      </div>
                      
                      {fileSize[0] > 5 && (
                        <div className="flex justify-between text-orange-600">
                          <span>File size ({fileSize[0]} MB)</span>
                          <span>+${fileSize[0] > 100 ? '20' : fileSize[0] > 50 ? '15' : fileSize[0] > 10 ? '10' : '5'}</span>
                        </div>
                      )}
                      
                      {recordCount[0] > 1000 && (
                        <div className="flex justify-between text-blue-600">
                          <span>Records ({recordCount[0].toLocaleString()})</span>
                          <span>+${recordCount[0] > 100000 ? '25' : recordCount[0] > 50000 ? '20' : recordCount[0] > 10000 ? '15' : recordCount[0] > 5000 ? '10' : '5'}</span>
                        </div>
                      )}
                      
                      {analysisType !== 'basic' && (
                        <div className="flex justify-between text-purple-600">
                          <span>
                            {analysisTypes.find(t => t.value === analysisType)?.label} 
                            ({analysisTypes.find(t => t.value === analysisType)?.multiplier})
                          </span>
                          <span>
                            {analysisType === 'advanced' ? '1.5x' : analysisType === 'premium' ? '2x' : '2.5x'}
                          </span>
                        </div>
                      )}
                      
                      {Object.entries(features).map(([key, enabled]) => {
                        const feature = featureOptions.find(f => f.key === key);
                        return enabled && !feature?.required ? (
                          <div key={key} className="flex justify-between text-green-600">
                            <span>{feature?.label}</span>
                            <span>{feature?.price}</span>
                          </div>
                        ) : null;
                      })}
                      
                      <div className="border-t pt-3 mt-4">
                        <div className="flex justify-between text-lg font-bold text-slate-900">
                          <span>Total Price</span>
                          <span className="text-orange-600">${calculatedPrice}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      size="lg"
                      className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white"
                      onClick={() => setCurrentStep(1)}
                    >
                      Start Analysis - ${calculatedPrice}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Simple 4-Step Process
          </h2>
          
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.id} className="text-center">
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
                  currentStep >= step.id 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  <step.icon className="w-8 h-8" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{step.title}</h3>
                <div className="text-sm text-slate-600">
                  {step.id === 1 && "Upload your CSV, Excel, or JSON file"}
                  {step.id === 2 && "Secure payment via Stripe ($25)"}
                  {step.id === 3 && "AI analyzes your data (2-5 min)"}
                  {step.id === 4 && "Download comprehensive report"}
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute transform translate-x-8 translate-y-8">
                    <ArrowRight className="w-6 h-6 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            What's Included
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {analysisFeatures.map((feature, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="w-6 h-6 text-orange-600" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Compare Options
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white rounded-lg shadow-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left p-4 font-semibold text-slate-900">Feature</th>
                  <th className="text-center p-4 font-semibold text-orange-600">Pay-per-Analysis</th>
                  <th className="text-center p-4 font-semibold text-blue-600">Starter Plan</th>
                  <th className="text-center p-4 font-semibold text-blue-600">Basic Plan</th>
                </tr>
              </thead>
              <tbody>
                {pricingComparison.map((row, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="p-4 font-medium text-slate-900">{row.feature}</td>
                    <td className="p-4 text-center text-slate-700">{row.payper}</td>
                    <td className="p-4 text-center text-slate-700">{row.starter}</td>
                    <td className="p-4 text-center text-slate-700">{row.basic}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="text-center mt-8">
            <p className="text-slate-600 mb-4">
              Need regular analysis? Consider our subscription plans for better value.
            </p>
            <Button asChild variant="outline">
              <Link href="/pricing">
                View All Plans
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-orange-600 to-red-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            Ready to Analyze Your Data?
          </h2>
          <p className="text-xl text-orange-100 mb-8">
            Get professional insights in minutes, not hours. No monthly commitment required.
          </p>
          <Button 
            size="lg"
            className="bg-white text-orange-600 hover:bg-slate-100 px-8 py-4"
          >
            Start $25 Analysis
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>
    </div>
  );
}