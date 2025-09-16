import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Settings, Brain, Key, Info, Crown, BarChart3, AlertTriangle, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { apiClient } from "@/lib/api";

interface SettingsPageProps {
  onBack: () => void;
  onPricing: () => void;
}

interface AIProviderInfo {
  name: string;
  model: string;
  pricing: string;
  description: string;
  tier?: string;
}

interface ProvidersData {
  providers: string[];
  info: Record<string, AIProviderInfo>;
  tiers: Record<string, any>;
}

export default function SettingsPage({ onBack, onPricing }: SettingsPageProps) {
  const [formData, setFormData] = useState({
    aiProvider: "platform",
    aiApiKey: ""
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const { data: providersData } = useQuery({
    queryKey: ["/api/ai/providers"],
    queryFn: async () => {
      const res = await fetch("/api/ai/providers");
      if (!res.ok) throw new Error("Failed to fetch providers");
      return res.json();
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { aiProvider: string; aiApiKey: string }) => {
      const res = await apiRequest("POST", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your AI provider settings have been updated successfully."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        aiProvider: settings.aiProvider || "platform",
        aiApiKey: settings.aiApiKey || ""
      });
    }
  }, [settings]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Platform provider doesn't need API key
    if (formData.aiProvider !== "platform" && !formData.aiApiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter your API key to enable this AI provider.",
        variant: "destructive"
      });
      return;
    }

    updateSettingsMutation.mutate(formData);
  };

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">Loading settings...</p>
      </div>
    );
  }

  const providers = providersData?.providers || [];
  const providerInfo = providersData?.info || {};
  const tiers = providersData?.tiers || {};
  
  // Calculate usage percentage for progress bar
  const usagePercentage = settings?.usageQuota ? 
    Math.min((settings.usageCount / settings.usageQuota) * 100, 100) : 0;
  
  // Get current tier info
  const currentTier = settings?.subscriptionTier || "starter";
  const tierInfo = tiers[currentTier] || { name: "Starter", features: [] };
  
  const selectedProviderInfo = providerInfo[formData.aiProvider];
  
  // Check if provider requires upgrade
  const requiresUpgrade = selectedProviderInfo?.tier && 
    selectedProviderInfo.tier !== "starter" && 
    currentTier === "starter";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center space-x-2">
                <Settings className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold text-slate-900">Settings</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Settings Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">AI Provider Settings</h1>
          <p className="text-slate-600">Configure your AI provider and API key to enable natural language data querying</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="w-5 h-5 text-primary mr-2" />
                  AI Configuration
                </CardTitle>
                <CardDescription>
                  Choose your preferred AI provider and enter your API key to start asking questions about your data in natural language.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label htmlFor="aiProvider">AI Provider</Label>
                    <Select 
                      value={formData.aiProvider} 
                      onValueChange={(value) => handleInputChange("aiProvider", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select AI provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((provider: string) => (
                          <SelectItem key={provider} value={provider}>
                            {providerInfo[provider]?.name || provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* API Key field - only show for non-platform providers */}
                  {formData.aiProvider !== "platform" && (
                    <div>
                      <Label htmlFor="apiKey" className="flex items-center">
                        <Key className="w-4 h-4 mr-1" />
                        API Key
                        {requiresUpgrade && (
                          <Badge variant="secondary" className="ml-2">Upgrade Required</Badge>
                        )}
                      </Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="Enter your API key"
                        value={formData.aiApiKey}
                        onChange={(e) => handleInputChange("aiApiKey", e.target.value)}
                        disabled={requiresUpgrade}
                      />
                      {requiresUpgrade ? (
                        <p className="text-sm text-amber-600 mt-1 flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-1" />
                          This provider requires a Professional plan or higher.
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500 mt-1">
                          Your API key is stored securely and only used for processing your data queries.
                        </p>
                      )}
                    </div>
                  )}

                  {formData.aiProvider === "platform" && (
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-medium text-green-800 mb-2">Platform AI Service</h4>
                      <p className="text-sm text-green-700">
                        You're using our default AI service powered by Google Gemini. No API key required! 
                        This service is included in your plan and ready to use immediately.
                      </p>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    disabled={updateSettingsMutation.isPending || requiresUpgrade}
                    className="w-full"
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>

                  {requiresUpgrade && (
                    <Button 
                      type="button" 
                      onClick={onPricing}
                      className="w-full mt-2"
                      variant="outline"
                    >
                      <Crown className="w-4 h-4 mr-2" />
                      Upgrade to Use This Provider
                    </Button>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Usage Tracking */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 text-primary mr-2" />
                  Usage This Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>AI Queries</span>
                      <span>
                        {settings?.usageCount || 0} / {settings?.usageQuota === -1 ? "∞" : settings?.usageQuota || 50}
                      </span>
                    </div>
                    <Progress value={usagePercentage} className="h-2" />
                  </div>
                  
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant={currentTier === "starter" ? "secondary" : "default"}>
                          {tierInfo.name}
                        </Badge>
                      </div>
                      <Button variant="outline" size="sm" onClick={onPricing}>
                        {currentTier === "starter" ? "Upgrade" : "Change Plan"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Current Plan Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Crown className="w-5 h-5 text-primary mr-2" />
                  Your Plan Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tierInfo.features?.map((feature: string, index: number) => (
                    <div key={index} className="flex items-start space-x-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Provider Information */}
            {selectedProviderInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Info className="w-5 h-5 text-blue-500 mr-2" />
                    {selectedProviderInfo.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600">{selectedProviderInfo.description}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Model:</span>
                      <span>{selectedProviderInfo.model}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Pricing:</span>
                      <span>{selectedProviderInfo.pricing}</span>
                    </div>
                  </div>
                  
                  {formData.aiProvider !== "platform" && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Getting your API key:</strong> Visit the provider's website to create an account and generate an API key. 
                        Keep your key secure and never share it publicly.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}