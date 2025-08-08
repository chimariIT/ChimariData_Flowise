import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "@/pages/home-page";
import ProjectPage from "@/pages/project-page";
import DescriptiveStatsPage from "@/pages/descriptive-stats-page";
import VisualizationPage from "@/pages/visualization-page";
import AuthPage from "@/pages/auth";
import GuidedAnalysisCheckout from "@/pages/checkout";
import GuidedAnalysisResults from "@/pages/guided-analysis-results";
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
          setUser(userData.user);
        }
      } catch (error) {
        // Clear invalid token
        localStorage.removeItem('auth_token');
        console.log('No valid authentication found');
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
      localStorage.setItem('auth_token', userData.token);
    }
    setLocation('/'); // Redirect to home after login
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
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
        <Switch>
          <Route path="/" component={() => <HomePage user={user} onLogout={handleLogout} />} />
          <Route path="/project/:id" component={ProjectPage} />
          <Route path="/descriptive-stats/:id" component={DescriptiveStatsPage} />
          <Route path="/visualization/:id" component={VisualizationPage} />
          <Route path="/auth" component={() => <AuthPage onLogin={handleLogin} />} />
          <Route path="/checkout" component={GuidedAnalysisCheckout} />
          <Route path="/guided-analysis/:id" component={GuidedAnalysisResults} />
        </Switch>
        <Toaster />
      </ProjectProvider>
    </QueryClientProvider>
  );
}