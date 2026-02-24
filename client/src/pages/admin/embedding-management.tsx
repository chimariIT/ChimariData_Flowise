/**
 * Admin Embedding Management Page
 *
 * Sections:
 * 1. Configuration Card — Target dimension, config version
 * 2. Providers Table — Name, status, env var, model, test button
 * 3. Statistics Card — Total embeddings, stale count
 * 4. Provider Order Editor — Reorder providers, save
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cpu,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowUp,
  ArrowDown,
  Save,
  RefreshCw,
  Zap,
  BarChart3,
  Settings,
  AlertTriangle,
} from "lucide-react";

interface ProviderInfo {
  name: string;
  isConfigured: boolean;
  models: {
    id: string;
    name: string;
    nativeDimensions: number;
    maxInput: number;
    supportsBatch: boolean;
    costPer1kTokens?: number;
    supportsMatryoshka?: boolean;
  }[];
  defaultModel: string;
  selectedModel: string;
  orderIndex: number;
  envVars: string[];
}

interface EmbeddingConfig {
  targetDimension: number;
  providerOrder: string[];
  providerModels: Record<string, string>;
  configVersion: number;
  updatedAt: string;
  updatedBy: string;
}

interface EmbeddingStats {
  targetDimension: number;
  configVersion: number;
  total: number;
  current: number;
  stale: number;
  configuredProviders: string[];
  isAvailable: boolean;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export default function EmbeddingManagement() {
  const queryClient = useQueryClient();
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, any>>({});
  const [editConfig, setEditConfig] = useState<EmbeddingConfig | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Fetch config
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["/api/admin/embedding/config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/embedding/config", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load config");
      return res.json();
    },
  });

  // Fetch providers
  const { data: providersData, isLoading: providersLoading } = useQuery({
    queryKey: ["/api/admin/embedding/providers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/embedding/providers", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load providers");
      return res.json();
    },
  });

  // Fetch stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/embedding/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/embedding/stats", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  // Save config mutation
  const saveMutation = useMutation({
    mutationFn: async (config: EmbeddingConfig) => {
      const res = await fetch("/api/admin/embedding/config", {
        method: "PUT",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to save" }));
        throw new Error(err.error || "Failed to save config");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embedding/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embedding/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embedding/providers"] });
      setSaveMessage("Configuration saved successfully");
      setEditConfig(null);
      setTimeout(() => setSaveMessage(null), 3000);
    },
  });

  const config: EmbeddingConfig | null = editConfig || configData?.data || null;
  const providers: ProviderInfo[] = providersData?.data || [];
  const stats: EmbeddingStats | null = statsData?.data || null;

  // Test provider connectivity
  const handleTestProvider = async (name: string) => {
    setTestingProvider(name);
    setTestResult((prev) => ({ ...prev, [name]: null }));
    try {
      const res = await fetch(`/api/admin/embedding/providers/${name}/test`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [name]: data.data }));
    } catch (error: any) {
      setTestResult((prev) => ({
        ...prev,
        [name]: { ok: false, error: error.message },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  // Move provider in order
  const moveProvider = (name: string, direction: "up" | "down") => {
    if (!config) return;
    const order = [...config.providerOrder];
    const idx = order.indexOf(name);
    if (idx === -1) return;
    if (direction === "up" && idx > 0) {
      [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
    } else if (direction === "down" && idx < order.length - 1) {
      [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
    }
    setEditConfig({ ...config, providerOrder: order });
  };

  // Update model for provider
  const updateModel = (providerName: string, modelId: string) => {
    if (!config) return;
    setEditConfig({
      ...config,
      providerModels: { ...config.providerModels, [providerName]: modelId },
    });
  };

  // Update target dimension
  const updateDimension = (dim: number) => {
    if (!config) return;
    setEditConfig({ ...config, targetDimension: dim });
  };

  const handleSave = () => {
    if (!editConfig) return;
    saveMutation.mutate(editConfig);
  };

  const isEditing = editConfig !== null;

  if (configLoading || providersLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-gray-600">Loading embedding configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cpu className="w-6 h-6" />
            Embedding Provider Management
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure embedding providers, manage fallback order, and monitor embedding health.
          </p>
        </div>
        {isEditing && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditConfig(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {saveMessage && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-800">{saveMessage}</AlertDescription>
        </Alert>
      )}

      {saveMutation.error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{(saveMutation.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Statistics Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-500">Total Embeddings</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-500">Current</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats?.current ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-gray-500">Stale</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-600">{stats?.stale ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-500">Config Version</span>
            </div>
            <p className="text-2xl font-bold mt-1">{config?.configVersion ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuration
          </CardTitle>
          <CardDescription>
            Target embedding dimension and global settings.
            {config?.updatedAt && (
              <span className="ml-2 text-xs text-gray-400">
                Last updated: {new Date(config.updatedAt).toLocaleString()} by {config.updatedBy || "system"}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="target-dimension">Target Dimension</Label>
              <Input
                id="target-dimension"
                type="number"
                min={128}
                max={4096}
                value={config?.targetDimension ?? 1536}
                onChange={(e) => updateDimension(parseInt(e.target.value) || 1536)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                All embeddings normalized to this dimension. Changing this bumps config version.
              </p>
            </div>
            <div>
              <Label>Provider Fallback Order</Label>
              <p className="text-sm text-gray-600 mt-1">
                Providers are tried in order. First configured provider wins.
                Use arrows to reorder below.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Providers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Embedding Providers
          </CardTitle>
          <CardDescription>
            {providers.filter((p) => p.isConfigured).length} of {providers.length} providers configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(config?.providerOrder || []).map((name, idx) => {
              const provider = providers.find((p) => p.name === name);
              if (!provider) return null;
              const test = testResult[name];

              return (
                <div
                  key={name}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    provider.isConfigured
                      ? "bg-white border-gray-200"
                      : "bg-gray-50 border-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Order controls */}
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        disabled={idx === 0}
                        onClick={() => moveProvider(name, "up")}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        disabled={idx === (config?.providerOrder?.length ?? 0) - 1}
                        onClick={() => moveProvider(name, "down")}
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>

                    {/* Priority badge */}
                    <span className="text-xs font-mono text-gray-400 w-4">#{idx + 1}</span>

                    {/* Status indicator */}
                    {provider.isConfigured ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-300" />
                    )}

                    {/* Provider name */}
                    <div>
                      <span className="font-medium capitalize">{name}</span>
                      <div className="text-xs text-gray-500">
                        {provider.envVars.map((v) => (
                          <Badge key={v} variant="outline" className="mr-1 text-[10px] px-1 py-0">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Model selector */}
                    {provider.isConfigured && provider.models.length > 0 && (
                      <Select
                        value={config?.providerModels?.[name] || provider.selectedModel}
                        onValueChange={(val) => updateModel(name, val)}
                      >
                        <SelectTrigger className="w-[220px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {provider.models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="text-xs">
                                {m.name} ({m.nativeDimensions}d)
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Test button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestProvider(name)}
                      disabled={testingProvider === name || !provider.isConfigured}
                    >
                      {testingProvider === name ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1" />
                      )}
                      Test
                    </Button>

                    {/* Test result */}
                    {test && (
                      <Badge
                        variant={test.ok ? "default" : "destructive"}
                        className="text-xs whitespace-nowrap"
                      >
                        {test.ok ? `✓ ${test.latencyMs}ms` : `✗ ${test.error?.substring(0, 30)}`}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Show unconfigured providers not in order */}
            {providers
              .filter((p) => !config?.providerOrder?.includes(p.name))
              .map((provider) => (
                <div
                  key={provider.name}
                  className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 border-gray-100 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-[26px]" />
                    <span className="text-xs font-mono text-gray-400 w-4">—</span>
                    <XCircle className="w-4 h-4 text-gray-300" />
                    <div>
                      <span className="font-medium capitalize">{provider.name}</span>
                      <div className="text-xs text-gray-500">
                        {provider.envVars.map((v) => (
                          <Badge key={v} variant="outline" className="mr-1 text-[10px] px-1 py-0">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs text-gray-400">
                    Not configured
                  </Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Dimension Warning */}
      {editConfig && configData?.data?.targetDimension !== editConfig.targetDimension && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Warning:</strong> Changing the target dimension from{" "}
            {configData?.data?.targetDimension} to {editConfig.targetDimension} will increment the
            config version. Existing embeddings will be marked as stale and will need regeneration.
            Note: pgvector columns are currently fixed at 1536 dimensions.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
