import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { JourneyWizard } from "@/components/JourneyWizard";
import HomePage from "@/pages/home-page";
import JourneysHub from "@/pages/journeys-hub";
import ProjectPage from "@/pages/project-page";
import DescriptiveStatsPage from "@/pages/descriptive-stats-page";
import VisualizationPage from "@/pages/visualization-page";
import AuthPage from "@/pages/auth";
import GuidedAnalysisCheckout from "@/pages/checkout";
import GuidedAnalysisResults from "@/pages/guided-analysis-results";
import ExpertConsultation from "@/pages/expert-consultation";
import DemosPage from "@/pages/demos";
import AskQuestionPage from "@/pages/ask-question-page";
import PayPerAnalysis from "@/pages/pay-per-analysis";
import TemplateAnalysis from "@/pages/template-analysis";
import PricingPage from "@/pages/pricing";
import StripeTest from "@/pages/stripe-test";
import { apiClient } from "@/lib/api";
import { ProjectProvider } from "@/hooks/useProjectContext";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [, setLocation] = useLocation();

  // Check for existing authentication on app load
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          const userData = await apiClient.getCurrentUser();
          if (userData && userData.user) {
            setUser(userData.user);
          } else {
            // Invalid user data - clear token
            localStorage.removeItem('auth_token');
          }
        }
      } catch (error) {
        // Clear invalid token
        localStorage.removeItem('auth_token');
        console.log('No valid authentication found, cleared invalid token');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData);
    // Store token if provided
    if (userData.token) {
      localStorage.setItem('auth_token', userData.token); // Fixed: use same key as AuthModal
    }
    setLocation('/'); // Redirect to home after login
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('auth_token'); // Fixed: use same key as AuthModal
    setLocation('/');
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>
        <div className="min-h-screen bg-gray-50">
        <Switch>
          {/* Primary Journeys Hub landing page */}
          <Route path="/journeys">
            {() => <JourneysHub user={user} />}
          </Route>
          
          {/* Journey wizard routes */}
          <Route path="/journeys/:type/prepare">
            {(params) => (
              <JourneyWizard 
                journeyType={params.type} 
                currentStage="prepare"
              />
            )}
          </Route>
          <Route path="/journeys/:type/data">
            {(params) => (
              <JourneyWizard 
                journeyType={params.type} 
                currentStage="data"
              />
            )}
          </Route>
          <Route path="/journeys/:type/execute">
            {(params) => (
              <JourneyWizard 
                journeyType={params.type} 
                currentStage="execute"
              />
            )}
          </Route>
          
          {/* Redirect home to journeys hub */}
          <Route path="/">
            {() => <JourneysHub user={user} />}
          </Route>
          
          {/* Legacy home route for compatibility */}
          <Route path="/home">
            {() => <HomePage user={user} onLogout={handleLogout} />}
          </Route>
          <Route path="/projects">
            {() => <HomePage user={user} onLogout={handleLogout} />}
          </Route>
          <Route path="/auth/login">
            {() => <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/auth/register">
            {() => <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/project/:id">
            {(params) => <ProjectPage projectId={params.id} />}
          </Route>
          <Route path="/stats/:id">
            {(params) => <DescriptiveStatsPage />}
          </Route>
          <Route path="/visualization/:projectId">
            {(params) => <VisualizationPage />}
          </Route>
          <Route path="/checkout">
            {() => <GuidedAnalysisCheckout />}
          </Route>
          <Route path="/guided-analysis-results/:analysisId">
            {(params) => user ? <GuidedAnalysisResults /> : <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/dashboard">
            {() => user ? <ProjectPage projectId="dashboard" /> : <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/expert-consultation">
            {() => <ExpertConsultation onBack={() => setLocation('/')} />}
          </Route>
          <Route path="/ai-guided">
            {() => user ? <AskQuestionPage onBack={() => setLocation('/')} onPaymentRequired={(projectId, questions) => setLocation(`/checkout?projectId=${projectId}`)} /> : <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/self-service">
            {() => user ? <PayPerAnalysis onBack={() => setLocation('/')} /> : <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/template-based">
            {() => user ? <TemplateAnalysis onBack={() => setLocation('/')} /> : <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/demos">
            {() => <DemosPage />}
          </Route>
          <Route path="/pricing">
            {() => <PricingPage 
              onGetStarted={() => setLocation('/journeys')} 
              onBack={() => setLocation('/journeys')}
            />}
          </Route>
          <Route path="/stripe-test">
            {() => <StripeTest />}
          </Route>
          <Route>
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h1>
                <p className="text-gray-600">The page you're looking for doesn't exist.</p>
              </div>
            </div>
          </Route>
        </Switch>
        </div>
        <Toaster />
      </ProjectProvider>
    </QueryClientProvider>
  );
}