import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface PerformanceStats {
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  threshold: number;
}

interface PerformanceData {
  [operation: string]: PerformanceStats;
}

export function PerformanceDashboard() {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/performance-stats');
      if (response.ok) {
        const data = await response.json();
        setPerformanceData(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch performance data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformanceData();
    const interval = setInterval(fetchPerformanceData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (avgDuration: number, threshold: number) => {
    if (avgDuration <= threshold * 0.8) return 'bg-green-100 text-green-800';
    if (avgDuration <= threshold) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getStatusIcon = (avgDuration: number, threshold: number) => {
    if (avgDuration <= threshold * 0.8) return <CheckCircle className="h-4 w-4" />;
    if (avgDuration <= threshold) return <Clock className="h-4 w-4" />;
    return <AlertTriangle className="h-4 w-4" />;
  };

  const formatOperationName = (operation: string) => {
    return operation
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const operations = Object.entries(performanceData);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Performance Dashboard</h2>
          <p className="text-gray-600">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <Button
          onClick={fetchPerformanceData}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && operations.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {operations.map(([operation, stats]) => (
            <Card key={operation} className="relative">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>{formatOperationName(operation)}</span>
                  <Badge
                    className={getStatusColor(stats.avgDuration, stats.threshold)}
                  >
                    {getStatusIcon(stats.avgDuration, stats.threshold)}
                    <span className="ml-1">
                      {stats.avgDuration}ms
                    </span>
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Count</div>
                    <div className="font-semibold">{stats.count}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Threshold</div>
                    <div className="font-semibold">{stats.threshold}ms</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Min</div>
                    <div className="font-semibold">{stats.minDuration}ms</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Max</div>
                    <div className="font-semibold">{stats.maxDuration}ms</div>
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <div className="text-sm text-gray-500 mb-1">P95 Duration</div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          stats.p95Duration <= stats.threshold
                            ? 'bg-green-500'
                            : stats.p95Duration <= stats.threshold * 1.2
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            (stats.p95Duration / stats.threshold) * 100,
                            100
                          )}%`
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold">
                      {stats.p95Duration}ms
                    </span>
                  </div>
                </div>

                {stats.avgDuration > stats.threshold && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    ⚠️ Average response time exceeds threshold
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {operations.length === 0 && !loading && (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="text-center text-gray-500">
              <Clock className="h-8 w-8 mx-auto mb-2" />
              <p>No performance data available</p>
              <p className="text-sm">Performance metrics will appear as operations are executed</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PerformanceDashboard;
