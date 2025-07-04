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
import NotFound from "@/pages/not-found";

function App() {
  const [user, setUser] = useState<{ id: number; email: string; firstName?: string; lastName?: string; username?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Handle OAuth callback tokens from URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const provider = urlParams.get('provider');
    
    if (tokenFromUrl && provider === 'google') {
      // Store the token
      localStorage.setItem('auth_token', tokenFromUrl);
      
      // Fetch user data with the token
      fetch('/api/user', {
        headers: {
          'Authorization': `Bearer ${tokenFromUrl}`
        }
      })
      .then(res => res.json())
      .then(userData => {
        if (userData.user) {
          setUser(userData.user);
          localStorage.setItem("user", JSON.stringify(userData.user));
          // Clean URL and redirect to dashboard
          window.history.replaceState({}, document.title, "/dashboard");
          setLocation("/dashboard");
        }
      })
      .catch(error => {
        console.error('Error fetching user data:', error);
        localStorage.removeItem("auth_token");
      });
      
      setIsLoading(false);
      return;
    }

    // Check if user is already logged in
    const token = localStorage.getItem('auth_token');
    if (token) {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user");
        }
      }
    }
    setIsLoading(false);
  }, [setLocation]);

  const handleLogin = (userData: { id: number; email: string; firstName?: string; lastName?: string; username?: string }) => {
    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
    setLocation("/dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("auth_token");
    setLocation("/");
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
        
        {user && location === "/analysis-payment" && (
          <AnalysisPaymentPage 
            onBack={() => setLocation("/dashboard")}
            onSuccess={() => setLocation("/dashboard")}
          />
        )}
        

      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
