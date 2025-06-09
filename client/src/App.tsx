import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth } from "./lib/api";
import AuthPage from "./pages/auth";
import Dashboard from "./pages/dashboard";
import ProjectResults from "./pages/project-results";
import NotFound from "@/pages/not-found";

function App() {
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);
  const [currentView, setCurrentView] = useState<"auth" | "dashboard" | "project">("auth");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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
    setCurrentView("auth");
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    setCurrentView("project");
  };

  const handleBackToDashboard = () => {
    setSelectedProjectId(null);
    setCurrentView("dashboard");
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
        
        {currentView === "auth" && (
          <AuthPage onLogin={handleLogin} />
        )}
        
        {currentView === "dashboard" && user && (
          <Dashboard
            user={user}
            onLogout={handleLogout}
            onProjectSelect={handleProjectSelect}
          />
        )}
        
        {currentView === "project" && selectedProjectId && (
          <ProjectResults
            projectId={selectedProjectId}
            onBack={handleBackToDashboard}
          />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
