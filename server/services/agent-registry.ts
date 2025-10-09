// server/services/agent-registry.ts
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';

export interface AgentCapability {
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
  complexity: 'low' | 'medium' | 'high';
  estimatedDuration: number; // in seconds
  requiredResources: string[];
  tags: string[];
}

export interface AgentMetadata {
  id: string;
  name: string;
  type: string;
  description: string;
  version: string;
  capabilities: AgentCapability[];
  status: 'active' | 'inactive' | 'busy' | 'error' | 'maintenance';
  health: {
    lastHeartbeat: Date;
    responseTime: number;
    errorRate: number;
    uptime: number;
  };
  configuration: Record<string, any>;
  permissions: string[];
  priority: number; // 1-10, higher is more priority
  maxConcurrentTasks: number;
  currentTasks: number;
  metrics: {
    totalTasks: number;
    successfulTasks: number;
    averageResponseTime: number;
    lastActivity: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentInstance {
  metadata: AgentMetadata;
  handler: AgentHandler;
}

export interface AgentHandler {
  execute(task: AgentTask): Promise<AgentResult>;
  validateTask(task: AgentTask): boolean;
  getStatus(): Promise<AgentStatus>;
  configure(config: Record<string, any>): Promise<void>;
  shutdown(): Promise<void>;
}

export interface AgentTask {
  id: string;
  type: string;
  priority: number;
  payload: any;
  requiredCapabilities: string[];
  context: {
    userId: string;
    projectId?: string;
    sessionId?: string;
    parentTaskId?: string;
  };
  constraints: {
    maxDuration?: number;
    requiredResources?: string[];
    preferredAgents?: string[];
  };
  createdAt: Date;
}

export interface AgentResult {
  taskId: string;
  agentId: string;
  status: 'success' | 'failure' | 'partial';
  result: any;
  error?: string;
  metrics: {
    duration: number;
    resourcesUsed: string[];
    tokensConsumed?: number;
  };
  artifacts?: {
    type: string;
    data: any;
    metadata: Record<string, any>;
  }[];
  nextActions?: AgentTask[];
  completedAt: Date;
}

export interface AgentStatus {
  status: 'active' | 'inactive' | 'busy' | 'error' | 'maintenance';
  currentTasks: number;
  queuedTasks: number;
  lastActivity: Date;
  resourceUsage: {
    cpu: number;
    memory: number;
    storage: number;
  };
}

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInstance> = new Map();
  private taskQueue: AgentTask[] = [];
  private activeTasks: Map<string, AgentTask> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly healthCheckFrequency = 30000; // 30 seconds

  constructor() {
    super();
    this.startHealthMonitoring();
  }

  /**
   * Register a new agent with the registry
   */
  async registerAgent(
    metadata: Omit<AgentMetadata, 'id' | 'createdAt' | 'updatedAt' | 'metrics'>,
    handler: AgentHandler
  ): Promise<string> {
    const agentId = `agent_${metadata.type}_${nanoid()}`;
    
    const fullMetadata: AgentMetadata = {
      ...metadata,
      id: agentId,
      health: {
        lastHeartbeat: new Date(),
        responseTime: 0,
        errorRate: 0,
        uptime: 0
      },
      metrics: {
        totalTasks: 0,
        successfulTasks: 0,
        averageResponseTime: 0,
        lastActivity: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const agentInstance: AgentInstance = {
      metadata: fullMetadata,
      handler
    };

    this.agents.set(agentId, agentInstance);
    
    console.log(`🤖 Agent registered: ${metadata.name} (${agentId})`);
    this.emit('agentRegistered', { agentId, metadata: fullMetadata });
    
    return agentId;
  }

  /**
   * Unregister an agent from the registry
   */
  async unregisterAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    // Gracefully shutdown the agent
    try {
      await agent.handler.shutdown();
    } catch (error) {
      console.error(`Error shutting down agent ${agentId}:`, error);
    }

    // Remove any queued tasks for this agent
    this.taskQueue = this.taskQueue.filter(task => 
      !task.constraints.preferredAgents?.includes(agentId)
    );

    this.agents.delete(agentId);
    
    console.log(`🤖 Agent unregistered: ${agentId}`);
    this.emit('agentUnregistered', { agentId });
    
    return true;
  }

  /**
   * Update agent configuration
   */
  async updateAgentConfiguration(agentId: string, config: Record<string, any>): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    try {
      await agent.handler.configure(config);
      agent.metadata.configuration = { ...agent.metadata.configuration, ...config };
      agent.metadata.updatedAt = new Date();
      
      this.emit('agentConfigured', { agentId, config });
      return true;
    } catch (error) {
      console.error(`Error configuring agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Find the best agent for a given task
   */
  findBestAgent(task: AgentTask): string | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => {
        // Check if agent is active and has capacity
        if (agent.metadata.status !== 'active') return false;
        if (agent.metadata.currentTasks >= agent.metadata.maxConcurrentTasks) return false;

        // Check if agent has required capabilities
        const hasRequiredCapabilities = task.requiredCapabilities.every(reqCap =>
          agent.metadata.capabilities.some(cap => cap.name === reqCap)
        );
        if (!hasRequiredCapabilities) return false;

        // Check preferred agents
        if (task.constraints.preferredAgents?.length) {
          return task.constraints.preferredAgents.includes(agent.metadata.id);
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by priority (higher first), then by current load (lower first)
        const priorityDiff = b.metadata.priority - a.metadata.priority;
        if (priorityDiff !== 0) return priorityDiff;
        
        const loadDiff = a.metadata.currentTasks - b.metadata.currentTasks;
        if (loadDiff !== 0) return loadDiff;

        // Finally, by response time (faster first)
        return a.metadata.health.responseTime - b.metadata.health.responseTime;
      });

    return availableAgents.length > 0 ? availableAgents[0].metadata.id : null;
  }

  /**
   * Submit a task for execution
   */
  async submitTask(task: Omit<AgentTask, 'id' | 'createdAt'>): Promise<string> {
    const fullTask: AgentTask = {
      ...task,
      id: `task_${nanoid()}`,
      createdAt: new Date()
    };

    // Try to find an agent immediately
    const bestAgentId = this.findBestAgent(fullTask);
    
    if (bestAgentId) {
      // Execute immediately
      this.executeTask(fullTask, bestAgentId);
    } else {
      // Queue for later execution
      this.taskQueue.push(fullTask);
      this.emit('taskQueued', { taskId: fullTask.id, queuePosition: this.taskQueue.length });
    }

    console.log(`📋 Task submitted: ${fullTask.id} ${bestAgentId ? '(executing)' : '(queued)'}`);
    return fullTask.id;
  }

  /**
   * Execute a task with a specific agent
   */
  private async executeTask(task: AgentTask, agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      this.emit('taskFailed', { taskId: task.id, error: 'Agent not found' });
      return;
    }

    // Update agent state
    agent.metadata.currentTasks++;
    agent.metadata.status = agent.metadata.currentTasks >= agent.metadata.maxConcurrentTasks ? 'busy' : 'active';
    this.activeTasks.set(task.id, task);

    this.emit('taskStarted', { taskId: task.id, agentId });

    const startTime = Date.now();
    
    try {
      // Validate task before execution
      if (!agent.handler.validateTask(task)) {
        throw new Error('Task validation failed');
      }

      // Execute the task
      const result = await agent.handler.execute(task);
      const duration = Date.now() - startTime;

      // Update agent metrics
      agent.metadata.metrics.totalTasks++;
      agent.metadata.metrics.successfulTasks++;
      agent.metadata.metrics.averageResponseTime = 
        (agent.metadata.metrics.averageResponseTime + duration) / 2;
      agent.metadata.metrics.lastActivity = new Date();

      this.emit('taskCompleted', { taskId: task.id, agentId, result, duration });

      // Submit any follow-up tasks
      if (result.nextActions?.length) {
        for (const nextTask of result.nextActions) {
          await this.submitTask(nextTask);
        }
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Update agent metrics
      agent.metadata.metrics.totalTasks++;
      agent.metadata.health.errorRate = 
        (agent.metadata.health.errorRate * 0.9) + (0.1); // Exponential moving average

      console.error(`Task ${task.id} failed on agent ${agentId}:`, error.message);
      this.emit('taskFailed', { taskId: task.id, agentId, error: error.message, duration });

    } finally {
      // Cleanup
      agent.metadata.currentTasks--;
      agent.metadata.status = agent.metadata.currentTasks > 0 ? 'busy' : 'active';
      this.activeTasks.delete(task.id);

      // Process queue
      this.processQueue();
    }
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Try to execute queued tasks
    const tasksToExecute: { task: AgentTask; agentId: string }[] = [];
    
    for (let i = this.taskQueue.length - 1; i >= 0; i--) {
      const task = this.taskQueue[i];
      const bestAgentId = this.findBestAgent(task);
      
      if (bestAgentId) {
        tasksToExecute.push({ task, agentId: bestAgentId });
        this.taskQueue.splice(i, 1);
      }
    }

    // Execute all found matches
    for (const { task, agentId } of tasksToExecute) {
      this.executeTask(task, agentId);
    }
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentMetadata[] {
    return Array.from(this.agents.values()).map(agent => agent.metadata);
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentMetadata | null {
    const agent = this.agents.get(agentId);
    return agent ? agent.metadata : null;
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: string): AgentMetadata[] {
    return this.getAgents().filter(agent => agent.type === type);
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capabilityName: string): AgentMetadata[] {
    return this.getAgents().filter(agent =>
      agent.capabilities.some(cap => cap.name === capabilityName)
    );
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queuedTasks: number;
    activeTasks: number;
    totalAgents: number;
    activeAgents: number;
    busyAgents: number;
  } {
    const agents = this.getAgents();
    return {
      queuedTasks: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
      busyAgents: agents.filter(a => a.status === 'busy').length
    };
  }

  /**
   * Start health monitoring for all agents
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [agentId, agent] of this.agents.entries()) {
        try {
          const status = await agent.handler.getStatus();
          
          // Ensure health object exists
          if (!agent.metadata.health) {
            agent.metadata.health = {
              lastHeartbeat: new Date(),
              responseTime: 0,
              errorRate: 0,
              uptime: 0
            };
          }
          
          // Update health metrics
          const now = new Date();
          agent.metadata.health.lastHeartbeat = now;
          agent.metadata.health.responseTime = Date.now() - now.getTime();
          agent.metadata.status = status.status;
          agent.metadata.currentTasks = status.currentTasks;

          // Check for unhealthy agents
          const timeSinceLastActivity = Date.now() - agent.metadata.metrics.lastActivity.getTime();
          if (timeSinceLastActivity > 300000) { // 5 minutes
            agent.metadata.status = 'inactive';
            this.emit('agentUnhealthy', { agentId, reason: 'No activity for 5 minutes' });
          }

        } catch (error) {
          console.error(`Health check failed for agent ${agentId}:`, error);
          agent.metadata.status = 'error';
          
          // Ensure health object exists before accessing errorRate
          if (!agent.metadata.health) {
            agent.metadata.health = {
              lastHeartbeat: new Date(),
              responseTime: 0,
              errorRate: 0,
              uptime: 0
            };
          }
          
          agent.metadata.health.errorRate = Math.min(agent.metadata.health.errorRate + 0.1, 1.0);
          this.emit('agentUnhealthy', { agentId, reason: 'Health check failed' });
        }
      }

      // Process queue after health checks
      this.processQueue();
    }, this.healthCheckFrequency);
  }

  /**
   * Stop the agent registry
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Shutdown all agents
    for (const [agentId, agent] of this.agents.entries()) {
      try {
        await agent.handler.shutdown();
      } catch (error) {
        console.error(`Error shutting down agent ${agentId}:`, error);
      }
    }

    this.agents.clear();
    this.taskQueue = [];
    this.activeTasks.clear();
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistry();