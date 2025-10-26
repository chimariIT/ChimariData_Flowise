import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  RefreshCw, 
  Server, 
  Database, 
  Brain, 
  Zap, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Activity,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { 
  LoadingSpinner, 
  ProgressIndicator, 
  OperationStatus, 
  MultiAgentStatus,
  PerformanceIndicator 
} from './feedback';

interface SystemStatus {
  overall: 'healthy' | 'degraded' | 'down';
  services: {
    database: ServiceStatus;
    agents: ServiceStatus;
    api: ServiceStatus;
    storage: ServiceStatus;
  };
  performance: {
    avgResponseTime: number;
    activeConnections: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  agents: Array<{
    id: string;
    name: string;
    status: 'idle' | 'working' | 'error';
    currentTask?: string;
    lastActivity: string;
  }>;
}

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  lastCheck: string;
  uptime: string;
}

interface SystemDashboardProps {
  className?: string;
}

export function SystemDashboard({ className }: SystemDashboardProps) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchSystemStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/system-status');
      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
        return 'bg-green-100 text-green-800';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800';
      case 'down':
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
        return <CheckCircle className="w-4 h-4" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4" />;
      case 'down':
      case 'error':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  if (loading && !systemStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!systemStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Unable to load system status</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">System Dashboard</h2>
          <p className="text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <Button
          onClick={fetchSystemStatus}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overall Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="w-5 h-5" />
            <span>System Health</span>
            <Badge className={getStatusColor(systemStatus.overall)}>
              {getStatusIcon(systemStatus.overall)}
              <span className="ml-1 capitalize">{systemStatus.overall}</span>
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {systemStatus.performance.avgResponseTime}ms
              </div>
              <div className="text-sm text-muted-foreground">Avg Response Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {systemStatus.performance.activeConnections}
              </div>
              <div className="text-sm text-muted-foreground">Active Connections</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {systemStatus.performance.memoryUsage}%
              </div>
              <div className="text-sm text-muted-foreground">Memory Usage</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {systemStatus.performance.cpuUsage}%
              </div>
              <div className="text-sm text-muted-foreground">CPU Usage</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Services Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="w-5 h-5" />
              <span>Services</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(systemStatus.services).map(([service, status]) => (
              <div key={service} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(status.status)}
                  <div>
                    <div className="font-medium capitalize">{service}</div>
                    <div className="text-sm text-muted-foreground">
                      Last check: {status.lastCheck}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={getStatusColor(status.status)}>
                    {status.status}
                  </Badge>
                  {status.responseTime && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {status.responseTime}ms
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Agent Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="w-5 h-5" />
              <span>Agents</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {systemStatus.agents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  {agent.status === 'working' ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    getStatusIcon(agent.status)
                  )}
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    {agent.currentTask && (
                      <div className="text-sm text-muted-foreground">
                        {agent.currentTask}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Last activity: {agent.lastActivity}
                    </div>
                  </div>
                </div>
                <Badge className={getStatusColor(agent.status)}>
                  {agent.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="w-5 h-5" />
            <span>Performance Metrics</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <PerformanceIndicator
              operation="Database Query"
              duration={systemStatus.performance.avgResponseTime}
              threshold={50}
            />
            <PerformanceIndicator
              operation="Agent Coordination"
              duration={systemStatus.performance.avgResponseTime * 2}
              threshold={200}
            />
            <PerformanceIndicator
              operation="API Response"
              duration={systemStatus.performance.avgResponseTime * 0.5}
              threshold={100}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SystemDashboard;
