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
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const [activeDemo, setActiveDemo] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResponse, setShowResponse] = useState(false);

  const demoQuestions = [
    "What are my top selling products?",
    "Which quarter had the highest revenue?", 
    "Show me trends by product category",
    "What's the average order value?"
  ];

  const demoResponses = [
    "Based on your sales data, your top 3 products are: 1) Laptop Pro with 323 units sold generating $419,897, 2) Smartphone with 701 units sold generating $630,693, and 3) Wireless Headphones with 924 units sold generating $184,792. The Laptop Pro has the highest revenue per unit at $1,299.99.",
    "Q2 had your highest revenue at $1,347,293 compared to Q1's $710,136 - that's an 89.7% increase! This growth was driven primarily by increased smartphone sales (389 vs 312 units) and strong performance in the Electronics category overall.",
    "Electronics dominates with 68% of total revenue ($1.4M), followed by Furniture at 22% ($463K) and Appliances at 10% ($202K). Electronics shows the strongest growth trajectory with consistent quarter-over-quarter increases.",
    "Your average order value is $487.33. Electronics has the highest AOV at $612.50, while Appliances has the lowest at $129.99. Consider bundling strategies to increase AOV in lower-performing categories."
  ];

  // Animation effects
  useEffect(() => {
    setIsVisible(true);
    
    // Auto-cycle through demo questions with typing effect
    const cycleQuestions = () => {
      const question = demoQuestions[currentQuestionIndex];
      setTypingText("");
      setShowResponse(false);
      
      let i = 0;
      const typeInterval = setInterval(() => {
        if (i < question.length) {
          setTypingText(question.slice(0, i + 1));
          i++;
        } else {
          clearInterval(typeInterval);
          setShowResponse(true);
          
          // Show response for 3 seconds, then move to next question
          setTimeout(() => {
            setCurrentQuestionIndex((prev) => (prev + 1) % demoQuestions.length);
          }, 3000);
        }
      }, 50);
    };

    const interval = setInterval(cycleQuestions, 6000);
    cycleQuestions(); // Start immediately
    
    return () => clearInterval(interval);
  }, [currentQuestionIndex]);

  // Floating animation for icons
  const floatingAnimation = {
    y: [0, -10, 0],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
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
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-lg px-8 py-6 hover:scale-105 transition-all duration-200 hover:shadow-xl animate-pulse"
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

      {/* Interactive Demo */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-center mb-12">
            <h2 className={`text-3xl font-bold text-slate-900 mb-4 transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
              See It In Action
            </h2>
            <p className={`text-lg text-slate-600 transition-all duration-700 delay-200 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
              Watch the AI typing effect as it cycles through real data questions automatically
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className={`space-y-4 transition-all duration-700 delay-400 ${isVisible ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'}`}>
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Live AI Demo:</h3>
              <div className="bg-slate-900 rounded-lg p-6 font-mono text-sm shadow-2xl transform hover:scale-105 transition-all duration-300">
                <div className="flex items-center mb-4">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2 animate-pulse" style={{animationDelay: '0.5s'}}></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse" style={{animationDelay: '1s'}}></div>
                  <span className="text-slate-400 ml-2">ChimariData AI Terminal</span>
                </div>

                <div className="space-y-4 min-h-[200px]">
                  <div className="flex items-start">
                    <span className="text-blue-400">user@data:</span>
                    <span className="text-white ml-2 flex-1">
                      {typingText}
                      <span className="animate-pulse text-green-400">|</span>
                    </span>
                  </div>
                  
                  {showResponse && (
                    <div className="text-green-400 animate-fadeIn">
                      <div className="flex items-center mb-2">
                        <Brain className="w-4 h-4 mr-2 animate-spin" style={{animationDuration: '2s'}} />
                        <span className="animate-pulse">Analyzing data patterns...</span>
                      </div>
                      <div className="text-slate-300 text-xs leading-relaxed bg-slate-800/50 p-3 rounded border-l-2 border-green-400">
                        {demoResponses[currentQuestionIndex]}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center text-sm text-slate-500">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Auto-cycling through sample questions</span>
                </div>
              </div>
            </div>

            <div className={`space-y-6 transition-all duration-700 delay-600 ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'}`}>
              <Card className="group hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <CardTitle className="flex items-center group-hover:text-blue-600 transition-colors duration-200">
                    <MessageSquare className="w-5 h-5 text-blue-600 mr-2 group-hover:animate-bounce" />
                    Try These Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {demoQuestions.map((question, index) => (
                    <div 
                      key={index}
                      className={`p-3 rounded-lg cursor-pointer transition-all duration-300 hover:scale-105 ${
                        currentQuestionIndex === index 
                          ? 'bg-blue-100 border-l-4 border-blue-500 animate-pulse' 
                          : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                      onClick={() => setCurrentQuestionIndex(index)}
                    >
                      <span className="text-slate-700 text-sm">{question}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="text-center">
                <Button 
                  onClick={onGetStarted}
                  size="lg"
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:scale-110 transition-all duration-300 hover:shadow-xl animate-pulse"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Try With Your Data
                </Button>
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
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
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

      {/* Social Proof */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">
            Trusted by Data-Driven Teams
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">10,000+</div>
              <div className="text-slate-600">Datasets Analyzed</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">500+</div>
              <div className="text-slate-600">Happy Customers</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">99.9%</div>
              <div className="text-slate-600">Uptime Guarantee</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-6">
                <p className="text-slate-700 mb-4">
                  "ChimariData transformed how we understand our sales data. Questions that used to take our analyst days now get answered in seconds."
                </p>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">JD</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Jane Doe</div>
                    <div className="text-slate-600 text-sm">VP of Sales, TechCorp</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <p className="text-slate-700 mb-4">
                  "Finally, a tool that speaks our language. No more waiting for IT to run reports - we get insights instantly."
                </p>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-semibold">MS</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Mike Smith</div>
                    <div className="text-slate-600 text-sm">Marketing Director, GrowthCo</div>
                  </div>
                </div>
              </CardContent>
            </Card>
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