import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  TrendingUp, 
  Brain, 
  MessageCircle, 
  ArrowRight,
  CheckCircle,
  Zap,
  BarChart3,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";

interface JourneysHubProps {
  user?: any;
}

export default function JourneysHub({ user }: JourneysHubProps) {
  const [, setLocation] = useLocation();

  // SEO: Set page title and meta description
  useEffect(() => {
    document.title = "Choose Your Data Analysis Journey | ChimariData";
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Get insights from your data with guided analysis journeys. Choose from non-technical guided analysis, business templates, or technical pro options. Start your data journey today.');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = 'Get insights from your data with guided analysis journeys. Choose from non-technical guided analysis, business templates, or technical pro options. Start your data journey today.';
      document.head.appendChild(meta);
    }
  }, []);

  const handleJourneyStart = (journeyType: string) => {
    if (!user) {
      // Store intended route before redirecting to auth page
      import('@/lib/utils').then(({ routeStorage }) => {
        routeStorage.setIntendedRoute(`/journeys/${journeyType}/prepare`);
      });
      setLocation('/auth/register');
      return;
    }
    // Navigate to journey preparation step using SPA navigation
    setLocation(`/journeys/${journeyType}/prepare`);
  };

  const journeys = [
    {
      id: 'non-tech',
      title: 'Non-Technical Guided',
      description: 'Step-by-step guidance for business users with no technical background',
      icon: Target,
      features: [
        'AI-powered goal extraction',
        'Guided data upload & preparation', 
        'Automated analysis suggestions',
        'Business-friendly reporting'
      ],
      badge: 'Most Popular',
      badgeColor: 'bg-blue-500',
      pricing: 'From $29/analysis'
    },
    {
      id: 'business',
      title: 'Business Templates',
      description: 'Pre-built analysis templates for common business scenarios',
      icon: TrendingUp,
      features: [
        'Ready-to-use templates',
        'Industry-specific insights',
        'Comparative analysis',
        'Executive dashboards'
      ],
      badge: 'Templates',
      badgeColor: 'bg-green-500',
      pricing: 'From $19/template'
    },
    {
      id: 'technical',
      title: 'Technical Pro',
      description: 'Advanced analytics for data professionals and technical users',
      icon: Brain,
      features: [
        'Custom analysis workflows',
        'Statistical modeling',
        'Machine learning insights',
        'API access & automation'
      ],
      badge: 'Advanced',
      badgeColor: 'bg-purple-500',
      pricing: 'From $49/analysis'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          {user && (
            <div className="mb-6 p-4 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-lg border border-blue-200 dark:border-blue-700 max-w-2xl mx-auto">
              <p className="text-lg text-blue-700 dark:text-blue-300 font-medium">
                Welcome back, {user?.firstName || user?.username || user?.email?.split('@')[0] || 'User'}! 👋
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Ready to continue your data analysis journey?
              </p>
            </div>
          )}
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Data Analysis Journey
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Get insights from your data with our guided, step-by-step approach. 
            No matter your technical background, we'll help you unlock the value in your data.
          </p>
        </div>

        {/* Journey Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {journeys.map((journey) => (
            <Card 
              key={journey.id} 
              className="relative overflow-hidden hover:shadow-xl transition-all duration-300 border-2 hover:border-blue-200 dark:hover:border-blue-700"
              data-testid={`card-journey-${journey.id}`}
            >
              {journey.badge && (
                <Badge 
                  className={`absolute top-4 right-4 ${journey.badgeColor} text-white`}
                  data-testid={`badge-${journey.id}`}
                >
                  {journey.badge}
                </Badge>
              )}
              
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3 mb-2">
                  <journey.icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-xl">{journey.title}</CardTitle>
                </div>
                <CardDescription className="text-base">
                  {journey.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {journey.features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-gray-600 dark:text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {journey.pricing}
                    </span>
                  </div>
                  
                  <Button 
                    onClick={() => handleJourneyStart(journey.id)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid={`button-start-${journey.id}`}
                  >
                    Start Journey
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional Options */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 text-blue-600 dark:text-blue-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Expert Consultation</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Need personalized guidance? Schedule a consultation with our data experts.
              </p>
              <Link href="/expert-consultation">
                <Button variant="outline" data-testid="button-consultation">
                  Book Consultation
                </Button>
              </Link>
            </div>

            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">View Pricing</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Transparent pricing for all features with volume discounts available.
              </p>
              <Link href="/pricing">
                <Button variant="outline" data-testid="button-pricing">
                  See All Pricing
                </Button>
              </Link>
            </div>

            <div className="text-center">
              <Users className="h-12 w-12 text-purple-600 dark:text-purple-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Your Projects</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {user ? 'Access your existing projects and continue your analysis.' : 'Sign in to view your projects and continue your work.'}
              </p>
              {user ? (
                <Link href="/projects">
                  <Button variant="outline" data-testid="button-projects">
                    View Projects
                  </Button>
                </Link>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => setLocation('/auth/login')}
                  data-testid="button-signin"
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="text-center mt-12 text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center space-x-8 text-sm">
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4" />
              <span>Secure & Fast</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span>Enterprise Ready</span>
            </div>
            <div className="flex items-center space-x-2">
              <Brain className="h-4 w-4" />
              <span>AI-Powered</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}