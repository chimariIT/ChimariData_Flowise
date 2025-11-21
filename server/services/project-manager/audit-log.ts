import { nanoid } from 'nanoid';
import { DecisionAuditRecord } from './types';

type AuditTrail = Map<string, DecisionAuditRecord[]>;

export class DecisionAuditManager {
  private readonly trails: AuditTrail = new Map();

  logDecision(
    projectId: string,
    userId: string,
    decisionType: DecisionAuditRecord['decisionType'],
    decisionMaker: DecisionAuditRecord['decisionMaker'],
    decision: any,
    options?: {
      rationale?: string;
      alternatives?: any[];
      confidence?: number;
      executionContext?: DecisionAuditRecord['executionContext'];
    }
  ): DecisionAuditRecord {
    const record: DecisionAuditRecord = {
      auditId: nanoid(),
      projectId,
      userId,
      decisionType,
      decisionMaker,
      decision,
      rationale: options?.rationale,
      alternatives: options?.alternatives,
      confidence: options?.confidence,
      timestamp: new Date(),
      executionContext: options?.executionContext
    };

    if (!this.trails.has(projectId)) {
      this.trails.set(projectId, []);
    }

    this.trails.get(projectId)!.push(record);
    return record;
  }

  getAuditTrail(projectId: string): DecisionAuditRecord[] {
    return this.trails.get(projectId) || [];
  }

  getAuditTrailByType(
    projectId: string,
    decisionType: DecisionAuditRecord['decisionType']
  ): DecisionAuditRecord[] {
    return this.getAuditTrail(projectId).filter((record) => record.decisionType === decisionType);
  }

  getAuditTrailByMaker(
    projectId: string,
    decisionMaker: DecisionAuditRecord['decisionMaker']
  ): DecisionAuditRecord[] {
    return this.getAuditTrail(projectId).filter((record) => record.decisionMaker === decisionMaker);
  }

  getAuditSummary(projectId: string): {
    totalDecisions: number;
    decisionsByType: Record<string, number>;
    decisionsByMaker: Record<string, number>;
    averageConfidence: number;
    latestDecision?: DecisionAuditRecord;
  } {
    const records = this.getAuditTrail(projectId);
    const decisionsByType: Record<string, number> = {};
    const decisionsByMaker: Record<string, number> = {};
    let totalConfidence = 0;
    let confidenceCount = 0;

    records.forEach((record) => {
      decisionsByType[record.decisionType] = (decisionsByType[record.decisionType] || 0) + 1;
      decisionsByMaker[record.decisionMaker] = (decisionsByMaker[record.decisionMaker] || 0) + 1;

      if (record.confidence !== undefined) {
        totalConfidence += record.confidence;
        confidenceCount += 1;
      }
    });

    return {
      totalDecisions: records.length,
      decisionsByType,
      decisionsByMaker,
      averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      latestDecision: records.length > 0 ? records[records.length - 1] : undefined
    };
  }

  clearAuditTrail(projectId: string): void {
    this.trails.delete(projectId);
  }
}
