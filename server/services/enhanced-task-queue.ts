/**
 * Enhanced Agent Task Queue System
 * 
 * Provides priority-based task queuing, load balancing, and intelligent
 * task distribution to prevent bottlenecks and optimize agent performance.
 * 
 * Features:
 * - Priority-based task scheduling
 * - Load balancing across agents
 * - Task retry mechanisms
 * - Performance monitoring
 * - Dead letter queue handling
 * - Agent capacity management
 */

import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';

export interface QueuedTask {
  id: string;
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
  payload: any;
  requiredCapabilities: string[];
  preferredAgents?: string[];
  excludeAgents?: string[];
  metadata: {
    userId: string;
    projectId?: string;
    createdAt: Date;
    maxRetries: number;
    retryCount: number;
    timeoutMs: number;
    estimatedDuration?: number;
    dependencies?: string[];
  };
  scheduledFor?: Date;
  deadlineAt?: Date;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  result?: any;
  error?: string;
  duration: number;
  resourcesUsed: string[];
  completedAt: Date;
}

export interface AgentCapacity {
  agentId: string;
  maxConcurrentTasks: number;
  currentTasks: number;
  capabilities: string[];
  avgTaskDuration: number;
  successRate: number;
  lastActivity: Date;
  status: 'available' | 'busy' | 'overloaded' | 'offline';
  performance: {
    tasksCompleted: number;
    totalDuration: number;
    errors: number;
    timeouts: number;
  };
}

export interface QueueMetrics {
  totalTasks: number;
  queuedTasks: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  throughput: number;
  agentUtilization: Record<string, number>;
}

export class EnhancedTaskQueue extends EventEmitter {
  private queues: Map<string, QueuedTask[]> = new Map(); // Priority-based queues
  private processingTasks: Map<string, QueuedTask> = new Map();
  private agentCapacities: Map<string, AgentCapacity> = new Map();
  private taskHistory: Map<string, TaskResult> = new Map();
  private deadLetterQueue: QueuedTask[] = [];
  
  private metrics: QueueMetrics;
  private processInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private config: {
    processIntervalMs?: number;
    maxQueueSize?: number;
    maxRetries?: number;
    defaultTimeoutMs?: number;
    cleanupIntervalMs?: number;
    maxDeadLetterSize?: number;
  } = {}) {
    super();
    
    this.config = {
      processIntervalMs: 100,      // Process queue every 100ms
      maxQueueSize: 10000,         // Max tasks in queue
      maxRetries: 3,               // Max retry attempts
      defaultTimeoutMs: 300000,    // 5 minute default timeout
      cleanupIntervalMs: 60000,    // Cleanup every minute
      maxDeadLetterSize: 1000,     // Max dead letter queue size
      ...config
    };

    this.metrics = this.initializeMetrics();
    this.initializeQueues();
    this.startProcessing();
    this.startCleanup();
  }

  private initializeMetrics(): QueueMetrics {
    return {
      totalTasks: 0,
      queuedTasks: 0,
      processingTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      throughput: 0,
      agentUtilization: {}
    };
  }

  private initializeQueues(): void {
    // Initialize priority queues
    const priorities = ['critical', 'urgent', 'high', 'normal', 'low'];
    priorities.forEach(priority => {
      this.queues.set(priority, []);
    });
  }

  /**
   * Register an agent with its capabilities and capacity
   */
  registerAgent(agentId: string, capabilities: string[], maxConcurrentTasks: number = 5): void {
    const capacity: AgentCapacity = {
      agentId,
      maxConcurrentTasks,
      currentTasks: 0,
      capabilities,
      avgTaskDuration: 0,
      successRate: 1.0,
      lastActivity: new Date(),
      status: 'available',
      performance: {
        tasksCompleted: 0,
        totalDuration: 0,
        errors: 0,
        timeouts: 0
      }
    };

    this.agentCapacities.set(agentId, capacity);
    console.log(`Agent ${agentId} registered with capabilities: ${capabilities.join(', ')}`);
    this.emit('agent_registered', { agentId, capabilities, capacity: maxConcurrentTasks });
  }

  /**
   * Enqueue a task with priority-based placement
   */
  async enqueueTask(task: Omit<QueuedTask, 'id' | 'metadata'> & { 
    metadata: Partial<QueuedTask['metadata']> 
  }): Promise<string> {
    // Validate queue capacity
    const totalQueued = Array.from(this.queues.values()).reduce((sum, queue) => sum + queue.length, 0);
    if (totalQueued >= this.config.maxQueueSize!) {
      throw new Error('Queue capacity exceeded');
    }

    if (!task.metadata.userId) {
      throw new Error('Task metadata must include userId');
    }

    const taskId = nanoid();
  const userId = task.metadata.userId!;
    const queuedTask: QueuedTask = {
      ...task,
      id: taskId,
      metadata: {
        userId,
        projectId: task.metadata.projectId,
        createdAt: new Date(),
        maxRetries: task.metadata.maxRetries ?? this.config.maxRetries!,
        retryCount: 0,
        timeoutMs: task.metadata.timeoutMs ?? this.config.defaultTimeoutMs!,
        estimatedDuration: task.metadata.estimatedDuration,
        dependencies: task.metadata.dependencies || []
      }
    };

    // Add to appropriate priority queue
    const priorityQueue = this.queues.get(task.priority);
    if (priorityQueue) {
      // Insert with consideration for scheduled time and dependencies
      this.insertTaskInQueue(priorityQueue, queuedTask);
      this.metrics.totalTasks++;
      this.metrics.queuedTasks++;
      
      console.log(`Task ${taskId} enqueued with priority ${task.priority}`);
      this.emit('task_enqueued', { taskId, priority: task.priority });
      
      return taskId;
    } else {
      throw new Error(`Invalid priority: ${task.priority}`);
    }
  }

  private insertTaskInQueue(queue: QueuedTask[], task: QueuedTask): void {
    // Simple insertion at end for now, could be enhanced with more sophisticated scheduling
    // Consider: deadline, estimated duration, dependencies
    if (task.scheduledFor && task.scheduledFor > new Date()) {
      // Find insertion point for scheduled tasks
      const insertIndex = queue.findIndex(t => 
        t.scheduledFor && t.scheduledFor > task.scheduledFor!
      );
      if (insertIndex === -1) {
        queue.push(task);
      } else {
        queue.splice(insertIndex, 0, task);
      }
    } else {
      queue.push(task);
    }
  }

  /**
   * Start processing tasks from queues
   */
  private startProcessing(): void {
    this.processInterval = setInterval(() => {
      this.processQueues();
    }, this.config.processIntervalMs);
  }

  private async processQueues(): Promise<void> {
    // Process queues in priority order
    const priorities = ['critical', 'urgent', 'high', 'normal', 'low'];
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) continue;

      // Find available agent for next task
      const nextTask = this.findNextReadyTask(queue);
      if (!nextTask) continue;

      const availableAgent = this.findBestAgent(nextTask);
      if (!availableAgent) continue;

      // Assign task to agent
      await this.assignTaskToAgent(nextTask, availableAgent);
      
      // Remove from queue
      const taskIndex = queue.indexOf(nextTask);
      if (taskIndex !== -1) {
        queue.splice(taskIndex, 1);
        this.metrics.queuedTasks--;
        this.metrics.processingTasks++;
      }
    }
  }

  private findNextReadyTask(queue: QueuedTask[]): QueuedTask | null {
    const now = new Date();
    
    return queue.find(task => {
      // Check if task is ready to run
      if (task.scheduledFor && task.scheduledFor > now) return false;
      
      // Check dependencies (simplified - would need more complex dependency resolution)
      if (task.metadata.dependencies && task.metadata.dependencies.length > 0) {
        const dependenciesCompleted = task.metadata.dependencies.every(depId => 
          this.taskHistory.has(depId) && this.taskHistory.get(depId)?.status === 'success'
        );
        if (!dependenciesCompleted) return false;
      }
      
      return true;
    }) || null;
  }

  private findBestAgent(task: QueuedTask): string | null {
    const eligibleAgents = Array.from(this.agentCapacities.values()).filter(agent => {
      // Check if agent is available
      if (agent.status !== 'available' || agent.currentTasks >= agent.maxConcurrentTasks) {
        return false;
      }
      
      // Check if agent has required capabilities
      const hasCapabilities = task.requiredCapabilities.every(capability => 
        agent.capabilities.includes(capability)
      );
      if (!hasCapabilities) return false;
      
      // Check preferred/excluded agents
      if (task.preferredAgents && !task.preferredAgents.includes(agent.agentId)) {
        return false;
      }
      if (task.excludeAgents && task.excludeAgents.includes(agent.agentId)) {
        return false;
      }
      
      return true;
    });

    if (eligibleAgents.length === 0) return null;

    // Select best agent based on performance and load
    eligibleAgents.sort((a, b) => {
      // Primary: lowest current load
      const loadDiff = (a.currentTasks / a.maxConcurrentTasks) - (b.currentTasks / b.maxConcurrentTasks);
      if (Math.abs(loadDiff) > 0.1) return loadDiff;
      
      // Secondary: highest success rate
      const successDiff = b.successRate - a.successRate;
      if (Math.abs(successDiff) > 0.05) return successDiff;
      
      // Tertiary: fastest average duration
      return a.avgTaskDuration - b.avgTaskDuration;
    });

    return eligibleAgents[0].agentId;
  }

  private async assignTaskToAgent(task: QueuedTask, agentId: string): Promise<void> {
    const agent = this.agentCapacities.get(agentId);
    if (!agent) return;

    // Update agent capacity
    agent.currentTasks++;
    agent.lastActivity = new Date();
    if (agent.currentTasks >= agent.maxConcurrentTasks) {
      agent.status = 'busy';
    }

    // Track processing task
    this.processingTasks.set(task.id, task);

    console.log(`Task ${task.id} assigned to agent ${agentId}`);
    this.emit('task_assigned', { taskId: task.id, agentId, task });

    // Set timeout for task
    const timeoutId = setTimeout(() => {
      this.handleTaskTimeout(task.id, agentId);
    }, task.metadata.timeoutMs);

    // Simulate task execution (in real implementation, this would trigger actual agent execution)
    try {
      const result = await this.executeTaskOnAgent(task, agentId);
      clearTimeout(timeoutId);
      await this.handleTaskCompletion(task.id, agentId, result);
    } catch (error) {
      clearTimeout(timeoutId);
      await this.handleTaskFailure(task.id, agentId, error as Error);
    }
  }

  private async executeTaskOnAgent(task: QueuedTask, agentId: string): Promise<any> {
    // This would integrate with actual agent execution
    // For now, simulate task execution with some variability
    const executionTime = Math.random() * 2000 + 500; // 500ms to 2.5s
    await new Promise(resolve => setTimeout(resolve, executionTime));
    
    // Simulate occasional failures for testing
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error('Simulated task execution failure');
    }
    
    return {
      message: `Task ${task.id} completed by agent ${agentId}`,
      executionTime,
      result: `Processed ${task.type} task`
    };
  }

  private async handleTaskCompletion(taskId: string, agentId: string, result: any): Promise<void> {
    const task = this.processingTasks.get(taskId);
    if (!task) return;

    const duration = Date.now() - task.metadata.createdAt.getTime();
    
    const taskResult: TaskResult = {
      taskId,
      agentId,
      status: 'success',
      result,
      duration,
      resourcesUsed: [agentId],
      completedAt: new Date()
    };

    // Update metrics and agent performance
    this.updateAgentPerformance(agentId, duration, true);
    this.updateMetrics(taskResult);
    
    // Clean up
    this.processingTasks.delete(taskId);
    this.taskHistory.set(taskId, taskResult);
    
    console.log(`Task ${taskId} completed successfully by agent ${agentId} in ${duration}ms`);
    this.emit('task_completed', taskResult);
  }

  private async handleTaskFailure(taskId: string, agentId: string, error: Error): Promise<void> {
    const task = this.processingTasks.get(taskId);
    if (!task) return;

    const duration = Date.now() - task.metadata.createdAt.getTime();
    
    // Update agent performance
    this.updateAgentPerformance(agentId, duration, false);
    
    // Check if task should be retried
    if (task.metadata.retryCount < task.metadata.maxRetries) {
      task.metadata.retryCount++;
      task.scheduledFor = new Date(Date.now() + Math.pow(2, task.metadata.retryCount) * 1000); // Exponential backoff
      
      // Re-enqueue for retry
      const priorityQueue = this.queues.get(task.priority);
      if (priorityQueue) {
        this.insertTaskInQueue(priorityQueue, task);
        this.metrics.queuedTasks++;
      }
      
      console.log(`Task ${taskId} scheduled for retry ${task.metadata.retryCount}/${task.metadata.maxRetries}`);
      this.emit('task_retry_scheduled', { taskId, retryCount: task.metadata.retryCount, error: error.message });
    } else {
      // Move to dead letter queue
      this.moveToDeadLetterQueue(task, error);
      
      const taskResult: TaskResult = {
        taskId,
        agentId,
        status: 'failure',
        error: error.message,
        duration,
        resourcesUsed: [agentId],
        completedAt: new Date()
      };
      
      this.updateMetrics(taskResult);
      this.taskHistory.set(taskId, taskResult);
      
      console.error(`Task ${taskId} failed permanently: ${error.message}`);
      this.emit('task_failed', taskResult);
    }
    
    this.processingTasks.delete(taskId);
  }

  private handleTaskTimeout(taskId: string, agentId: string): void {
    const task = this.processingTasks.get(taskId);
    if (!task) return;

    const duration = Date.now() - task.metadata.createdAt.getTime();
    
    const taskResult: TaskResult = {
      taskId,
      agentId,
      status: 'timeout',
      error: 'Task execution timeout',
      duration,
      resourcesUsed: [agentId],
      completedAt: new Date()
    };

    // Update agent performance
    this.updateAgentPerformance(agentId, duration, false);
    this.updateMetrics(taskResult);
    
    // Handle as failure (will retry if attempts remain)
    this.handleTaskFailure(taskId, agentId, new Error('Task timeout'));
    
    console.warn(`Task ${taskId} timed out after ${duration}ms`);
    this.emit('task_timeout', taskResult);
  }

  private updateAgentPerformance(agentId: string, duration: number, success: boolean): void {
    const agent = this.agentCapacities.get(agentId);
    if (!agent) return;

    // Update current tasks and status
    agent.currentTasks = Math.max(0, agent.currentTasks - 1);
    agent.lastActivity = new Date();
    
    if (agent.currentTasks === 0) {
      agent.status = 'available';
    } else if (agent.currentTasks < agent.maxConcurrentTasks) {
      agent.status = 'available';
    }

    // Update performance metrics
    agent.performance.tasksCompleted++;
    agent.performance.totalDuration += duration;
    
    if (success) {
      // Update success rate (exponential moving average)
      agent.successRate = agent.successRate * 0.9 + 0.1;
    } else {
      agent.performance.errors++;
      agent.successRate = agent.successRate * 0.9;
    }
    
    // Update average task duration
    agent.avgTaskDuration = agent.performance.totalDuration / agent.performance.tasksCompleted;
    
    this.metrics.agentUtilization[agentId] = agent.currentTasks / agent.maxConcurrentTasks;
  }

  private updateMetrics(taskResult: TaskResult): void {
    this.metrics.processingTasks = Math.max(0, this.metrics.processingTasks - 1);
    
    if (taskResult.status === 'success') {
      this.metrics.completedTasks++;
    } else {
      this.metrics.failedTasks++;
    }
    
    // Update average processing time
    const totalCompleted = this.metrics.completedTasks + this.metrics.failedTasks;
    if (totalCompleted > 0) {
      const totalTime = this.metrics.averageProcessingTime * (totalCompleted - 1) + taskResult.duration;
      this.metrics.averageProcessingTime = totalTime / totalCompleted;
    }
    
    // Calculate throughput (tasks per second over last minute)
    const recentTasks = Array.from(this.taskHistory.values()).filter(
      result => Date.now() - result.completedAt.getTime() < 60000
    );
    this.metrics.throughput = recentTasks.length / 60;
  }

  private moveToDeadLetterQueue(task: QueuedTask, error: Error): void {
    if (this.deadLetterQueue.length >= this.config.maxDeadLetterSize!) {
      this.deadLetterQueue.shift(); // Remove oldest
    }
    
    (task as any).failureReason = error.message;
    (task as any).failedAt = new Date();
    this.deadLetterQueue.push(task);
    
    this.emit('task_moved_to_dlq', { taskId: task.id, error: error.message });
  }

  /**
   * Start cleanup process for stale tasks and metrics
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupIntervalMs);
  }

  private performCleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    // Clean up old task history
    for (const [taskId, result] of this.taskHistory.entries()) {
      if (now - result.completedAt.getTime() > maxAge) {
        this.taskHistory.delete(taskId);
      }
    }
    
    // Clean up stale processing tasks
    for (const [taskId, task] of this.processingTasks.entries()) {
      const age = now - task.metadata.createdAt.getTime();
      if (age > task.metadata.timeoutMs * 2) { // Double timeout as safety margin
        console.warn(`Cleaning up stale processing task: ${taskId}`);
        this.processingTasks.delete(taskId);
      }
    }
    
    console.debug(`Cleanup completed. Task history: ${this.taskHistory.size}, Processing: ${this.processingTasks.size}`);
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): QueueMetrics {
    this.metrics.queuedTasks = Array.from(this.queues.values()).reduce((sum, queue) => sum + queue.length, 0);
    this.metrics.processingTasks = this.processingTasks.size;
    return { ...this.metrics };
  }

  /**
   * Get agent capacity information
   */
  getAgentCapacities(): Map<string, AgentCapacity> {
    return new Map(this.agentCapacities);
  }

  /**
   * Get tasks in specific queue
   */
  getQueueStatus(priority?: string): { [priority: string]: number } {
    if (priority) {
      return { [priority]: this.queues.get(priority)?.length || 0 };
    }
    
    const status: { [priority: string]: number } = {};
    for (const [p, queue] of this.queues.entries()) {
      status[p] = queue.length;
    }
    return status;
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(): QueuedTask[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Shutdown the queue system
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down enhanced task queue...');
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Wait for processing tasks to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.processingTasks.size > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.processingTasks.size > 0) {
      console.warn(`Force shutdown with ${this.processingTasks.size} tasks still processing`);
    }
    
    console.log('Enhanced task queue shutdown complete');
  }
}

// Export singleton instance
export const taskQueue = new EnhancedTaskQueue();
export default taskQueue;