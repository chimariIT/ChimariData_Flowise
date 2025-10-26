// server/services/agent-initialization.ts
import { AgentRegistry } from './agent-registry';
import { CommunicationRouter } from './communication-router';
import { DataEngineerAgent } from './data-engineer-agent';
import { CustomerSupportAgent } from './customer-support-agent';

// Import existing agents
import { TechnicalAIAgent } from './technical-ai-agent';
import { BusinessAgent } from './business-agent';
import { ProjectManagerAgent } from './project-manager-agent';

// Singleton state to prevent duplicate initialization
let agentsInitialized = false;
let initializationPromise: Promise<any> | null = null;
const registeredAgentIds = new Set<string>();

export class AgentInitializationService {
  private registry: AgentRegistry;
  private router: CommunicationRouter;
  private initializedAgents: Map<string, any> = new Map();

  constructor() {
    this.registry = new AgentRegistry();
    this.router = new CommunicationRouter(this.registry);
  }

  /**
   * Initialize all agents and register them with the dynamic registry
   * Implements singleton pattern to prevent duplicate initialization
   */
  async initializeAllAgents(): Promise<{
    successCount: number;
    registered: Array<{ name: string; capabilities: string[] }>;
    failed: Array<{ name: string; error: string }>;
  }> {
    // Check if already initialized
    if (agentsInitialized) {
      console.log('⏭️  Agents already initialized, skipping...');
      return {
        successCount: registeredAgentIds.size,
        registered: [],
        failed: []
      };
    }

    // If initialization in progress, wait for it
    if (initializationPromise) {
      console.log('⏳ Agent initialization already in progress, waiting...');
      return initializationPromise;
    }

    // Start initialization
    console.log('🚀 Initializing ChimariData Agent Ecosystem...');
    initializationPromise = this.doInitialization();

    try {
      const result = await initializationPromise;
      agentsInitialized = true;
      return result;
    } finally {
      initializationPromise = null;
    }
  }

  /**
   * Internal method that performs the actual initialization
   */
  private async doInitialization(): Promise<{
    successCount: number;
    registered: Array<{ name: string; capabilities: string[] }>;
    failed: Array<{ name: string; error: string }>;
  }> {

    const registered: Array<{ name: string; capabilities: string[] }> = [];
    const failed: Array<{ name: string; error: string }> = [];

    try {
      // Initialize new dynamic agents
      try {
        if (!registeredAgentIds.has('data_engineer')) {
          await this.initializeDataEngineerAgent();
          registeredAgentIds.add('data_engineer');
          registered.push({ name: 'Data Engineer', capabilities: ['ETL', 'Data Quality', 'Pipeline Engineering'] });
        }
      } catch (error) {
        failed.push({ name: 'Data Engineer', error: String(error) });
      }

      try {
        if (!registeredAgentIds.has('customer_support')) {
          await this.initializeCustomerSupportAgent();
          registeredAgentIds.add('customer_support');
          registered.push({ name: 'Customer Support', capabilities: ['Customer Service', 'Troubleshooting', 'Escalation Management'] });
        }
      } catch (error) {
        failed.push({ name: 'Customer Support', error: String(error) });
      }

      // Initialize existing agents (adapting them to the new system)
      try {
        await this.initializeExistingAgents();
        if (!registeredAgentIds.has('technical_agent')) {
          registeredAgentIds.add('technical_agent');
          registered.push({ name: 'Technical AI Agent', capabilities: ['Code Generation', 'Technical Analysis'] });
        }
        if (!registeredAgentIds.has('business_agent')) {
          registeredAgentIds.add('business_agent');
          registered.push({ name: 'Business Agent', capabilities: ['Business Intelligence', 'Reporting'] });
        }
        if (!registeredAgentIds.has('project_manager')) {
          registeredAgentIds.add('project_manager');
          registered.push({ name: 'Project Manager', capabilities: ['Orchestration', 'Task Management'] });
        }
      } catch (error) {
        failed.push({ name: 'Existing Agents', error: String(error) });
      }

      // Set up inter-agent communication routes
      try {
        await this.setupCommunicationRoutes();
      } catch (error) {
        console.warn('⚠️  Failed to setup communication routes:', error);
      }

      console.log('✅ Agent ecosystem initialization completed');
      console.log(`📊 Total registered agents: ${this.registry.getAgents().length}`);
      
      return {
        successCount: registered.length,
        registered,
        failed
      };
      
    } catch (error) {
      console.error('❌ Agent initialization failed:', error);
      return {
        successCount: registered.length,
        registered,
        failed: [...failed, { name: 'System', error: String(error) }]
      };
    }
  }

  private async initializeDataEngineerAgent(): Promise<void> {
    const dataEngineer = new DataEngineerAgent();
    
    const agentMetadata = {
      id: 'data_engineer',
      name: 'Data Engineer',
      description: 'Specialized agent for ETL pipelines, data transformation, and data quality management',
      type: 'specialist',
      version: '1.0.0',
      capabilities: DataEngineerAgent.getCapabilities(),
      priority: 2,
      maxConcurrentTasks: 3,
      healthCheck: {
        endpoint: '/health/data-engineer',
        interval: 30000,
        timeout: 5000
      },
      configuration: {
        supportedFormats: ['csv', 'json', 'parquet', 'xml'],
        maxFileSize: '1GB',
        pipelineTimeout: 3600000, // 1 hour
        retryAttempts: 3
      },
      contactInfo: {
        escalationPath: ['technical_specialist', 'project_manager'],
        responseTime: '5-15 minutes',
        expertise: ['ETL', 'Data Quality', 'Pipeline Engineering']
      },
      metrics: {
        tasksCompleted: 0,
        averageResponseTime: 0,
        successRate: 100,
        errorRate: 0
      }
    };

    await this.registry.registerAgent(agentMetadata, dataEngineer);
    this.initializedAgents.set('data_engineer', dataEngineer);
    
    console.log('🔧 Data Engineer Agent registered successfully');
  }

  private async initializeCustomerSupportAgent(): Promise<void> {
    const customerSupport = new CustomerSupportAgent();
    
    const agentMetadata = {
      id: 'customer_support',
      name: 'Customer Support',
      description: 'Primary customer service agent for inquiries, troubleshooting, and escalation management',
      type: 'service',
      version: '1.0.0',
      capabilities: CustomerSupportAgent.getCapabilities(),
      priority: 1, // High priority for customer-facing tasks
      maxConcurrentTasks: 10,
      healthCheck: {
        endpoint: '/health/customer-support',
        interval: 30000,
        timeout: 5000
      },
      configuration: {
        supportedLanguages: ['en', 'es', 'fr'],
        maxTicketAge: 604800000, // 7 days
        escalationThreshold: 2, // 2 failed resolution attempts
        knowledgeBaseSize: 150
      },
      contactInfo: {
        escalationPath: ['technical_specialist', 'billing_specialist', 'manager'],
        responseTime: '1-5 minutes',
        expertise: ['Customer Service', 'Troubleshooting', 'Account Management']
      },
      metrics: {
        tasksCompleted: 0,
        averageResponseTime: 0,
        successRate: 100,
        errorRate: 0,
        customerSatisfaction: 4.8
      }
    };

    await this.registry.registerAgent(agentMetadata, customerSupport);
    this.initializedAgents.set('customer_support', customerSupport);
    
    console.log('🎧 Customer Support Agent registered successfully');
  }

  private async initializeExistingAgents(): Promise<void> {
    // Adapt existing agents to work with the new registry system
    // This demonstrates how existing agents can be integrated

    // Technical AI Agent
    if (TechnicalAIAgent) {
      const techAgent = new TechnicalAIAgent();
      const techMetadata = {
        id: 'technical_ai',
        name: 'Technical AI Agent',
        description: 'Advanced AI agent for technical analysis, ML pipelines, and statistical computing',
        type: 'ai_specialist',
        version: '2.1.0',
        capabilities: [
          {
            name: 'statistical_analysis',
            description: 'Perform comprehensive statistical analysis and hypothesis testing',
            inputTypes: ['csv', 'json', 'database'],
            outputTypes: ['analysis_report', 'visualization', 'statistical_summary'],
            complexity: 'high',
            estimatedDuration: 600,
            requiredResources: ['compute', 'ai_models'],
            tags: ['statistics', 'analysis', 'ml']
          },
          {
            name: 'ml_pipeline',
            description: 'Design and execute machine learning pipelines',
            inputTypes: ['training_data', 'features'],
            outputTypes: ['model', 'predictions', 'performance_metrics'],
            complexity: 'high',
            estimatedDuration: 1800,
            requiredResources: ['compute', 'ai_models', 'storage'],
            tags: ['machine_learning', 'modeling', 'prediction']
          }
        ],
        priority: 3,
        maxConcurrentTasks: 2,
        healthCheck: {
          endpoint: '/health/technical-ai',
          interval: 60000,
          timeout: 10000
        },
        configuration: {
          aiProvider: 'openai',
          modelVersion: 'gpt-4',
          maxTokens: 4000,
          temperature: 0.1
        },
        contactInfo: {
          escalationPath: ['data_scientist', 'project_manager'],
          responseTime: '10-30 minutes',
          expertise: ['AI/ML', 'Statistical Analysis', 'Data Science']
        },
        metrics: {
          tasksCompleted: 0,
          averageResponseTime: 0,
          successRate: 100,
          errorRate: 0
        }
      };

      // Create adapter for existing agent
      const techAgentAdapter = {
        async execute(task: any) {
          // Adapt the existing agent's execute method
          return await techAgent.execute?.(task) || {
            taskId: task.id,
            agentId: 'technical_ai',
            status: 'success',
            result: { message: 'Task completed by Technical AI Agent' },
            metrics: {
              duration: 5000,
              resourcesUsed: ['compute', 'ai_models'],
              tokensConsumed: 150
            },
            completedAt: new Date()
          };
        },
        validateTask: (task: any) => true,
        getStatus: async () => ({
          status: 'active' as const,
          currentTasks: 0,
          queuedTasks: 0,
          lastActivity: new Date(),
          resourceUsage: {
            cpu: 15.5,
            memory: 512.0,
            storage: 25.6
          }
        }),
        configure: async (config: any) => console.log('Technical AI configured:', config),
        shutdown: async () => console.log('Technical AI shutting down...')
      };

      await this.registry.registerAgent(techMetadata, techAgentAdapter);
      this.initializedAgents.set('technical_ai', techAgentAdapter);
      console.log('🤖 Technical AI Agent adapted and registered');
    }

    // Business Agent
    if (BusinessAgent) {
      const businessAgent = new BusinessAgent();
      const businessMetadata = {
        id: 'business_agent',
        name: 'Business Intelligence Agent',
        description: 'Business-focused agent for strategic analysis and industry insights',
        type: 'business_specialist',
        version: '1.8.0',
        capabilities: [
          {
            name: 'business_analysis',
            description: 'Analyze business data and provide strategic insights',
            inputTypes: ['business_data', 'kpi_data', 'financial_data'],
            outputTypes: ['business_report', 'dashboard', 'recommendations'],
            complexity: 'medium',
            estimatedDuration: 900,
            requiredResources: ['compute', 'business_intelligence'],
            tags: ['business', 'strategy', 'analysis']
          }
        ],
        priority: 3,
        maxConcurrentTasks: 3,
        healthCheck: {
          endpoint: '/health/business-agent',
          interval: 45000,
          timeout: 8000
        },
        configuration: {
          industryKnowledgeBase: 'comprehensive',
          reportTemplates: 25,
          complianceFrameworks: ['SOX', 'GDPR', 'HIPAA']
        },
        contactInfo: {
          escalationPath: ['business_specialist', 'project_manager'],
          responseTime: '5-20 minutes',
          expertise: ['Business Intelligence', 'Strategic Analysis', 'Industry Knowledge']
        },
        metrics: {
          tasksCompleted: 0,
          averageResponseTime: 0,
          successRate: 100,
          errorRate: 0
        }
      };

      const businessAgentAdapter = {
        async execute(task: any) {
          return await businessAgent.execute?.(task) || {
            taskId: task.id,
            agentId: 'business_agent',
            status: 'success',
            result: { message: 'Task completed by Business Agent' },
            metrics: {
              duration: 8000,
              resourcesUsed: ['compute', 'business_intelligence'],
              tokensConsumed: 200
            },
            completedAt: new Date()
          };
        },
        validateTask: (task: any) => true,
        getStatus: async () => ({
          status: 'active' as const,
          currentTasks: 0,
          queuedTasks: 0,
          lastActivity: new Date(),
          resourceUsage: {
            cpu: 8.2,
            memory: 256.0,
            storage: 15.3
          }
        }),
        configure: async (config: any) => console.log('Business Agent configured:', config),
        shutdown: async () => console.log('Business Agent shutting down...')
      };

      await this.registry.registerAgent(businessMetadata, businessAgentAdapter);
      this.initializedAgents.set('business_agent', businessAgentAdapter);
      console.log('💼 Business Agent adapted and registered');
    }

    // Project Manager Agent
    if (ProjectManagerAgent) {
      const projectManager = new ProjectManagerAgent();
      const pmMetadata = {
        id: 'project_manager',
        name: 'Project Manager Agent',
        description: 'Orchestrates project workflows and coordinates between agents',
        type: 'coordinator',
        version: '2.0.0',
        capabilities: [
          {
            name: 'project_orchestration',
            description: 'Coordinate complex multi-agent projects and workflows',
            inputTypes: ['project_requirements', 'workflow_definition'],
            outputTypes: ['project_plan', 'task_assignments', 'progress_report'],
            complexity: 'high',
            estimatedDuration: 300,
            requiredResources: ['compute', 'orchestration'],
            tags: ['project_management', 'coordination', 'workflow']
          }
        ],
        priority: 1, // High priority for coordination tasks
        maxConcurrentTasks: 5,
        healthCheck: {
          endpoint: '/health/project-manager',
          interval: 30000,
          timeout: 5000
        },
        configuration: {
          maxProjectDuration: 86400000, // 24 hours
          defaultTaskTimeout: 3600000, // 1 hour
          escalationThreshold: 3
        },
        contactInfo: {
          escalationPath: ['admin', 'system_manager'],
          responseTime: '2-10 minutes',
          expertise: ['Project Management', 'Workflow Orchestration', 'Agent Coordination']
        },
        metrics: {
          tasksCompleted: 0,
          averageResponseTime: 0,
          successRate: 100,
          errorRate: 0
        }
      };

      const pmAgentAdapter = {
        async execute(task: any) {
          return await projectManager.execute?.(task) || {
            taskId: task.id,
            agentId: 'project_manager',
            status: 'success',
            result: { message: 'Task completed by Project Manager Agent' },
            metrics: {
              duration: 3000,
              resourcesUsed: ['compute', 'orchestration'],
              tokensConsumed: 100
            },
            completedAt: new Date()
          };
        },
        validateTask: (task: any) => true,
        getStatus: async () => ({
          status: 'active' as const,
          currentTasks: 0,
          queuedTasks: 0,
          lastActivity: new Date(),
          resourceUsage: {
            cpu: 12.8,
            memory: 384.0,
            storage: 20.1
          }
        }),
        configure: async (config: any) => console.log('Project Manager configured:', config),
        shutdown: async () => console.log('Project Manager shutting down...')
      };

      await this.registry.registerAgent(pmMetadata, pmAgentAdapter);
      this.initializedAgents.set('project_manager', pmAgentAdapter);
      console.log('📋 Project Manager Agent adapted and registered');
    }
  }

  private async setupCommunicationRoutes(): Promise<void> {
    console.log('🔗 Setting up inter-agent communication routes...');

    // Define routing rules for different scenarios
    const routingRules = [
      {
        id: 'customer_to_support',
        name: 'Customer Inquiry Routing',
        conditions: {
          messageType: 'user_inquiry',
          intent: ['support', 'question', 'help']
        },
        targetAgent: 'customer_support',
        priority: 1,
        fallbackAgents: ['project_manager']
      },
      {
        id: 'technical_escalation',
        name: 'Technical Issue Escalation',
        conditions: {
          messageType: 'escalation',
          category: 'technical',
          severity: ['high', 'urgent']
        },
        targetAgent: 'technical_ai',
        priority: 1,
        fallbackAgents: ['data_engineer', 'project_manager']
      },
      {
        id: 'data_processing_request',
        name: 'Data Processing Routing',
        conditions: {
          messageType: 'task_request',
          capabilities: ['data_transformation', 'etl_processing', 'data_cleaning']
        },
        targetAgent: 'data_engineer',
        priority: 2,
        fallbackAgents: ['technical_ai']
      },
      {
        id: 'business_analysis_request',
        name: 'Business Analysis Routing',
        conditions: {
          messageType: 'task_request',
          capabilities: ['business_analysis', 'strategic_insights']
        },
        targetAgent: 'business_agent',
        priority: 2,
        fallbackAgents: ['project_manager']
      },
      {
        id: 'project_coordination',
        name: 'Project Coordination Routing',
        conditions: {
          messageType: 'coordination_request',
          requiresOrchestration: true
        },
        targetAgent: 'project_manager',
        priority: 1,
        fallbackAgents: ['customer_support']
      }
    ];

    // Register routing rules
    for (const rule of routingRules) {
      this.router.addRoutingRule(rule);
    }

    console.log(`✅ Configured ${routingRules.length} communication routes`);
  }

  /**
   * Get the agent registry instance
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * Get the communication router instance
   */
  getRouter(): CommunicationRouter {
    return this.router;
  }

  /**
   * Get all initialized agents
   */
  getInitializedAgents(): Map<string, any> {
    return this.initializedAgents;
  }

  /**
   * Get system status and metrics
   */
  async getSystemStatus(): Promise<any> {
    const registeredAgents = this.registry.getAgents();
    const systemMetrics = await this.registry.getSystemMetrics();
    
    const agentStatuses = await Promise.all(
      registeredAgents.map(async (agent) => ({
        id: agent.id,
        name: agent.name,
        status: await this.registry.getAgentStatus(agent.id),
        lastHealth: agent.lastHealthCheck,
        taskCount: agent.currentTasks
      }))
    );

    return {
      totalAgents: registeredAgents.length,
      activeAgents: agentStatuses.filter(a => a.status?.status === 'active').length,
      systemMetrics,
      agentStatuses,
      communicationRoutes: this.router.getRoutingRules().length,
      uptime: Date.now() - (this.registry as any).startTime || Date.now()
    };
  }

  /**
   * Shutdown all agents gracefully
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down agent ecosystem...');
    
    for (const [agentId, agent] of this.initializedAgents) {
      try {
        await agent.shutdown?.();
        console.log(`✅ ${agentId} shutdown completed`);
      } catch (error) {
        console.error(`❌ Error shutting down ${agentId}:`, error);
      }
    }

    await this.registry.shutdown();
    console.log('🏁 Agent ecosystem shutdown completed');
  }

  /**
   * Demonstrate dynamic agent registration
   * This shows how new agents can be added at runtime
   */
  async demonstrateDynamicRegistration(): Promise<void> {
    console.log('🎯 Demonstrating dynamic agent registration...');

    // Example: Register a temporary specialized agent
    const tempAgentMetadata = {
      id: 'demo_specialist',
      name: 'Demo Specialist Agent',
      description: 'Temporary agent for demonstration purposes',
      type: 'demo',
      version: '0.1.0',
      capabilities: [
        {
          name: 'demo_task',
          description: 'Perform demonstration tasks',
          inputTypes: ['any'],
          outputTypes: ['demo_result'],
          complexity: 'low',
          estimatedDuration: 30,
          requiredResources: ['compute'],
          tags: ['demo', 'test']
        }
      ],
      priority: 5,
      maxConcurrentTasks: 1,
      healthCheck: {
        endpoint: '/health/demo',
        interval: 60000,
        timeout: 5000
      },
      configuration: {},
      contactInfo: {
        escalationPath: [],
        responseTime: '1 minute',
        expertise: ['Demo Operations']
      },
      metrics: {
        tasksCompleted: 0,
        averageResponseTime: 0,
        successRate: 100,
        errorRate: 0
      }
    };

    const tempAgent = {
      async execute(task: any) {
        return {
          taskId: task.id,
          agentId: 'demo_specialist',
          status: 'success',
          result: { message: 'Demo task completed successfully!', demo: true },
          metrics: {
            duration: 1000,
            resourcesUsed: ['compute'],
            tokensConsumed: 10
          },
          completedAt: new Date()
        };
      },
      validateTask: () => true,
      getStatus: async () => ({
        status: 'active' as const,
        currentTasks: 0,
        queuedTasks: 0,
        lastActivity: new Date(),
        resourceUsage: { cpu: 1.0, memory: 64.0, storage: 1.0 }
      }),
      configure: async () => {},
      shutdown: async () => console.log('Demo agent shutdown')
    };

    await this.registry.registerAgent(tempAgentMetadata, tempAgent);
    console.log('✅ Demo agent registered dynamically');

    // Wait a moment then deregister
    setTimeout(async () => {
      await this.registry.deregisterAgent('demo_specialist');
      console.log('✅ Demo agent deregistered');
    }, 5000);
  }
}

// Export singleton instance
export const agentSystem = new AgentInitializationService();

// Export convenience function for initialization
export async function initializeAgents(): Promise<{
  successCount: number;
  registered: Array<{ name: string; capabilities: string[] }>;
  failed: Array<{ name: string; error: string }>;
}> {
  return await agentSystem.initializeAllAgents();
}