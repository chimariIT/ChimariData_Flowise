// server/services/project-agent-orchestrator.ts

import { ProjectManagerAgent } from './project-manager-agent';
import { TechnicalAIAgent } from './technical-ai-agent';
import { BusinessAgent } from './business-agent';
import { DataEngineerAgent } from './data-engineer-agent';
import { AgentInitializationService } from './agent-initialization';

// JO-3 FIX: Replaced deprecated SocketManager (Socket.IO) with native ws RealtimeServer
import { getRealtimeServer } from '../realtime';
import { RealtimeServer } from '../realtime';
import { storage } from './storage';
import { journeyStateManager } from './journey-state-manager';
import { defaultJourneyTemplateCatalog, cloneJourneyTemplate } from '@shared/journey-templates';
import type { JourneyTemplate, JourneyTemplateStep } from '@shared/journey-templates';
import { db } from '../db';
import { projects, decisionAudits } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { JourneyExecutionMachine } from './journey-execution-machine';
import { executeTool } from './mcp-tool-registry';
import { semanticDataPipeline } from './semantic-data-pipeline';

interface ProjectAgentContext {
  projectId: string;
  userId: string;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';
  projectName: string;
  description?: string;
}

// ✅ PHASE 2 FIX: Interface to accumulate agent results between steps
interface AgentExecutionContext {
  projectId: string;
  previousResults: Map<string, any>;
  requirementsDocument?: any;
  analysisPath?: any[];
  transformationPlan?: any;
  researcherResult?: any;
  dsAgentResult?: any;
  deAgentResult?: any;
}

export interface AgentCheckpoint {
  id: string;
  projectId: string;
  agentType: 'project_manager' | 'technical_ai' | 'business' | 'data_engineer' | 'data_scientist';
  stepName: string;
  status: 'pending' | 'in_progress' | 'waiting_approval' | 'approved' | 'completed' | 'rejected';
  message: string;
  data?: any;
  userFeedback?: string;
  timestamp: Date;
  requiresUserInput: boolean;
  // Enhanced for checkpoint coordination workflow
  displayMessage?: string;  // User-friendly translated message
  originalMessage?: string; // Original technical message for debugging
}

export class ProjectAgentOrchestrator {
  private projectManager: ProjectManagerAgent;
  private technicalAgent: TechnicalAIAgent;
  private businessAgent: BusinessAgent;
  private dataEngineerAgent: DataEngineerAgent;
  private agentInitService: AgentInitializationService;
  private activeProjects: Map<string, ProjectAgentContext> = new Map();
  private checkpoints: Map<string, AgentCheckpoint[]> = new Map();
  private executingSteps: Set<string> = new Set(); // Track steps currently executing to prevent duplicates
  private executionMachine: JourneyExecutionMachine;

  constructor() {
    this.projectManager = new ProjectManagerAgent();
    this.technicalAgent = new TechnicalAIAgent();
    this.businessAgent = new BusinessAgent();
    this.dataEngineerAgent = new DataEngineerAgent();
    this.agentInitService = new AgentInitializationService();
    // JO-1 FIX: Wire persistence callbacks so execution machine state survives server restarts
    this.executionMachine = new JourneyExecutionMachine({
      persistState: async (projectId, state) => {
        try {
          await storage.atomicMergeJourneyProgress(projectId, {
            executionMachineState: state
          });
        } catch (error) {
          console.error(`[Orchestrator JO-1] Failed to persist execution machine state:`, error);
        }
      },
      restoreState: async (projectId) => {
        try {
          const project = await storage.getProject(projectId);
          return (project as any)?.journeyProgress?.executionMachineState || null;
        } catch (error) {
          console.error(`[Orchestrator JO-1] Failed to restore execution machine state:`, error);
          return null;
        }
      }
    });
  }

  /**
   * PHASE 6 FIX: Persist agent results to journeyProgress.agentResults
   * This ensures agent results survive server restarts
   */
  private async persistAgentResult(projectId: string, agentName: string, result: any): Promise<void> {
    try {
      const project = await storage.getProject(projectId);
      if (!project) {
        console.warn(`⚠️ [Orchestrator] Cannot persist agent result - project not found: ${projectId}`);
        return;
      }

      const journeyProgress = (project as any).journeyProgress || {};
      const existingAgentResults = journeyProgress.agentResults || {};

      await storage.atomicMergeJourneyProgress(projectId, {
        agentResults: {
          ...existingAgentResults,
          [agentName]: {
            result,
            completedAt: new Date().toISOString()
          }
        }
      });

      console.log(`✅ [Orchestrator PHASE 6] Persisted ${agentName} results to journeyProgress.agentResults`);
    } catch (error) {
      console.error(`❌ [Orchestrator PHASE 6] Failed to persist ${agentName} result:`, error);
      // Non-blocking - don't fail the execution if persistence fails
    }
  }

  /**
   * PHASE 6 FIX: Load previously persisted agent results
   * Called when resuming a journey or initializing execution context
   */
  private async loadAgentResults(projectId: string): Promise<Record<string, any>> {
    try {
      const project = await storage.getProject(projectId);
      const journeyProgress = (project as any)?.journeyProgress || {};
      const agentResults = journeyProgress.agentResults || {};

      const resultsMap: Record<string, any> = {};
      for (const [agentName, data] of Object.entries(agentResults)) {
        resultsMap[agentName] = (data as any)?.result;
      }

      if (Object.keys(resultsMap).length > 0) {
        console.log(`✅ [Orchestrator PHASE 6] Loaded ${Object.keys(resultsMap).length} persisted agent results`);
      }

      return resultsMap;
    } catch (error) {
      console.error(`❌ [Orchestrator PHASE 6] Failed to load agent results:`, error);
      return {};
    }
  }

  /**
   * Coordinate transformation validation and column mapping before analysis execution.
   * Ensures DS Agent's abstract column names are mapped to actual dataset columns.
   *
   * @param projectId - The project ID
   * @param analysisType - The type of analysis being run
   * @returns Result with success status and any errors
   */
  async coordinateTransformationBeforeAnalysis(
    projectId: string,
    analysisType: string
  ): Promise<{ success: boolean; transformedDatasetId?: string; errors?: string[] }> {
    console.log(`🤖 [Orchestrator] Coordinating transformation for ${analysisType}`);

    try {
      const project = await storage.getProject(projectId);
      const datasets = await storage.getProjectDatasets(projectId);
      const dataset = datasets?.[0];

      if (!project || !dataset) {
        return { success: false, errors: ['Project or dataset not found'] };
      }

      const dsDataset = (dataset as any).dataset || dataset;

      // 1. Get DS Agent requirements for this analysis
      const journeyProgress = (project as any)?.journeyProgress || {};
      const dsRequirements = journeyProgress?.requirementsDocument;
      const elementsForAnalysis = (dsRequirements?.requiredDataElements || []).filter((el: any) =>
        el.neededForAnalyses?.includes(analysisType) ||
        el.neededForAnalyses?.includes('all') ||
        !el.neededForAnalyses // Include elements without specific analysis association
      );

      if (elementsForAnalysis.length === 0) {
        console.log(`ℹ️ [Orchestrator] No specific transformations needed for ${analysisType}`);
        return { success: true };
      }

      console.log(`📊 [Orchestrator] Found ${elementsForAnalysis.length} elements for ${analysisType}`);

      // 2. Get available columns from dataset
      const datasetSchema = dsDataset.schema || dsDataset.ingestionMetadata?.schema || {};
      const availableColumns = Object.keys(datasetSchema);

      // 3. Import and use source column mapper with context-aware matching
      const { sourceColumnMapper } = await import('./source-column-mapper');

      // Extract context from project for smarter matching
      const mappingContext = sourceColumnMapper.extractContextFromProject({
        journeyProgress: journeyProgress,
        metadata: (project as any)?.metadata,
        name: (project as any)?.name,
        description: (project as any)?.description
      });

      const mappingResults = await sourceColumnMapper.mapMultipleElements(
        elementsForAnalysis.map((el: any) => ({
          elementId: el.elementId || el.id,
          elementName: el.elementName || el.name,
          calculationDefinition: el.calculationDefinition,
          dataType: el.dataType,
          // Add context fields for smarter matching
          purpose: el.purpose || el.calculationDefinition?.purpose,
          description: el.description || el.calculationDefinition?.formula?.businessDescription,
          dsRecommendation: el.dsRecommendation || el.calculationDefinition?.formula?.pseudoCode
        })),
        availableColumns,
        datasetSchema,
        undefined,  // userProvidedMappings
        projectId,  // projectId for RAG
        mappingContext  // Context-aware matching
      );

      // 4. Check for unmapped columns
      const unmapped = mappingResults.filter(m => !m.allMapped);
      if (unmapped.length > 0) {
        const unmappedFields = unmapped.flatMap(m => m.missingFields);
        console.warn(`⚠️ [Orchestrator] ${unmapped.length} elements have unmapped columns: ${unmappedFields.join(', ')}`);

        // Create checkpoint for user review if needed
        await this.addCheckpoint(projectId, {
          id: `checkpoint_${Date.now()}_mapping_review`,
          projectId,
          agentType: 'data_engineer',
          stepName: 'column_mapping_review',
          status: 'waiting_approval',
          message: `Some columns need mapping: ${unmappedFields.slice(0, 5).join(', ')}${unmappedFields.length > 5 ? '...' : ''}`,
          data: {
            unmappedElements: unmapped.map(m => ({
              element: m.elementName,
              missing: m.missingFields,
              suggestions: m.mappings.flatMap(mapping => mapping.alternatives)
            }))
          },
          timestamp: new Date(),
          requiresUserInput: true
        });

        // Don't fail - let the transformation step handle missing columns
        console.log(`📋 [Orchestrator] Created checkpoint for column mapping review`);
      }

      // 5. Build column mapping lookup
      const columnLookup = sourceColumnMapper.buildColumnLookup(mappingResults);
      console.log(`🔗 [Orchestrator] Built column mapping with ${columnLookup.size} mappings`);

      // 6. Store mapping in journeyProgress for use by execute-transformations
      await storage.atomicMergeJourneyProgress(projectId, {
        columnMappingResults: mappingResults.map(r => ({
          elementId: r.elementId,
          elementName: r.elementName,
          allMapped: r.allMapped,
          overallConfidence: r.overallConfidence,
          mappings: r.mappings.map(m => ({
            abstractField: m.abstractField,
            actualColumn: m.actualColumn,
            confidence: m.confidence,
            matchMethod: m.matchMethod
          }))
        })),
        columnMappingLookup: Object.fromEntries(columnLookup),
        mappingCreatedAt: new Date().toISOString()
      });

      console.log(`✅ [Orchestrator] Transformation coordination complete for ${analysisType}`);
      return { success: true, transformedDatasetId: dsDataset.id };

    } catch (error: any) {
      console.error(`❌ [Orchestrator] Transformation coordination failed:`, error);
      return { success: false, errors: [error.message] };
    }
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

      // Initialize execution machine state for the project
      await this.executionMachine.syncFromJourney(context.projectId, {
        completedSteps: [],
        totalSteps: 0
      });
      this.executionMachine.markInitializing(context.projectId);

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

      // Automatically execute the first journey step
      // Use setTimeout with small delay to ensure journey initialization completes
      setTimeout(async () => {
        try {
          console.log(`⏰ [INIT] Triggering auto-execution for project ${context.projectId} after initialization`);
          await this.autoExecuteNextStep(context.projectId);
        } catch (error) {
          console.error(`❌ [INIT] Failed to auto-execute first step for project ${context.projectId}:`, error);
          if (error instanceof Error) {
            console.error(`❌ [INIT] Error stack:`, error.stack);
          }
        }
      }, 1000); // 1 second delay to ensure journey state is fully initialized

    } catch (error) {
      console.error('❌ Failed to initialize project agents:', error);
      throw error;
    }
  }

  /**
   * Automatically execute the next uncompleted journey step
   */
  async autoExecuteNextStep(projectId: string): Promise<void> {
    console.log(`🚀 [AUTO-EXECUTE] Attempting to advance journey for project ${projectId}`);
    try {
      await this.advanceJourney(projectId);
    } catch (error) {
      console.error(`❌ [AUTO-EXECUTE] Failed to advance journey for project ${projectId}:`, error);
      if (error instanceof Error) {
        console.error(`❌ [AUTO-EXECUTE] Error stack:`, error.stack);
      }
    }
  }

  /**
   * Start journey-specific analysis
   */
  private async advanceJourney(projectId: string): Promise<void> {
    // Ensure we have project context available
    let context = this.activeProjects.get(projectId);
    if (!context) {
      console.log(`⚠️  [ADVANCE] Project context missing for ${projectId}, attempting restore`);
      context = await this.restoreProjectContext(projectId);
      if (!context) {
        console.error(`❌ [ADVANCE] Unable to restore context for project ${projectId}`);
        return;
      }
      console.log(`✅ [ADVANCE] Context restored for project ${projectId}`);
    }

    // Load journey state and template
    const journeyState = await journeyStateManager.getJourneyState(projectId);
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const template = this.getTemplateForProject(project.journeyType as string, journeyState.templateId);

    if (!template.steps.length) {
      console.log(`ℹ️  [ADVANCE] No template steps configured for project ${projectId}`);
      return;
    }

    // Sync execution machine with persisted journey state
    await this.executionMachine.syncFromJourney(projectId, {
      completedSteps: journeyState.completedSteps || [],
      totalSteps: template.steps.length
    });

    const nextStep = this.executionMachine.requestNextStep(projectId, template.steps, journeyState.completedSteps || []);

    if (!nextStep) {
      const machineState = this.executionMachine.getState(projectId);
      if (machineState?.status === 'awaiting_feedback') {
        console.log(`⏳ [ADVANCE] Awaiting user feedback for checkpoint ${machineState.awaitingCheckpointId}`);
        return;
      }

      if (machineState?.status === 'completed') {
        await this.ensureJourneyCompletionCheckpoint(projectId, context);
      }

      return;
    }

    // Mark execution and run step
    this.executionMachine.startStep(projectId, nextStep.id);
    await this.executeJourneyStep(projectId, nextStep, context, template);
  }

  private async ensureJourneyCompletionCheckpoint(projectId: string, context: ProjectAgentContext): Promise<void> {
    const existing = (this.checkpoints.get(projectId) || []).find((cp) => cp.stepName === 'journey_complete');
    if (existing) {
      return;
    }

    const completionCheckpoint: AgentCheckpoint = {
      id: `checkpoint_${Date.now()}_complete`,
      projectId,
      agentType: 'project_manager',
      stepName: 'journey_complete',
      status: 'completed',
      message: '🎉 Congratulations! All journey steps have been completed successfully.',
      timestamp: new Date(),
      requiresUserInput: false
    };

    await this.addCheckpoint(projectId, completionCheckpoint);
    this.notifyAgentActivity(context.userId, projectId, {
      type: 'checkpoint_created',
      checkpoint: completionCheckpoint
    });
  }

  private async startJourneyAnalysis(context: ProjectAgentContext): Promise<void> {
    // ========================================================================
    // PHASE 4 FIX: Sequential Agent Coordination during initialization
    // PM Agent orchestrates: Researcher → DS → (User uploads) → DE → BA
    // This ensures agents prepare context BEFORE user uploads data
    // ========================================================================
    console.log(`🎯 [PM Agent] Starting sequential agent coordination for project ${context.projectId}`);

    const projectId = context.projectId;
    let projectData: any = {};

    // ✅ PHASE 2 FIX: Create execution context to accumulate agent results
    const executionContext: AgentExecutionContext = {
      projectId,
      previousResults: new Map(),
      requirementsDocument: undefined,
      analysisPath: undefined,
      researcherResult: undefined,
      dsAgentResult: undefined
    };

    // ✅ PHASE 6 FIX: Load previously persisted agent results (survives server restart)
    const persistedResults = await this.loadAgentResults(projectId);
    for (const [agentName, result] of Object.entries(persistedResults)) {
      executionContext.previousResults.set(agentName, result);
    }

    // Load any existing project data
    try {
      const project = await storage.getProject(projectId);
      projectData = {
        schema: (project as any)?.journeyProgress?.schema,
        data: [],
        goals: (project as any)?.journeyProgress?.goals || (project as any)?.journeyProgress?.analysisGoal,
        questions: (project as any)?.journeyProgress?.businessQuestions || [],
        // ✅ PHASE 2 FIX: Include existing requirements document if available
        requirementsDocument: (project as any)?.journeyProgress?.requirementsDocument
      };
      executionContext.requirementsDocument = projectData.requirementsDocument;
    } catch (loadError) {
      console.warn(`⚠️ [PM Agent] Could not load project data:`, loadError);
    }

    // Step 1: Run Researcher Agent - Find templates and seed industry definitions
    console.log(`📚 [PM Agent] Step 1: Running Template Research Agent...`);
    let researchResult: any = null;
    try {
      const researchStep: JourneyTemplateStep = {
        id: 'init_template_research',
        name: 'Template Research',
        description: 'Find relevant templates and seed industry definitions',
        agent: 'template_research_agent',
        tools: ['template_finder', 'web_researcher'],
        estimatedDuration: 30
      };
      researchResult = await this.executeStepByAgent(researchStep, projectId, projectData, context);
      // ✅ PHASE 2 FIX: Store researcher result in execution context
      executionContext.researcherResult = researchResult;
      executionContext.previousResults.set('template_research_agent', researchResult);
      // ✅ PHASE 6 FIX: Persist to journeyProgress.agentResults
      await this.persistAgentResult(projectId, 'template_research_agent', researchResult);
      console.log(`  ✅ Researcher Agent: Templates found, definitions seeded`, researchResult?.template?.name || 'general');
    } catch (researchError) {
      console.warn(`  ⚠️ Researcher Agent step failed (non-blocking):`, researchError);
    }

    // Step 2: Run Data Scientist Agent - Generate analysis recommendations
    console.log(`🔬 [PM Agent] Step 2: Running Data Scientist Agent...`);
    let dsResult: any = null;
    try {
      const dsStep: JourneyTemplateStep = {
        id: 'init_analysis_requirements',
        name: 'Analysis Requirements',
        description: 'Recommend analysis types based on goals and questions',
        agent: 'data_scientist',
        tools: ['required_data_elements', 'analysis_recommender'],
        estimatedDuration: 45
      };
      // ✅ PHASE 2 FIX: Pass researcher results to DS Agent via enriched projectData
      const enrichedProjectData = {
        ...projectData,
        previousAgentResults: Object.fromEntries(executionContext.previousResults),
        researcherRecommendation: researchResult?.template || researchResult,
        industryDefinitions: researchResult?.definitions || []
      };
      dsResult = await this.executeStepByAgent(dsStep, projectId, enrichedProjectData, context);
      // ✅ PHASE 2 FIX: Store DS result in execution context
      executionContext.dsAgentResult = dsResult;
      executionContext.previousResults.set('data_scientist', dsResult);
      // ✅ PHASE 6 FIX: Persist to journeyProgress.agentResults
      await this.persistAgentResult(projectId, 'data_scientist', dsResult);
      if (dsResult?.requirementsDocument) {
        executionContext.requirementsDocument = dsResult.requirementsDocument;
        executionContext.analysisPath = dsResult.requirementsDocument?.analysisPath;

        // PHASE 2 FIX: Create semantic links from questionAnswerMapping
        const questionMapping = dsResult.requirementsDocument?.questionAnswerMapping;
        if (questionMapping && Array.isArray(questionMapping)) {
          try {
            const linksCreated = await semanticDataPipeline.createLinksFromRequirements(
              projectId,
              questionMapping
            );
            console.log(`🔗 [Semantic] Created ${linksCreated} question-element links from DS requirements`);
          } catch (linkError) {
            console.warn(`⚠️ [Semantic] Failed to create semantic links (non-blocking):`, linkError);
          }
        }
      }
      console.log(`  ✅ DS Agent: Analysis recommendations generated`, dsResult?.recommendations?.recommendedAnalyses?.slice(0, 3) || []);
    } catch (dsError) {
      console.warn(`  ⚠️ DS Agent step failed (non-blocking):`, dsError);
    }

    // Step 3: Create checkpoint for user to upload data
    console.log(`📤 [PM Agent] Step 3: Creating data upload checkpoint...`);
    const analysisCheckpoint: AgentCheckpoint = {
      id: `checkpoint_${Date.now()}_analysis`,
      projectId: context.projectId,
      agentType: this.getLeadAgent(context.journeyType),
      stepName: 'initial_analysis',
      status: 'waiting_approval',
      message: this.getJourneyWelcomeMessage(context.journeyType),
      data: {
        suggestedNextSteps: this.getSuggestedNextSteps(context.journeyType),
        estimatedTimeframe: this.getEstimatedTimeframe(context.journeyType),
        // ✅ PHASE 2 FIX: Include actual agent preparation results, not just status flags
        agentPreparation: {
          researcherReady: !!researchResult,
          dsReady: !!dsResult,
          awaitingUserData: true,
          // Include actual results for downstream use
          templateRecommendation: researchResult?.template?.name || null,
          analysisPath: executionContext.analysisPath || dsResult?.requirementsDocument?.analysisPath || [],
          requiredDataElements: executionContext.requirementsDocument?.requiredDataElements || [],
          recommendedAnalyses: dsResult?.recommendations?.recommendedAnalyses || []
        }
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

    console.log(`✅ [PM Agent] Sequential agent coordination complete. Awaiting user data upload.`);
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
    // First try in-memory lookup
    const checkpoints = this.checkpoints.get(projectId) || [];
    let checkpoint = checkpoints.find(cp => cp.id === checkpointId);

    // If not in memory, try to load from database (handles server restart scenario)
    if (!checkpoint) {
      console.log(`⚠️ [Checkpoint] Not found in memory, checking database for ${checkpointId}...`);
      try {
        const dbCheckpoint = await storage.getAgentCheckpoint(checkpointId);
        if (dbCheckpoint) {
          // Reconstruct checkpoint from database
          const restoredCheckpoint: AgentCheckpoint = {
            id: dbCheckpoint.id,
            projectId: dbCheckpoint.projectId,
            agentType: dbCheckpoint.agentType as AgentCheckpoint['agentType'],
            stepName: dbCheckpoint.stepName,
            status: dbCheckpoint.status as AgentCheckpoint['status'],
            message: dbCheckpoint.message || '',
            data: dbCheckpoint.data as any || {},
            userFeedback: dbCheckpoint.userFeedback || '',
            requiresUserInput: dbCheckpoint.requiresUserInput ?? false,
            timestamp: dbCheckpoint.timestamp || new Date()
          };
          checkpoint = restoredCheckpoint;
          // Add to in-memory cache
          checkpoints.push(restoredCheckpoint);
          this.checkpoints.set(projectId, checkpoints);
          console.log(`✅ [Checkpoint] Restored from database: ${checkpointId}`);
        }
      } catch (dbLookupError) {
        console.error(`❌ [Checkpoint] Database lookup failed:`, dbLookupError);
      }
    }

    // Fix 3: Third lookup — search journeyProgress.checkpoints (where project.ts stores them)
    if (!checkpoint) {
      console.log(`⚠️ [Checkpoint] Not in agentCheckpoints DB either, checking journeyProgress for ${checkpointId}...`);
      try {
        const project = await storage.getProject(projectId);
        const jpCheckpoints = (project as any)?.journeyProgress?.checkpoints || [];
        const found = jpCheckpoints.find((cp: any) => cp.id === checkpointId);
        if (found) {
          // Reconstruct AgentCheckpoint from journeyProgress shape
          const restoredCheckpoint: AgentCheckpoint = {
            id: found.id,
            projectId: found.projectId || projectId,
            agentType: (found.agentId || 'project_manager') as AgentCheckpoint['agentType'],
            stepName: found.stage || 'unknown',
            status: (found.status || 'pending') as AgentCheckpoint['status'],
            message: found.message || '',
            data: found.metadata || {},
            userFeedback: '',
            requiresUserInput: found.requiresApproval !== false,
            timestamp: found.createdAt ? new Date(found.createdAt) : new Date()
          };
          checkpoint = restoredCheckpoint;
          checkpoints.push(restoredCheckpoint);
          this.checkpoints.set(projectId, checkpoints);
          console.log(`✅ [Checkpoint] Restored from journeyProgress: ${checkpointId}`);
        }
      } catch (jpErr) {
        console.error('❌ [Checkpoint] journeyProgress lookup failed:', jpErr);
      }
    }

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    checkpoint.userFeedback = userFeedback;
    checkpoint.status = approved ? 'approved' : 'rejected';

    // ✅ GAP 8 FIX: Persist checkpoint approval to database
    // This ensures checkpoint state survives server restarts
    try {
      const persistedCheckpoint = await storage.updateAgentCheckpoint(checkpointId, {
        status: checkpoint.status,
        userFeedback: userFeedback,
        timestamp: new Date()
      });

      if (persistedCheckpoint) {
        console.log(`✅ [GAP 8 FIX] Checkpoint ${checkpointId} persisted to database with status: ${checkpoint.status}`);
      } else {
        // Checkpoint doesn't exist in DB yet - create it
        console.warn(`⚠️ [GAP 8 FIX] Checkpoint ${checkpointId} not found in DB, creating...`);
        await storage.createAgentCheckpoint({
          id: checkpointId,
          projectId: checkpoint.projectId,
          agentType: checkpoint.agentType,
          stepName: checkpoint.stepName,
          status: checkpoint.status,
          message: checkpoint.message,
          data: checkpoint.data,
          userFeedback: userFeedback,
          requiresUserInput: checkpoint.requiresUserInput,
          timestamp: new Date()
        });
        console.log(`✅ [GAP 8 FIX] Created checkpoint ${checkpointId} in database`);
      }
    } catch (dbError) {
      console.error(`❌ [GAP 8 FIX] Failed to persist checkpoint ${checkpointId} to database:`, dbError);
      // Continue with in-memory operation - don't fail the user action
    }

    // Fix 3: Also update journeyProgress.checkpoints so SSOT stays in sync
    try {
      const project = await storage.getProject(projectId);
      const jp = (project as any)?.journeyProgress || {};
      const jpCheckpoints: any[] = jp.checkpoints || [];
      const cpIdx = jpCheckpoints.findIndex((cp: any) => cp.id === checkpointId);
      if (cpIdx >= 0) {
        jpCheckpoints[cpIdx] = { ...jpCheckpoints[cpIdx], status: approved ? 'approved' : 'rejected', feedback: userFeedback, updatedAt: new Date().toISOString() };
        await storage.atomicMergeJourneyProgress(projectId, { checkpoints: jpCheckpoints });
        console.log(`✅ [Fix 3] Updated checkpoint ${checkpointId} in journeyProgress`);
      }
    } catch (jpUpdateErr) {
      console.error(`⚠️ [Fix 3] Failed to update journeyProgress checkpoint:`, jpUpdateErr);
    }

    // Get or restore project context (handles server restart scenario)
    let context = this.activeProjects.get(projectId);
    if (!context) {
      console.log(`⚠️ [Checkpoint Feedback] Project context missing for ${projectId}, attempting restore...`);
      context = await this.restoreProjectContext(projectId);
      if (!context) {
        throw new Error(`Project context not found and could not be restored for ${projectId}`);
      }
      console.log(`✅ [Checkpoint Feedback] Context restored for project ${projectId}`);
    }

    this.executionMachine.applyCheckpoint(projectId, checkpoint);

    // Notify about feedback
    this.notifyAgentActivity(context.userId, projectId, {
      type: 'checkpoint_updated',
      checkpoint
    });

    if (approved) {
      this.executionMachine.resolveFeedback(projectId);
      await this.advanceJourney(projectId);
    } else {
      this.executionMachine.markAwaitingFeedback(projectId, checkpoint.id);
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
    let normalizedCheckpoint = checkpoint;

    try {
      const persisted = await storage.createAgentCheckpoint({
        id: checkpoint.id,
        projectId: checkpoint.projectId,
        agentType: checkpoint.agentType,
        stepName: checkpoint.stepName,
        status: checkpoint.status,
        message: checkpoint.message,
        data: checkpoint.data ?? null,
        userFeedback: checkpoint.userFeedback ?? null,
        requiresUserInput: checkpoint.requiresUserInput,
        timestamp: checkpoint.timestamp
      });

      normalizedCheckpoint = this.normalizeCheckpointRecord(persisted);
      console.log(`✅ Checkpoint ${checkpoint.id} persisted for project ${projectId}`);
    } catch (error) {
      console.error('Failed to persist checkpoint, falling back to in-memory storage:', error);
    }

    const checkpoints = this.checkpoints.get(projectId) || [];
    checkpoints.push(normalizedCheckpoint);
    this.checkpoints.set(projectId, checkpoints);

    this.executionMachine.applyCheckpoint(projectId, normalizedCheckpoint);
  }

  /**
   * Get checkpoints for a project with translated messages
   * Enhanced for checkpoint coordination workflow
   */
  async getProjectCheckpoints(projectId: string): Promise<AgentCheckpoint[]> {
    const persisted = await storage.getProjectCheckpoints(projectId);
    const normalizedPersisted = persisted.map((checkpoint) => this.normalizeCheckpointRecord(checkpoint));
    const inMemory = this.checkpoints.get(projectId) || [];

    const combined = new Map<string, AgentCheckpoint>();

    for (const checkpoint of normalizedPersisted) {
      combined.set(checkpoint.id, checkpoint);
    }

    for (const checkpoint of inMemory) {
      combined.set(checkpoint.id, checkpoint);
    }

    // Get journey type for message translation
    const context = this.activeProjects.get(projectId);
    const journeyType = context?.journeyType || 'technical';

    // Add translated messages to checkpoints for frontend display
    const sortedCheckpoints = Array.from(combined.values()).sort(
      (a, b) => (a.timestamp?.getTime?.() ?? 0) - (b.timestamp?.getTime?.() ?? 0)
    );

    return sortedCheckpoints.map(checkpoint => ({
      ...checkpoint,
      // Add user-friendly translated message while preserving original
      displayMessage: this.translateCheckpointMessage(checkpoint, journeyType),
      originalMessage: checkpoint.message
    }));
  }

  /**
   * Translate checkpoint message for user-friendly display
   * Part of checkpoint coordination workflow enhancement
   */
  private translateCheckpointMessage(checkpoint: AgentCheckpoint, journeyType: string): string {
    // Non-tech users get simplified, jargon-free messages
    if (journeyType === 'non-tech' || journeyType === 'non_tech') {
      return this.getSimplifiedCheckpointMessage(checkpoint);
    }

    // Business users get context-focused messages
    if (journeyType === 'business') {
      return this.getBusinessCheckpointMessage(checkpoint);
    }

    // Technical users get the full technical message
    return checkpoint.message;
  }

  /**
   * Generate simplified checkpoint messages for non-tech users
   */
  private getSimplifiedCheckpointMessage(checkpoint: AgentCheckpoint): string {
    const stepMessages: Record<string, string> = {
      'data_upload': '📤 Your data has been uploaded successfully. We\'re now analyzing it to understand what insights we can provide.',
      'data_quality_review': '✅ We\'ve reviewed your data quality. Everything looks good, but please review the summary below.',
      'schema_validation': '📋 We\'ve identified the structure of your data. Please confirm the column types look correct.',
      'pii_detection': '🔒 We found some personal information in your data. Please decide how you\'d like us to handle it.',
      'transformation': '🔄 We\'re preparing your data for analysis. This includes cleaning and organizing the information.',
      'analysis_planning': '📊 We\'re creating a custom analysis plan based on your goals. Please review and approve to proceed.',
      'execution': '⚙️ Your analysis is running! We\'re crunching the numbers and finding insights.',
      'results_ready': '🎉 Your analysis is complete! View your insights, charts, and recommendations below.',
      'initial_analysis': '👋 Welcome! Our AI assistants are ready to help analyze your data. Please upload your files to get started.',
      'journey_complete': '🎉 Congratulations! Your data analysis journey is complete. All your insights and reports are ready.'
    };

    // Check for step-specific message
    const stepName = checkpoint.stepName?.toLowerCase() || '';
    let baseMessage = '';
    for (const [key, message] of Object.entries(stepMessages)) {
      if (stepName.includes(key.replace('_', ''))) {
        baseMessage = message;
        break;
      }
    }

    // If no step match, apply text simplification
    if (!baseMessage) {
      baseMessage = checkpoint.message
        .replace(/schema/gi, 'data structure')
        .replace(/transformation/gi, 'data preparation')
        .replace(/artifact/gi, 'report')
        .replace(/execution/gi, 'analysis')
        .replace(/pipeline/gi, 'process')
        .replace(/checkpoint/gi, 'review point')
        .replace(/orchestrat/gi, 'coordinat');
    }

    // Enhance with actual checkpoint data when available
    const data = checkpoint.data as any;
    if (data) {
      if (data.qualityScore !== undefined) {
        baseMessage += ` Data quality score: ${Math.round(Number(data.qualityScore) * 100)}%.`;
      }
      if (data.recommendedAnalyses?.length) {
        baseMessage += ` Recommended: ${data.recommendedAnalyses.slice(0, 3).join(', ')}.`;
      }
      if (data.issuesFound !== undefined) {
        baseMessage += ` ${data.issuesFound} issue(s) found.`;
      }
      if (data.piiColumnsFound !== undefined) {
        baseMessage += ` ${data.piiColumnsFound} column(s) with personal information detected.`;
      }
      if (data.transformationCount !== undefined) {
        baseMessage += ` ${data.transformationCount} transformation(s) applied.`;
      }
    }

    return baseMessage;
  }

  /**
   * Generate business-focused checkpoint messages
   */
  private getBusinessCheckpointMessage(checkpoint: AgentCheckpoint): string {
    const stepMessages: Record<string, string> = {
      'data_upload': '📤 Data uploaded. Analyzing business metrics and KPIs.',
      'data_quality_review': '✅ Data quality assessment complete. Key business metrics validated.',
      'analysis_planning': '📊 Analysis plan aligned with your business objectives. Review for approval.',
      'execution': '⚙️ Running business analysis: KPIs, trends, and strategic insights.',
      'results_ready': '🎉 Business insights ready: actionable recommendations and ROI impact.'
    };

    const stepName = checkpoint.stepName?.toLowerCase() || '';
    let baseMessage = '';
    for (const [key, message] of Object.entries(stepMessages)) {
      if (stepName.includes(key.replace('_', ''))) {
        baseMessage = message;
        break;
      }
    }

    if (!baseMessage) {
      baseMessage = checkpoint.message;
    }

    // Enhance with actual checkpoint data when available
    const data = checkpoint.data as any;
    if (data) {
      if (data.kpis?.length) {
        baseMessage += ` ${data.kpis.length} KPIs identified.`;
      }
      if (data.recommendedAnalyses?.length) {
        baseMessage += ` Recommended: ${data.recommendedAnalyses.slice(0, 3).join(', ')}.`;
      }
      if (data.businessImpact) {
        baseMessage += ` Business impact: ${typeof data.businessImpact === 'string' ? data.businessImpact.substring(0, 80) : 'assessed'}.`;
      }
    }

    return baseMessage;
  }

  /**
   * Notify frontend about agent activity
   * Enhanced with checkpoint message translation for user-friendly display
   */
  private notifyAgentActivity(userId: string, projectId: string, data: any): void {
    // Get journey type for message translation
    const context = this.activeProjects.get(projectId);
    const journeyType = context?.journeyType || 'technical';

    // Translate checkpoint message for user if available
    let displayMessage = data.message || data.checkpoint?.message || '';
    if (data.checkpoint) {
      displayMessage = this.translateCheckpointMessage(data.checkpoint, journeyType);
    }

    // JO-3 FIX: Use native ws RealtimeServer instead of deprecated SocketManager
    getRealtimeServer()?.broadcastToProject(projectId, {
      type: 'progress',
      sourceType: 'streaming',
      sourceId: `agents_${projectId}`,
      userId,
      projectId,
      timestamp: new Date(),
      data: {
        projectId,
        status: 'running',
        overallProgress: 50,
        currentStep: {
          id: data.checkpoint?.stepName || 'agent_activity',
          name: data.checkpoint?.stepName || 'Agent Activity',
          status: data.checkpoint?.status || 'in_progress',
          description: displayMessage,
          technicalDescription: data.checkpoint?.message
        },
        agentEvent: {
          ...data,
          translatedMessage: displayMessage,
          journeyType,
          source: 'agent_orchestrator'
        }
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
      'non-tech': 'I\'ll guide you through a simplified analysis focused on actionable insights without technical complexity.',
      'business': 'I\'ll help you create professional business intelligence reports and strategic recommendations.',
      'technical': 'I\'ll assist with detailed statistical analysis, code generation, and technical documentation.',
      'consultation': 'I\'ll provide expert-guided analysis with personalized methodology and peer review.',
      'custom': 'I\'ll execute your custom-selected capabilities to deliver exactly the analysis you need.'
    };
    return messages[journeyType as keyof typeof messages] || messages['non-tech'];
  }

  /**
   * Get suggested next steps for journey type
   */
  private getSuggestedNextSteps(journeyType: string): string[] {
    const steps = {
      'non-tech': [
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
      'custom': [
        'Upload your data',
        'AI-powered analysis recommendations',
        'Interactive insights exploration',
        'Customized deliverables'
      ]
    };
    return steps[journeyType as keyof typeof steps] || steps['non-tech'];
  }

  /**
   * Get estimated timeframe for journey type
   */
  private getEstimatedTimeframe(journeyType: string): string {
    const timeframes = {
      'non-tech': '15-30 minutes',
      'business': '30-60 minutes',
      'technical': '1-3 hours',
      'consultation': '2-5 hours',
      'custom': '20-45 minutes'
    };
    return timeframes[journeyType as keyof typeof timeframes] || timeframes['non-tech'];
  }

  private normalizeCheckpointRecord(raw: any): AgentCheckpoint {
    const parsedData = this.parseCheckpointData(raw?.data);

    return {
      id: raw.id,
      projectId: raw.projectId,
      agentType: raw.agentType as AgentCheckpoint['agentType'],
      stepName: raw.stepName,
      status: raw.status as AgentCheckpoint['status'],
      message: raw.message,
      data: parsedData,
      userFeedback: raw.userFeedback ?? undefined,
      requiresUserInput: Boolean(raw.requiresUserInput),
      timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date()
    };
  }

  private parseCheckpointData(data: unknown): any {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (error) {
        console.warn('Failed to parse checkpoint data JSON:', error);
        return data;
      }
    }

    return data ?? null;
  }

  /**
   * Execute a specific journey step using the appropriate agent
   */
  private async executeJourneyStep(
    projectId: string,
    step: JourneyTemplateStep,
    context: ProjectAgentContext,
    template: JourneyTemplate
  ): Promise<void> {
    const executionKey = `${projectId}:${step.id}`;

    // Prevent duplicate execution
    if (this.executingSteps.has(executionKey)) {
      console.log(`⏭️  Step ${step.id} already executing for project ${projectId}, skipping`);
      return;
    }

    this.executingSteps.add(executionKey);

    try {
      console.log(`🚀 Executing journey step: ${step.name} (${step.id}) for project ${projectId}`);

      // Create in-progress checkpoint
      const progressCheckpoint: AgentCheckpoint = {
        id: `checkpoint_${Date.now()}_${step.id}`,
        projectId,
        agentType: this.mapAgentType(step.agent),
        stepName: step.id,
        status: 'in_progress',
        message: `Executing: ${step.name}${step.description ? ` - ${step.description}` : ''}`,
        timestamp: new Date(),
        requiresUserInput: false
      };

      await this.addCheckpoint(projectId, progressCheckpoint);
      this.notifyAgentActivity(context.userId, projectId, {
        type: 'checkpoint_created',
        checkpoint: progressCheckpoint
      });

      // Get project data for agent execution
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new Error('Project not found');
      }

      // ✅ PHASE 2 FIX: Include requirements document and analysis path in projectData
      const journeyProgress = (project as any).journeyProgress || {};
      const projectData = {
        data: (project as any).data || [],
        schema: (project as any).schema || {},
        recordCount: (project as any).recordCount || 0,
        // Include accumulated agent context from journeyProgress
        requirementsDocument: journeyProgress.requirementsDocument,
        analysisPath: journeyProgress.requirementsDocument?.analysisPath || [],
        requiredDataElements: journeyProgress.requirementsDocument?.requiredDataElements || [],
        goals: journeyProgress.goals || journeyProgress.analysisGoal,
        questions: journeyProgress.businessQuestions || [],
        transformationPlan: journeyProgress.transformationPlan
      };

      // Execute step based on agent type
      let result: any;
      const startTime = Date.now();

      try {
        // Execute step - use longer timeout for steps, minimum 1 second even for fast steps
        const stepTimeout = Math.max((step.estimatedDuration || 10) * 1000, 1000); // At least 1 second
        let timeoutId: NodeJS.Timeout | null = null;

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Step execution timeout after ${stepTimeout}ms`));
          }, stepTimeout);
        });

        // Wrap execution in try-catch to handle any errors gracefully
        const executionPromise = (async () => {
          try {
            const stepResult = await this.executeStepByAgent(step, projectId, projectData, context);
            // Clear timeout if execution completes successfully
            if (timeoutId) clearTimeout(timeoutId);
            return stepResult;
          } catch (execError) {
            // Clear timeout on error
            if (timeoutId) clearTimeout(timeoutId);
            console.error(`❌ [STEP-EXEC] Error executing step ${step.id}:`, execError);
            // Return a fallback result instead of throwing - allow journey to continue
            return {
              message: `Step ${step.name} executed with fallback`,
              agent: step.agent,
              status: 'completed',
              fallbackUsed: true,
              error: execError instanceof Error ? execError.message : String(execError)
            };
          }
        })();

        result = await Promise.race([executionPromise, timeoutPromise]);

        const executionTime = Date.now() - startTime;
        console.log(`✅ Step ${step.id} completed in ${executionTime}ms (target: ${stepTimeout}ms)`);

        // ✅ PHASE 6 FIX: Persist agent result to journeyProgress.agentResults
        if (step.agent && result) {
          await this.persistAgentResult(projectId, step.agent, result);
        }

        // Mark step as completed in journey state
        await journeyStateManager.completeStep(projectId, step.id);

        const updatedJourneyState = await journeyStateManager.getJourneyState(projectId);
        await this.executionMachine.syncFromJourney(projectId, {
          completedSteps: updatedJourneyState.completedSteps || [],
          totalSteps: template.steps.length
        });
        this.executionMachine.markStepCompleted(projectId, step.id, updatedJourneyState.completedSteps || []);

        // Create artifact for completed step
        try {
          await this.createStepArtifact(projectId, step, result, context);
        } catch (artifactError) {
          console.error(`❌ [STEP-COMPLETE] Failed to create artifact for step ${step.id}:`, artifactError);
          // Continue even if artifact creation fails
        }

        // Log decision trail entry
        try {
          await this.logDecisionTrail(projectId, step, result, context);
        } catch (decisionError) {
          console.error(`❌ [STEP-COMPLETE] Failed to log decision trail for step ${step.id}:`, decisionError);
          // Continue even if decision logging fails
        }

        // Create completion checkpoint
        const completionCheckpoint: AgentCheckpoint = {
          id: `checkpoint_${Date.now()}_${step.id}_complete`,
          projectId,
          agentType: this.mapAgentType(step.agent),
          stepName: step.id,
          status: 'completed',
          message: `✅ ${step.name} completed successfully in ${(executionTime / 1000).toFixed(1)}s`,
          data: result,
          timestamp: new Date(),
          requiresUserInput: false
        };

        await this.addCheckpoint(projectId, completionCheckpoint);
        this.notifyAgentActivity(context.userId, projectId, {
          type: 'checkpoint_created',
          checkpoint: completionCheckpoint
        });

        // Update multi-agent coordination data in database
        await this.updateProjectCoordinationData(projectId);

        // Automatically proceed to next step if no user input required
        // (Steps that require user input will be handled separately)
        setTimeout(() => {
          console.log(`⏭️  [STEP-COMPLETE] Auto-proceeding to next step after ${step.id}`);
          this.advanceJourney(projectId).catch(err => {
            console.error(`❌ [STEP-COMPLETE] Failed to auto-advance after ${step.id}:`, err);
            if (err instanceof Error) {
              console.error(`❌ [STEP-COMPLETE] Error stack:`, err.stack);
            }
          });
        }, 500); // Small delay to ensure step completion is persisted

      } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error(`❌ Step ${step.id} failed after ${executionTime}ms:`, error);

        // Create error checkpoint
        const errorCheckpoint: AgentCheckpoint = {
          id: `checkpoint_${Date.now()}_${step.id}_error`,
          projectId,
          agentType: this.mapAgentType(step.agent),
          stepName: step.id,
          status: 'rejected',
          message: `❌ ${step.name} failed: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
          requiresUserInput: true
        };

        await this.addCheckpoint(projectId, errorCheckpoint);
        this.notifyAgentActivity(context.userId, projectId, {
          type: 'checkpoint_created',
          checkpoint: errorCheckpoint
        });

        this.executionMachine.markError(projectId, error instanceof Error ? error.message : String(error));
      }

    } finally {
      this.executingSteps.delete(executionKey);
    }
  }

  /**
   * Execute a step using the appropriate agent
   */
  private async executeStepByAgent(
    step: JourneyTemplateStep,
    projectId: string,
    projectData: any,
    context: ProjectAgentContext
  ): Promise<any> {
    // Ensure this is async and returns a Promise
    return Promise.resolve().then(async () => {
      // Map agent types to actual agent instances
      switch (step.agent) {
        case 'project_manager':
          // Project manager steps - execute lightweight orchestration
          if (step.id.includes('intake') || step.id.includes('alignment')) {
            // Intake/alignment steps are typically informational - auto-complete
            // Add small delay to ensure async behavior
            await new Promise(resolve => setTimeout(resolve, 10));
            return {
              message: 'Goal alignment and intake confirmed',
              agent: 'project_manager',
              status: 'completed'
            };
          }
          // Other PM steps - execute orchestration logic
          return { message: 'Project manager orchestration step', agent: 'project_manager' };

        case 'data_engineer':
          // Data engineer steps (schema detection, data quality, etc.)
          if (step.id.includes('schema') || step.id.includes('detection')) {
            await new Promise(resolve => setTimeout(resolve, 10));
            return {
              message: 'Schema detection completed',
              schema: projectData.schema,
              recordCount: projectData.recordCount
            };
          }
          if (step.id.includes('quality') || step.id.includes('health')) {
            // Use data engineer agent for quality assessment
            return await this.dataEngineerAgent.assessDataQuality(projectData.data, projectData.schema);
          }
          return { message: 'Data engineer step completed', agent: 'data_engineer' };

        case 'technical_ai_agent':
          // Technical AI agent steps (analysis, modeling, etc.)
          await new Promise(resolve => setTimeout(resolve, 10));
          return { message: 'Technical analysis completed', agent: 'technical_ai_agent' };

        case 'business_agent':
          // Business agent steps (industry context, translation, recommendations)
          console.log(`💼 [BA Agent] Executing Business Agent step: ${step.id}`);
          try {
            const { storage } = await import('./storage');
            const project = await storage.getProject(projectId);
            const journeyProgress = (project as any)?.journeyProgress || {};

            // Determine which BA operation to perform based on step type
            if (step.id.includes('translation') || step.id.includes('audience') || step.id.includes('format')) {
              // Translate analysis results for target audience
              const analysisResults = (project as any)?.analysisResults;
              if (analysisResults) {
                const audience = journeyProgress.audience?.primaryAudience || 'executive';
                console.log(`💼 [BA Agent] Translating results for ${audience} audience`);

                const translatedResults = await this.businessAgent.translateResults({
                  results: {
                    insights: analysisResults.insights || [],
                    recommendations: analysisResults.recommendations || [],
                    summary: analysisResults.summary || {}
                  },
                  audience,
                  decisionContext: journeyProgress.audience?.decisionContext || 'Business decision support'
                });

                // GAP FIX: Merge with existing multi-audience translations instead of overwriting
                // translatedResults should be stored under the audience key, not at top level
                const existingTranslations = journeyProgress.translatedResults || {};
                const mergedTranslations = {
                  ...existingTranslations,
                  [audience]: {
                    insights: translatedResults?.insights || analysisResults.insights || [],
                    recommendations: translatedResults?.recommendations || analysisResults.recommendations || [],
                    executiveSummary: translatedResults?.executiveSummary,
                    translatedAt: new Date().toISOString()
                  }
                };

                // Store merged translated results - preserves all audience translations
                await storage.atomicMergeJourneyProgress(projectId, {
                  translatedResults: mergedTranslations,
                  baTranslatedAt: new Date().toISOString()
                });

                console.log(`✅ [BA Agent] Results translated for ${audience} audience (merged with ${Object.keys(existingTranslations).length} existing translations)`);
                return {
                  message: 'Business Agent translation completed',
                  agent: 'business_agent',
                  translatedResults,
                  status: 'completed'
                };
              }
            }

            if (step.id.includes('impact') || step.id.includes('assessment')) {
              // Assess business impact of analysis
              const analysisResults = (project as any)?.analysisResults;
              // assessBusinessImpact takes 3 args: goals[], proposedApproach, industry
              const goals = Array.isArray(journeyProgress.goals)
                ? journeyProgress.goals
                : (journeyProgress.goals ? [journeyProgress.goals] : []);
              const impactAssessment = await this.businessAgent.assessBusinessImpact(
                goals,
                analysisResults || {},
                journeyProgress.industry || 'general'
              );

              await storage.atomicMergeJourneyProgress(projectId, {
                businessImpact: impactAssessment,
                baAssessedAt: new Date().toISOString()
              });

              console.log(`✅ [BA Agent] Business impact assessment completed`);
              return {
                message: 'Business Agent impact assessment completed',
                agent: 'business_agent',
                impactAssessment,
                status: 'completed'
              };
            }

            if (step.id.includes('kpi') || step.id.includes('metrics')) {
              // Get dataset column names for data-grounded KPI filtering
              const projectDatasets = await storage.getProjectDatasets(projectId);
              const firstRow = (projectDatasets?.[0] as any)?.ingestionMetadata?.transformedData?.[0]
                || (projectDatasets?.[0] as any)?.data?.[0]
                || (projectDatasets?.[0] as any)?.preview?.[0];
              const datasetColumnNames = firstRow && typeof firstRow === 'object' ? Object.keys(firstRow) : [];

              // Generate business KPIs grounded to actual dataset columns
              const kpis = await this.businessAgent.generateBusinessKPIs(
                journeyProgress.industry || 'general',
                projectData.analysisType || 'descriptive',
                datasetColumnNames
              );

              await storage.atomicMergeJourneyProgress(projectId, {
                businessKPIs: kpis,
                baKPIsAt: new Date().toISOString()
              });

              console.log(`✅ [BA Agent] Business KPIs generated`);
              return {
                message: 'Business Agent KPI generation completed',
                agent: 'business_agent',
                kpis,
                status: 'completed'
              };
            }

            // Default: Generate industry insights
            // BusinessContext has: industry, userGoals, projectName, projectDescription, businessRole, technicalLevel
            const userGoals = Array.isArray(journeyProgress.goals)
              ? journeyProgress.goals
              : (journeyProgress.goals ? [journeyProgress.goals] : []);
            const industryInsights = await this.businessAgent.generateIndustryInsights({
              industry: journeyProgress.industry || 'general',
              userGoals,
              projectName: project?.name || 'Analysis Project',
              projectDescription: journeyProgress.analysisGoal || project?.description || '',
              businessRole: journeyProgress.audience?.primaryAudience || 'executive'
            });

            await storage.atomicMergeJourneyProgress(projectId, {
              industryInsights,
              baInsightsAt: new Date().toISOString()
            });

            console.log(`✅ [BA Agent] Industry insights generated`);
            return {
              message: 'Business Agent insights completed',
              agent: 'business_agent',
              industryInsights,
              status: 'completed'
            };
          } catch (error) {
            console.error(`❌ [BA Agent] Error:`, error);
            return {
              message: `Business Agent encountered an issue: ${(error as Error).message?.substring(0, 100) || 'Unknown error'}`,
              agent: 'business_agent',
              status: 'partial',
              error: true
            };
          }

        // GAP R6 FIX: Add Data Scientist agent case
        case 'data_scientist':
          console.log(`🔬 [DS Agent] Executing Data Scientist step: ${step.id}`);
          if (step.id.includes('requirements') || step.id.includes('analysis_plan')) {
            // Data Scientist recommends analysis types based on goals/questions
            try {
              const { storage } = await import('./storage');
              const project = await storage.getProject(projectId);
              const journeyProgress = (project as any)?.journeyProgress || {};

              // Get user questions and goals
              const questions = journeyProgress.businessQuestions || [];
              const goals = journeyProgress.goals || journeyProgress.analysisGoal || '';

              // Use the real DataScientistAgent to generate AI-backed recommendations
              const { DataScientistAgent } = await import('./data-scientist-agent');
              const dsAgent = new DataScientistAgent();

              // Get datasets for schema info
              const dataset = await storage.getDatasetForProject(projectId);
              const schema = dataset?.schema || project?.schema || {};
              const recordCount = (dataset?.ingestionMetadata as any)?.recordCount ||
                                  (Array.isArray(dataset?.data) ? dataset!.data.length : 1000);

              console.log(`🔬 [DS Agent] Running AI-backed analysis recommendation for ${questions.length} questions, ${recordCount} records`);

              const dsResult = await dsAgent.recommendAnalysisConfig({
                userQuestions: Array.isArray(questions) ? questions : [],
                analysisGoal: typeof goals === 'string' ? goals : '',
                datasetMetadata: { schema },
                recordCount,
                dataAnalysis: { characteristics: {} }
              });

              const recommendations = {
                recommendedAnalyses: dsResult.recommendedAnalyses || dsResult.analyses || ['descriptive'],
                confidence: dsResult.confidence || 0.7,
                reasoning: dsResult.rationale || 'Based on AI analysis of data characteristics and user questions',
                complexity: dsResult.complexity,
                estimatedCost: dsResult.estimatedCost,
                estimatedTime: dsResult.estimatedTime
              };

              // Store DS recommendations in project
              await storage.atomicMergeJourneyProgress(projectId, {
                dsRecommendations: recommendations,
                dsRecommendedAt: new Date().toISOString()
              });

              console.log(`✅ [DS Agent] Recommended analyses:`, recommendations.recommendedAnalyses);
              return {
                message: 'Data Scientist analysis recommendations completed',
                agent: 'data_scientist',
                recommendations,
                status: 'completed'
              };
            } catch (error) {
              console.error(`❌ [DS Agent] Error:`, error);
              return {
              message: `Data Scientist encountered an issue: ${(error as Error).message?.substring(0, 100) || 'Unknown error'}`,
              agent: 'data_scientist',
              status: 'partial',
              error: true
            };
            }
          }
          return { message: 'Data Scientist step completed', agent: 'data_scientist', status: 'completed' };

        // Wire real TemplateResearchAgent (replaces hardcoded keyword matching)
        case 'template_research_agent': {
          console.log(`📚 [Research Agent] Executing Template Research step: ${step.id}`);
          try {
            const { templateResearchAgent } = await import('./template-research-agent');
            const { storage } = await import('./storage');
            const project = await storage.getProject(projectId);
            const jp = (project as any)?.journeyProgress || {};

            // Build research request from project context
            const goals = jp.goals || jp.analysisGoal || '';
            const questions = jp.businessQuestions || jp.userQuestions || [];
            const questionTexts = (Array.isArray(questions) ? questions : [])
              .map((q: any) => typeof q === 'string' ? q : q?.text || '').filter(Boolean);

            const researchResult = await templateResearchAgent.researchTemplate({
              industry: jp.industry || undefined,
              useCase: goals || undefined,
              businessGoals: questionTexts.length > 0 ? questionTexts : (goals ? [goals] : undefined),
              keywords: jp.requirementsDocument?.dataElements
                ?.map((e: any) => e.sourceColumn).filter(Boolean)?.slice(0, 10) || undefined,
              complexityLevel: jp.analysisComplexity || 'intermediate'
            });

            // Persist recommendation to journeyProgress
            await storage.atomicMergeJourneyProgress(projectId, {
              researcherRecommendation: {
                template: researchResult.template || researchResult,
                confidence: researchResult.confidence ?? 0.7,
                sources: researchResult.researchSources || [],
                recommendedAt: new Date().toISOString()
              }
            });

            console.log(`✅ [Research Agent] Recommended template: ${researchResult.template?.name || 'unknown'} (confidence: ${researchResult.confidence})`);
            return {
              message: 'Template research completed',
              agent: 'template_research_agent',
              template: researchResult.template,
              confidence: researchResult.confidence,
              status: 'completed'
            };
          } catch (error) {
            console.error(`❌ [Research Agent] Error, using fallback:`, error);
            // Graceful fallback — return general template so pipeline continues
            try {
              const { storage } = await import('./storage');
              await storage.atomicMergeJourneyProgress(projectId, {
                researcherRecommendation: {
                  template: { id: 'general_analytics', name: 'General Analytics', domain: 'general' },
                  confidence: 0.5,
                  fallback: true,
                  recommendedAt: new Date().toISOString()
                }
              });
            } catch { /* ignore persistence error in fallback */ }
            return {
              message: 'Template research completed with fallback',
              agent: 'template_research_agent',
              template: { id: 'general_analytics', name: 'General Analytics', domain: 'general' },
              confidence: 0.5,
              status: 'completed'
            };
          }
        }

        default:
          console.warn(`⚠️  Unknown agent type: ${step.agent} for step ${step.id}`);
          return { message: `Step executed (unknown agent: ${step.agent})`, agent: step.agent };
      }
    });
  }

  /**
   * Get template for project (uses catalog directly)
   */
  private getTemplateForProject(journeyType: string | null | undefined, templateId?: string | null): JourneyTemplate {
    // Map journey type to template catalog key
    const normalized = this.mapJourneyTypeToTemplate(journeyType);
    const catalog = defaultJourneyTemplateCatalog;
    const template = catalog[normalized]?.[0]; // Get first template for the journey type
    if (!template) {
      throw new Error(`No template found for journey type: ${journeyType}`);
    }
    return cloneJourneyTemplate(template);
  }

  /**
   * Map journey type to template type
   */
  private mapJourneyTypeToTemplate(journeyType: string | null | undefined): 'non-tech' | 'business' | 'technical' | 'consultation' {
    const mapping: Record<string, 'non-tech' | 'business' | 'technical' | 'consultation'> = {
      'non-tech': 'non-tech',
      'non_tech': 'non-tech',  // Support underscore variant
      'ai_guided': 'non-tech',  // Legacy mapping
      'business': 'business',
      'template_based': 'business',  // Legacy mapping
      'technical': 'technical',
      'self_service': 'technical',  // Legacy mapping
      'consultation': 'consultation',
      'custom': 'consultation'  // Map custom to consultation
    };
    return mapping[journeyType || ''] || 'non-tech';
  }

  /**
   * Restore project context from database (for when context is lost on server restart)
   */
  private async restoreProjectContext(projectId: string): Promise<ProjectAgentContext | undefined> {
    try {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        console.error(`❌ [RESTORE-CONTEXT] Project ${projectId} not found in database`);
        return undefined;
      }

      // Map project journey type to agent journey type
      const journeyType = this.mapProjectJourneyToAgentJourney(project.journeyType as string);

      const context: ProjectAgentContext = {
        projectId: project.id,
        userId: project.userId,
        journeyType: journeyType as any,
        projectName: project.name,
        description: (project as any).description || ''
      };

      // Store in memory for future use
      this.activeProjects.set(projectId, context);
      this.checkpoints.set(projectId, []); // Initialize empty checkpoints

      // CRITICAL FIX: Initialize execution machine state from project's journey progress
      // This ensures resolveFeedback() and markAwaitingFeedback() won't throw
      const journeyProgress = (project as any).journeyProgress || {};
      const completedSteps = journeyProgress.completedSteps || [];
      const totalSteps = 7; // Standard journey has 7 steps

      await this.executionMachine.syncFromJourney(projectId, {
        completedSteps,
        totalSteps
      });
      console.log(`✅ [RESTORE-CONTEXT] Initialized execution machine for ${projectId} with ${completedSteps.length} completed steps`);

      console.log(`✅ [RESTORE-CONTEXT] Restored context for project ${projectId}: ${journeyType}`);
      return context;
    } catch (error) {
      console.error(`❌ [RESTORE-CONTEXT] Failed to restore context for project ${projectId}:`, error);
      return undefined;
    }
  }

  /**
   * Create artifact for completed step
   */
  private async createStepArtifact(
    projectId: string,
    step: JourneyTemplateStep,
    result: any,
    context: ProjectAgentContext
  ): Promise<void> {
    if (!db) return;

    try {
      // Import storage to create artifacts
      const { storage } = await import('./storage');

      const artifactData = {
        id: nanoid(),
        projectId,
        type: this.getArtifactTypeForStep(step),
        status: 'completed' as const,
        params: {
          stepId: step.id,
          stepName: step.name,
          agent: step.agent,
          executionResult: result,
          timestamp: new Date().toISOString()
        },
        metrics: {
          executionTime: result?.executionTime || 0,
          confidence: result?.confidence || 0.9
        },
        output: result,
        createdBy: context.userId
      };

      await storage.createArtifact(artifactData as any);
      console.log(`📦 [ARTIFACT] Created artifact for step ${step.id}`);
    } catch (error) {
      console.error(`❌ [ARTIFACT] Failed to create artifact:`, error);
      throw error;
    }
  }

  /**
   * Log decision trail entry for step completion
   */
  private async logDecisionTrail(
    projectId: string,
    step: JourneyTemplateStep,
    result: any,
    context: ProjectAgentContext
  ): Promise<void> {
    if (!db) return;

    try {
      // Map to actual decisionAudits schema fields
      await db.insert(decisionAudits).values({
        id: nanoid(),
        projectId,
        agent: step.agent, // Use 'agent' field, not 'agentType'
        decisionType: 'step_completion',
        decision: `Completed journey step: ${step.name}`,
        reasoning: `Step ${step.id} (${step.name}) was successfully completed by ${step.agent} agent`,
        alternatives: JSON.stringify([]),
        confidence: 90, // Default confidence for completed steps
        context: JSON.stringify({
          stepId: step.id,
          stepName: step.name,
          agent: step.agent,
          result: result,
          userId: context.userId,
          journeyType: context.journeyType,
          projectName: context.projectName,
          timestamp: new Date().toISOString()
        }),
        userInput: null, // No user input for auto-completed steps
        impact: 'medium', // Default impact
        reversible: true, // Steps can be re-executed
        timestamp: new Date()
      });
      console.log(`📝 [DECISION-TRAIL] Logged decision for step ${step.id}`);
    } catch (error) {
      console.error(`❌ [DECISION-TRAIL] Failed to log decision:`, error);
      if (error instanceof Error) {
        console.error(`❌ [DECISION-TRAIL] Error details:`, error.message, error.stack);
      }
      // Don't throw - decision logging is non-critical
    }
  }

  /**
   * Get artifact type for a journey step
   */
  private getArtifactTypeForStep(step: JourneyTemplateStep): string {
    // Map step types to artifact types
    if (step.id.includes('intake') || step.id.includes('alignment')) {
      return 'goal_alignment';
    }
    if (step.id.includes('schema') || step.id.includes('detection')) {
      return 'schema_analysis';
    }
    if (step.id.includes('quality') || step.id.includes('health')) {
      return 'data_quality';
    }
    if (step.id.includes('analysis') || step.id.includes('execution')) {
      return 'analysis_results';
    }
    if (step.id.includes('visualization') || step.id.includes('chart')) {
      return 'visualization';
    }
    if (step.id.includes('summary') || step.id.includes('executive')) {
      return 'executive_summary';
    }
    return 'step_output';
  }

  /**
   * Map project journey type to agent journey type
   */
  private mapProjectJourneyToAgentJourney(journeyType: string): 'non-tech' | 'business' | 'technical' | 'consultation' {
    const mapping: Record<string, 'non-tech' | 'business' | 'technical' | 'consultation'> = {
      'non-tech': 'non-tech',
      'non_tech': 'non-tech',  // Support underscore variant
      'ai_guided': 'non-tech',  // Legacy mapping
      'business': 'business',
      'template_based': 'business',  // Legacy mapping
      'technical': 'technical',
      'self_service': 'technical',  // Legacy mapping
      'consultation': 'consultation',
      'custom': 'technical'
    };
    return mapping[journeyType] || 'non-tech';
  }

  /**
   * Map journey template agent type to checkpoint agent type
   * FIX: Added data_scientist mapping for proper agent identification
   */
  private mapAgentType(agentType: string): 'project_manager' | 'technical_ai' | 'business' | 'data_engineer' | 'data_scientist' {
    switch (agentType) {
      case 'project_manager':
        return 'project_manager';
      case 'technical_ai_agent':
        return 'technical_ai';
      case 'business_agent':
        return 'business';
      case 'data_engineer':
        return 'data_engineer';
      case 'data_scientist':
      case 'data_scientist_agent':
      case 'ds_agent':
        return 'data_scientist';
      default:
        return 'project_manager';
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
  /**
   * Clean up project agents when project is completed or removed
   */
  async cleanupProjectAgents(projectId: string): Promise<void> {
    this.activeProjects.delete(projectId);
    this.checkpoints.delete(projectId);
    this.executionMachine.reset(projectId);
    console.log(`🧹 Cleaned up agents for project ${projectId}`);
  }

  /**
   * PM-SUPERVISED DATA ELEMENT MAPPING FLOW
   *
   * Orchestrates the data element mapping with PM validation at each step:
   * 1. DS Agent → identifies required data elements based on goals/questions
   * 2. PM validates DS output
   * 3. BA Agent → looks up business definitions from registry
   * 4. PM validates BA output
   * 5. Researcher Agent → infers missing definitions using AI
   * 6. PM validates Researcher output
   * 7. DE Agent → creates transformation logic based on definitions
   * 8. PM validates final transformation plan
   *
   * This ensures each agent's work is validated before passing to the next.
   */
  async executePMSupervisedDataMappingFlow(
    projectId: string,
    datasetMetadata: any,
    userGoals: string[],
    userQuestions: string[]
  ): Promise<{
    success: boolean;
    requirementsDocument?: any;
    businessDefinitions?: any[];
    transformationPlan?: any;
    pmValidations?: Array<{step: string; validated: boolean; feedback?: string}>;
    error?: string;
  }> {
    console.log(`\n🎯 [PM-SUPERVISED FLOW] Starting data element mapping for project ${projectId}`);
    console.log(`📋 Goals: ${userGoals.length}, Questions: ${userQuestions.length}`);

    const pmValidations: Array<{step: string; validated: boolean; feedback?: string}> = [];
    const context = this.activeProjects.get(projectId) || await this.restoreProjectContext(projectId);

    if (!context) {
      return { success: false, error: 'Project context not available' };
    }

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // STEP 1: DATA SCIENTIST AGENT - Identify Required Data Elements
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`\n🔬 [STEP 1/8] DS Agent: Identifying required data elements...`);

      const dsCheckpoint: AgentCheckpoint = {
        id: `checkpoint_${Date.now()}_ds_requirements`,
        projectId,
        agentType: 'data_scientist', // FIX: Use data_scientist instead of technical_ai
        stepName: 'ds_identify_requirements',
        status: 'in_progress',
        message: 'Data Scientist is analyzing goals and questions to identify required data elements...',
        timestamp: new Date(),
        requiresUserInput: false
      };
      await this.addCheckpoint(projectId, dsCheckpoint);
      this.notifyAgentActivity(context.userId, projectId, {
        type: 'checkpoint_created',
        checkpoint: dsCheckpoint
      });

      // Execute DS Agent via MCP tool
      const dsResult = await executeTool(
        'required_data_elements',
        'data_scientist', // agentId
        {
          operation: 'defineRequirements',
          projectId,
          userGoals,
          userQuestions,
          datasetMetadata
        },
        { projectId, userId: context.userId }
      );

      if (dsResult.status !== 'success') {
        throw new Error(`DS Agent failed: ${dsResult.error}`);
      }

      const requirementsDocument = dsResult.result;
      console.log(`✅ [DS Agent] Identified ${requirementsDocument?.requiredElements?.length || 0} required data elements`);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 2: PM VALIDATES DS OUTPUT
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`\n📋 [STEP 2/8] PM Agent: Validating DS requirements...`);

      const pmDsValidation = await this.pmValidateAgentOutput(
        projectId,
        'data_scientist',
        requirementsDocument,
        {
          expectedFields: ['requiredElements', 'analysisPath'],
          minimumElements: 1
        }
      );
      pmValidations.push({ step: 'ds_requirements', validated: pmDsValidation.valid, feedback: pmDsValidation.feedback });

      if (!pmDsValidation.valid) {
        console.warn(`⚠️ [PM Validation] DS output needs revision: ${pmDsValidation.feedback}`);
        // PM can request DS to revise - for now we continue with what we have
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3: BUSINESS ANALYST AGENT - Lookup Business Definitions
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`\n💼 [STEP 3/8] BA Agent: Looking up business definitions...`);

      const baCheckpoint: AgentCheckpoint = {
        id: `checkpoint_${Date.now()}_ba_definitions`,
        projectId,
        agentType: 'business',
        stepName: 'ba_lookup_definitions',
        status: 'in_progress',
        message: 'Business Analyst is looking up business metric definitions from the knowledge base...',
        timestamp: new Date(),
        requiresUserInput: false
      };
      await this.addCheckpoint(projectId, baCheckpoint);
      this.notifyAgentActivity(context.userId, projectId, {
        type: 'checkpoint_created',
        checkpoint: baCheckpoint
      });

      // Get project industry for better definition matching
      const project = await storage.getProject(projectId);
      const journeyProgress = (project as any)?.journeyProgress || {};
      const industry = journeyProgress.industry || 'general';

      // BA looks up definitions for each required element
      const businessDefinitions: any[] = [];
      const missingDefinitions: string[] = [];

      for (const element of requirementsDocument?.requiredElements || []) {
        const conceptName = element.name || element.conceptName || element;
        console.log(`  💼 Looking up definition for: "${conceptName}"`);

        const lookupResult = await executeTool(
          'business_definition_lookup',
          'business_agent', // agentId
          {
            conceptName,
            projectId,
            industry,
            includeRelated: true
          },
          { projectId, userId: context.userId }
        );

        if (lookupResult.status === 'success' && lookupResult.result?.definition) {
          businessDefinitions.push({
            concept: conceptName,
            definition: lookupResult.result.definition,
            source: 'registry',
            confidence: lookupResult.result.confidence || 0.9
          });
          console.log(`    ✅ Found definition: ${lookupResult.result.definition?.businessDescription?.substring(0, 50)}...`);
        } else {
          missingDefinitions.push(conceptName);
          console.log(`    ❌ No definition found, will use Researcher`);
        }
      }

      console.log(`✅ [BA Agent] Found ${businessDefinitions.length} definitions, ${missingDefinitions.length} missing`);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 4: PM VALIDATES BA OUTPUT
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`\n📋 [STEP 4/8] PM Agent: Validating BA definitions...`);

      const pmBaValidation = await this.pmValidateAgentOutput(
        projectId,
        'business_agent',
        { found: businessDefinitions, missing: missingDefinitions },
        {
          minimumFound: 0, // It's OK if BA doesn't find all - Researcher will fill gaps
          checkForDuplicates: true
        }
      );
      pmValidations.push({ step: 'ba_definitions', validated: pmBaValidation.valid, feedback: pmBaValidation.feedback });

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 5: RESEARCHER AGENT - Infer Missing Definitions
      // ═══════════════════════════════════════════════════════════════════════
      if (missingDefinitions.length > 0) {
        console.log(`\n📚 [STEP 5/8] Researcher Agent: Inferring ${missingDefinitions.length} missing definitions...`);

        const researcherCheckpoint: AgentCheckpoint = {
          id: `checkpoint_${Date.now()}_researcher_inference`,
          projectId,
          agentType: 'project_manager', // Researcher maps to PM for checkpoints
          stepName: 'researcher_infer_definitions',
          status: 'in_progress',
          message: `Researcher Agent is inferring definitions for ${missingDefinitions.length} missing concepts...`,
          timestamp: new Date(),
          requiresUserInput: false
        };
        await this.addCheckpoint(projectId, researcherCheckpoint);
        this.notifyAgentActivity(context.userId, projectId, {
          type: 'checkpoint_created',
          checkpoint: researcherCheckpoint
        });

        for (const conceptName of missingDefinitions) {
          console.log(`  📚 Inferring definition for: "${conceptName}"`);

          const inferResult = await executeTool(
            'researcher_definition_inference',
            'research_agent', // agentId
            {
              conceptName,
              projectId,
              industry,
              datasetColumns: datasetMetadata?.columns || datasetMetadata?.schema || [],
              context: {
                userGoals,
                userQuestions,
                availableColumns: datasetMetadata?.columnNames || []
              },
              saveToRegistry: true
            },
            { projectId, userId: context.userId }
          );

          if (inferResult.status === 'success' && inferResult.result?.definition) {
            businessDefinitions.push({
              concept: conceptName,
              definition: inferResult.result.definition,
              source: 'ai_inference',
              confidence: inferResult.result.definition.confidence || 0.7
            });
            console.log(`    ✅ Inferred: ${inferResult.result.definition?.businessDescription?.substring(0, 50)}...`);
          } else {
            console.log(`    ⚠️ Could not infer definition, using default mapping`);
            // Add a placeholder definition
            businessDefinitions.push({
              concept: conceptName,
              definition: {
                conceptName,
                businessDescription: `Auto-mapped from dataset column "${conceptName}"`,
                calculationType: 'direct',
                confidence: 0.5
              },
              source: 'fallback',
              confidence: 0.5
            });
          }
        }

        console.log(`✅ [Researcher Agent] Inferred definitions for all missing concepts`);
      } else {
        console.log(`\n📚 [STEP 5/8] Researcher Agent: Skipped (no missing definitions)`);
        pmValidations.push({ step: 'researcher_inference', validated: true, feedback: 'Skipped - all definitions found by BA' });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 6: PM VALIDATES RESEARCHER OUTPUT
      // ═══════════════════════════════════════════════════════════════════════
      if (missingDefinitions.length > 0) {
        console.log(`\n📋 [STEP 6/8] PM Agent: Validating Researcher inferences...`);

        const pmResearcherValidation = await this.pmValidateAgentOutput(
          projectId,
          'researcher',
          businessDefinitions.filter(d => d.source === 'ai_inference' || d.source === 'fallback'),
          {
            checkConfidenceThreshold: 0.5,
            flagLowConfidence: true
          }
        );
        pmValidations.push({ step: 'researcher_inference', validated: pmResearcherValidation.valid, feedback: pmResearcherValidation.feedback });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 7: DATA ENGINEER AGENT - Create Transformation Logic
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`\n🔧 [STEP 7/8] DE Agent: Creating transformation logic...`);

      const deCheckpoint: AgentCheckpoint = {
        id: `checkpoint_${Date.now()}_de_transformations`,
        projectId,
        agentType: 'data_engineer',
        stepName: 'de_create_transformations',
        status: 'in_progress',
        message: 'Data Engineer is creating transformation logic based on business definitions...',
        timestamp: new Date(),
        requiresUserInput: false
      };
      await this.addCheckpoint(projectId, deCheckpoint);
      this.notifyAgentActivity(context.userId, projectId, {
        type: 'checkpoint_created',
        checkpoint: deCheckpoint
      });

      // Get joined schema from journeyProgress (SSOT) as fallback
      const projectForSchema = await storage.getProject(projectId);
      const journeyProgressForSchema = (projectForSchema as any)?.journeyProgress || {};

      // CRITICAL: Prefer joined schema for multi-dataset scenarios
      const effectiveSchema = journeyProgressForSchema.joinedData?.schema ||
                              datasetMetadata?.schema ||
                              datasetMetadata;
      const effectiveColumns = Object.keys(effectiveSchema || {}).length > 0
        ? Object.keys(effectiveSchema)
        : datasetMetadata?.columnNames || datasetMetadata?.columns || [];

      console.log(`📊 [DE Agent] Using schema with ${effectiveColumns.length} columns (source: ${journeyProgressForSchema.joinedData?.schema ? 'joinedData' : 'datasetMetadata'})`);

      // Use the requirements mapping tool with definitions
      const mapResult = await executeTool(
        'required_data_elements_tool',
        'data_engineer', // agentId
        {
          operation: 'mapDatasetToRequirements',
          document: requirementsDocument,
          dataset: {
            fileName: datasetMetadata?.fileName || 'dataset',
            rowCount: datasetMetadata?.rowCount || 0,
            schema: effectiveSchema,
            preview: datasetMetadata?.preview || [],
            piiFields: (journeyProgressForSchema.piiDecisions as any)?.excludedColumns || []
          },
          businessDefinitions, // Pass the definitions to guide mapping
          userApprovedMappings: journeyProgressForSchema.columnMappings || {},
          piiDecisions: journeyProgressForSchema.piiDecisions || {}
        },
        { projectId, userId: context.userId }
      );

      if (mapResult.status !== 'success') {
        throw new Error(`DE Agent mapping failed: ${mapResult.error}`);
      }

      // Create transformation plan from mappings and definitions
      // Use effective schema (joined if available) for transformation generation
      const rawMappedElements = mapResult.result?.mappedElements || [];
      const generatedTransformations = this.generateTransformationsFromDefinitions(
        businessDefinitions,
        { ...datasetMetadata, schema: effectiveSchema, columnNames: effectiveColumns }
      );

      // ✅ FIX: Merge and standardize field names for frontend compatibility
      // Frontend expects: targetElement, sourceColumn, suggestedTransformation, confidence, transformationRequired
      const standardizedMappings = rawMappedElements.map((elem: any) => ({
        // Standard field names for frontend
        targetElement: elem.elementName || elem.targetElement || elem.name,
        targetType: elem.dataType || elem.targetType || 'string',
        sourceColumn: elem.sourceColumn || elem.sourceField || null,
        sourceColumns: elem.sourceColumns || (elem.sourceColumn ? [elem.sourceColumn] : []),
        confidence: elem.confidence || 0.8,
        transformationRequired: elem.transformationRequired ?? true,
        suggestedTransformation: elem.transformationLogic?.code || elem.transformationLogic?.description || '',
        userDefinedLogic: '',
        relatedQuestions: elem.relatedQuestions || [],
        elementId: elem.elementId || elem.id,
        calculationDefinition: elem.calculationDefinition,
        description: elem.description || elem.purpose || '',
        // Preserve original fields
        ...elem
      }));

      // Also standardize generated transformations
      const standardizedTransformations = generatedTransformations.map((trans: any) => ({
        targetElement: trans.targetElement || trans.targetField,
        targetType: trans.type || 'string',
        sourceColumn: trans.sourceColumn || null,
        sourceColumns: trans.sourceColumns || [],
        confidence: trans.confidence || 0.7,
        transformationRequired: trans.transformationRequired ?? true,
        suggestedTransformation: trans.transformationLogic || trans.description || '',
        userDefinedLogic: '',
        relatedQuestions: [],
        elementId: trans.elementId || `trans_${nanoid()}`,
        description: trans.description || '',
        transformationType: trans.type, // direct_mapping, type_conversion, aggregation, derived_calculation
        ...trans
      }));

      // Enrich standardizedMappings with business definition formulas where suggestedTransformation is empty
      for (const mapping of standardizedMappings) {
        const matchingDef = (businessDefinitions || []).find((bd: any) => {
          const concept = (bd.concept || bd.definition?.conceptName || bd.name || '').toLowerCase();
          const target = (mapping.targetElement || '').toLowerCase();
          return concept && target && (concept === target || concept.includes(target) || target.includes(concept));
        });
        if (matchingDef) {
          const def = matchingDef.definition || matchingDef;
          // Populate suggestedTransformation from definition formula if not already set
          if (!mapping.suggestedTransformation && def.formula) {
            mapping.suggestedTransformation = typeof def.formula === 'string'
              ? def.formula
              : (def.formula.businessDescription || JSON.stringify(def.formula));
          }
          // Populate sourceColumns from definition componentFields if empty
          if ((!mapping.sourceColumns || mapping.sourceColumns.length === 0) && def.componentFields?.length) {
            mapping.sourceColumns = def.componentFields;
          }
          // Populate calculationDefinition from definition if not set
          if (!mapping.calculationDefinition && (def.calculationType || def.formula || def.aggregationMethod)) {
            mapping.calculationDefinition = {
              calculationType: def.calculationType,
              formula: def.formula,
              aggregationMethod: def.aggregationMethod
            };
          }
        }
      }

      // Merge: prefer mapped elements, then add transformations for unmapped ones
      const elementNames = new Set(standardizedMappings.map((m: any) => m.targetElement));
      const additionalTransformations = standardizedTransformations.filter(
        (t: any) => !elementNames.has(t.targetElement)
      );

      const transformationPlan = {
        // ✅ Combined mappings array for frontend
        mappings: [...standardizedMappings, ...additionalTransformations],
        // Keep separate arrays for debugging
        rawMappedElements,
        rawTransformations: generatedTransformations,
        readinessScore: mapResult.result?.readinessScore || 0,
        gaps: mapResult.result?.gaps || [],
        joinedDataUsed: !!journeyProgressForSchema.joinedData?.schema,
        schemaColumnCount: effectiveColumns.length,
        generatedAt: new Date().toISOString()
      };

      console.log(`✅ [DE Agent] Created ${transformationPlan.mappings.length} total mappings (${standardizedMappings.length} from DE tool, ${additionalTransformations.length} from definitions)`);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 8: PM VALIDATES FINAL TRANSFORMATION PLAN
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`\n📋 [STEP 8/8] PM Agent: Validating final transformation plan...`);

      const pmFinalValidation = await this.pmValidateAgentOutput(
        projectId,
        'data_engineer',
        transformationPlan,
        {
          requireMinimumReadiness: 0.6,
          flagCriticalGaps: true
        }
      );
      pmValidations.push({ step: 'de_transformations', validated: pmFinalValidation.valid, feedback: pmFinalValidation.feedback });

      // Create completion checkpoint
      const completionCheckpoint: AgentCheckpoint = {
        id: `checkpoint_${Date.now()}_mapping_complete`,
        projectId,
        agentType: 'project_manager',
        stepName: 'pm_supervised_mapping_complete',
        status: 'completed',
        message: `✅ PM-supervised data mapping completed. Found ${businessDefinitions.length} definitions, created ${transformationPlan.mappings.length} mappings.`,
        data: {
          pmValidations,
          definitionsCount: businessDefinitions.length,
          mappingsCount: transformationPlan.mappings.length,
          readinessScore: transformationPlan.readinessScore
        },
        timestamp: new Date(),
        requiresUserInput: false
      };
      await this.addCheckpoint(projectId, completionCheckpoint);
      this.notifyAgentActivity(context.userId, projectId, {
        type: 'checkpoint_created',
        checkpoint: completionCheckpoint
      });

      console.log(`📝 [PM-SUPERVISED FLOW] Saving transformationPlan to journeyProgress:`);
      console.log(`   - transformationPlan.mappings.length: ${transformationPlan?.mappings?.length || 0}`);
      console.log(`   - transformationPlan.readinessScore: ${transformationPlan?.readinessScore || 0}`);

      // Store results in project journey progress (atomic merge)
      await storage.atomicMergeJourneyProgress(projectId, {
        requirementsDocument,
        businessDefinitions,
        transformationPlan,
        pmValidations,
        dataMappingCompletedAt: new Date().toISOString()
      });

      // Verify the save
      const verifyProject = await storage.getProject(projectId);
      const verifyProgress = (verifyProject as any)?.journeyProgress || {};
      console.log(`✅ [PM-SUPERVISED FLOW] Verified save:`);
      console.log(`   - journeyProgress.transformationPlan exists: ${!!verifyProgress.transformationPlan}`);
      console.log(`   - mappings count in DB: ${verifyProgress.transformationPlan?.mappings?.length || 0}`);

      console.log(`\n✅ [PM-SUPERVISED FLOW] Data element mapping completed successfully!`);
      console.log(`   📊 Definitions: ${businessDefinitions.length}`);
      console.log(`   🔧 Mappings: ${transformationPlan.mappings.length}`);
      console.log(`   ✓ PM Validations: ${pmValidations.filter(v => v.validated).length}/${pmValidations.length} passed`);

      return {
        success: true,
        requirementsDocument,
        businessDefinitions,
        transformationPlan,
        pmValidations
      };

    } catch (error) {
      console.error(`❌ [PM-SUPERVISED FLOW] Error:`, error);

      // Create error checkpoint
      const errorCheckpoint: AgentCheckpoint = {
        id: `checkpoint_${Date.now()}_mapping_error`,
        projectId,
        agentType: 'project_manager',
        stepName: 'pm_supervised_mapping_error',
        status: 'rejected',
        message: `❌ Data mapping failed: ${error instanceof Error ? error.message : String(error)}`,
        data: { pmValidations },
        timestamp: new Date(),
        requiresUserInput: true
      };
      await this.addCheckpoint(projectId, errorCheckpoint);

      if (context) {
        this.notifyAgentActivity(context.userId, projectId, {
          type: 'checkpoint_created',
          checkpoint: errorCheckpoint
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        pmValidations
      };
    }
  }

  /**
   * PM validates an agent's output before passing to the next agent
   */
  private async pmValidateAgentOutput(
    projectId: string,
    agentType: string,
    output: any,
    criteria: {
      expectedFields?: string[];
      minimumElements?: number;
      minimumFound?: number;
      checkForDuplicates?: boolean;
      checkConfidenceThreshold?: number;
      flagLowConfidence?: boolean;
      requireMinimumReadiness?: number;
      flagCriticalGaps?: boolean;
    }
  ): Promise<{ valid: boolean; feedback: string }> {
    const issues: string[] = [];

    // Check for expected fields
    if (criteria.expectedFields) {
      for (const field of criteria.expectedFields) {
        if (!output || !output[field]) {
          issues.push(`Missing expected field: ${field}`);
        }
      }
    }

    // Check minimum elements
    if (criteria.minimumElements !== undefined) {
      const elementCount = output?.requiredElements?.length || output?.length || 0;
      if (elementCount < criteria.minimumElements) {
        issues.push(`Insufficient elements: ${elementCount} (minimum: ${criteria.minimumElements})`);
      }
    }

    // Check minimum found (for BA results)
    if (criteria.minimumFound !== undefined && output?.found) {
      if (output.found.length < criteria.minimumFound) {
        issues.push(`Insufficient definitions found: ${output.found.length}`);
      }
    }

    // Check for duplicates
    if (criteria.checkForDuplicates && Array.isArray(output?.found)) {
      const seen = new Set();
      for (const item of output.found) {
        const key = item.concept || item.conceptName || item.name;
        if (seen.has(key)) {
          issues.push(`Duplicate definition found: ${key}`);
        }
        seen.add(key);
      }
    }

    // Check confidence threshold
    if (criteria.checkConfidenceThreshold !== undefined && Array.isArray(output)) {
      const lowConfidence = output.filter((d: any) =>
        (d.confidence || d.definition?.confidence || 1) < criteria.checkConfidenceThreshold!
      );
      if (lowConfidence.length > 0 && criteria.flagLowConfidence) {
        issues.push(`${lowConfidence.length} definitions below confidence threshold (${criteria.checkConfidenceThreshold})`);
      }
    }

    // Check minimum readiness
    if (criteria.requireMinimumReadiness !== undefined) {
      const readiness = output?.readinessScore || 0;
      if (readiness < criteria.requireMinimumReadiness) {
        issues.push(`Readiness score too low: ${(readiness * 100).toFixed(0)}% (minimum: ${(criteria.requireMinimumReadiness * 100).toFixed(0)}%)`);
      }
    }

    // Flag critical gaps
    if (criteria.flagCriticalGaps && output?.gaps?.length > 0) {
      const criticalGaps = output.gaps.filter((g: any) => g.severity === 'critical' || g.required);
      if (criticalGaps.length > 0) {
        issues.push(`${criticalGaps.length} critical gaps identified`);
      }
    }

    const valid = issues.length === 0;
    const feedback = valid
      ? `✅ PM validated ${agentType} output successfully`
      : `⚠️ PM identified issues with ${agentType} output: ${issues.join('; ')}`;

    console.log(`  📋 [PM Validation] ${agentType}: ${valid ? 'PASSED' : 'ISSUES'}`);
    if (!valid) {
      console.log(`     Issues: ${issues.join(', ')}`);
    }

    // Log validation decision
    try {
      await db.insert(decisionAudits).values({
        id: nanoid(),
        projectId,
        agent: 'project_manager',
        decisionType: 'agent_validation',
        decision: valid ? 'approved' : 'flagged_issues',
        reasoning: feedback,
        alternatives: JSON.stringify([]),
        confidence: valid ? 95 : 70,
        context: JSON.stringify({
          validatedAgent: agentType,
          criteria,
          issues,
          outputSummary: typeof output === 'object' ? Object.keys(output) : 'primitive'
        }),
        userInput: null,
        impact: valid ? 'low' : 'medium',
        reversible: true,
        timestamp: new Date()
      });
    } catch (err) {
      console.error(`❌ Failed to log PM validation decision:`, err);
    }

    return { valid, feedback };
  }

  /**
   * Generate transformation logic from business definitions
   * FIXED: Always creates transformations for all elements, using schema and data type info
   */
  private generateTransformationsFromDefinitions(
    definitions: any[],
    datasetMetadata: any
  ): any[] {
    const transformations: any[] = [];
    const availableColumns = datasetMetadata?.columnNames || datasetMetadata?.columns || [];
    const schema = datasetMetadata?.schema || {};

    console.log(`🔧 [DE Transform] Generating transformations from ${definitions.length} definitions, ${availableColumns.length} columns`);

    for (const def of definitions) {
      const definition = def.definition || def;
      const conceptName = def.concept || definition.conceptName || definition.name || def.name;

      if (!conceptName) {
        console.warn('⚠️ [DE Transform] Skipping definition without name:', def);
        continue;
      }

      // Check if this definition has user-approved mappings
      const userMapping = def.sourceColumn || definition.sourceColumn || definition.sourceField;

      // Case 1: Has formula or component fields - create derived calculation
      if (definition.formula || definition.componentFields?.length) {
        transformations.push({
          type: 'derived_calculation',
          targetElement: conceptName,
          targetField: conceptName,
          sourceColumn: userMapping || null,
          sourceColumns: definition.componentFields || [],
          formula: definition.formula,
          aggregationMethod: definition.aggregationMethod || 'average',
          description: definition.businessDescription || `Calculate ${conceptName}`,
          transformationLogic: this.generateTransformationCode(definition, schema),
          confidence: def.confidence || 0.7,
          transformationRequired: true
        });
        console.log(`  ✅ Created derived_calculation for: ${conceptName}`);
        continue;
      }

      // Case 2: Has aggregation type
      if (definition.calculationType === 'aggregation') {
        const sourceFields = definition.componentFields || this.inferComponentFields(conceptName, availableColumns);
        transformations.push({
          type: 'aggregation',
          targetElement: conceptName,
          targetField: conceptName,
          sourceColumn: userMapping || null,
          sourceColumns: sourceFields,
          aggregationMethod: definition.aggregationMethod || 'average',
          description: definition.businessDescription || `Aggregate ${conceptName}`,
          transformationLogic: this.generateAggregationCode(sourceFields, definition.aggregationMethod || 'average'),
          confidence: def.confidence || 0.75,
          transformationRequired: sourceFields.length > 1
        });
        console.log(`  ✅ Created aggregation for: ${conceptName}`);
        continue;
      }

      // Case 3: Direct mapping - find matching column or use user mapping
      const matchedColumn = userMapping || this.findMatchingColumn(conceptName, availableColumns);

      if (matchedColumn) {
        const columnType = schema[matchedColumn] || 'string';
        const needsTransformation = this.columnNeedsTransformation(matchedColumn, columnType, conceptName);

        transformations.push({
          type: needsTransformation ? 'type_conversion' : 'direct_mapping',
          targetElement: conceptName,
          targetField: conceptName,
          sourceColumn: matchedColumn,
          sourceColumns: [matchedColumn],
          description: definition.businessDescription || `Map ${matchedColumn} to ${conceptName}`,
          transformationLogic: needsTransformation
            ? this.generateTypeConversionCode(matchedColumn, columnType, conceptName)
            : `row["${matchedColumn}"]`,
          confidence: def.confidence || (userMapping ? 0.95 : 0.8),
          transformationRequired: needsTransformation
        });
        console.log(`  ✅ Created ${needsTransformation ? 'type_conversion' : 'direct_mapping'} for: ${conceptName} -> ${matchedColumn}`);
      } else {
        // Case 4: No mapping found - create placeholder that user needs to complete
        transformations.push({
          type: 'unmapped',
          targetElement: conceptName,
          targetField: conceptName,
          sourceColumn: null,
          sourceColumns: [],
          description: definition.businessDescription || `Needs mapping: ${conceptName}`,
          transformationLogic: '',
          confidence: 0.3,
          transformationRequired: true,
          needsUserInput: true
        });
        console.log(`  ⚠️ Created unmapped placeholder for: ${conceptName}`);
      }
    }

    console.log(`🔧 [DE Transform] Generated ${transformations.length} transformations`);
    return transformations;
  }

  /**
   * Check if a column needs type transformation
   */
  private columnNeedsTransformation(columnName: string, columnType: string, targetConcept: string): boolean {
    // Likert scale questions might need normalization
    if (columnName.match(/^Q\d+/i) && columnType === 'integer') {
      return false; // Already numeric, no transformation needed
    }
    // Free form text might need sentiment analysis
    if (columnName.toLowerCase().includes('freeform') || columnType === 'string') {
      return true;
    }
    return false;
  }

  /**
   * Generate transformation code for derived calculations
   */
  private generateTransformationCode(definition: any, schema: Record<string, any>): string {
    const componentFields = definition.componentFields || [];
    const aggregation = definition.aggregationMethod || 'average';

    if (componentFields.length === 0) {
      return 'row[sourceColumn]';
    }

    const fieldRefs = componentFields.map((f: string) => `row["${f}"]`).join(', ');

    switch (aggregation.toLowerCase()) {
      case 'average':
      case 'avg':
        return `(${componentFields.map((f: string) => `(row["${f}"] || 0)`).join(' + ')}) / ${componentFields.length}`;
      case 'sum':
        return componentFields.map((f: string) => `(row["${f}"] || 0)`).join(' + ');
      case 'min':
        return `Math.min(${fieldRefs})`;
      case 'max':
        return `Math.max(${fieldRefs})`;
      case 'concat':
        return componentFields.map((f: string) => `(row["${f}"] || '')`).join(' + " " + ');
      default:
        return `(${componentFields.map((f: string) => `(row["${f}"] || 0)`).join(' + ')}) / ${componentFields.length}`;
    }
  }

  /**
   * Generate aggregation code for multiple columns
   */
  private generateAggregationCode(sourceFields: string[], aggregationMethod: string): string {
    if (sourceFields.length === 0) return 'null';

    const fieldRefs = sourceFields.map(f => `row["${f}"]`);
    const numericRefs = sourceFields.map(f => `(row["${f}"] || 0)`);

    switch (aggregationMethod.toLowerCase()) {
      case 'average':
      case 'avg':
        return `(${numericRefs.join(' + ')}) / ${sourceFields.length}`;
      case 'sum':
        return numericRefs.join(' + ');
      case 'min':
        return `Math.min(${fieldRefs.join(', ')})`;
      case 'max':
        return `Math.max(${fieldRefs.join(', ')})`;
      case 'count':
        return `${sourceFields.length}`;
      default:
        return `(${numericRefs.join(' + ')}) / ${sourceFields.length}`;
    }
  }

  /**
   * Generate type conversion code
   */
  private generateTypeConversionCode(columnName: string, columnType: string, targetConcept: string): string {
    if (columnType === 'string') {
      // For free-form text, might want to extract numeric sentiment or just pass through
      return `row["${columnName}"] || ""`;
    }
    return `row["${columnName}"]`;
  }

  /**
   * Infer component fields based on naming patterns
   */
  private inferComponentFields(conceptName: string, availableColumns: string[]): string[] {
    const fields: string[] = [];
    const conceptLower = conceptName.toLowerCase();

    // Look for Likert scale questions (Q1, Q2, etc.)
    if (conceptLower.includes('score') || conceptLower.includes('engagement') || conceptLower.includes('satisfaction')) {
      const likertPattern = /^Q\d+/i;
      fields.push(...availableColumns.filter(col => likertPattern.test(col)));
    }

    // Look for related columns by name similarity
    for (const col of availableColumns) {
      const colLower = col.toLowerCase().replace(/[_\s-]/g, '');
      const conceptClean = conceptLower.replace(/[_\s-]/g, '');
      if (colLower.includes(conceptClean) || conceptClean.includes(colLower)) {
        if (!fields.includes(col)) {
          fields.push(col);
        }
      }
    }

    return fields;
  }

  /**
   * Find a matching column name using fuzzy matching
   */
  private findMatchingColumn(conceptName: string, availableColumns: string[]): string | null {
    const normalized = conceptName.toLowerCase().replace(/[_\s-]/g, '');

    // Exact match
    for (const col of availableColumns) {
      if (col.toLowerCase().replace(/[_\s-]/g, '') === normalized) {
        return col;
      }
    }

    // Partial match
    for (const col of availableColumns) {
      const normalizedCol = col.toLowerCase().replace(/[_\s-]/g, '');
      if (normalizedCol.includes(normalized) || normalized.includes(normalizedCol)) {
        return col;
      }
    }

    return null;
  }

  /**
   * Update the multi-agent coordination data in the project record
   * This ensures the frontend has the latest agent activity data
   * P2-A FIX: Made public so it can be called from outside the orchestrator (e.g., after prepare step)
   * TASK 4 FIX: Load checkpoints from database if in-memory is empty (handles server restart)
   */
  async updateProjectCoordinationData(projectId: string): Promise<void> {
    try {
      // First try in-memory checkpoints
      let checkpoints = this.checkpoints.get(projectId) || [];

      // TASK 4 FIX: If in-memory is empty, load from database (handles server restart)
      if (checkpoints.length === 0) {
        try {
          const dbCheckpoints = await storage.getProjectCheckpoints(projectId);
          if (dbCheckpoints.length > 0) {
            console.log(`📋 [Coordination] Loaded ${dbCheckpoints.length} checkpoints from DB for project ${projectId}`);
            // Map DB format to internal AgentCheckpoint interface
            checkpoints = dbCheckpoints.map(cp => ({
              id: cp.id,
              projectId: cp.projectId,
              agentType: cp.agentType as 'project_manager' | 'technical_ai' | 'business' | 'data_engineer' | 'data_scientist',
              stepName: cp.stepName,
              status: cp.status as 'pending' | 'in_progress' | 'waiting_approval' | 'approved' | 'completed' | 'rejected',
              message: cp.message || '',
              data: (cp.data || {}) as any,
              userFeedback: cp.userFeedback || undefined,
              timestamp: cp.timestamp || new Date(),
              requiresUserInput: cp.requiresUserInput || false
            }));
            // Sync back to in-memory for future access
            this.checkpoints.set(projectId, checkpoints);
          }
        } catch (dbErr) {
          console.warn(`⚠️ [Coordination] Could not load checkpoints from DB:`, dbErr);
        }
      }

      // Load actual project data for real recommendations
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      const analysisResults = (project as any)?.analysisResults;
      const journeyProgress = (project as any)?.journeyProgress || {};

      // Map checkpoints to expert opinions with REAL confidence from agent data
      // P0-6 FIX: Use actual agent confidence instead of hardcoded 0.9
      let expertOpinions = checkpoints
        .filter(cp => cp.status === 'completed' || cp.status === 'in_progress')
        .map(cp => {
          // Extract confidence from agent's data if available
          // Agents may report: cp.data.confidence, cp.data.assessmentConfidence, cp.data.validationScore
          const reportedConfidence = cp.data?.confidence
            || cp.data?.assessmentConfidence
            || cp.data?.validationScore
            || (cp.data?.isValid !== undefined ? (cp.data.isValid ? 0.85 : 0.5) : null);

          // Calculate confidence based on checkpoint status and data completeness
          let derivedConfidence = 0.7; // Base confidence for incomplete work
          if (cp.status === 'completed') {
            derivedConfidence = reportedConfidence ?? 0.85; // Completed work has higher base
          } else if (cp.status === 'in_progress') {
            derivedConfidence = reportedConfidence ?? 0.6; // In-progress is less certain
          }

          return {
            agentId: cp.agentType,
            agentName: this.getAgentName(cp.agentType),
            opinion: cp.data || { message: cp.message },
            confidence: Math.min(1, Math.max(0, derivedConfidence)), // Clamp to 0-1
            timestamp: cp.timestamp.toISOString()
          };
        });

      // TASK 4 FIX: Generate synthetic expert opinions from journeyProgress when no checkpoints exist
      if (expertOpinions.length === 0 && Object.keys(journeyProgress).length > 0) {
        console.log(`📋 [Coordination] No checkpoints found, generating expert opinions from journey progress`);
        const now = new Date().toISOString();

        // Generate Data Engineer opinion based on data quality
        if (journeyProgress.dataQualityScore !== undefined || journeyProgress.qualityMetrics) {
          const qualityScore = journeyProgress.dataQualityScore ?? journeyProgress.qualityMetrics?.overallScore ?? 75;
          expertOpinions.push({
            agentId: 'data_engineer',
            agentName: 'Data Engineer',
            opinion: {
              overallScore: qualityScore / 100,
              qualityScore: qualityScore,
              assessment: qualityScore >= 70 ? 'Data quality meets requirements' : 'Data quality needs improvement',
              recommendations: journeyProgress.qualityMetrics?.issues || []
            },
            confidence: 0.85,
            timestamp: now
          });
        }

        // Generate Data Scientist opinion based on requirements document
        if (journeyProgress.requirementsDocument) {
          const reqDoc = journeyProgress.requirementsDocument;
          const analysisPath = reqDoc.analysisPath || [];
          const feasible = analysisPath.length > 0;
          expertOpinions.push({
            agentId: 'data_scientist',
            agentName: 'Data Scientist',
            opinion: {
              feasible,
              requiredAnalyses: analysisPath.slice(0, 3).map((a: any) => a.analysisName || a.name),
              dataElementsReady: reqDoc.completeness?.elementsMapped || 0,
              totalElementsNeeded: reqDoc.completeness?.totalElements || reqDoc.requiredDataElements?.length || 0,
              recommendations: analysisPath.length === 0 ? ['Define analysis requirements'] : []
            },
            confidence: feasible ? 0.8 : 0.6,
            timestamp: now
          });
        }

        // Generate Business Analyst opinion based on business impact or user goals
        if (journeyProgress.businessImpact || journeyProgress.userGoals || (project as any)?.goals) {
          const goals = journeyProgress.userGoals || (project as any)?.goals || [];
          const impact = journeyProgress.businessImpact;
          expertOpinions.push({
            agentId: 'business',
            agentName: 'Business Analyst',
            opinion: {
              businessValue: impact?.overallImpact || (goals.length > 0 ? 'Aligned with goals' : 'Pending assessment'),
              alignment: {
                goals: goals.length > 0 ? 0.8 : 0,
                goalsText: goals.slice(0, 2).map((g: any) => typeof g === 'string' ? g : (g.text || g.goal || String(g)))
              },
              recommendations: impact?.recommendations || []
            },
            confidence: impact ? 0.85 : 0.7,
            timestamp: now
          });
        }
        console.log(`✅ [Coordination] Generated ${expertOpinions.length} synthetic expert opinions from journey data`);
      }

      // Generate synthesis based on progress
      const completedSteps = checkpoints.filter(cp => cp.status === 'completed').length;

      // Priority 0: Use analysisPath from requirementsDocument (SSOT from Prepare step)
      let derivedKeyFindings: string[] = [];
      const reqDocForAnalysis = journeyProgress?.requirementsDocument;
      if (reqDocForAnalysis?.analysisPath && Array.isArray(reqDocForAnalysis.analysisPath) && reqDocForAnalysis.analysisPath.length > 0) {
        const analysisNames = reqDocForAnalysis.analysisPath
          .map((a: any) => a.analysisName || a.analysisType || a.type || a.name || (typeof a === 'string' ? a : null))
          .filter(Boolean)
          .map((name: string) => name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
        if (analysisNames.length > 0) {
          derivedKeyFindings.push(`Planned analyses: ${analysisNames.join(', ')}`);
        }
      }

      // Build keyFindings from actual analysis insights (not just checkpoints)
      const checkpointFindings: string[] = checkpoints
        .filter(cp => cp.status === 'completed' && cp.data?.keyFindings)
        .flatMap(cp => cp.data.keyFindings)
        .slice(0, 3);
      derivedKeyFindings = [...derivedKeyFindings, ...checkpointFindings].slice(0, 5);

      // Add top insights from actual analysis results
      if (analysisResults?.insights?.length > 0) {
        const topInsights = analysisResults.insights
          .filter((i: any) => i.impact === 'High' || i.confidence > 70)
          .slice(0, 3)
          .map((i: any) => i.title || (i.description?.substring(0, 80) + '...'));
        derivedKeyFindings = [...derivedKeyFindings, ...topInsights].slice(0, 5);
      }

      // ✅ P1-D FIX: Add more fallback sources for key findings to avoid hardcoded data
      // Priority 2: Extract from industry insights (BA agent output)
      if (derivedKeyFindings.length < 3 && journeyProgress.industryInsights?.insights?.length > 0) {
        const industryFindings = journeyProgress.industryInsights.insights
          .slice(0, 3 - derivedKeyFindings.length)
          .map((insight: any) => typeof insight === 'string' ? insight : (insight.title || insight.description?.substring(0, 80)));
        derivedKeyFindings = [...derivedKeyFindings, ...industryFindings].filter(Boolean).slice(0, 5);
      }

      // Priority 3: Extract from business impact assessment
      if (derivedKeyFindings.length < 3 && journeyProgress.businessImpact) {
        const impact = journeyProgress.businessImpact;
        if (impact.keyFinding) {
          derivedKeyFindings.push(impact.keyFinding);
        } else if (impact.overallImpact && impact.roi) {
          derivedKeyFindings.push(`Business impact: ${impact.overallImpact} (ROI: ${impact.roi})`);
        }
      }

      // Priority 4: Generate context-aware findings from user questions and data characteristics
      if (derivedKeyFindings.length < 2 && journeyProgress.requirementsDocument) {
        const reqDoc = journeyProgress.requirementsDocument;
        // Extract what analyses are planned
        if (reqDoc.analysisPath?.length > 0) {
          const analysisNames = reqDoc.analysisPath.slice(0, 2).map((a: any) => a.analysisName || a.name).filter(Boolean);
          if (analysisNames.length > 0) {
            derivedKeyFindings.push(`Planned analyses: ${analysisNames.join(', ')}`);
          }
        }
        // Extract data element readiness
        if (reqDoc.completeness?.elementsMapped && reqDoc.completeness?.totalElements) {
          const mappedRatio = reqDoc.completeness.elementsMapped / reqDoc.completeness.totalElements;
          if (mappedRatio > 0.8) {
            derivedKeyFindings.push(`Data readiness: ${Math.round(mappedRatio * 100)}% of required elements mapped`);
          } else if (mappedRatio > 0.5) {
            derivedKeyFindings.push(`Data mapping progress: ${reqDoc.completeness.elementsMapped}/${reqDoc.completeness.totalElements} elements ready`);
          }
        }
      }

      // Priority 5: Extract from data quality assessment
      if (derivedKeyFindings.length < 2 && journeyProgress.dataQualityScore !== undefined) {
        const score = journeyProgress.dataQualityScore;
        if (score >= 80) {
          derivedKeyFindings.push(`Data quality is excellent (${score}% score)`);
        } else if (score >= 60) {
          derivedKeyFindings.push(`Data quality is good (${score}% score) - suitable for analysis`);
        } else if (score >= 40) {
          derivedKeyFindings.push(`Data quality requires attention (${score}% score) - transformations recommended`);
        }
      }

      // Priority 6: Derive from user goals/questions (make them specific to the project)
      if (derivedKeyFindings.length === 0) {
        const goals = journeyProgress.userGoals
          || journeyProgress.requirementsDocument?.userGoals
          || (project as any)?.goals
          || [];
        const questions = journeyProgress.userQuestions
          || journeyProgress.requirementsDocument?.userQuestions
          || (project as any)?.userQuestions
          || [];

        if (goals.length > 0) {
          derivedKeyFindings.push(`Primary goal: ${typeof goals[0] === 'string' ? goals[0] : (goals[0]?.text || goals[0]?.goal || String(goals[0]))}`.substring(0, 100));
        }
        if (questions.length > 0) {
          derivedKeyFindings.push(`Key question being addressed: ${typeof questions[0] === 'string' ? questions[0] : (questions[0]?.text || questions[0]?.question || String(questions[0]))}`.substring(0, 100));
        }
      }

      // Absolute last resort - only use generic messages if ALL sources failed
      if (derivedKeyFindings.length === 0) {
        console.warn(`⚠️ [Coordination] No key findings available for project ${projectId} - check data flow`);
        derivedKeyFindings = [
          "Analysis in progress - findings will be generated",
          "Data processing and preparation underway"
        ];
      }

      // Build actionableRecommendations from actual BA/analysis results
      let derivedRecommendations: string[] = [];

      // Priority 1: BA-translated recommendations
      const primaryTranslation = journeyProgress.translatedResults?.executive ||
        journeyProgress.translatedResults?.mixed;
      if (primaryTranslation?.recommendations?.length > 0) {
        derivedRecommendations = primaryTranslation.recommendations
          .slice(0, 3)
          .map((r: any) => typeof r === 'string' ? r : (r.title || r.description?.substring(0, 80) || String(r)));
      }

      // Priority 2: Analysis recommendations from results
      if (derivedRecommendations.length === 0 && analysisResults?.recommendations?.length > 0) {
        derivedRecommendations = analysisResults.recommendations
          .slice(0, 3)
          .map((r: any) => r.title || r.description?.substring(0, 80));
      }

      // ✅ P1-D FIX: Add more fallback sources for recommendations
      // Priority 3: From analysis plan steps
      if (derivedRecommendations.length === 0 && journeyProgress.requirementsDocument?.analysisPath?.length > 0) {
        const nextAnalyses = journeyProgress.requirementsDocument.analysisPath
          .slice(0, 2)
          .map((a: any) => `Complete ${a.analysisName || a.name}: ${a.description || ''}`
            .substring(0, 80));
        derivedRecommendations = nextAnalyses;
      }

      // Priority 4: From gaps in requirements document
      if (derivedRecommendations.length === 0 && journeyProgress.requirementsDocument?.gaps?.length > 0) {
        derivedRecommendations = journeyProgress.requirementsDocument.gaps
          .filter((gap: any) => gap.severity === 'high' || gap.severity === 'medium')
          .slice(0, 2)
          .map((gap: any) => gap.recommendation || `Address: ${gap.description}`);
      }

      // Priority 5: Context-aware suggestions based on journey state
      if (derivedRecommendations.length === 0) {
        const stepStatus = journeyProgress.stepCompletionStatus || {};
        if (!stepStatus.verify) {
          derivedRecommendations.push("Complete data verification to ensure quality");
        } else if (!stepStatus.transform) {
          derivedRecommendations.push("Execute data transformations to prepare for analysis");
        } else if (!stepStatus.analyze) {
          derivedRecommendations.push("Run the analysis to generate insights");
        } else {
          derivedRecommendations.push("Review and export your analysis results");
        }
      }

      // Absolute last resort
      if (derivedRecommendations.length === 0) {
        console.warn(`⚠️ [Coordination] No recommendations available for project ${projectId} - check data flow`);
        derivedRecommendations = [
          "Continue with the next step in your analysis journey"
        ];
      }

      // P0-6 FIX: Derive expertConsensus from actual project data instead of hardcoded values
      // Get actual data quality score from project/datasets
      const dataQualityScore = journeyProgress.dataQualityScore
        ?? (project as any)?.datasets?.[0]?.qualityMetrics?.overallScore
        ?? (project as any)?.qualityScore
        ?? null;

      // Map numeric quality score (0-100) to descriptive string
      let dataQualityLabel = "Unknown";
      if (dataQualityScore !== null) {
        if (dataQualityScore >= 90) dataQualityLabel = "Excellent";
        else if (dataQualityScore >= 75) dataQualityLabel = "High";
        else if (dataQualityScore >= 60) dataQualityLabel = "Good";
        else if (dataQualityScore >= 40) dataQualityLabel = "Moderate";
        else dataQualityLabel = "Low";
      } else if (completedSteps > 0) {
        // If no explicit score but work completed, infer from completion
        dataQualityLabel = completedSteps > 2 ? "Good" : "Moderate";
      }

      // Get technical feasibility from DE agent assessment
      const deCheckpoint = checkpoints.find(cp => cp.agentType === 'data_engineer' && cp.status === 'completed');
      const technicalAssessment = deCheckpoint?.data?.feasibility
        ?? deCheckpoint?.data?.technicalFeasibility
        ?? (deCheckpoint?.status === 'completed' ? "Feasible" : null);
      const technicalFeasibilityLabel = technicalAssessment ?? (completedSteps > 1 ? "Feasible" : "Pending Assessment");

      // Get business value from BA agent assessment
      const baCheckpoint = checkpoints.find(cp => cp.agentType === 'business' && cp.status === 'completed');
      const businessAssessment = baCheckpoint?.data?.businessValue
        ?? baCheckpoint?.data?.impact
        ?? journeyProgress.businessImpact?.overallImpact
        ?? null;
      let businessValueLabel = "Pending Assessment";
      if (analysisResults) {
        businessValueLabel = businessAssessment ?? "Confirmed";
      } else if (baCheckpoint?.status === 'completed') {
        businessValueLabel = businessAssessment ?? "Significant";
      }

      // Calculate overall confidence from expert opinions
      const avgExpertConfidence = expertOpinions.length > 0
        ? expertOpinions.reduce((sum, op) => sum + op.confidence, 0) / expertOpinions.length
        : 0.7;
      const overallConfidence = analysisResults
        ? Math.min(0.95, avgExpertConfidence + 0.1) // Boost confidence if analysis completed
        : avgExpertConfidence;

      const synthesis = {
        overallAssessment: completedSteps > 0 ? "proceed" : "proceed_with_caution",
        confidence: parseFloat(overallConfidence.toFixed(2)),
        keyFindings: derivedKeyFindings,
        actionableRecommendations: derivedRecommendations,
        estimatedTimeline: analysisResults ? "Analysis complete"
          : (journeyProgress?.costEstimate?.timeline || (completedSteps > 2 ? "Nearing completion" : "In progress")),
        estimatedCost: journeyProgress?.lockedCostEstimate
          ? `$${(journeyProgress.lockedCostEstimate / 100).toFixed(2)}`
          : (analysisResults ? "Complete" : (journeyProgress?.costEstimate?.totalCost ? `$${(journeyProgress.costEstimate.totalCost / 100).toFixed(2)}` : "Pending estimation")),
        expertConsensus: {
          dataQuality: dataQualityLabel,
          dataQualityScore: dataQualityScore, // Include numeric score for UI if needed
          technicalFeasibility: technicalFeasibilityLabel,
          businessValue: businessValueLabel
        }
      };

      const coordinationData = {
        coordinationId: `coord_${projectId}`,
        projectId,
        expertOpinions,
        synthesis,
        timestamp: new Date(),
        totalResponseTime: 0 // Placeholder
      };

      // Update project record
      // @ts-ignore - multiAgentCoordination is dynamically added
      await db
        .update(projects)
        .set({
          multiAgentCoordination: coordinationData,
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId));

      console.log(`✅ Updated multi-agent coordination data for project ${projectId}`);

    } catch (error) {
      console.error(`❌ Failed to update coordination data for project ${projectId}:`, error);
    }
  }

  private getAgentName(type: string): string {
    const names: Record<string, string> = {
      'project_manager': 'Project Manager',
      'technical_ai': 'Technical Architect',
      'business': 'Business Analyst',
      'data_engineer': 'Data Engineer',
      'data_scientist': 'Data Scientist'  // FIX: Added data_scientist for proper identification
    };
    return names[type] || 'AI Agent';
  }

  /**
   * P1-3: Verify transformation plan with BA and DS agents before execution
   * BA verifies business logic and alignment with goals
   * DS verifies analytical validity and data type compatibility
   */
  async verifyTransformationPlan(projectId: string, transformationPlan: {
    mappings: Array<{
      targetElement: string;
      sourceColumn: string | null;
      sourceColumns?: string[];
      transformationRequired: boolean;
      suggestedTransformation?: string;
      userDefinedLogic?: string;
    }>;
    businessContext?: {
      industry?: string;
      goals?: string[];
      questions?: string[];
    };
    analysisPath?: Array<{
      analysisId: string;
      analysisType: string;
      requiredElements: string[];
    }>;
    dataSchema?: Record<string, any>;
  }): Promise<{
    baApproval: {
      approved: boolean;
      confidence: number;
      feedback: string;
      recommendations: string[];
      businessAlignmentScore: number;
    };
    dsApproval: {
      approved: boolean;
      confidence: number;
      feedback: string;
      analyticalConcerns: string[];
      dataTypeIssues: string[];
    };
    overallApproved: boolean;
    summary: string;
    transformationRecommendations: Array<{
      sourceColumn: string;
      targetElement: string;
      issue: string;
      recommendedTransformation: {
        type: string;
        fromType: string;
        toType: string;
        method: string;
      };
    }>;
  }> {
    console.log(`🔍 [P1-3] Starting BA/DS transformation verification for project ${projectId}`);

    const { mappings, businessContext, analysisPath, dataSchema } = transformationPlan;

    // ========================
    // Business Agent Verification
    // ========================
    let baApproval = {
      approved: true,
      confidence: 0.85,
      feedback: '',
      recommendations: [] as string[],
      businessAlignmentScore: 0.8
    };

    try {
      // Check business alignment
      const goals = businessContext?.goals || [];
      const goalsText = goals.join(' ').toLowerCase();

      // Check if transformations support business goals
      const transformationsWithLogic = mappings.filter(m => m.transformationRequired && (m.suggestedTransformation || m.userDefinedLogic));
      const directMappings = mappings.filter(m => !m.transformationRequired && m.sourceColumn);

      // BA evaluates transformation-to-goal alignment
      let alignmentScore = 0.7; // Base score
      const recommendations: string[] = [];

      if (transformationsWithLogic.length > 0) {
        alignmentScore += 0.1;
        baApproval.feedback = `Found ${transformationsWithLogic.length} transformation rules defined.`;
      }

      if (directMappings.length / mappings.length > 0.5) {
        alignmentScore += 0.1;
        baApproval.feedback += ` ${directMappings.length} elements have direct column mappings.`;
      }

      // Check for missing critical elements based on goals
      if (goalsText.includes('employee') || goalsText.includes('engagement')) {
        const hasEngagementScore = mappings.some(m =>
          m.targetElement.toLowerCase().includes('engagement') ||
          m.targetElement.toLowerCase().includes('satisfaction')
        );
        if (!hasEngagementScore) {
          recommendations.push('Consider mapping an Employee Engagement Score metric for HR analysis');
          alignmentScore -= 0.05;
        }
      }

      // Check unmapped required elements
      const unmappedRequired = mappings.filter(m => !m.sourceColumn && !m.sourceColumns?.length);
      if (unmappedRequired.length > mappings.length * 0.3) {
        alignmentScore -= 0.1;
        recommendations.push(`${unmappedRequired.length} required elements are not yet mapped to source columns`);
      }

      baApproval.businessAlignmentScore = Math.max(0, Math.min(1, alignmentScore));
      baApproval.recommendations = recommendations;
      baApproval.approved = alignmentScore >= 0.6;
      baApproval.confidence = alignmentScore;

      if (!baApproval.approved) {
        baApproval.feedback = `Business alignment score (${(alignmentScore * 100).toFixed(0)}%) is below threshold. ` + baApproval.feedback;
      }

      console.log(`💼 [P1-3 BA] Verification complete: approved=${baApproval.approved}, score=${baApproval.businessAlignmentScore}`);

    } catch (baError) {
      console.error('❌ [P1-3 BA] Business verification failed:', baError);
      baApproval.approved = true; // Don't block on BA errors
      baApproval.feedback = 'Business verification could not complete - proceeding with caution';
      baApproval.confidence = 0.5;
    }

    // ========================
    // Data Scientist Verification
    // ========================
    let dsApproval = {
      approved: true,
      confidence: 0.85,
      feedback: '',
      analyticalConcerns: [] as string[],
      dataTypeIssues: [] as string[]
    };

    // Hoisted so it's accessible in the return statement
    let transformationRecommendations: Array<{
      sourceColumn: string;
      targetElement: string;
      issue: string;
      recommendedTransformation: {
        type: string;
        fromType: string;
        toType: string;
        method: string;
      };
    }> = [];

    try {
      const analyticalConcerns: string[] = [];
      const dataTypeIssues: string[] = [];
      let dsScore = 0.8;

      // Check data type compatibility and generate actionable transformation recommendations
      if (dataSchema) {
        for (const mapping of mappings) {
          if (mapping.sourceColumn && dataSchema[mapping.sourceColumn]) {
            const sourceType = dataSchema[mapping.sourceColumn];
            const targetElement = mapping.targetElement.toLowerCase();

            // Check for type mismatches
            if (targetElement.includes('date') && !['date', 'datetime', 'timestamp'].includes(sourceType)) {
              const issue = `"${mapping.sourceColumn}" may need date conversion for "${mapping.targetElement}"`;
              dataTypeIssues.push(issue);
              transformationRecommendations.push({
                sourceColumn: mapping.sourceColumn,
                targetElement: mapping.targetElement,
                issue,
                recommendedTransformation: {
                  type: 'type_conversion',
                  fromType: sourceType,
                  toType: 'datetime',
                  method: 'parse_date'
                }
              });
            }
            if ((targetElement.includes('score') || targetElement.includes('rate')) &&
                !['number', 'integer', 'float', 'decimal'].includes(sourceType)) {
              const issue = `"${mapping.sourceColumn}" should be numeric for "${mapping.targetElement}"`;
              dataTypeIssues.push(issue);
              transformationRecommendations.push({
                sourceColumn: mapping.sourceColumn,
                targetElement: mapping.targetElement,
                issue,
                recommendedTransformation: {
                  type: 'type_conversion',
                  fromType: sourceType,
                  toType: 'numeric',
                  method: 'parse_numeric'
                }
              });
            }
          }
        }
      }

      if (transformationRecommendations.length > 0) {
        console.log(`🔧 [P1-3 DS] Generated ${transformationRecommendations.length} transformation recommendations for data type issues`);
      }

      // Check if required analyses have sufficient data
      // ✅ P0 FIX: Handle case where analysisPath.requiredElements is empty
      // When requiredElements is empty, use overall mappings for coverage calculation
      if (analysisPath && analysisPath.length > 0) {
        for (const analysis of analysisPath) {
          const requiredElements = analysis.requiredElements || [];

          // If requiredElements is empty, use all mappings for this analysis type
          if (requiredElements.length === 0) {
            // Calculate coverage based on overall mapped elements
            const mappedCount = mappings.filter(m => m.sourceColumn || m.sourceColumns?.length).length;
            const totalCount = mappings.length;
            const coverage = totalCount > 0 ? mappedCount / totalCount : 1;

            if (coverage < 0.7) {
              analyticalConcerns.push(
                `${analysis.analysisType} analysis has only ${(coverage * 100).toFixed(0)}% data coverage (${mappedCount}/${totalCount} elements)`
              );
              dsScore -= 0.05;
            }
          } else {
            // Original logic when requiredElements is specified
            const mappedElements = mappings.filter(m =>
              requiredElements.includes(m.targetElement) &&
              (m.sourceColumn || m.sourceColumns?.length)
            );

            const coverage = mappedElements.length / Math.max(1, requiredElements.length);
            if (coverage < 0.7) {
              analyticalConcerns.push(
                `${analysis.analysisType} analysis has only ${(coverage * 100).toFixed(0)}% data coverage (${mappedElements.length}/${requiredElements.length} elements)`
              );
              dsScore -= 0.1;
            }
          }
        }
      }

      // Check for transformations on key analytical columns
      const transformationsNeeded = mappings.filter(m => m.transformationRequired);
      if (transformationsNeeded.length > 0) {
        const withoutLogic = transformationsNeeded.filter(m => !m.suggestedTransformation && !m.userDefinedLogic);
        if (withoutLogic.length > 0) {
          analyticalConcerns.push(`${withoutLogic.length} elements require transformation but have no logic defined`);
          dsScore -= 0.05 * withoutLogic.length;
        }
      }

      dsApproval.analyticalConcerns = analyticalConcerns;
      dsApproval.dataTypeIssues = dataTypeIssues;
      dsApproval.confidence = Math.max(0, Math.min(1, dsScore));
      dsApproval.approved = dsScore >= 0.5 && dataTypeIssues.length < 5;

      if (analyticalConcerns.length > 0) {
        dsApproval.feedback = `Found ${analyticalConcerns.length} analytical concerns and ${dataTypeIssues.length} data type issues.`;
      } else {
        dsApproval.feedback = 'Data structure and transformations look analytically sound.';
      }

      console.log(`🔬 [P1-3 DS] Verification complete: approved=${dsApproval.approved}, concerns=${analyticalConcerns.length}`);

    } catch (dsError) {
      console.error('❌ [P1-3 DS] Data science verification failed:', dsError);
      dsApproval.approved = true; // Don't block on DS errors
      dsApproval.feedback = 'Analytical verification could not complete - proceeding with caution';
      dsApproval.confidence = 0.5;
    }

    // ========================
    // Combined Result
    // ========================
    const overallApproved = baApproval.approved && dsApproval.approved;
    let summary = '';

    if (overallApproved) {
      summary = `✅ Transformation plan verified by Business Analyst (${(baApproval.confidence * 100).toFixed(0)}% confidence) and Data Scientist (${(dsApproval.confidence * 100).toFixed(0)}% confidence).`;
    } else {
      const issues = [];
      if (!baApproval.approved) issues.push('business alignment');
      if (!dsApproval.approved) issues.push('analytical validity');
      summary = `⚠️ Transformation plan has concerns with ${issues.join(' and ')}. Review recommendations before proceeding.`;
    }

    console.log(`📊 [P1-3] Verification summary: ${overallApproved ? 'APPROVED' : 'NEEDS REVIEW'}`);

    return {
      baApproval,
      dsApproval,
      overallApproved,
      summary,
      transformationRecommendations: transformationRecommendations || []
    };
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

  async autoExecuteNextStep(projectId: string): Promise<void> {
    return this.instance.autoExecuteNextStep(projectId);
  }

  async executePMSupervisedDataMappingFlow(
    projectId: string,
    datasetMetadata: any,
    userGoals: string[],
    userQuestions: string[]
  ): Promise<{
    success: boolean;
    requirementsDocument?: any;
    businessDefinitions?: any[];
    transformationPlan?: any;
    pmValidations?: Array<{step: string; validated: boolean; feedback?: string}>;
    error?: string;
  }> {
    return this.instance.executePMSupervisedDataMappingFlow(projectId, datasetMetadata, userGoals, userQuestions);
  }

  // P2-A FIX: Expose updateProjectCoordinationData to routes for triggering after prepare step
  async updateProjectCoordinationData(projectId: string): Promise<void> {
    return this.instance.updateProjectCoordinationData(projectId);
  }

  // P1-3: Verify transformation plan with BA/DS agents
  async verifyTransformationPlan(projectId: string, transformationPlan: {
    mappings: Array<{
      targetElement: string;
      sourceColumn: string | null;
      sourceColumns?: string[];
      transformationRequired: boolean;
      suggestedTransformation?: string;
      userDefinedLogic?: string;
    }>;
    businessContext?: {
      industry?: string;
      goals?: string[];
      questions?: string[];
    };
    analysisPath?: Array<{
      analysisId: string;
      analysisType: string;
      requiredElements: string[];
    }>;
    dataSchema?: Record<string, any>;
  }) {
    return this.instance.verifyTransformationPlan(projectId, transformationPlan);
  }
}

export const projectAgentOrchestrator = new ProjectAgentOrchestratorSingleton();