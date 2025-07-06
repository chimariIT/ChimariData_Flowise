import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
// Removed auth import - using localStorage directly
import LandingPage from "./pages/landing";
import AuthPage from "./pages/auth";
import Dashboard from "./pages/dashboard";
import ProjectResults from "./pages/project-results";
import SettingsPage from "./pages/settings";
import PricingPage from "./pages/pricing";
import SubscribePage from "./pages/subscribe";
import AnalysisPaymentPage from "./pages/analysis-payment";
import MLAnalysisPage from "./pages/ml-analysis";
import PayPerAnalysis from "./pages/pay-per-analysis";
import ExpertConsultation from "./pages/expert-consultation";
import FreeTrial from "./pages/free-trial";
import EnterpriseContact from "./pages/enterprise-contact";
import ComingSoon from "./pages/coming-soon";
import AnimatedDemo from "./components/animated-demo";
import VisualizationPage from "./pages/visualization-page";
import AskQuestionPage from "./pages/ask-question-page";
import NotFound from "@/pages/not-found";

function App() {
  const [user, setUser] = useState<{ id: string; email: string; firstName?: string; lastName?: string; username?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Check if user is already authenticated using Replit Auth
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/user', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          localStorage.setItem("user", JSON.stringify(userData));
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [setLocation]);

  const handleLogin = (userData: { id: string; email: string; firstName?: string; lastName?: string; username?: string }) => {
    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
    setLocation("/dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
    // Use Replit Auth logout endpoint
    window.location.href = "/api/logout";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {location === "/" && (
          <LandingPage 
            onGetStarted={() => setLocation("/auth")}
            onPayPerAnalysis={() => setLocation("/pay-per-analysis")}
            onExpertConsultation={() => setLocation("/expert-consultation")}
            onDemo={() => setLocation("/demo")}
            onPricing={() => setLocation("/pricing")}
            onFreeTrial={() => setLocation("/free-trial")}
          />
        )}
        
        {location === "/demo" && (
          <AnimatedDemo onGetStarted={() => setLocation("/auth")} onBackHome={() => setLocation("/")} />
        )}
        
        {location === "/auth" && (
          <AuthPage onLogin={handleLogin} />
        )}
        
        {location === "/pay-per-analysis" && (
          <PayPerAnalysis 
            onBack={() => setLocation("/")} 
          />
        )}
        
        {location === "/expert-consultation" && (
          <ExpertConsultation onBack={() => setLocation("/")} />
        )}
        
        {location === "/pricing" && (
          <PricingPage 
            onGetStarted={() => setLocation("/auth")}
            onSubscribe={(tier) => setLocation("/auth")}
            onBack={() => setLocation("/")}
            onPayPerAnalysis={() => setLocation("/pay-per-analysis")}
            onExpertConsultation={() => setLocation("/expert-consultation")}
          />
        )}
        
        {location === "/free-trial" && (
          <FreeTrial 
            onBack={() => setLocation("/")}
            onSignUp={() => setLocation("/auth")}
          />
        )}
        
        {location === "/enterprise-contact" && (
          <EnterpriseContact />
        )}
        
        {location.startsWith("/coming-soon") && (
          <ComingSoon 
            onBack={() => setLocation("/")} 
            pageTitle={new URLSearchParams(location.split('?')[1] || '').get('feature') || 'Feature'}
          />
        )}
        
        {user && location === "/dashboard" && (
          <Dashboard 
            user={user} 
            onLogout={handleLogout}
            onProjectSelect={(id) => setLocation(`/project/${id}`)}
            onSettings={() => setLocation("/settings")}
            onVisualizationPage={() => setLocation("/visualizations")}
            onAskQuestionPage={() => setLocation("/ask-questions")}
          />
        )}
        
        {user && location.startsWith("/project/") && (
          <ProjectResults 
            projectId={location.split("/")[2]}
            onBack={() => setLocation("/dashboard")}
            onSettings={() => setLocation("/settings")}
            onPayForAnalysis={(projectData) => {
              // Store project data for analysis payment
              localStorage.setItem('analysisProject', JSON.stringify(projectData));
              setLocation("/analysis-payment");
            }}
          />
        )}
        
        {user && location === "/settings" && (
          <SettingsPage 
            onBack={() => setLocation("/dashboard")}
            onPricing={() => setLocation("/pricing")}
          />
        )}
        
        {user && location === "/subscribe" && (
          <SubscribePage onBack={() => setLocation("/pricing")} />
        )}
        
        {user && location === "/analysis-payment" && (() => {
          const storedProject = localStorage.getItem('analysisProject');
          const projectData = storedProject ? JSON.parse(storedProject) : null;
          
          if (!projectData) {
            // Redirect back to dashboard if no project data
            setLocation("/dashboard");
            return null;
          }
          
          return (
            <AnalysisPaymentPage 
              projectId={projectData.id || 'unknown'}
              projectData={projectData}
              onBack={() => setLocation("/dashboard")}
              onSuccess={() => setLocation("/dashboard")}
            />
          );
        })()}
        
        {user && location === "/visualizations" && (
          <VisualizationPage 
            onBack={() => setLocation("/dashboard")}
            onPaymentRequired={(projectId, visualizationType) => {
              // Store visualization request for payment
              localStorage.setItem('visualizationRequest', JSON.stringify({ projectId, visualizationType }));
              setLocation("/analysis-payment");
            }}
          />
        )}
        
        {user && location === "/ask-questions" && (
          <AskQuestionPage 
            onBack={() => setLocation("/dashboard")}
            onPaymentRequired={(projectId, questions) => {
              // Store question analysis request for payment
              localStorage.setItem('questionRequest', JSON.stringify({ projectId, questions }));
              setLocation("/analysis-payment");
            }}
          />
        )}
        

      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
