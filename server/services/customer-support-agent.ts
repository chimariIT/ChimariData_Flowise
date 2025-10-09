// server/services/customer-support-agent.ts
import { AgentHandler, AgentTask, AgentResult, AgentStatus, AgentCapability } from './agent-registry';
import { nanoid } from 'nanoid';

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  tags: string[];
  assignedAgent: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
  customerSatisfaction?: number;
  conversationHistory: SupportMessage[];
  attachments: SupportAttachment[];
  escalationHistory: EscalationRecord[];
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  sender: 'user' | 'agent' | 'system';
  senderName: string;
  message: string;
  messageType: 'text' | 'template' | 'suggestion' | 'escalation';
  timestamp: Date;
  isInternal: boolean;
  metadata?: Record<string, any>;
}

export interface SupportAttachment {
  id: string;
  ticketId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: Date;
  storageLocation: string;
}

export interface EscalationRecord {
  id: string;
  ticketId: string;
  fromAgent: string;
  toAgent: string;
  reason: string;
  escalatedAt: Date;
  context: Record<string, any>;
}

export type TicketCategory = 
  | 'billing_subscription'
  | 'technical_support'
  | 'data_analysis'
  | 'account_management'
  | 'feature_request'
  | 'bug_report'
  | 'integration_help'
  | 'training_onboarding'
  | 'general_inquiry';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent' | 'critical';
export type TicketStatus = 'new' | 'open' | 'pending' | 'escalated' | 'resolved' | 'closed';

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  popularity: number;
  lastUpdated: Date;
  helpfulCount: number;
  searchKeywords: string[];
}

export interface UserContext {
  userId: string;
  email: string;
  subscriptionTier: string;
  accountCreatedAt: Date;
  lastLoginAt: Date;
  projectCount: number;
  dataUsageGB: number;
  billingStatus: string;
  previousTickets: number;
  preferredLanguage: string;
  timezone: string;
}

export interface AutomatedResponse {
  trigger: string;
  conditions: Record<string, any>;
  response: string;
  followUpActions: string[];
  escalationRules: string[];
}

export class CustomerSupportAgent implements AgentHandler {
  private tickets: Map<string, SupportTicket> = new Map();
  private knowledgeBase: Map<string, KnowledgeBaseArticle> = new Map();
  private automatedResponses: AutomatedResponse[] = [];
  private currentTasks = 0;
  private readonly maxConcurrentTasks = 10;

  constructor() {
    this.initializeKnowledgeBase();
    this.initializeAutomatedResponses();
    console.log('🎧 Customer Support Agent initialized');
  }

  static getCapabilities(): AgentCapability[] {
    return [
      {
        name: 'ticket_management',
        description: 'Create, update, and manage customer support tickets',
        inputTypes: ['text', 'email', 'chat'],
        outputTypes: ['ticket', 'response', 'escalation'],
        complexity: 'low',
        estimatedDuration: 60,
        requiredResources: ['compute'],
        tags: ['support', 'tickets', 'customer_service']
      },
      {
        name: 'query_resolution',
        description: 'Resolve customer queries using knowledge base and AI',
        inputTypes: ['text', 'voice'],
        outputTypes: ['response', 'solution', 'documentation'],
        complexity: 'medium',
        estimatedDuration: 180,
        requiredResources: ['compute', 'knowledge_base'],
        tags: ['resolution', 'knowledge_base', 'ai_assistance']
      },
      {
        name: 'billing_support',
        description: 'Handle billing inquiries and subscription management',
        inputTypes: ['billing_query', 'subscription_request'],
        outputTypes: ['billing_response', 'subscription_update'],
        complexity: 'medium',
        estimatedDuration: 300,
        requiredResources: ['compute', 'billing_system'],
        tags: ['billing', 'subscription', 'payments']
      },
      {
        name: 'technical_guidance',
        description: 'Provide technical guidance and troubleshooting',
        inputTypes: ['technical_issue', 'error_report'],
        outputTypes: ['solution', 'escalation', 'documentation'],
        complexity: 'high',
        estimatedDuration: 600,
        requiredResources: ['compute', 'technical_knowledge'],
        tags: ['technical', 'troubleshooting', 'guidance']
      },
      {
        name: 'escalation_management',
        description: 'Manage ticket escalations to specialized agents',
        inputTypes: ['complex_issue', 'escalation_request'],
        outputTypes: ['escalation', 'specialist_assignment'],
        complexity: 'medium',
        estimatedDuration: 120,
        requiredResources: ['compute'],
        tags: ['escalation', 'routing', 'specialist']
      },
      {
        name: 'user_onboarding',
        description: 'Guide new users through platform onboarding',
        inputTypes: ['onboarding_request', 'feature_questions'],
        outputTypes: ['guidance', 'tutorial', 'training_material'],
        complexity: 'low',
        estimatedDuration: 900,
        requiredResources: ['compute', 'training_content'],
        tags: ['onboarding', 'training', 'education']
      }
    ];
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.currentTasks++;

    try {
      console.log(`🎧 Customer Support processing task: ${task.type}`);

      switch (task.type) {
        case 'support_inquiry':
          return await this.handleSupportInquiry(task);
        
        case 'ticket_creation':
          return await this.handleTicketCreation(task);
        
        case 'ticket_update':
          return await this.handleTicketUpdate(task);
        
        case 'billing_inquiry':
          return await this.handleBillingInquiry(task);
        
        case 'technical_support':
          return await this.handleTechnicalSupport(task);
        
        case 'escalation_request':
          return await this.handleEscalation(task);
        
        case 'user_communication':
          return await this.handleUserCommunication(task);
        
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

    } catch (error: any) {
      console.error(`Customer Support task ${task.id} failed:`, error);
      
      return {
        taskId: task.id,
        agentId: 'customer_support',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };
    } finally {
      this.currentTasks--;
    }
  }

  private async handleSupportInquiry(task: AgentTask): Promise<AgentResult> {
    const { userQuery, userContext, urgency } = task.payload;
    
    // Analyze query to determine category and appropriate response
    const queryAnalysis = await this.analyzeQuery(userQuery);
    const knowledgeBaseResults = await this.searchKnowledgeBase(userQuery);
    
    let response = '';
    let nextActions: AgentTask[] = [];
    let requiresTicket = false;

    if (knowledgeBaseResults.length > 0 && queryAnalysis.confidence > 0.8) {
      // Can be resolved with knowledge base
      response = await this.generateKnowledgeBaseResponse(knowledgeBaseResults, userQuery);
    } else if (queryAnalysis.category === 'billing_subscription') {
      // Billing related - needs specialized handling
      response = `I'll help you with your billing inquiry. Let me check your account details and connect you with our billing specialist.`;
      
      nextActions.push({
        id: `task_${nanoid()}`,
        type: 'billing_specialist_escalation',
        priority: urgency === 'urgent' ? 1 : 3,
        payload: {
          originalQuery: userQuery,
          userContext,
          billingCategory: queryAnalysis.subcategory
        },
        requiredCapabilities: ['billing_management', 'subscription_management'],
        context: task.context,
        constraints: task.constraints,
        createdAt: new Date()
      });
      requiresTicket = true;
      
    } else if (queryAnalysis.complexity === 'high') {
      // Complex technical issue - create ticket and escalate
      response = `This appears to be a complex technical issue. I'm creating a support ticket and connecting you with our technical team for specialized assistance.`;
      requiresTicket = true;
      
      nextActions.push({
        id: `task_${nanoid()}`,
        type: 'technical_escalation',
        priority: urgency === 'urgent' ? 1 : 2,
        payload: {
          originalQuery: userQuery,
          userContext,
          technicalCategory: queryAnalysis.subcategory
        },
        requiredCapabilities: ['technical_support', 'troubleshooting'],
        context: task.context,
        constraints: task.constraints,
        createdAt: new Date()
      });
      
    } else {
      // Standard support response
      response = await this.generateStandardResponse(queryAnalysis, userQuery);
    }

    // Create ticket if needed
    let ticketId = null;
    if (requiresTicket) {
      ticketId = await this.createTicket({
        userId: userContext.userId,
        userEmail: userContext.email,
        subject: this.extractSubject(userQuery),
        description: userQuery,
        category: queryAnalysis.category as TicketCategory,
        priority: this.urgencyToPriority(urgency),
        tags: queryAnalysis.tags
      });
    }

    return {
      taskId: task.id,
      agentId: 'customer_support',
      status: 'success',
      result: {
        response,
        responseType: 'text',
        ticketId,
        category: queryAnalysis.category,
        confidence: queryAnalysis.confidence,
        suggestions: await this.generateSuggestions(queryAnalysis),
        estimatedResolutionTime: this.estimateResolutionTime(queryAnalysis)
      },
      metrics: {
        duration: Date.now() - Date.now() + 3000,
        resourcesUsed: ['compute', 'knowledge_base'],
        tokensConsumed: 0
      },
      nextActions,
      artifacts: ticketId ? [{
        type: 'support_ticket',
        data: { ticketId },
        metadata: { category: queryAnalysis.category, priority: this.urgencyToPriority(urgency) }
      }] : undefined,
      completedAt: new Date()
    };
  }

  private async handleTicketCreation(task: AgentTask): Promise<AgentResult> {
    const ticketData = task.payload;
    const ticketId = await this.createTicket(ticketData);
    const ticket = this.tickets.get(ticketId)!;

    return {
      taskId: task.id,
      agentId: 'customer_support',
      status: 'success',
      result: {
        ticketId,
        ticket,
        confirmationMessage: `Support ticket #${ticketId} has been created. We'll respond within ${this.getResponseTime(ticket.priority)}.`
      },
      metrics: {
        duration: 2000,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'support_ticket',
        data: ticket,
        metadata: { ticketId, status: 'created' }
      }],
      completedAt: new Date()
    };
  }

  private async handleTicketUpdate(task: AgentTask): Promise<AgentResult> {
    const { ticketId, updates, message } = task.payload;
    const ticket = this.tickets.get(ticketId);

    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    // Update ticket
    Object.assign(ticket, updates, { updatedAt: new Date() });

    // Add message to conversation history
    if (message) {
      ticket.conversationHistory.push({
        id: `msg_${nanoid()}`,
        ticketId,
        sender: 'agent',
        senderName: 'Customer Support',
        message,
        messageType: 'text',
        timestamp: new Date(),
        isInternal: false
      });
    }

    return {
      taskId: task.id,
      agentId: 'customer_support',
      status: 'success',
      result: {
        ticketId,
        updatedTicket: ticket,
        updateConfirmation: `Ticket #${ticketId} has been updated successfully.`
      },
      metrics: {
        duration: 1000,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      completedAt: new Date()
    };
  }

  private async handleBillingInquiry(task: AgentTask): Promise<AgentResult> {
    const { billingQuery, userContext } = task.payload;
    
    // Simulate billing query processing
    let response = '';
    let nextActions: AgentTask[] = [];

    if (billingQuery.includes('subscription') || billingQuery.includes('plan')) {
      response = `I can help you with your subscription! Your current plan is ${userContext.subscriptionTier}. 

Here's what I can assist with:
• Plan upgrades or downgrades
• Billing cycle information
• Usage limits and overage charges
• Payment method updates
• Invoice and receipt requests

What specific subscription question can I help you with?`;

    } else if (billingQuery.includes('invoice') || billingQuery.includes('receipt')) {
      response = `I'll help you access your billing documents. Let me retrieve your recent invoices and receipts.

Your account shows:
• Current billing period: ${this.getCurrentBillingPeriod()}
• Next billing date: ${this.getNextBillingDate()}
• Payment method: **** ending in 1234

Would you like me to email your recent invoices, or do you need a specific document?`;

    } else if (billingQuery.includes('payment') || billingQuery.includes('charge')) {
      response = `I understand you have a question about charges on your account. Let me review your recent billing activity:

Recent charges:
• Monthly subscription: $${this.getSubscriptionAmount(userContext.subscriptionTier)}
• Data processing: $${this.getDataProcessingCharges()}
• Additional features: $${this.getAdditionalFeatureCharges()}

Is there a specific charge you'd like me to explain in detail?`;

    } else {
      response = `I'm here to help with any billing questions! I can assist with:

💳 **Payment & Billing**
• Payment method updates
• Invoice and receipt access
• Billing cycle questions
• Charge explanations

📊 **Subscription Management**
• Plan comparisons and upgrades
• Usage monitoring and limits
• Feature access questions

🔧 **Account Settings**
• Billing preferences
• Auto-renewal settings
• Contact information updates

What can I help you with today?`;
    }

    return {
      taskId: task.id,
      agentId: 'customer_support',
      status: 'success',
      result: {
        response,
        responseType: 'text',
        billingCategory: 'subscription_management',
        suggestions: [
          'View current plan details',
          'Download recent invoices',
          'Update payment method',
          'Speak with billing specialist'
        ]
      },
      metrics: {
        duration: 2500,
        resourcesUsed: ['compute', 'billing_system'],
        tokensConsumed: 0
      },
      nextActions,
      completedAt: new Date()
    };
  }

  private async handleTechnicalSupport(task: AgentTask): Promise<AgentResult> {
    const { technicalIssue, errorDetails, userContext } = task.payload;
    
    // Analyze technical issue
    const troubleshootingSteps = await this.generateTroubleshootingSteps(technicalIssue);
    const escalationNeeded = this.assessEscalationNeed(technicalIssue, errorDetails);

    let response = `I'll help you resolve this technical issue. Based on your description, here are some initial troubleshooting steps:

${troubleshootingSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

`;

    if (escalationNeeded) {
      response += `If these steps don't resolve the issue, I'll escalate this to our technical specialists who can provide more advanced assistance.`;
    } else {
      response += `Please try these steps and let me know if the issue persists. I'm here to help guide you through the process!`;
    }

    let nextActions: AgentTask[] = [];
    if (escalationNeeded) {
      nextActions.push({
        id: `task_${nanoid()}`,
        type: 'technical_escalation',
        priority: 2,
        payload: {
          originalIssue: technicalIssue,
          errorDetails,
          userContext,
          troubleshootingAttempted: troubleshootingSteps
        },
        requiredCapabilities: ['advanced_technical_support', 'system_debugging'],
        context: task.context,
        constraints: task.constraints,
        createdAt: new Date()
      });
    }

    return {
      taskId: task.id,
      agentId: 'customer_support',
      status: 'success',
      result: {
        response,
        responseType: 'troubleshooting_guide',
        troubleshootingSteps,
        escalationNeeded,
        estimatedResolutionTime: escalationNeeded ? '2-4 hours' : '30 minutes',
        suggestions: [
          'Follow troubleshooting steps',
          'Provide error screenshots',
          'Check system requirements',
          'Contact technical specialist'
        ]
      },
      metrics: {
        duration: 4000,
        resourcesUsed: ['compute', 'technical_knowledge'],
        tokensConsumed: 0
      },
      nextActions,
      completedAt: new Date()
    };
  }

  private async handleEscalation(task: AgentTask): Promise<AgentResult> {
    const { ticketId, escalationReason, targetAgent, urgency } = task.payload;
    const ticket = this.tickets.get(ticketId);

    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    // Create escalation record
    const escalation: EscalationRecord = {
      id: `esc_${nanoid()}`,
      ticketId,
      fromAgent: 'customer_support',
      toAgent: targetAgent,
      reason: escalationReason,
      escalatedAt: new Date(),
      context: {
        originalPriority: ticket.priority,
        conversationLength: ticket.conversationHistory.length,
        userContext: task.context
      }
    };

    ticket.escalationHistory.push(escalation);
    ticket.status = 'escalated';
    ticket.priority = urgency ? this.urgencyToPriority(urgency) : ticket.priority;
    ticket.updatedAt = new Date();

    return {
      taskId: task.id,
      agentId: 'customer_support',
      status: 'success',
      result: {
        escalationId: escalation.id,
        ticketId,
        targetAgent,
        estimatedResponse: this.getEscalationResponseTime(targetAgent),
        escalationMessage: `Your ticket has been escalated to our ${targetAgent} team for specialized assistance. They will respond within ${this.getEscalationResponseTime(targetAgent)}.`
      },
      metrics: {
        duration: 3000,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'escalation_record',
        data: escalation,
        metadata: { ticketId, targetAgent }
      }],
      completedAt: new Date()
    };
  }

  private async handleUserCommunication(task: AgentTask): Promise<AgentResult> {
    const { userInput, intent } = task.payload;
    
    let response = '';
    let nextActions: AgentTask[] = [];

    if (intent.category === 'greeting') {
      response = `Hello! 👋 I'm your Customer Support agent, here to help you with any questions or issues you might have.

I can assist you with:

🎫 **Support & Troubleshooting**
• Technical issues and error resolution
• Feature guidance and tutorials
• Account access problems

💳 **Billing & Subscriptions**
• Plan information and upgrades
• Invoice and payment questions
• Usage and billing explanations

📊 **Platform Guidance**
• Getting started with ChimariData
• Feature walkthroughs and training
• Best practices and tips

How can I help you today?`;

    } else if (intent.category === 'technical_issue') {
      response = `I understand you're experiencing a technical issue. I'm here to help resolve it quickly!

To provide the best assistance, could you please share:
• A description of what you were trying to do
• Any error messages you're seeing
• When the issue started occurring
• Your browser and operating system

I have access to our complete troubleshooting knowledge base and can escalate to technical specialists if needed.`;

    } else if (intent.category === 'billing') {
      response = `I'd be happy to help with your billing question! I can access your account information and assist with:

• Current subscription and billing details
• Payment method and invoice questions
• Plan upgrades, downgrades, or changes
• Usage monitoring and charge explanations
• Billing preferences and settings

What specific billing question can I help you with?`;

    } else {
      response = `I'm here to provide excellent customer support! Whether you need:

🔧 Technical help and troubleshooting
💰 Billing and subscription assistance  
📚 Platform guidance and training
🎯 Feature questions and best practices

Just let me know what you need help with, and I'll provide personalized assistance. I can also create support tickets, escalate to specialists, and follow up to ensure your issue is fully resolved.

What can I help you with today?`;
    }

    return {
      taskId: task.id,
      agentId: 'customer_support',
      status: 'success',
      result: {
        response,
        responseType: 'text',
        suggestions: [
          'Report a technical issue',
          'Billing question',
          'Getting started guide',
          'Account settings help'
        ]
      },
      metrics: {
        duration: 2000,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      nextActions,
      completedAt: new Date()
    };
  }

  // Helper methods
  private async analyzeQuery(query: string): Promise<any> {
    // Simulate query analysis
    const keywords = query.toLowerCase();
    
    let category = 'general_inquiry';
    let subcategory = '';
    let confidence = 0.5;
    let complexity = 'medium';
    let tags: string[] = [];

    if (keywords.includes('billing') || keywords.includes('payment') || keywords.includes('subscription')) {
      category = 'billing_subscription';
      confidence = 0.9;
      tags.push('billing');
    } else if (keywords.includes('error') || keywords.includes('bug') || keywords.includes('not working')) {
      category = 'technical_support';
      complexity = 'high';
      confidence = 0.8;
      tags.push('technical', 'error');
    } else if (keywords.includes('how to') || keywords.includes('tutorial') || keywords.includes('learn')) {
      category = 'training_onboarding';
      complexity = 'low';
      confidence = 0.7;
      tags.push('training', 'guidance');
    }

    return { category, subcategory, confidence, complexity, tags };
  }

  private async searchKnowledgeBase(query: string): Promise<KnowledgeBaseArticle[]> {
    const keywords = query.toLowerCase().split(' ');
    const results: KnowledgeBaseArticle[] = [];

    for (const article of this.knowledgeBase.values()) {
      let score = 0;
      for (const keyword of keywords) {
        if (article.searchKeywords.some(k => k.includes(keyword))) {
          score += 1;
        }
      }
      if (score > 0) {
        results.push(article);
      }
    }

    return results.sort((a, b) => b.popularity - a.popularity).slice(0, 3);
  }

  private async generateKnowledgeBaseResponse(articles: KnowledgeBaseArticle[], query: string): Promise<string> {
    const topArticle = articles[0];
    return `Based on your question, here's what I found in our knowledge base:

**${topArticle.title}**

${topArticle.content.substring(0, 300)}...

This should help with your query about "${query}". Would you like me to provide more detailed information or help you with anything else?`;
  }

  private async generateStandardResponse(analysis: any, query: string): Promise<string> {
    switch (analysis.category) {
      case 'general_inquiry':
        return `Thank you for your inquiry! I'm here to help with any questions about ChimariData. Could you provide a bit more detail about what you'd like to know?`;
      
      case 'feature_request':
        return `That's a great feature suggestion! I'll make sure our product team sees this. In the meantime, let me check if there's a current workaround or similar feature available.`;
      
      case 'account_management':
        return `I can help you with your account settings. What specific account changes or information do you need assistance with?`;
      
      default:
        return `I understand your question and I'm here to help! Let me provide you with the best assistance possible.`;
    }
  }

  private async generateSuggestions(analysis: any): Promise<string[]> {
    const baseSuggestions = [
      'Check our knowledge base',
      'Contact specialized support',
      'Schedule a consultation',
      'Provide more details'
    ];

    if (analysis.category === 'billing_subscription') {
      return [
        'View billing details',
        'Update payment method',
        'Change subscription plan',
        'Download invoices'
      ];
    }

    if (analysis.category === 'technical_support') {
      return [
        'Try troubleshooting steps',
        'Provide error screenshots',
        'Check system requirements',
        'Escalate to technical team'
      ];
    }

    return baseSuggestions;
  }

  private async generateTroubleshootingSteps(issue: string): Promise<string[]> {
    // Simulate generating troubleshooting steps based on issue type
    const commonSteps = [
      'Refresh your browser and try again',
      'Clear your browser cache and cookies',
      'Try using an incognito/private browser window',
      'Check that JavaScript is enabled in your browser',
      'Ensure you have a stable internet connection'
    ];

    if (issue.includes('login') || issue.includes('authentication')) {
      return [
        'Verify your email address and password are correct',
        'Try resetting your password using the "Forgot Password" link',
        'Clear your browser cookies for ChimariData',
        'Disable browser extensions temporarily',
        'Try logging in from a different browser or device'
      ];
    }

    if (issue.includes('upload') || issue.includes('file')) {
      return [
        'Ensure your file is in a supported format (CSV, JSON, Excel)',
        'Check that your file size is under the limit for your plan',
        'Try uploading a smaller test file first',
        'Verify your internet connection is stable',
        'Clear your browser cache and try again'
      ];
    }

    return commonSteps;
  }

  private assessEscalationNeed(issue: string, errorDetails: any): boolean {
    // Simulate escalation assessment
    const highPriorityKeywords = ['urgent', 'critical', 'production', 'data loss', 'security'];
    const complexKeywords = ['api', 'integration', 'database', 'server error', '500'];
    
    const issueText = issue.toLowerCase();
    
    return highPriorityKeywords.some(keyword => issueText.includes(keyword)) ||
           complexKeywords.some(keyword => issueText.includes(keyword)) ||
           (errorDetails && errorDetails.statusCode >= 500);
  }

  private async createTicket(ticketData: any): Promise<string> {
    const ticketId = `ticket_${nanoid()}`;
    
    const ticket: SupportTicket = {
      id: ticketId,
      userId: ticketData.userId,
      userEmail: ticketData.userEmail,
      subject: ticketData.subject,
      description: ticketData.description,
      category: ticketData.category,
      priority: ticketData.priority,
      status: 'new',
      tags: ticketData.tags || [],
      assignedAgent: 'customer_support',
      createdAt: new Date(),
      updatedAt: new Date(),
      conversationHistory: [],
      attachments: [],
      escalationHistory: []
    };

    this.tickets.set(ticketId, ticket);
    return ticketId;
  }

  private extractSubject(description: string): string {
    // Extract a meaningful subject from the description
    const words = description.split(' ').slice(0, 8);
    return words.join(' ') + (description.split(' ').length > 8 ? '...' : '');
  }

  private urgencyToPriority(urgency: string): TicketPriority {
    switch (urgency) {
      case 'critical': return 'critical';
      case 'urgent': return 'urgent';
      case 'high': return 'high';
      case 'normal': return 'normal';
      default: return 'low';
    }
  }

  private estimateResolutionTime(analysis: any): string {
    switch (analysis.complexity) {
      case 'low': return '15-30 minutes';
      case 'medium': return '1-2 hours';
      case 'high': return '4-8 hours';
      default: return '2-4 hours';
    }
  }

  private getResponseTime(priority: TicketPriority): string {
    switch (priority) {
      case 'critical': return '15 minutes';
      case 'urgent': return '1 hour';
      case 'high': return '4 hours';
      case 'normal': return '24 hours';
      default: return '48 hours';
    }
  }

  private getEscalationResponseTime(targetAgent: string): string {
    switch (targetAgent) {
      case 'technical_specialist': return '2-4 hours';
      case 'billing_specialist': return '1-2 hours';
      case 'data_scientist': return '4-6 hours';
      default: return '2-4 hours';
    }
  }

  private getCurrentBillingPeriod(): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  private getNextBillingDate(): string {
    const next = new Date();
    next.setMonth(next.getMonth() + 1, 1);
    return next.toLocaleDateString();
  }

  private getSubscriptionAmount(tier: string): string {
    switch (tier) {
      case 'trial': return '0.00';
      case 'starter': return '29.00';
      case 'professional': return '99.00';
      case 'enterprise': return '299.00';
      default: return '0.00';
    }
  }

  private getDataProcessingCharges(): string {
    return (Math.random() * 50).toFixed(2);
  }

  private getAdditionalFeatureCharges(): string {
    return (Math.random() * 25).toFixed(2);
  }

  private initializeKnowledgeBase(): void {
    // Initialize with sample knowledge base articles
    const articles: KnowledgeBaseArticle[] = [
      {
        id: 'kb_001',
        title: 'Getting Started with ChimariData',
        content: 'Welcome to ChimariData! This guide will help you get started with your first data analysis project...',
        category: 'onboarding',
        tags: ['getting_started', 'tutorial', 'basics'],
        popularity: 95,
        lastUpdated: new Date(),
        helpfulCount: 234,
        searchKeywords: ['getting started', 'tutorial', 'onboarding', 'first project', 'basics']
      },
      {
        id: 'kb_002',
        title: 'Understanding Your Subscription Plan',
        content: 'ChimariData offers several subscription tiers to meet your data analysis needs...',
        category: 'billing',
        tags: ['subscription', 'billing', 'plans'],
        popularity: 78,
        lastUpdated: new Date(),
        helpfulCount: 189,
        searchKeywords: ['subscription', 'plan', 'billing', 'pricing', 'upgrade', 'downgrade']
      },
      {
        id: 'kb_003',
        title: 'Troubleshooting File Upload Issues',
        content: 'If you\'re having trouble uploading files, here are common solutions...',
        category: 'technical',
        tags: ['upload', 'files', 'troubleshooting'],
        popularity: 67,
        lastUpdated: new Date(),
        helpfulCount: 156,
        searchKeywords: ['upload', 'file', 'error', 'troubleshooting', 'csv', 'json']
      }
    ];

    articles.forEach(article => {
      this.knowledgeBase.set(article.id, article);
    });
  }

  private initializeAutomatedResponses(): void {
    this.automatedResponses = [
      {
        trigger: 'password_reset',
        conditions: { category: 'account_management', keywords: ['password', 'reset', 'forgot'] },
        response: 'I can help you reset your password. Please check your email for a password reset link, or I can send a new one.',
        followUpActions: ['send_password_reset_email'],
        escalationRules: ['if_multiple_attempts']
      },
      {
        trigger: 'billing_inquiry',
        conditions: { category: 'billing_subscription', urgency: 'normal' },
        response: 'I can help you with billing questions. Let me access your account information.',
        followUpActions: ['retrieve_billing_info'],
        escalationRules: ['if_payment_dispute']
      }
    ];
  }

  validateTask(task: AgentTask): boolean {
    const supportedTypes = [
      'support_inquiry',
      'ticket_creation',
      'ticket_update',
      'billing_inquiry',
      'technical_support',
      'escalation_request',
      'user_communication'
    ];
    
    return supportedTypes.includes(task.type);
  }

  async getStatus(): Promise<AgentStatus> {
    return {
      status: this.currentTasks >= this.maxConcurrentTasks ? 'busy' : 'active',
      currentTasks: this.currentTasks,
      queuedTasks: 0,
      lastActivity: new Date(),
      resourceUsage: {
        cpu: (this.currentTasks / this.maxConcurrentTasks) * 100,
        memory: 25.6,
        storage: 8.4
      }
    };
  }

  async configure(config: Record<string, any>): Promise<void> {
    console.log('🎧 Customer Support Agent configured:', config);
  }

  async shutdown(): Promise<void> {
    console.log('🎧 Customer Support Agent shutting down...');
    this.tickets.clear();
    this.knowledgeBase.clear();
  }

  // Public methods for ticket management
  getTicket(ticketId: string): SupportTicket | null {
    return this.tickets.get(ticketId) || null;
  }

  getAllTickets(): SupportTicket[] {
    return Array.from(this.tickets.values());
  }

  getTicketsByUser(userId: string): SupportTicket[] {
    return Array.from(this.tickets.values()).filter(ticket => ticket.userId === userId);
  }

  getKnowledgeBaseArticle(articleId: string): KnowledgeBaseArticle | null {
    return this.knowledgeBase.get(articleId) || null;
  }

  searchKnowledgeBasePublic(query: string): Promise<KnowledgeBaseArticle[]> {
    return this.searchKnowledgeBase(query);
  }
}