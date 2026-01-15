/**
 * Agent Result Service
 *
 * Manages storage and retrieval of agent outputs for U2A2A2U workflow.
 * Each agent stores its results here so subsequent agents can build on prior work.
 */

import { db } from '../db';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

// Types
export type AgentType = 'project_manager' | 'data_engineer' | 'data_scientist' | 'business_agent';
export type ResultStatus = 'pending' | 'running' | 'success' | 'partial' | 'failed';

export interface AgentResultInput {
  userContext: {
    goals: string[];
    questions: string[];
    audience?: string;
  };
  dataContext?: {
    datasetIds: string[];
    schema?: Record<string, any>;
    rowCount?: number;
  };
  previousResults?: string[]; // IDs of prior agent results
  taskParameters?: Record<string, any>;
}

export interface AgentResultOutput {
  status: ResultStatus;
  result: any;
  confidence: number;
  recommendations: string[];
  warnings: string[];
  artifacts?: {
    type: string;
    id: string;
    path?: string;
  }[];
}

export interface AgentResult {
  id: string;
  projectId: string;
  agentType: AgentType;
  taskType: string;
  input: AgentResultInput;
  output: AgentResultOutput;
  status: ResultStatus;
  executionTimeMs?: number;
  tokensUsed?: number;
  modelUsed?: string;
  confidence?: number;
  dependsOnResults: string[];
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface CreateAgentResultParams {
  projectId: string;
  agentType: AgentType;
  taskType: string;
  input: AgentResultInput;
}

export interface UpdateAgentResultParams {
  output: AgentResultOutput;
  executionTimeMs?: number;
  tokensUsed?: number;
  modelUsed?: string;
  errorMessage?: string;
}

class AgentResultService {
  /**
   * Create a new agent result (mark as pending/running)
   */
  async createResult(params: CreateAgentResultParams): Promise<AgentResult> {
    const id = nanoid();
    const now = new Date();

    const result: AgentResult = {
      id,
      projectId: params.projectId,
      agentType: params.agentType,
      taskType: params.taskType,
      input: params.input,
      output: {
        status: 'pending',
        result: null,
        confidence: 0,
        recommendations: [],
        warnings: []
      },
      status: 'running',
      dependsOnResults: params.input.previousResults || [],
      createdAt: now
    };

    await db.execute(sql`
      INSERT INTO agent_results (id, project_id, agent_type, task_type, input, output, status, depends_on_results, created_at)
      VALUES (${id}, ${params.projectId}, ${params.agentType}, ${params.taskType},
              ${JSON.stringify(params.input)}::jsonb, ${JSON.stringify(result.output)}::jsonb,
              'running', ${params.input.previousResults || []}, ${now})
    `);

    console.log(`📝 [AgentResult] Created ${params.agentType}/${params.taskType} for project ${params.projectId}`);
    return result;
  }

  /**
   * Complete an agent result with output
   */
  async completeResult(id: string, params: UpdateAgentResultParams): Promise<AgentResult | null> {
    const now = new Date();
    const status = params.output.status;

    await db.execute(sql`
      UPDATE agent_results
      SET output = ${JSON.stringify(params.output)}::jsonb,
          status = ${status},
          execution_time_ms = ${params.executionTimeMs || null},
          tokens_used = ${params.tokensUsed || null},
          model_used = ${params.modelUsed || null},
          confidence = ${params.output.confidence || null},
          completed_at = ${now},
          error_message = ${params.errorMessage || null}
      WHERE id = ${id}
    `);

    console.log(`✅ [AgentResult] Completed ${id} with status ${status}`);
    return this.getResult(id);
  }

  /**
   * Mark result as failed
   */
  async failResult(id: string, errorMessage: string): Promise<void> {
    const now = new Date();

    await db.execute(sql`
      UPDATE agent_results
      SET status = 'failed',
          error_message = ${errorMessage},
          completed_at = ${now},
          output = jsonb_set(output, '{status}', '"failed"')
      WHERE id = ${id}
    `);

    console.log(`❌ [AgentResult] Failed ${id}: ${errorMessage}`);
  }

  /**
   * Get a single result by ID
   */
  async getResult(id: string): Promise<AgentResult | null> {
    const results = await db.execute(sql`
      SELECT * FROM agent_results WHERE id = ${id}
    `);

    if (!results.rows || results.rows.length === 0) {
      return null;
    }

    return this.mapRowToResult(results.rows[0]);
  }

  /**
   * Get all results for a project
   */
  async getProjectResults(projectId: string): Promise<AgentResult[]> {
    const results = await db.execute(sql`
      SELECT * FROM agent_results
      WHERE project_id = ${projectId}
      ORDER BY created_at ASC
    `);

    return (results.rows || []).map((row: any) => this.mapRowToResult(row));
  }

  /**
   * Get results by agent type for a project
   */
  async getAgentResults(projectId: string, agentType: AgentType): Promise<AgentResult[]> {
    const results = await db.execute(sql`
      SELECT * FROM agent_results
      WHERE project_id = ${projectId} AND agent_type = ${agentType}
      ORDER BY created_at DESC
    `);

    return (results.rows || []).map((row: any) => this.mapRowToResult(row));
  }

  /**
   * Get the latest result for each agent in a project
   */
  async getLatestResultsPerAgent(projectId: string): Promise<Record<AgentType, AgentResult | null>> {
    const results = await db.execute(sql`
      SELECT DISTINCT ON (agent_type) *
      FROM agent_results
      WHERE project_id = ${projectId} AND status IN ('success', 'partial')
      ORDER BY agent_type, created_at DESC
    `);

    const mapped: Record<AgentType, AgentResult | null> = {
      project_manager: null,
      data_engineer: null,
      data_scientist: null,
      business_agent: null
    };

    for (const row of (results.rows || []) as any[]) {
      const result = this.mapRowToResult(row);
      mapped[result.agentType] = result;
    }

    return mapped;
  }

  /**
   * Get results that a given result depends on
   */
  async getDependencies(id: string): Promise<AgentResult[]> {
    const result = await this.getResult(id);
    if (!result || !result.dependsOnResults.length) {
      return [];
    }

    const results = await db.execute(sql`
      SELECT * FROM agent_results
      WHERE id = ANY(${result.dependsOnResults})
      ORDER BY created_at ASC
    `);

    return (results.rows || []).map((row: any) => this.mapRowToResult(row));
  }

  /**
   * Build context for next agent from all prior results
   */
  async buildContextForAgent(
    projectId: string,
    targetAgent: AgentType,
    userContext: { goals: string[]; questions: string[]; audience?: string }
  ): Promise<AgentResultInput> {
    const latestResults = await this.getLatestResultsPerAgent(projectId);

    // Build input context with prior agent outputs
    const previousResults: string[] = [];
    const priorOutputs: Record<string, any> = {};

    // Data Engineer should run first
    if (latestResults.data_engineer && targetAgent !== 'data_engineer') {
      previousResults.push(latestResults.data_engineer.id);
      priorOutputs.dataEngineer = latestResults.data_engineer.output.result;
    }

    // Data Scientist needs DE output
    if (latestResults.data_scientist && targetAgent === 'business_agent') {
      previousResults.push(latestResults.data_scientist.id);
      priorOutputs.dataScientist = latestResults.data_scientist.output.result;
    }

    return {
      userContext,
      previousResults,
      taskParameters: {
        priorAgentOutputs: priorOutputs
      }
    };
  }

  /**
   * Check if all prerequisite agents have completed for a given agent
   */
  async canAgentProceed(projectId: string, agentType: AgentType): Promise<{ canProceed: boolean; blockedBy?: string }> {
    const latestResults = await this.getLatestResultsPerAgent(projectId);

    // Define prerequisites
    const prerequisites: Record<AgentType, AgentType[]> = {
      project_manager: [],
      data_engineer: [],
      data_scientist: ['data_engineer'],
      business_agent: ['data_engineer', 'data_scientist']
    };

    const required = prerequisites[agentType];
    for (const prereq of required) {
      const result = latestResults[prereq];
      if (!result || result.status === 'failed') {
        return { canProceed: false, blockedBy: prereq };
      }
    }

    return { canProceed: true };
  }

  private mapRowToResult(row: any): AgentResult {
    return {
      id: row.id,
      projectId: row.project_id,
      agentType: row.agent_type as AgentType,
      taskType: row.task_type,
      input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
      output: typeof row.output === 'string' ? JSON.parse(row.output) : row.output,
      status: row.status as ResultStatus,
      executionTimeMs: row.execution_time_ms,
      tokensUsed: row.tokens_used,
      modelUsed: row.model_used,
      confidence: row.confidence,
      dependsOnResults: row.depends_on_results || [],
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      errorMessage: row.error_message
    };
  }
}

export const agentResultService = new AgentResultService();
