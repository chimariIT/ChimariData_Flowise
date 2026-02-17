/**
 * Admin Database Optimization Page
 * P2-3: Slow queries, index health, migration status, DB health dashboard
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Database,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  HardDrive,
  Activity,
  Gauge,
} from "lucide-react";
import { apiClient } from "@/lib/api";

export default function DatabaseOptimization() {
  // Fetch DB health
  const { data: dbHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ["/api/admin/database/optimization/health"],
    queryFn: async () => {
      const response = await apiClient.get("/api/admin/database/optimization/health");
      return response?.data || response;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  // Fetch slow queries
  const { data: slowQueries, isLoading: sqLoading } = useQuery({
    queryKey: ["/api/admin/database/optimization/slow-queries"],
    queryFn: async () => {
      const response = await apiClient.get("/api/admin/database/optimization/slow-queries");
      return response?.data || response;
    },
    staleTime: 30000,
  });

  // Fetch DB status
  const { data: dbStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/admin/database/status"],
    queryFn: async () => {
      const response = await apiClient.get("/api/admin/database/status");
      return response?.data || response;
    },
    staleTime: 30000,
  });

  // Fetch optimization metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/admin/database/optimization/metrics"],
    queryFn: async () => {
      const response = await apiClient.get("/api/admin/database/optimization/metrics");
      return response?.data || response;
    },
    staleTime: 30000,
  });

  const health = dbHealth || {};
  const queries = slowQueries?.queries || slowQueries || [];
  const status = dbStatus || {};
  const optMetrics = metrics || {};

  const isLoading = healthLoading || sqLoading || statusLoading || metricsLoading;

  const getHealthColor = (val: string | boolean | undefined) => {
    if (val === true || val === "healthy" || val === "ok") return "text-green-600";
    if (val === false || val === "unhealthy" || val === "error") return "text-red-600";
    return "text-yellow-600";
  };

  return (
    <div className="space-y-6">
      {/* Health Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Connection Pool</p>
                <p className={`text-2xl font-bold ${getHealthColor(status.connected || health.connected)}`}>
                  {status.connected || health.connected ? "Active" : "—"}
                </p>
              </div>
              <Database className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Connections</p>
                <p className="text-2xl font-bold">{status.activeConnections ?? health.activeConnections ?? "—"}</p>
              </div>
              <Activity className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Slow Queries (24h)</p>
                <p className="text-2xl font-bold">{Array.isArray(queries) ? queries.length : "—"}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">DB Size</p>
                <p className="text-2xl font-bold">{health.dbSize || status.dbSize || "—"}</p>
              </div>
              <HardDrive className="w-8 h-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DB Health Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5" />
                Database Health
              </CardTitle>
              <CardDescription>PostgreSQL connection pool and performance metrics</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchHealth()}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading health data...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Connection Pool */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-gray-700">Connection Pool</h4>
                {[
                  { label: "Total Connections", value: status.totalConnections ?? health.totalConnections },
                  { label: "Idle Connections", value: status.idleConnections ?? health.idleConnections },
                  { label: "Waiting Queries", value: status.waitingQueries ?? health.waitingQueries },
                  { label: "Statement Timeout", value: status.statementTimeout ?? health.statementTimeout },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1 border-b">
                    <span className="text-sm text-gray-600">{label}</span>
                    <span className="text-sm font-medium">{value ?? "—"}</span>
                  </div>
                ))}
              </div>

              {/* Optimization Metrics */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-gray-700">Performance</h4>
                {[
                  { label: "Avg Query Time", value: optMetrics.avgQueryTime ? `${optMetrics.avgQueryTime}ms` : undefined },
                  { label: "Cache Hit Ratio", value: optMetrics.cacheHitRatio ? `${optMetrics.cacheHitRatio}%` : undefined },
                  { label: "Index Hit Ratio", value: optMetrics.indexHitRatio ? `${optMetrics.indexHitRatio}%` : undefined },
                  { label: "Deadlocks", value: optMetrics.deadlocks },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1 border-b">
                    <span className="text-sm text-gray-600">{label}</span>
                    <span className="text-sm font-medium">{value ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slow Queries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Slow Query Log
          </CardTitle>
          <CardDescription>
            Queries exceeding the statement timeout threshold
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Array.isArray(queries) && queries.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queries.slice(0, 50).map((query: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="max-w-[400px]">
                        <code className="text-xs bg-gray-50 p-1 rounded block truncate">
                          {query.query || query.sql || "—"}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={Number(query.duration) > 10000 ? "text-red-600" : "text-orange-600"}>
                          {query.duration ? `${query.duration}ms` : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {query.timestamp ? new Date(query.timestamp).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{query.state || "—"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>No slow queries detected. Database performance is within normal parameters.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Migration Status */}
      {(health.migrations || status.migrations) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Migration Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(health.migrations || status.migrations || []).map((migration: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    {migration.applied ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    )}
                    <span className="text-sm">{migration.name || migration.id || `Migration ${idx + 1}`}</span>
                  </div>
                  <Badge variant={migration.applied ? "default" : "outline"}>
                    {migration.applied ? "Applied" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
