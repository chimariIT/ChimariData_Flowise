import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth } from "./lib/api";
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
import NotFound from "@/pages/not-found";

function App() {
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Check if user is already logged in
    const token = auth.getToken();
    if (token) {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        }
      }
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (userData: { id: number; username: string }) => {
    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
    setLocation("/dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
    auth.logout();
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
          />
        )}
        
        {location === "/demo" && (
          <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold text-center mb-8">DataInsight Pro Demo</h1>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h2 className="text-2xl font-bold mb-4">Data to Insights in Minutes</h2>
                  <p className="mb-4">Upload your data and get instant analytics</p>
                  <div className="space-y-2">
                    <div className="bg-blue-100 p-2 rounded">Step 1: Upload CSV/Excel file</div>
                    <div className="bg-green-100 p-2 rounded">Step 2: Automatic data processing</div>
                    <div className="bg-purple-100 p-2 rounded">Step 3: Interactive visualizations</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h2 className="text-2xl font-bold mb-4">AI Business Insights</h2>
                  <p className="mb-4">Get actionable recommendations powered by AI</p>
                  <div className="space-y-2">
                    <div className="bg-yellow-100 p-2 rounded">Revenue optimization opportunities</div>
                    <div className="bg-red-100 p-2 rounded">Customer behavior predictions</div>
                    <div className="bg-indigo-100 p-2 rounded">Market trend analysis</div>
                  </div>
                </div>
              </div>
              <div className="text-center mt-8">
                <button 
                  onClick={() => setLocation("/auth")}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  Get Started Now
                </button>
              </div>
            </div>
          </div>
        )}
        
        {location === "/auth" && <AuthPage onLogin={handleLogin} />}
        
        {location === "/pay-per-analysis" && (
          <PayPerAnalysis 
            onBack={() => setLocation("/")} 
            onLogin={() => setLocation("/auth")} 
          />
        )}
        
        {location === "/expert-consultation" && (
          <ExpertConsultation onBack={() => setLocation("/")} />
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
            onPayForAnalysis={() => {}}
          />
        )}
        
        {user && location === "/settings" && (
          <SettingsPage 
            onBack={() => setLocation("/dashboard")}
            onPricing={() => setLocation("/pricing")}
          />
        )}
        
        {user && location === "/pricing" && (
          <PricingPage 
            onBack={() => setLocation("/settings")}
            onSubscribe={() => setLocation("/subscribe")}
            currentTier="free"
          />
        )}
        
        {user && location === "/subscribe" && (
          <SubscribePage onBack={() => setLocation("/pricing")} />
        )}
        
        {!user && !["/", "/demo", "/auth", "/pay-per-analysis", "/expert-consultation"].includes(location) && (
          setLocation("/auth")
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
