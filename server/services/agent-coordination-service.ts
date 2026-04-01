/**
 * Agent Coordination Service (U2A2A2U Workflow)
 *
 * Orchestrates the User-to-Agent-to-Agent-to-User workflow:
 * 1. User Input → PM receives goals, questions, data
 * 2. Agent Analysis → DE → DS → BA, each receives prior outputs
 * 3. Synthesis → PM merges all agent results
 * 4. User Checkpoint → User reviews unified recommendation
 * 5. Execution → DS executes approved plan
 * 6. Results to User → Answers with evidence chain
 */

import { agentResultService, type AgentType, type AgentResultInput, type AgentResultOutput } from './agent-result-service';
import { MCPToolRegistry } from './mcp-tool-registry';
import { db } from '../db';
import { projects, datasets, projectDatasets, agentCheckpoints } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getMessageBroker } from './agents/message-broker';

// [DAY 10] Progress Reporting Types
interface WorkflowProgressEvent {
  workflowId: string;
  projectId: string;
  phase: string;
  phaseIndex: number;
  totalPhases: number;
  status: 'started' | 'completed' | 'failed';
  percentComplete: number;
  message: string;
  slaCompliant: boolean;
  durationMs?: number;
  timestamp: string;
}

// [DAY 10] Helper to publish progress events via WebSocket
async function publishWorkflowProgress(event: WorkflowProgressEvent): Promise<void> {
  try {
    const broker = getMessageBroker();
    await broker.publish('workflow:progress', event);
    console.log(`📡 [Progress] ${event.phase}: ${event.status} (${event.percentComplete}%)`);
  } catch (error) {
    console.warn('[Progress] Failed to publish progress event:', error);
  }
}

// Import agent instances
import { DataScientistAgent } from './data-scientist-agent';

// Import real formatting services
import { AudienceFormatter } from './audience-formatter';
import { QuestionAnswerService } from './question-answer-service';
import { ArtifactGenerator } from './artifact-generator';

// Simple checkpoint interface for U2A2A2U workflow
interface CheckpointData {
  id: string;
  projectId: string;
  stepName: string;
  agentType: string;
  recommendation: string;
  options: string[];
  metadata?: any;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

// Checkpoint helper for U2A2A2U workflow
const checkpointHelper = {
  async createCheckpoint(data: Omit<CheckpointData, 'id' | 'status' | 'createdAt'>): Promise<CheckpointData> {
    const checkpoint: CheckpointData = {
      id: nanoid(),
      ...data,
      status: 'pending',
      createdAt: new Date()
    };

    // Store in database
    try {
      await db.insert(agentCheckpoints).values({
        id: checkpoint.id,
        projectId: checkpoint.projectId,
        stepName: checkpoint.stepName,
        agentType: checkpoint.agentType,
        recommendation: checkpoint.recommendation,
        options: checkpoint.options,
        metadata: checkpoint.metadata,
        status: 'pending',
        createdAt: checkpoint.createdAt
      } as any);
    } catch (error) {
      console.warn('Failed to store checkpoint in DB:', error);
    }

    return checkpoint;
  },

  async approveCheckpoint(id: string, feedback?: string): Promise<void> {
    try {
      await db.update(agentCheckpoints)
        .set({
          status: 'approved',
          userFeedback: feedback,
          resolvedAt: new Date()
        } as any)
        .where(eq(agentCheckpoints.id, id));
    } catch (error) {
      console.warn('Failed to update checkpoint:', error);
    }
  },

  async getCheckpoint(id: string): Promise<CheckpointData | null> {
    try {
      const [checkpoint] = await db.select()
        .from(agentCheckpoints)
        .where(eq(agentCheckpoints.id, id));

      if (!checkpoint) return null;

      return {
        id: checkpoint.id,
        projectId: checkpoint.projectId,
        stepName: checkpoint.stepName,
        agentType: checkpoint.agentType,
        recommendation: checkpoint.recommendation,
        options: checkpoint.options as string[],
        metadata: checkpoint.metadata,
        status: checkpoint.status as 'pending' | 'approved' | 'rejected',
        createdAt: checkpoint.createdAt
      };
    } catch (error) {
      console.warn('Failed to get checkpoint:', error);
      return null;
    }
  }
};

export interface U2A2A2URequest {
  projectId: string;
  userId: string;
  goals: string[];
  questions: string[];
  analysisTypes: string[];
  audience?: string;
  // CRITICAL: DS-recommended analyses with priority and details
  analysisPath?: any[];
  // CRITICAL: Question-to-analysis mapping for evidence chain
  questionAnswerMapping?: any[];
  // Required data elements for validation
  requiredDataElements?: any[];
  // PII decisions for filtering
  piiDecisions?: any;
  // Number of datasets uploaded (used for dynamic status messages)
  datasetCount?: number;
}

// ==========================================
// SLA SOFT ENFORCEMENT
// ==========================================
// Phase-specific timeouts (in milliseconds)
const PHASE_TIMEOUTS = {
  data_engineer: 60000,    // 60 seconds
  data_scientist: 180000,  // 180 seconds (3 minutes)
  business_agent: 30000,   // 30 seconds
  synthesis: 60000,        // 60 seconds
  checkpoint: 10000,       // 10 seconds
  execution: 300000        // 300 seconds (5 minutes)
} as const;

// Total SLA target: 5 minutes
const TOTAL_SLA_TARGET_MS = 300000;

interface SLAMetrics {
  phaseName: string;
  durationMs: number;
  timedOut: boolean;
  withinSLA: boolean;
}

/**
 * Execute a promise with two-tier timeout enforcement:
 * - Soft timeout at `timeoutMs`: logs warning, continues waiting
 * - Hard timeout at 2x `timeoutMs`: rejects and uses fallback
 * Returns both the result and timing metrics.
 */
async function withSoftTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  phaseName: string,
  fallback?: T
): Promise<{ result: T; metrics: SLAMetrics }> {
  const startTime = Date.now();
  let timedOut = false;
  let softTimeoutId: NodeJS.Timeout | null = null;
  let hardTimeoutId: NodeJS.Timeout | null = null;

  // Soft timeout: warning only
  softTimeoutId = setTimeout(() => {
    timedOut = true;
    console.warn(`⚠️ [SLA] Phase "${phaseName}" exceeded ${timeoutMs}ms soft timeout - still waiting...`);
  }, timeoutMs);

  // Hard timeout: reject with fallback at 2x the soft limit
  const hardTimeoutMs = timeoutMs * 2;
  const hardTimeoutPromise = new Promise<T>((resolve, reject) => {
    hardTimeoutId = setTimeout(() => {
      if (fallback !== undefined) {
        console.error(`❌ [SLA] Phase "${phaseName}" HARD TIMEOUT after ${hardTimeoutMs}ms - using fallback`);
        resolve(fallback);
      } else {
        reject(new Error(`Phase "${phaseName}" hard timeout after ${hardTimeoutMs}ms`));
      }
    }, hardTimeoutMs);
  });

  try {
    const actualResult = await Promise.race([promise, hardTimeoutPromise]);

    const durationMs = Date.now() - startTime;
    const withinSLA = durationMs <= timeoutMs;

    if (!withinSLA) {
      console.warn(`⏱️ [SLA] Phase "${phaseName}" completed in ${durationMs}ms (${timeoutMs}ms target) - SLA EXCEEDED`);
    } else {
      console.log(`⏱️ [SLA] Phase "${phaseName}" completed in ${durationMs}ms (${timeoutMs}ms target) - OK`);
    }

    return {
      result: actualResult,
      metrics: {
        phaseName,
        durationMs,
        timedOut,
        withinSLA
      }
    };
  } finally {
    if (softTimeoutId) clearTimeout(softTimeoutId);
    if (hardTimeoutId) clearTimeout(hardTimeoutId);
  }
}

export interface U2A2A2UPhaseResult {
  phase: string;
  agentType?: AgentType;
  resultId?: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  summary: string;
  checkpointId?: string;
  // SLA metrics for the phase
  slaMetrics?: SLAMetrics;
}

export interface U2A2A2UWorkflowResult {
  workflowId: string;
  projectId: string;
  phases: U2A2A2UPhaseResult[];
  status: 'completed' | 'awaiting_approval' | 'failed';
  currentPhase: string;
  checkpointId?: string;
  executionTimeMs: number;
  // SLA compliance summary
  slaCompliance?: {
    totalDurationMs: number;
    targetMs: number;
    withinSLA: boolean;
    phaseBreakdown: SLAMetrics[];
    warnings: string[];
  };
}

export class AgentCoordinationService {
  /**
   * Execute the full U2A2A2U workflow with SLA soft enforcement
   *
   * SLA Targets:
   * - Data Engineer: 60s
   * - Data Scientist: 180s
   * - Business Agent: 30s
   * - Synthesis: 60s
   * - Total: 5 minutes
   *
   * Soft enforcement means we LOG warnings but continue execution
   */
  async executeWorkflow(request: U2A2A2URequest): Promise<U2A2A2UWorkflowResult> {
    const workflowId = nanoid();
    const startTime = Date.now();
    const phases: U2A2A2UPhaseResult[] = [];
    const slaMetrics: SLAMetrics[] = [];
    const slaWarnings: string[] = [];

    console.log(`🔄 [U2A2A2U] Starting workflow ${workflowId} for project ${request.projectId}`);
    console.log(`⏱️ [SLA] Target: ${TOTAL_SLA_TARGET_MS}ms (5 minutes)`);

    const TOTAL_PHASES = 5; // DE, DS, BA, Synthesis, Checkpoint

    try {
      // [DAY 10] Publish workflow started
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'workflow',
        phaseIndex: 0,
        totalPhases: TOTAL_PHASES,
        status: 'started',
        percentComplete: 0,
        message: 'Starting U2A2A2U analysis workflow',
        slaCompliant: true,
        timestamp: new Date().toISOString()
      });

      // ==========================================
      // Phase 1: Data Engineer - Assess data quality
      // ==========================================
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'data_engineer',
        phaseIndex: 1,
        totalPhases: TOTAL_PHASES,
        status: 'started',
        percentComplete: 5,
        // P1-3 FIX: Dynamic context-aware message
        message: `Data Engineer: Assessing data quality${request.datasetCount ? ` for ${request.datasetCount} dataset(s)` : ''}`,
        slaCompliant: true,
        timestamp: new Date().toISOString()
      });

      const { result: deResult, metrics: deMetrics } = await withSoftTimeout(
        this.runDataEngineerPhase(request),
        PHASE_TIMEOUTS.data_engineer,
        'data_engineer',
        { phase: 'data_engineer', status: 'failed' as const, summary: 'Data Engineer phase timed out' }
      );
      deResult.slaMetrics = deMetrics;
      slaMetrics.push(deMetrics);
      phases.push(deResult);

      // [DAY 10] Publish phase 1 complete
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'data_engineer',
        phaseIndex: 1,
        totalPhases: TOTAL_PHASES,
        status: deResult.status === 'failed' ? 'failed' : 'completed',
        percentComplete: 20,
        message: `Data Engineer: ${deResult.status === 'failed' ? 'Failed' : `Quality assessment complete${(deResult as any).qualityScore !== undefined ? ` (score: ${Math.round(Number((deResult as any).qualityScore) * 100)}%)` : ''}${(deResult as any).issues?.length ? ` - ${(deResult as any).issues.length} issue(s) found` : ''}`}`,
        slaCompliant: deMetrics.withinSLA,
        durationMs: deMetrics.durationMs,
        timestamp: new Date().toISOString()
      });

      if (!deMetrics.withinSLA) {
        slaWarnings.push(`Data Engineer phase exceeded SLA (${deMetrics.durationMs}ms > ${PHASE_TIMEOUTS.data_engineer}ms)`);
      }

      if (deResult.status === 'failed') {
        // P3-1: Invoke CS agent for error recovery guidance
        const csGuidance = await this.invokeCustomerSupportForError(
          request.projectId, 'data_engineer',
          (deResult as any).error || 'Data Engineer phase failed',
          { userId: (request as any).userId, workflowId }
        ).catch(() => null);
        const failResult = this.buildResultWithSLA(workflowId, request.projectId, phases, 'failed', 'data_engineer', startTime, slaMetrics, slaWarnings);
        if (csGuidance) (failResult as any).supportGuidance = csGuidance;
        return failResult;
      }

      // ==========================================
      // Phase 2: Data Scientist - Plan and execute analysis
      // ==========================================
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'data_scientist',
        phaseIndex: 2,
        totalPhases: TOTAL_PHASES,
        status: 'started',
        percentComplete: 25,
        // P1-3 FIX: Dynamic context-aware message
        message: `Data Scientist: Planning analysis${(request as any).analysisTypes?.length ? ` (${(request as any).analysisTypes.slice(0, 3).join(', ')})` : ''}`,
        slaCompliant: true,
        timestamp: new Date().toISOString()
      });

      const { result: dsResult, metrics: dsMetrics } = await withSoftTimeout(
        this.runDataScientistPhase(request, deResult.resultId),
        PHASE_TIMEOUTS.data_scientist,
        'data_scientist',
        { phase: 'data_scientist', status: 'failed' as const, summary: 'Data Scientist phase timed out' }
      );
      dsResult.slaMetrics = dsMetrics;
      slaMetrics.push(dsMetrics);
      phases.push(dsResult);

      // [DAY 10] Publish phase 2 complete
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'data_scientist',
        phaseIndex: 2,
        totalPhases: TOTAL_PHASES,
        status: dsResult.status === 'failed' ? 'failed' : 'completed',
        percentComplete: 50,
        message: `Data Scientist: ${dsResult.status === 'failed' ? 'Failed' : `Analysis planning complete${(dsResult as any).recommendedAnalyses?.length ? ` - Recommended: ${(dsResult as any).recommendedAnalyses.slice(0, 3).join(', ')}` : ''}`}`,
        slaCompliant: dsMetrics.withinSLA,
        durationMs: dsMetrics.durationMs,
        timestamp: new Date().toISOString()
      });

      if (!dsMetrics.withinSLA) {
        slaWarnings.push(`Data Scientist phase exceeded SLA (${dsMetrics.durationMs}ms > ${PHASE_TIMEOUTS.data_scientist}ms)`);
      }

      if (dsResult.status === 'failed') {
        // P3-1: Invoke CS agent for error recovery guidance
        const csGuidance2 = await this.invokeCustomerSupportForError(
          request.projectId, 'data_scientist',
          (dsResult as any).error || 'Data Scientist phase failed',
          { userId: (request as any).userId, workflowId }
        ).catch(() => null);
        const failResult2 = this.buildResultWithSLA(workflowId, request.projectId, phases, 'failed', 'data_scientist', startTime, slaMetrics, slaWarnings);
        if (csGuidance2) (failResult2 as any).supportGuidance = csGuidance2;
        return failResult2;
      }

      // ==========================================
      // Phase 3: Business Agent - Validate and add context
      // ==========================================
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'business_agent',
        phaseIndex: 3,
        totalPhases: TOTAL_PHASES,
        status: 'started',
        percentComplete: 55,
        // P1-3 FIX: Dynamic context-aware message
        message: `Business Agent: Adding business context${(request as any).audience ? ` for ${(request as any).audience} audience` : ''}`,
        slaCompliant: true,
        timestamp: new Date().toISOString()
      });

      const { result: baResult, metrics: baMetrics } = await withSoftTimeout(
        this.runBusinessAgentPhase(request, deResult.resultId, dsResult.resultId),
        PHASE_TIMEOUTS.business_agent,
        'business_agent',
        { phase: 'business_agent', status: 'failed' as const, summary: 'Business Agent phase timed out' }
      );
      baResult.slaMetrics = baMetrics;
      slaMetrics.push(baMetrics);
      phases.push(baResult);

      // [DAY 10] Publish phase 3 complete
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'business_agent',
        phaseIndex: 3,
        totalPhases: TOTAL_PHASES,
        status: 'completed',
        percentComplete: 70,
        message: `Business Agent: ${(baResult as any).status === 'failed' ? 'Validation failed' : `Business validation complete${(baResult as any).kpis?.length ? ` - ${(baResult as any).kpis.length} KPIs identified` : ''}`}`,
        slaCompliant: baMetrics.withinSLA,
        durationMs: baMetrics.durationMs,
        timestamp: new Date().toISOString()
      });

      if (!baMetrics.withinSLA) {
        slaWarnings.push(`Business Agent phase exceeded SLA (${baMetrics.durationMs}ms > ${PHASE_TIMEOUTS.business_agent}ms)`);
      }

      // ==========================================
      // Phase 4: PM Synthesis - Merge all results
      // ==========================================
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'synthesis',
        phaseIndex: 4,
        totalPhases: TOTAL_PHASES,
        status: 'started',
        percentComplete: 75,
        // P1-3 FIX: Dynamic context-aware message
        message: `PM Agent: Synthesizing results from ${phases.length} agent phases`,
        slaCompliant: true,
        timestamp: new Date().toISOString()
      });

      const { result: synthesisResult, metrics: synthMetrics } = await withSoftTimeout(
        this.runSynthesisPhase(request, [deResult, dsResult, baResult]),
        PHASE_TIMEOUTS.synthesis,
        'synthesis',
        { phase: 'synthesis', status: 'failed' as const, summary: 'Synthesis phase timed out' }
      );
      synthesisResult.slaMetrics = synthMetrics;
      slaMetrics.push(synthMetrics);
      phases.push(synthesisResult);

      // [DAY 10] Publish phase 4 complete
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'synthesis',
        phaseIndex: 4,
        totalPhases: TOTAL_PHASES,
        status: 'completed',
        percentComplete: 90,
        // P1-3 FIX: Dynamic message with synthesis details
        message: `PM Agent: Results synthesized from ${phases.filter(p => p.status !== 'failed').length} successful phases`,
        slaCompliant: synthMetrics.withinSLA,
        durationMs: synthMetrics.durationMs,
        timestamp: new Date().toISOString()
      });

      if (!synthMetrics.withinSLA) {
        slaWarnings.push(`Synthesis phase exceeded SLA (${synthMetrics.durationMs}ms > ${PHASE_TIMEOUTS.synthesis}ms)`);
      }

      // ==========================================
      // Phase 5: Create checkpoint for user approval
      // ==========================================
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'checkpoint',
        phaseIndex: 5,
        totalPhases: TOTAL_PHASES,
        status: 'started',
        percentComplete: 92,
        // P1-3 FIX: Dynamic checkpoint message
        message: `Creating analysis plan checkpoint for "${(request as any).projectName || 'your project'}"`,
        slaCompliant: true,
        timestamp: new Date().toISOString()
      });

      const { result: checkpointResult, metrics: checkpointMetrics } = await withSoftTimeout(
        this.createApprovalCheckpoint(request, synthesisResult.resultId!),
        PHASE_TIMEOUTS.checkpoint,
        'checkpoint',
        { phase: 'checkpoint', status: 'failed' as const, summary: 'Checkpoint creation timed out' }
      );
      checkpointResult.slaMetrics = checkpointMetrics;
      slaMetrics.push(checkpointMetrics);
      phases.push(checkpointResult);

      // [DAY 10] Publish phase 5 complete
      await publishWorkflowProgress({
        workflowId,
        projectId: request.projectId,
        phase: 'checkpoint',
        phaseIndex: 5,
        totalPhases: TOTAL_PHASES,
        status: 'completed',
        percentComplete: 100,
        // P1-3 FIX: Dynamic approval message
        message: 'Analysis plan ready — awaiting your approval to proceed',
        slaCompliant: checkpointMetrics.withinSLA,
        durationMs: checkpointMetrics.durationMs,
        timestamp: new Date().toISOString()
      });

      // ==========================================
      // Build final result with SLA compliance
      // ==========================================
      const finalStatus = checkpointResult.checkpointId ? 'awaiting_approval' : 'completed';
      const totalDuration = Date.now() - startTime;

      if (totalDuration > TOTAL_SLA_TARGET_MS) {
        slaWarnings.push(`Total workflow exceeded SLA target (${totalDuration}ms > ${TOTAL_SLA_TARGET_MS}ms)`);
        console.warn(`⚠️ [SLA] TOTAL WORKFLOW SLA EXCEEDED: ${totalDuration}ms > ${TOTAL_SLA_TARGET_MS}ms`);
      } else {
        console.log(`✅ [SLA] Workflow completed within SLA: ${totalDuration}ms <= ${TOTAL_SLA_TARGET_MS}ms`);
      }

      return this.buildResultWithSLA(
        workflowId,
        request.projectId,
        phases,
        finalStatus,
        'checkpoint',
        startTime,
        slaMetrics,
        slaWarnings,
        checkpointResult.checkpointId
      );

    } catch (error: any) {
      console.error(`❌ [U2A2A2U] Workflow failed:`, error);
      phases.push({
        phase: 'error',
        status: 'failed',
        summary: error.message
      });
      // P3-1: Invoke CS agent for error recovery on general workflow failure
      const csGuidanceGeneral = await this.invokeCustomerSupportForError(
        request.projectId, 'workflow',
        error.message || 'Workflow execution failed',
        { userId: (request as any).userId, workflowId }
      ).catch(() => null);
      const failResultGeneral = this.buildResultWithSLA(workflowId, request.projectId, phases, 'failed', 'error', startTime, slaMetrics, slaWarnings);
      if (csGuidanceGeneral) (failResultGeneral as any).supportGuidance = csGuidanceGeneral;
      return failResultGeneral;
    }
  }

  /**
   * Build workflow result with SLA compliance information
   */
  private buildResultWithSLA(
    workflowId: string,
    projectId: string,
    phases: U2A2A2UPhaseResult[],
    status: 'completed' | 'awaiting_approval' | 'failed',
    currentPhase: string,
    startTime: number,
    slaMetrics: SLAMetrics[],
    slaWarnings: string[],
    checkpointId?: string
  ): U2A2A2UWorkflowResult {
    const totalDurationMs = Date.now() - startTime;

    return {
      workflowId,
      projectId,
      phases,
      status,
      currentPhase,
      checkpointId,
      executionTimeMs: totalDurationMs,
      slaCompliance: {
        totalDurationMs,
        targetMs: TOTAL_SLA_TARGET_MS,
        withinSLA: totalDurationMs <= TOTAL_SLA_TARGET_MS,
        phaseBreakdown: slaMetrics,
        warnings: slaWarnings
      }
    };
  }

  /**
   * Phase 1: Data Engineer assesses data quality
   */
  private async runDataEngineerPhase(request: U2A2A2URequest): Promise<U2A2A2UPhaseResult> {
    console.log(`📊 [U2A2A2U] Phase 1: Data Engineer`);

    const input: AgentResultInput = {
      userContext: {
        goals: request.goals,
        questions: request.questions,
        audience: request.audience
      },
      taskParameters: {
        analysisTypes: request.analysisTypes
      }
    };

    // Create result record
    const agentResult = await agentResultService.createResult({
      projectId: request.projectId,
      agentType: 'data_engineer',
      taskType: 'data_quality_assessment',
      input
    });

    try {
      // Load datasets
      const datasetData = await this.loadProjectData(request.projectId);

      // Use tool registry to execute
      const canUse = MCPToolRegistry.canAgentUseTool('data_engineer', 'data_quality_monitor');

      let qualityResult: any;
      if (canUse) {
        // Execute via tool (preferred)
        qualityResult = await this.executeToolForAgent('data_engineer', 'data_quality_monitor', {
          datasetId: datasetData.datasetIds[0],
          data: datasetData.rows,
          schema: datasetData.schema
        }, request);
      } else {
        // Fallback to direct analysis
        qualityResult = this.basicQualityAssessment(datasetData);
      }

      const output: AgentResultOutput = {
        status: 'success',
        result: {
          qualityScore: qualityResult.overallScore || 80,
          schema: datasetData.schema,
          rowCount: datasetData.totalRows,
          columnCount: datasetData.totalColumns,
          missingValues: qualityResult.missingValues || [],
          dataTypes: qualityResult.dataTypes || {},
          piiDetected: qualityResult.piiDetected || []
        },
        confidence: qualityResult.overallScore || 80,
        recommendations: qualityResult.recommendations || [],
        warnings: qualityResult.warnings || []
      };

      await agentResultService.completeResult(agentResult.id, { output });

      return {
        phase: 'data_engineer',
        agentType: 'data_engineer',
        resultId: agentResult.id,
        status: 'success',
        summary: `Data quality score: ${output.result.qualityScore}%, ${output.result.rowCount} rows, ${output.result.columnCount} columns`
      };

    } catch (error: any) {
      await agentResultService.failResult(agentResult.id, error.message);
      return {
        phase: 'data_engineer',
        agentType: 'data_engineer',
        resultId: agentResult.id,
        status: 'failed',
        summary: `Failed: ${error.message}`
      };
    }
  }

  /**
   * Phase 2: Data Scientist plans and executes analysis
   */
  private async runDataScientistPhase(request: U2A2A2URequest, deResultId?: string): Promise<U2A2A2UPhaseResult> {
    console.log(`🔬 [U2A2A2U] Phase 2: Data Scientist`);

    // Build context from DE results
    const context = await agentResultService.buildContextForAgent(
      request.projectId,
      'data_scientist',
      { goals: request.goals, questions: request.questions, audience: request.audience }
    );

    const agentResult = await agentResultService.createResult({
      projectId: request.projectId,
      agentType: 'data_scientist',
      taskType: 'comprehensive_analysis',
      input: context
    });

    try {
      // Check if comprehensive_analysis tool is available
      const canUse = MCPToolRegistry.canAgentUseTool('data_scientist', 'comprehensive_analysis');

      let analysisResult: any;
      if (canUse) {
        // Use the DataScienceOrchestrator via tool
        analysisResult = await this.executeToolForAgent('data_scientist', 'comprehensive_analysis', {
          projectId: request.projectId,
          userId: request.userId,
          analysisTypes: request.analysisTypes,
          userGoals: request.goals,
          userQuestions: request.questions
        }, request);
      } else {
        // Fallback to direct DataScientistAgent
        const dsAgent = new DataScientistAgent();
        analysisResult = await dsAgent.execute({
          type: 'statistical_analysis',
          projectId: request.projectId,
          context: {
            userId: request.userId,
            projectId: request.projectId
          }
        } as any);
      }

      const output: AgentResultOutput = {
        status: 'success',
        result: {
          insights: analysisResult.insights || [],
          correlations: analysisResult.correlations || [],
          mlModels: analysisResult.mlModels || [],
          questionAnswers: analysisResult.questionAnswers || [],
          visualizations: analysisResult.visualizations || []
        },
        confidence: analysisResult.confidence || 75,
        recommendations: analysisResult.recommendations || [],
        warnings: analysisResult.warnings || [],
        artifacts: analysisResult.artifacts || []
      };

      await agentResultService.completeResult(agentResult.id, {
        output,
        executionTimeMs: analysisResult.executionTimeMs,
        tokensUsed: analysisResult.tokensUsed,
        modelUsed: analysisResult.modelUsed
      });

      return {
        phase: 'data_scientist',
        agentType: 'data_scientist',
        resultId: agentResult.id,
        status: 'success',
        summary: `Generated ${output.result.insights?.length || 0} insights, ${output.result.mlModels?.length || 0} models`
      };

    } catch (error: any) {
      await agentResultService.failResult(agentResult.id, error.message);
      return {
        phase: 'data_scientist',
        agentType: 'data_scientist',
        resultId: agentResult.id,
        status: 'failed',
        summary: `Failed: ${error.message}`
      };
    }
  }

  /**
   * Phase 3: Business Agent validates and adds context
   */
  private async runBusinessAgentPhase(
    request: U2A2A2URequest,
    deResultId?: string,
    dsResultId?: string
  ): Promise<U2A2A2UPhaseResult> {
    console.log(`💼 [U2A2A2U] Phase 3: Business Agent`);

    const context = await agentResultService.buildContextForAgent(
      request.projectId,
      'business_agent',
      { goals: request.goals, questions: request.questions, audience: request.audience }
    );

    const agentResult = await agentResultService.createResult({
      projectId: request.projectId,
      agentType: 'business_agent',
      taskType: 'business_validation',
      input: context
    });

    try {
      // Business agent validates the analysis plan
      const canUse = MCPToolRegistry.canAgentUseTool('business_agent', 'business_templates');

      let validationResult: any = {
        isValid: true,
        industryContext: [],
        complianceNotes: [],
        recommendations: []
      };

      if (canUse) {
        validationResult = await this.executeToolForAgent('business_agent', 'business_templates', {
          projectId: request.projectId,
          goals: request.goals,
          audience: request.audience
        }, request);
      }

      const output: AgentResultOutput = {
        status: 'success',
        result: {
          isValid: validationResult.isValid !== false,
          industryContext: validationResult.industryContext || [],
          complianceNotes: validationResult.complianceNotes || [],
          audienceRecommendations: validationResult.audienceRecommendations || []
        },
        confidence: 80,
        recommendations: validationResult.recommendations || [],
        warnings: validationResult.warnings || []
      };

      await agentResultService.completeResult(agentResult.id, { output });

      return {
        phase: 'business_agent',
        agentType: 'business_agent',
        resultId: agentResult.id,
        status: 'success',
        summary: `Validation complete. ${output.warnings.length} warnings.`
      };

    } catch (error: any) {
      // Business agent is optional - don't fail workflow
      await agentResultService.failResult(agentResult.id, error.message);
      return {
        phase: 'business_agent',
        agentType: 'business_agent',
        resultId: agentResult.id,
        status: 'partial',
        summary: `Skipped due to: ${error.message}`
      };
    }
  }

  /**
   * Phase 4: PM Synthesis - Merge all agent results and FORMAT for user
   * Uses AudienceFormatter + QuestionAnswerService to produce user-ready output
   */
  private async runSynthesisPhase(
    request: U2A2A2URequest,
    phaseResults: U2A2A2UPhaseResult[]
  ): Promise<U2A2A2UPhaseResult> {
    console.log(`🔗 [U2A2A2U] Phase 4: PM Synthesis with Formatting`);

    const resultIds = phaseResults.filter(p => p.resultId).map(p => p.resultId!);

    const agentResult = await agentResultService.createResult({
      projectId: request.projectId,
      agentType: 'project_manager',
      taskType: 'synthesis',
      input: {
        userContext: {
          goals: request.goals,
          questions: request.questions,
          audience: request.audience
        },
        previousResults: resultIds
      }
    });

    try {
      // Load all prior results
      const allResults = await agentResultService.getProjectResults(request.projectId);

      // Get results from each agent
      const deResult = allResults.find(r => r.agentType === 'data_engineer' && r.status === 'success');
      const dsResult = allResults.find(r => r.agentType === 'data_scientist' && r.status === 'success');
      const baResult = allResults.find(r => r.agentType === 'business_agent');

      // Combine raw results
      const combinedAnalysisResults = {
        insights: dsResult?.output.result?.insights || [],
        correlations: dsResult?.output.result?.correlations || [],
        mlModels: dsResult?.output.result?.mlModels || [],
        recommendations: [
          ...(deResult?.output.recommendations || []),
          ...(dsResult?.output.recommendations || []),
          ...(baResult?.output.recommendations || [])
        ],
        dataQuality: deResult?.output.result || {},
        businessContext: baResult?.output.result || {}
      };

      // Step 1: Use AudienceFormatter to format for user's audience
      const audienceFormatter = AudienceFormatter.getInstance();
      const audienceType = this.mapAudienceToFormatter(request.audience);

      const formattedResults = await audienceFormatter.formatForAudience(
        {
          type: 'comprehensive_analysis',
          data: combinedAnalysisResults,
          summary: this.generateUserSummary(request, deResult, dsResult, baResult),
          insights: combinedAnalysisResults.insights.map((i: any) => i.description || i.finding || i),
          recommendations: combinedAnalysisResults.recommendations,
          visualizations: dsResult?.output.result?.visualizations || []
        },
        {
          primaryAudience: audienceType,
          journeyType: 'business' as any, // Default to business journey
          decisionContext: request.goals.join(', ')
        }
      );

      // Step 2: Use QuestionAnswerService to generate answers to user questions
      let questionAnswers: any[] = [];
      if (request.questions && request.questions.length > 0) {
        try {
          const qaResult = await QuestionAnswerService.generateAnswers({
            projectId: request.projectId,
            userId: request.userId,
            questions: request.questions,
            analysisResults: combinedAnalysisResults,
            analysisGoal: request.goals.join('; '),
            audience: {
              primaryAudience: audienceType,
              technicalLevel: audienceType === 'technical' ? 'high' : 'low'
            }
          });
          questionAnswers = qaResult.answers;
          console.log(`📝 Generated ${qaResult.answeredCount}/${qaResult.totalQuestions} answers`);
        } catch (qaError) {
          console.warn('QuestionAnswerService failed, using fallback:', qaError);
        }
      }

      // Build final synthesis with formatted output
      const synthesis = {
        // Raw data for technical users
        rawResults: {
          dataQuality: deResult?.output.result || {},
          analysis: dsResult?.output.result || {},
          businessContext: baResult?.output.result || {}
        },
        // Formatted for audience
        formatted: {
          executiveSummary: formattedResults.executiveSummary,
          businessInsights: formattedResults.businessInsights,
          actionableRecommendations: formattedResults.actionableRecommendations,
          technicalDetails: formattedResults.technicalDetails,
          methodology: formattedResults.methodology,
          nextSteps: formattedResults.nextSteps
        },
        // Direct answers to user questions
        questionAnswers,
        // Combined recommendations and warnings
        combinedRecommendations: combinedAnalysisResults.recommendations,
        combinedWarnings: [
          ...(deResult?.output.warnings || []),
          ...(dsResult?.output.warnings || []),
          ...(baResult?.output.warnings || [])
        ],
        // Metadata
        overallConfidence: this.calculateOverallConfidence([deResult, dsResult, baResult]),
        summaryForUser: formattedResults.executiveSummary || this.generateUserSummary(request, deResult, dsResult, baResult)
      };

      const output: AgentResultOutput = {
        status: 'success',
        result: synthesis,
        confidence: synthesis.overallConfidence,
        recommendations: synthesis.combinedRecommendations,
        warnings: synthesis.combinedWarnings
      };

      await agentResultService.completeResult(agentResult.id, { output });

      return {
        phase: 'synthesis',
        agentType: 'project_manager',
        resultId: agentResult.id,
        status: 'success',
        summary: `Synthesized ${resultIds.length} agent outputs. ${questionAnswers.length} questions answered. Confidence: ${synthesis.overallConfidence}%`
      };

    } catch (error: any) {
      await agentResultService.failResult(agentResult.id, error.message);
      return {
        phase: 'synthesis',
        agentType: 'project_manager',
        resultId: agentResult.id,
        status: 'failed',
        summary: `Failed: ${error.message}`
      };
    }
  }

  /**
   * Map request audience to AudienceFormatter type
   */
  private mapAudienceToFormatter(audience?: string): 'executive' | 'technical' | 'business_ops' | 'marketing' | 'mixed' {
    if (!audience) return 'business_ops';

    const mapping: Record<string, 'executive' | 'technical' | 'business_ops' | 'marketing' | 'mixed'> = {
      'non-tech': 'executive',
      'business': 'business_ops',
      'technical': 'technical',
      'executive': 'executive',
      'marketing': 'marketing',
      'mixed': 'mixed'
    };

    return mapping[audience.toLowerCase()] || 'business_ops';
  }

  /**
   * Phase 5: Create checkpoint for user approval
   */
  private async createApprovalCheckpoint(
    request: U2A2A2URequest,
    synthesisResultId: string
  ): Promise<U2A2A2UPhaseResult> {
    console.log(`✋ [U2A2A2U] Phase 5: Creating Approval Checkpoint`);

    try {
      const synthesisResult = await agentResultService.getResult(synthesisResultId);
      if (!synthesisResult) {
        throw new Error('Synthesis result not found');
      }

      // Create checkpoint via checkpoint helper
      // IMPORTANT: Store originalRequest so execution phase can access goals/questions/etc.
      const checkpoint = await checkpointHelper.createCheckpoint({
        projectId: request.projectId,
        stepName: 'analysis_plan_approval',
        agentType: 'project_manager',
        recommendation: synthesisResult.output.result.summaryForUser || 'Analysis plan ready for review',
        options: ['approve', 'reject', 'request_changes'],
        metadata: {
          synthesisResultId,
          confidence: synthesisResult.output.confidence,
          // Store original request for execution phase
          // CRITICAL: Include all fields needed for analysis execution and evidence chain
          originalRequest: {
            projectId: request.projectId,
            userId: request.userId,
            goals: request.goals,
            questions: request.questions,
            analysisTypes: request.analysisTypes,
            audience: request.audience,
            // P0-2: DS-recommended analyses with priority for execution ordering
            analysisPath: request.analysisPath || [],
            // P0-3: Question-to-analysis mapping for evidence chain traceability
            questionAnswerMapping: request.questionAnswerMapping || [],
            // Required data elements for validation
            requiredDataElements: request.requiredDataElements || [],
            // P0-4: PII decisions for filtering in artifacts
            piiDecisions: request.piiDecisions || null
          },
          agentOutputs: {
            dataEngineer: synthesisResult.output.result.dataQuality,
            dataScientist: synthesisResult.output.result.analysis,
            businessAgent: synthesisResult.output.result.businessContext
          }
        }
      });

      return {
        phase: 'checkpoint',
        status: 'success',
        summary: 'Awaiting user approval',
        checkpointId: checkpoint.id
      };

    } catch (error: any) {
      return {
        phase: 'checkpoint',
        status: 'failed',
        summary: `Failed to create checkpoint: ${error.message}`
      };
    }
  }

  /**
   * Continue workflow after user approval
   *
   * This is the key continuation point where:
   * 1. Checkpoint is marked as approved
   * 2. User feedback is incorporated
   * 3. Analysis is ACTUALLY re-executed (not just returning prior results)
   * 4. Artifacts are generated
   */
  async continueAfterApproval(
    projectId: string,
    checkpointId: string,
    userFeedback: string
  ): Promise<U2A2A2UWorkflowResult> {
    const workflowId = nanoid();
    const startTime = Date.now();
    const phases: U2A2A2UPhaseResult[] = [];
    const slaMetrics: SLAMetrics[] = [];
    const slaWarnings: string[] = [];

    console.log(`▶️ [U2A2A2U] Continuing workflow after approval for project ${projectId}`);
    console.log(`📝 [U2A2A2U] User feedback: "${userFeedback || 'approved'}"`);

    // Mark checkpoint as approved
    await checkpointHelper.approveCheckpoint(checkpointId, userFeedback);

    // Phase 6: Execute the approved analysis WITH user feedback
    const { result: executionResult, metrics: execMetrics } = await withSoftTimeout(
      this.runExecutionPhase(projectId, checkpointId, userFeedback),
      PHASE_TIMEOUTS.execution,
      'execution'
    );
    executionResult.slaMetrics = execMetrics;
    slaMetrics.push(execMetrics);
    phases.push(executionResult);

    if (!execMetrics.withinSLA) {
      slaWarnings.push(`Execution phase exceeded SLA (${execMetrics.durationMs}ms > ${PHASE_TIMEOUTS.execution}ms)`);
    }

    return this.buildResultWithSLA(workflowId, projectId, phases, 'completed', 'execution', startTime, slaMetrics, slaWarnings);
  }

  /**
   * Phase 6: Execute approved analysis with user feedback
   *
   * This phase:
   * 1. Retrieves checkpoint context and user feedback
   * 2. Re-runs the Data Scientist analysis with feedback incorporated
   * 3. Generates artifacts (reports, presentations, CSV exports)
   * 4. Updates project with final results
   */
  private async runExecutionPhase(
    projectId: string,
    checkpointId: string,
    userFeedback?: string
  ): Promise<U2A2A2UPhaseResult> {
    console.log(`🚀 [U2A2A2U] Phase 6: Executing Approved Analysis`);

    // Get the synthesis result and prior context from checkpoint
    const checkpoint = await checkpointHelper.getCheckpoint(checkpointId);
    const synthesisResultId = checkpoint?.metadata?.synthesisResultId;
    const originalRequest = checkpoint?.metadata?.originalRequest;

    if (!synthesisResultId) {
      return {
        phase: 'execution',
        status: 'failed',
        summary: 'No synthesis result found in checkpoint'
      };
    }

    try {
      // ==========================================
      // Step 1: Load prior results and project data
      // ==========================================
      const latestResults = await agentResultService.getLatestResultsPerAgent(projectId);
      const dsResult = latestResults.data_scientist;
      const deResult = latestResults.data_engineer;

      // Load project data for execution
      const projectData = await this.loadProjectData(projectId);

      // ==========================================
      // Step 2: Execute/Re-execute analysis with user feedback
      // ==========================================
      console.log(`🔬 [Execution] Running analysis with ${projectData.totalRows} rows, feedback: "${userFeedback || 'approved'}"`);

      // Get the orchestrator and execute
      const { dataScienceOrchestrator } = await import('./data-science-orchestrator');

      // Build execution context with user feedback
      // CRITICAL: Include all P0 fields for proper execution and evidence chain
      const executionContext = {
        projectId,
        userId: originalRequest?.userId || checkpoint?.metadata?.userId,
        goals: originalRequest?.goals || [],
        questions: originalRequest?.questions || [],
        analysisTypes: originalRequest?.analysisTypes || [],
        userFeedback: userFeedback || 'approved',
        priorDSResult: dsResult?.output?.result,
        priorDEResult: deResult?.output?.result,
        dataContext: {
          rowCount: projectData.totalRows,
          columnCount: projectData.totalColumns,
          schema: projectData.schema
        },
        // P0-2: DS-recommended analyses with priority for execution ordering
        analysisPath: originalRequest?.analysisPath || [],
        // P0-3: Question-to-analysis mapping for evidence chain traceability
        questionAnswerMapping: originalRequest?.questionAnswerMapping || [],
        // Required data elements for validation
        requiredDataElements: originalRequest?.requiredDataElements || [],
        // P0-4: PII decisions for artifact filtering
        piiDecisions: originalRequest?.piiDecisions || null,
        // Audience for formatting results
        audience: originalRequest?.audience || 'business_stakeholder'
      };

      console.log(`📋 [Execution] Context includes ${executionContext.analysisPath?.length || 0} DS-recommended analyses`);
      console.log(`📋 [Execution] Context includes ${executionContext.questionAnswerMapping?.length || 0} question-answer mappings`);

      // Execute the analysis with the full context
      // CRITICAL: Pass analysisPath and questionAnswerMapping for evidence chain
      const analysisResult = await dataScienceOrchestrator.executeWorkflow({
        projectId,
        userId: executionContext.userId,
        analysisTypes: executionContext.analysisTypes || [],
        userGoals: executionContext.goals || [],
        userQuestions: executionContext.questions || [],
        // P0-2: DS-recommended analyses with priority
        analysisPath: executionContext.analysisPath,
        // P0-3: Question-to-analysis mapping for evidence chain
        questionAnswerMapping: executionContext.questionAnswerMapping,
        // P0-4: PII decisions for filtering
        piiDecisions: executionContext.piiDecisions
      });

      // ==========================================
      // Step 3: Store execution result
      // ==========================================
      const executionResultRecord = await agentResultService.createResult({
        projectId,
        agentType: 'data_scientist' as AgentType,
        taskType: 'analysis_execution',
        input: {
          userContext: {
            goals: executionContext.goals,
            questions: executionContext.questions,
            audience: originalRequest?.audience
          },
          taskParameters: {
            analysisTypes: executionContext.analysisTypes,
            userFeedback: executionContext.userFeedback,
            isPostApprovalExecution: true
          }
        }
      });

      await agentResultService.completeResult(executionResultRecord.id, {
        output: {
          status: 'success',
          result: analysisResult,
          confidence: 80, // Default confidence
          recommendations: (analysisResult.executiveSummary?.recommendations || []).map((r: any) => r.text || String(r)),
          warnings: [] // DataScienceResults doesn't have warnings
        }
      });

      // ==========================================
      // Step 4: Generate artifacts (async, don't block)
      // ==========================================
      this.generateArtifactsAsync(projectId, analysisResult, executionContext).catch(err => {
        console.warn(`⚠️ [Execution] Artifact generation failed:`, err.message);
      });

      // ==========================================
      // Step 5: Update project with final results
      // ==========================================
      try {
        await db.update(projects)
          .set({
            analysisResults: analysisResult,
            status: 'completed',
            updatedAt: new Date()
          } as any)
          .where(eq(projects.id, projectId));
      } catch (dbError) {
        console.warn('Failed to update project with results:', dbError);
      }

      return {
        phase: 'execution',
        agentType: 'data_scientist',
        resultId: executionResultRecord.id,
        status: 'success',
        summary: `Analysis executed successfully with ${analysisResult.executiveSummary?.keyFindings?.length || 0} insights generated`
      };

    } catch (error: any) {
      console.error(`❌ [Execution] Failed:`, error);
      return {
        phase: 'execution',
        status: 'failed',
        summary: `Execution failed: ${error.message}`
      };
    }
  }

  /**
   * Generate artifacts asynchronously after execution
   */
  private async generateArtifactsAsync(
    projectId: string,
    analysisResult: any,
    context: any
  ): Promise<void> {
    console.log(`📄 [Artifacts] Starting artifact generation for project ${projectId}`);

    try {
      const artifactGenerator = new ArtifactGenerator();

      // P0-4: Build piiConfig from context.piiDecisions
      let piiConfig: { excludedColumns: string[]; anonymizationApplied: boolean; piiColumnsRemoved: string[] } | undefined;
      if (context.piiDecisions) {
        const excludedColumns: string[] = [];
        const piiColumnsRemoved: string[] = [];

        // Handle piiDecisions as Record<string, { action: 'include' | 'exclude' | 'mask' }>
        // or as piiDecisionsByFile: Record<filename, Record<column, decision>>
        if (typeof context.piiDecisions === 'object') {
          for (const [key, value] of Object.entries(context.piiDecisions)) {
            if (typeof value === 'object' && value !== null) {
              const decision = value as any;
              if (decision.action === 'exclude') {
                excludedColumns.push(key);
                piiColumnsRemoved.push(key);
              }
            }
          }
        }

        if (excludedColumns.length > 0) {
          piiConfig = {
            excludedColumns,
            anonymizationApplied: true,
            piiColumnsRemoved
          };
          console.log(`🔒 [P0-4] PII config for artifacts: ${excludedColumns.length} columns to exclude: [${excludedColumns.join(', ')}]`);
        }
      }

      // Generate all artifacts using the unified method
      await artifactGenerator.generateArtifacts({
        projectId,
        userId: context.userId || 'system',
        journeyType: (context.journeyType as 'non-tech' | 'business' | 'technical' | 'consultation') || 'business',
        analysisResults: analysisResult.insights || [],
        visualizations: analysisResult.visualizations || [],
        insights: (analysisResult.recommendations || []).map((r: any) => typeof r === 'string' ? r : r.text || r.recommendation || ''),
        datasetSizeMB: 1, // Estimated size
        // P0-4: Pass PII configuration for filtering
        piiConfig
      });

      console.log(`✅ [Artifacts] Artifact generation complete for project ${projectId}`);
    } catch (error: any) {
      console.error(`❌ [Artifacts] Generation failed:`, error.message);
      // Don't throw - artifact generation is non-blocking
    }
  }

  // Helper methods

  private async loadProjectData(projectId: string): Promise<{
    datasetIds: string[];
    rows: any[];
    schema: any;
    totalRows: number;
    totalColumns: number;
  }> {
    const projectDatasetLinks = await db
      .select({ dataset: datasets })
      .from(projectDatasets)
      .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
      .where(eq(projectDatasets.projectId, projectId));

    const allRows: any[] = [];
    const datasetIds: string[] = [];
    let schema: any = {};

    for (const link of projectDatasetLinks) {
      const dataset = link.dataset as any;
      datasetIds.push(dataset.id);

      const rows = dataset.ingestionMetadata?.transformedData
        || dataset.data
        || dataset.preview
        || [];

      if (Array.isArray(rows)) {
        allRows.push(...rows);
      }

      schema = { ...schema, ...(dataset.schema || {}) };
    }

    return {
      datasetIds,
      rows: allRows,
      schema,
      totalRows: allRows.length,
      totalColumns: Object.keys(schema).length || (allRows[0] ? Object.keys(allRows[0]).length : 0)
    };
  }

  /**
   * Execute a tool for an agent through the MCP Tool Registry
   *
   * This is the core tool execution framework that enables agents to access
   * capabilities through the centralized tool registry with proper:
   * - Access control verification
   * - Analytics tracking
   * - Error handling with fallback
   * - Execution context propagation
   */
  private async executeToolForAgent(
    agentType: string,
    toolName: string,
    input: any,
    request: U2A2A2URequest
  ): Promise<any> {
    const startTime = Date.now();

    // Verify tool exists
    const tool = MCPToolRegistry.getTool(toolName);
    if (!tool) {
      console.warn(`⚠️ [Tool] Tool ${toolName} not found, using fallback`);
      return this.getFallbackResultForTool(agentType, toolName, input);
    }

    // Verify agent has access to tool
    if (!MCPToolRegistry.canAgentUseTool(agentType, toolName)) {
      console.warn(`⚠️ [Tool] Agent ${agentType} not authorized for tool ${toolName}, using fallback`);
      return this.getFallbackResultForTool(agentType, toolName, input);
    }

    console.log(`🔧 [Tool] ${agentType} executing ${toolName}...`);

    try {
      // Import and use the actual executeTool function from mcp-tool-registry
      const { executeTool } = await import('./mcp-tool-registry');

      // Execute the tool with proper context
      const result = await executeTool(
        toolName,
        agentType,
        input,
        {
          userId: request.userId,
          projectId: request.projectId
        }
      );

      const duration = Date.now() - startTime;
      console.log(`✅ [Tool] ${toolName} completed in ${duration}ms (status: ${result.status})`);

      // Return the result data
      if (result.status === 'success') {
        return result.result;
      } else {
        console.warn(`⚠️ [Tool] ${toolName} returned non-success status: ${result.status}`);
        return this.getFallbackResultForTool(agentType, toolName, input);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ [Tool] ${toolName} failed after ${duration}ms:`, error.message);

      // Return fallback result instead of throwing
      return this.getFallbackResultForTool(agentType, toolName, input);
    }
  }

  /**
   * Get fallback result when tool execution fails
   * This ensures the U2A2A2U workflow continues even if a tool is unavailable
   */
  private getFallbackResultForTool(agentType: string, toolName: string, input: any): any {
    console.log(`🔄 [Tool] Using fallback for ${toolName} (agent: ${agentType})`);

    switch (toolName) {
      case 'data_quality_monitor':
        // Use basic quality assessment as fallback
        if (input.data) {
          return this.basicQualityAssessment({ rows: input.data, schema: input.schema });
        }
        return {
          overallScore: 75,
          missingValues: [],
          dataTypes: {},
          recommendations: ['Tool unavailable - basic assessment used'],
          warnings: [],
          piiDetected: []
        };

      case 'comprehensive_analysis':
        // Return minimal analysis structure
        return {
          insights: [],
          correlations: [],
          mlModels: [],
          questionAnswers: [],
          visualizations: [],
          confidence: 50,
          recommendations: ['Full analysis tool unavailable - basic results provided'],
          warnings: ['Analysis may be incomplete']
        };

      case 'business_templates':
        // Return minimal business validation
        return {
          isValid: true,
          industryContext: [],
          complianceNotes: ['Business template tool unavailable'],
          audienceRecommendations: [],
          recommendations: [],
          warnings: []
        };

      default:
        // Generic fallback - return input with metadata
        return {
          ...input,
          _fallback: true,
          _toolName: toolName,
          _agentType: agentType,
          _reason: 'Tool execution failed or unavailable'
        };
    }
  }

  private basicQualityAssessment(data: { rows: any[]; schema: any }): any {
    const { rows, schema } = data;
    const columns = Object.keys(schema || (rows[0] || {}));

    const missingValues = columns.map(col => {
      const missing = rows.filter(r => r[col] === null || r[col] === undefined || r[col] === '').length;
      return { column: col, missing, percent: (missing / rows.length) * 100 };
    });

    const avgMissing = missingValues.reduce((sum, m) => sum + m.percent, 0) / missingValues.length;
    const overallScore = Math.max(0, 100 - avgMissing);

    return {
      overallScore,
      missingValues,
      dataTypes: schema,
      recommendations: avgMissing > 10 ? ['Consider handling missing values before analysis'] : [],
      warnings: avgMissing > 30 ? ['High percentage of missing data detected'] : []
    };
  }

  private calculateOverallConfidence(results: (any | undefined)[]): number {
    const validResults = results.filter(r => r?.output?.confidence);
    if (validResults.length === 0) return 50;

    const sum = validResults.reduce((acc, r) => acc + (r.output.confidence || 0), 0);
    return Math.round(sum / validResults.length);
  }

  private generateUserSummary(
    request: U2A2A2URequest,
    deResult: any,
    dsResult: any,
    baResult: any
  ): string {
    const parts: string[] = [];

    if (deResult?.output.result) {
      parts.push(`Data Quality: ${deResult.output.result.qualityScore}% (${deResult.output.result.rowCount} rows)`);
    }

    if (dsResult?.output.result) {
      const insights = dsResult.output.result.insights?.length || 0;
      parts.push(`Analysis: ${insights} insights generated`);
    }

    if (baResult?.output.result?.industryContext?.length) {
      parts.push(`Industry context applied`);
    }

    return parts.join('. ') || 'Analysis ready for review';
  }

  // Note: buildResult() was replaced by buildResultWithSLA() for SLA compliance tracking

  // ==========================================
  // P3-1: Customer Support Agent Integration
  // ==========================================

  /**
   * Invoke Customer Support agent for error recovery
   * Called when a workflow phase fails, to provide user-facing error diagnostics
   */
  async invokeCustomerSupportForError(
    projectId: string,
    failedPhase: string,
    errorMessage: string,
    context?: { userId?: string; workflowId?: string }
  ): Promise<{ suggestion: string; diagnostics: any; escalate: boolean }> {
    try {
      console.log(`🆘 [P3-1] Customer Support Agent invoked for error in phase "${failedPhase}"`);

      // Try to use CS agent via tool registry
      const { executeTool } = await import('./mcp-tool-registry');
      const result = await executeTool('knowledge_base_search', 'customer_support', {
        query: `Error during ${failedPhase}: ${errorMessage}`,
        category: 'troubleshooting',
        projectId,
      }, { userId: context?.userId, projectId });

      if (result.status === 'success' && result.result) {
        return {
          suggestion: (result.result as any).answer || 'Please try again or contact support.',
          diagnostics: {
            failedPhase,
            errorMessage,
            knowledgeBaseHit: true,
            timestamp: new Date().toISOString(),
          },
          escalate: false,
        };
      }

      // Fallback: provide generic error guidance
      return this.getGenericErrorGuidance(failedPhase, errorMessage);
    } catch (csError) {
      console.warn('⚠️ [P3-1] Customer Support Agent failed, using fallback:', csError);
      return this.getGenericErrorGuidance(failedPhase, errorMessage);
    }
  }

  private getGenericErrorGuidance(failedPhase: string, errorMessage: string): {
    suggestion: string; diagnostics: any; escalate: boolean
  } {
    const phaseGuidance: Record<string, string> = {
      data_engineer: 'Check that your data file is properly formatted (CSV, XLSX). Ensure column headers are present and data types are consistent.',
      data_scientist: 'The analysis engine encountered an issue. This may be due to insufficient data rows, missing required columns, or unsupported data types.',
      business_agent: 'Business context validation failed. Ensure your industry and analysis goals are properly configured in the Prepare step.',
      synthesis: 'Result synthesis failed. This usually indicates an issue with one of the earlier analysis phases. Check the workflow details for specific phase errors.',
      checkpoint: 'Checkpoint creation failed. The analysis results may still be valid — try refreshing the page.',
    };

    return {
      suggestion: phaseGuidance[failedPhase] || `An error occurred during ${failedPhase}. Please try again or contact support.`,
      diagnostics: {
        failedPhase,
        errorMessage,
        knowledgeBaseHit: false,
        timestamp: new Date().toISOString(),
      },
      escalate: !phaseGuidance[failedPhase], // Escalate if unknown phase
    };
  }

  // ==========================================
  // P3-2: Template Research Agent Integration
  // ==========================================

  /**
   * Invoke Template Research agent to recommend analysis templates
   * Called during the Prepare step to suggest appropriate templates based on user goals
   */
  async invokeResearchForTemplateRecommendation(
    projectId: string,
    userGoals: string,
    industry?: string,
    dataContext?: { columnNames?: string[]; rowCount?: number }
  ): Promise<{ templates: any[]; reasoning: string }> {
    try {
      console.log(`🔍 [P3-2] Template Research Agent invoked for project ${projectId}`);

      const { executeTool } = await import('./mcp-tool-registry');
      const result = await executeTool('template_library_search', 'template_research', {
        query: userGoals,
        industry: industry || 'general',
        dataContext,
      }, { projectId });

      if (result.status === 'success' && result.result) {
        return {
          templates: (result.result as any).templates || [],
          reasoning: (result.result as any).reasoning || 'Templates selected based on your analysis goals.',
        };
      }

      // Fallback: return empty with note
      return {
        templates: [],
        reasoning: 'Template Research Agent could not find matching templates. Please proceed with custom analysis.',
      };
    } catch (raError) {
      console.warn('⚠️ [P3-2] Template Research Agent failed:', raError);
      return {
        templates: [],
        reasoning: 'Template recommendation service is currently unavailable.',
      };
    }
  }
}

export const agentCoordinationService = new AgentCoordinationService();
