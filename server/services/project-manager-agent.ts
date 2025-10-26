import { TechnicalAIAgent } from './technical-ai-agent';
import { BusinessAgent, BusinessContext } from './business-agent';
import { storage } from './storage';
import { PricingService } from './pricing';
import { nanoid } from 'nanoid';
import { AgentMessageBroker, AgentMessage, AgentCheckpoint } from './agents/message-broker';
import { taskQueue, EnhancedTaskQueue, QueuedTask } from './enhanced-task-queue';
import { measurePerformance } from '../utils/performance-monitor';



type OrchestrationStatus = 'goal_extraction' | 'path_selection' | 'cost_approval' | 'ready_for_execution' | 'executing' | 'completed' | 'error';

interface OrchestrationState {
    status: OrchestrationStatus;
    history: Array<{ step: string; userInput?: any; agentOutput?: any; timestamp: Date; }>;
    lastAgentOutput?: any;
    userFeedback?: any;
    currentWorkflowStep?: string;
    dependencies?: WorkflowDependency[];
    artifacts?: ProjectArtifact[];
}

interface WorkflowDependency {
    id: string;
    stepName: string;
    dependsOn: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    artifacts?: string[];
    metadata?: any;
}

interface ProjectArtifact {
    id: string;
    type: 'dataset' | 'analysis' | 'visualization' | 'model' | 'report';
    name: string;
    description?: string;
    filePath?: string;
    metadata?: any;
    dependencies?: string[];
    createdAt: Date;
    version: string;
}

// ==========================================
// MULTI-AGENT COORDINATION INTERFACES
// ==========================================

/**
 * Journey-specific orchestration request (Phase 4 - Task 4.1)
 */
export interface JourneyRequest {
    projectId: string;
    journeyType: 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom';
    userId: string;
    analysisGoal?: string;
    businessContext?: string;
    templateId?: string;
    datasetId?: string;
    selectedCapabilityIds?: string[]; // For custom journey type
}

/**
 * Orchestration plan for journey execution (Phase 4 - Task 4.1)
 */
export interface OrchestrationPlan {
    planId: string;
    journeyType: string;
    selectedAgent: string;
    tools: string[];
    workflowSteps: Array<{
        stepId: string;
        stepName: string;
        agent: string;
        tools: string[];
        estimatedDuration: number;
        dependencies: string[];
    }>;
    estimatedTotalDuration: number;
    confidence: number;
}

/**
 * Expert opinion from a specialist agent (Data Engineer, Data Scientist, Business Agent)
 */
export interface ExpertOpinion {
    agentId: 'data_engineer' | 'data_scientist' | 'business_agent';
    agentName: string;
    opinion: any; // Can be DataQualityReport, FeasibilityReport, BusinessImpactReport, etc.
    confidence: number;
    timestamp: Date;
    responseTime: number; // milliseconds
}

/**
 * Synthesized recommendation from Project Manager combining all expert opinions
 */
export interface SynthesizedRecommendation {
    overallAssessment: 'proceed' | 'proceed_with_caution' | 'revise_approach' | 'not_feasible';
    confidence: number;
    keyFindings: string[];
    combinedRisks: Array<{ source: string; risk: string; severity: 'high' | 'medium' | 'low' }>;
    actionableRecommendations: string[];
    expertConsensus: {
        dataQuality: 'good' | 'acceptable' | 'poor';
        technicalFeasibility: 'feasible' | 'challenging' | 'not_feasible';
        businessValue: 'high' | 'medium' | 'low';
    };
    estimatedTimeline: string;
    estimatedCost?: string;
}

/**
 * Multi-agent coordination result with all expert opinions and PM synthesis
 */
export interface MultiAgentCoordinationResult {
    coordinationId: string;
    projectId: string;
    expertOpinions: ExpertOpinion[];
    synthesis: SynthesizedRecommendation;
    timestamp: Date;
    totalResponseTime: number; // milliseconds
}

/**
 * Decision audit record (Phase 4 - Task 4.4)
 */
export interface DecisionAuditRecord {
    auditId: string;
    projectId: string;
    userId: string;
    decisionType: 'journey_selection' | 'agent_selection' | 'tool_selection' | 'checkpoint_approval' | 'workflow_modification' | 'cost_approval';
    decisionMaker: 'user' | 'pm_agent' | 'technical_agent' | 'business_agent' | 'data_engineer';
    decision: any; // The actual decision data
    rationale?: string;
    alternatives?: any[]; // Alternative options considered
    confidence?: number;
    timestamp: Date;
    executionContext?: {
        journeyType?: string;
        templateId?: string;
        orchestrationPlanId?: string;
    };
}

export class ProjectManagerAgent {
    private technicalAgent: TechnicalAIAgent;
    private businessAgent: BusinessAgent;
    private messageBroker: AgentMessageBroker;
    private decisionAuditTrail: Map<string, DecisionAuditRecord[]>; // projectId → audit records

    constructor() {
        this.technicalAgent = new TechnicalAIAgent();
        this.businessAgent = new BusinessAgent();
        this.messageBroker = new AgentMessageBroker();
        this.decisionAuditTrail = new Map();
        // Initialize synchronously - async methods will be called separately
    }

    async initialize(): Promise<void> {
        await Promise.all([
            this.initializeMessageBroker(),
            this.initializeTaskQueue()
        ]);
    }

    private async initializeTaskQueue(): Promise<void> {
        try {
            // Register agents with their capabilities
            taskQueue.registerAgent('technical_agent', [
                'data_analysis',
                'statistical_analysis', 
                'machine_learning',
                'code_generation',
                'data_processing',
                'visualization'
            ], 3); // Max 3 concurrent tasks

            taskQueue.registerAgent('business_agent', [
                'business_analysis',
                'report_generation',
                'industry_analysis',
                'compliance_check',
                'business_intelligence'
            ], 2); // Max 2 concurrent tasks

            taskQueue.registerAgent('project_manager', [
                'orchestration',
                'workflow_management',
                'project_coordination',
                'artifact_management'
            ], 5); // Max 5 concurrent tasks

            // Set up task completion handlers
            taskQueue.on('task_completed', this.handleTaskCompletion.bind(this));
            taskQueue.on('task_failed', this.handleTaskFailure.bind(this));
            taskQueue.on('task_assigned', this.handleTaskAssignment.bind(this));

            console.log('Project Manager Agent: Task queue initialized with agent registrations');
        } catch (error) {
            console.error('Project Manager Agent: Failed to initialize task queue:', error);
        }
    }

    private async handleTaskCompletion(result: any): Promise<void> {
        console.log(`Task ${result.taskId} completed by ${result.agentId}`);
        
        // Update workflow step if this was a workflow task
        if (result.result?.projectId && result.result?.stepName) {
            await this.processWorkflowStepResult(
                result.result.projectId,
                result.result.stepName,
                result.result
            );
        }
    }

    private async handleTaskFailure(result: any): Promise<void> {
        console.error(`Task ${result.taskId} failed:`, result.error);
        
        // Handle task failure in workflow
        if (result.result?.projectId) {
            const { project, state } = await this.getProjectAndState(result.result.projectId);
            state.history.push({
                step: 'task_failure',
                agentOutput: { 
                    taskId: result.taskId,
                    error: result.error,
                    agent: result.agentId 
                },
                timestamp: new Date()
            });
            await this.updateProjectState(result.result.projectId, state);
        }
    }

    private async handleTaskAssignment(data: any): Promise<void> {
        console.log(`Task ${data.taskId} assigned to agent ${data.agentId}`);
        
        // Send real-time notification about task assignment
        await this.messageBroker.sendMessage('ui', 'task_assigned', {
            taskId: data.taskId,
            agentId: data.agentId,
            taskType: data.task.type,
            priority: data.task.priority
        });
    }

    private async initializeMessageBroker(): Promise<void> {
        try {
            await this.messageBroker.registerAgent('project_manager');
            
            // Set up message handlers for real-time agent communication
            this.messageBroker.on('message_received', this.handleAgentMessage.bind(this));
            this.messageBroker.on('checkpoint_request', this.handleCheckpointRequest.bind(this));
            
            console.log('Project Manager Agent: Message broker initialized');
        } catch (error) {
            console.error('Project Manager Agent: Failed to initialize message broker:', error);
            // Fall back to direct agent communication if Redis is unavailable
        }
    }

    private async handleAgentMessage(message: AgentMessage): Promise<void> {
        console.log(`Project Manager received message from ${message.from}:`, message);
        
        switch (message.type) {
            case 'status':
                await this.handleAgentStatusUpdate(message);
                break;
            case 'result':
                await this.handleAgentResult(message);
                break;
            case 'error':
                await this.handleAgentError(message);
                break;
            case 'checkpoint':
                await this.handleAgentCheckpoint(message);
                break;
        }
    }

    private async handleAgentStatusUpdate(message: AgentMessage): Promise<void> {
        // Update project state with agent status
        if (message.payload.projectId) {
            const { project, state } = await this.getProjectAndState(message.payload.projectId);
            state.history.push({
                step: 'agent_status_update',
                agentOutput: message.payload,
                timestamp: new Date()
            });
            await this.updateProjectState(message.payload.projectId, state);
        }
    }

    private async handleAgentResult(message: AgentMessage): Promise<void> {
        // Process agent results in real-time
        if (message.payload.projectId && message.payload.stepName) {
            await this.processWorkflowStepResult(
                message.payload.projectId,
                message.payload.stepName,
                message.payload.result
            );
        }
    }

    private async handleAgentError(message: AgentMessage): Promise<void> {
        // Handle agent errors gracefully
        console.error(`Agent ${message.from} reported error:`, message.payload);
        
        if (message.payload.projectId) {
            const { project, state } = await this.getProjectAndState(message.payload.projectId);
            state.history.push({
                step: 'agent_error',
                agentOutput: { error: message.payload.error, agent: message.from },
                timestamp: new Date()
            });
            await this.updateProjectState(message.payload.projectId, state);
        }
    }

    private async handleAgentCheckpoint(message: AgentMessage): Promise<void> {
        // Handle real-time checkpoints requiring user feedback
        const checkpoint = message.payload as AgentCheckpoint;
        
        // Update project state with checkpoint
        const { project, state } = await this.getProjectAndState(checkpoint.projectId);
        state.currentWorkflowStep = checkpoint.step;
        state.lastAgentOutput = {
            checkpointId: checkpoint.checkpointId,
            question: checkpoint.question,
            options: checkpoint.options,
            artifacts: checkpoint.artifacts
        };
        
        await this.updateProjectState(checkpoint.projectId, state);
        
        // Notify UI through WebSocket or other real-time channel
        this.notifyUIOfCheckpoint(checkpoint);
    }

    private async handleCheckpointRequest(checkpoint: AgentCheckpoint): Promise<void> {
        // Handle checkpoint requests from agents
        await this.handleAgentCheckpoint({ 
            id: nanoid(),
            from: 'agent',
            to: 'project_manager',
            type: 'checkpoint',
            payload: checkpoint,
            timestamp: new Date()
        });
    }

    private notifyUIOfCheckpoint(checkpoint: AgentCheckpoint): void {
        // This would integrate with the WebSocket real-time system
        // For now, we'll log it - this will be enhanced in the WebSocket lifecycle fix
        console.log(`UI Notification: Checkpoint required for project ${checkpoint.projectId}:`, checkpoint);
    }

    private async processWorkflowStepResult(projectId: string, stepName: string, result: any): Promise<void> {
        const { project, state } = await this.getProjectAndState(projectId);
        
        // Update workflow dependency status
        if (state.dependencies) {
            const dependency = state.dependencies.find(d => d.stepName === stepName);
            if (dependency) {
                dependency.status = 'completed';
                dependency.metadata = result;
            }
        }
        
        // Add to history
        state.history.push({
            step: `workflow_step_${stepName}`,
            agentOutput: result,
            timestamp: new Date()
        });
        
        await this.updateProjectState(projectId, state);
        
        // Check if all dependencies are complete
        await this.checkWorkflowCompletion(projectId);
    }

    private async checkWorkflowCompletion(projectId: string): Promise<void> {
        const { project, state } = await this.getProjectAndState(projectId);
        
        if (state.dependencies && state.dependencies.every(d => d.status === 'completed')) {
            state.status = 'completed';
            state.currentWorkflowStep = 'workflow_completed';
            
            // Aggregate all results
            const aggregatedResults = state.dependencies.reduce((acc, dep) => {
                acc[dep.stepName] = dep.metadata;
                return acc;
            }, {} as any);
            
            state.lastAgentOutput = {
                message: 'Workflow completed successfully',
                results: aggregatedResults,
                artifacts: state.artifacts
            };
            
            await this.updateProjectState(projectId, state);
            await storage.updateProject(projectId, {
                analysisResults: { ...project.analysisResults, result: aggregatedResults }
            });
            
            console.log(`Workflow completed for project ${projectId}`);
        }
    }

    /**
     * Send a task to an agent using the message broker
     */
    private async sendTaskToAgent(agentId: string, task: any, projectId: string): Promise<any> {
        try {
            const response = await this.messageBroker.sendAndWait({
                from: 'project_manager',
                to: agentId,
                type: 'task',
                payload: { ...task, projectId }
            }, 30000); // 30 second timeout
            
            return response;
        } catch (error) {
            console.error(`Failed to send task to ${agentId}:`, error);
            // Fall back to direct agent method if message broker fails
            return await this.fallbackToDirectAgent(agentId, task, projectId);
        }
    }

    private async fallbackToDirectAgent(agentId: string, task: any, projectId: string): Promise<any> {
        // Fallback to direct agent communication
        switch (agentId) {
            case 'technical_agent':
                return await this.technicalAgent.processTask(task, projectId);
            case 'business_agent':
                return await this.businessAgent.processTask(task, projectId);
            default:
                throw new Error(`Unknown agent: ${agentId}`);
        }
    }

    async decideProject(userDescription: string, userId: string): Promise<{ decision: 'new' | 'existing', projectId?: string, existingProjects?: any[] }> {
        const existingProjects = await (storage as any).getProjectsByOwner(userId);

        if (!existingProjects || existingProjects.length === 0) {
            return { decision: 'new' };
        }

        const decision = await this.businessAgent.decideOnProject(userDescription, existingProjects);

        if (decision.shouldCreateNew) {
            return { decision: 'new', existingProjects };
        } else {
            return { decision: 'existing', projectId: decision.recommendedProjectId, existingProjects };
        }
    }

    /**
     * Orchestrate journey-specific agent and tool selection (Phase 4 - Task 4.1)
     * Selects the appropriate specialist agent and tools based on journey type
     */
    async orchestrateJourney(request: JourneyRequest): Promise<OrchestrationPlan> {
        const planId = nanoid();
        console.log(`[PM Orchestrator] Creating orchestration plan ${planId} for ${request.journeyType} journey`);

        let selectedAgent: string;
        let tools: string[];
        let workflowSteps: OrchestrationPlan['workflowSteps'] = [];
        let estimatedTotalDuration = 0;
        let confidence = 0.9;

        switch (request.journeyType) {
            case 'non-tech':
                selectedAgent = 'technical_ai_agent';
                tools = ['schema_generator', 'data_transformer', 'statistical_analyzer', 'visualization_engine'];
                workflowSteps = [
                    {
                        stepId: 'auto_schema_detection',
                        stepName: 'Automatic Schema Detection',
                        agent: 'technical_ai_agent',
                        tools: ['schema_generator'],
                        estimatedDuration: 2,
                        dependencies: []
                    },
                    {
                        stepId: 'data_preparation',
                        stepName: 'Data Preparation',
                        agent: 'technical_ai_agent',
                        tools: ['data_transformer'],
                        estimatedDuration: 3,
                        dependencies: ['auto_schema_detection']
                    },
                    {
                        stepId: 'ai_guided_analysis',
                        stepName: 'AI-Guided Analysis',
                        agent: 'technical_ai_agent',
                        tools: ['statistical_analyzer'],
                        estimatedDuration: 10,
                        dependencies: ['data_preparation']
                    },
                    {
                        stepId: 'visualization',
                        stepName: 'Create Visualizations',
                        agent: 'technical_ai_agent',
                        tools: ['visualization_engine'],
                        estimatedDuration: 4,
                        dependencies: ['ai_guided_analysis']
                    }
                ];
                estimatedTotalDuration = 19;
                break;

            case 'business':
                if (request.templateId) {
                    selectedAgent = 'business_agent';
                    tools = this.getTemplateTools(request.templateId);
                    workflowSteps = [
                        {
                            stepId: 'template_research',
                            stepName: 'Industry Template Research',
                            agent: 'business_agent',
                            tools: ['business_templates'],
                            estimatedDuration: 5,
                            dependencies: []
                        },
                        {
                            stepId: 'template_application',
                            stepName: 'Apply Business Template',
                            agent: 'business_agent',
                            tools: tools,
                            estimatedDuration: 8,
                            dependencies: ['template_research']
                        },
                        {
                            stepId: 'business_visualization',
                            stepName: 'Business Dashboards',
                            agent: 'business_agent',
                            tools: ['visualization_engine', 'business_templates'],
                            estimatedDuration: 6,
                            dependencies: ['template_application']
                        }
                    ];
                    estimatedTotalDuration = 19;
                } else {
                    selectedAgent = 'business_agent';
                    tools = ['business_templates', 'statistical_analyzer', 'visualization_engine'];
                    workflowSteps = [
                        {
                            stepId: 'business_analysis',
                            stepName: 'Business Analysis',
                            agent: 'business_agent',
                            tools: tools,
                            estimatedDuration: 12,
                            dependencies: []
                        }
                    ];
                    estimatedTotalDuration = 12;
                }
                break;

            case 'technical':
                selectedAgent = 'technical_ai_agent';
                tools = [
                    'schema_generator',
                    'data_transformer',
                    'statistical_analyzer',
                    'ml_pipeline',
                    'visualization_engine'
                ];
                workflowSteps = [
                    {
                        stepId: 'advanced_schema',
                        stepName: 'Advanced Schema Analysis',
                        agent: 'technical_ai_agent',
                        tools: ['schema_generator'],
                        estimatedDuration: 3,
                        dependencies: []
                    },
                    {
                        stepId: 'custom_transformation',
                        stepName: 'Custom Data Transformation',
                        agent: 'technical_ai_agent',
                        tools: ['data_transformer'],
                        estimatedDuration: 5,
                        dependencies: ['advanced_schema']
                    },
                    {
                        stepId: 'statistical_analysis',
                        stepName: 'Statistical Analysis',
                        agent: 'technical_ai_agent',
                        tools: ['statistical_analyzer'],
                        estimatedDuration: 8,
                        dependencies: ['custom_transformation']
                    },
                    {
                        stepId: 'ml_modeling',
                        stepName: 'Machine Learning',
                        agent: 'technical_ai_agent',
                        tools: ['ml_pipeline'],
                        estimatedDuration: 15,
                        dependencies: ['statistical_analysis']
                    },
                    {
                        stepId: 'technical_viz',
                        stepName: 'Technical Visualizations',
                        agent: 'technical_ai_agent',
                        tools: ['visualization_engine'],
                        estimatedDuration: 5,
                        dependencies: ['ml_modeling']
                    }
                ];
                estimatedTotalDuration = 36;
                break;

            case 'consultation':
                selectedAgent = 'project_manager';
                tools = ['project_coordinator', 'decision_auditor'];
                workflowSteps = [
                    {
                        stepId: 'consultation_intake',
                        stepName: 'Consultation Intake',
                        agent: 'project_manager',
                        tools: ['project_coordinator'],
                        estimatedDuration: 10,
                        dependencies: []
                    },
                    {
                        stepId: 'multi_agent_analysis',
                        stepName: 'Multi-Agent Expert Analysis',
                        agent: 'project_manager',
                        tools: ['project_coordinator'],
                        estimatedDuration: 20,
                        dependencies: ['consultation_intake']
                    },
                    {
                        stepId: 'expert_synthesis',
                        stepName: 'Expert Opinion Synthesis',
                        agent: 'project_manager',
                        tools: ['decision_auditor'],
                        estimatedDuration: 8,
                        dependencies: ['multi_agent_analysis']
                    }
                ];
                estimatedTotalDuration = 38;
                confidence = 0.95; // Highest confidence for consultation
                break;

            case 'custom':
                // Custom journey: delegate to orchestrateCustomJourney
                if (!request.selectedCapabilityIds || request.selectedCapabilityIds.length === 0) {
                    throw new Error('Custom journey requires selectedCapabilityIds');
                }

                return await this.orchestrateCustomJourney(
                    request.projectId,
                    request.selectedCapabilityIds,
                    { recordCount: 1000, sizeGB: 0.001 } // Default values, can be updated with actual dataset info
                );

            default:
                throw new Error(`Unsupported journey type: ${request.journeyType}`);
        }

        const plan: OrchestrationPlan = {
            planId,
            journeyType: request.journeyType,
            selectedAgent,
            tools,
            workflowSteps,
            estimatedTotalDuration,
            confidence
        };

        console.log(`[PM Orchestrator] Created plan ${planId}: Agent=${selectedAgent}, Tools=${tools.length}, Steps=${workflowSteps.length}, Duration=${estimatedTotalDuration}min`);

        return plan;
    }

    /**
     * Orchestrate custom "Build Your Own" journey
     * Builds execution plan from user-selected capabilities
     * Integrates with unified billing service (same as other journeys)
     */
    async orchestrateCustomJourney(
        projectId: string,
        selectedCapabilityIds: string[],
        datasetInfo?: { recordCount?: number; sizeGB?: number }
    ): Promise<OrchestrationPlan> {
        const planId = nanoid();
        console.log(`[PM Orchestrator] Creating custom journey plan ${planId} with ${selectedCapabilityIds.length} capabilities`);

        // Import helper functions from capabilities catalog
        const {
            getCustomJourneyToolExecutions,
            validateCapabilityDependencies,
            getCapabilityById
        } = await import('../../shared/custom-journey-capabilities');

        // 1. Validate dependencies
        const dependencyValidation = validateCapabilityDependencies(selectedCapabilityIds);
        if (!dependencyValidation.valid) {
            throw new Error(`Missing required capabilities: ${dependencyValidation.missingDependencies?.join(', ')}`);
        }

        // 2. Get tool executions and estimated duration
        const { capabilities, estimatedDuration } = getCustomJourneyToolExecutions(selectedCapabilityIds);

        // 3. Build workflow steps with dependencies
        const workflowSteps: OrchestrationPlan['workflowSteps'] = [];
        const allTools = new Set<string>();

        // Sort capabilities by dependencies (topological sort)
        const sortedCapabilityIds = this.topologicalSortCapabilities(selectedCapabilityIds);

        for (const capId of sortedCapabilityIds) {
            const capability = capabilities.find(c => c.id === capId);
            if (!capability) continue;

            const capabilityDef = getCapabilityById(capId);
            if (!capabilityDef) continue;

            // Add tools from this capability
            capability.toolNames.forEach(tool => allTools.add(tool));

            // Create workflow step for each tool in this capability
            capability.toolNames.forEach((toolName, index) => {
                const stepId = `${capId}_${toolName}`;

                // Determine dependencies for this step
                const dependencies: string[] = [];

                // Add dependencies from required capabilities
                if (capabilityDef.requiredCapabilities) {
                    for (const requiredCapId of capabilityDef.requiredCapabilities) {
                        const requiredCap = capabilities.find(c => c.id === requiredCapId);
                        if (requiredCap && requiredCap.toolNames.length > 0) {
                            // Depend on the last tool of the required capability
                            const lastTool = requiredCap.toolNames[requiredCap.toolNames.length - 1];
                            dependencies.push(`${requiredCapId}_${lastTool}`);
                        }
                    }
                }

                // For multi-tool capabilities, tools depend on previous tool in same capability
                if (index > 0) {
                    const previousTool = capability.toolNames[index - 1];
                    dependencies.push(`${capId}_${previousTool}`);
                }

                workflowSteps.push({
                    stepId,
                    stepName: `${capability.name} - ${toolName}`,
                    agent: this.getAgentForTool(toolName),
                    tools: [toolName],
                    estimatedDuration: Math.ceil(estimatedDuration / capabilities.length), // Distribute duration
                    dependencies
                });
            });
        }

        const plan: OrchestrationPlan = {
            planId,
            journeyType: 'custom',
            selectedAgent: 'multi_agent', // Custom journeys can use multiple agents
            tools: Array.from(allTools),
            workflowSteps,
            estimatedTotalDuration: estimatedDuration,
            confidence: 0.85 // Slightly lower confidence for custom paths
        };

        console.log(`[PM Orchestrator] Created custom plan ${planId}: Tools=${plan.tools.length}, Steps=${workflowSteps.length}, Duration=${estimatedDuration}min`);

        return plan;
    }

    /**
     * Topological sort for capability dependencies
     */
    private topologicalSortCapabilities(capabilityIds: string[]): string[] {
        const { getCapabilityById } = require('../../shared/custom-journey-capabilities');

        const result: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (capId: string) => {
            if (visited.has(capId)) return;
            if (visiting.has(capId)) {
                throw new Error(`Circular dependency detected involving capability ${capId}`);
            }

            visiting.add(capId);

            const capability = getCapabilityById(capId);
            if (capability && capability.requiredCapabilities) {
                for (const requiredCapId of capability.requiredCapabilities) {
                    if (capabilityIds.includes(requiredCapId)) {
                        visit(requiredCapId);
                    }
                }
            }

            visiting.delete(capId);
            visited.add(capId);
            result.push(capId);
        };

        for (const capId of capabilityIds) {
            visit(capId);
        }

        return result;
    }

    /**
     * Determine which agent should handle a specific tool
     */
    private getAgentForTool(toolName: string): string {
        // Map tools to appropriate agents
        const toolAgentMap: Record<string, string> = {
            // Data preparation tools
            'file_processor': 'data_engineer',
            'schema_generator': 'data_engineer',
            'data_transformer': 'data_engineer',
            'spark_data_processor': 'data_engineer',

            // Statistical tools
            'statistical_analyzer': 'technical_ai_agent',
            'spark_statistical_analyzer': 'technical_ai_agent',
            'hypothesis_tester': 'technical_ai_agent',
            'correlation_analyzer': 'technical_ai_agent',

            // ML tools
            'comprehensive_ml_pipeline': 'technical_ai_agent',
            'automl_optimizer': 'technical_ai_agent',
            'spark_ml_pipeline': 'technical_ai_agent',
            'model_registry': 'technical_ai_agent',

            // LLM tools
            'llm_fine_tuner': 'technical_ai_agent',

            // Visualization tools
            'visualization_engine': 'technical_ai_agent',
            'enhanced_visualization_engine': 'technical_ai_agent',

            // Business tools
            'business_templates': 'business_agent',
            'kpi_dashboard': 'business_agent',

            // Coordination
            'project_coordinator': 'project_manager',
            'decision_auditor': 'project_manager'
        };

        return toolAgentMap[toolName] || 'technical_ai_agent'; // Default to technical agent
    }

    /**
     * Get tools required for a specific business template (Phase 4 - Task 4.1 helper)
     */
    private getTemplateTools(templateId: string): string[] {
        const templateToolsMap: Record<string, string[]> = {
            'customer_retention': ['statistical_analyzer', 'classification', 'visualization_engine'],
            'sales_forecasting': ['statistical_analyzer', 'regression', 'time_series', 'visualization_engine'],
            'risk_assessment': ['statistical_analyzer', 'classification', 'correlation', 'visualization_engine'],
            'marketing_campaign': ['statistical_analyzer', 'correlation', 'visualization_engine'],
            'financial_reporting': ['statistical_analyzer', 'time_series', 'visualization_engine'],
            'operational_efficiency': ['statistical_analyzer', 'correlation', 'clustering', 'visualization_engine'],
            'employee_attrition': ['statistical_analyzer', 'classification', 'correlation', 'visualization_engine'],
            'product_recommendation': ['clustering', 'classification', 'visualization_engine'],
            'inventory_optimization': ['regression', 'time_series', 'visualization_engine']
        };

        // Try to match template ID to known types
        for (const [key, tools] of Object.entries(templateToolsMap)) {
            if (templateId.toLowerCase().includes(key)) {
                return tools;
            }
        }

        // Default tools for business templates
        return ['statistical_analyzer', 'visualization_engine', 'business_templates'];
    }

    private async getProjectAndState(projectId: string): Promise<{ project: any, state: OrchestrationState }> {
        const project = await storage.getProject(projectId);
        if (!project) {
            throw new Error("Project not found");
        }
        const state = project.interactiveSession || {
            status: 'goal_extraction',
            history: [],
        };
        return { project, state };
    }

    private async updateProjectState(projectId: string, state: OrchestrationState) {
        await storage.updateProject(projectId, { interactiveSession: state });
    }

    async startGoalExtraction(projectId: string, userDescription: string, journeyType: string) {
        const { project, state } = await this.getProjectAndState(projectId);

        const context: BusinessContext = {
            projectName: project.name,
            projectDescription: project.description,
            recordCount: project.recordCount,
            dataSchema: project.schema,
        };

        const extractedGoals = await this.businessAgent.extractGoals(userDescription, journeyType, context);

        state.status = 'path_selection';
        state.lastAgentOutput = extractedGoals;
        state.history.push({
            step: 'startGoalExtraction',
            userInput: { userDescription, journeyType },
            agentOutput: extractedGoals,
            timestamp: new Date(),
        });

        await this.updateProjectState(projectId, state);
        return extractedGoals;
    }

    async confirmPathAndEstimateCost(projectId: string, userFeedback: { selectedPathName: string; modifications?: string }) {
        const { project, state } = await this.getProjectAndState(projectId);

        if (state.status !== 'path_selection') {
            throw new Error(`Cannot proceed. Project is in '${state.status}' status.`);
        }

        const analysisPath = state.lastAgentOutput.analysisPaths.find((p: any) => p.name === userFeedback.selectedPathName);
        if (!analysisPath) {
            throw new Error("Selected analysis path not found.");
        }

        const recordCount = project.data?.length || project.recordCount || 0;
        const cost = this.technicalAgent.estimateCost(analysisPath.type, recordCount, analysisPath.complexity);

        state.status = 'cost_approval';
        state.lastAgentOutput = { analysisPath, cost };
        state.userFeedback = userFeedback;
        state.history.push({
            step: 'confirmPathAndEstimateCost',
            userInput: userFeedback,
            agentOutput: { analysisPath, cost },
            timestamp: new Date(),
        });

        await this.updateProjectState(projectId, state);
        return { analysisPath, cost };
    }

    async approveCostAndExecute(projectId: string, userApproval: { approved: boolean }) {
        const { project, state } = await this.getProjectAndState(projectId);

        if (state.status !== 'cost_approval') {
            throw new Error(`Cannot execute. Project is in '${state.status}' status.`);
        }

        if (!userApproval.approved) {
            state.status = 'path_selection'; // Go back to path selection
            state.history.push({ step: 'approveCostAndExecute', userInput: userApproval, timestamp: new Date() });
            await this.updateProjectState(projectId, state);
            throw new Error("Cost not approved by user. Returning to path selection.");
        }

        const { analysisPath, cost } = state.lastAgentOutput;

        const checkoutSession = await PricingService.createCheckoutSession(projectId, cost.totalCost, cost.currency);
        await storage.updateProject(projectId, { paymentIntentId: checkoutSession.sessionId });

        state.status = 'ready_for_execution';
        state.history.push({ step: 'approveCostAndExecute', userInput: userApproval, timestamp: new Date() });
        await this.updateProjectState(projectId, state);

        // Execute analysis asynchronously
        this.executeAnalysis(projectId);

        return {
            message: "Analysis execution started.",
            checkoutUrl: checkoutSession.url,
        };
    }

    private async executeAnalysis(projectId: string) {
        const { project, state } = await this.getProjectAndState(projectId);
        const { analysisPath } = state.lastAgentOutput;

        try {
            state.status = 'executing';
            state.currentWorkflowStep = 'analysis_execution';
            await this.updateProjectState(projectId, state);

            // Initialize workflow dependencies for this analysis
            const workflow = await this.createWorkflowPlan(analysisPath, project);
            state.dependencies = workflow.dependencies;
            state.artifacts = [];
            await this.updateProjectState(projectId, state);

            // Execute workflow steps based on dependencies
            const executionResult = await this.executeWorkflow(projectId, workflow);

            await storage.updateProject(projectId, {
                analysisResults: { ...project.analysisResults, result: executionResult }
            });

            state.status = 'completed';
            state.lastAgentOutput = executionResult;
            state.history.push({ step: 'executeAnalysis', agentOutput: executionResult, timestamp: new Date() });
            await this.updateProjectState(projectId, state);

        } catch (error: any) {
            state.status = 'error';
            state.lastAgentOutput = { error: error.message };
            state.history.push({ step: 'executeAnalysis', agentOutput: { error: error.message }, timestamp: new Date() });
            await this.updateProjectState(projectId, state);
        }
    }

    // Advanced Workflow Orchestration Methods
    async createWorkflowPlan(analysisPath: any, project: any): Promise<{ dependencies: WorkflowDependency[] }> {
        const dependencies: WorkflowDependency[] = [];

        // Data preprocessing dependency
        dependencies.push({
            id: nanoid(),
            stepName: 'data_preprocessing',
            dependsOn: [],
            status: 'pending',
            artifacts: ['cleaned_dataset'],
            metadata: { inputDataset: project.id }
        });

        // Statistical analysis dependency
        if (analysisPath.type === 'statistical' || analysisPath.type === 'comprehensive') {
            dependencies.push({
                id: nanoid(),
                stepName: 'statistical_analysis',
                dependsOn: ['data_preprocessing'],
                status: 'pending',
                artifacts: ['stats_report'],
                metadata: { analysisType: 'descriptive' }
            });
        }

        // Machine learning dependency
        if (analysisPath.type === 'ml' || analysisPath.type === 'comprehensive') {
            dependencies.push({
                id: nanoid(),
                stepName: 'feature_engineering',
                dependsOn: ['data_preprocessing'],
                status: 'pending',
                artifacts: ['feature_set'],
                metadata: { featureStrategy: 'auto' }
            });

            dependencies.push({
                id: nanoid(),
                stepName: 'model_training',
                dependsOn: ['feature_engineering'],
                status: 'pending',
                artifacts: ['trained_model'],
                metadata: { modelType: analysisPath.parameters?.modelType || 'auto' }
            });
        }

        // Visualization dependency
        dependencies.push({
            id: nanoid(),
            stepName: 'visualization_generation',
            dependsOn: analysisPath.type === 'ml' ? ['model_training'] : ['statistical_analysis'],
            status: 'pending',
            artifacts: ['visualizations'],
            metadata: { chartTypes: analysisPath.parameters?.visualizations || ['auto'] }
        });

        // Report generation dependency
        dependencies.push({
            id: nanoid(),
            stepName: 'report_generation',
            dependsOn: ['visualization_generation'],
            status: 'pending',
            artifacts: ['final_report'],
            metadata: { format: ['pdf', 'interactive'] }
        });

        return { dependencies };
    }

    async executeWorkflow(projectId: string, workflow: { dependencies: WorkflowDependency[] }): Promise<any> {
        const { project, state } = await this.getProjectAndState(projectId);
        const results: any = {};
        const artifacts: ProjectArtifact[] = [];

        // Initialize workflow in broker for real-time coordination
        await this.messageBroker.sendMessage({
            from: 'project_manager',
            to: 'broadcast',
            type: 'status',
            payload: {
                projectId,
                status: 'workflow_started',
                totalSteps: workflow.dependencies.length
            }
        });

        // Execute steps in dependency order with real-time coordination
        const executionOrder = this.getExecutionOrder(workflow.dependencies);

        for (const stepName of executionOrder) {
            const dependency = workflow.dependencies.find(d => d.stepName === stepName);
            if (!dependency) continue;

            try {
                dependency.status = 'in_progress';
                await this.updateProjectState(projectId, { ...state, dependencies: workflow.dependencies });

                // Notify agents of step start via message broker
                await this.messageBroker.sendMessage({
                    from: 'project_manager',
                    to: 'broadcast',
                    type: 'status',
                    payload: {
                        projectId,
                        stepName,
                        status: 'step_started',
                        dependency
                    }
                });

                // Execute step using message broker coordination
                const stepResult = await this.executeWorkflowStepWithBroker(
                    stepName, 
                    dependency, 
                    project, 
                    results, 
                    projectId
                );
                results[stepName] = stepResult;

                // Create artifacts for this step
                if (dependency.artifacts) {
                    for (const artifactName of dependency.artifacts) {
                        const artifact: ProjectArtifact = {
                            id: nanoid(),
                            type: this.getArtifactType(artifactName),
                            name: artifactName,
                            description: `Generated from ${stepName}`,
                            metadata: stepResult,
                            dependencies: dependency.dependsOn,
                            createdAt: new Date(),
                            version: '1.0'
                        };
                        artifacts.push(artifact);
                    }
                }

                dependency.status = 'completed';

                // Notify completion via message broker
                await this.messageBroker.sendMessage({
                    from: 'project_manager',
                    to: 'broadcast',
                    type: 'result',
                    payload: {
                        projectId,
                        stepName,
                        result: stepResult,
                        status: 'completed'
                    }
                });

            } catch (error: any) {
                dependency.status = 'failed';
                results[stepName] = { error: error.message };
                console.error(`Workflow step ${stepName} failed:`, error);

                // Notify error via message broker
                await this.messageBroker.sendMessage({
                    from: 'project_manager',
                    to: 'broadcast',
                    type: 'error',
                    payload: {
                        projectId,
                        stepName,
                        error: error.message
                    }
                });
            }

            await this.updateProjectState(projectId, {
                ...state,
                dependencies: workflow.dependencies,
                artifacts: artifacts
            });
        }

        return results;
    }

    private getExecutionOrder(dependencies: WorkflowDependency[]): string[] {
        const order: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (stepName: string) => {
            if (visiting.has(stepName)) {
                throw new Error(`Circular dependency detected involving ${stepName}`);
            }
            if (visited.has(stepName)) return;

            visiting.add(stepName);

            const dep = dependencies.find(d => d.stepName === stepName);
            if (dep) {
                for (const prerequisite of dep.dependsOn) {
                    visit(prerequisite);
                }
            }

            visiting.delete(stepName);
            visited.add(stepName);
            order.push(stepName);
        };

        for (const dep of dependencies) {
            visit(dep.stepName);
        }

        return order;
    }

    private async executeWorkflowStep(stepName: string, dependency: WorkflowDependency, project: any, previousResults: any): Promise<any> {
        switch (stepName) {
            case 'data_preprocessing':
                return this.technicalAgent.preprocessData(project.data, project.schema);

            case 'statistical_analysis':
                return this.technicalAgent.performStatisticalAnalysis(
                    previousResults.data_preprocessing?.cleanedData || project.data,
                    dependency.metadata
                );

            case 'feature_engineering':
                return this.technicalAgent.engineerFeatures(
                    previousResults.data_preprocessing?.cleanedData || project.data,
                    dependency.metadata
                );

            case 'model_training':
                return this.technicalAgent.trainModel(
                    previousResults.feature_engineering?.features,
                    dependency.metadata
                );

            case 'visualization_generation':
                return this.technicalAgent.generateVisualizations(
                    previousResults,
                    dependency.metadata
                );

            case 'report_generation':
                return this.generateComprehensiveReport(project, previousResults, dependency.metadata);

            default:
                throw new Error(`Unknown workflow step: ${stepName}`);
        }
    }

    /**
     * Execute workflow step using message broker for real-time coordination
     * This replaces the polling-based approach with real-time communication
     */
    private async executeWorkflowStepWithBroker(
        stepName: string, 
        dependency: WorkflowDependency, 
        project: any, 
        previousResults: any,
        projectId: string
    ): Promise<any> {
        // Determine which agent should handle this step
        const targetAgent = this.getAgentForStep(stepName);
        
        try {
            // Send task to appropriate agent via message broker
            const stepResult = await this.sendTaskToAgent(targetAgent, {
                stepName,
                dependency,
                project,
                previousResults
            }, projectId);
            
            return stepResult;
        } catch (error) {
            console.error(`Broker-based execution failed for ${stepName}, falling back to direct execution:`, error);
            
            // Fallback to direct execution if broker fails
            return await this.executeWorkflowStep(stepName, dependency, project, previousResults);
        }
    }

    /**
     * Determine which agent should handle a specific workflow step
     */
    private getAgentForStep(stepName: string): string {
        switch (stepName) {
            case 'data_preprocessing':
            case 'statistical_analysis':
            case 'feature_engineering':
            case 'model_training':
            case 'visualization_generation':
                return 'technical_agent';
            case 'report_generation':
            case 'business_analysis':
            case 'recommendations':
                return 'business_agent';
            default:
                return 'technical_agent'; // Default to technical agent
        }
    }

    private getArtifactType(artifactName: string): ProjectArtifact['type'] {
        if (artifactName.includes('dataset')) return 'dataset';
        if (artifactName.includes('model')) return 'model';
        if (artifactName.includes('visualization')) return 'visualization';
        if (artifactName.includes('report')) return 'report';
        return 'analysis';
    }

    private async generateComprehensiveReport(project: any, results: any, metadata: any): Promise<any> {
        return {
            projectSummary: {
                name: project.name,
                description: project.description,
                recordCount: project.recordCount,
                analysisType: 'comprehensive'
            },
            executiveSummary: this.generateExecutiveSummary(results),
            technicalFindings: results,
            recommendations: this.generateRecommendations(results),
            artifacts: metadata,
            generatedAt: new Date()
        };
    }

    private generateExecutiveSummary(results: any): string {
        let summary = "Analysis completed successfully. ";

        if (results.statistical_analysis) {
            summary += `Statistical analysis revealed key patterns in the data. `;
        }

        if (results.model_training) {
            summary += `Machine learning model was trained with ${results.model_training.accuracy || 'good'} performance. `;
        }

        if (results.visualization_generation) {
            summary += `Generated ${results.visualization_generation.charts?.length || 'multiple'} visualizations for insights. `;
        }

        return summary;
    }

    private generateRecommendations(results: any): string[] {
        const recommendations = [];

        if (results.statistical_analysis?.dataQuality?.completeness < 90) {
            recommendations.push("Improve data quality by addressing missing values");
        }

        if (results.model_training?.accuracy < 0.8) {
            recommendations.push("Consider feature engineering or alternative modeling approaches");
        }

        recommendations.push("Implement regular data monitoring and model retraining");
        recommendations.push("Share insights with stakeholders through interactive dashboards");

        return recommendations;
    }

    // Artifact Management Methods
    async getProjectArtifacts(projectId: string): Promise<ProjectArtifact[]> {
        const { state } = await this.getProjectAndState(projectId);
        return state.artifacts || [];
    }

    async getArtifactLineage(projectId: string, artifactId: string): Promise<ProjectArtifact[]> {
        const artifacts = await this.getProjectArtifacts(projectId);
        const artifact = artifacts.find(a => a.id === artifactId);

        if (!artifact) return [];

        const lineage: ProjectArtifact[] = [artifact];

        // Recursively find dependencies
        const findDependencies = (deps: string[]) => {
            for (const depId of deps) {
                const depArtifact = artifacts.find(a => a.id === depId);
                if (depArtifact && !lineage.includes(depArtifact)) {
                    lineage.unshift(depArtifact);
                    if (depArtifact.dependencies) {
                        findDependencies(depArtifact.dependencies);
                    }
                }
            }
        };

        if (artifact.dependencies) {
            findDependencies(artifact.dependencies);
        }

        return lineage;
    }

    /**
     * Enhanced Task Queue Integration Methods
     */

    /**
     * Queue a task for execution by appropriate agent
     */
    async queueTask(taskData: {
        type: string;
        priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
        payload: any;
        requiredCapabilities: string[];
        userId: string;
        projectId?: string;
        preferredAgents?: string[];
        excludeAgents?: string[];
        estimatedDuration?: number;
        dependencies?: string[];
        maxRetries?: number;
        timeoutMs?: number;
    }): Promise<string> {
        try {
            const taskId = await taskQueue.enqueueTask({
                type: taskData.type,
                priority: taskData.priority,
                payload: {
                    ...taskData.payload,
                    projectId: taskData.projectId,
                    userId: taskData.userId
                },
                requiredCapabilities: taskData.requiredCapabilities,
                preferredAgents: taskData.preferredAgents,
                excludeAgents: taskData.excludeAgents,
                metadata: {
                    userId: taskData.userId,
                    projectId: taskData.projectId,
                    estimatedDuration: taskData.estimatedDuration,
                    dependencies: taskData.dependencies,
                    maxRetries: taskData.maxRetries,
                    timeoutMs: taskData.timeoutMs
                }
            });

            console.log(`Task ${taskId} queued for execution`);

            // Update project state if applicable
            if (taskData.projectId) {
                const { project, state } = await this.getProjectAndState(taskData.projectId);
                state.history.push({
                    step: 'task_queued',
                    agentOutput: {
                        taskId,
                        taskType: taskData.type,
                        priority: taskData.priority,
                        capabilities: taskData.requiredCapabilities
                    },
                    timestamp: new Date()
                });
                await this.updateProjectState(taskData.projectId, state);
            }

            return taskId;
        } catch (error) {
            console.error('Failed to queue task:', error);
            throw error;
        }
    }

    /**
     * Queue multiple related tasks with dependencies
     */
    async queueWorkflowTasks(projectId: string, tasks: Array<{
        stepName: string;
        type: string;
        priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
        payload: any;
        requiredCapabilities: string[];
        dependsOn?: string[];
        estimatedDuration?: number;
        preferredAgents?: string[];
    }>): Promise<string[]> {
        const taskIds: string[] = [];
        const { project } = await this.getProjectAndState(projectId);
        
        // Sort tasks by dependencies (simple topological sort)
        const sortedTasks = this.topologicalSort(tasks);
        const taskIdMap = new Map<string, string>();

        for (const task of sortedTasks) {
            // Convert step dependencies to task ID dependencies
            const dependencies = task.dependsOn?.map(stepName => taskIdMap.get(stepName)).filter(Boolean) || [];

            const taskId = await this.queueTask({
                type: task.type,
                priority: task.priority,
                payload: {
                    ...task.payload,
                    stepName: task.stepName,
                    projectId,
                    userId: project.userId
                },
                requiredCapabilities: task.requiredCapabilities,
                userId: project.userId,
                projectId,
                preferredAgents: task.preferredAgents,
                estimatedDuration: task.estimatedDuration,
                dependencies,
                maxRetries: 2 // Workflow tasks get fewer retries
            });

            taskIds.push(taskId);
            taskIdMap.set(task.stepName, taskId);
        }

        // Update project state with workflow dependencies
        const { state } = await this.getProjectAndState(projectId);
        state.dependencies = tasks.map(task => ({
            id: taskIdMap.get(task.stepName)!,
            stepName: task.stepName,
            dependsOn: task.dependsOn || [],
            status: 'pending' as const,
            artifacts: []
        }));
        
        await this.updateProjectState(projectId, state);

        console.log(`Queued ${taskIds.length} workflow tasks for project ${projectId}`);
        return taskIds;
    }

    /**
     * Simple topological sort for task dependencies
     */
    private topologicalSort<T extends { stepName: string; dependsOn?: string[] }>(tasks: T[]): T[] {
        const result: T[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (task: T) => {
            if (visited.has(task.stepName)) return;
            if (visiting.has(task.stepName)) {
                throw new Error(`Circular dependency detected involving ${task.stepName}`);
            }

            visiting.add(task.stepName);

            // Visit dependencies first
            if (task.dependsOn) {
                for (const depName of task.dependsOn) {
                    const depTask = tasks.find(t => t.stepName === depName);
                    if (depTask) {
                        visit(depTask);
                    }
                }
            }

            visiting.delete(task.stepName);
            visited.add(task.stepName);
            result.push(task);
        };

        for (const task of tasks) {
            visit(task);
        }

        return result;
    }

    /**
     * Get task queue metrics for monitoring
     */
    getTaskQueueMetrics() {
        return taskQueue.getMetrics();
    }

    /**
     * Get agent capacity information
     */
    getAgentCapacities() {
        return taskQueue.getAgentCapacities();
    }

    /**
     * Get queue status for monitoring
     */
    getQueueStatus(priority?: string) {
        return taskQueue.getQueueStatus(priority);
    }

    // ==========================================
    // MULTI-AGENT COORDINATION METHODS
    // ==========================================

    /**
     * Coordinate goal analysis across all three specialist agents
     * Queries Data Engineer, Data Scientist, and Business Agent in parallel
     * 
     * @param projectId - Project identifier
     * @param uploadedData - Data that was just uploaded
     * @param userGoals - User's stated business goals
     * @param industry - Industry context
     * @returns Multi-agent coordination result with expert opinions and synthesis
     */
    async coordinateGoalAnalysis(
        projectId: string,
        uploadedData: any,
        userGoals: string[],
        industry: string
    ): Promise<MultiAgentCoordinationResult> {
        return measurePerformance(
            'multi_agent_coordination',
            async () => {
                const coordinationId = nanoid();
                const startTime = Date.now();

                console.log(`[PM Coordinator] Starting multi-agent goal analysis for project ${projectId}`);

        // Handle null/undefined inputs gracefully
        if (!projectId || typeof projectId !== 'string') {
            return {
                coordinationId,
                projectId: 'invalid',
                expertOpinions: [],
                synthesis: {
                    overallAssessment: 'Invalid project ID provided',
                    confidence: 0,
                    keyFindings: ['Project ID must be a valid string'],
                    combinedRisks: ['Invalid project identification'],
                    actionableRecommendations: ['Please provide a valid project ID'],
                    expertConsensus: {
                        dataQuality: 'unknown',
                        technicalFeasibility: 'unknown',
                        businessValue: 'unknown'
                    },
                    estimatedTimeline: 'N/A - Invalid project ID',
                    estimatedCost: 'N/A - Invalid project ID',
                    nextSteps: ['Provide valid project ID and retry']
                },
                responseTime: Date.now() - startTime,
                success: false,
                error: 'Invalid project ID'
            };
        }

        if (!uploadedData || typeof uploadedData !== 'object') {
            return {
                coordinationId,
                projectId,
                expertOpinions: [],
                synthesis: {
                    overallAssessment: 'Invalid data provided for analysis',
                    confidence: 0,
                    keyFindings: ['Uploaded data must be a valid object'],
                    combinedRisks: ['No data available for analysis'],
                    actionableRecommendations: ['Please provide valid data for analysis'],
                    expertConsensus: {
                        dataQuality: 'unknown',
                        technicalFeasibility: 'unknown',
                        businessValue: 'unknown'
                    },
                    estimatedTimeline: 'N/A - No data available',
                    estimatedCost: 'N/A - No data available',
                    nextSteps: ['Upload valid data and retry analysis']
                },
                responseTime: Date.now() - startTime,
                success: false,
                error: 'Invalid uploaded data'
            };
        }

        if (!userGoals || !Array.isArray(userGoals)) {
            return {
                coordinationId,
                projectId,
                expertOpinions: [],
                synthesis: {
                    overallAssessment: 'No analysis goals provided',
                    confidence: 0,
                    keyFindings: ['User goals must be a valid array'],
                    combinedRisks: ['Unclear project objectives'],
                    actionableRecommendations: ['Please provide clear analysis goals'],
                    expertConsensus: {
                        dataQuality: 'unknown',
                        technicalFeasibility: 'unknown',
                        businessValue: 'unknown'
                    },
                    estimatedTimeline: 'N/A - No goals specified',
                    estimatedCost: 'N/A - No goals specified',
                    nextSteps: ['Define clear analysis goals and retry']
                },
                responseTime: Date.now() - startTime,
                success: false,
                error: 'Invalid user goals'
            };
        }

        if (!industry || typeof industry !== 'string') {
            return {
                coordinationId,
                projectId,
                expertOpinions: [],
                synthesis: {
                    overallAssessment: 'Industry context missing',
                    confidence: 0,
                    keyFindings: ['Industry must be a valid string'],
                    combinedRisks: ['Lack of industry context'],
                    actionableRecommendations: ['Please provide industry context'],
                    expertConsensus: {
                        dataQuality: 'unknown',
                        technicalFeasibility: 'unknown',
                        businessValue: 'unknown'
                    },
                    estimatedTimeline: 'N/A - No industry context',
                    estimatedCost: 'N/A - No industry context',
                    nextSteps: ['Provide industry context and retry']
                },
                responseTime: Date.now() - startTime,
                success: false,
                error: 'Invalid industry context'
            };
        }

        try {
            // Query all three agents in parallel using Promise.all
            const [dataEngineerOpinion, dataScientistOpinion, businessAgentOpinion] = await Promise.all([
                // Data Engineer: Assess data quality
                this.queryDataEngineer(projectId, uploadedData).catch(error => ({
                    agentId: 'data_engineer' as const,
                    agentName: 'Data Engineer',
                    opinion: { error: error.message, overallScore: 0 },
                    confidence: 0,
                    timestamp: new Date(),
                    responseTime: Date.now() - startTime
                })),

                // Data Scientist: Check feasibility
                this.queryDataScientist(projectId, uploadedData, userGoals).catch(error => ({
                    agentId: 'data_scientist' as const,
                    agentName: 'Data Scientist',
                    opinion: { error: error.message, feasible: false },
                    confidence: 0,
                    timestamp: new Date(),
                    responseTime: Date.now() - startTime
                })),

                // Business Agent: Extract goals and assess business impact
                this.queryBusinessAgent(projectId, uploadedData, userGoals, industry).catch(error => ({
                    agentId: 'business_agent' as const,
                    agentName: 'Business Agent',
                    opinion: { error: error.message, businessValue: 'low' },
                    confidence: 0,
                    timestamp: new Date(),
                    responseTime: Date.now() - startTime
                }))
            ]);

            const expertOpinions: ExpertOpinion[] = [
                dataEngineerOpinion,
                dataScientistOpinion,
                businessAgentOpinion
            ];

            // Synthesize all expert opinions into unified recommendation
            const synthesis = this.synthesizeExpertOpinions(expertOpinions, uploadedData, userGoals);

            const totalResponseTime = Date.now() - startTime;

            console.log(`[PM Coordinator] Multi-agent analysis complete in ${totalResponseTime}ms`);

            return {
                coordinationId,
                projectId,
                expertOpinions,
                synthesis,
                timestamp: new Date(),
                totalResponseTime
            };
            } catch (error) {
                console.error(`[PM Coordinator] Goal analysis coordination failed:`, error);
                throw error;
            }
        },
        { projectId, userGoalsCount: userGoals.length, industry }
    );
}

    /**
     * Query Data Engineer agent for data quality assessment
     */
    private async queryDataEngineer(projectId: string, uploadedData: any): Promise<ExpertOpinion> {
        const startTime = Date.now();

        const response = await this.messageBroker.sendAndWait({
            from: 'project_manager',
            to: 'data_engineer',
            type: 'task',
            payload: {
                stepName: 'assess_data_quality',
                projectId,
                payload: {
                    data: uploadedData.data || uploadedData,
                    schema: uploadedData.schema || {}
                }
            }
        }, 30000); // 30s timeout

        return {
            agentId: 'data_engineer',
            agentName: 'Data Engineer',
            opinion: response,
            confidence: response.confidence || 0.8,
            timestamp: new Date(),
            responseTime: Date.now() - startTime
        };
    }

    /**
     * Query Data Scientist agent for feasibility check
     */
    private async queryDataScientist(projectId: string, uploadedData: any, goals: string[]): Promise<ExpertOpinion> {
        const startTime = Date.now();

        const response = await this.messageBroker.sendAndWait({
            from: 'project_manager',
            to: 'data_scientist',
            type: 'task',
            payload: {
                stepName: 'check_feasibility',
                projectId,
                payload: {
                    goals,
                    dataSchema: uploadedData.schema || {},
                    dataQuality: uploadedData.qualityMetrics || {}
                }
            }
        }, 30000);

        return {
            agentId: 'data_scientist',
            agentName: 'Data Scientist',
            opinion: response,
            confidence: response.confidence || 0.8,
            timestamp: new Date(),
            responseTime: Date.now() - startTime
        };
    }

    /**
     * Query Business Agent for goal extraction and business impact
     */
    private async queryBusinessAgent(projectId: string, uploadedData: any, goals: string[], industry: string): Promise<ExpertOpinion> {
        const startTime = Date.now();

        const response = await this.messageBroker.sendAndWait({
            from: 'project_manager',
            to: 'business_agent',
            type: 'task',
            payload: {
                stepName: 'assess_business_impact',
                projectId,
                payload: {
                    goals,
                    proposedApproach: {
                        dataType: uploadedData.type || 'tabular',
                        analysisType: 'exploratory',
                        techniques: []
                    },
                    industry
                }
            }
        }, 30000);

        return {
            agentId: 'business_agent',
            agentName: 'Business Agent',
            opinion: response,
            confidence: response.confidence || 0.8,
            timestamp: new Date(),
            responseTime: Date.now() - startTime
        };
    }

    /**
     * Synthesize expert opinions into unified PM recommendation
     * Combines Data Engineer, Data Scientist, and Business Agent assessments
     */
    synthesizeExpertOpinions(
        expertOpinions: ExpertOpinion[],
        uploadedData: any,
        userGoals: string[]
    ): SynthesizedRecommendation {
        // Handle null/undefined inputs gracefully
        if (!expertOpinions || !Array.isArray(expertOpinions)) {
            return {
                overallAssessment: 'Unable to assess project due to missing expert opinions',
                confidence: 0,
                keyFindings: ['No expert opinions available for analysis'],
                combinedRisks: ['Missing expert input'],
                actionableRecommendations: ['Please ensure all agents are properly initialized'],
                expertConsensus: {
                    dataQuality: 'unknown',
                    technicalFeasibility: 'unknown',
                    businessValue: 'unknown'
                },
                estimatedTimeline: 'N/A - Missing expert input',
                estimatedCost: 'N/A - Missing expert input',
                nextSteps: ['Re-initialize agents and retry analysis']
            };
        }

        if (!uploadedData || typeof uploadedData !== 'object') {
            return {
                overallAssessment: 'Unable to assess project due to invalid data',
                confidence: 0,
                keyFindings: ['Invalid or missing uploaded data'],
                combinedRisks: ['No data available for analysis'],
                actionableRecommendations: ['Please provide valid data for analysis'],
                expertConsensus: {
                    dataQuality: 'unknown',
                    technicalFeasibility: 'unknown',
                    businessValue: 'unknown'
                },
                estimatedTimeline: 'N/A - No data available',
                estimatedCost: 'N/A - No data available',
                nextSteps: ['Upload valid data and retry analysis']
            };
        }

        if (!userGoals || !Array.isArray(userGoals)) {
            return {
                overallAssessment: 'Unable to assess project due to missing goals',
                confidence: 0,
                keyFindings: ['No analysis goals provided'],
                combinedRisks: ['Unclear project objectives'],
                actionableRecommendations: ['Please provide clear analysis goals'],
                expertConsensus: {
                    dataQuality: 'unknown',
                    technicalFeasibility: 'unknown',
                    businessValue: 'unknown'
                },
                estimatedTimeline: 'N/A - No goals specified',
                estimatedCost: 'N/A - No goals specified',
                nextSteps: ['Define clear analysis goals and retry']
            };
        }

        const dataEngineerOpinion = expertOpinions.find(op => op.agentId === 'data_engineer')?.opinion;
        const dataScientistOpinion = expertOpinions.find(op => op.agentId === 'data_scientist')?.opinion;
        const businessAgentOpinion = expertOpinions.find(op => op.agentId === 'business_agent')?.opinion;

        // Calculate data quality assessment
        const dataQualityScore = dataEngineerOpinion?.overallScore || 0;
        const dataQuality: 'good' | 'acceptable' | 'poor' = 
            dataQualityScore >= 0.8 ? 'good' :
            dataQualityScore >= 0.6 ? 'acceptable' : 'poor';

        // Calculate technical feasibility
        const isFeasible = dataScientistOpinion?.feasible !== false;
        const feasibilityConfidence = dataScientistOpinion?.confidence || 0;
        const technicalFeasibility: 'feasible' | 'challenging' | 'not_feasible' =
            isFeasible && feasibilityConfidence >= 0.7 ? 'feasible' :
            isFeasible && feasibilityConfidence >= 0.5 ? 'challenging' : 'not_feasible';

        // Calculate business value
        const businessValue = businessAgentOpinion?.businessValue || 'low';

        // Determine overall assessment with clearer edge case logic
        let overallAssessment: 'proceed' | 'proceed_with_caution' | 'revise_approach' | 'not_feasible';
        let overallConfidence = 0;

        // Check for critical blockers first (not_feasible)
        if (dataQuality === 'poor' || technicalFeasibility === 'not_feasible') {
            overallAssessment = 'not_feasible';
            overallConfidence = 0.3;
        }
        // Check for ideal conditions (proceed)
        else if (dataQuality === 'good' && technicalFeasibility === 'feasible' && businessValue === 'high') {
            overallAssessment = 'proceed';
            overallConfidence = 0.9;
        }
        // Low business value should be cautious but not a blocker (proceed_with_caution)
        else if (businessValue === 'low') {
            overallAssessment = 'proceed_with_caution';
            overallConfidence = 0.6;
        }
        // Challenging feasibility with acceptable quality needs revision (revise_approach)
        else if (dataQuality === 'acceptable' && technicalFeasibility === 'challenging') {
            overallAssessment = 'revise_approach';
            overallConfidence = 0.55;
        }
        // All other middle-ground scenarios (proceed_with_caution)
        else if (dataQuality === 'acceptable' || technicalFeasibility === 'challenging' || businessValue === 'medium') {
            overallAssessment = 'proceed_with_caution';
            overallConfidence = 0.65;
        }
        // Final fallback for edge cases
        else {
            overallAssessment = 'revise_approach';
            overallConfidence = 0.5;
        }

        // Collect key findings from all agents (extract first recommendation from each)
        const keyFindings: string[] = [];
        
        if (dataEngineerOpinion?.recommendations && Array.isArray(dataEngineerOpinion.recommendations) && dataEngineerOpinion.recommendations.length > 0) {
            keyFindings.push(dataEngineerOpinion.recommendations[0]);
        }
        
        if (dataScientistOpinion?.recommendations && Array.isArray(dataScientistOpinion.recommendations) && dataScientistOpinion.recommendations.length > 0) {
            keyFindings.push(dataScientistOpinion.recommendations[0]);
        }
        
        if (businessAgentOpinion?.recommendations && Array.isArray(businessAgentOpinion.recommendations) && businessAgentOpinion.recommendations.length > 0) {
            keyFindings.push(businessAgentOpinion.recommendations[0]);
        }
        
        // Add fallback key findings if no recommendations available
        if (keyFindings.length === 0) {
            if (dataEngineerOpinion?.overallScore) {
                keyFindings.push(`Data quality score: ${dataEngineerOpinion.overallScore.toFixed(2)}`);
            }
            if (dataScientistOpinion?.requiredAnalyses) {
                keyFindings.push(`Required analyses: ${dataScientistOpinion.requiredAnalyses.join(', ')}`);
            }
            if (businessAgentOpinion?.businessValue) {
                keyFindings.push(`Business value: ${businessAgentOpinion.businessValue}`);
            }
        }

        // Combine risks from all agents
        const combinedRisks: Array<{ source: string; risk: string; severity: 'high' | 'medium' | 'low' }> = [];
        
        if (dataEngineerOpinion?.issues) {
            dataEngineerOpinion.issues.forEach((issue: any) => {
                combinedRisks.push({
                    source: 'Data Engineer',
                    risk: issue.type || issue,
                    severity: issue.severity || 'medium'
                });
            });
        }
        
        if (dataScientistOpinion?.concerns) {
            dataScientistOpinion.concerns.forEach((concern: string) => {
                combinedRisks.push({
                    source: 'Data Scientist',
                    risk: concern,
                    severity: 'medium'
                });
            });
        }
        
        if (businessAgentOpinion?.risks) {
            businessAgentOpinion.risks.forEach((risk: string) => {
                combinedRisks.push({
                    source: 'Business Agent',
                    risk,
                    severity: risk.toLowerCase().includes('compliance') ? 'high' : 'medium'
                });
            });
        }

        // Generate actionable recommendations
        const actionableRecommendations: string[] = [];
        
        if (dataQuality === 'poor') {
            actionableRecommendations.push('Address data quality issues before proceeding with analysis');
        }
        
        if (dataEngineerOpinion?.recommendations) {
            actionableRecommendations.push(...dataEngineerOpinion.recommendations.slice(0, 2));
        }
        
        if (dataScientistOpinion?.recommendations) {
            actionableRecommendations.push(...dataScientistOpinion.recommendations.slice(0, 2));
        }
        
        if (businessAgentOpinion?.recommendations) {
            actionableRecommendations.push(...businessAgentOpinion.recommendations.slice(0, 2));
        }

        // Estimate timeline based on data size and complexity
        const rowCount = uploadedData.rowCount || uploadedData.data?.length || 0;
        const estimatedMinutes = dataEngineerOpinion?.estimatedFixTime || 
            (rowCount > 100000 ? '30-60 minutes' : rowCount > 10000 ? '10-30 minutes' : '5-15 minutes');

        return {
            overallAssessment,
            confidence: overallConfidence,
            keyFindings,
            combinedRisks,
            actionableRecommendations: actionableRecommendations.slice(0, 5), // Top 5 recommendations
            expertConsensus: {
                dataQuality,
                technicalFeasibility,
                businessValue: businessValue as 'high' | 'medium' | 'low'
            },
            estimatedTimeline: estimatedMinutes,
            estimatedCost: businessAgentOpinion?.expectedROI || 'To be determined'
        };
    }

    // ==========================================
    // DECISION AUDIT TRAIL (Phase 4 - Task 4.4)
    // ==========================================

    /**
     * Log a decision to the audit trail
     */
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
        const auditRecord: DecisionAuditRecord = {
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

        // Get or create audit trail for this project
        if (!this.decisionAuditTrail.has(projectId)) {
            this.decisionAuditTrail.set(projectId, []);
        }

        this.decisionAuditTrail.get(projectId)!.push(auditRecord);

        console.log(`[Decision Audit] Logged ${decisionType} decision by ${decisionMaker} for project ${projectId}`);

        return auditRecord;
    }

    /**
     * Get audit trail for a project
     */
    getAuditTrail(projectId: string): DecisionAuditRecord[] {
        return this.decisionAuditTrail.get(projectId) || [];
    }

    /**
     * Get audit trail filtered by decision type
     */
    getAuditTrailByType(
        projectId: string,
        decisionType: DecisionAuditRecord['decisionType']
    ): DecisionAuditRecord[] {
        const allRecords = this.getAuditTrail(projectId);
        return allRecords.filter(record => record.decisionType === decisionType);
    }

    /**
     * Get audit trail filtered by decision maker
     */
    getAuditTrailByMaker(
        projectId: string,
        decisionMaker: DecisionAuditRecord['decisionMaker']
    ): DecisionAuditRecord[] {
        const allRecords = this.getAuditTrail(projectId);
        return allRecords.filter(record => record.decisionMaker === decisionMaker);
    }

    /**
     * Get audit trail summary
     */
    getAuditSummary(projectId: string): {
        totalDecisions: number;
        decisionsByType: Record<string, number>;
        decisionsByMaker: Record<string, number>;
        averageConfidence: number;
        latestDecision?: DecisionAuditRecord;
    } {
        const allRecords = this.getAuditTrail(projectId);

        const decisionsByType: Record<string, number> = {};
        const decisionsByMaker: Record<string, number> = {};
        let totalConfidence = 0;
        let confidenceCount = 0;

        allRecords.forEach(record => {
            // Count by type
            decisionsByType[record.decisionType] = (decisionsByType[record.decisionType] || 0) + 1;

            // Count by maker
            decisionsByMaker[record.decisionMaker] = (decisionsByMaker[record.decisionMaker] || 0) + 1;

            // Sum confidence
            if (record.confidence !== undefined) {
                totalConfidence += record.confidence;
                confidenceCount++;
            }
        });

        return {
            totalDecisions: allRecords.length,
            decisionsByType,
            decisionsByMaker,
            averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
            latestDecision: allRecords.length > 0 ? allRecords[allRecords.length - 1] : undefined
        };
    }

    /**
     * Clear audit trail for a project (use with caution)
     */
    clearAuditTrail(projectId: string): void {
        this.decisionAuditTrail.delete(projectId);
        console.log(`[Decision Audit] Cleared audit trail for project ${projectId}`);
    }

    // ==========================================
    // DATA TRANSFORMATION COORDINATION METHODS
    // ==========================================

    /**
     * Generate transformation recommendations based on data characteristics
     */
    async generateTransformationRecommendations(
        dataCharacteristics: {
            columnCount: number;
            dataSize: number;
            fieldTypes: string[];
            journeyType: string;
        },
        journeyType: string
    ): Promise<{
        overallRecommendation: string;
        suggestedTransformations: string[];
        dataQualityIssues: string[];
        transformationPriority: string[];
        estimatedComplexity: 'low' | 'medium' | 'high';
    }> {
        try {
            console.log(`[PM Agent] Generating transformation recommendations for ${journeyType} journey`);

            const { columnCount, dataSize, fieldTypes } = dataCharacteristics;
            
            // Analyze data characteristics
            const numericFields = fieldTypes.filter(type => ['number', 'integer', 'float'].includes(type)).length;
            const textFields = fieldTypes.filter(type => ['string', 'text'].includes(type)).length;
            const dateFields = fieldTypes.filter(type => ['date', 'datetime'].includes(type)).length;

            // Generate recommendations based on journey type and data characteristics
            let overallRecommendation = '';
            let suggestedTransformations: string[] = [];
            let dataQualityIssues: string[] = [];
            let transformationPriority: string[] = [];
            let estimatedComplexity: 'low' | 'medium' | 'high' = 'low';

            switch (journeyType) {
                case 'non-tech':
                    overallRecommendation = 'Focus on data cleaning and simple aggregations to prepare data for business analysis.';
                    suggestedTransformations = ['clean', 'rename', 'aggregate'];
                    if (dataSize > 10000) {
                        suggestedTransformations.push('filter');
                        dataQualityIssues.push('Large dataset - consider filtering for relevant subsets');
                    }
                    transformationPriority = ['clean', 'rename', 'aggregate', 'filter'];
                    estimatedComplexity = dataSize > 50000 ? 'medium' : 'low';
                    break;

                case 'business':
                    overallRecommendation = 'Apply business-focused transformations including data cleaning, aggregation, and joining for comprehensive analysis.';
                    suggestedTransformations = ['clean', 'rename', 'aggregate', 'sort'];
                    if (numericFields > 0) {
                        suggestedTransformations.push('convert');
                    }
                    if (textFields > 5) {
                        dataQualityIssues.push('Many text fields - consider standardization');
                    }
                    transformationPriority = ['clean', 'rename', 'aggregate', 'sort', 'convert'];
                    estimatedComplexity = columnCount > 20 ? 'medium' : 'low';
                    break;

                case 'technical':
                    overallRecommendation = 'Comprehensive data preparation including advanced transformations, type conversions, and data quality improvements.';
                    suggestedTransformations = ['clean', 'convert', 'filter', 'aggregate', 'sort'];
                    if (dateFields > 0) {
                        suggestedTransformations.push('convert');
                    }
                    if (dataSize > 100000) {
                        suggestedTransformations.push('filter');
                        dataQualityIssues.push('Very large dataset - consider sampling or filtering');
                    }
                    transformationPriority = ['clean', 'convert', 'filter', 'aggregate', 'sort'];
                    estimatedComplexity = dataSize > 100000 || columnCount > 50 ? 'high' : 'medium';
                    break;

                case 'consultation':
                    overallRecommendation = 'Professional-grade data preparation with comprehensive cleaning and validation for expert analysis.';
                    suggestedTransformations = ['clean', 'convert', 'rename', 'aggregate', 'sort'];
                    if (numericFields === 0) {
                        dataQualityIssues.push('No numeric fields detected - consider data type conversion');
                    }
                    transformationPriority = ['clean', 'convert', 'rename', 'aggregate', 'sort'];
                    estimatedComplexity = 'medium';
                    break;

                default:
                    overallRecommendation = 'Standard data preparation with cleaning and basic transformations.';
                    suggestedTransformations = ['clean', 'rename'];
                    transformationPriority = ['clean', 'rename'];
                    estimatedComplexity = 'low';
            }

            // Add data quality issues based on characteristics
            if (columnCount === 0) {
                dataQualityIssues.push('No columns detected - check data structure');
            }
            if (dataSize === 0) {
                dataQualityIssues.push('No data rows - verify data upload');
            }
            if (fieldTypes.includes('unknown')) {
                dataQualityIssues.push('Unknown field types detected - consider type conversion');
            }

            return {
                overallRecommendation,
                suggestedTransformations,
                dataQualityIssues,
                transformationPriority,
                estimatedComplexity
            };

        } catch (error) {
            console.error('[PM Agent] Failed to generate transformation recommendations:', error);
            
            // Return fallback recommendations
            return {
                overallRecommendation: 'Apply basic data cleaning and preparation transformations.',
                suggestedTransformations: ['clean', 'rename'],
                dataQualityIssues: ['Unable to analyze data characteristics'],
                transformationPriority: ['clean', 'rename'],
                estimatedComplexity: 'low'
            };
        }
    }

    /**
     * Coordinate transformation execution with specialized agents
     */
    async coordinateTransformationExecution(request: {
        projectId: string;
        transformations: any[];
        userGoals: string[];
        audienceContext: any;
    }): Promise<{
        coordinationId: string;
        projectId: string;
        agentAssignments: Array<{
            agentId: string;
            transformations: any[];
            estimatedDuration: number;
            dependencies: string[];
        }>;
        overallTimeline: number;
        confidence: number;
        warnings: string[];
    }> {
        try {
            console.log(`[PM Agent] Coordinating transformation execution for project ${request.projectId}`);

            const coordinationId = nanoid();
            const startTime = Date.now();

            // Analyze transformations and assign to appropriate agents
            const agentAssignments = this.assignTransformationsToAgents(request.transformations);
            
            // Calculate overall timeline
            const overallTimeline = agentAssignments.reduce((total, assignment) => 
                total + assignment.estimatedDuration, 0
            );

            // Calculate confidence based on transformation complexity
            let confidence = 0.8;
            const complexTransformations = request.transformations.filter(t => 
                ['join', 'aggregate', 'convert'].includes(t.type)
            ).length;
            
            if (complexTransformations > 3) {
                confidence -= 0.2;
            }

            // Generate warnings
            const warnings: string[] = [];
            if (request.transformations.length > 10) {
                warnings.push('Many transformations - consider breaking into smaller steps');
            }
            if (overallTimeline > 300000) { // 5 minutes
                warnings.push('Long execution time expected - consider optimizing transformations');
            }

            return {
                coordinationId,
                projectId: request.projectId,
                agentAssignments,
                overallTimeline,
                confidence: Math.max(0.3, Math.min(0.95, confidence)),
                warnings
            };

        } catch (error) {
            console.error('[PM Agent] Failed to coordinate transformation execution:', error);
            throw error;
        }
    }

    /**
     * Assign transformations to appropriate agents
     */
    private assignTransformationsToAgents(transformations: any[]): Array<{
        agentId: string;
        transformations: any[];
        estimatedDuration: number;
        dependencies: string[];
    }> {
        const assignments: Array<{
            agentId: string;
            transformations: any[];
            estimatedDuration: number;
            dependencies: string[];
        }> = [];

        // Data Engineer Agent - handles data preparation and cleaning
        const dataEngineerTransformations = transformations.filter(t => 
            ['clean', 'convert', 'rename', 'filter'].includes(t.type)
        );
        
        if (dataEngineerTransformations.length > 0) {
            assignments.push({
                agentId: 'data_engineer',
                transformations: dataEngineerTransformations,
                estimatedDuration: dataEngineerTransformations.length * 30000, // 30 seconds per transformation
                dependencies: []
            });
        }

        // Technical AI Agent - handles complex transformations
        const technicalTransformations = transformations.filter(t => 
            ['join', 'aggregate', 'sort'].includes(t.type)
        );
        
        if (technicalTransformations.length > 0) {
            assignments.push({
                agentId: 'technical_ai',
                transformations: technicalTransformations,
                estimatedDuration: technicalTransformations.length * 60000, // 1 minute per transformation
                dependencies: dataEngineerTransformations.length > 0 ? ['data_engineer'] : []
            });
        }

        // Business Agent - handles business logic transformations
        const businessTransformations = transformations.filter(t => 
            ['select', 'rename'].includes(t.type) && t.config?.businessContext
        );
        
        if (businessTransformations.length > 0) {
            assignments.push({
                agentId: 'business_agent',
                transformations: businessTransformations,
                estimatedDuration: businessTransformations.length * 20000, // 20 seconds per transformation
                dependencies: []
            });
        }

        return assignments;
    }

    /**
     * Validate transformation configuration
     */
    async validateTransformationConfiguration(
        transformation: any,
        schema: Record<string, any>
    ): Promise<{
        valid: boolean;
        warnings: string[];
        suggestions: string[];
        confidence: number;
    }> {
        try {
            console.log(`[PM Agent] Validating transformation configuration`);

            const warnings: string[] = [];
            const suggestions: string[] = [];
            let confidence = 0.9;

            // Validate based on transformation type
            switch (transformation.type) {
                case 'filter':
                    if (!transformation.config.field || !schema[transformation.config.field]) {
                        warnings.push('Filter field not found in schema');
                        confidence -= 0.3;
                    }
                    if (!transformation.config.operator) {
                        warnings.push('Filter operator not specified');
                        confidence -= 0.2;
                    }
                    break;

                case 'select':
                    if (!transformation.config.columns || transformation.config.columns.length === 0) {
                        warnings.push('No columns selected');
                        confidence -= 0.4;
                    } else {
                        const invalidColumns = transformation.config.columns.filter((col: string) => !schema[col]);
                        if (invalidColumns.length > 0) {
                            warnings.push(`Invalid columns: ${invalidColumns.join(', ')}`);
                            confidence -= 0.2;
                        }
                    }
                    break;

                case 'join':
                    if (!transformation.config.leftKey || !schema[transformation.config.leftKey]) {
                        warnings.push('Left join key not found in schema');
                        confidence -= 0.3;
                    }
                    if (!transformation.config.rightKey) {
                        warnings.push('Right join key not specified');
                        confidence -= 0.3;
                    }
                    break;

                case 'aggregate':
                    if (!transformation.config.groupBy || !schema[transformation.config.groupBy]) {
                        warnings.push('Group by field not found in schema');
                        confidence -= 0.3;
                    }
                    break;
            }

            // Generate suggestions based on schema
            const numericFields = Object.entries(schema)
                .filter(([_, info]: [string, any]) => ['number', 'integer', 'float'].includes(info.type))
                .map(([name]) => name);

            if (numericFields.length > 0) {
                suggestions.push(`Consider aggregating numeric fields: ${numericFields.slice(0, 3).join(', ')}`);
            }

            const textFields = Object.entries(schema)
                .filter(([_, info]: [string, any]) => ['string', 'text'].includes(info.type))
                .map(([name]) => name);

            if (textFields.length > 5) {
                suggestions.push('Many text fields detected - consider standardizing or filtering');
            }

            return {
                valid: confidence > 0.5,
                warnings,
                suggestions,
                confidence: Math.max(0.1, Math.min(1.0, confidence))
            };

        } catch (error) {
            console.error('[PM Agent] Failed to validate transformation configuration:', error);
            return {
                valid: false,
                warnings: ['Validation failed due to system error'],
                suggestions: ['Please check your transformation configuration'],
                confidence: 0.1
            };
        }
    }

    /**
     * Get transformation checkpoint status
     */
    async getTransformationCheckpoint(projectId: string): Promise<{
        checkpointId: string;
        status: 'pending' | 'in_progress' | 'completed' | 'error';
        message: string;
        progress: number;
        nextSteps: string[];
    }> {
        try {
            console.log(`[PM Agent] Getting transformation checkpoint for project ${projectId}`);

            // Check if project has transformation data
            const project = await storage.getProject(projectId);
            if (!project) {
                return {
                    checkpointId: `checkpoint_${projectId}_not_found`,
                    status: 'error',
                    message: 'Project not found',
                    progress: 0,
                    nextSteps: ['Verify project exists and try again']
                };
            }

            // Check transformation status from project session
            const sessionData = await storage.getProjectSession(projectId);
            const transformationData = sessionData?.transformation;

            if (!transformationData) {
                return {
                    checkpointId: `checkpoint_${projectId}_no_transformation`,
                    status: 'pending',
                    message: 'No transformation data found - ready to start',
                    progress: 0,
                    nextSteps: ['Add transformation steps', 'Configure data processing']
                };
            }

            if (transformationData.completed) {
                return {
                    checkpointId: `checkpoint_${projectId}_completed`,
                    status: 'completed',
                    message: 'Transformation completed successfully',
                    progress: 100,
                    nextSteps: ['Proceed to analysis', 'Review transformed data']
                };
            }

            if (transformationData.saved) {
                return {
                    checkpointId: `checkpoint_${projectId}_saved`,
                    status: 'completed',
                    message: 'Transformed data saved to project',
                    progress: 100,
                    nextSteps: ['Proceed to analysis', 'Start data analysis']
                };
            }

            // Transformation in progress
            const stepCount = transformationData.steps?.length || 0;
            const progress = stepCount > 0 ? Math.min(90, (stepCount / 5) * 100) : 10;

            return {
                checkpointId: `checkpoint_${projectId}_in_progress`,
                status: 'in_progress',
                message: `Transformation in progress - ${stepCount} steps configured`,
                progress,
                nextSteps: ['Apply transformations', 'Preview results', 'Save transformed data']
            };

        } catch (error) {
            console.error('[PM Agent] Failed to get transformation checkpoint:', error);
            return {
                checkpointId: `checkpoint_${projectId}_error`,
                status: 'error',
                message: 'Failed to get checkpoint status',
                progress: 0,
                nextSteps: ['Check system status', 'Retry operation']
            };
        }
    }

    /**
     * PM Agent Goal Clarification - Interactive clarification with user
     * Reads user's goals and questions, summarizes understanding, and asks clarifying questions
     */
    async clarifyGoalWithUser(input: {
        analysisGoal: string;
        businessQuestions: string;
        journeyType: string;
        userId: string;
    }): Promise<{
        summary: string;
        understoodGoals: string[];
        clarifyingQuestions: Array<{ question: string; reason: string }>;
        suggestedFocus: string[];
        identifiedGaps: string[];
    }> {
        console.log(`🤖 PM Agent: Clarifying user goals...`);
        console.log(`📝 Goal: ${input.analysisGoal.substring(0, 100)}...`);

        // Use Google Gemini for intelligent goal clarification
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const apiKey = process.env.GOOGLE_AI_API_KEY;

        if (!apiKey) {
            throw new Error('AI service not configured - GOOGLE_AI_API_KEY missing');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

        const prompt = `You are an Analytics Project Manager AI assistant helping to clarify a user's analysis goals.

**User's Journey Type**: ${input.journeyType}

**User's Analysis Goal**:
${input.analysisGoal}

**User's Business Questions** (if provided):
${input.businessQuestions || 'Not provided'}

Your task:
1. **Summarize** what you understand the user wants to achieve in 2-3 clear sentences
2. **Extract specific goals** as a bulleted list (3-5 concrete objectives)
3. **Ask 2-4 clarifying questions** that will help you better understand:
   - What specific metrics or outcomes they care about
   - Who the audience is for the analysis
   - What decisions this analysis will inform
   - What constraints or requirements exist (timeline, data limitations, etc.)
4. **Suggest focus areas** that align with their goals
5. **Identify any gaps** in their goal statement that need more detail

Respond in JSON format:
{
  "summary": "Your 2-3 sentence summary here",
  "understoodGoals": ["Goal 1", "Goal 2", "Goal 3"],
  "clarifyingQuestions": [
    {"question": "Question 1?", "reason": "Why this helps"},
    {"question": "Question 2?", "reason": "Why this helps"}
  ],
  "suggestedFocus": ["Focus area 1", "Focus area 2"],
  "identifiedGaps": ["Gap 1", "Gap 2"]
}

Be conversational, helpful, and specific. Tailor your questions to the ${input.journeyType} journey type.`;

        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            // Parse JSON response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Could not parse AI response as JSON');
            }

            const clarification = JSON.parse(jsonMatch[0]);

            console.log(`✅ PM Agent: Generated ${clarification.clarifyingQuestions.length} clarifying questions`);

            return {
                summary: clarification.summary || 'Unable to generate summary',
                understoodGoals: clarification.understoodGoals || [],
                clarifyingQuestions: clarification.clarifyingQuestions || [],
                suggestedFocus: clarification.suggestedFocus || [],
                identifiedGaps: clarification.identifiedGaps || []
            };

        } catch (error: any) {
            console.error('Error in PM Agent goal clarification:', error);

            // Fallback to basic clarification if AI fails
            return {
                summary: `I understand you want to: ${input.analysisGoal}`,
                understoodGoals: [
                    input.analysisGoal.substring(0, 100) + (input.analysisGoal.length > 100 ? '...' : '')
                ],
                clarifyingQuestions: [
                    {
                        question: 'What specific metrics or KPIs are most important for your analysis?',
                        reason: 'This helps me prioritize the right analyses'
                    },
                    {
                        question: 'Who is the primary audience for these insights?',
                        reason: 'This helps me format results appropriately'
                    },
                    {
                        question: 'What decision will this analysis help you make?',
                        reason: 'This helps me focus on actionable insights'
                    }
                ],
                suggestedFocus: ['Data quality assessment', 'Key metric identification'],
                identifiedGaps: ['Specific success criteria', 'Timeline expectations']
            };
        }
    }
}
