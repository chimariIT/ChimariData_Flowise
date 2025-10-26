// server/services/project-agent-orchestrator.ts

import { ProjectManagerAgent } from './project-manager-agent';
import { TechnicalAIAgent } from './technical-ai-agent';
import { BusinessAgent } from './business-agent';
import { AgentInitializationService } from './agent-initialization';
import { RealtimeServer } from '../realtime';
import { storage } from './storage';

interface ProjectAgentContext {
  projectId: string;
  userId: string;
  journeyType: 'non_tech' | 'business' | 'technical' | 'consultation' | 'ai_guided';
  projectName: string;
  description?: string;
}

interface AgentCheckpoint {
  id: string;
  projectId: string;
  agentType: 'project_manager' | 'technical_ai' | 'business';
  stepName: string;
  status: 'pending' | 'in_progress' | 'waiting_approval' | 'approved' | 'completed' | 'rejected';
  message: string;
  data?: any;
  userFeedback?: string;
  timestamp: Date;
  requiresUserInput: boolean;
}

export class ProjectAgentOrchestrator {
  private projectManager: ProjectManagerAgent;
  private technicalAgent: TechnicalAIAgent;
  private businessAgent: BusinessAgent;
  private agentInitService: AgentInitializationService;
  private realtimeServer?: RealtimeServer;
  private activeProjects: Map<string, ProjectAgentContext> = new Map();
  private checkpoints: Map<string, AgentCheckpoint[]> = new Map();

  constructor(realtimeServer?: RealtimeServer) {
    this.projectManager = new ProjectManagerAgent();
    this.technicalAgent = new TechnicalAIAgent();
    this.businessAgent = new BusinessAgent();
    this.agentInitService = new AgentInitializationService();
    this.realtimeServer = realtimeServer;
  }

  /**
   * Initialize agents for a new project
   */
  async initializeProjectAgents(context: ProjectAgentContext): Promise<void> {
    console.log(`🤖 Initializing agents for project ${context.projectId} (${context.journeyType})`);
    
    try {
      // Store project context
      this.activeProjects.set(context.projectId, context);
      
      // Initialize checkpoints array for this project
      this.checkpoints.set(context.projectId, []);

      // Initialize agents based on journey type
      await this.agentInitService.initializeAllAgents();

      // Create initial checkpoint
      const initialCheckpoint: AgentCheckpoint = {
        id: `checkpoint_${Date.now()}_init`,
        projectId: context.projectId,
        agentType: 'project_manager',
        stepName: 'project_initialization',
        status: 'in_progress',
        message: `Welcome to your ${context.journeyType} journey! I'm analyzing your project requirements and setting up your personalized workflow.`,
        timestamp: new Date(),
        requiresUserInput: false
      };

      await this.addCheckpoint(context.projectId, initialCheckpoint);

      // Notify frontend via WebSocket
      this.notifyAgentActivity(context.userId, context.projectId, {
        type: 'agent_initialized',
        message: 'AI agents are ready to assist with your project',
        checkpoint: initialCheckpoint
      });

      // Start initial analysis based on journey type
      await this.startJourneyAnalysis(context);

    } catch (error) {
      console.error('❌ Failed to initialize project agents:', error);
      throw error;
    }
  }

  /**
   * Start journey-specific analysis
   */
  private async startJourneyAnalysis(context: ProjectAgentContext): Promise<void> {
    const analysisCheckpoint: AgentCheckpoint = {
      id: `checkpoint_${Date.now()}_analysis`,
      projectId: context.projectId,
      agentType: this.getLeadAgent(context.journeyType),
      stepName: 'initial_analysis',
      status: 'waiting_approval',
      message: this.getJourneyWelcomeMessage(context.journeyType),
      data: {
        suggestedNextSteps: this.getSuggestedNextSteps(context.journeyType),
        estimatedTimeframe: this.getEstimatedTimeframe(context.journeyType)
      },
      timestamp: new Date(),
      requiresUserInput: true
    };

    await this.addCheckpoint(context.projectId, analysisCheckpoint);

    // Notify frontend
    this.notifyAgentActivity(context.userId, context.projectId, {
      type: 'checkpoint_created',
      checkpoint: analysisCheckpoint
    });
  }

  /**
   * Handle user approval/feedback for checkpoints
   */
  async handleCheckpointFeedback(
    projectId: string, 
    checkpointId: string, 
    userFeedback: string, 
    approved: boolean
  ): Promise<void> {
    const checkpoints = this.checkpoints.get(projectId) || [];
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
    
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }

    checkpoint.userFeedback = userFeedback;
    checkpoint.status = approved ? 'approved' : 'rejected';
    
    const context = this.activeProjects.get(projectId);
    if (!context) {
      throw new Error('Project context not found');
    }

    // Notify about feedback
    this.notifyAgentActivity(context.userId, projectId, {
      type: 'checkpoint_updated',
      checkpoint
    });

    if (approved) {
      // Continue to next step
      await this.proceedToNextStep(projectId, checkpoint);
    } else {
      // Handle rejection - create revised checkpoint
      await this.handleRejection(projectId, checkpoint);
    }
  }

  /**
   * Add a new checkpoint for a project
   */
  /**
   * Add a checkpoint to a project
   * Made public to allow external services (like upload endpoint) to create checkpoints
   */
  async addCheckpoint(projectId: string, checkpoint: AgentCheckpoint): Promise<void> {
    const checkpoints = this.checkpoints.get(projectId) || [];
    checkpoints.push(checkpoint);
    this.checkpoints.set(projectId, checkpoints);

    // TODO: Store in database for persistence when checkpoint storage is implemented
    // Currently storing in memory only
    try {
      // await storage.createCheckpoint({
      //   id: checkpoint.id,
      //   projectId: checkpoint.projectId,
      //   agentType: checkpoint.agentType,
      //   stepName: checkpoint.stepName,
      //   status: checkpoint.status,
      //   message: checkpoint.message,
      //   data: checkpoint.data ? JSON.stringify(checkpoint.data) : null,
      //   userFeedback: checkpoint.userFeedback,
      //   requiresUserInput: checkpoint.requiresUserInput,
      //   timestamp: checkpoint.timestamp
      // });
      console.log(`✅ Checkpoint ${checkpoint.id} added to project ${projectId} (in-memory)`);
    } catch (error) {
      console.error('Failed to persist checkpoint:', error);
      // Continue without persistence for now
    }
  }

  /**
   * Get checkpoints for a project
   */
  async getProjectCheckpoints(projectId: string): Promise<AgentCheckpoint[]> {
    return this.checkpoints.get(projectId) || [];
  }

  /**
   * Notify frontend about agent activity
   */
  private notifyAgentActivity(userId: string, projectId: string, data: any): void {
    if (!this.realtimeServer) return;

    this.realtimeServer.broadcast({
      type: 'progress',
      sourceType: 'streaming',
      sourceId: `agents_${projectId}`,
      userId,
      projectId,
      timestamp: new Date(),
      data: {
        ...data,
        source: 'agent_orchestrator'
      }
    });
  }

  /**
   * Get the lead agent for a journey type
   */
  private getLeadAgent(journeyType: string): 'project_manager' | 'technical_ai' | 'business' {
    switch (journeyType) {
      case 'technical':
        return 'technical_ai';
      case 'business':
      case 'non_tech':
        return 'business';
      default:
        return 'project_manager';
    }
  }

  /**
   * Get journey-specific welcome message
   */
  private getJourneyWelcomeMessage(journeyType: string): string {
    const messages = {
      'non_tech': 'I\'ll guide you through a simplified analysis focused on actionable insights without technical complexity.',
      'business': 'I\'ll help you create professional business intelligence reports and strategic recommendations.',
      'technical': 'I\'ll assist with detailed statistical analysis, code generation, and technical documentation.',
      'consultation': 'I\'ll provide expert-guided analysis with personalized methodology and peer review.',
      'custom': 'I\'ll execute your custom-selected capabilities to deliver exactly the analysis you need.',
      'ai_guided': 'I\'ll adapt the approach based on your needs and provide personalized guidance throughout the process.'
    };
    return messages[journeyType as keyof typeof messages] || messages['ai_guided'];
  }

  /**
   * Get suggested next steps for journey type
   */
  private getSuggestedNextSteps(journeyType: string): string[] {
    const steps = {
      'non_tech': [
        'Upload your data file',
        'Review data overview and insights',
        'Generate executive summary',
        'Create visual dashboard'
      ],
      'business': [
        'Upload and validate data',
        'Define business objectives',
        'Generate industry benchmarks',
        'Create presentation-ready reports'
      ],
      'technical': [
        'Data upload and schema validation',
        'Statistical analysis configuration',
        'Model development and testing',
        'Technical documentation generation'
      ],
      'consultation': [
        'Expert consultation planning',
        'Custom methodology design',
        'Collaborative analysis execution',
        'Peer review and validation'
      ],
      'ai_guided': [
        'Upload your data',
        'AI-powered analysis recommendations',
        'Interactive insights exploration',
        'Customized deliverables'
      ]
    };
    return steps[journeyType as keyof typeof steps] || steps['ai_guided'];
  }

  /**
   * Get estimated timeframe for journey type
   */
  private getEstimatedTimeframe(journeyType: string): string {
    const timeframes = {
      'non_tech': '15-30 minutes',
      'business': '30-60 minutes',
      'technical': '1-3 hours',
      'consultation': '2-5 hours',
      'ai_guided': '20-45 minutes'
    };
    return timeframes[journeyType as keyof typeof timeframes] || timeframes['ai_guided'];
  }

  /**
   * Proceed to next step after approval
   */
  private async proceedToNextStep(projectId: string, approvedCheckpoint: AgentCheckpoint): Promise<void> {
    // This would implement the logic to move to the next step in the workflow
    // For now, we'll create a simple continuation checkpoint
    const nextCheckpoint: AgentCheckpoint = {
      id: `checkpoint_${Date.now()}_next`,
      projectId,
      agentType: approvedCheckpoint.agentType,
      stepName: 'data_upload_ready',
      status: 'pending',
      message: 'Great! I\'m ready to analyze your data. Please upload your file when you\'re ready.',
      timestamp: new Date(),
      requiresUserInput: false
    };

    await this.addCheckpoint(projectId, nextCheckpoint);

    const context = this.activeProjects.get(projectId);
    if (context) {
      this.notifyAgentActivity(context.userId, projectId, {
        type: 'checkpoint_created',
        checkpoint: nextCheckpoint
      });
    }
  }

  /**
   * Handle checkpoint rejection
   */
  private async handleRejection(projectId: string, rejectedCheckpoint: AgentCheckpoint): Promise<void> {
    const revisedCheckpoint: AgentCheckpoint = {
      id: `checkpoint_${Date.now()}_revised`,
      projectId,
      agentType: rejectedCheckpoint.agentType,
      stepName: `${rejectedCheckpoint.stepName}_revised`,
      status: 'waiting_approval',
      message: `I understand your feedback: "${rejectedCheckpoint.userFeedback}". Let me revise my approach to better meet your needs.`,
      timestamp: new Date(),
      requiresUserInput: true
    };

    await this.addCheckpoint(projectId, revisedCheckpoint);

    const context = this.activeProjects.get(projectId);
    if (context) {
      this.notifyAgentActivity(context.userId, projectId, {
        type: 'checkpoint_created',
        checkpoint: revisedCheckpoint
      });
    }
  }

  /**
   * Clean up project agents when project is completed or removed
   */
  async cleanupProjectAgents(projectId: string): Promise<void> {
    this.activeProjects.delete(projectId);
    this.checkpoints.delete(projectId);
    console.log(`🧹 Cleaned up agents for project ${projectId}`);
  }
}

// Export singleton instance with getter/setter for realtime server
class ProjectAgentOrchestratorSingleton {
  private instance: ProjectAgentOrchestrator;
  private _realtimeServer?: RealtimeServer;

  constructor() {
    this.instance = new ProjectAgentOrchestrator();
  }

  set realtimeServer(server: RealtimeServer) {
    this._realtimeServer = server;
    (this.instance as any).realtimeServer = server;
  }

  get realtimeServer(): RealtimeServer | undefined {
    return this._realtimeServer;
  }

  // Proxy all methods to the instance
  async initializeProjectAgents(context: ProjectAgentContext): Promise<void> {
    return this.instance.initializeProjectAgents(context);
  }

  async handleCheckpointFeedback(projectId: string, checkpointId: string, userFeedback: string, approved: boolean): Promise<void> {
    return this.instance.handleCheckpointFeedback(projectId, checkpointId, userFeedback, approved);
  }

  async getProjectCheckpoints(projectId: string): Promise<AgentCheckpoint[]> {
    return this.instance.getProjectCheckpoints(projectId);
  }

  async addCheckpoint(projectId: string, checkpoint: AgentCheckpoint): Promise<void> {
    return this.instance.addCheckpoint(projectId, checkpoint);
  }

  async cleanupProjectAgents(projectId: string): Promise<void> {
    return this.instance.cleanupProjectAgents(projectId);
  }
}

export const projectAgentOrchestrator = new ProjectAgentOrchestratorSingleton();