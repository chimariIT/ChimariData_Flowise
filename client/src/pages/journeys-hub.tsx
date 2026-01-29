import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  Users,
  Lock
} from "lucide-react";
import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { apiClient } from "@/lib/api";
// MEDIUM PRIORITY FIX: Use custom hook instead of DOM manipulation for SEO
import { useDocumentHead } from "@/hooks/useDocumentHead";
// MEDIUM PRIORITY FIX: Use canonical journey types from shared/
import { JourneyType } from "@shared/canonical-types";

interface JourneyConfig {
  id: JourneyType;
  title: string;
  description: string;
  icon: typeof Target;
  features: string[];
  badge: string;
  badgeColor: string;
}

interface JourneysHubProps {
  user?: any;
}

export default function JourneysHub({ user }: JourneysHubProps) {
  const [, setLocation] = useLocation();
  const { userRoleData, canAccessJourney } = useUserRole();

  // HIGH PRIORITY FIX: Fetch dynamic pricing from backend
  const { data: pricingData } = useQuery({
    queryKey: ['/api/pricing/journeys'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/api/pricing/journeys');
        return response?.data || response;
      } catch {
        return null; // Use fallback pricing on error
      }
    },
    staleTime: 60000, // Cache for 1 minute
    retry: 1
  });

  // Get dynamic pricing or fallback to static pricing
  const getJourneyPricing = (journeyId: string): string => {
    if (pricingData?.journeyPricing?.[journeyId]) {
      const price = pricingData.journeyPricing[journeyId];
      if (typeof price === 'number') {
        return `From $${price.toFixed(2)}/analysis`;
      }
      return price;
    }
    // Fallback pricing
    const fallbackPricing: Record<string, string> = {
      'non-tech': 'From $29/analysis',
      'business': 'From $19/template',
      'technical': 'From $49/analysis',
      'consultation': 'Custom Pricing'
    };
    return fallbackPricing[journeyId] || 'Contact for pricing';
  };

  // MEDIUM PRIORITY FIX: Use declarative hook instead of DOM manipulation for SEO
  useDocumentHead({
    title: "Choose Your Data Analysis Journey | ChimariData",
    description: "Get insights from your data with guided analysis journeys. Choose from non-technical guided analysis, business templates, or technical pro options. Start your data journey today."
  });

  const handleJourneyStart = (journeyType: string) => {
    if (!user) {
      // Store intended route before redirecting to auth page (with ?new=true to clear prefilled data)
      import('@/lib/utils').then(({ routeStorage }) => {
        routeStorage.setIntendedRoute(`/journeys/${journeyType}/data?new=true`);
      });
      setLocation('/auth/register');
      return;
    }

    // HIGH PRIORITY FIX: Check if user can access this journey type
    if (!canAccessJourney(journeyType)) {
      // User doesn't have access - redirect to upgrade page
      setLocation(`/pricing?upgrade=true&journey=${journeyType}`);
      return;
    }

    // Navigate to Data Upload & Setup step (step 1) using SPA navigation (with ?new=true to clear prefilled data)
    setLocation(`/journeys/${journeyType}/data?new=true`);
  };

  // Check if journey is locked for current user
  const isJourneyLocked = (journeyType: JourneyType): boolean => {
    if (!user) return false; // Not locked for unauthenticated - they'll be redirected to register
    return !canAccessJourney(journeyType);
  };

  // HIGH PRIORITY FIX: Use dynamic pricing from backend
  // MEDIUM PRIORITY FIX: Use canonical JourneyType for type safety
  const journeys: JourneyConfig[] = [
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
      badgeColor: 'bg-gray-700'
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
      badgeColor: 'bg-gray-600'
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
      badgeColor: 'bg-gray-800'
    },
    {
      id: 'consultation',
      title: 'Expert Consultation',
      description: 'Get professional guidance from data science experts',
      icon: Users,
      features: [
        '1-on-1 expert sessions',
        'Custom project support',
        'Strategic advice',
        'Implementation guidance'
      ],
      badge: 'Expert Support',
      badgeColor: 'bg-gray-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Data Analysis Journey
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Get insights from your data with our guided, step-by-step approach. 
            No matter your technical background, we'll help you unlock the value in your data.
          </p>
        </div>

        {/* Journey Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {journeys.map((journey) => (
              <Card 
                key={journey.id}
                className="relative overflow-hidden hover:shadow-xl transition-all duration-300 border-2 hover:border-gray-300 dark:hover:border-gray-600"
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
                    <journey.icon className="h-8 w-8 text-gray-700 dark:text-gray-400" />
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
                        <CheckCircle className="h-4 w-4 text-gray-600 flex-shrink-0" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-lg font-semibold text-gray-700 dark:text-gray-400">
                        {getJourneyPricing(journey.id)}
                      </span>
                      {isJourneyLocked(journey.id) && (
                        <Lock className="h-4 w-4 text-amber-500" />
                      )}
                    </div>

                    <Button
                      onClick={() => handleJourneyStart(journey.id)}
                      className={`w-full ${isJourneyLocked(journey.id)
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-gray-800 hover:bg-gray-900'} text-white`}
                      data-testid={`button-start-${journey.id}`}
                    >
                      {isJourneyLocked(journey.id) ? (
                        <>
                          Upgrade to Access
                          <Lock className="ml-2 h-4 w-4" />
                        </>
                      ) : (
                        <>
                          {journey.id === 'non-tech' ? 'Non-Tech User' :
                           journey.id === 'business' ? 'Business User' :
                           journey.id === 'technical' ? 'Technical User' :
                           'Start Journey'}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
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
              <MessageCircle className="h-12 w-12 text-gray-700 dark:text-gray-400 mx-auto mb-3" />
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
              <BarChart3 className="h-12 w-12 text-gray-700 dark:text-gray-400 mx-auto mb-3" />
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
              <Users className="h-12 w-12 text-gray-700 dark:text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Your Projects</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {user ? 'Access your existing projects and continue your analysis.' : 'Sign in to view your projects and continue your work.'}
              </p>
              {user ? (
                <Button
                  variant="outline"
                  onClick={() => setLocation('/dashboard')}
                  data-testid="button-projects"
                >
                  View Projects
                </Button>
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