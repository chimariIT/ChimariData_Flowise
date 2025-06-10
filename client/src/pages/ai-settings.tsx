import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Bot, Key, Info, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AISettingsProps {
  onBack: () => void;
}

interface AIProviderInfo {
  name: string;
  model: string;
  pricing: string;
  description: string;
  tier: string;
  requiresApiKey: boolean;
  setupInstructions?: string;
}

interface UserSettings {
  aiProvider: string;
  aiApiKey: string | null;
  subscriptionTier: string;
  usageQuota: number;
  usageCount: number;
}

export default function AISettingsPage({ onBack }: AISettingsProps) {
  const [selectedProvider, setSelectedProvider] = useState("platform");
  const [apiKey, setApiKey] = useState("");
  const [isTestingKey, setIsTestingKey] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch AI providers info
  const { data: providersData } = useQuery({
    queryKey: ["/api/ai/providers"],
  });

  // Fetch user settings
  const { data: userSettings } = useQuery({
    queryKey: ["/api/user/settings"],
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { aiProvider: string; aiApiKey?: string }) => {
      return await apiRequest("POST", "/api/user/settings", data);
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Your AI provider settings have been saved successfully."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update settings",
        variant: "destructive"
      });
    }
  });

  // Test API key mutation
  const testApiKeyMutation = useMutation({
    mutationFn: async (data: { provider: string; apiKey: string }) => {
      return await apiRequest("POST", "/api/ai/test-key", data);
    },
    onSuccess: (data) => {
      toast({
        title: "API Key Valid",
        description: `Successfully connected to ${selectedProvider}. ${data.message || ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "API Key Invalid",
        description: error.message || "Please check your API key and try again",
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    if (userSettings) {
      setSelectedProvider(userSettings.aiProvider || "platform");
      setApiKey(userSettings.aiApiKey || "");
    }
  }, [userSettings]);

  const handleSaveSettings = () => {
    const data: { aiProvider: string; aiApiKey?: string } = {
      aiProvider: selectedProvider
    };

    if (selectedProvider !== "platform" && apiKey.trim()) {
      data.aiApiKey = apiKey.trim();
    }

    updateSettingsMutation.mutate(data);
  };

  const handleTestApiKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: "Missing API Key",
        description: "Please enter your API key first",
        variant: "destructive"
      });
      return;
    }

    setIsTestingKey(true);
    testApiKeyMutation.mutate(
      { provider: selectedProvider, apiKey: apiKey.trim() },
      {
        onSettled: () => setIsTestingKey(false)
      }
    );
  };

  const providers = providersData?.providers || {};
  const currentProvider = providers[selectedProvider] as AIProviderInfo;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center space-x-2">
                <Bot className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold text-slate-900">AI Settings</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">AI Provider Configuration</h1>
          <p className="text-slate-600">Choose your preferred AI service and configure API access for enhanced analytics.</p>
        </div>

        {/* Current Usage Stats */}
        {userSettings && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bot className="w-5 h-5" />
                <span>Current Usage</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-slate-600">Queries This Month</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {userSettings.usageCount} / {userSettings.usageQuota}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Current Provider</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {providers[userSettings.aiProvider]?.name || userSettings.aiProvider}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Subscription Tier</p>
                  <Badge variant="secondary" className="mt-1">
                    {userSettings.subscriptionTier}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Provider Selection */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Choose AI Provider</CardTitle>
            <p className="text-sm text-slate-600">
              Select between our platform service or configure your own API keys for direct access to major LLM providers.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="provider">AI Provider</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an AI provider" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(providers).map(([key, provider]: [string, any]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center justify-between w-full">
                        <span>{provider.name}</span>
                        {!provider.requiresApiKey && (
                          <Badge variant="secondary" className="ml-2">Included</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Provider Details */}
            {currentProvider && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{currentProvider.name}</h3>
                    <p className="text-sm text-slate-600">{currentProvider.model}</p>
                  </div>
                  <Badge variant={currentProvider.requiresApiKey ? "default" : "secondary"}>
                    {currentProvider.tier}
                  </Badge>
                </div>
                <p className="text-sm text-slate-700">{currentProvider.description}</p>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <Info className="w-3 h-3" />
                  <span>Pricing: {currentProvider.pricing}</span>
                </div>
              </div>
            )}

            {/* API Key Configuration */}
            {currentProvider?.requiresApiKey && (
              <div className="space-y-4 p-4 border border-amber-200 bg-amber-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-amber-800">API Key Required</span>
                </div>
                
                {currentProvider.setupInstructions && (
                  <div className="text-sm text-amber-700 mb-3">
                    <p>{currentProvider.setupInstructions}</p>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-amber-700 underline"
                      onClick={() => {
                        const urls: Record<string, string> = {
                          'anthropic': 'https://console.anthropic.com',
                          'openai': 'https://platform.openai.com',
                          'gemini': 'https://ai.google.dev'
                        };
                        window.open(urls[selectedProvider], '_blank');
                      }}
                    >
                      Get API Key <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder={`Enter your ${currentProvider.name} API key`}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleTestApiKey}
                      disabled={isTestingKey || !apiKey.trim()}
                    >
                      {isTestingKey ? "Testing..." : "Test"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end space-x-4">
              <Button variant="outline" onClick={onBack}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveSettings}
                disabled={updateSettingsMutation.isPending}
              >
                {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Provider Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Provider Comparison</CardTitle>
            <p className="text-sm text-slate-600">
              Compare features and pricing across different AI providers.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Provider</th>
                    <th className="text-left p-3">Model</th>
                    <th className="text-left p-3">Setup</th>
                    <th className="text-left p-3">Pricing</th>
                    <th className="text-left p-3">Best For</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(providers).map(([key, provider]: [string, any]) => (
                    <tr key={key} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{provider.name}</span>
                          {key === selectedProvider && (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-slate-600">{provider.model}</td>
                      <td className="p-3">
                        {provider.requiresApiKey ? (
                          <Badge variant="outline">API Key Required</Badge>
                        ) : (
                          <Badge variant="secondary">Ready to Use</Badge>
                        )}
                      </td>
                      <td className="p-3 text-sm text-slate-600">{provider.pricing}</td>
                      <td className="p-3 text-sm text-slate-600">
                        {key === 'platform' && 'Getting Started'}
                        {key === 'anthropic' && 'Complex Analysis'}
                        {key === 'openai' && 'Balanced Performance'}
                        {key === 'gemini' && 'Multimodal Data'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}