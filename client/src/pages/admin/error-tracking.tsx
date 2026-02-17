/**
 * Admin Error Tracking Page
 * P2-2: Error statistics, circuit breaker status, and reset controls
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Activity,
  RotateCcw,
  Zap,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function ErrorTracking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch error statistics
  const { data: errorStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/errors/statistics"],
    queryFn: async () => {
      const response = await apiClient.get("/api/admin/errors/statistics");
      return response?.data || response;
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // Fetch circuit breaker status
  const { data: circuitBreakers, isLoading: cbLoading } = useQuery({
    queryKey: ["/api/admin/circuit-breakers/status"],
    queryFn: async () => {
      const response = await apiClient.get("/api/admin/circuit-breakers/status");
      return response?.data || response;
    },
    staleTime: 10000,
    refetchInterval: 15000,
  });

  // Reset circuit breaker mutation
  const resetCBMutation = useMutation({
    mutationFn: async (name?: string) => {
      if (name) {
        return apiClient.post(`/api/admin/errors/circuit-breakers/${name}/reset`);
      }
      return apiClient.post("/api/admin/circuit-breakers/reset");
    },
    onSuccess: () => {
      toast({ title: "Circuit Breaker Reset", description: "Circuit breaker has been reset to closed state." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/circuit-breakers/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/errors/statistics"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reset circuit breaker", variant: "destructive" });
    },
  });

  const getCBStatusColor = (state: string) => {
    switch (state?.toLowerCase()) {
      case "closed": return "bg-green-100 text-green-800";
      case "open": return "bg-red-100 text-red-800";
      case "half-open": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getCBStatusIcon = (state: string) => {
    switch (state?.toLowerCase()) {
      case "closed": return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "open": return <AlertCircle className="w-4 h-4 text-red-600" />;
      case "half-open": return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const stats = errorStats?.statistics || errorStats || {};
  const breakers = circuitBreakers?.breakers || circuitBreakers?.circuitBreakers || circuitBreakers || [];
  const breakerList = Array.isArray(breakers) ? breakers : Object.entries(breakers).map(([name, data]: [string, any]) => ({ name, ...data }));

  return (
    <div className="space-y-6">
      {/* Error Statistics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Errors (24h)</p>
                <p className="text-2xl font-bold">{stats.totalErrors24h ?? stats.total ?? "—"}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Error Rate</p>
                <p className="text-2xl font-bold">{stats.errorRate ? `${stats.errorRate}%` : "—"}</p>
              </div>
              <Activity className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Open Breakers</p>
                <p className="text-2xl font-bold">
                  {breakerList.filter((b: any) => b.state === "open").length}
                </p>
              </div>
              <ShieldAlert className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Healthy Breakers</p>
                <p className="text-2xl font-bold">
                  {breakerList.filter((b: any) => b.state === "closed").length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Circuit Breakers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Circuit Breakers
              </CardTitle>
              <CardDescription>
                Monitor and manage circuit breaker states for service reliability
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetCBMutation.mutate(undefined)}
              disabled={resetCBMutation.isPending}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cbLoading || statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading...
            </div>
          ) : breakerList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {breakerList.map((breaker: any) => (
                <Card key={breaker.name} className="border">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getCBStatusIcon(breaker.state)}
                        <span className="font-medium text-sm">{breaker.name}</span>
                      </div>
                      <Badge className={getCBStatusColor(breaker.state)}>
                        {breaker.state || "unknown"}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-500">
                      {breaker.failures !== undefined && (
                        <div>Failures: {breaker.failures} / {breaker.threshold || "—"}</div>
                      )}
                      {breaker.lastFailure && (
                        <div>Last Failure: {new Date(breaker.lastFailure).toLocaleString()}</div>
                      )}
                      {breaker.successCount !== undefined && (
                        <div>Successes: {breaker.successCount}</div>
                      )}
                    </div>
                    {breaker.state !== "closed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => resetCBMutation.mutate(breaker.name)}
                        disabled={resetCBMutation.isPending}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>No circuit breakers registered or all systems nominal.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Error Categories */}
      {stats.byCategory && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Errors by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.byCategory).map(([category, count]: [string, any]) => (
                <div key={category} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm font-medium capitalize">{category.replace(/_/g, " ")}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
