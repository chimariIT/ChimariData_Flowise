import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "@/pages/home-page";
import ProjectPage from "@/pages/project-page";
import DescriptiveStatsPage from "@/pages/descriptive-stats-page";
import AuthPage from "@/pages/auth";
import GuidedAnalysisCheckout from "@/pages/checkout";
import GuidedAnalysisResults from "@/pages/guided-analysis-results";
import { apiClient } from "@/lib/api";
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
        const token = localStorage.getItem('authToken');
        if (token) {
          const userData = await apiClient.getCurrentUser();
          setUser(userData.user);
        }
      } catch (error) {
        // Clear invalid token
        localStorage.removeItem('authToken');
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
      localStorage.setItem('authToken', userData.token);
    }
    setLocation('/'); // Redirect to home after login
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('authToken');
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
      <div className="min-h-screen bg-gray-50">
        <Switch>
          <Route path="/">
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
          <Route path="/checkout">
            {() => <GuidedAnalysisCheckout />}
          </Route>
          <Route path="/guided-analysis-results/:analysisId">
            {(params) => user ? <GuidedAnalysisResults /> : <AuthPage onLogin={handleLogin} />}
          </Route>
          <Route path="/dashboard">
            {() => user ? <ProjectPage projectId="dashboard" /> : <AuthPage onLogin={handleLogin} />}
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
    </QueryClientProvider>
  );
}