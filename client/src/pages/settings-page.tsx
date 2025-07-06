import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Save, Key, Shield, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AISettings {
  geminiApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  useChimariDataKeys: boolean;
}

interface SettingsPageProps {
  onBack?: () => void;
  onPricing?: () => void;
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  // Get user from localStorage since we're using localStorage auth
  const [user, setUser] = useState<{ id: string; email: string; firstName?: string; lastName?: string; username?: string } | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);
  const { toast } = useToast();
  const [showKeys, setShowKeys] = useState({
    gemini: false,
    anthropic: false,
    openai: false
  });

  const [settings, setSettings] = useState<AISettings>({
    geminiApiKey: "",
    anthropicApiKey: "",
    openaiApiKey: "",
    useChimariDataKeys: true
  });

  // Fetch current AI settings
  const { data: currentSettings, isLoading } = useQuery({
    queryKey: ["/api/ai-settings"],
    enabled: !!user,
  });

  // Update settings when data loads
  useEffect(() => {
    if (currentSettings) {
      setSettings(prev => ({
        ...prev,
        ...currentSettings,
        useChimariDataKeys: !currentSettings.geminiApiKey && !currentSettings.anthropicApiKey && !currentSettings.openaiApiKey
      }));
    }
  }, [currentSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: AISettings) => {
      const response = await apiRequest("POST", "/api/ai-settings", newSettings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-settings"] });
      toast({
        title: "Settings saved",
        description: "Your AI provider settings have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveSettingsMutation.mutate(settings);
  };

  const toggleKeyVisibility = (provider: 'gemini' | 'anthropic' | 'openai') => {
    setShowKeys(prev => ({
      ...prev,
      [provider]: !prev[provider]
    }));
  };

  const maskKey = (key: string) => {
    if (!key) return "";
    return key.substring(0, 8) + "•".repeat(Math.max(0, key.length - 12)) + key.substring(Math.max(8, key.length - 4));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          {onBack && (
            <Button variant="ghost" onClick={onBack} size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Configure your AI analysis preferences and API keys
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              AI Provider Configuration
            </CardTitle>
            <CardDescription>
              Choose between using ChimariData's built-in AI providers or configure your own API keys for enhanced control.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Default Provider Option */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <h4 className="font-medium">Use ChimariData AI Providers</h4>
                    <Badge variant="secondary">Recommended</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Our managed AI service with Gemini, Anthropic Claude, and OpenAI with intelligent fallback
                  </p>
                </div>
                <Button
                  variant={settings.useChimariDataKeys ? "default" : "outline"}
                  onClick={() => setSettings(prev => ({ 
                    ...prev, 
                    useChimariDataKeys: true,
                    geminiApiKey: "",
                    anthropicApiKey: "",
                    openaiApiKey: ""
                  }))}
                >
                  {settings.useChimariDataKeys ? "Active" : "Use Default"}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Custom API Keys Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Custom API Keys</h4>
                <Button
                  variant={!settings.useChimariDataKeys ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSettings(prev => ({ ...prev, useChimariDataKeys: false }))}
                >
                  Use Custom Keys
                </Button>
              </div>

              <div className="grid gap-4">
                {/* Gemini API Key */}
                <div className="space-y-2">
                  <Label htmlFor="gemini-key">Gemini API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="gemini-key"
                        type={showKeys.gemini ? "text" : "password"}
                        placeholder="Enter your Gemini API key"
                        value={showKeys.gemini ? settings.geminiApiKey : maskKey(settings.geminiApiKey || "")}
                        onChange={(e) => setSettings(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                        disabled={settings.useChimariDataKeys}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => toggleKeyVisibility('gemini')}
                        disabled={settings.useChimariDataKeys}
                      >
                        {showKeys.gemini ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your API key from <a href="https://makersuite.google.com/app/apikey" target="_blank" className="underline">Google AI Studio</a>
                  </p>
                </div>

                {/* Anthropic API Key */}
                <div className="space-y-2">
                  <Label htmlFor="anthropic-key">Anthropic API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="anthropic-key"
                        type={showKeys.anthropic ? "text" : "password"}
                        placeholder="Enter your Anthropic API key"
                        value={showKeys.anthropic ? settings.anthropicApiKey : maskKey(settings.anthropicApiKey || "")}
                        onChange={(e) => setSettings(prev => ({ ...prev, anthropicApiKey: e.target.value }))}
                        disabled={settings.useChimariDataKeys}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => toggleKeyVisibility('anthropic')}
                        disabled={settings.useChimariDataKeys}
                      >
                        {showKeys.anthropic ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your API key from <a href="https://console.anthropic.com/" target="_blank" className="underline">Anthropic Console</a>
                  </p>
                </div>

                {/* OpenAI API Key */}
                <div className="space-y-2">
                  <Label htmlFor="openai-key">OpenAI API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="openai-key"
                        type={showKeys.openai ? "text" : "password"}
                        placeholder="Enter your OpenAI API key"
                        value={showKeys.openai ? settings.openaiApiKey : maskKey(settings.openaiApiKey || "")}
                        onChange={(e) => setSettings(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                        disabled={settings.useChimariDataKeys}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => toggleKeyVisibility('openai')}
                        disabled={settings.useChimariDataKeys}
                      >
                        {showKeys.openai ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" className="underline">OpenAI Platform</a>
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {settings.useChimariDataKeys 
                  ? "Using ChimariData's managed AI service with intelligent failover"
                  : "Using your custom API keys with fallback to ChimariData providers"
                }
              </p>
              <Button 
                onClick={handleSave} 
                disabled={saveSettingsMutation.isPending}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saveSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}