/**
 * Decision Audit Service
 * Centralized service for logging agent decisions across all operations.
 * Provides transparency into AI decision-making for the U2A2A2U workflow.
 */

import { db } from '../db';
import { decisionAudits } from '@shared/schema';
import { nanoid } from 'nanoid';

// ==========================================
// DECISION AUDIT TYPES
// ==========================================

export type DecisionAgent =
  | 'project_manager'
  | 'data_scientist'
  | 'data_engineer'
  | 'business_agent'
  | 'technical_agent'
  | 'system';

export type DecisionType =
  | 'analysis_approach'
  | 'data_processing'
  | 'visualization_choice'
  | 'transformation_selection'
  | 'insight_prioritization'
  | 'cost_estimation'
  | 'checkpoint_creation'
  | 'tool_selection'
  | 'workflow_modification'
  | 'journey_selection'
  | 'agent_selection';

export interface DecisionAuditEntry {
  id: string;
  projectId: string;
  agent: DecisionAgent;
  decisionType: DecisionType;
  decision: any;
  rationale?: string;
  alternatives?: any[];
  confidence?: number;
  context?: Record<string, any>;
  timestamp: Date;
}

// ==========================================
// DECISION AUDIT SERVICE
// ==========================================

class DecisionAuditService {
  private inMemoryCache: Map<string, DecisionAuditEntry[]> = new Map();

  /**
   * Log a decision to both in-memory cache and database
   */
  async logDecision(
    projectId: string,
    agent: DecisionAgent,
    decisionType: DecisionType,
    decision: any,
    options?: {
      rationale?: string;
      reasoning?: string;
      alternatives?: any[];
      confidence?: number;
      context?: Record<string, any>;
      impact?: string;
      reversible?: boolean;
    }
  ): Promise<DecisionAuditEntry> {
    const entry: DecisionAuditEntry = {
      id: nanoid(),
      projectId,
      agent,
      decisionType,
      decision,
      rationale: options?.rationale,
      alternatives: options?.alternatives,
      confidence: options?.confidence,
      context: options?.context,
      timestamp: new Date(),
    };

    // Update in-memory cache
    if (!this.inMemoryCache.has(projectId)) {
      this.inMemoryCache.set(projectId, []);
    }
    this.inMemoryCache.get(projectId)!.push(entry);

    // Persist to database
    try {
      if (db) {
        await db.insert(decisionAudits).values({
          id: entry.id,
          projectId: projectId,
          agent: agent,
          decisionType: decisionType,
          decision: typeof decision === 'string' ? decision : JSON.stringify(decision),
          reasoning: options?.rationale || options?.reasoning || 'Automated decision',
          alternatives: options?.alternatives ? JSON.stringify(options.alternatives) : JSON.stringify([]),
          confidence: typeof options?.confidence === 'number' ? options.confidence : 80,
          context: options?.context ? JSON.stringify(options.context) : JSON.stringify({}),
          impact: options?.impact || 'medium',
          reversible: options?.reversible ?? true,
          timestamp: new Date(),
        });
        console.log(`📋 [DecisionAudit] Logged: ${decisionType} by ${agent} for project ${projectId}`);
      }
    } catch (dbError) {
      console.warn(`[DecisionAudit] Failed to persist to database:`, dbError);
      // Don't fail the operation - in-memory cache still works
    }

    return entry;
  }

  /**
   * Get all decisions for a project from cache
   */
  getDecisions(projectId: string): DecisionAuditEntry[] {
    return this.inMemoryCache.get(projectId) || [];
  }

  /**
   * Get decisions filtered by agent
   */
  getDecisionsByAgent(projectId: string, agent: DecisionAgent): DecisionAuditEntry[] {
    return this.getDecisions(projectId).filter(d => d.agent === agent);
  }

  /**
   * Get decisions filtered by type
   */
  getDecisionsByType(projectId: string, decisionType: DecisionType): DecisionAuditEntry[] {
    return this.getDecisions(projectId).filter(d => d.decisionType === decisionType);
  }

  /**
   * Clear cache for a project (e.g., when project is deleted)
   */
  clearCache(projectId: string): void {
    this.inMemoryCache.delete(projectId);
  }

  /**
   * Get summary statistics for a project's decisions
   */
  getSummary(projectId: string): {
    totalDecisions: number;
    byAgent: Record<string, number>;
    byType: Record<string, number>;
    averageConfidence: number;
  } {
    const decisions = this.getDecisions(projectId);

    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const decision of decisions) {
      byAgent[decision.agent] = (byAgent[decision.agent] || 0) + 1;
      byType[decision.decisionType] = (byType[decision.decisionType] || 0) + 1;
      if (decision.confidence !== undefined) {
        totalConfidence += decision.confidence;
        confidenceCount++;
      }
    }

    return {
      totalDecisions: decisions.length,
      byAgent,
      byType,
      averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    };
  }
}

// Export singleton instance
export const decisionAuditService = new DecisionAuditService();

// ==========================================
// CONVENIENCE FUNCTIONS FOR AGENTS
// ==========================================

/**
 * Log a data scientist decision
 */
export async function logDataScientistDecision(
  projectId: string,
  decisionType: DecisionType,
  decision: any,
  options?: { rationale?: string; confidence?: number; context?: Record<string, any> }
): Promise<DecisionAuditEntry> {
  return decisionAuditService.logDecision(projectId, 'data_scientist', decisionType, decision, options);
}

/**
 * Log a data engineer decision
 */
export async function logDataEngineerDecision(
  projectId: string,
  decisionType: DecisionType,
  decision: any,
  options?: { rationale?: string; confidence?: number; context?: Record<string, any> }
): Promise<DecisionAuditEntry> {
  return decisionAuditService.logDecision(projectId, 'data_engineer', decisionType, decision, options);
}

/**
 * Log a business agent decision
 */
export async function logBusinessAgentDecision(
  projectId: string,
  decisionType: DecisionType,
  decision: any,
  options?: { rationale?: string; confidence?: number; context?: Record<string, any> }
): Promise<DecisionAuditEntry> {
  return decisionAuditService.logDecision(projectId, 'business_agent', decisionType, decision, options);
}

/**
 * Log a project manager decision
 */
export async function logProjectManagerDecision(
  projectId: string,
  decisionType: DecisionType,
  decision: any,
  options?: { rationale?: string; confidence?: number; context?: Record<string, any> }
): Promise<DecisionAuditEntry> {
  return decisionAuditService.logDecision(projectId, 'project_manager', decisionType, decision, options);
}

/**
 * Log a system decision (automated)
 */
export async function logSystemDecision(
  projectId: string,
  decisionType: DecisionType,
  decision: any,
  options?: { rationale?: string; confidence?: number; context?: Record<string, any> }
): Promise<DecisionAuditEntry> {
  return decisionAuditService.logDecision(projectId, 'system', decisionType, decision, options);
}
