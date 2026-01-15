import { db } from '../db';
import { decisionAudits } from '../../shared/schema';
import { nanoid } from 'nanoid';

interface LogDecisionParams {
  projectId: string;
  agent: string;
  decisionType: string;
  decision: string;
  reasoning: string;
  alternatives?: any[];
  confidence: number;
  impact?: 'low' | 'medium' | 'high';
  userInput?: string;
  reversible?: boolean;
  context?: Record<string, any>;
}

/**
 * Decision Logger Service
 * Records agent and user decisions in the decision_audits table
 * for transparency and audit trail purposes
 */
export class DecisionLogger {
  /**
   * Log a decision made by an agent or user
   */
  async logDecision({
    projectId,
    agent,
    decisionType,
    decision,
    reasoning,
    alternatives = [],
    confidence,
    impact = 'medium',
    userInput,
    reversible = true,
    context = {}
  }: LogDecisionParams): Promise<void> {
    try {
      await db.insert(decisionAudits).values({
        id: nanoid(),
        projectId,
        agent,
        decisionType,
        decision,
        reasoning,
        alternatives,
        confidence,
        impact,
        userInput,
        reversible,
        context,
        timestamp: new Date()
      });

      console.log(`📝 Decision logged: ${agent} - ${decisionType}`);
    } catch (error) {
      console.error('Failed to log decision:', error);
      // Don't throw - logging failures shouldn't break workflow
    }
  }

  /**
   * Log a plan creation decision
   */
  async logPlanDecision(
    projectId: string,
    analysisTypes: string[],
    reasoning: string,
    confidence: number
  ): Promise<void> {
    await this.logDecision({
      projectId,
      agent: 'Project Manager',
      decisionType: 'analysis_plan',
      decision: `Selected analysis types: ${analysisTypes.join(', ')}`,
      reasoning,
      confidence,
      impact: 'high',
      context: { analysisTypes }
    });
  }

  /**
   * Log a data transformation decision
   */
  async logTransformationDecision(
    projectId: string,
    transformationType: string,
    columns: string[],
    reasoning: string,
    confidence: number
  ): Promise<void> {
    await this.logDecision({
      projectId,
      agent: 'Data Engineer',
      decisionType: 'data_transformation',
      decision: `Applied ${transformationType} to columns: ${columns.join(', ')}`,
      reasoning,
      confidence,
      impact: 'medium',
      context: { transformationType, columns }
    });
  }

  /**
   * Log a user approval/checkpoint decision
   */
  async logUserApproval(
    projectId: string,
    checkpointType: string,
    approved: boolean,
    userFeedback?: string
  ): Promise<void> {
    await this.logDecision({
      projectId,
      agent: 'User',
      decisionType: 'checkpoint_approval',
      decision: approved ? 'Approved' : 'Rejected',
      reasoning: userFeedback || (approved ? 'User approved checkpoint' : 'User rejected checkpoint'),
      confidence: 100,
      impact: 'high',
      userInput: userFeedback,
      context: { checkpointType, approved }
    });
  }

  /**
   * Log an analysis execution decision
   */
  async logAnalysisDecision(
    projectId: string,
    analysisType: string,
    parameters: Record<string, any>,
    reasoning: string,
    confidence: number
  ): Promise<void> {
    await this.logDecision({
      projectId,
      agent: 'Data Scientist',
      decisionType: 'analysis_execution',
      decision: `Executed ${analysisType} analysis`,
      reasoning,
      confidence,
      impact: 'high',
      context: { analysisType, parameters }
    });
  }

  /**
   * Get decision audit trail for a project
   */
  async getDecisionTrail(projectId: string): Promise<any[]> {
    try {
      const { eq } = await import('drizzle-orm');
      const decisions = await db
        .select()
        .from(decisionAudits)
        .where(eq(decisionAudits.projectId, projectId))
        .orderBy(decisionAudits.timestamp);

      return decisions;
    } catch (error) {
      console.error('Failed to fetch decision trail:', error);
      return [];
    }
  }
}

// Singleton instance
export const decisionLogger = new DecisionLogger();
