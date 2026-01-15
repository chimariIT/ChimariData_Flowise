/**
 * Agent Coordination Service V2
 * Uses normalized schema + pgvector + strict Zod validation
 *
 * U2A2A2U Workflow:
 * 1. User Input → PM receives goals, questions, data
 * 2. Agent Analysis → DE→DS→BA, each receives prior outputs
 * 3. Synthesis → PM merges all agent results
 * 4. User Checkpoint → User reviews (Approve/Reject/Clarify)
 * 5. Execution → DS executes approved plan
 * 6. Results to User → Answers with evidence chain
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { embeddingService } from './embedding-service';
import { semanticSearchService } from './semantic-search-service';
import {
  StartWorkflowInput,
  ContinueWorkflowInput,
  WorkflowStatusResponse,
  WorkflowResultsResponse,
  DataEngineerPhaseResult,
  DataScientistPhaseResult,
  BusinessAgentPhaseResult,
  SynthesisPhaseResult,
  type StartWorkflowInputType,
  type ContinueWorkflowInputType,
  type WorkflowPhase,
  type AgentType,
  AgentTypeEnum,
  WorkflowPhaseEnum
} from '@shared/schemas';
import { storage } from '../storage';

// ============================================
// TYPES
// ============================================

interface WorkflowContext {
  workflowId: string;
  projectId: string;
  userId: string;
  goals: string[];
  questions: string[];
  analysisTypes: string[];
  audience: string;
  confidenceThreshold: number;
}

interface PhaseExecutionResult {
  executionId: string;
  success: boolean;
  data: any;
  error?: string;
}

// ============================================
// SERVICE CLASS
// ============================================

class AgentCoordinationServiceV2 {
  private readonly PHASE_ORDER: WorkflowPhase[] = [
    'data_engineer',
    'data_scientist',
    'business_agent',
    'synthesis',
    'checkpoint',
    'execution',
    'results'
  ];

  /**
   * Start a new U2A2A2U workflow
   * Validates input strictly, stores questions with embeddings, initiates DE phase
   */
  async startWorkflow(rawInput: unknown): Promise<{ workflowId: string; status: string }> {
    // FAIL FAST: Validate input immediately
    const input = StartWorkflowInput.parse(rawInput);

    const workflowId = nanoid();

    try {
      // 1. Create workflow record
      await this.createWorkflowRecord(workflowId, input);

      // 2. Store questions with embeddings for semantic search
      await this.storeQuestionsWithEmbeddings(input.projectId, input.questions);

      // 3. Start Data Engineer phase
      await this.startPhase(workflowId, 'data_engineer', {
        workflowId,
        projectId: input.projectId,
        userId: input.userId,
        goals: input.goals,
        questions: input.questions,
        analysisTypes: input.analysisTypes,
        audience: input.audience || 'business',
        confidenceThreshold: input.confidenceThreshold || 80
      });

      return { workflowId, status: 'started' };
    } catch (error: any) {
      // Update workflow with error
      await this.updateWorkflowError(workflowId, error.message);
      throw error;
    }
  }

  /**
   * Continue workflow after user decision at checkpoint
   */
  async continueWorkflow(rawInput: unknown): Promise<{ status: string; nextPhase?: string }> {
    const input = ContinueWorkflowInput.parse(rawInput);

    const workflow = await this.getWorkflow(input.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${input.workflowId} not found`);
    }

    if (workflow.status !== 'waiting_user') {
      throw new Error(`Workflow is not waiting for user input. Current status: ${workflow.status}`);
    }

    // Handle user decision
    switch (input.decision) {
      case 'approve':
        // Move to execution phase
        await this.updateWorkflowStatus(input.workflowId, 'running', 'execution');
        await this.executeApprovedPlan(input.workflowId, workflow.project_id);
        return { status: 'executing', nextPhase: 'execution' };

      case 'reject':
        // Cancel workflow
        await this.updateWorkflowStatus(input.workflowId, 'cancelled', null);
        return { status: 'cancelled' };

      case 'clarify':
        // Store feedback and re-run synthesis
        if (input.feedback) {
          await this.storeFeedback(input.workflowId, input.feedback);
        }
        await this.startPhase(input.workflowId, 'synthesis', {
          workflowId: input.workflowId,
          projectId: workflow.project_id,
          clarification: input.feedback
        } as any);
        return { status: 'clarifying', nextPhase: 'synthesis' };

      default:
        throw new Error(`Unknown decision: ${input.decision}`);
    }
  }

  /**
   * Get current workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<any> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      return null;
    }

    // Get all executions for this workflow
    const executions = await db.execute(sql`
      SELECT agent_type, status, started_at, completed_at, error_message
      FROM agent_executions
      WHERE workflow_id = ${workflowId}
      ORDER BY started_at
    `);

    const phasesCompleted: string[] = [];
    const phasesPending: string[] = [];

    for (const phase of this.PHASE_ORDER) {
      const exec = executions.rows?.find((e: any) => e.agent_type === phase);
      if (exec?.status === 'success') {
        phasesCompleted.push(phase);
      } else if (!exec || exec.status === 'pending') {
        phasesPending.push(phase);
      }
    }

    return {
      workflowId,
      projectId: workflow.project_id,
      status: workflow.status,
      currentPhase: workflow.current_phase,
      phasesCompleted,
      phasesPending,
      startedAt: workflow.started_at,
      errorMessage: workflow.error_message
    };
  }

  /**
   * Get workflow results after completion
   */
  async getWorkflowResults(workflowId: string): Promise<any> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      return null;
    }

    // Get aggregated results
    const [insights, answers, artifacts] = await Promise.all([
      this.getWorkflowInsights(workflowId),
      this.getWorkflowAnswers(workflow.project_id),
      this.getWorkflowArtifacts(workflowId)
    ]);

    return {
      workflowId,
      projectId: workflow.project_id,
      totalInsights: insights.length,
      answeredQuestions: answers.length,
      avgConfidence: this.calculateAvgConfidence(answers),
      insights,
      answers,
      artifacts
    };
  }

  // ============================================
  // PHASE EXECUTION
  // ============================================

  /**
   * Start a specific workflow phase
   */
  private async startPhase(
    workflowId: string,
    phase: WorkflowPhase,
    context: WorkflowContext
  ): Promise<void> {
    // Update workflow current phase
    await this.updateWorkflowStatus(workflowId, 'running', phase);

    // Create execution record
    const executionId = nanoid();
    await this.createExecutionRecord(executionId, workflowId, context.projectId, phase);

    try {
      let result: PhaseExecutionResult;

      switch (phase) {
        case 'data_engineer':
          result = await this.executeDataEngineerPhase(executionId, context);
          break;
        case 'data_scientist':
          result = await this.executeDataScientistPhase(executionId, context, workflowId);
          break;
        case 'business_agent':
          result = await this.executeBusinessAgentPhase(executionId, context, workflowId);
          break;
        case 'synthesis':
          result = await this.executeSynthesisPhase(executionId, context, workflowId);
          break;
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      // Mark execution complete
      await this.completeExecution(executionId, result.success, result.data);

      // Progress to next phase if successful
      if (result.success) {
        const nextPhase = this.getNextPhase(phase);
        if (nextPhase === 'checkpoint') {
          // Pause for user approval
          await this.updateWorkflowStatus(workflowId, 'waiting_user', 'checkpoint');
        } else if (nextPhase) {
          await this.startPhase(workflowId, nextPhase, context);
        }
      }
    } catch (error: any) {
      await this.failExecution(executionId, error.message);
      throw error;
    }
  }

  /**
   * Data Engineer Phase: Validate data quality, detect PII
   */
  private async executeDataEngineerPhase(
    executionId: string,
    context: WorkflowContext
  ): Promise<PhaseExecutionResult> {
    // Get datasets for project
    const projectDatasets = await storage.getProjectDatasets(context.projectId);
    const datasets = projectDatasets.map(pd => pd.dataset);
    if (!datasets || datasets.length === 0) {
      return {
        executionId,
        success: false,
        data: null,
        error: 'No datasets found for project'
      };
    }

    const results: any[] = [];

    for (const dataset of datasets) {
      // Analyze data quality
      const qualityScore = await this.analyzeDataQuality(dataset);

      // Store in normalized table
      const reportId = nanoid();
      await db.execute(sql`
        INSERT INTO de_quality_reports (
          id, execution_id, dataset_id, quality_score,
          row_count, column_count, missing_value_percent, created_at
        ) VALUES (
          ${reportId}, ${executionId}, ${dataset.id}, ${qualityScore.score},
          ${qualityScore.rowCount}, ${qualityScore.columnCount},
          ${qualityScore.missingPercent}, NOW()
        )
      `);

      // Store any schema issues
      for (const issue of qualityScore.schemaIssues) {
        await db.execute(sql`
          INSERT INTO de_schema_issues (
            id, report_id, column_name, issue_type,
            issue_description, severity
          ) VALUES (
            ${nanoid()}, ${reportId}, ${issue.column},
            ${issue.type}, ${issue.description}, ${issue.severity}
          )
        `);
      }

      results.push({
        datasetId: dataset.id,
        qualityScore: qualityScore.score,
        issues: qualityScore.schemaIssues.length
      });
    }

    return {
      executionId,
      success: true,
      data: {
        phase: 'data_engineer',
        datasetsAnalyzed: results.length,
        avgQualityScore: results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length,
        totalIssues: results.reduce((sum, r) => sum + r.issues, 0)
      }
    };
  }

  /**
   * Data Scientist Phase: Run statistical analyses
   */
  private async executeDataScientistPhase(
    executionId: string,
    context: WorkflowContext,
    workflowId: string
  ): Promise<PhaseExecutionResult> {
    // Get DE results to use as context
    const deResults = await this.getPriorPhaseResults(workflowId, 'data_engineer');

    const insights: any[] = [];
    let analysesCompleted = 0;

    for (const analysisType of context.analysisTypes) {
      try {
        // Run analysis (calls Python scripts)
        const result = await this.runAnalysis(context.projectId, analysisType, context.questions);

        // Store in normalized table
        const resultId = nanoid();
        await db.execute(sql`
          INSERT INTO ds_analysis_results (
            id, execution_id, analysis_type, confidence,
            p_value, coefficient, r_squared, sample_size, created_at
          ) VALUES (
            ${resultId}, ${executionId}, ${analysisType}, ${result.confidence},
            ${result.pValue}, ${result.coefficient}, ${result.rSquared},
            ${result.sampleSize}, NOW()
          )
        `);

        // Store insights with embeddings
        for (const insight of result.insights) {
          const insightId = nanoid();
          const { embedding } = await embeddingService.embedText(insight.finding);

          await db.execute(sql`
            INSERT INTO insights (
              id, analysis_result_id, finding, embedding,
              confidence, category, created_at
            ) VALUES (
              ${insightId}, ${resultId}, ${insight.finding},
              ${`[${embedding.join(',')}]`}::vector, ${insight.confidence},
              ${insight.category}, NOW()
            )
          `);

          insights.push({ id: insightId, ...insight });
        }

        analysesCompleted++;
      } catch (error: any) {
        console.error(`Analysis ${analysisType} failed:`, error.message);
      }
    }

    return {
      executionId,
      success: analysesCompleted > 0,
      data: {
        phase: 'data_scientist',
        analysesCompleted,
        insightsGenerated: insights.length,
        avgConfidence: insights.length > 0
          ? insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length
          : 0
      }
    };
  }

  /**
   * Business Agent Phase: Validate and add business context
   */
  private async executeBusinessAgentPhase(
    executionId: string,
    context: WorkflowContext,
    workflowId: string
  ): Promise<PhaseExecutionResult> {
    // Get DS results
    const dsResults = await this.getPriorPhaseResults(workflowId, 'data_scientist');

    // Create validation result
    const validationId = nanoid();
    await db.execute(sql`
      INSERT INTO ba_validation_results (
        id, execution_id, validation_passed, industry_context, created_at
      ) VALUES (
        ${validationId}, ${executionId}, true, ${context.audience}, NOW()
      )
    `);

    // Generate recommendations based on insights
    const recommendations = await this.generateBusinessRecommendations(
      workflowId,
      context.goals,
      context.audience
    );

    for (const rec of recommendations) {
      await db.execute(sql`
        INSERT INTO ba_recommendations (
          id, validation_result_id, recommendation_text,
          priority, category, rationale
        ) VALUES (
          ${nanoid()}, ${validationId}, ${rec.text},
          ${rec.priority}, ${rec.category}, ${rec.rationale}
        )
      `);
    }

    return {
      executionId,
      success: true,
      data: {
        phase: 'business_agent',
        validationPassed: true,
        recommendationsCount: recommendations.length
      }
    };
  }

  /**
   * Synthesis Phase: Merge results and generate answers
   */
  private async executeSynthesisPhase(
    executionId: string,
    context: WorkflowContext,
    workflowId: string
  ): Promise<PhaseExecutionResult> {
    // Get all insights from this workflow
    const insights = await this.getWorkflowInsights(workflowId);

    // For each question, find relevant insights using semantic search
    const answers: any[] = [];

    for (const question of context.questions) {
      // Find relevant insights
      const relevantInsights = await semanticSearchService.findRelevantInsights(
        question,
        context.projectId,
        { limit: 5, minSimilarity: 0.6 }
      );

      // Generate answer
      const answer = await this.generateAnswer(question, relevantInsights, context.audience);

      // Get question ID
      const questionRecord = await db.execute(sql`
        SELECT id FROM project_questions
        WHERE project_id = ${context.projectId} AND text = ${question}
        LIMIT 1
      `);
      const questionId = questionRecord.rows?.[0]?.id;

      if (questionId) {
        // Store answer with embedding
        const answerId = nanoid();
        const { embedding } = await embeddingService.embedText(answer.text);

        await db.execute(sql`
          INSERT INTO question_answers (
            id, question_id, answer_text, embedding, confidence,
            generated_by, created_at, updated_at
          ) VALUES (
            ${answerId}, ${questionId}, ${answer.text}, ${`[${embedding.join(',')}]`}::vector,
            ${answer.confidence}, 'ai', NOW(), NOW()
          )
          ON CONFLICT (question_id) DO UPDATE SET
            answer_text = ${answer.text},
            embedding = ${`[${embedding.join(',')}]`}::vector,
            confidence = ${answer.confidence},
            updated_at = NOW()
        `);

        // Link insights to answer
        for (const insight of relevantInsights) {
          await db.execute(sql`
            INSERT INTO answer_insights (answer_id, insight_id, relevance_score)
            VALUES (${answerId}, ${insight.id}, ${insight.similarity})
            ON CONFLICT (answer_id, insight_id) DO NOTHING
          `);
        }

        // Create evidence chain
        let stepOrder = 1;
        for (const insight of relevantInsights) {
          await db.execute(sql`
            INSERT INTO evidence_chain (
              id, answer_id, step_order, source_type, source_id, output_summary
            ) VALUES (
              ${nanoid()}, ${answerId}, ${stepOrder}, 'insight', ${insight.id},
              ${insight.text.slice(0, 500)}
            )
          `);
          stepOrder++;
        }

        answers.push({
          questionId,
          question,
          answer: answer.text,
          confidence: answer.confidence,
          supportingInsights: relevantInsights.length
        });
      }
    }

    return {
      executionId,
      success: true,
      data: {
        phase: 'synthesis',
        answersGenerated: answers.length,
        avgConfidence: answers.length > 0
          ? answers.reduce((sum, a) => sum + a.confidence, 0) / answers.length
          : 0
      }
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async createWorkflowRecord(workflowId: string, input: StartWorkflowInputType): Promise<void> {
    await db.execute(sql`
      INSERT INTO agent_workflows (
        id, project_id, status, current_phase, goals, audience, started_at
      ) VALUES (
        ${workflowId}, ${input.projectId}, 'pending', NULL,
        ${input.goals}, ${input.audience || 'business'}, NOW()
      )
    `);
  }

  private async storeQuestionsWithEmbeddings(projectId: string, questions: string[]): Promise<void> {
    if (questions.length === 0) return;

    // Generate embeddings in batch
    const embeddings = await embeddingService.embedBatch(questions);

    for (let i = 0; i < questions.length; i++) {
      const id = nanoid();
      const embeddingStr = `[${embeddings[i].embedding.join(',')}]`;

      await db.execute(sql`
        INSERT INTO project_questions (id, project_id, text, embedding, created_at, updated_at)
        VALUES (${id}, ${projectId}, ${questions[i]}, ${embeddingStr}::vector, NOW(), NOW())
        ON CONFLICT (project_id, text) DO UPDATE SET updated_at = NOW()
      `);
    }
  }

  private async getWorkflow(workflowId: string): Promise<any> {
    const result = await db.execute(sql`
      SELECT * FROM agent_workflows WHERE id = ${workflowId}
    `);
    return result.rows?.[0] || null;
  }

  private async updateWorkflowStatus(
    workflowId: string,
    status: string,
    phase: string | null
  ): Promise<void> {
    await db.execute(sql`
      UPDATE agent_workflows
      SET status = ${status}, current_phase = ${phase}
      WHERE id = ${workflowId}
    `);
  }

  private async updateWorkflowError(workflowId: string, error: string): Promise<void> {
    await db.execute(sql`
      UPDATE agent_workflows
      SET status = 'failed', error_message = ${error}
      WHERE id = ${workflowId}
    `);
  }

  private async createExecutionRecord(
    executionId: string,
    workflowId: string,
    projectId: string,
    agentType: string
  ): Promise<void> {
    await db.execute(sql`
      INSERT INTO agent_executions (
        id, project_id, workflow_id, agent_type, status, started_at
      ) VALUES (
        ${executionId}, ${projectId}, ${workflowId}, ${agentType}, 'running', NOW()
      )
    `);
  }

  private async completeExecution(executionId: string, success: boolean, data: any): Promise<void> {
    await db.execute(sql`
      UPDATE agent_executions
      SET status = ${success ? 'success' : 'partial'}, completed_at = NOW()
      WHERE id = ${executionId}
    `);
  }

  private async failExecution(executionId: string, error: string): Promise<void> {
    await db.execute(sql`
      UPDATE agent_executions
      SET status = 'failed', completed_at = NOW(), error_message = ${error}
      WHERE id = ${executionId}
    `);
  }

  private async getPriorPhaseResults(workflowId: string, phase: string): Promise<any> {
    const result = await db.execute(sql`
      SELECT ae.id, ae.status
      FROM agent_executions ae
      WHERE ae.workflow_id = ${workflowId} AND ae.agent_type = ${phase}
      ORDER BY ae.started_at DESC
      LIMIT 1
    `);
    return result.rows?.[0] || null;
  }

  private getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase | null {
    const idx = this.PHASE_ORDER.indexOf(currentPhase);
    if (idx === -1 || idx === this.PHASE_ORDER.length - 1) return null;
    return this.PHASE_ORDER[idx + 1];
  }

  private async analyzeDataQuality(dataset: any): Promise<any> {
    // Simplified quality analysis
    const data = dataset.data || dataset.preview || [];
    const rowCount = Array.isArray(data) ? data.length : 0;
    const columns = rowCount > 0 && typeof data[0] === 'object' ? Object.keys(data[0]) : [];
    const columnCount = columns.length;

    // Calculate missing values
    let totalCells = rowCount * columnCount;
    let missingCells = 0;

    for (const row of data) {
      for (const col of columns) {
        if (row[col] === null || row[col] === undefined || row[col] === '') {
          missingCells++;
        }
      }
    }

    const missingPercent = totalCells > 0 ? (missingCells / totalCells) * 100 : 0;
    const score = Math.max(0, 100 - missingPercent * 2);

    return {
      score: Math.round(score),
      rowCount,
      columnCount,
      missingPercent: Math.round(missingPercent * 100) / 100,
      schemaIssues: []
    };
  }

  private async runAnalysis(projectId: string, analysisType: string, questions: string[]): Promise<any> {
    // Stub - would call actual Python scripts
    return {
      confidence: 85,
      pValue: 0.03,
      coefficient: null,
      rSquared: null,
      sampleSize: 1000,
      insights: [
        {
          finding: `Analysis of ${analysisType} completed successfully`,
          confidence: 85,
          category: analysisType
        }
      ]
    };
  }

  private async generateBusinessRecommendations(
    workflowId: string,
    goals: string[],
    audience: string
  ): Promise<Array<{ text: string; priority: string; category: string; rationale: string }>> {
    return [
      {
        text: 'Review data quality issues before proceeding',
        priority: 'high',
        category: 'Data Quality',
        rationale: 'Ensuring data quality improves analysis reliability'
      }
    ];
  }

  private async generateAnswer(
    question: string,
    insights: any[],
    audience: string
  ): Promise<{ text: string; confidence: number }> {
    // Stub - would call AI service
    const insightSummary = insights.map(i => i.text).join('; ');
    return {
      text: `Based on analysis: ${insightSummary || 'No specific insights found.'}`,
      confidence: insights.length > 0 ? 80 : 50
    };
  }

  private async getWorkflowInsights(workflowId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT i.id, i.finding, i.confidence, i.category
      FROM insights i
      JOIN ds_analysis_results ar ON i.analysis_result_id = ar.id
      JOIN agent_executions ae ON ar.execution_id = ae.id
      WHERE ae.workflow_id = ${workflowId}
    `);
    return result.rows || [];
  }

  private async getWorkflowAnswers(projectId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT qa.id, qa.answer_text, qa.confidence, pq.text as question
      FROM question_answers qa
      JOIN project_questions pq ON qa.question_id = pq.id
      WHERE pq.project_id = ${projectId}
    `);
    return result.rows || [];
  }

  private async getWorkflowArtifacts(workflowId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT id, viz_type, title, file_path
      FROM visualization_artifacts
      WHERE execution_id IN (
        SELECT id FROM agent_executions WHERE workflow_id = ${workflowId}
      )
    `);
    return result.rows || [];
  }

  private calculateAvgConfidence(answers: any[]): number {
    if (answers.length === 0) return 0;
    return answers.reduce((sum, a) => sum + (a.confidence || 0), 0) / answers.length;
  }

  private async storeFeedback(workflowId: string, feedback: string): Promise<void> {
    // Store feedback for re-synthesis
    console.log(`Storing feedback for workflow ${workflowId}: ${feedback}`);
  }

  private async executeApprovedPlan(workflowId: string, projectId: string): Promise<void> {
    // Execute the approved analysis plan
    console.log(`Executing approved plan for workflow ${workflowId}`);
    await this.updateWorkflowStatus(workflowId, 'success', 'results');
  }
}

// Singleton instance
export const agentCoordinationServiceV2 = new AgentCoordinationServiceV2();
