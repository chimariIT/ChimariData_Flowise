import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  CheckCircle, 
  Upload, 
  Brain, 
  BarChart3, 
  Download,
  CreditCard,
  Clock,
  ArrowRight
} from "lucide-react";
import { Link } from "wouter";

interface PayPerAnalysisProps {
  onBack: () => void;
}

export default function PayPerAnalysis({ onBack }: PayPerAnalysisProps) {
  const [currentStep, setCurrentStep] = useState(1);

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
          
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-orange-200">
            <div className="flex items-center justify-center mb-6">
              <div className="text-6xl font-bold text-orange-600">$25</div>
              <div className="ml-4 text-left">
                <div className="text-lg font-semibold text-slate-900">One-time payment</div>
                <div className="text-slate-600">Complete analysis included</div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <div className="flex items-center text-slate-700">
                <Clock className="w-5 h-5 text-green-600 mr-3" />
                Results in 2-5 minutes
              </div>
              <div className="flex items-center text-slate-700">
                <Upload className="w-5 h-5 text-blue-600 mr-3" />
                Up to 50MB file size
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
            
            <Button 
              size="lg"
              className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4"
              onClick={() => setCurrentStep(1)}
            >
              Start Analysis Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
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