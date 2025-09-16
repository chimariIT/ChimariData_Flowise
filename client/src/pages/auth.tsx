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

              <OAuthProviders showTitle={false} />

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
