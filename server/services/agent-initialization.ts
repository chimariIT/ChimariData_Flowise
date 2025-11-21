// server/services/agent-initialization.ts
import {
  AgentHandler,
  AgentRegistry,
  AgentResult,
  AgentStatus,
  AgentTask,
  agentRegistry,
} from './agent-registry';
import { CommunicationRouter, RoutingRule } from './communication-router';
import { DataEngineerAgent } from './data-engineer-agent';
import { CustomerSupportAgent } from './customer-support-agent';

// Import existing agents
import { TechnicalAIAgent } from './technical-ai-agent';
import { BusinessAgent } from './business-agent';
import { ProjectManagerAgent } from './project-manager-agent';
import { TechnicalQueryType } from '../../shared/schema';

// Singleton state to prevent duplicate initialization
let agentsInitialized = false;
let initializationPromise: Promise<any> | null = null;
const registeredAgentIds = new Set<string>();

type AgentAdapterState = {
  activeTasks: number;
  lastActivity: Date;
  queuedTasks: number;
};

function createSuccessResult(
  task: AgentTask,
  agentId: string,
  result: any,
  durationMs: number,
  resourcesUsed: string[]
): AgentResult {
  return {
    taskId: task.id,
    agentId,
    status: 'success',
    result,
    metrics: {
      duration: durationMs,
      resourcesUsed,
      tokensConsumed: typeof result?.tokenUsage === 'number' ? result.tokenUsage : undefined,
    },
    completedAt: new Date(),
  };
}

function createFailureResult(
  task: AgentTask,
  agentId: string,
  error: unknown,
  durationMs: number,
  resourcesUsed: string[]
): AgentResult {
  return {
    taskId: task.id,
    agentId,
    status: 'failure',
    result: null,
    error: error instanceof Error ? error.message : String(error),
    metrics: {
      duration: durationMs,
      resourcesUsed,
    },
    completedAt: new Date(),
  };
}

function mapPriorityToLabel(priority?: number): 'low' | 'normal' | 'high' | 'urgent' | 'critical' {
  if (priority === undefined || priority <= 3) return 'low';
  if (priority <= 5) return 'normal';
  if (priority <= 7) return 'high';
  if (priority <= 9) return 'urgent';
  return 'critical';
}

function mapIntentToTechnicalQueryType(intent?: string): TechnicalQueryType['type'] {
  switch (intent) {
    case 'ml_request':
      return 'machine_learning';
    case 'data_analysis':
      return 'statistical_analysis';
    case 'data_transformation':
      return 'statistical_analysis';
    default:
      return 'statistical_analysis';
  }
}

function deriveGoals(payload: any, fallback: string): string[] {
  if (Array.isArray(payload?.goals) && payload.goals.length > 0) {
    return payload.goals.map((goal: any) => String(goal));
  }

  if (typeof payload?.userInput === 'string' && payload.userInput.trim().length > 0) {
    return [payload.userInput.trim()];
  }

  return [fallback];
}

function toStringArray(value: any): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry) => String(entry));
}

export class AgentInitializationService {
  private registry: AgentRegistry;
  private router: CommunicationRouter;
  private initializedAgents: Map<string, any> = new Map();

  constructor() {
    this.registry = agentRegistry;
    this.router = new CommunicationRouter();
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

      const techAgentState: AgentAdapterState = {
        activeTasks: 0,
        lastActivity: new Date(),
        queuedTasks: 0,
      };

      const techAgentAdapter: AgentHandler = {
        validateTask: () => true,
        async execute(task: AgentTask): Promise<AgentResult> {
          techAgentState.activeTasks++;
          const startedAt = Date.now();

          try {
            const payload = task.payload ?? {};
            const projectId = payload.projectId ?? task.context.projectId ?? 'unknown_project';
            let resultData: any;

            if (payload.stepName || payload.dependency || payload.project || payload.previousResults) {
              const normalizedTask = {
                stepName: payload.stepName ?? task.type ?? 'data_preprocessing',
                dependency: payload.dependency ?? { metadata: payload.metadata ?? {} },
                project: payload.project ?? {
                  data: payload.data ?? [],
                  schema: payload.schema ?? {},
                },
                previousResults: payload.previousResults ?? payload.results ?? {},
                payload,
              };

              resultData = await techAgent.processTask(normalizedTask, projectId);
            } else {
              const query: TechnicalQueryType = {
                type: mapIntentToTechnicalQueryType(payload.intent?.category ?? task.type),
                prompt:
                  typeof payload.userInput === 'string' && payload.userInput.trim().length > 0
                    ? payload.userInput
                    : 'Provide technical assistance for the current project.',
                context: {
                  data: payload.data,
                  schema: payload.schema,
                  projectId,
                  userId: task.context.userId ?? 'unknown_user',
                },
                parameters: {},
              };

              resultData = await techAgent.processQuery(query);
            }

            const duration = Date.now() - startedAt;
            return createSuccessResult(task, 'technical_ai', resultData, duration, ['compute', 'ai_models']);
          } catch (error) {
            const duration = Date.now() - startedAt;
            return createFailureResult(task, 'technical_ai', error, duration, ['compute', 'ai_models']);
          } finally {
            techAgentState.activeTasks = Math.max(0, techAgentState.activeTasks - 1);
            techAgentState.lastActivity = new Date();
          }
        },
        async getStatus(): Promise<AgentStatus> {
          return {
            status: techAgentState.activeTasks > 0 ? 'busy' : 'active',
            currentTasks: techAgentState.activeTasks,
            queuedTasks: techAgentState.queuedTasks,
            lastActivity: techAgentState.lastActivity,
            resourceUsage: {
              cpu: techAgentState.activeTasks > 0 ? 32 : 12,
              memory: 1024,
              storage: 35,
            },
          };
        },
        configure: async (config: any) => console.log('Technical AI configured:', config),
        shutdown: async () => console.log('Technical AI shutting down...'),
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

      const businessAgentState: AgentAdapterState = {
        activeTasks: 0,
        lastActivity: new Date(),
        queuedTasks: 0,
      };

      const businessAgentAdapter: AgentHandler = {
        validateTask: () => true,
        async execute(task: AgentTask): Promise<AgentResult> {
          businessAgentState.activeTasks++;
          const startedAt = Date.now();

          try {
            const payload = task.payload ?? {};
            const projectId = payload.projectId ?? task.context.projectId ?? 'unknown_project';
            let resultData: any;

            if (payload.stepName || payload.dependency || payload.project || payload.previousResults) {
              const normalizedTask = {
                stepName: payload.stepName ?? task.type ?? 'business_analysis',
                dependency: payload.dependency ?? { metadata: payload.metadata ?? {} },
                project: payload.project ?? {},
                previousResults: payload.previousResults ?? {},
                payload,
              };

              resultData = await businessAgent.processTask(normalizedTask, projectId);
            } else {
              const intentCategory = payload.intent?.category ?? 'business_analysis';

              switch (intentCategory) {
                case 'business_analysis':
                  resultData = await businessAgent.generateBusinessKPIs(
                    payload.industry ?? 'general',
                    payload.analysisType ?? 'business_analysis'
                  );
                  break;

                case 'data_analysis':
                case 'ml_request':
                  resultData = await businessAgent.assessBusinessImpact(
                    deriveGoals(payload, 'Understand business performance'),
                    payload.proposedApproach ?? { method: 'standard_analysis' },
                    payload.industry ?? 'general'
                  );
                  break;

                default:
                  resultData = {
                    acknowledgement: 'Business agent received the request.',
                    summary:
                      typeof payload.userInput === 'string' && payload.userInput.trim().length > 0
                        ? payload.userInput
                        : 'No detailed business context provided.',
                    nextSteps: [
                      'Share industry context to unlock tailored benchmarks',
                      'Provide explicit business goals to refine analysis options',
                    ],
                  };
                  break;
              }
            }

            const duration = Date.now() - startedAt;
            return createSuccessResult(task, 'business_agent', resultData, duration, ['business_intelligence']);
          } catch (error) {
            const duration = Date.now() - startedAt;
            return createFailureResult(task, 'business_agent', error, duration, ['business_intelligence']);
          } finally {
            businessAgentState.activeTasks = Math.max(0, businessAgentState.activeTasks - 1);
            businessAgentState.lastActivity = new Date();
          }
        },
        async getStatus(): Promise<AgentStatus> {
          return {
            status: businessAgentState.activeTasks > 0 ? 'busy' : 'active',
            currentTasks: businessAgentState.activeTasks,
            queuedTasks: businessAgentState.queuedTasks,
            lastActivity: businessAgentState.lastActivity,
            resourceUsage: {
              cpu: businessAgentState.activeTasks > 0 ? 18 : 6,
              memory: 512,
              storage: 24,
            },
          };
        },
        configure: async (config: any) => console.log('Business Agent configured:', config),
        shutdown: async () => console.log('Business Agent shutting down...'),
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

      const pmAgentState: AgentAdapterState = {
        activeTasks: 0,
        lastActivity: new Date(),
        queuedTasks: 0,
      };

      const pmAgentAdapter: AgentHandler = {
        validateTask: () => true,
        async execute(task: AgentTask): Promise<AgentResult> {
          pmAgentState.activeTasks++;
          const startedAt = Date.now();

          try {
            const payload = task.payload ?? {};
            const projectId = payload.projectId ?? task.context.projectId ?? payload.project?.id ?? 'unknown_project';
            let resultData: any;

            if (payload.command === 'queue_task' || payload.stepName) {
              if (!projectId) {
                throw new Error('Project ID is required to queue a project manager task');
              }

              const queueInput = {
                type: (payload.type ?? payload.stepName ?? task.type ?? 'project_task') as string,
                priority: payload.priorityLabel ?? mapPriorityToLabel(task.priority),
                payload: {
                  ...(payload.taskData ?? {}),
                  ...(payload.payload ?? {}),
                  projectId,
                  userId: task.context.userId ?? 'system',
                  originalPayload: payload,
                },
                requiredCapabilities:
                  toStringArray(payload.requiredCapabilities) ?? task.requiredCapabilities ?? [],
                userId: task.context.userId ?? 'system',
                projectId,
                preferredAgents: toStringArray(payload.preferredAgents),
                excludeAgents: toStringArray(payload.excludeAgents),
                estimatedDuration: payload.estimatedDuration,
                dependencies:
                  toStringArray(payload.dependencies) ?? toStringArray(payload.dependsOn),
                maxRetries: payload.maxRetries,
                timeoutMs: payload.timeoutMs,
              };

              resultData = await projectManager.queueTask(queueInput);
            } else if ((payload.command === 'queue_workflow' || Array.isArray(payload.tasks)) && projectId) {
              resultData = await projectManager.queueWorkflowTasks(projectId, payload.tasks);
            } else if (
              (payload.command === 'coordinate_goal_analysis' || payload.operation === 'coordinate_goal_analysis') &&
              projectId
            ) {
              resultData = await projectManager.coordinateGoalAnalysis(
                projectId,
                payload.uploadedData ?? payload.data ?? {},
                Array.isArray(payload.userGoals) ? payload.userGoals : deriveGoals(payload, 'Clarify project goals'),
                payload.industry ?? 'general'
              );
            } else if (payload.dataCharacteristics) {
              resultData = await projectManager.generateTransformationRecommendations(
                payload.dataCharacteristics,
                payload.journeyType ?? 'ai_guided'
              );
            } else if (Array.isArray(payload.transformations)) {
              resultData = await projectManager.coordinateTransformationExecution({
                projectId,
                transformations: payload.transformations,
                userGoals: Array.isArray(payload.userGoals) ? payload.userGoals : [],
                audienceContext: payload.audienceContext ?? {},
              });
            } else if (payload.request === 'get_transformation_checkpoint' && projectId) {
              resultData = await projectManager.getTransformationCheckpoint(projectId);
            } else if (payload.request === 'artifacts' && projectId) {
              resultData = await projectManager.getProjectArtifacts(projectId);
            } else {
              resultData = {
                acknowledgement: 'Project manager received the request.',
                guidance: 'Provide a project command, workflow, or transformation payload to continue.',
              };
            }

            const duration = Date.now() - startedAt;
            return createSuccessResult(task, 'project_manager', resultData, duration, ['orchestration']);
          } catch (error) {
            const duration = Date.now() - startedAt;
            return createFailureResult(task, 'project_manager', error, duration, ['orchestration']);
          } finally {
            pmAgentState.activeTasks = Math.max(0, pmAgentState.activeTasks - 1);
            pmAgentState.lastActivity = new Date();
          }
        },
        async getStatus(): Promise<AgentStatus> {
          return {
            status: pmAgentState.activeTasks > 0 ? 'busy' : 'active',
            currentTasks: pmAgentState.activeTasks,
            queuedTasks: pmAgentState.queuedTasks,
            lastActivity: pmAgentState.lastActivity,
            resourceUsage: {
              cpu: pmAgentState.activeTasks > 0 ? 20 : 8,
              memory: 768,
              storage: 30,
            },
          };
        },
        configure: async (config: any) => console.log('Project Manager configured:', config),
        shutdown: async () => console.log('Project Manager shutting down...'),
      };

      await this.registry.registerAgent(pmMetadata, pmAgentAdapter);
      this.initializedAgents.set('project_manager', pmAgentAdapter);
      console.log('📋 Project Manager Agent adapted and registered');
    }
  }

  private async setupCommunicationRoutes(): Promise<void> {
    console.log('🔗 Setting up inter-agent communication routes...');

    // Define routing rules for different scenarios
  const routingRules: Array<Omit<RoutingRule, 'id' | 'createdAt'>> = [
      {
        name: 'Customer Inquiry Routing',
        priority: 5,
        conditions: {
          intent: ['simple_question', 'greeting', 'general_inquiry'],
        },
        actions: {
          preferredAgentTypes: ['service'],
          requiredCapabilities: ['customer_service'],
          maxWaitTime: 60000,
          escalationPath: ['coordinator'],
          autoResponse: 'Thanks for reaching out! A support specialist is on the way.',
        },
        enabled: true,
      },
      {
        name: 'Technical Analysis Routing',
        priority: 8,
        conditions: {
          intent: ['data_analysis', 'ml_request'],
          complexity: ['medium', 'high'] as Array<'low' | 'medium' | 'high'>,
        },
        actions: {
          preferredAgentTypes: ['ai_specialist'],
          requiredCapabilities: ['statistical_analysis'],
          maxWaitTime: 120000,
          escalationPath: ['specialist', 'coordinator'],
        },
        enabled: true,
      },
      {
        name: 'Data Processing Routing',
        priority: 6,
        conditions: {
          intent: ['data_transformation'],
        },
        actions: {
          preferredAgentTypes: ['specialist'],
          requiredCapabilities: ['data_transformation'],
          maxWaitTime: 180000,
          escalationPath: ['ai_specialist'],
        },
        enabled: true,
      },
      {
        name: 'Business Analysis Routing',
        priority: 6,
        conditions: {
          intent: ['business_analysis'],
        },
        actions: {
          preferredAgentTypes: ['business_specialist'],
          requiredCapabilities: ['business_analysis'],
          maxWaitTime: 90000,
          escalationPath: ['coordinator'],
        },
        enabled: true,
      },
      {
        name: 'Project Coordination Routing',
        priority: 7,
        conditions: {
          keywords: ['workflow', 'coordination', 'timeline', 'plan'],
        },
        actions: {
          preferredAgentTypes: ['coordinator'],
          requiredCapabilities: ['project_orchestration'],
          maxWaitTime: 120000,
          escalationPath: ['service'],
        },
        enabled: true,
      },
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
      registeredAgents.map(async (agent) => {
        const runtimeStatus = await this.registry.getAgentStatus(agent.id);

        return {
          id: agent.id,
          name: agent.name,
          status: runtimeStatus?.status ?? agent.status,
          lastHealth: agent.health?.lastHeartbeat ?? null,
          taskCount: runtimeStatus?.currentTasks ?? agent.currentTasks,
          queuedTasks: runtimeStatus?.queuedTasks ?? 0,
        };
      })
    );

    return {
      totalAgents: registeredAgents.length,
      activeAgents: agentStatuses.filter(a => a.status === 'active').length,
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
          complexity: 'low' as const,
          estimatedDuration: 30,
          requiredResources: ['compute'],
          tags: ['demo', 'test']
        }
      ],
      priority: 5,
      maxConcurrentTasks: 1,
      status: 'active' as const,
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
      }
    };

    const tempAgent: AgentHandler = {
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