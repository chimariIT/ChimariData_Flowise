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
import AnimatedDemo from "./components/animated-demo";
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
          <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
            <div className="border-b bg-white/80 backdrop-blur-sm">
              <div className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary rounded" />
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">ChimariData+AI</h1>
                      <p className="text-sm text-slate-600">Interactive Demo</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setLocation("/")}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            </div>
            <AnimatedDemo onGetStarted={() => setLocation("/auth")} />
          </div>
        )}
        
        {location === "/auth" && (
          <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
              <div className="text-center mb-8">
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <div className="w-8 h-8 bg-primary rounded" />
                  <span className="text-2xl font-bold text-slate-900">ChimariData+AI</span>
                </div>
                <p className="text-slate-600">Welcome back to your data analytics platform</p>
              </div>

              <div className="bg-white rounded-lg shadow-lg border-0 p-6">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold">Sign In</h1>
                </div>
                
                <div className="space-y-3 mb-6">
                  <button 
                    onClick={() => window.location.href = "/auth/google"}
                    className="w-full h-11 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </button>
                  
                  <button 
                    onClick={() => window.location.href = "/auth/microsoft"}
                    className="w-full h-11 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 23 23">
                      <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                      <path fill="#f35325" d="M1 1h10v10H1z"/>
                      <path fill="#81bc06" d="M12 1h10v10H12z"/>
                      <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                      <path fill="#ffba08" d="M12 12h10v10H12z"/>
                    </svg>
                    Sign in with Microsoft
                  </button>
                  
                  <button 
                    onClick={() => window.location.href = "/auth/apple"}
                    className="w-full h-11 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
                    </svg>
                    Sign in with Apple
                  </button>
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">Or continue with email</span>
                  </div>
                </div>

                <form className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                    <input
                      type="text"
                      placeholder="Enter your username"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <input
                      type="password"
                      placeholder="Enter your password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Sign In
                  </button>
                </form>

                <div className="text-center mt-6">
                  <p className="text-gray-600">
                    Don't have an account? 
                    <button className="text-blue-600 hover:text-blue-500 font-medium ml-1">
                      Sign up
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
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
        

      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
