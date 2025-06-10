import { useState } from "react";
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">ChimariData</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={onGetStarted}>Sign In</Button>
              <Button onClick={onGetStarted} className="bg-gradient-to-r from-blue-600 to-indigo-600">
                Get Started Free
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <Badge className="mb-6 bg-blue-100 text-blue-700 border-blue-200">
            <Sparkles className="w-4 h-4 mr-1" />
            AI-Powered Data Analytics
          </Badge>
          
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            You don't have to be a{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              data expert
            </span>
            {" "}to have cutting edge insights
          </h1>
          
          <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Upload your data and ask questions in plain English. Our AI transforms complex datasets 
            into actionable insights instantly—no technical skills required.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-lg px-8 py-6"
            >
              Start Analyzing Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6">
              Watch 2-min Demo
            </Button>
          </div>

          <div className="text-sm text-slate-500">
            🚀 50 free AI queries • 📊 No setup required • 🔒 Your data stays secure
          </div>
        </div>
      </section>

      {/* Interactive Demo */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              See It In Action
            </h2>
            <p className="text-lg text-slate-600">
              Click any question to see how our AI analyzes real sales data
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Ask anything about your data:</h3>
              {demoQuestions.map((question, index) => (
                <Card 
                  key={index}
                  className={`cursor-pointer transition-all duration-200 ${
                    activeDemo === index 
                      ? 'ring-2 ring-blue-500 bg-blue-50' 
                      : 'hover:shadow-md'
                  }`}
                  onClick={() => setActiveDemo(index)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <MessageSquare className="w-5 h-5 text-blue-600" />
                      <span className="text-slate-700">{question}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="h-80">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="w-5 h-5 text-green-600 mr-2" />
                  AI Response
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-50 p-4 rounded-lg h-48 overflow-y-auto">
                  <p className="text-slate-700 leading-relaxed">
                    {demoResponses[activeDemo]}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              From Data to Insights in 3 Simple Steps
            </h2>
            <p className="text-lg text-slate-600">
              No technical expertise required. Get started in under 5 minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center">
              <CardHeader>
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
                <CardTitle>1. Upload Your Data</CardTitle>
                <CardDescription>
                  Drop in your CSV, Excel, or JSON files. We handle the rest automatically.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-green-600" />
                </div>
                <CardTitle>2. Ask Questions</CardTitle>
                <CardDescription>
                  Type questions in plain English. Our AI understands what you want to know.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-purple-600" />
                </div>
                <CardTitle>3. Get Insights</CardTitle>
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
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Powerful Features, Simple Experience
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Brain className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">AI-Powered Analysis</h3>
                <p className="text-slate-600">Advanced AI understands your data and provides human-like insights.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Instant Results</h3>
                <p className="text-slate-600">Get answers in seconds, not hours. No waiting for reports.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Database className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Any Data Format</h3>
                <p className="text-slate-600">Support for CSV, Excel, JSON, and more data sources.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Enterprise Security</h3>
                <p className="text-slate-600">Your data is encrypted and never shared. Complete privacy guaranteed.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Team Collaboration</h3>
                <p className="text-slate-600">Share insights and collaborate with your team seamlessly.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-pink-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Visual Dashboards</h3>
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
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Transform Your Data Into Insights?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of teams who've discovered the power of conversational data analysis.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="bg-white text-blue-600 hover:bg-slate-50 text-lg px-8 py-6"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          <div className="flex items-center justify-center space-x-6 text-blue-100">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              <span>50 free queries</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
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