import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  Brain, 
  Upload, 
  MessageSquare, 
  TrendingUp, 
  Users, 
  CheckCircle,
  ArrowRight,
  Sparkles,
  Database,
  Zap,
  Shield
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
  onPayPerAnalysis: () => void;
  onExpertConsultation: () => void;
}

export default function LandingPage({ onGetStarted, onPayPerAnalysis, onExpertConsultation }: LandingPageProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [currentRecommendation, setCurrentRecommendation] = useState(0);

  // Navigation scroll handlers
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const dataScenarios = [
    {
      title: "E-commerce Sales Data",
      description: "Customer purchase patterns and product performance",
      insights: [
        "📈 Revenue increased 89% in Q2 driven by electronics sales",
        "🏆 Laptop Pro: highest value product at $1,299 per unit", 
        "📱 Smartphones: highest volume with 701 units sold",
        "💡 Recommendation: Bundle smartphones with accessories to increase AOV"
      ]
    },
    {
      title: "Marketing Campaign Data", 
      description: "Multi-channel campaign performance metrics",
      insights: [
        "🎯 Email campaigns show 34% higher conversion than social media",
        "📧 Newsletter subscribers have 2.3x higher lifetime value",
        "📊 Mobile traffic accounts for 67% of all conversions",
        "💡 Recommendation: Increase email marketing budget by 40%"
      ]
    },
    {
      title: "Customer Behavior Data",
      description: "User engagement and retention patterns", 
      insights: [
        "👥 Users who engage in first 7 days have 85% retention",
        "🔄 Feature adoption peaks on day 3 after onboarding",
        "📱 Mobile users are 2.1x more likely to become premium",
        "💡 Recommendation: Optimize mobile onboarding experience"
      ]
    }
  ];

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handlePreviewClick = () => {
    setShowPreview(true);
    setCurrentRecommendation(0);
  };

  const nextRecommendation = () => {
    setCurrentRecommendation((prev) => (prev + 1) % dataScenarios.length);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className={`bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 transition-all duration-500 ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center transform hover:scale-110 transition-transform duration-200">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">ChimariData</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => scrollToSection('features')}
                className="hover:scale-105 transition-transform duration-200"
              >
                Features
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => scrollToSection('pricing')}
                className="hover:scale-105 transition-transform duration-200"
              >
                Pricing
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => scrollToSection('demo')}
                className="hover:scale-105 transition-transform duration-200"
              >
                Demo
              </Button>
              <Button 
                variant="ghost" 
                onClick={onGetStarted}
                className="hover:scale-105 transition-transform duration-200"
              >
                Sign In
              </Button>
              <Button 
                onClick={onGetStarted} 
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 transition-all duration-200 hover:shadow-lg"
              >
                Get Started Free
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-10 w-20 h-20 bg-blue-200/30 rounded-full animate-pulse"></div>
          <div className="absolute top-40 right-20 w-16 h-16 bg-indigo-200/30 rounded-full animate-bounce" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-purple-200/30 rounded-full animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>
        
        <div className={`max-w-6xl mx-auto text-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <Badge className={`mb-6 bg-blue-100 text-blue-700 border-blue-200 transition-all duration-700 hover:scale-105 ${isVisible ? 'animate-bounce' : ''}`}>
            <Sparkles className="w-4 h-4 mr-1 animate-spin" style={{animationDuration: '3s'}} />
            AI-Powered Data Analytics
          </Badge>
          
          <h1 className={`text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            You don't have to be a{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 animate-pulse">
              data expert
            </span>
            {" "}to have cutting edge insights
          </h1>
          
          <p className={`text-xl text-slate-600 mb-8 max-w-3xl mx-auto leading-relaxed transition-all duration-1000 delay-400 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            Upload your data and ask questions in plain English. Our AI transforms complex datasets 
            into actionable insights instantly—no technical skills required.
          </p>
          
          <div className={`flex flex-col sm:flex-row gap-4 justify-center mb-12 transition-all duration-1000 delay-600 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-lg px-8 py-6 hover:scale-105 transition-all duration-200 hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 border-2 border-transparent hover:border-blue-300"
            >
              Start Analyzing Free
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-8 py-6 hover:scale-105 transition-all duration-200 hover:shadow-lg"
            >
              Watch 2-min Demo
            </Button>
          </div>

          <div className={`text-sm text-slate-500 transition-all duration-1000 delay-800 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="flex items-center justify-center space-x-6 flex-wrap">
              <span className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>50 free AI queries</span>
              </span>
              <span className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                <span>No setup required</span>
              </span>
              <span className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
                <span>Your data stays secure</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* AI Recommendation Engine Preview */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              AI-Powered Data Recommendation Engine
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              See how our AI analyzes real data patterns and provides actionable business recommendations instantly
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {!showPreview ? (
              <div className="space-y-6">
                <Card className="border-2 border-dashed border-blue-200 bg-blue-50/50">
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Brain className="w-8 h-8 text-blue-600" />
                    </div>
                    <CardTitle className="text-blue-900">Ready to See AI in Action?</CardTitle>
                    <CardDescription className="text-blue-700">
                      Click below to see how our AI analyzes sample business data and generates intelligent recommendations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <Button 
                      onClick={handlePreviewClick}
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4"
                    >
                      <Sparkles className="w-5 h-5 mr-2" />
                      Preview AI Recommendations
                    </Button>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Sample Data Types:</h3>
                  {dataScenarios.map((scenario, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <div>
                        <div className="font-medium text-slate-900">{scenario.title}</div>
                        <div className="text-sm text-slate-600">{scenario.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center">
                        <Brain className="w-5 h-5 text-blue-600 mr-2" />
                        {dataScenarios[currentRecommendation].title}
                      </CardTitle>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Live Analysis
                      </Badge>
                    </div>
                    <CardDescription>
                      {dataScenarios[currentRecommendation].description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {dataScenarios[currentRecommendation].insights.map((insight, index) => (
                        <div key={index} className="flex items-start space-x-3 p-3 bg-slate-50 rounded-lg">
                          <span className="text-lg">{insight.split(' ')[0]}</span>
                          <span className="text-slate-700 text-sm leading-relaxed">
                            {insight.substring(insight.indexOf(' ') + 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex justify-between items-center mt-6 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        onClick={nextRecommendation}
                        className="flex items-center"
                      >
                        <ArrowRight className="w-4 h-4 mr-1" />
                        Next Scenario
                      </Button>
                      <div className="text-sm text-slate-500">
                        {currentRecommendation + 1} of {dataScenarios.length}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-green-50 to-blue-50 border-green-200">
                <CardHeader>
                  <CardTitle className="flex items-center text-green-800">
                    <TrendingUp className="w-5 h-5 mr-2" />
                    Why Our AI Recommendations Work
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-green-800">Pattern Recognition</div>
                      <div className="text-sm text-green-700">Identifies trends humans miss in complex datasets</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-green-800">Contextual Analysis</div>
                      <div className="text-sm text-green-700">Considers business context, not just raw numbers</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-green-800">Actionable Insights</div>
                      <div className="text-sm text-green-700">Provides specific, implementable recommendations</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="text-center">
                <Button 
                  onClick={onGetStarted}
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg transition-all duration-200"
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Analyze Your Data Now
                </Button>
                <p className="text-sm text-slate-500 mt-2">
                  Upload your data and get AI recommendations in minutes
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-center mb-12">
            <h2 className={`text-3xl font-bold text-slate-900 mb-4 transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
              From Data to Insights in 3 Simple Steps
            </h2>
            <p className={`text-lg text-slate-600 transition-all duration-700 delay-200 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
              No technical expertise required. Get started in under 5 minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className={`text-center group hover:shadow-xl transition-all duration-500 hover:-translate-y-2 animate-float ${isVisible ? 'animate-slideInLeft' : ''}`} style={{animationDelay: '0.4s'}}>
              <CardHeader>
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:animate-bounce group-hover:bg-blue-200 transition-colors duration-300">
                  <Upload className="w-8 h-8 text-blue-600 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <CardTitle className="group-hover:text-blue-600 transition-colors duration-300">1. Upload Your Data</CardTitle>
                <CardDescription>
                  Drop in your CSV, Excel, or JSON files. We handle the rest automatically.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className={`text-center group hover:shadow-xl transition-all duration-500 hover:-translate-y-2 animate-float ${isVisible ? 'animate-fadeIn' : ''}`} style={{animationDelay: '0.6s'}}>
              <CardHeader>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:animate-bounce group-hover:bg-green-200 transition-colors duration-300">
                  <MessageSquare className="w-8 h-8 text-green-600 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <CardTitle className="group-hover:text-green-600 transition-colors duration-300">2. Ask Questions</CardTitle>
                <CardDescription>
                  Type questions in plain English. Our AI understands what you want to know.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className={`text-center group hover:shadow-xl transition-all duration-500 hover:-translate-y-2 animate-float ${isVisible ? 'animate-slideInRight' : ''}`} style={{animationDelay: '0.8s'}}>
              <CardHeader>
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:animate-bounce group-hover:bg-purple-200 transition-colors duration-300">
                  <TrendingUp className="w-8 h-8 text-purple-600 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <CardTitle className="group-hover:text-purple-600 transition-colors duration-300">3. Get Insights</CardTitle>
                <CardDescription>
                  Receive detailed analysis, trends, and actionable recommendations instantly.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-center mb-12">
            <h2 className={`text-3xl font-bold text-slate-900 mb-4 transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
              Powerful Features, Simple Experience
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className={`flex items-start space-x-4 group hover:scale-105 transition-all duration-300 cursor-pointer ${isVisible ? 'animate-fadeIn' : ''}`} style={{animationDelay: '0.1s'}}>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:animate-bounce group-hover:bg-blue-200 transition-colors duration-300">
                <Brain className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors duration-300">AI-Powered Analysis</h3>
                <p className="text-slate-600">Advanced AI understands your data and provides human-like insights.</p>
              </div>
            </div>

            <div className={`flex items-start space-x-4 group hover:scale-105 transition-all duration-300 cursor-pointer ${isVisible ? 'animate-fadeIn' : ''}`} style={{animationDelay: '0.2s'}}>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:animate-bounce group-hover:bg-green-200 transition-colors duration-300">
                <Zap className="w-5 h-5 text-green-600 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-green-600 transition-colors duration-300">Instant Results</h3>
                <p className="text-slate-600">Get answers in seconds, not hours. No waiting for reports.</p>
              </div>
            </div>

            <div className={`flex items-start space-x-4 group hover:scale-105 transition-all duration-300 cursor-pointer ${isVisible ? 'animate-fadeIn' : ''}`} style={{animationDelay: '0.3s'}}>
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:animate-bounce group-hover:bg-purple-200 transition-colors duration-300">
                <Database className="w-5 h-5 text-purple-600 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-purple-600 transition-colors duration-300">Any Data Format</h3>
                <p className="text-slate-600">Support for CSV, Excel, JSON, and more data sources.</p>
              </div>
            </div>

            <div className={`flex items-start space-x-4 group hover:scale-105 transition-all duration-300 cursor-pointer ${isVisible ? 'animate-fadeIn' : ''}`} style={{animationDelay: '0.4s'}}>
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:animate-bounce group-hover:bg-orange-200 transition-colors duration-300">
                <Shield className="w-5 h-5 text-orange-600 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-orange-600 transition-colors duration-300">Enterprise Security</h3>
                <p className="text-slate-600">Your data is encrypted and never shared. Complete privacy guaranteed.</p>
              </div>
            </div>

            <div className={`flex items-start space-x-4 group hover:scale-105 transition-all duration-300 cursor-pointer ${isVisible ? 'animate-fadeIn' : ''}`} style={{animationDelay: '0.5s'}}>
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:animate-bounce group-hover:bg-indigo-200 transition-colors duration-300">
                <Users className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors duration-300">Team Collaboration</h3>
                <p className="text-slate-600">Share insights and collaborate with your team seamlessly.</p>
              </div>
            </div>

            <div className={`flex items-start space-x-4 group hover:scale-105 transition-all duration-300 cursor-pointer ${isVisible ? 'animate-fadeIn' : ''}`} style={{animationDelay: '0.6s'}}>
              <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:animate-bounce group-hover:bg-pink-200 transition-colors duration-300">
                <BarChart3 className="w-5 h-5 text-pink-600 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-pink-600 transition-colors duration-300">Visual Dashboards</h3>
                <p className="text-slate-600">Beautiful charts and graphs that make data easy to understand.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Founders Experience */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
                <Brain className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-slate-900 mb-6">
              Our Founders have been doing Data, AI and Insights for over 20 Years
            </h2>
            
            <p className="text-lg text-slate-700 mb-8 max-w-2xl mx-auto leading-relaxed">
              Built by seasoned data professionals who understand the challenges of extracting meaningful insights from complex datasets. We've spent decades solving these problems and built ChimariData to democratize advanced analytics.
            </p>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="flex flex-col items-center p-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                  <Database className="w-6 h-6 text-blue-600" />
                </div>
                <div className="font-semibold text-slate-900 mb-1">Enterprise Data</div>
                <div className="text-sm text-slate-600">Fortune 500 analytics experience</div>
              </div>
              
              <div className="flex flex-col items-center p-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-3">
                  <Brain className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="font-semibold text-slate-900 mb-1">AI Research</div>
                <div className="text-sm text-slate-600">Published machine learning experts</div>
              </div>
              
              <div className="flex flex-col items-center p-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <div className="font-semibold text-slate-900 mb-1">Business Impact</div>
                <div className="text-sm text-slate-600">Proven ROI in data-driven decisions</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              See ChimariData in Action
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Watch how our platform transforms complex data into actionable insights in under 2 minutes
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Upload Your Dataset</h3>
                    <p className="text-slate-600 text-sm">Drop a CSV or Excel file - we automatically detect headers and data types</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-lg border border-green-100">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-green-600 font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Ask Natural Language Questions</h3>
                    <p className="text-slate-600 text-sm">"What are the top revenue drivers?" or "Show me seasonal trends"</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-lg border border-purple-100">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Get Instant AI Insights</h3>
                    <p className="text-slate-600 text-sm">Detailed analysis with visualizations and actionable recommendations</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={onGetStarted}
                  size="lg"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 transition-all duration-200"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Try Live Demo Now
                </Button>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={onPayPerAnalysis}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    Pay-Per-Analysis
                  </Button>
                  <Button 
                    onClick={onExpertConsultation}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    Expert Consultation
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
              <div className="mb-6">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-slate-500 ml-4">ChimariData Analytics</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border">
                  <div className="text-xs text-slate-500 mb-2">Dataset: sales_data.csv (505 records)</div>
                  <div className="text-sm text-slate-700 mb-3">
                    <strong>Question:</strong> "What are the key factors driving our revenue growth?"
                  </div>
                  <div className="space-y-2">
                    <div className="bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                      <div className="text-sm text-blue-800">
                        <strong>Key Finding:</strong> Revenue increased 89% in Q2, primarily driven by electronics category
                      </div>
                    </div>
                    <div className="bg-green-50 p-3 rounded border-l-4 border-green-400">
                      <div className="text-sm text-green-800">
                        <strong>Recommendation:</strong> Focus marketing budget on electronics segment for Q3
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900 mb-1">2 minutes</div>
                <div className="text-sm text-slate-600">From upload to insights</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Choose the plan that fits your data analysis needs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Plan */}
            <Card className="border-2 border-slate-200 hover:border-blue-300 transition-all duration-300">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-slate-900">Free</CardTitle>
                <div className="text-4xl font-bold text-slate-900 my-4">$0</div>
                <CardDescription>Perfect for getting started</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">50 AI queries per month</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Up to 10MB file uploads</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Basic visualizations</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Community support</span>
                  </div>
                </div>
                <Button 
                  onClick={onGetStarted}
                  className="w-full"
                  variant="outline"
                >
                  Get Started Free
                </Button>
              </CardContent>
            </Card>

            {/* Pro Plan */}
            <Card className="border-2 border-blue-500 relative hover:shadow-xl transition-all duration-300">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-600 text-white px-4 py-1">Most Popular</Badge>
              </div>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-slate-900">Pro</CardTitle>
                <div className="text-4xl font-bold text-slate-900 my-4">$29<span className="text-lg text-slate-600">/month</span></div>
                <CardDescription>For professional data analysts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">1,000 AI queries per month</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Up to 100MB file uploads</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Advanced ML analysis</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Priority support</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">API access</span>
                  </div>
                </div>
                <Button 
                  onClick={onGetStarted}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Start Pro Trial
                </Button>
              </CardContent>
            </Card>

            {/* Enterprise Plan */}
            <Card className="border-2 border-slate-200 hover:border-purple-300 transition-all duration-300">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-slate-900">Enterprise</CardTitle>
                <div className="text-4xl font-bold text-slate-900 my-4">Custom</div>
                <CardDescription>For large organizations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Unlimited AI queries</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Unlimited file uploads</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Custom integrations</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">Dedicated support</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-slate-700">On-premise deployment</span>
                  </div>
                </div>
                <Button 
                  onClick={() => window.location.href = 'mailto:chimaridata@gmail.com?subject=Enterprise Plan Inquiry&body=Hi, I am interested in learning more about the Enterprise plan for my organization.'}
                  className="w-full"
                  variant="outline"
                >
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <p className="text-slate-600 mb-4">
              All plans include secure data handling and GDPR compliance
            </p>
            <div className="flex gap-4 justify-center">
              <Button 
                onClick={onPayPerAnalysis}
                variant="ghost"
                className="text-blue-600 hover:text-blue-700"
              >
                Need pay-per-analysis? Start here →
              </Button>
              <Button 
                onClick={onExpertConsultation}
                variant="ghost"
                className="text-purple-600 hover:text-purple-700"
              >
                Consult with Expert →
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-indigo-600 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full animate-float"></div>
          <div className="absolute bottom-20 right-20 w-24 h-24 bg-white/10 rounded-full animate-float" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 left-1/3 w-16 h-16 bg-white/10 rounded-full animate-float" style={{animationDelay: '2s'}}></div>
        </div>
        
        <div className={`max-w-4xl mx-auto text-center transition-all duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <h2 className={`text-4xl font-bold text-white mb-6 transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            Ready to Transform Your Data Into Insights?
          </h2>
          <p className={`text-xl text-blue-100 mb-8 transition-all duration-700 delay-200 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            Join thousands of teams who've discovered the power of conversational data analysis.
          </p>
          
          <div className={`flex flex-col sm:flex-row gap-4 justify-center mb-8 transition-all duration-700 delay-400 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="bg-white text-blue-600 hover:bg-slate-50 text-lg px-8 py-6 hover:scale-110 transition-all duration-300 hover:shadow-2xl animate-glow"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
            </Button>
          </div>

          <div className={`flex items-center justify-center space-x-6 text-blue-100 flex-wrap transition-all duration-700 delay-600 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            <div className="flex items-center hover:scale-105 transition-transform duration-200">
              <CheckCircle className="w-5 h-5 mr-2 animate-pulse" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center hover:scale-105 transition-transform duration-200">
              <CheckCircle className="w-5 h-5 mr-2 animate-pulse" style={{animationDelay: '0.5s'}} />
              <span>50 free queries</span>
            </div>
            <div className="flex items-center hover:scale-105 transition-transform duration-200">
              <CheckCircle className="w-5 h-5 mr-2 animate-pulse" style={{animationDelay: '1s'}} />
              <span>Setup in 2 minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">ChimariData</span>
              </div>
              <p className="text-slate-400">
                Making data analysis accessible to everyone through the power of AI.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white">Features</a></li>
                <li><a href="#" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Security</a></li>
                <li><a href="#" className="hover:text-white">Integrations</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white">Documentation</a></li>
                <li><a href="#" className="hover:text-white">Tutorials</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Support</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Careers</a></li>
                <li><a href="#" className="hover:text-white">Privacy</a></li>
                <li><a href="#" className="hover:text-white">Terms</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-slate-800 mt-8 pt-8 text-center text-slate-400">
            <p>&copy; 2025 ChimariData. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}