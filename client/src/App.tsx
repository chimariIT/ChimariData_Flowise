import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "@/pages/home-page";
import ProjectPage from "@/pages/project-page";
import DescriptiveStatsPage from "@/pages/descriptive-stats-page";
import AuthPage from "@/pages/auth";
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
  const [, setLocation] = useLocation();

  const handleLogin = (userData: any) => {
    setUser(userData);
    setLocation('/'); // Redirect to home after login
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <Switch>
          <Route path="/" component={HomePage} />
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