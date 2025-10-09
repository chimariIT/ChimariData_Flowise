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

  // Mock data - in real app, fetch from API
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Mock agents data
        const mockAgents: AgentInfo[] = [
          {
            id: 'project_manager',
            name: 'Project Manager Agent',
            type: 'orchestration',
            description: 'Coordinates project workflows and manages dependencies between different agents',
            status: 'active',
            version: '2.1.0',
            capabilities: ['project_coordination', 'workflow_management', 'dependency_resolution', 'status_reporting'],
            healthStatus: {
              lastHealthCheck: new Date(),
              responseTime: 145,
              memoryUsage: 65,
              cpuUsage: 23,
              isHealthy: true,
              errorCount: 0
            },
            performance: {
              tasksCompleted: 1456,
              successRate: 98.5,
              averageResponseTime: 150,
              uptime: 99.8
            },
            configuration: {
              maxConcurrentTasks: 10,
              priority: 5,
              timeout: 30000,
              retryAttempts: 3
            },
            metadata: {
              createdAt: new Date('2024-01-01'),
              lastUpdated: new Date(),
              author: 'System',
              tags: ['core', 'orchestration', 'project_management']
            }
          },
          {
            id: 'data_scientist',
            name: 'Data Scientist Agent',
            type: 'analysis',
            description: 'Performs advanced statistical analysis, ML modeling, and data science workflows',
            status: 'active',
            version: '3.0.2',
            capabilities: ['statistical_analysis', 'ml_modeling', 'data_preprocessing', 'feature_engineering'],
            healthStatus: {
              lastHealthCheck: new Date(Date.now() - 30000),
              responseTime: 890,
              memoryUsage: 78,
              cpuUsage: 45,
              isHealthy: true,
              errorCount: 2
            },
            performance: {
              tasksCompleted: 2341,
              successRate: 96.2,
              averageResponseTime: 850,
              uptime: 97.5
            },
            configuration: {
              maxConcurrentTasks: 5,
              priority: 4,
              timeout: 120000,
              retryAttempts: 2
            },
            metadata: {
              createdAt: new Date('2024-01-01'),
              lastUpdated: new Date(Date.now() - 3600000),
              author: 'Data Team',
              tags: ['analysis', 'ml', 'statistics']
            }
          },
          {
            id: 'business_agent',
            name: 'Business Intelligence Agent',
            type: 'business',
            description: 'Provides business insights, industry knowledge, and regulatory compliance guidance',
            status: 'active',
            version: '1.8.5',
            capabilities: ['business_analysis', 'compliance_check', 'industry_insights', 'report_generation'],
            healthStatus: {
              lastHealthCheck: new Date(Date.now() - 60000),
              responseTime: 234,
              memoryUsage: 45,
              cpuUsage: 18,
              isHealthy: true,
              errorCount: 1
            },
            performance: {
              tasksCompleted: 987,
              successRate: 99.1,
              averageResponseTime: 280,
              uptime: 99.2
            },
            configuration: {
              maxConcurrentTasks: 8,
              priority: 3,
              timeout: 45000,
              retryAttempts: 3
            },
            metadata: {
              createdAt: new Date('2024-01-01'),
              lastUpdated: new Date(Date.now() - 7200000),
              author: 'Business Team',
              tags: ['business', 'compliance', 'insights']
            }
          },
          {
            id: 'data_engineer',
            name: 'Data Engineer Agent',
            type: 'data_processing',
            description: 'Handles ETL operations, data pipeline management, and data quality assurance',
            status: 'active',
            version: '2.3.1',
            capabilities: ['etl_processing', 'data_quality', 'pipeline_management', 'data_transformation'],
            healthStatus: {
              lastHealthCheck: new Date(Date.now() - 15000),
              responseTime: 320,
              memoryUsage: 82,
              cpuUsage: 35,
              isHealthy: true,
              errorCount: 0
            },
            performance: {
              tasksCompleted: 3456,
              successRate: 97.8,
              averageResponseTime: 450,
              uptime: 98.9
            },
            configuration: {
              maxConcurrentTasks: 15,
              priority: 4,
              timeout: 180000,
              retryAttempts: 2
            },
            metadata: {
              createdAt: new Date('2024-01-15'),
              lastUpdated: new Date(Date.now() - 1800000),
              author: 'Engineering Team',
              tags: ['etl', 'data_processing', 'pipelines']
            }
          },
          {
            id: 'customer_support',
            name: 'Customer Support Agent',
            type: 'support',
            description: 'Handles customer inquiries, ticket management, and user assistance',
            status: 'active',
            version: '1.2.0',
            capabilities: ['ticket_management', 'customer_assistance', 'escalation_handling', 'knowledge_base'],
            healthStatus: {
              lastHealthCheck: new Date(Date.now() - 45000),
              responseTime: 156,
              memoryUsage: 38,
              cpuUsage: 12,
              isHealthy: true,
              errorCount: 0
            },
            performance: {
              tasksCompleted: 567,
              successRate: 99.6,
              averageResponseTime: 180,
              uptime: 99.9
            },
            configuration: {
              maxConcurrentTasks: 20,
              priority: 5,
              timeout: 60000,
              retryAttempts: 1
            },
            metadata: {
              createdAt: new Date('2024-01-20'),
              lastUpdated: new Date(Date.now() - 900000),
              author: 'Support Team',
              tags: ['support', 'customer_service', 'tickets']
            }
          },
          {
            id: 'data_quality_monitor',
            name: 'Data Quality Monitor',
            type: 'monitoring',
            description: 'Monitors data quality, detects anomalies, and ensures data integrity',
            status: 'maintenance',
            version: '1.0.3',
            capabilities: ['quality_monitoring', 'anomaly_detection', 'data_validation', 'alerting'],
            healthStatus: {
              lastHealthCheck: new Date(Date.now() - 300000),
              responseTime: 0,
              memoryUsage: 0,
              cpuUsage: 0,
              isHealthy: false,
              errorCount: 5
            },
            performance: {
              tasksCompleted: 234,
              successRate: 94.2,
              averageResponseTime: 500,
              uptime: 89.5
            },
            configuration: {
              maxConcurrentTasks: 3,
              priority: 2,
              timeout: 90000,
              retryAttempts: 3
            },
            metadata: {
              createdAt: new Date('2024-01-25'),
              lastUpdated: new Date(Date.now() - 10800000),
              author: 'Quality Team',
              tags: ['monitoring', 'quality', 'validation']
            }
          }
        ];

        // Mock tasks data
        const mockTasks: AgentTask[] = [
          {
            id: 'task_1',
            agentId: 'data_scientist',
            type: 'regression_analysis',
            status: 'running',
            priority: 4,
            createdAt: new Date(Date.now() - 600000),
            startedAt: new Date(Date.now() - 300000),
            metadata: {
              userId: 'user_123',
              datasetId: 'dataset_456',
              analysisType: 'linear_regression'
            }
          },
          {
            id: 'task_2',
            agentId: 'data_engineer',
            type: 'data_transformation',
            status: 'completed',
            priority: 3,
            createdAt: new Date(Date.now() - 1800000),
            startedAt: new Date(Date.now() - 1500000),
            completedAt: new Date(Date.now() - 900000),
            duration: 600000,
            metadata: {
              inputFormat: 'csv',
              outputFormat: 'json',
              recordsProcessed: 10000
            }
          },
          {
            id: 'task_3',
            agentId: 'customer_support',
            type: 'ticket_resolution',
            status: 'pending',
            priority: 5,
            createdAt: new Date(Date.now() - 300000),
            metadata: {
              ticketId: 'ticket_789',
              category: 'technical_issue',
              urgency: 'high'
            }
          }
        ];

        // Mock communications data
        const mockCommunications: CommunicationFlow[] = [
          {
            id: 'comm_1',
            type: 'customer_to_agent',
            sourceId: 'user_123',
            targetId: 'customer_support',
            message: 'Having trouble uploading large CSV files',
            intent: 'technical_support',
            priority: 4,
            status: 'processing',
            timestamp: new Date(Date.now() - 180000),
            escalationLevel: 0
          },
          {
            id: 'comm_2',
            type: 'agent_to_agent',
            sourceId: 'project_manager',
            targetId: 'data_scientist',
            message: 'Please prioritize regression analysis for Project Alpha',
            intent: 'task_coordination',
            priority: 3,
            status: 'completed',
            timestamp: new Date(Date.now() - 900000),
            responseTime: 45000,
            escalationLevel: 0
          },
          {
            id: 'comm_3',
            type: 'agent_to_agent',
            sourceId: 'data_engineer',
            targetId: 'data_scientist',
            message: 'Data preprocessing completed for dataset_456',
            intent: 'status_update',
            priority: 2,
            status: 'completed',
            timestamp: new Date(Date.now() - 1200000),
            responseTime: 15000,
            escalationLevel: 0
          }
        ];

        setAgents(mockAgents);
        setTasks(mockTasks);
        setCommunications(mockCommunications);
      } catch (error) {
        console.error('Error loading agent data:', error);
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

  const handleCreateAgent = () => {
    const newAgent: AgentInfo = {
      id: `agent_${Date.now()}`,
      name: newAgentData.name,
      type: newAgentData.type,
      description: newAgentData.description,
      status: 'inactive',
      version: '1.0.0',
      capabilities: newAgentData.capabilities.split(',').map(c => c.trim()),
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
              <div className="bg-white rounded-lg shadow p-6">
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

              <div className="bg-white rounded-lg shadow p-6">
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

              <div className="bg-white rounded-lg shadow p-6">
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

              <div className="bg-white rounded-lg shadow p-6">
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
                              {agent.performance.successRate.toFixed(1)}% success
                            </p>
                            <p className="text-xs text-gray-500">
                              {agent.performance.uptime.toFixed(1)}% uptime
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
                  value={newAgentData.name}
                  onChange={(e) => setNewAgentData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
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
                    value={newAgentData.maxConcurrentTasks}
                    onChange={(e) => setNewAgentData(prev => ({ ...prev, maxConcurrentTasks: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <input
                    type="number"
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
                disabled={!newAgentData.name || !newAgentData.type || !newAgentData.description}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;