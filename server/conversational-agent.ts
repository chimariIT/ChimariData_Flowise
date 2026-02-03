import { nanoid } from 'nanoid';
import { db } from './db';
import { users, conversationStates, audienceProfiles, artifactTemplates, dataArtifacts } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { multiAIService } from './multi-ai-service';
import { realtimeServer } from './realtime';
import type { ConversationState, AudienceProfile, ArtifactTemplate, DataArtifact } from '@shared/schema';

interface ConversationMessage {
  speaker: 'user' | 'project_manager_agent' | 'data_scientist_agent' | 'business_agent';
  message: string;
  messageType: 'question' | 'clarification' | 'suggestion' | 'confirmation' | 'explanation';
  relatedGoals?: string[];
  confidence?: number;
  timestamp: Date;
}

interface GoalCandidate {
  id: string;
  statement: string;
  confidence: number;
  category: string;
  priority: 'high' | 'medium' | 'low';
  clarifications: string[];
  status: 'proposed' | 'confirmed' | 'refined' | 'rejected';
}

interface RefinementResult {
  refinedGoals: GoalCandidate[];
  nextQuestions: string[];
  readyForExecution: boolean;
  confidence: number;
}

export class ConversationalAgent {
  private static instance: ConversationalAgent;

  public static getInstance(): ConversationalAgent {
    if (!ConversationalAgent.instance) {
      ConversationalAgent.instance = new ConversationalAgent();
    }
    return ConversationalAgent.instance;
  }

  /**
   * Start a new conversation session for goal discovery
   */
  async startConversation(
    userId: string,
    initialDescription: string,
    journeyId?: string
  ): Promise<ConversationState> {
    const sessionId = this.generateSessionId();

    // Get user's audience profile for context
    const userProfile = await this.getUserProfile(userId);

    // Generate initial goal candidates from user description
    const initialGoals = await this.extractInitialGoals(
      initialDescription,
      userProfile || undefined
    );

    const conversationState: ConversationState = {
      id: this.generateConversationId(),
      projectId: null,
      userId,
      sessionId,
      journeyId: journeyId || null,
      currentPhase: 'goal_discovery',
      goalCandidates: initialGoals,
      conversationHistory: [{
        timestamp: new Date(),
        speaker: 'user',
        message: initialDescription,
        messageType: 'suggestion'
      }],
      contextAccumulation: {
        industry: userProfile?.industry,
        businessProcesses: [],
        dataTypes: [],
        constraints: [],
        successCriteria: []
      },
      nextActions: await this.generateNextActions(initialGoals, userProfile),
      lastInteraction: new Date(),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store in database
    await db.insert(conversationStates).values(conversationState);

    // Send initial clarifying questions to user via realtime
    await this.sendClarifyingQuestions(conversationState);

    return conversationState;
  }

  /**
   * Continue conversation with user response
   */
  async continueConversation(
    conversationId: string,
    userMessage: string,
    relatedGoals?: string[]
  ): Promise<ConversationState> {
    // Get current conversation state
    const [currentState] = await db
      .select()
      .from(conversationStates)
      .where(eq(conversationStates.id, conversationId));

    if (!currentState) {
      throw new Error('Conversation not found');
    }

    // Add user message to history
    const newMessage: ConversationMessage = {
      timestamp: new Date(),
      speaker: 'user',
      message: userMessage,
      messageType: 'clarification',
      relatedGoals
    };

    const updatedHistory = [...currentState.conversationHistory, newMessage];

    // Process user response and refine goals
    const refinementResult = await this.processUserResponse(
      currentState,
      userMessage,
      relatedGoals
    );

    // Update conversation state
    const updatedState: ConversationState = {
      ...currentState,
      goalCandidates: refinementResult.refinedGoals,
      conversationHistory: updatedHistory,
      currentPhase: this.determineNextPhase(refinementResult),
      nextActions: await this.generateNextActions(
        refinementResult.refinedGoals,
        await this.getUserProfile(currentState.userId)
      ),
      updatedAt: new Date()
    };

    // Update in database
    await db
      .update(conversationStates)
      .set(updatedState)
      .where(eq(conversationStates.id, conversationId));

    // Send follow-up questions or confirmations
    if (!refinementResult.readyForExecution) {
      await this.sendFollowupQuestions(updatedState, refinementResult);
    } else {
      await this.sendExecutionReadyNotification(updatedState);
    }

    return updatedState;
  }

  /**
   * Extract initial goal candidates from user description
   */
  private async extractInitialGoals(
    description: string,
    userProfile?: AudienceProfile
  ): Promise<GoalCandidate[]> {
    const prompt = this.buildGoalExtractionPrompt(description, userProfile);

    try {
      const aiResponse = await multiAIService.analyzeWithFallback(prompt, {
        description,
        userProfile
      });

      const parsedResponse = JSON.parse(aiResponse.result);

      return parsedResponse.goals.map((goal: any, index: number) => ({
        id: `goal_${Date.now()}_${index}`,
        statement: goal.statement,
        confidence: goal.confidence || 0.7,
        category: goal.category || 'general',
        priority: goal.priority || 'medium',
        clarifications: goal.clarifications || [],
        status: 'proposed' as const
      }));
    } catch (error) {
      console.error('Failed to extract initial goals:', error);

      // Fallback to simple parsing
      return [{
        id: `goal_${Date.now()}_0`,
        statement: description,
        confidence: 0.5,
        category: 'general',
        priority: 'medium',
        clarifications: ['Could you provide more specific details about your objectives?'],
        status: 'proposed'
      }];
    }
  }

  /**
   * Process user response and refine goals
   */
  private async processUserResponse(
    currentState: ConversationState,
    userMessage: string,
    relatedGoals?: string[]
  ): Promise<RefinementResult> {
    const prompt = this.buildRefinementPrompt(currentState, userMessage, relatedGoals);

    try {
      const aiResponse = await multiAIService.analyzeWithFallback(prompt, {
        currentState,
        userMessage,
        relatedGoals
      });

      const parsedResponse = JSON.parse(aiResponse.result);

      // Update related goals with new information
      const refinedGoals = (currentState.goalCandidates as GoalCandidate[]).map((goal: GoalCandidate) => {
        if (relatedGoals?.includes(goal.id)) {
          return {
            ...goal,
            statement: parsedResponse.refinedGoals[goal.id]?.statement || goal.statement,
            confidence: Math.min(goal.confidence + 0.1, 1.0),
            clarifications: parsedResponse.refinedGoals[goal.id]?.clarifications || goal.clarifications,
            status: parsedResponse.refinedGoals[goal.id]?.status || goal.status
          };
        }
        return goal;
      });

      // Add any new goals discovered
      if (parsedResponse.newGoals) {
        parsedResponse.newGoals.forEach((newGoal: any, index: number) => {
          refinedGoals.push({
            id: `goal_${Date.now()}_new_${index}`,
            statement: newGoal.statement,
            confidence: newGoal.confidence || 0.6,
            category: newGoal.category || 'discovered',
            priority: newGoal.priority || 'medium',
            clarifications: newGoal.clarifications || [],
            status: 'proposed'
          });
        });
      }

      return {
        refinedGoals,
        nextQuestions: parsedResponse.nextQuestions || [],
        readyForExecution: parsedResponse.readyForExecution || false,
        confidence: this.calculateOverallConfidence(refinedGoals)
      };
    } catch (error) {
      console.error('Failed to process user response:', error);

      // Fallback refinement
      return {
        refinedGoals: (currentState.goalCandidates as GoalCandidate[]).map((goal: GoalCandidate) => ({
          ...goal,
          confidence: Math.min(goal.confidence + 0.05, 1.0)
        })),
        nextQuestions: ['Could you tell me more about your specific requirements?'],
        readyForExecution: false,
        confidence: this.calculateOverallConfidence(currentState.goalCandidates as GoalCandidate[])
      };
    }
  }

  /**
   * Send clarifying questions to user via realtime
   */
  private async sendClarifyingQuestions(conversationState: ConversationState): Promise<void> {
    const questions = await this.generateClarifyingQuestions(conversationState.goalCandidates as GoalCandidate[]);

    const agentMessage: ConversationMessage = {
      timestamp: new Date(),
      speaker: 'project_manager_agent',
      message: questions.join('\n'),
      messageType: 'question',
      confidence: 0.8
    };

    // Broadcast via realtime
    if (realtimeServer) {
      realtimeServer.broadcastToUser(conversationState.userId, {
        type: 'progress',
        sourceType: 'streaming',
        sourceId: 'conversational_agent',
        userId: conversationState.userId,
        timestamp: new Date(),
        data: {
          conversationId: conversationState.id,
          message: agentMessage,
          phase: conversationState.currentPhase
        }
      });
    }
  }

  /**
   * Generate clarifying questions based on goal candidates
   */
  private async generateClarifyingQuestions(goalCandidates: GoalCandidate[]): Promise<string[]> {
    const prompt = `Based on these goal candidates, generate 2-3 specific clarifying questions:

Goals:
${goalCandidates.map(g => `- ${g.statement} (confidence: ${g.confidence})`).join('\n')}

Generate questions that will help:
1. Increase confidence in the goals
2. Discover missing requirements
3. Clarify success criteria

Return as JSON array of questions.`;

    try {
      const aiResponse = await multiAIService.analyzeWithFallback(prompt, { goalCandidates });
      const questions = JSON.parse(aiResponse.result);
      return Array.isArray(questions) ? questions : questions.questions || [];
    } catch (error) {
      console.error('Failed to generate clarifying questions:', error);
      return [
        'Could you provide more specific details about what success looks like?',
        'Are there any constraints or limitations we should be aware of?',
        'Who are the key stakeholders for this analysis?'
      ];
    }
  }

  /**
   * Build goal extraction prompt
   */
  private buildGoalExtractionPrompt(description: string, userProfile?: AudienceProfile): string {
    return `Extract analysis goals from this user description:

User Description: "${description}"

${userProfile ? `User Profile:
- Role: ${userProfile.role}
- Industry: ${userProfile.industry}
- Seniority: ${userProfile.seniority}
- Analytical Maturity: ${userProfile.analyticalMaturity}` : ''}

Extract 2-5 specific, measurable goals. For each goal, provide:
- statement: Clear, specific goal statement
- category: business, operational, strategic, or technical
- priority: high, medium, or low
- confidence: 0.0-1.0 confidence in understanding
- clarifications: Questions to improve understanding

Return as JSON: { "goals": [...] }`;
  }

  /**
   * Build refinement prompt for processing user responses
   */
  private buildRefinementPrompt(
    currentState: ConversationState,
    userMessage: string,
    relatedGoals?: string[]
  ): string {
    return `Refine analysis goals based on user response:

Current Goals:
${(currentState.goalCandidates as GoalCandidate[]).map((g: GoalCandidate) => `${g.id}: ${g.statement} (${g.status})`).join('\n')}

User Response: "${userMessage}"
Related Goals: ${relatedGoals?.join(', ') || 'none specified'}

Context so far:
${(currentState.conversationHistory as any[]).slice(-3).map((h: any) => `${h.speaker}: ${h.message}`).join('\n')}

Update goals and determine next steps. Return JSON:
{
  "refinedGoals": { "goal_id": { "statement": "...", "status": "...", "clarifications": [...] } },
  "newGoals": [{ "statement": "...", "category": "...", "priority": "..." }],
  "nextQuestions": [...],
  "readyForExecution": boolean
}`;
  }

  /**
   * Helper methods
   */
  private async getUserProfile(userId: string): Promise<AudienceProfile | null> {
    const [profile] = await db
      .select()
      .from(audienceProfiles)
      .where(and(
        eq(audienceProfiles.userId, userId),
        eq(audienceProfiles.isDefault, true)
      ));

    return profile || null;
  }

  private generateSessionId(): string {
    return `session_${nanoid()}`;
  }

  private generateConversationId(): string {
    return `conv_${nanoid()}`;
  }

  private calculateOverallConfidence(goals: GoalCandidate[]): number {
    if (goals.length === 0) return 0;
    return goals.reduce((sum, goal) => sum + goal.confidence, 0) / goals.length;
  }

  private determineNextPhase(refinementResult: RefinementResult): ConversationState['currentPhase'] {
    if (refinementResult.readyForExecution) {
      return 'execution_planning';
    }
    if (refinementResult.confidence > 0.8) {
      return 'solution_design';
    }
    if (refinementResult.confidence > 0.6) {
      return 'requirement_refinement';
    }
    return 'goal_discovery';
  }

  private async generateNextActions(
    goals: GoalCandidate[],
    userProfile?: AudienceProfile | null
  ): Promise<ConversationState['nextActions']> {
    const actions = [];

    // Always add clarification action if confidence is low
    const avgConfidence = this.calculateOverallConfidence(goals);
    if (avgConfidence < 0.8) {
      actions.push({
        type: 'ask_clarification' as const,
        priority: 1,
        description: 'Ask clarifying questions to improve goal understanding',
        dueBy: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });
    }

    // Add solution proposal if confidence is high
    if (avgConfidence > 0.7) {
      actions.push({
        type: 'propose_solution' as const,
        priority: 2,
        description: 'Propose analysis approach and solution design'
      });
    }

    return actions;
  }

  private async sendFollowupQuestions(
    conversationState: ConversationState,
    refinementResult: RefinementResult
  ): Promise<void> {
    if (refinementResult.nextQuestions.length === 0) return;

    const agentMessage: ConversationMessage = {
      timestamp: new Date(),
      speaker: 'project_manager_agent',
      message: refinementResult.nextQuestions.join('\n\n'),
      messageType: 'question',
      confidence: refinementResult.confidence
    };

    // Broadcast via realtime
    if (realtimeServer) {
      realtimeServer.broadcastToUser(conversationState.userId, {
        type: 'progress',
        sourceType: 'streaming',
        sourceId: 'conversational_agent',
        userId: conversationState.userId,
        timestamp: new Date(),
        data: {
          conversationId: conversationState.id,
          message: agentMessage,
          refinementResult
        }
      });
    }
  }

  private async sendExecutionReadyNotification(conversationState: ConversationState): Promise<void> {
    const agentMessage: ConversationMessage = {
      timestamp: new Date(),
      speaker: 'project_manager_agent',
      message: 'Great! I have enough information to proceed with your analysis. Here\'s what we\'ll focus on:\n\n' +
                (conversationState.goalCandidates as GoalCandidate[])
                  .filter((g: GoalCandidate) => g.status === 'confirmed')
                  .map((g: GoalCandidate) => `• ${g.statement}`)
                  .join('\n') +
                '\n\nShall we proceed to design your analysis approach?',
      messageType: 'confirmation',
      confidence: 0.9
    };

    // Broadcast via realtime
    if (realtimeServer) {
      realtimeServer.broadcastToUser(conversationState.userId, {
        type: 'job_complete',
        sourceType: 'streaming',
        sourceId: 'conversational_agent',
        userId: conversationState.userId,
        timestamp: new Date(),
        data: {
          conversationId: conversationState.id,
          message: agentMessage,
          confirmedGoals: (conversationState.goalCandidates as GoalCandidate[]).filter((g: GoalCandidate) => g.status === 'confirmed')
        }
      });
    }
  }

  /**
   * Get conversation state by ID
   */
  async getConversationState(conversationId: string): Promise<ConversationState | null> {
    const [state] = await db
      .select()
      .from(conversationStates)
      .where(eq(conversationStates.id, conversationId));

    return state || null;
  }

  /**
   * Get active conversations for user
   */
  async getUserActiveConversations(userId: string): Promise<ConversationState[]> {
    return db
      .select()
      .from(conversationStates)
      .where(eq(conversationStates.userId, userId))
      .orderBy(desc(conversationStates.updatedAt))
      .limit(10);
  }
}

export const conversationalAgent = ConversationalAgent.getInstance();