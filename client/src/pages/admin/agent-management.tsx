// client/src/pages/admin/agent-management.tsx
import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  Code,
  Cpu,
  Database,
  Edit,
  Filter,
  Globe,
  HardDrive,
  Loader,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Users,
  Zap,
  XCircle,
  BarChart3,
  TrendingUp,
  Heart,
  AlertCircle,
  PhoneCall,
  Wrench,
  FileText,
  Download,
  Upload,
  Terminal,
  Shield,
  Eye,
  Play,
  Pause,
  Square
} from 'lucide-react';

interface AgentInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  version: string;
  capabilities: string[];
  healthStatus: {
    lastHealthCheck: Date;
    responseTime: number;
    memoryUsage: number;
    cpuUsage: number;
    isHealthy: boolean;
    errorCount: number;
  };
  performance: {
    tasksCompleted: number;
    successRate: number;
    averageResponseTime: number;
    uptime: number;
  };
  configuration: {
    maxConcurrentTasks: number;
    priority: number;
    timeout: number;
    retryAttempts: number;
  };
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    author: string;
    tags: string[];
  };
}

interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  result?: any;
  error?: string;
  metadata: Record<string, any>;
}

interface CommunicationFlow {
  id: string;
  type: 'customer_to_agent' | 'agent_to_agent' | 'agent_to_system';
  sourceId: string;
  targetId: string;
  message: string;
  intent: string;
  priority: number;
  status: 'routed' | 'processing' | 'completed' | 'failed';
  timestamp: Date;
  responseTime?: number;
  escalationLevel: number;
}

const AgentManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'tasks' | 'communications' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [communications, setCommunications] = useState<CommunicationFlow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [newAgentData, setNewAgentData] = useState({
    name: '',
    type: '',
    description: '',
    capabilities: '',
    maxConcurrentTasks: 5,
    priority: 1,
    timeout: 30000
  });

  // FIX: Use correct admin endpoint /api/admin/agents/status instead of /api/system-status
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/agents/status', {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch agent status: ${response.status}`);
        }

        const result = await response.json();
        // Handle the response format: { success: true, data: { agents: [...], summary } }
        const systemStatus = result.success ? { agents: result.data?.agents || [] } : { agents: [] };

        // Map backend agent data to AgentInfo format
        const agentDefinitions: Record<string, { type: string; description: string; capabilities: string[] }> = {
          pm: { type: 'orchestration', description: 'Coordinates project workflows and manages dependencies between agents', capabilities: ['project_coordination', 'workflow_management', 'dependency_resolution', 'status_reporting'] },
          de: { type: 'data_processing', description: 'Handles ETL operations, data pipeline management, and data quality assurance', capabilities: ['etl_processing', 'data_quality', 'pipeline_management', 'data_transformation'] },
          ds: { type: 'analysis', description: 'Performs statistical analysis, ML modeling, and data science workflows', capabilities: ['statistical_analysis', 'ml_modeling', 'data_preprocessing', 'feature_engineering'] },
          ba: { type: 'business', description: 'Provides business insights, industry knowledge, and compliance guidance', capabilities: ['business_analysis', 'compliance_check', 'industry_insights', 'report_generation'] },
          customer_support: { type: 'support', description: 'Handles customer inquiries, ticket management, and user assistance', capabilities: ['ticket_management', 'customer_assistance', 'escalation_handling', 'knowledge_base'] },
          template_research: { type: 'research', description: 'Researches and recommends analysis templates for industries', capabilities: ['template_search', 'industry_research', 'template_synthesis'] }
        };

        const agentStatusMap: Record<string, 'active' | 'inactive' | 'error' | 'maintenance'> = {
          idle: 'active',
          active: 'active',
          busy: 'active',
          error: 'error',
          maintenance: 'maintenance'
        };

        // FIX: Map from the new /api/admin/agents/status response format
        const realAgents: AgentInfo[] = (systemStatus.agents || []).map((agent: any) => {
          const def = agentDefinitions[agent.id] || { type: agent.type || 'unknown', description: agent.name || 'Agent', capabilities: agent.capabilities || [] };
          return {
            id: agent.id,
            name: agent.name || agent.id,
            type: agent.type || def.type,
            description: def.description,
            status: agentStatusMap[agent.status] || 'active',
            version: '1.0.0',
            capabilities: agent.capabilities || def.capabilities,
            healthStatus: {
              lastHealthCheck: agent.metrics?.lastActivity ? new Date(agent.metrics.lastActivity) : new Date(),
              responseTime: agent.metrics?.averageResponseTime || 0,
              memoryUsage: 0, // Not available in new endpoint
              cpuUsage: 0, // Not available in new endpoint
              isHealthy: agent.health === 'healthy' || agent.status === 'active',
              errorCount: agent.metrics?.failedTasks || 0
            },
            performance: {
              tasksCompleted: agent.metrics?.totalTasks || 0,
              successRate: agent.metrics?.successRate || 100,
              averageResponseTime: agent.metrics?.averageResponseTime || 0,
              uptime: 0
            },
            configuration: {
              maxConcurrentTasks: agent.maxConcurrentTasks || 5,
              priority: 3,
              timeout: 60000,
              retryAttempts: 2
            },
            metadata: {
              createdAt: new Date(),
              lastUpdated: agent.metrics?.lastActivity ? new Date(agent.metrics.lastActivity) : new Date(),
              author: 'System',
              tags: (agent.capabilities || def.capabilities).slice(0, 2)
            }
          };
        });

        setAgents(realAgents);
        // Tasks and communications require real-time tracking - show empty until implemented
        setTasks([]);
        setCommunications([]);
      } catch (error) {
        console.error('Error loading agent data:', error);
        // Show empty state on error
        setAgents([]);
        setTasks([]);
        setCommunications([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'inactive':
        return <XCircle className="h-5 w-5 text-gray-400" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'maintenance':
        return <Settings className="h-5 w-5 text-orange-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getTaskStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'running':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'orchestration':
        return <Settings className="h-5 w-5 text-blue-600" />;
      case 'analysis':
        return <BarChart3 className="h-5 w-5 text-purple-600" />;
      case 'business':
        return <TrendingUp className="h-5 w-5 text-green-600" />;
      case 'data_processing':
        return <Database className="h-5 w-5 text-indigo-600" />;
      case 'support':
        return <PhoneCall className="h-5 w-5 text-orange-600" />;
      case 'monitoring':
        return <Eye className="h-5 w-5 text-red-600" />;
      default:
        return <Bot className="h-5 w-5 text-gray-600" />;
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || agent.status === filterStatus;
    const matchesType = filterType === 'all' || agent.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleCreateAgent = async () => {
    if (!newAgentData.name || !newAgentData.type) return;

    const agentId = `agent_${Date.now()}`;
    const capabilities = newAgentData.capabilities.split(',').map(c => c.trim()).filter(Boolean);

    try {
      const response = await fetch('/api/admin/agents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agentId,
          name: newAgentData.name,
          type: newAgentData.type,
          description: newAgentData.description,
          capabilities,
          configuration: {
            maxConcurrentTasks: newAgentData.maxConcurrentTasks,
            priority: newAgentData.priority,
            timeout: newAgentData.timeout
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create agent: ${response.status}`);
      }

      const newAgent: AgentInfo = {
        id: agentId,
        name: newAgentData.name,
        type: newAgentData.type,
        description: newAgentData.description,
        status: 'inactive',
        version: '1.0.0',
        capabilities,
        healthStatus: {
          lastHealthCheck: new Date(),
          responseTime: 0,
          memoryUsage: 0,
          cpuUsage: 0,
          isHealthy: false,
          errorCount: 0
        },
        performance: {
          tasksCompleted: 0,
          successRate: 0,
          averageResponseTime: 0,
          uptime: 0
        },
        configuration: {
          maxConcurrentTasks: newAgentData.maxConcurrentTasks,
          priority: newAgentData.priority,
          timeout: newAgentData.timeout,
          retryAttempts: 3
        },
        metadata: {
          createdAt: new Date(),
          lastUpdated: new Date(),
          author: 'Admin',
          tags: []
        }
      };

      setAgents(prev => [...prev, newAgent]);
      setShowAgentForm(false);
      setNewAgentData({
        name: '',
        type: '',
        description: '',
        capabilities: '',
        maxConcurrentTasks: 5,
        priority: 1,
        timeout: 30000
      });
    } catch (error) {
      console.error('Failed to create agent:', error);
      alert(error instanceof Error ? error.message : 'Failed to create agent');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading agent management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Bot className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Agent Management</h1>
                <p className="text-sm text-gray-500">Monitor and manage intelligent agents</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <RefreshCw className="h-5 w-5" />
              </button>
              <button 
                onClick={() => setShowAgentForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Agent
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'agents', label: 'Agents', icon: Bot },
              { id: 'tasks', label: 'Tasks', icon: FileText },
              { id: 'communications', label: 'Communications', icon: MessageSquare },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <Icon className="h-4 w-4 mr-2" />
                    {tab.label}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="card bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Bot className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Agents</p>
                    <p className="text-2xl font-semibold text-gray-900">{agents.length}</p>
                  </div>
                </div>
              </div>

              <div className="card bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Active Agents</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {agents.filter(a => a.status === 'active').length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Running Tasks</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {tasks.filter(t => t.status === 'running').length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <MessageSquare className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Communications</p>
                    <p className="text-2xl font-semibold text-gray-900">{communications.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Status Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-medium text-gray-900">Agent Health Status</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {agents.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No agents registered</p>
                    )}
                    {agents.slice(0, 5).map(agent => (
                      <div key={agent.id} className="flex items-center justify-between">
                        <div className="flex items-center">
                          {getTypeIcon(agent.type)}
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                            <p className="text-sm text-gray-500">
                              {agent.healthStatus.responseTime}ms avg response
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="text-right">
                            <p className="text-sm text-gray-600">
                              {agent.performance.successRate > 0 ? `${agent.performance.successRate.toFixed(1)}% success` : 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {agent.performance.uptime > 0 ? `${agent.performance.uptime.toFixed(1)}% uptime` : 'Available'}
                            </p>
                          </div>
                          {getStatusIcon(agent.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-medium text-gray-900">Recent Communications</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {communications.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No recent communications</p>
                    )}
                    {communications.slice(0, 5).map(comm => (
                      <div key={comm.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            comm.type === 'customer_to_agent' ? 'bg-blue-100 text-blue-800' :
                            comm.type === 'agent_to_agent' ? 'bg-green-100 text-green-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {comm.type.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            comm.status === 'completed' ? 'bg-green-100 text-green-800' :
                            comm.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                            comm.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {comm.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 mb-1">{comm.message}</p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{comm.sourceId} → {comm.targetId}</span>
                          <span>{comm.timestamp.toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="space-y-6">
            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">Agent Registry</h3>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search agents..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="error">Error</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="orchestration">Orchestration</option>
                    <option value="analysis">Analysis</option>
                    <option value="business">Business</option>
                    <option value="data_processing">Data Processing</option>
                    <option value="support">Support</option>
                    <option value="monitoring">Monitoring</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredAgents.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    <Bot className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No Agent Data Available</p>
                    <p className="text-sm mt-1">Agent metrics will appear here when agents process tasks.</p>
                  </div>
                )}
                {filteredAgents.map(agent => (
                  <div key={agent.id} className="border rounded-lg p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        {getTypeIcon(agent.type)}
                        <div className="ml-3">
                          <h4 className="text-lg font-semibold text-gray-900">{agent.name}</h4>
                          <p className="text-sm text-gray-500">v{agent.version}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(agent.status)}
                        <button
                          onClick={() => setSelectedAgent(agent.id)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 mb-4">{agent.description}</p>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Health Status:</span>
                        <span className={`font-medium ${
                          agent.healthStatus.isHealthy ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {agent.healthStatus.isHealthy ? 'Healthy' : 'Unhealthy'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Response Time:</span>
                        <span className="font-medium">{agent.healthStatus.responseTime}ms</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Success Rate:</span>
                        <span className="font-medium">{agent.performance.successRate.toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Tasks Completed:</span>
                        <span className="font-medium">{agent.performance.tasksCompleted.toLocaleString()}</span>
                      </div>

                      <div className="pt-3 border-t">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-gray-600">Resource Usage:</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span>CPU: {agent.healthStatus.cpuUsage}%</span>
                            <div className="w-20 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full"
                                style={{ width: `${agent.healthStatus.cpuUsage}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Memory: {agent.healthStatus.memoryUsage}%</span>
                            <div className="w-20 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-green-600 h-1.5 rounded-full"
                                style={{ width: `${agent.healthStatus.memoryUsage}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t">
                        <div className="text-xs text-gray-500">
                          <p>Max Concurrent Tasks: {agent.configuration.maxConcurrentTasks}</p>
                          <p>Priority: {agent.configuration.priority}</p>
                          <p>Last Health Check: {agent.healthStatus.lastHealthCheck.toLocaleTimeString()}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t">
                      <div className="flex flex-wrap gap-1">
                        {agent.capabilities.slice(0, 3).map(capability => (
                          <span
                            key={capability}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                          >
                            {capability.replace('_', ' ')}
                          </span>
                        ))}
                        {agent.capabilities.length > 3 && (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                            +{agent.capabilities.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-medium text-gray-900">Task Queue</h3>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Task
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agent
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tasks.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                            <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p>No tasks recorded yet. Task history will appear here as agents process work.</p>
                          </td>
                        </tr>
                      )}
                      {tasks.map(task => {
                        const agent = agents.find(a => a.id === task.agentId);
                        const duration = task.completedAt && task.startedAt 
                          ? task.completedAt.getTime() - task.startedAt.getTime()
                          : task.startedAt 
                          ? Date.now() - task.startedAt.getTime()
                          : 0;

                        return (
                          <tr key={task.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{task.type}</div>
                              <div className="text-sm text-gray-500">ID: {task.id}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {agent && getTypeIcon(agent.type)}
                                <span className="ml-2 text-sm text-gray-900">{agent?.name || task.agentId}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {getTaskStatusIcon(task.status)}
                                <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${
                                  task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  task.status === 'running' ? 'bg-blue-100 text-blue-800' :
                                  task.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  task.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {task.status}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-900">{task.priority}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-900">
                                {duration > 0 ? formatDuration(duration) : '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-900">
                                {task.createdAt.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'communications' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-medium text-gray-900">Communication Flows</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {communications.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p>No communication flows recorded yet. Agent interactions will appear here.</p>
                    </div>
                  )}
                  {communications.map(comm => (
                    <div key={comm.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                              comm.type === 'customer_to_agent' ? 'bg-blue-100 text-blue-800' :
                              comm.type === 'agent_to_agent' ? 'bg-green-100 text-green-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {comm.type.replace(/_/g, ' ')}
                            </span>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              comm.status === 'completed' ? 'bg-green-100 text-green-800' :
                              comm.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                              comm.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {comm.status}
                            </span>
                            <span className="text-sm text-gray-500">
                              Priority: {comm.priority}
                            </span>
                          </div>
                          
                          <div className="mb-3">
                            <p className="text-sm font-medium text-gray-900 mb-1">
                              {comm.sourceId} → {comm.targetId}
                            </p>
                            <p className="text-sm text-gray-700">{comm.message}</p>
                          </div>

                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>Intent: {comm.intent}</span>
                            <span>Escalation Level: {comm.escalationLevel}</span>
                            {comm.responseTime && (
                              <span>Response Time: {formatDuration(comm.responseTime)}</span>
                            )}
                            <span>{comm.timestamp.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-medium text-gray-900">Agent System Settings</h3>
              </div>
              <div className="p-6">
                <div className="text-center py-8">
                  <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Agent system configuration settings coming soon</p>
                  <p className="text-sm text-gray-400 mt-2">
                    This will include global agent policies, communication routing rules, and system monitoring
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Agent Creation Modal */}
      {showAgentForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Create New Agent</h3>
              <button
                onClick={() => setShowAgentForm(false)}
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
                  placeholder="Agent name"
                  value={newAgentData.name}
                  onChange={(e) => setNewAgentData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  name="type"
                  value={newAgentData.type}
                  onChange={(e) => setNewAgentData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select type...</option>
                  <option value="orchestration">Orchestration</option>
                  <option value="analysis">Analysis</option>
                  <option value="business">Business</option>
                  <option value="data_processing">Data Processing</option>
                  <option value="support">Support</option>
                  <option value="monitoring">Monitoring</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  name="description"
                  placeholder="Describe what this agent does"
                  value={newAgentData.description}
                  onChange={(e) => setNewAgentData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Capabilities (comma-separated)
                </label>
                <input
                  type="text"
                  name="capabilities"
                  value={newAgentData.capabilities}
                  onChange={(e) => setNewAgentData(prev => ({ ...prev, capabilities: e.target.value }))}
                  placeholder="capability1, capability2, capability3"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Concurrent Tasks</label>
                  <input
                    type="number"
                    name="maxConcurrentTasks"
                    value={newAgentData.maxConcurrentTasks}
                    onChange={(e) => setNewAgentData(prev => ({ ...prev, maxConcurrentTasks: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <input
                    type="number"
                    name="priority"
                    min="1"
                    max="5"
                    value={newAgentData.priority}
                    onChange={(e) => setNewAgentData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAgentForm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAgent}
                type="submit"
                disabled={!newAgentData.name || !newAgentData.type || !newAgentData.description}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;
