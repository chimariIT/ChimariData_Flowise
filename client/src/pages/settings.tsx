import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Settings, Brain, Key, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { auth } from "@/lib/api";

interface SettingsPageProps {
  onBack: () => void;
}

interface AIProviderInfo {
  name: string;
  model: string;
  pricing: string;
  description: string;
}

interface ProvidersData {
  providers: string[];
  info: Record<string, AIProviderInfo>;
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [formData, setFormData] = useState({
    aiProvider: "anthropic",
    aiApiKey: ""
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${auth.getToken()}` }
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
      return res.json() as ProvidersData;
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
        aiProvider: settings.aiProvider || "anthropic",
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
    
    if (!formData.aiApiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter your API key to enable AI features.",
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

  const selectedProviderInfo = providersData?.info[formData.aiProvider];

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
                        {providersData?.providers.map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {providersData.info[provider]?.name || provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="apiKey" className="flex items-center">
                      <Key className="w-4 h-4 mr-1" />
                      API Key
                    </Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Enter your API key"
                      value={formData.aiApiKey}
                      onChange={(e) => handleInputChange("aiApiKey", e.target.value)}
                    />
                    <p className="text-sm text-slate-500 mt-1">
                      Your API key is stored securely and only used for processing your data queries.
                    </p>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={updateSettingsMutation.isPending}
                    className="w-full"
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Provider Information */}
          <div className="lg:col-span-1">
            {selectedProviderInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Info className="w-5 h-5 text-primary mr-2" />
                    Provider Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium text-slate-900">{selectedProviderInfo.name}</h4>
                    <p className="text-sm text-slate-600">{selectedProviderInfo.model}</p>
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-slate-700 mb-1">Pricing</h5>
                    <p className="text-sm text-slate-600">{selectedProviderInfo.pricing}</p>
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-slate-700 mb-1">Description</h5>
                    <p className="text-sm text-slate-600">{selectedProviderInfo.description}</p>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <h5 className="font-medium text-slate-700 mb-2">Getting Your API Key</h5>
                    <div className="text-sm text-slate-600 space-y-1">
                      {formData.aiProvider === "anthropic" && (
                        <>
                          <p>1. Visit console.anthropic.com</p>
                          <p>2. Create an account or sign in</p>
                          <p>3. Go to API Keys section</p>
                          <p>4. Create a new API key</p>
                        </>
                      )}
                      {formData.aiProvider === "openai" && (
                        <>
                          <p>1. Visit platform.openai.com</p>
                          <p>2. Create an account or sign in</p>
                          <p>3. Go to API Keys section</p>
                          <p>4. Create a new secret key</p>
                        </>
                      )}
                      {formData.aiProvider === "gemini" && (
                        <>
                          <p>1. Visit console.cloud.google.com</p>
                          <p>2. Enable the Gemini API</p>
                          <p>3. Create credentials</p>
                          <p>4. Generate an API key</p>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}