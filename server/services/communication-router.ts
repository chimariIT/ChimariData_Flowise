// server/services/communication-router.ts
import { EventEmitter } from 'events';
import { agentRegistry, AgentTask } from './agent-registry';
import { nanoid } from 'nanoid';

export interface Message {
  id: string;
  type: 'user_request' | 'agent_response' | 'agent_to_agent' | 'system_notification';
  from: {
    type: 'user' | 'agent' | 'system';
    id: string;
    name?: string;
  };
  to: {
    type: 'agent' | 'user' | 'broadcast';
    id?: string;
    agentType?: string;
    capabilities?: string[];
  };
  content: {
    text?: string;
    data?: any;
    attachments?: MessageAttachment[];
    metadata?: Record<string, any>;
  };
  intent: {
    category: string;
    confidence: number;
    requiredCapabilities: string[];
    priority: number;
    estimatedComplexity: 'low' | 'medium' | 'high';
  };
  context: {
    conversationId: string;
    sessionId: string;
    userId: string;
    projectId?: string;
    parentMessageId?: string;
    threadId?: string;
  };
  routing: {
    attempts: number;
    assignedAgentId?: string;
    routingHistory: RoutingEntry[];
    fallbackStrategy: 'queue' | 'escalate' | 'redirect';
  };
  status: 'pending' | 'routing' | 'assigned' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageAttachment {
  id: string;
  type: 'file' | 'image' | 'data' | 'link';
  name: string;
  url: string;
  size?: number;
  metadata?: Record<string, any>;
}

export interface RoutingEntry {
  timestamp: Date;
  action: 'intent_analysis' | 'agent_selection' | 'assignment' | 'escalation' | 'fallback';
  agentId?: string;
  reason: string;
  confidence?: number;
}

export interface Conversation {
  id: string;
  participants: {
    type: 'user' | 'agent';
    id: string;
    name: string;
    joinedAt: Date;
    role?: string;
  }[];
  messages: Message[];
  status: 'active' | 'waiting' | 'escalated' | 'completed' | 'abandoned';
  metadata: {
    subject?: string;
    category?: string;
    priority: number;
    tags: string[];
    department?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  conditions: {
    intent?: string[];
    keywords?: string[];
    userTier?: string[];
    complexity?: ('low' | 'medium' | 'high')[];
    timeOfDay?: { start: string; end: string };
    agentAvailability?: boolean;
  };
  actions: {
    preferredAgentTypes: string[];
    requiredCapabilities: string[];
    maxWaitTime: number;
    escalationPath: string[];
    autoResponse?: string;
  };
  enabled: boolean;
  createdAt: Date;
}

export class CommunicationRouter extends EventEmitter {
  private conversations: Map<string, Conversation> = new Map();
  private activeMessages: Map<string, Message> = new Map();
  private routingRules: RoutingRule[] = [];
  private intentClassifier: IntentClassifier;

  constructor() {
    super();
    this.intentClassifier = new IntentClassifier();
    this.initializeDefaultRoutingRules();
  }

  /**
   * Process incoming user message
   */
  async processUserMessage(
    userId: string,
    content: string,
    context: {
      conversationId?: string;
      sessionId: string;
      projectId?: string;
      attachments?: MessageAttachment[];
    }
  ): Promise<string> {
    // Create or get conversation
    let conversationId = context.conversationId;
    if (!conversationId) {
      conversationId = await this.createConversation(userId, {
        category: 'user_inquiry',
        priority: 5
      });
    }

    // Analyze intent
    const intent = await this.intentClassifier.analyzeIntent(content);

    // Create message
    const message: Message = {
      id: `msg_${nanoid()}`,
      type: 'user_request',
      from: {
        type: 'user',
        id: userId
      },
      to: {
        type: 'agent',
        capabilities: intent.requiredCapabilities
      },
      content: {
        text: content,
        attachments: context.attachments || [],
        metadata: {}
      },
      intent,
      context: {
        conversationId,
        sessionId: context.sessionId,
        userId,
        projectId: context.projectId
      },
      routing: {
        attempts: 0,
        routingHistory: [],
        fallbackStrategy: 'queue'
      },
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store message
    this.activeMessages.set(message.id, message);
    this.addMessageToConversation(conversationId, message);

    // Route message
    await this.routeMessage(message);

    console.log(`📨 User message processed: ${message.id} from ${userId}`);
    return message.id;
  }

  /**
   * Process agent-to-agent communication
   */
  async sendAgentMessage(
    fromAgentId: string,
    toAgentId: string,
    content: any,
    context: {
      conversationId: string;
      taskId?: string;
      priority?: number;
    }
  ): Promise<string> {
    const message: Message = {
      id: `msg_${nanoid()}`,
      type: 'agent_to_agent',
      from: {
        type: 'agent',
        id: fromAgentId
      },
      to: {
        type: 'agent',
        id: toAgentId
      },
      content: {
        data: content
      },
      intent: {
        category: 'agent_collaboration',
        confidence: 1.0,
        requiredCapabilities: [],
        priority: context.priority || 5,
        estimatedComplexity: 'medium'
      },
      context: {
        conversationId: context.conversationId,
        sessionId: `agent_session_${nanoid()}`,
        userId: 'system'
      },
      routing: {
        attempts: 0,
        assignedAgentId: toAgentId,
        routingHistory: [{
          timestamp: new Date(),
          action: 'assignment',
          agentId: toAgentId,
          reason: 'Direct agent-to-agent communication'
        }],
        fallbackStrategy: 'queue'
      },
      status: 'assigned',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.activeMessages.set(message.id, message);
    this.addMessageToConversation(context.conversationId, message);

    // Create task for target agent
    await this.createAgentTask(message, toAgentId);

    console.log(`🤖➡️🤖 Agent message sent: ${fromAgentId} → ${toAgentId}`);
    return message.id;
  }

  /**
   * Route message to appropriate agent
   */
  private async routeMessage(message: Message): Promise<void> {
    message.routing.attempts++;
    message.status = 'routing';
    message.updatedAt = new Date();

    try {
      // Apply routing rules
      const matchingRule = this.findMatchingRoutingRule(message);
      
      // Find best agent
      const bestAgentId = await this.findBestAgentForMessage(message, matchingRule);

      if (bestAgentId) {
        // Assign to agent
        message.routing.assignedAgentId = bestAgentId;
        message.status = 'assigned';
        message.routing.routingHistory.push({
          timestamp: new Date(),
          action: 'assignment',
          agentId: bestAgentId,
          reason: matchingRule ? `Rule: ${matchingRule.name}` : 'Best available agent',
          confidence: 0.8
        });

        // Create agent task
        await this.createAgentTask(message, bestAgentId);

        this.emit('messageRouted', { messageId: message.id, agentId: bestAgentId });

      } else {
        // No agent available - handle fallback
        await this.handleRoutingFallback(message, matchingRule);
      }

    } catch (error: any) {
      console.error(`Error routing message ${message.id}:`, error);
      message.status = 'failed';
      message.routing.routingHistory.push({
        timestamp: new Date(),
        action: 'fallback',
        reason: `Routing error: ${error.message}`
      });
      
      await this.handleRoutingFallback(message);
    }

    this.emit('messageStatusChanged', { messageId: message.id, status: message.status });
  }

  /**
   * Find matching routing rule for message
   */
  private findMatchingRoutingRule(message: Message): RoutingRule | null {
    const enabledRules = this.routingRules
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of enabledRules) {
      if (this.messageMatchesRule(message, rule)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Check if message matches routing rule conditions
   */
  private messageMatchesRule(message: Message, rule: RoutingRule): boolean {
    const { conditions } = rule;

    // Check intent
    if (conditions.intent?.length && !conditions.intent.includes(message.intent.category)) {
      return false;
    }

    // Check complexity
    if (conditions.complexity?.length && !conditions.complexity.includes(message.intent.estimatedComplexity)) {
      return false;
    }

    // Check keywords in message content
    if (conditions.keywords?.length && message.content.text) {
      const hasKeyword = conditions.keywords.some(keyword =>
        message.content.text!.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!hasKeyword) return false;
    }

    // Check time of day
    if (conditions.timeOfDay) {
      const now = new Date();
      const timeStr = now.toTimeString().substring(0, 5); // HH:MM format
      if (timeStr < conditions.timeOfDay.start || timeStr > conditions.timeOfDay.end) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find best agent for message based on capabilities and availability
   */
  private async findBestAgentForMessage(
    message: Message,
    rule?: RoutingRule | null
  ): Promise<string | null> {
    const requiredCapabilities = rule?.actions.requiredCapabilities || message.intent.requiredCapabilities;
    const preferredTypes = rule?.actions.preferredAgentTypes || [];

    // Get available agents
    const availableAgents = agentRegistry.getAgents()
      .filter(agent => {
        // Must be active
        if (agent.status !== 'active') return false;

        // Must have capacity
        if (agent.currentTasks >= agent.maxConcurrentTasks) return false;

        // Must have required capabilities
        const hasRequiredCapabilities = requiredCapabilities.every(reqCap =>
          agent.capabilities.some(cap => cap.name === reqCap)
        );
        if (!hasRequiredCapabilities) return false;

        return true;
      })
      .sort((a, b) => {
        // Prefer agents of preferred types
        const aIsPreferred = preferredTypes.includes(a.type);
        const bIsPreferred = preferredTypes.includes(b.type);
        if (aIsPreferred && !bIsPreferred) return -1;
        if (!aIsPreferred && bIsPreferred) return 1;

        // Then by priority
        const priorityDiff = b.priority - a.priority;
        if (priorityDiff !== 0) return priorityDiff;

        // Then by current load
        const loadDiff = a.currentTasks - b.currentTasks;
        if (loadDiff !== 0) return loadDiff;

        // Finally by response time
        return a.health.responseTime - b.health.responseTime;
      });

    return availableAgents.length > 0 ? availableAgents[0].id : null;
  }

  /**
   * Create agent task from message
   */
  private async createAgentTask(message: Message, agentId: string): Promise<void> {
    const task: Omit<AgentTask, 'id' | 'createdAt'> = {
      type: 'user_communication',
      priority: message.intent.priority,
      payload: {
        messageId: message.id,
        userInput: message.content.text,
        attachments: message.content.attachments,
        intent: message.intent,
        conversationId: message.context.conversationId
      },
      requiredCapabilities: message.intent.requiredCapabilities,
      context: {
        userId: message.context.userId,
        projectId: message.context.projectId,
        sessionId: message.context.sessionId
      },
      constraints: {
        maxDuration: 300, // 5 minutes default
        preferredAgents: [agentId]
      }
    };

    const taskId = await agentRegistry.submitTask(task);
    message.content.metadata = { ...message.content.metadata, taskId };
    message.status = 'processing';
  }

  /**
   * Handle routing fallback when no agent is available
   */
  private async handleRoutingFallback(message: Message, rule?: RoutingRule | null): Promise<void> {
    const maxWaitTime = rule?.actions.maxWaitTime || 300000; // 5 minutes default
    
    switch (message.routing.fallbackStrategy) {
      case 'queue':
        message.status = 'pending';
        message.routing.routingHistory.push({
          timestamp: new Date(),
          action: 'fallback',
          reason: 'Queued - no agents available'
        });
        
        // Auto-retry after wait time
        setTimeout(() => {
          if (message.status === 'pending') {
            this.routeMessage(message);
          }
        }, Math.min(maxWaitTime, 60000)); // Max 1 minute retry interval
        break;

      case 'escalate':
        await this.escalateMessage(message, rule);
        break;

      case 'redirect':
        // Send auto-response and mark as completed
        if (rule?.actions.autoResponse) {
          await this.sendAutoResponse(message, rule.actions.autoResponse);
        }
        message.status = 'completed';
        break;
    }
  }

  /**
   * Escalate message to human agent or supervisor
   */
  private async escalateMessage(message: Message, rule?: RoutingRule | null): Promise<void> {
    const escalationPath = rule?.actions.escalationPath || ['customer_support', 'supervisor'];
    
    // Try each escalation level
    for (const agentType of escalationPath) {
      const availableAgents = agentRegistry.getAgentsByType(agentType)
        .filter(agent => agent.status === 'active' && agent.currentTasks < agent.maxConcurrentTasks);

      if (availableAgents.length > 0) {
        const bestAgent = availableAgents.sort((a, b) => a.currentTasks - b.currentTasks)[0];
        
        message.routing.assignedAgentId = bestAgent.id;
        message.status = 'assigned';
        message.routing.routingHistory.push({
          timestamp: new Date(),
          action: 'escalation',
          agentId: bestAgent.id,
          reason: `Escalated to ${agentType}`
        });

        await this.createAgentTask(message, bestAgent.id);
        return;
      }
    }

    // No escalation agents available
    message.routing.fallbackStrategy = 'queue';
    await this.handleRoutingFallback(message, rule);
  }

  /**
   * Send automated response
   */
  private async sendAutoResponse(message: Message, responseText: string): Promise<void> {
    const response: Message = {
      id: `msg_${nanoid()}`,
      type: 'agent_response',
      from: {
        type: 'system',
        id: 'auto_responder',
        name: 'Automated Assistant'
      },
      to: {
        type: 'user',
        id: message.from.id
      },
      content: {
        text: responseText
      },
      intent: {
        category: 'auto_response',
        confidence: 1.0,
        requiredCapabilities: [],
        priority: 1,
        estimatedComplexity: 'low'
      },
      context: message.context,
      routing: {
        attempts: 1,
        routingHistory: [{
          timestamp: new Date(),
          action: 'assignment',
          reason: 'Automated response'
        }],
        fallbackStrategy: 'queue'
      },
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.addMessageToConversation(message.context.conversationId, response);
    this.emit('autoResponseSent', { originalMessageId: message.id, responseId: response.id });
  }

  /**
   * Create new conversation
   */
  async createConversation(
    userId: string,
    metadata: {
      subject?: string;
      category?: string;
      priority: number;
      tags?: string[];
    }
  ): Promise<string> {
    const conversationId = `conv_${nanoid()}`;
    
    const conversation: Conversation = {
      id: conversationId,
      participants: [{
        type: 'user',
        id: userId,
        name: `User ${userId}`,
        joinedAt: new Date()
      }],
      messages: [],
      status: 'active',
      metadata: {
        ...metadata,
        tags: metadata.tags || []
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.conversations.set(conversationId, conversation);
    this.emit('conversationCreated', { conversationId, userId });
    
    return conversationId;
  }

  /**
   * Add message to conversation
   */
  private addMessageToConversation(conversationId: string, message: Message): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.messages.push(message);
      conversation.updatedAt = new Date();
      
      // Add agent as participant if not already present
      if (message.from.type === 'agent' && message.routing.assignedAgentId) {
        const agentExists = conversation.participants.some(p => 
          p.type === 'agent' && p.id === message.routing.assignedAgentId
        );
        
        if (!agentExists) {
          const agent = agentRegistry.getAgent(message.routing.assignedAgentId!);
          if (agent) {
            conversation.participants.push({
              type: 'agent',
              id: agent.id,
              name: agent.name,
              joinedAt: new Date(),
              role: agent.type
            });
          }
        }
      }
    }
  }

  /**
   * Initialize default routing rules
   */
  private initializeDefaultRoutingRules(): void {
    this.routingRules = [
      {
        id: 'data_analysis_requests',
        name: 'Route data analysis requests to Data Scientists',
        priority: 8,
        conditions: {
          intent: ['data_analysis', 'statistical_analysis', 'ml_request'],
          complexity: ['medium', 'high']
        },
        actions: {
          preferredAgentTypes: ['data_scientist', 'technical_ai'],
          requiredCapabilities: ['statistical_analysis', 'data_processing'],
          maxWaitTime: 300000,
          escalationPath: ['senior_data_scientist', 'customer_support']
        },
        enabled: true,
        createdAt: new Date()
      },
      {
        id: 'simple_questions',
        name: 'Auto-respond to simple questions',
        priority: 9,
        conditions: {
          intent: ['greeting', 'simple_question', 'faq'],
          complexity: ['low']
        },
        actions: {
          preferredAgentTypes: ['customer_support'],
          requiredCapabilities: ['customer_service'],
          maxWaitTime: 60000,
          escalationPath: ['customer_support'],
          autoResponse: 'Thank you for your message. I\'ll help you with that right away!'
        },
        enabled: true,
        createdAt: new Date()
      },
      {
        id: 'data_engineering_tasks',
        name: 'Route ETL and pipeline requests to Data Engineers',
        priority: 7,
        conditions: {
          intent: ['data_transformation', 'etl_request', 'pipeline_setup'],
          keywords: ['etl', 'pipeline', 'transform', 'clean', 'process']
        },
        actions: {
          preferredAgentTypes: ['data_engineer'],
          requiredCapabilities: ['data_pipeline', 'etl_processing'],
          maxWaitTime: 600000, // 10 minutes for complex tasks
          escalationPath: ['senior_data_engineer', 'customer_support']
        },
        enabled: true,
        createdAt: new Date()
      },
      {
        id: 'business_analysis',
        name: 'Route business questions to Business Analysts',
        priority: 6,
        conditions: {
          intent: ['business_analysis', 'market_research', 'business_question'],
          keywords: ['business', 'market', 'revenue', 'roi', 'kpi']
        },
        actions: {
          preferredAgentTypes: ['business_agent'],
          requiredCapabilities: ['business_analysis', 'industry_knowledge'],
          maxWaitTime: 300000,
          escalationPath: ['senior_business_analyst', 'customer_support']
        },
        enabled: true,
        createdAt: new Date()
      }
    ];
  }

  /**
   * Add new routing rule
   */
  addRoutingRule(rule: Omit<RoutingRule, 'id' | 'createdAt'>): string {
    const ruleId = `rule_${nanoid()}`;
    const newRule: RoutingRule = {
      ...rule,
      id: ruleId,
      createdAt: new Date()
    };
    
    this.routingRules.push(newRule);
    this.routingRules.sort((a, b) => b.priority - a.priority);
    
    console.log(`📋 Routing rule added: ${newRule.name}`);
    return ruleId;
  }

  /**
   * Get all routing rules
   */
  getRoutingRules(): RoutingRule[] {
    return [...this.routingRules];
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): Conversation | null {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * Get message by ID
   */
  getMessage(messageId: string): Message | null {
    return this.activeMessages.get(messageId) || null;
  }

  /**
   * Get router statistics
   */
  getStatistics(): {
    activeConversations: number;
    activeMessages: number;
    routingRules: number;
    messagesByStatus: Record<string, number>;
  } {
    const messagesByStatus: Record<string, number> = {};
    
    for (const message of this.activeMessages.values()) {
      messagesByStatus[message.status] = (messagesByStatus[message.status] || 0) + 1;
    }

    return {
      activeConversations: this.conversations.size,
      activeMessages: this.activeMessages.size,
      routingRules: this.routingRules.length,
      messagesByStatus
    };
  }
}

/**
 * Intent classifier for understanding user messages
 */
class IntentClassifier {
  private intentPatterns: Record<string, {
    keywords: string[];
    capabilities: string[];
    complexity: 'low' | 'medium' | 'high';
    priority: number;
  }> = {
    data_analysis: {
      keywords: ['analyze', 'analysis', 'statistical', 'correlation', 'regression', 'trend'],
      capabilities: ['statistical_analysis', 'data_processing'],
      complexity: 'medium',
      priority: 7
    },
    ml_request: {
      keywords: ['machine learning', 'ml', 'predict', 'model', 'classification', 'clustering'],
      capabilities: ['machine_learning', 'model_training'],
      complexity: 'high',
      priority: 8
    },
    data_transformation: {
      keywords: ['transform', 'clean', 'process', 'etl', 'pipeline', 'normalize'],
      capabilities: ['data_pipeline', 'etl_processing'],
      complexity: 'medium',
      priority: 6
    },
    business_analysis: {
      keywords: ['business', 'revenue', 'profit', 'market', 'roi', 'kpi', 'dashboard'],
      capabilities: ['business_analysis', 'industry_knowledge'],
      complexity: 'medium',
      priority: 6
    },
    simple_question: {
      keywords: ['how', 'what', 'why', 'when', 'help', 'explain', 'tutorial'],
      capabilities: ['customer_service'],
      complexity: 'low',
      priority: 3
    },
    greeting: {
      keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon'],
      capabilities: ['customer_service'],
      complexity: 'low',
      priority: 1
    }
  };

  async analyzeIntent(text: string): Promise<{
    category: string;
    confidence: number;
    requiredCapabilities: string[];
    priority: number;
    estimatedComplexity: 'low' | 'medium' | 'high';
  }> {
    const lowerText = text.toLowerCase();
    let bestMatch: {
      category: string;
      confidence: number;
      requiredCapabilities: string[];
      priority: number;
      estimatedComplexity: 'low' | 'medium' | 'high';
    } = {
      category: 'general_inquiry',
      confidence: 0.3,
      requiredCapabilities: ['customer_service'],
      priority: 5,
      estimatedComplexity: 'medium'
    };

    for (const [category, pattern] of Object.entries(this.intentPatterns)) {
      const matchingKeywords = pattern.keywords.filter(keyword =>
        lowerText.includes(keyword.toLowerCase())
      );

      if (matchingKeywords.length > 0) {
        const confidence = Math.min(0.9, 0.4 + (matchingKeywords.length * 0.15));
        
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            category,
            confidence,
            requiredCapabilities: pattern.capabilities,
            priority: pattern.priority,
            estimatedComplexity: pattern.complexity
          };
        }
      }
    }

    return bestMatch;
  }
}

// Export singleton instance
export const communicationRouter = new CommunicationRouter();