import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { ChartLine, Upload, Brain, BarChart } from "lucide-react";
import { OAuthProviders } from "@/components/oauth-providers";
import ForgotPasswordModal from "@/components/forgot-password-modal";

interface AuthPageProps {
  onLogin: (user: { id: string; email: string; firstName?: string; lastName?: string; username?: string }) => void;
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: ""
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!isLogin && formData.password !== formData.confirmPassword) {
        throw new Error("Passwords do not match");
      }

      const result = isLogin 
        ? await apiClient.login({ email: formData.email, password: formData.password })
        : await apiClient.register({ 
            email: formData.email, 
            firstName: formData.firstName,
            lastName: formData.lastName,
            password: formData.password 
          });

      if (result.user) {
        // Store auth token in localStorage
        if (result.token) {
          localStorage.setItem('auth_token', result.token);
        }
        onLogin(result.user);
      }
      
      toast({
        title: "Success",
        description: isLogin ? "Welcome back!" : "Account created successfully!"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Authentication failed",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-purple-700 p-12 flex-col justify-center items-center text-white">
        {/* Data visualization background */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mb-8 w-full max-w-md">
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="h-16 bg-white/20 rounded-lg flex items-end p-2">
              <div className="w-full h-8 bg-white/40 rounded"></div>
            </div>
            <div className="h-16 bg-white/20 rounded-lg flex items-end p-2">
              <div className="w-full h-12 bg-white/40 rounded"></div>
            </div>
            <div className="h-16 bg-white/20 rounded-lg flex items-end p-2">
              <div className="w-full h-6 bg-white/40 rounded"></div>
            </div>
            <div className="h-16 bg-white/20 rounded-lg flex items-end p-2">
              <div className="w-full h-10 bg-white/40 rounded"></div>
            </div>
          </div>
          <div className="text-center">
            <ChartLine className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm opacity-90">Transform Data into Insights</p>
          </div>
        </div>
        
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">ChimariData+AI</h1>
          <p className="text-xl opacity-90 leading-relaxed mb-8">
            Upload, analyze, and visualize your data with powerful AI-driven insights. 
            Make data-driven decisions with confidence.
          </p>
          <div className="flex items-center justify-center space-x-6">
            <div className="text-center">
              <Upload className="w-6 h-6 mx-auto mb-2" />
              <p className="text-sm">Easy Upload</p>
            </div>
            <div className="text-center">
              <Brain className="w-6 h-6 mx-auto mb-2" />
              <p className="text-sm">AI Insights</p>
            </div>
            <div className="text-center">
              <BarChart className="w-6 h-6 mx-auto mb-2" />
              <p className="text-sm">Visualization</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Authentication Forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl">
                {isLogin ? "Welcome Back" : "Create Account"}
              </CardTitle>
              <CardDescription>
                {isLogin 
                  ? "Sign in to your account to continue" 
                  : "Get started with your data analysis journey"
                }
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                {!isLogin && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          name="firstName"
                          type="text"
                          placeholder="First name"
                          value={formData.firstName}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          name="lastName"
                          type="text"
                          placeholder="Last name"
                          value={formData.lastName}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}
                
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {isLogin && (
                      <Button
                        type="button"
                        variant="link"
                        className="p-0 h-auto text-xs text-primary"
                        onClick={() => setIsForgotPasswordOpen(true)}
                      >
                        Forgot password?
                      </Button>
                    )}
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={isLogin ? "Enter your password" : "Create a secure password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                  {!isLogin && (
                    <p className="text-xs text-muted-foreground mt-1">
                      At least 8 characters with at least one Large cap and at least alpha character or numeric character.
                    </p>
                  )}
                </div>

                {!isLogin && (
                  <div>
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : (isLogin ? "Sign In" : "Create Account")}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="lg"
                className="w-full flex items-center gap-3 h-12"
                onClick={() => window.location.href = '/api/auth/google'}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </Button>
              
              <p className="text-xs text-center text-muted-foreground mt-3">
                Secure authentication with your Google account
              </p>

              <div className="text-center mt-6">
                <p className="text-slate-600">
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                  <button 
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-primary hover:text-primary/80 font-medium underline"
                  >
                    {isLogin ? "Sign up" : "Sign in"}
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Forgot Password Modal */}
          <ForgotPasswordModal
            isOpen={isForgotPasswordOpen}
            onClose={() => setIsForgotPasswordOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
