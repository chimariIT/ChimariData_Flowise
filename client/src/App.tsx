import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
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
  const [currentView, setCurrentView] = useState<"landing" | "auth" | "dashboard" | "project" | "settings" | "pricing" | "subscribe" | "analysis-payment" | "ml-analysis">("landing");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectData, setSelectedProjectData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const token = auth.getToken();
    if (token) {
      // In a real app, you'd verify the token with the server
      // For now, we'll assume it's valid if it exists
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          setCurrentView("dashboard");
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
    setCurrentView("dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
    auth.logout();
    setCurrentView("landing");
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    setCurrentView("project");
  };

  const handleBackToDashboard = () => {
    setSelectedProjectId(null);
    setCurrentView("dashboard");
  };

  const handleSettings = () => {
    setCurrentView("settings");
  };

  const handleBackFromSettings = () => {
    if (selectedProjectId) {
      setCurrentView("project");
    } else {
      setCurrentView("dashboard");
    }
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
        
        {currentView === "landing" && (
          <LandingPage onGetStarted={() => setCurrentView("auth")} />
        )}
        
        {currentView === "auth" && (
          <AuthPage onLogin={handleLogin} />
        )}
        
        {currentView === "dashboard" && user && (
          <Dashboard
            user={user}
            onLogout={handleLogout}
            onProjectSelect={handleProjectSelect}
            onSettings={handleSettings}
          />
        )}
        
        {currentView === "project" && selectedProjectId && (
          <ProjectResults
            projectId={selectedProjectId}
            onBack={handleBackToDashboard}
            onSettings={handleSettings}
            onPayForAnalysis={(projectData) => {
              setSelectedProjectData(projectData);
              setCurrentView("analysis-payment");
            }}
          />
        )}
        
        {currentView === "analysis-payment" && selectedProjectId && selectedProjectData && (
          <AnalysisPaymentPage
            projectId={selectedProjectId}
            projectData={selectedProjectData}
            onBack={() => setCurrentView("project")}
            onSuccess={() => setCurrentView("project")}
          />
        )}
        
        {currentView === "settings" && (
          <SettingsPage 
            onBack={handleBackFromSettings} 
            onPricing={() => setCurrentView("pricing")}
          />
        )}
        
        {currentView === "pricing" && (
          <PricingPage 
            onBack={() => setCurrentView("settings")}
            onSubscribe={(plan) => setCurrentView("subscribe")}
          />
        )}
        
        {currentView === "subscribe" && (
          <SubscribePage onBack={() => setCurrentView("pricing")} />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
