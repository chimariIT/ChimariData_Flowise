// client/src/pages/admin/tools-management.tsx
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Settings, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Play, 
  Pause, 
  Trash2,
  Eye,
  Edit,
  Download,
  Upload,
  Filter,
  RefreshCw,
  Activity,
  Zap,
  Database,
  Globe,
  Code,
  Puzzle
} from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  status: 'active' | 'inactive' | 'maintenance' | 'deprecated' | 'error';
  tags: string[];
  metrics: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    uptime: number;
    errorRate: number;
    userSatisfactionScore: number;
  };
  pricing: {
    model: string;
    costPerExecution?: number;
  };
  permissions: {
    userTypes: string[];
    subscriptionTiers: string[];
  };
  createdAt: string;
  updatedAt: string;
}

interface ToolExecution {
  id: string;
  toolId: string;
  userId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  duration?: number;
  cost: number;
}

interface SystemMetrics {
  totalTools: number;
  activeTools: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  totalCost: number;
  toolsByCategory: Record<string, number>;
}

const ToolsManagement: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [executions, setExecutions] = useState<ToolExecution[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  
  // Modal states
  const [showAddTool, setShowAddTool] = useState(false);
  const [showToolDetails, setShowToolDetails] = useState(false);
  const [showExecutionLogs, setShowExecutionLogs] = useState(false);
  const [newToolData, setNewToolData] = useState({
    name: '',
    description: '',
    service: '',
    category: 'data_analysis',
    permissions: '',
    tags: '',
  });

  useEffect(() => {
    loadToolsData();
    const interval = setInterval(loadToolsData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadToolsData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get auth token for API calls
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Fetch tools from real API endpoint
      const toolsResponse = await fetch('/api/admin/tools', {
        headers,
        credentials: 'include',
      });

      if (!toolsResponse.ok) {
        if (toolsResponse.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        throw new Error(`Failed to load tools: ${toolsResponse.status}`);
      }

      const toolsData = await toolsResponse.json();
      
      if (!toolsData.success || !toolsData.tools) {
        throw new Error('Invalid response format from tools API');
      }

      // Map API response to Tool interface
      const mappedTools: Tool[] = toolsData.tools.map((tool: any) => ({
        id: tool.id || tool.name,
        name: tool.name,
        description: tool.description || 'No description available',
        category: tool.category || 'utility',
        version: tool.version || '1.0.0',
        author: tool.author || 'System',
        status: (tool.status || 'active') as Tool['status'],
        tags: tool.tags || [],
        metrics: tool.metrics || {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          averageExecutionTime: 0,
          uptime: 100,
          errorRate: 0,
          userSatisfactionScore: 4.8
        },
        pricing: tool.pricing || {
          model: 'usage_based',
          costPerExecution: 0
        },
        permissions: {
          userTypes: tool.permissions?.userTypes || [],
          subscriptionTiers: tool.permissions?.subscriptionTiers || []
        },
        createdAt: tool.createdAt || new Date().toISOString(),
        updatedAt: tool.updatedAt || new Date().toISOString()
      }));

      // Set tools from real API data
      setTools(mappedTools);
      
      // Executions and metrics endpoints don't exist yet - use empty arrays
      // TODO: Implement these endpoints when execution tracking is added
      setExecutions([]);
      setSystemMetrics(null);
      
    } catch (err: any) {
      console.error('Error loading tools:', err);
      setError(err.message || 'Failed to load tools data');
      
      // Fallback to empty array on error
      setTools([]);
      setExecutions([]);
      setSystemMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = categoryFilter === 'all' || tool.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || tool.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive': return <Pause className="h-4 w-4 text-gray-500" />;
      case 'maintenance': return <Settings className="h-4 w-4 text-yellow-500" />;
      case 'deprecated': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <div className="h-4 w-4 bg-gray-300 rounded-full" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'data_transformation': return <Puzzle className="h-4 w-4 text-blue-500" />;
      case 'data_validation': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'external_integration': return <Globe className="h-4 w-4 text-purple-500" />;
      case 'data_analysis': return <BarChart3 className="h-4 w-4 text-orange-500" />;
      case 'machine_learning': return <Zap className="h-4 w-4 text-yellow-500" />;
      case 'database_operations': return <Database className="h-4 w-4 text-indigo-500" />;
      default: return <Code className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleToolAction = async (action: string, toolId: string) => {
    try {
      switch (action) {
        case 'activate':
        case 'deactivate':
        case 'maintenance':
          await fetch(`/api/admin/tools/${toolId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: action === 'activate' ? 'active' : action })
          });
          break;
        case 'delete':
          if (confirm('Are you sure you want to delete this tool? This action cannot be undone.')) {
            await fetch(`/api/admin/tools/${toolId}`, { method: 'DELETE' });
          }
          break;
        default:
          break;
      }
      await loadToolsData();
    } catch (err: any) {
      setError(`Failed to ${action} tool: ${err.message}`);
    }
  };

  const resetNewToolData = () => {
    setNewToolData({
      name: '',
      description: '',
      service: '',
      category: 'data_analysis',
      permissions: '',
      tags: '',
    });
  };

  const handleCreateTool = async () => {
    if (!newToolData.name.trim() || !newToolData.description.trim()) {
      setError('Tool name and description are required');
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const permissions = newToolData.permissions
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const tags = newToolData.tags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const response = await fetch('/api/admin/tools', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          id: newToolData.name.trim().toLowerCase().replace(/\s+/g, '_'),
          name: newToolData.name.trim(),
          description: newToolData.description.trim(),
          service: newToolData.service.trim() || undefined,
          category: newToolData.category,
          permissions,
          tags,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.detail || payload?.error || `Failed to create tool (${response.status})`);
      }

      setShowAddTool(false);
      resetNewToolData();
      await loadToolsData();
    } catch (err: any) {
      setError(err.message || 'Failed to create tool');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg">Loading tools...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tools Management</h1>
          <p className="text-gray-600">Monitor and manage your data processing tools and integrations</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowAddTool(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Tool</span>
          </button>
          <button
            onClick={loadToolsData}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* System Metrics */}
      {systemMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Tools</p>
                <p className="text-2xl font-bold text-gray-900">{systemMetrics.totalTools}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Puzzle className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-sm text-green-600">
                {systemMetrics.activeTools} active
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Executions</p>
                <p className="text-2xl font-bold text-gray-900">{systemMetrics.totalExecutions.toLocaleString()}</p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <Activity className="h-4 w-4 text-green-600" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-sm text-gray-600">
                {systemMetrics.runningExecutions} running now
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-gray-900">{systemMetrics.successRate.toFixed(1)}%</p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-sm text-green-600">
                {systemMetrics.successfulExecutions.toLocaleString()} successful
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900">${systemMetrics.totalCost.toFixed(2)}</p>
              </div>
              <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-purple-600" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-sm text-gray-600">
                Avg: {systemMetrics.averageExecutionTime}ms
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tools by name, description, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex space-x-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              <option value="data_transformation">Data Transformation</option>
              <option value="data_validation">Data Validation</option>
              <option value="external_integration">External Integration</option>
              <option value="data_analysis">Data Analysis</option>
              <option value="machine_learning">Machine Learning</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
              <option value="deprecated">Deprecated</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tools Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tool
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Metrics
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pricing
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTools.map((tool) => (
                <tr key={tool.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getCategoryIcon(tool.category)}
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{tool.name}</div>
                        <div className="text-sm text-gray-500">{tool.description.substring(0, 60)}...</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tool.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              {tag}
                            </span>
                          ))}
                          {tool.tags.length > 3 && (
                            <span className="text-xs text-gray-500">+{tool.tags.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getCategoryIcon(tool.category)}
                      <span className="ml-2 text-sm text-gray-900 capitalize">
                        {tool.category.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(tool.status)}
                      <span className="ml-2 text-sm text-gray-900 capitalize">{tool.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="space-y-1">
                      <div>Executions: {tool.metrics.totalExecutions.toLocaleString()}</div>
                      <div className="text-green-600">Success: {tool.metrics.successfulExecutions}</div>
                      <div className="text-red-600">Errors: {tool.metrics.failedExecutions}</div>
                      <div>Uptime: {tool.metrics.uptime.toFixed(1)}%</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="space-y-1">
                      <div className="capitalize">{tool.pricing.model.replace('_', ' ')}</div>
                      {tool.pricing.costPerExecution && (
                        <div>${tool.pricing.costPerExecution.toFixed(4)} per execution</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => {
                          setSelectedTool(tool);
                          setShowToolDetails(true);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTool(tool);
                          setShowExecutionLogs(true);
                        }}
                        className="text-green-600 hover:text-green-900"
                        title="View Executions"
                      >
                        <Activity className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTool(tool);
                          // Open edit modal
                        }}
                        className="text-yellow-600 hover:text-yellow-900"
                        title="Edit Tool"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      {tool.status === 'active' ? (
                        <button
                          onClick={() => handleToolAction('deactivate', tool.id)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Deactivate"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToolAction('activate', tool.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Activate"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleToolAction('delete', tool.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Tool"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTools.length === 0 && (
          <div className="text-center py-12">
            <Puzzle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No tools found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search criteria or add a new tool.
            </p>
          </div>
        )}
      </div>

      {/* Add Tool Modal */}
      {showAddTool && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-xl shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Create New Tool</h3>
              <button
                onClick={() => {
                  setShowAddTool(false);
                  resetNewToolData();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  placeholder="Tool name"
                  value={newToolData.name}
                  onChange={(e) => setNewToolData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  name="description"
                  placeholder="Describe what this tool does"
                  rows={3}
                  value={newToolData.description}
                  onChange={(e) => setNewToolData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
                <input
                  type="text"
                  name="service"
                  placeholder="Service class or handler"
                  value={newToolData.service}
                  onChange={(e) => setNewToolData((prev) => ({ ...prev, service: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  name="category"
                  value={newToolData.category}
                  onChange={(e) => setNewToolData((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="data_analysis">Data Analysis</option>
                  <option value="data_transformation">Data Transformation</option>
                  <option value="data_validation">Data Validation</option>
                  <option value="machine_learning">Machine Learning</option>
                  <option value="external_integration">External Integration</option>
                  <option value="utility">Utility</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Permissions</label>
                <input
                  type="text"
                  name="permissions"
                  placeholder="permission_a, permission_b"
                  value={newToolData.permissions}
                  onChange={(e) => setNewToolData((prev) => ({ ...prev, permissions: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddTool(false);
                  resetNewToolData();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleCreateTool}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Details Modal */}
      {showToolDetails && selectedTool && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Tool Details: {selectedTool.name}</h3>
              <button
                onClick={() => setShowToolDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900">Basic Information</h4>
                  <div className="mt-2 space-y-2 text-sm">
                    <div><span className="font-medium">Version:</span> {selectedTool.version}</div>
                    <div><span className="font-medium">Author:</span> {selectedTool.author}</div>
                    <div><span className="font-medium">Category:</span> {selectedTool.category}</div>
                    <div><span className="font-medium">Status:</span> 
                      <span className={`ml-2 px-2 py-1 rounded text-xs ${
                        selectedTool.status === 'active' ? 'bg-green-100 text-green-800' :
                        selectedTool.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        selectedTool.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                        selectedTool.status === 'error' ? 'bg-red-100 text-red-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {selectedTool.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900">Description</h4>
                  <p className="mt-2 text-sm text-gray-700">{selectedTool.description}</p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900">Tags</h4>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedTool.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900">Performance Metrics</h4>
                  <div className="mt-2 space-y-2 text-sm">
                    <div><span className="font-medium">Total Executions:</span> {selectedTool.metrics.totalExecutions.toLocaleString()}</div>
                    <div><span className="font-medium">Successful:</span> {selectedTool.metrics.successfulExecutions.toLocaleString()}</div>
                    <div><span className="font-medium">Failed:</span> {selectedTool.metrics.failedExecutions.toLocaleString()}</div>
                    <div><span className="font-medium">Success Rate:</span> {((selectedTool.metrics.successfulExecutions / selectedTool.metrics.totalExecutions) * 100).toFixed(1)}%</div>
                    <div><span className="font-medium">Avg Execution Time:</span> {selectedTool.metrics.averageExecutionTime.toLocaleString()}ms</div>
                    <div><span className="font-medium">Uptime:</span> {selectedTool.metrics.uptime.toFixed(1)}%</div>
                    <div><span className="font-medium">User Satisfaction:</span> {selectedTool.metrics.userSatisfactionScore.toFixed(1)}/5.0</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900">Pricing & Permissions</h4>
                  <div className="mt-2 space-y-2 text-sm">
                    <div><span className="font-medium">Pricing Model:</span> {selectedTool.pricing.model}</div>
                    {selectedTool.pricing.costPerExecution && (
                      <div><span className="font-medium">Cost per Execution:</span> ${selectedTool.pricing.costPerExecution.toFixed(4)}</div>
                    )}
                    <div><span className="font-medium">User Types:</span> {selectedTool.permissions.userTypes.join(', ')}</div>
                    <div><span className="font-medium">Subscription Tiers:</span> {selectedTool.permissions.subscriptionTiers.join(', ')}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900">Timestamps</h4>
                  <div className="mt-2 space-y-2 text-sm">
                    <div><span className="font-medium">Created:</span> {new Date(selectedTool.createdAt).toLocaleString()}</div>
                    <div><span className="font-medium">Updated:</span> {new Date(selectedTool.updatedAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowToolDetails(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Close
              </button>
              <button
                onClick={() => {
                  // Export tool configuration
                  const dataStr = JSON.stringify(selectedTool, null, 2);
                  const dataBlob = new Blob([dataStr], {type: 'application/json'});
                  const url = URL.createObjectURL(dataBlob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${selectedTool.id}_config.json`;
                  link.click();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Export Config</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsManagement;
