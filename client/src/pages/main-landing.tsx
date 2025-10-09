import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight,
  Play,
  Database,
  BarChart3,
  Eye,
  Brain as BrainIcon,
  Zap,
  CheckCircle,
  Settings,
  Users
} from "lucide-react";

interface MainLandingPageProps {
  user?: any;
}

export default function MainLandingPage({ user }: MainLandingPageProps) {
  const [, setLocation] = useLocation();

  // SEO: Set page title and meta description
  useEffect(() => {
    document.title = "ChimariData - Progressive Insights Generation";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'You don\'t have to be a data expert to have cutting edge insights. Combining traditional, advanced and AI powered Analytics. Bring your Own Data (BYOD) → Transform → Visualize → Analyze → Talk to your Data in natural language.');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = 'You don\'t have to be a data expert to have cutting edge insights. Combining traditional, advanced and AI powered Analytics. Bring your Own Data (BYOD) → Transform → Visualize → Analyze → Talk to your Data in natural language.';
      document.head.appendChild(meta);
    }
  }, []);

  // Journey selection handler for pre-authentication users
  const handleJourneySelect = (journeyType: string) => {
    if (user) {
      // Authenticated users go directly to journey
      setLocation(`/journeys/${journeyType}/prepare`);
    } else {
      // Store the intended journey for post-auth redirect
      localStorage.setItem('intended_journey', journeyType);
      localStorage.setItem('intended_route', `/journeys/${journeyType}/prepare`);
      // Redirect to registration to authenticate first
      setLocation('/auth/register');
    }
  };

  const handleGetStarted = () => {
    if (user) {
      // Scroll to journey selection section for authenticated users
      const journeySection = document.getElementById('journey-selection');
      if (journeySection) {
        journeySection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      setLocation('/auth/register');
    }
  };

  const handleViewDemos = () => {
    setLocation('/demos');
  };

  const handleSignIn = () => {
    setLocation('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-300 rounded-lg flex items-center justify-center">
            <BrainIcon className="h-6 w-6 text-gray-700" />
          </div>
          <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">ChimariData</span>
        </div>
        <nav className="flex items-center space-x-4">
          {user ? (
            // Authenticated user navigation
            <>
              <Button 
                variant="outline" 
                onClick={() => setLocation('/dashboard')}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Dashboard
              </Button>
              <Button
                onClick={handleGetStarted}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800"
              >
                Choose Journey
              </Button>
            </>
          ) : (
            // Unauthenticated user navigation
            <>
              <Button 
                variant="outline" 
                onClick={handleSignIn}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Sign In
              </Button>
              <Button
                onClick={handleGetStarted}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800"
              >
                Get Started
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-5xl font-extrabold leading-tight mb-6 text-gray-900 dark:text-white">
          You don't have to be a <span className="text-gray-700 font-semibold">data expert</span> to have cutting edge insights
        </h1>
        <p className="text-xl text-gray-700 dark:text-gray-300 mb-10 max-w-4xl mx-auto leading-relaxed">
          Combining the power of traditional, advanced and AI powered Analytics. 
          Bring your Own Data (BYOD) → Transform → Visualize → Analyze → Talk to your Data in natural language.
        </p>
        
        <div className="flex justify-center space-x-4 mb-12">
          <Button 
            variant="outline" 
            onClick={handleViewDemos}
            className="text-lg px-8 py-3 rounded-full border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Play className="mr-2 h-5 w-5" />
            View Demos
          </Button>
          <Button
            onClick={handleGetStarted}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 text-lg px-8 py-3 rounded-full"
          >
            Get Started <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>

        {/* Data Pipeline Visualization */}
        <div className="flex justify-center items-center space-x-8 mb-8">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <Database className="h-6 w-6" />
            <span className="font-medium">Transform</span>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <BarChart3 className="h-6 w-6" />
            <span className="font-medium">Analyze</span>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <Eye className="h-6 w-6" />
            <span className="font-medium">Visualize</span>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <BrainIcon className="h-6 w-6" />
            <span className="font-medium">AI Insights</span>
          </div>
        </div>
        
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Complete data pipeline • All skill levels supported
        </p>
      </section>

      {/* Choose Your Analytics Journey Section */}
      <section id="journey-selection" className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
              <div className="w-5 h-5 bg-white rounded-full"></div>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Choose Your Analytics Journey
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Select the path that matches your experience and goals. Each journey provides the same powerful capabilities tailored to your workflow.
          </p>
        </div>

        {/* Four Ways to Unlock Your Data's Potential */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
            Four Ways to Unlock Your Data's Potential
          </h3>
          <p className="text-base text-gray-600 dark:text-gray-300 text-center max-w-4xl mx-auto mb-6">
            Whether you're a data novice or expert, we have the perfect path for your analytics needs. Choose the journey that matches your experience and goals.
          </p>
          
          <div className="flex flex-wrap gap-6 justify-center webkit-grid-fix" style={{display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center'}}>
            {/* AI-Guided Journey */}
            <Card className="hover:shadow-lg transition-shadow flex flex-col h-full webkit-card-fix" style={{display: 'flex', flexDirection: 'column', minHeight: '300px', width: '280px', maxWidth: '100%'}}>
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <BrainIcon className="w-5 h-5 text-gray-600" />
                  </div>
                  <Badge className="bg-gray-100 text-gray-800">Recommended for Beginners</Badge>
                </div>
                <CardTitle className="text-lg">AI-Guided Journey</CardTitle>
                <CardDescription className="text-sm">Let AI do the heavy lifting</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-sm text-gray-600 mb-4">
                  Perfect for users who want insights without technical complexity. Our AI agent orchestrates the entire analysis workflow.
                </p>
                <div className="space-y-2 mb-4 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>AI orchestrates entire workflow</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Natural language questions</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Automated analysis selection</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Plain English insights</span>
                  </div>
                </div>
                <Button 
                  className="w-full bg-gray-700 hover:bg-gray-800 text-white mt-auto"
                  onClick={() => handleJourneySelect('non-tech')}
                  data-testid="button-start-non-tech-landing"
                >
                  Start AI Journey <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {/* Template-Based Analysis */}
            <Card className="hover:shadow-lg transition-shadow flex flex-col h-full webkit-card-fix" style={{display: 'flex', flexDirection: 'column', minHeight: '300px', width: '280px', maxWidth: '100%'}}>
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-gray-600" />
                  </div>
                  <Badge className="bg-gray-200 text-gray-800">Most Popular</Badge>
                </div>
                <CardTitle className="text-lg">Template-Based Analysis</CardTitle>
                <CardDescription className="text-sm">Business scenarios and guided workflows</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-sm text-gray-600 mb-4">
                  Ideal for business users who need proven analytics templates and AI guidance for common business scenarios.
                </p>
                <div className="space-y-2 mb-4 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Pre-built business templates</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Guided analysis workflows</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Role-based scenarios</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Executive-ready reports</span>
                  </div>
                </div>
                <Button 
                  className="w-full bg-gray-700 hover:bg-gray-800 text-white mt-auto"
                  onClick={() => handleJourneySelect('business')}
                  data-testid="button-start-business-landing"
                >
                  Browse Templates <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {/* Self-Service Analytics */}
            <Card className="hover:shadow-lg transition-shadow flex flex-col h-full webkit-card-fix" style={{display: 'flex', flexDirection: 'column', minHeight: '300px', width: '280px', maxWidth: '100%'}}>
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5 text-gray-600" />
                  </div>
                  <Badge className="bg-gray-300 text-gray-800">Advanced Features</Badge>
                </div>
                <CardTitle className="text-lg">Self-Service Analytics</CardTitle>
                <CardDescription className="text-sm">Full control with expert guidance</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-sm text-gray-600 mb-4">
                  For technical users who want complete control over their analysis with optional AI assistance and advanced features.
                </p>
                <div className="space-y-2 mb-4 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Full parameter control</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Advanced statistical tools</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Custom analysis pipelines</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Raw data export options</span>
                  </div>
                </div>
                <Button 
                  className="w-full bg-gray-700 hover:bg-gray-800 text-white mt-auto"
                  onClick={() => handleJourneySelect('technical')}
                  data-testid="button-start-technical-landing"
                >
                  Access Full Platform <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {/* Expert Consultation */}
            <Card className="hover:shadow-lg transition-shadow flex flex-col h-full webkit-card-fix" style={{display: 'flex', flexDirection: 'column', minHeight: '300px', width: '280px', maxWidth: '100%'}}>
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-gray-600" />
                  </div>
                  <Badge className="bg-gray-400 text-white">Expert Support</Badge>
                </div>
                <CardTitle className="text-lg">Expert Consultation</CardTitle>
                <CardDescription className="text-sm">Work with data science experts</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-sm text-gray-600 mb-4">
                  Perfect for complex projects requiring expert guidance. Get 1-on-1 consultation with senior data scientists.
                </p>
                <div className="space-y-2 mb-4 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Video consultation with experts</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Custom analysis strategy</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Real-time collaboration</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <span>Follow-up summary report</span>
                  </div>
                </div>
                <Button 
                  className="w-full bg-gray-700 hover:bg-gray-800 text-white mt-auto"
                  onClick={() => handleJourneySelect('consultation')}
                  data-testid="button-start-consultation-landing"
                >
                  Book Consultation <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Ready to Get Started / User Actions */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 text-center">
          {user ? (
            // Authenticated user content
            <>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Welcome back, {user.name}!
              </h3>
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                Select your analytics journey above to continue your data analysis, or visit your dashboard to manage existing projects.
              </p>
              <div className="flex justify-center space-x-4">
                <Button 
                  className="bg-gray-800 hover:bg-gray-900 text-white text-lg px-8 py-3"
                  onClick={() => setLocation('/dashboard')}
                  data-testid="button-dashboard-landing"
                >
                  Go to Dashboard
                </Button>
                <Button 
                  variant="outline" 
                  className="text-lg px-8 py-3 border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => setLocation('/projects')}
                  data-testid="button-projects-landing"
                >
                  View Projects
                </Button>
              </div>
            </>
          ) : (
            // Unauthenticated user content
            <>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Ready to Get Started?
              </h3>
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                Sign up now to access your chosen analytics journey and start transforming your data into insights.
              </p>
              <div className="flex justify-center space-x-4">
                <Button 
                  className="bg-gray-800 hover:bg-gray-900 text-white text-lg px-8 py-3"
                  onClick={() => setLocation('/auth/register')}
                  data-testid="button-create-account-landing"
                >
                  Create Free Account
                </Button>
                <Button 
                  variant="outline" 
                  className="text-lg px-8 py-3 border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => setLocation('/auth/login')}
                  data-testid="button-signin-landing"
                >
                  Sign In
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-4">
        <div className="flex justify-center space-x-8">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <Zap className="h-4 w-4" />
            <span className="text-sm">Secure & Fast</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Enterprise Ready</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <BrainIcon className="h-4 w-4" />
            <span className="text-sm">AI-Powered</span>
          </div>
        </div>
      </footer>
    </div>
  );
}