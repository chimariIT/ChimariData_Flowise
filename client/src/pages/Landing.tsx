import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  BarChart3, 
  Brain, 
  Database, 
  Shield, 
  Zap,
  CheckCircle,
  Users,
  TrendingUp,
  Gift
} from "lucide-react";

export default function Landing() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const services = [
    {
      id: "pay-per-analysis",
      title: "Pay-per-Analysis",
      description: "One-time analysis with instant insights",
      price: "From $25",
      icon: <Zap className="h-6 w-6" />,
      features: ["Instant results", "Basic insights", "Single dataset"],
      color: "bg-blue-50 border-blue-200",
      link: "/pay-per-analysis"
    },
    {
      id: "expert-consulting",
      title: "Expert Consulting", 
      description: "Professional data science consultation",
      price: "From $150",
      icon: <Users className="h-6 w-6" />,
      features: ["Expert analysis", "Custom recommendations", "1-on-1 consultation"],
      color: "bg-green-50 border-green-200",
      link: "/expert-consulting"
    },
    {
      id: "automated-analysis",
      title: "Automated Analysis",
      description: "Tiered subscription model with AI insights",
      price: "Free Trial Available",
      icon: <Brain className="h-6 w-6" />,
      features: ["AI-powered insights", "Multiple datasets", "Advanced analytics"],
      color: "bg-purple-50 border-purple-200",
      link: "/pricing"
    },
    {
      id: "enterprise",
      title: "Enterprise Projects",
      description: "Custom enterprise solutions",
      price: "Custom Quote",
      icon: <Database className="h-6 w-6" />,
      features: ["Custom solutions", "Dedicated support", "Enterprise security"],
      color: "bg-orange-50 border-orange-200",
      link: "/enterprise"
    }
  ];

  const features = [
    {
      icon: <Brain className="h-8 w-8 text-blue-600" />,
      title: "AI-Powered Analysis",
      description: "Advanced machine learning algorithms analyze your data patterns"
    },
    {
      icon: <Shield className="h-8 w-8 text-green-600" />,
      title: "Enterprise Security",
      description: "Bank-grade security with PII detection and anonymization"
    },
    {
      icon: <BarChart3 className="h-8 w-8 text-purple-600" />,
      title: "Interactive Visualizations",
      description: "Dynamic charts and graphs that bring your data to life"
    },
    {
      icon: <Database className="h-8 w-8 text-orange-600" />,
      title: "Multi-Source Integration",
      description: "Connect data from files, cloud platforms, and APIs seamlessly"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <Badge variant="secondary" className="mb-4">
            <Gift className="h-4 w-4 mr-2" />
            Free Trial Available - No Sign-up Required
          </Badge>
          
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6">
            Transform Your Data into
            <span className="text-blue-600 block">Actionable Insights</span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            ChimariData combines AI-powered analytics with expert consultation to unlock 
            the hidden value in your datasets. From quick analyses to enterprise solutions.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/free-trial">
              <Button size="lg" className="text-lg px-8 py-3">
                <Gift className="h-5 w-5 mr-2" />
                Try Free - No Sign-up
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            
            <Link href="/pricing">
              <Button variant="outline" size="lg" className="text-lg px-8 py-3">
                View Pricing Plans
              </Button>
            </Link>
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {services.map((service) => (
            <Card 
              key={service.id} 
              className={`${service.color} hover:shadow-lg transition-all duration-200 cursor-pointer group`}
              onClick={() => setSelectedPlan(service.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  {service.icon}
                  <Badge variant="secondary">{service.price}</Badge>
                </div>
                <CardTitle className="text-lg">{service.title}</CardTitle>
                <CardDescription className="text-sm">
                  {service.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-4">
                  {service.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href={service.link}>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full group-hover:bg-white"
                  >
                    Learn More
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Features Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Why Choose ChimariData?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Our platform combines cutting-edge AI technology with human expertise 
            to deliver insights that drive real business value.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {features.map((feature, index) => (
            <div key={index} className="text-center">
              <div className="flex justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600 text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Unlock Your Data's Potential?
          </h2>
          <p className="text-xl mb-6 opacity-90">
            Start with our free trial or choose the plan that fits your needs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/free-trial">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-3">
                <Gift className="h-5 w-5 mr-2" />
                Start Free Trial
              </Button>
            </Link>
            <Link href="/demo">
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-3 border-white text-white hover:bg-white hover:text-blue-600"
              >
                <TrendingUp className="h-5 w-5 mr-2" />
                View Demo
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}