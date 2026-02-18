import { TechnicalAIAgent } from './technical-ai-agent';
import { DataEngineerAgent } from './data-engineer-agent';
import { DataScientistAgent } from './data-scientist-agent';
import { BusinessAgent, BusinessContext } from './business-agent';
import { clarificationService, type ClarificationResult, type ClarificationQuestion } from './clarification-service';
import { storage } from './storage';
import { PricingService } from './pricing';
import { nanoid } from 'nanoid';
import { AgentMessageBroker, AgentMessage, AgentCheckpoint, getMessageBroker } from './agents/message-broker';
import { AgentTask } from './agent-registry';
import { taskQueue, EnhancedTaskQueue, QueuedTask } from './enhanced-task-queue';
import { measurePerformance } from '../utils/performance-monitor';
import { getCapabilityById } from '../../shared/custom-journey-capabilities';
import { KnowledgeGraphService, type KnowledgeTemplate, type IndustryKnowledge } from './knowledge-graph-service';
import { RequiredDataElementsTool } from './tools/required-data-elements-tool';
import { db } from '../db';
import {
    analysisPlans,
    projects,
    projectSessions,
    projectDatasets,
    datasets,
    decisionAudits,
    type DataAssessment,
    type AnalysisStep as PlanAnalysisStep,
    type VisualizationSpec,
    type BusinessContext as PlanBusinessContext,
    type MLModelSpec,
    type CostBreakdown,
    type AgentContribution,
    type AnalysisPlanRow,
    type InsertAnalysisPlan
} from '@shared/schema';
import { and, desc, eq } from 'drizzle-orm';

/**
 * ✅ FIX: Helper function to wrap promises with timeout
 * Prevents plan generation from hanging indefinitely when AI APIs are slow
 */
async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    fallback: T,
    operationName: string = 'Operation'
): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${operationName} timed out after ${ms}ms`));
        }, ms);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId);
        return result;
    } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn(`⚠️ [PM Agent] ${operationName} timed out after ${ms}ms, using fallback`);
        return fallback;
    }
}

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
        context?: Record<string, any>; // FIX A5: Optional context for step-specific data (e.g., requirementsDocument)
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
 * Data field mapping requirement for user review
 */
export interface FieldMappingRequirement {
    sourceField: string;
    sourceType: string;
    targetField: string;
    targetType: string;
    transformationRequired: boolean;
    transformationDescription?: string;
    validationRules?: string[];
    exampleValues?: any[];
}

/**
 * Data quality requirement for user review
 */
export interface DataQualityRequirement {
    field: string;
    currentQuality: 'good' | 'acceptable' | 'poor';
    issues: string[];
    requiredActions: string[]; // Specify actions needed to address issues
    impact: 'high' | 'medium' | 'low'; // Assess the impact of the data quality issues
    estimatedEffort?: string;
}

/**
 * Synthesized recommendation from Project Manager combining all expert opinions
 * Enhanced to include early data mapping and quality requirements
 */
export interface SynthesizedRecommendation {
    overallAssessment:
    | 'proceed'
    | 'proceed_with_caution'
    | 'revise_approach'
    | 'not_feasible'
    | 'Invalid project ID provided - not_feasible';
    confidence: number;
    keyFindings: string[];
    combinedRisks: Array<{ source: string; risk: string; severity: 'high' | 'medium' | 'low' }>;
    actionableRecommendations: string[];
    expertConsensus: { // Summary of expert opinions on data quality and feasibility
        dataQuality: 'good' | 'acceptable' | 'poor';
        technicalFeasibility: 'feasible' | 'challenging' | 'not_feasible';
        businessValue: 'high' | 'medium' | 'low';
    };
    estimatedTimeline: string;
    estimatedCost?: string;
    nextSteps: string[];

    // ✅ NEW: Early data mapping and requirements (user can review and start planning immediately)
    dataMappingRequirements?: FieldMappingRequirement[];
    dataQualityRequirements?: DataQualityRequirement[];
    requiredDataElements?: Array<{
        name: string;
        description: string;
        type: string;
        required: boolean;
        source?: string;
        availableInDataset: boolean;
    }>;
    suggestedWorkflow?: Array<{
        stepNumber: number;
        stepName: string;
        description: string;
        dependencies: number[];
        estimatedDuration: string;
        requiredData: string[];
    }>;
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

interface CreateAnalysisPlanRequest {
    projectId: string;
    userId: string;
    project: {
        id: string;
        name: string;
        journeyType: string;
        objectives?: string | null;
        businessContext?: Record<string, any> | null;
        schema?: Record<string, any> | null;
        data?: any[] | null;
        description?: string | null;
        industry?: string | null;
    };
    modifications?: string | null;
    previousPlan?: AnalysisPlanRow | null;
    // Context from previous journey steps (passed from route)
    journeyContext?: {
        requirementsDocument?: any;
        piiDecisions?: Record<string, any> | null;
        elementMappings?: Record<string, any> | null;
        dataQuality?: any;
        verificationChecks?: Record<string, any> | null;
        transformationPlan?: any;
        userQuestions?: string[];
        analysisPath?: any[];
        completedSteps?: string[];
    } | null;
}

interface CreateAnalysisPlanResult {
    success: boolean;
    planId?: string;
    plan?: AnalysisPlanRow;
    error?: string;
}

interface HandlePlanRejectionRequest {
    planId: string;
    projectId: string;
    userId: string;
    rejectionReason: string;
    modificationsRequested?: string | null;
    previousPlan: AnalysisPlanRow;
}

interface HandlePlanRejectionResult {
    success: boolean;
    newPlanId?: string;
    newPlan?: AnalysisPlanRow;
    error?: string;
}

type PlanDraft = Omit<InsertAnalysisPlan, 'projectId' | 'version'>;

interface PlanBuildResult {
    draft: PlanDraft;
    metadata: {
        totalMinutes: number;
        includesML: boolean;
        templateName?: string;
        industry?: string;
    };
}

interface DatasetSummary {
    id: string;
    name: string;
    recordCount: number;
    schema: Record<string, any> | null;
    previewRows: any[];
    dataType: string | null;
}

type ProjectRow = typeof projects.$inferSelect;
type ProjectSessionRow = typeof projectSessions.$inferSelect;
type DatasetRow = typeof datasets.$inferSelect;
type PlanBlueprint = Awaited<ReturnType<DataScientistAgent['generatePlanBlueprint']>>;

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

interface ProjectManagerAgentDependencies {
    technicalAgent?: TechnicalAIAgent;
    dataEngineerAgent?: DataEngineerAgent;
    dataScientistAgent?: DataScientistAgent;
    businessAgent?: BusinessAgent;
    messageBroker?: AgentMessageBroker;
    knowledgeGraph?: KnowledgeGraphService;
}

export class ProjectManagerAgent {
    private technicalAgent: TechnicalAIAgent;
    private dataEngineerAgent: DataEngineerAgent;
    private dataScientistAgent: DataScientistAgent;
    private businessAgent: BusinessAgent;
    private messageBroker: AgentMessageBroker;
    private decisionAuditTrail: Map<string, DecisionAuditRecord[]>; // projectId ΓåÆ audit records
    private knowledgeGraph: KnowledgeGraphService;
    private planCreationLocks: Map<string, { lockKey: string; acquiredAt: number; expiresAt: number }>;
    private readonly agentResponseTimeoutMs: number;
    private readonly planLockTtlMs = 5 * 60 * 1000;

    constructor(dependencies: ProjectManagerAgentDependencies = {}) {
        this.technicalAgent = dependencies.technicalAgent ?? new TechnicalAIAgent();
        this.dataEngineerAgent = dependencies.dataEngineerAgent ?? new DataEngineerAgent();
        this.dataScientistAgent = dependencies.dataScientistAgent ?? new DataScientistAgent();
        this.businessAgent = dependencies.businessAgent ?? new BusinessAgent();
        this.messageBroker = dependencies.messageBroker ?? getMessageBroker();
        this.decisionAuditTrail = new Map();
        this.knowledgeGraph = dependencies.knowledgeGraph ?? new KnowledgeGraphService();
        this.planCreationLocks = new Map();
        const parsedTimeout = Number(process.env.AGENT_RESPONSE_TIMEOUT_MS);
        this.agentResponseTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30000;
        // Initialize synchronously - async methods will be called separately
    }

    private computeResponseTime(startTime: number): number {
        return Math.max(1, Date.now() - startTime);
    }

    private brokerSupportsAgent(agentId: string): boolean {
        if (!this.messageBroker) {
            return false;
        }

        const stats = this.messageBroker.getStats();
        if (!stats || !stats.redisEnabled) {
            return false;
        }

        return this.messageBroker.isAgentRegistered(agentId);
    }

    private async acquirePlanCreationLock(projectId: string): Promise<{
        acquired: boolean;
        lockKey?: string;
        existingPlanId?: string;
        reason?: string;
    }> {
        const now = Date.now();
        const existingLock = this.planCreationLocks.get(projectId);

        if (existingLock && existingLock.expiresAt > now) {
            return {
                acquired: false,
                lockKey: existingLock.lockKey,
                reason: 'Plan creation already in progress for this project'
            };
        }

        if (existingLock && existingLock.expiresAt <= now) {
            this.planCreationLocks.delete(projectId);
        }

        const activePlan = await this.getActivePlan(projectId);
        if (activePlan) {
            return {
                acquired: false,
                existingPlanId: activePlan.id,
                reason: `Active plan (${activePlan.status}) already exists`
            };
        }

        const lockKey = nanoid();
        this.planCreationLocks.set(projectId, {
            lockKey,
            acquiredAt: now,
            expiresAt: now + this.planLockTtlMs
        });

        return { acquired: true, lockKey };
    }

    private releasePlanCreationLock(projectId: string, lockKey?: string): void {
        const currentLock = this.planCreationLocks.get(projectId);
        if (!currentLock) {
            return;
        }

        if (lockKey && currentLock.lockKey !== lockKey) {
            return;
        }

        this.planCreationLocks.delete(projectId);
    }

    private async getProjectRecord(projectId: string): Promise<ProjectRow | null> {
        const result = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);

        return result[0] ?? null;
    }

    private async getLatestPlan(projectId: string): Promise<AnalysisPlanRow | null> {
        const plans = await db
            .select()
            .from(analysisPlans)
            .where(eq(analysisPlans.projectId, projectId))
            .orderBy(desc(analysisPlans.version))
            .limit(1);

        return plans[0] ?? null;
    }

    private async getActivePlan(projectId: string): Promise<AnalysisPlanRow | null> {
        const latestPlan = await this.getLatestPlan(projectId);
        if (!latestPlan) {
            return null;
        }

        const activeStatuses = new Set(['pending', 'ready', 'approved', 'executing', 'modified']);
        return activeStatuses.has(latestPlan.status) ? latestPlan : null;
    }

    private async getLatestSession(projectId: string, userId: string): Promise<ProjectSessionRow | null> {
        const sessions = await db
            .select()
            .from(projectSessions)
            .where(
                and(
                    eq(projectSessions.projectId, projectId),
                    eq(projectSessions.userId, userId)
                )
            )
            .orderBy(desc(projectSessions.lastActivity))
            .limit(1);

        return sessions[0] ?? null;
    }

    private async loadDatasetSummaries(projectId: string): Promise<DatasetSummary[]> {
        type DatasetSummaryRow = {
            id: string;
            name: string | null;
            recordCount: number | null;
            schema: unknown;
            preview: unknown;
            dataType: string | null;
            alias: string | null;
        };

        const rows: DatasetSummaryRow[] = await db
            .select({
                id: datasets.id,
                name: datasets.originalFileName,
                recordCount: datasets.recordCount,
                schema: datasets.schema,
                preview: datasets.preview,
                dataType: datasets.dataType,
                alias: projectDatasets.alias
            })
            .from(projectDatasets)
            .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
            .where(eq(projectDatasets.projectId, projectId));

        return rows.map((row) => {
            const previewRows = this.ensureArray(row.preview).slice(0, 500);
            const schema = this.ensureObject(row.schema);
            const recordCount = typeof row.recordCount === 'number'
                ? row.recordCount
                : previewRows.length;

            return {
                id: row.id,
                name: row.alias || row.name,
                recordCount,
                schema,
                previewRows,
                dataType: row.dataType ?? null
            } as DatasetSummary;
        });
    }

    private normalizeStringCollection(
        inputs: Array<unknown>,
        options: { splitPattern?: RegExp; limit?: number } = {}
    ): string[] {
        const collected: string[] = [];

        const pushValue = (value: string) => {
            const trimmed = value.trim();
            if (!trimmed) return;

            if (options.splitPattern) {
                trimmed
                    .split(options.splitPattern)
                    .map(part => part.trim())
                    .filter(Boolean)
                    .forEach(part => collected.push(part));
            } else {
                collected.push(trimmed);
            }
        };

        for (const input of inputs) {
            if (input === null || input === undefined) {
                continue;
            }

            if (Array.isArray(input)) {
                for (const item of input) {
                    if (typeof item === 'string') {
                        pushValue(item);
                    } else if (item && typeof item === 'object') {
                        const candidate = (item as any).goal || (item as any).question || (item as any).name;
                        if (typeof candidate === 'string') {
                            pushValue(candidate);
                        }
                    }
                }
                continue;
            }

            if (typeof input === 'string') {
                pushValue(input);
                continue;
            }

            if (typeof input === 'object') {
                const obj = input as Record<string, unknown>;
                ['goal', 'question', 'name', 'description'].forEach(key => {
                    const candidate = obj[key];
                    if (typeof candidate === 'string') {
                        pushValue(candidate);
                    }
                });
            }
        }

        const unique = Array.from(new Set(collected.map(item => item.trim()))).filter(Boolean);
        if (options.limit && unique.length > options.limit) {
            return unique.slice(0, options.limit);
        }
        return unique;
    }

    private ensureObject(value: unknown): Record<string, any> | null {
        if (!value) {
            return null;
        }

        if (typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, any>;
        }

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed as Record<string, any>;
                }
            } catch {
                // ignore parse errors
            }
        }

        return null;
    }

    private ensureArray(value: unknown): any[] {
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }

        return [];
    }

    private mapPlanComplexityToCost(complexity: PlanBlueprint['complexity']): 'basic' | 'intermediate' | 'advanced' {
        switch (complexity) {
            case 'high':
            case 'very_high':
                return 'advanced';
            case 'medium':
                return 'intermediate';
            default:
                return 'basic';
        }
    }

    private mapStepToCostCategory(method?: string): 'statistical' | 'machine_learning' | 'visualization' | 'business_intelligence' | 'time_series' {
        const normalized = (method || '').toLowerCase();

        if (
            normalized.includes('predict') ||
            normalized.includes('model') ||
            normalized.includes('ml') ||
            normalized.includes('class') ||
            normalized.includes('cluster')
        ) {
            return 'machine_learning';
        }

        if (normalized.includes('time') || normalized.includes('forecast')) {
            return 'time_series';
        }

        if (normalized.includes('visual')) {
            return 'visualization';
        }

        if (normalized.includes('business') || normalized.includes('kpi') || normalized.includes('dashboard')) {
            return 'business_intelligence';
        }

        return 'statistical';
    }

    private async estimatePlanCost(
        steps: PlanAnalysisStep[],
        recordCount: number,
        complexity: PlanBlueprint['complexity'],
        projectId?: string,
        columnCount?: number,
        requirementsDoc?: any
    ): Promise<CostBreakdown> {
        const costComplexity = this.mapPlanComplexityToCost(complexity);

        // Use CostEstimationService for consistent pricing with execution step
        try {
            const { CostEstimationService } = await import('./cost-estimation-service');

            // Preserve the analysis type coming from analysisPath/steps so the detailed cost reflects
            // each planned analysis instead of collapsing to coarse categories. Fall back to method/name.
            const analysisTypes = steps.length > 0
                ? steps.map((s) => {
                    const stepAny = s as any;
                    return stepAny.analysisType || stepAny.type || s.method || s.name || 'statistical';
                })
                : ['statistical'];

            // Track how many times each label appears so we can disambiguate duplicate analysis items in the breakdown
            const normalizeLabel = (value: string) => (value || 'Analysis')
                .replace(/_/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const analysisLabels = analysisTypes.map((t) => normalizeLabel(t));
            const labelCounts = analysisLabels.reduce<Record<string, number>>((acc, label) => {
                acc[label] = (acc[label] || 0) + 1;
                return acc;
            }, {});

            // Collect artifacts from analysis plan instead of hardcoding ['report']
            const artifactSet = new Set<string>(['report']); // Always include PDF report
            if (requirementsDoc?.analysisPath) {
                for (const analysis of requirementsDoc.analysisPath) {
                    for (const artifact of (analysis.expectedArtifacts || [])) {
                        const aType = (artifact.artifactType || '').toLowerCase();
                        if (aType === 'visualization' || aType === 'dashboard') artifactSet.add('dashboard');
                        if (aType === 'presentation') artifactSet.add('presentation');
                        if (aType === 'model' || aType === 'exportdata') artifactSet.add('exportData');
                    }
                }
            }
            // Include presentation for multi-analysis plans
            if (analysisTypes.length > 1) artifactSet.add('presentation');
            // Include dashboard when visualizations are likely
            if (analysisTypes.some(t => /visualization|comparative|correlation|regression|clustering|time.?series/i.test(t))) {
                artifactSet.add('dashboard');
            }
            const includeArtifacts = Array.from(artifactSet);
            console.log(`💰 [PM Agent] Artifacts for cost: [${includeArtifacts.join(', ')}] (from ${requirementsDoc?.analysisPath?.length || 0} analyses)`);

            const estimate = await CostEstimationService.estimateAnalysisCost(
                projectId || 'plan-estimate',
                analysisTypes,
                { rows: recordCount, columns: columnCount || 10 },
                costComplexity as 'basic' | 'intermediate' | 'advanced' | 'expert',
                includeArtifacts
            );

            // Convert to CostBreakdown format with per-analysis detail (no collapsing of multiple analyses)
            const breakdown: Record<string, number> = {};
            let analysisIndex = 0;
            for (const item of estimate.breakdown) {
                const isAnalysisItem = /analysis$/i.test(item.item || '');
                const cost = parseFloat(item.cost.toFixed(2));

                if (isAnalysisItem) {
                    const baseLabel = analysisLabels[analysisIndex] || normalizeLabel(item.item);
                    const needsDisambiguation = (labelCounts[baseLabel] || 0) > 1;
                    const label = needsDisambiguation ? `${baseLabel} (#${analysisIndex + 1})` : baseLabel;
                    breakdown[label] = cost;
                    analysisIndex += 1;
                } else {
                    // Platform/data/artifact fees can safely accumulate
                    breakdown[item.item] = (breakdown[item.item] || 0) + cost;
                }
            }

            // Log detailed breakdown for debugging
            const breakdownSum = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
            console.log(`💰 [PM Agent] Cost estimate via CostEstimationService: $${estimate.totalCost.toFixed(2)}`);
            console.log(`   📋 Breakdown items: ${Object.entries(breakdown).map(([k, v]) => `${k}=$${v.toFixed(2)}`).join(', ')}`);
            console.log(`   ✅ Breakdown sum: $${breakdownSum.toFixed(2)} (should match total)`);

            return {
                total: parseFloat(estimate.totalCost.toFixed(2)),
                breakdown
            };
        } catch (error) {
            // Fallback to PricingService if CostEstimationService fails
            console.warn('⚠️ [PM Agent] CostEstimationService failed, using PricingService fallback:', error);
            const breakdown: Record<string, number> = {};
            let total = 0;

            if (steps.length === 0) {
                const baseCost = PricingService.calculateAnalysisCost('statistical', recordCount, costComplexity);
                breakdown['Baseline analysis'] = parseFloat(baseCost.totalCost.toFixed(2));
                total = baseCost.totalCost;
            } else {
                for (const step of steps) {
                    const category = this.mapStepToCostCategory(step.method);
                    const stepCost = PricingService.calculateAnalysisCost(category, recordCount, costComplexity);
                    const key = step.name || category;
                    // FIX: Accumulate costs for duplicate keys (consistency with primary path)
                    breakdown[key] = (breakdown[key] || 0) + parseFloat(stepCost.totalCost.toFixed(2));
                    total += stepCost.totalCost;
                }
            }

            return {
                total: parseFloat(total.toFixed(2)),
                breakdown
            };
        }
    }

    private buildFallbackDataAssessment(dataset?: DatasetSummary): DataAssessment {
        const recordCount = dataset?.recordCount ?? dataset?.previewRows?.length ?? 0;
        const columnCount = dataset?.schema ? Object.keys(dataset.schema).length : (dataset?.previewRows?.[0] ? Object.keys(dataset.previewRows[0]).length : 0);

        return {
            qualityScore: 65,
            completenessScore: 70,
            recordCount,
            columnCount: Math.max(columnCount, 1),
            missingData: [],
            recommendedTransformations: ['Profile dataset to confirm column types and address missing values'],
            infrastructureNeeds: {
                useSpark: recordCount > 300_000,
                estimatedMemoryGB: Math.max(4, Math.ceil(recordCount / 150_000) * 2),
                parallelizable: recordCount > 60_000
            },
            estimatedProcessingTime:
                recordCount > 300_000
                    ? '25-35 minutes'
                    : recordCount > 120_000
                        ? '15-20 minutes'
                        : recordCount > 25_000
                            ? '8-12 minutes'
                            : recordCount > 5_000
                                ? '5-8 minutes'
                                : '3-5 minutes'
        };
    }

    private buildExecutiveSummary(params: {
        projectName?: string;
        journeyType?: string;
        goals: string[];
        questions: string[];
        dataAssessment: DataAssessment;
        blueprint: PlanBlueprint;
        businessContext: PlanBusinessContext;
        datasetSummary?: DatasetSummary;
        modifications?: string | null;
    }): string {
        const goalSnippet = params.goals[0] ?? 'deliver actionable insights';
        const questionSnippet = params.questions[0] ?? 'surface the most important trends';
        const complexityLabel = params.blueprint.complexity.replace('_', ' ');
        const qualityLabel = `${Math.round(params.dataAssessment.qualityScore)}% data quality`;
        const recordLabel = params.dataAssessment.recordCount
            ? `${params.dataAssessment.recordCount.toLocaleString()} records`
            : 'the available data';
        const primaryStep = params.blueprint.analysisSteps[0]?.name ?? 'descriptive analysis';
        const kpiFocus = params.businessContext?.relevantKPIs?.slice(0, 2).join(' and ') || 'key KPIs';
        const duration = params.blueprint.estimatedDuration || 'a few hours';
        const modificationNote = params.modifications ? ' incorporating your latest feedback' : '';
        const projectLabel = params.projectName || 'This project';

        return `${projectLabel} will follow a ${complexityLabel} analysis plan centred on ${primaryStep.toLowerCase()} to ${goalSnippet.toLowerCase()}. ` +
            `Our data review rated ${qualityLabel} across ${recordLabel}, giving the team confidence to answer questions such as ${questionSnippet.toLowerCase()}. ` +
            `Execution will emphasise ${kpiFocus}${modificationNote}, with decision-ready outputs expected within ${duration}.`;
    }

    private determineIndustry(
        project: CreateAnalysisPlanRequest['project'] | undefined,
        session: ProjectSessionRow | null,
        previousPlan: AnalysisPlanRow | null,
        loadedDatasets?: DatasetSummary[]
    ): string | undefined {
        const fromProject = project?.industry && project.industry.trim();
        if (fromProject) {
            return fromProject;
        }

        const prepareData = session?.prepareData as Record<string, any> | undefined;
        const fromSession = typeof prepareData?.industry === 'string' ? prepareData.industry.trim() : undefined;
        if (fromSession) {
            return fromSession;
        }

        const audienceIndustry = typeof prepareData?.audience?.industry === 'string'
            ? prepareData.audience.industry.trim()
            : undefined;
        if (audienceIndustry) {
            return audienceIndustry;
        }

        const priorContext = previousPlan?.businessContext as PlanBusinessContext | null;
        const benchmarkIndustry = priorContext?.industryBenchmarks?.[0];
        if (typeof benchmarkIndustry === 'string' && benchmarkIndustry.trim()) {
            return benchmarkIndustry.replace(/benchmark/i, '').trim();
        }

        // Auto-detect industry from project name and goals
        // P1-4 FIX: Pass loaded datasets to autoDetectIndustryFromContext for better detection
        const autoDetected = this.autoDetectIndustryFromContext(project, prepareData, loadedDatasets);
        if (autoDetected) {
            console.log(`🔍 [PM Agent] Auto-detected industry: "${autoDetected}" from project context`);
            return autoDetected;
        }

        return undefined;
    }

    /**
     * Auto-detect industry from project name, goals, questions, file names, and column names
     * P1-2 FIX: Enhanced to also check file names (like "EmployeeRoster.xlsx") and column names
     * P1-4 FIX: Accept loaded datasets for more accurate detection
     * This ensures HR, Education, etc. are detected even if not explicitly set
     */
    private autoDetectIndustryFromContext(
        project: CreateAnalysisPlanRequest['project'] | undefined,
        prepareData: Record<string, any> | undefined,
        loadedDatasets?: DatasetSummary[]
    ): string | undefined {
        // Collect all text signals from various sources
        const textSignals: string[] = [
            project?.name || '',
            project?.description || '',
            ...(prepareData?.goals || []),
            ...(prepareData?.questions || []),
            prepareData?.analysisGoal || ''
        ];

        // P1-4 FIX: Check loaded datasets first (most reliable source)
        // DatasetSummary uses 'name' property which contains the original file name
        if (loadedDatasets && loadedDatasets.length > 0) {
            loadedDatasets.forEach((ds: DatasetSummary) => {
                const fileName = ds.name || '';
                if (fileName) {
                    textSignals.push(fileName);
                    console.log(`🔍 [P1-4 Industry Detection] Checking loaded dataset file name: "${fileName}"`);
                }
                // Add column names from dataset schema
                if (ds.schema && typeof ds.schema === 'object') {
                    const columnNames = Object.keys(ds.schema);
                    textSignals.push(...columnNames);
                    console.log(`🔍 [P1-4 Industry Detection] Checking ${columnNames.length} columns from loaded dataset`);
                }
            });
        }

        // P1-2 FIX: Add file names from datasets (key indicator for industry)
        if (prepareData?.datasets && Array.isArray(prepareData.datasets)) {
            prepareData.datasets.forEach((ds: any) => {
                const fileName = ds.fileName || ds.name || ds.dataset?.fileName || ds.dataset?.name || '';
                if (fileName) {
                    textSignals.push(fileName);
                    console.log(`🔍 [P1-2 Industry Detection] Checking file name: "${fileName}"`);
                }
            });
        }

        // P1-2 FIX: Add column names from schema (very strong indicator)
        if (prepareData?.schema && typeof prepareData.schema === 'object') {
            const columnNames = Object.keys(prepareData.schema);
            textSignals.push(...columnNames);
            console.log(`🔍 [P1-2 Industry Detection] Checking ${columnNames.length} column names`);
        }

        // Also check project datasets directly if available
        if (project && (project as any).datasets && Array.isArray((project as any).datasets)) {
            (project as any).datasets.forEach((ds: any) => {
                if (ds.fileName) textSignals.push(ds.fileName);
                if (ds.schema && typeof ds.schema === 'object') {
                    textSignals.push(...Object.keys(ds.schema));
                }
            });
        }

        const combinedText = textSignals.join(' ').toLowerCase();

        // Industry scoring - count matches for more accurate detection
        const industryScores: Record<string, number> = {};

        // HR / Employee Engagement patterns - high priority file name patterns
        const hrFilePatterns = ['employeeroster', 'hrengagement', 'hrdata', 'employee_', 'staff_', 'workforce'];
        const hrColumnPatterns = ['employee_id', 'employeeid', 'department', 'manager', 'hire_date', 'hiredate',
            'engagement_score', 'engagementscore', 'tenure', 'job_title', 'jobtitle'];
        const hrTextPatterns = ['employee', 'engagement', 'workforce', 'hr ', 'human resource',
            'staff', 'turnover', 'retention', 'satisfaction survey', 'hiring',
            'talent', 'personnel', 'workplace', 'job satisfaction', 'team performance'];

        // Score HR
        industryScores['hr'] = 0;
        hrFilePatterns.forEach(p => { if (combinedText.includes(p)) industryScores['hr'] += 3; });
        hrColumnPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['hr'] += 2; });
        hrTextPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['hr'] += 1; });

        // Education patterns
        const educationFilePatterns = ['student', 'enrollment', 'academic', 'gradebook', 'courselist'];
        const educationColumnPatterns = ['student_id', 'studentid', 'grade_level', 'gradelevel', 'gpa',
            'enrollment_date', 'credits', 'course_id', 'teacher_id'];
        const educationTextPatterns = ['student', 'graduation', 'academic', 'school', 'university',
            'teacher', 'learning', 'enrollment', 'course', 'curriculum',
            'classroom', 'education', 'parent', 'conference'];

        industryScores['education'] = 0;
        educationFilePatterns.forEach(p => { if (combinedText.includes(p)) industryScores['education'] += 3; });
        educationColumnPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['education'] += 2; });
        educationTextPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['education'] += 1; });

        // Healthcare patterns
        const healthcareFilePatterns = ['patient', 'clinical', 'medical', 'diagnosis', 'treatment'];
        const healthcareColumnPatterns = ['patient_id', 'patientid', 'diagnosis', 'treatment', 'prescription',
            'appointment', 'doctor_id', 'admission_date'];
        const healthcareTextPatterns = ['patient', 'hospital', 'clinic', 'medical', 'healthcare',
            'health care', 'doctor', 'nurse', 'diagnosis', 'treatment'];

        industryScores['healthcare'] = 0;
        healthcareFilePatterns.forEach(p => { if (combinedText.includes(p)) industryScores['healthcare'] += 3; });
        healthcareColumnPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['healthcare'] += 2; });
        healthcareTextPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['healthcare'] += 1; });

        // Finance patterns
        const financeFilePatterns = ['transaction', 'account', 'portfolio', 'loan', 'investment'];
        const financeColumnPatterns = ['account_id', 'accountid', 'transaction_id', 'balance', 'amount',
            'interest_rate', 'loan_amount', 'credit_score'];
        const financeTextPatterns = ['bank', 'financial', 'loan', 'investment', 'trading',
            'portfolio', 'credit', 'mortgage', 'insurance'];

        industryScores['finance'] = 0;
        financeFilePatterns.forEach(p => { if (combinedText.includes(p)) industryScores['finance'] += 3; });
        financeColumnPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['finance'] += 2; });
        financeTextPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['finance'] += 1; });

        // Retail patterns
        const retailFilePatterns = ['sales', 'order', 'product', 'inventory', 'customer'];
        const retailColumnPatterns = ['product_id', 'productid', 'order_id', 'orderid', 'quantity',
            'price', 'discount', 'customer_id', 'sku'];
        const retailTextPatterns = ['customer', 'purchase', 'shopping', 'retail', 'ecommerce',
            'store', 'product', 'sales', 'order', 'cart'];

        industryScores['retail'] = 0;
        retailFilePatterns.forEach(p => { if (combinedText.includes(p)) industryScores['retail'] += 3; });
        retailColumnPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['retail'] += 2; });
        retailTextPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['retail'] += 1; });

        // Nonprofit patterns
        const nonprofitFilePatterns = ['donor', 'donation', 'volunteer', 'fundrais', 'campaign'];
        const nonprofitColumnPatterns = ['donor_id', 'donorid', 'donation_amount', 'campaign_id',
            'volunteer_hours', 'grant_amount'];
        const nonprofitTextPatterns = ['donor', 'nonprofit', 'non-profit', 'charity', 'volunteer',
            'fundraising', 'foundation', 'ngo', 'mission'];

        industryScores['nonprofit'] = 0;
        nonprofitFilePatterns.forEach(p => { if (combinedText.includes(p)) industryScores['nonprofit'] += 3; });
        nonprofitColumnPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['nonprofit'] += 2; });
        nonprofitTextPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['nonprofit'] += 1; });

        // Manufacturing patterns
        const manufacturingFilePatterns = ['production', 'assembly', 'quality', 'defect', 'batch'];
        const manufacturingColumnPatterns = ['batch_id', 'batchid', 'defect_count', 'quality_score',
            'production_date', 'machine_id', 'yield'];
        const manufacturingTextPatterns = ['manufacturing', 'production', 'factory', 'assembly',
            'inventory', 'supply chain', 'quality control'];

        industryScores['manufacturing'] = 0;
        manufacturingFilePatterns.forEach(p => { if (combinedText.includes(p)) industryScores['manufacturing'] += 3; });
        manufacturingColumnPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['manufacturing'] += 2; });
        manufacturingTextPatterns.forEach(p => { if (combinedText.includes(p)) industryScores['manufacturing'] += 1; });

        // Find highest scoring industry (minimum score of 2 required)
        const sortedIndustries = Object.entries(industryScores)
            .filter(([_, score]) => score >= 2)
            .sort((a, b) => b[1] - a[1]);

        if (sortedIndustries.length > 0) {
            const [topIndustry, topScore] = sortedIndustries[0];
            console.log(`🏭 [P1-2 Industry Detection] Detected industry: "${topIndustry}" (score: ${topScore})`);
            console.log(`   Industry scores: ${JSON.stringify(industryScores)}`);
            return topIndustry;
        }

        return undefined;
    }

    async createAnalysisPlan(request: CreateAnalysisPlanRequest): Promise<CreateAnalysisPlanResult> {
        const { projectId, userId } = request;
        const lock = await this.acquirePlanCreationLock(projectId);

        if (!lock.acquired) {
            return {
                success: false,
                planId: lock.existingPlanId,
                error: lock.reason || 'Plan creation already in progress for this project'
            };
        }

        try {
            const projectRecord = request.project ?? await this.getProjectRecord(projectId);
            if (!projectRecord) {
                return {
                    success: false,
                    error: 'Project not found'
                };
            }

            const latestPlan = request.previousPlan ?? await this.getLatestPlan(projectId);
            const version = latestPlan ? latestPlan.version + 1 : 1;

            // 1. Create Placeholder Plan (Pending State)
            const now = new Date();
            const placeholderPlan: PlanDraft = {
                executiveSummary: "Analysis plan generation in progress...",
                dataAssessment: {
                    qualityScore: 0,
                    completenessScore: 0,
                    recordCount: 0,
                    columnCount: 0,
                    missingData: [],
                    recommendedTransformations: [],
                    infrastructureNeeds: { useSpark: false, estimatedMemoryGB: 0, parallelizable: false },
                    estimatedProcessingTime: "Calculating..."
                },
                analysisSteps: [],
                visualizations: [],
                businessContext: undefined,
                mlModels: [],
                estimatedCost: { total: 0, breakdown: {} },
                estimatedDuration: "Calculating...",
                complexity: "low",
                risks: [],
                recommendations: [],
                agentContributions: {},
                status: 'pending',
                rejectionReason: undefined,
                modificationsRequested: request.modifications ?? undefined,
                createdBy: 'pm_agent'
            };

            const inserted = await db
                .insert(analysisPlans)
                .values({
                    ...placeholderPlan,
                    projectId,
                    version
                })
                .returning();

            if (inserted.length === 0) {
                throw new Error('Failed to persist pending analysis plan');
            }

            const plan = inserted[0];

            // 2. Trigger Background Generation (Fire and Forget)
            // We pass the lock key to release it after generation is done
            this.generatePlanContent(plan.id, request, projectRecord, latestPlan, lock.lockKey || '').catch(err => {
                console.error(`[Background] Plan generation failed for ${plan.id}:`, err);
            });

            // 3. Return Pending Plan Immediately
            return {
                success: true,
                planId: plan.id,
                plan
            };

        } catch (error) {
            console.error(`Project Manager Agent: Failed to initiate analysis plan for project ${projectId}`, error);
            this.releasePlanCreationLock(projectId, lock.lockKey); // Release lock if init fails
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to initiate analysis plan'
            };
        }
    }

    /**
     * Background process to generate plan content and update the pending record
     *
     * Agent Responsibility: PROJECT_MANAGER
     * - Coordinates analysis planning across agents
     * - Uses existing requirements from Prepare step (SSOT: journeyProgress.requirementsDocument)
     * - Generates cost estimates and timelines
     * - Creates approval checkpoints
     */
    private async generatePlanContent(
        planId: string,
        request: CreateAnalysisPlanRequest,
        projectRecord: any,
        latestPlan: any,
        lockKey: string
    ): Promise<void> {
        const { projectId, userId } = request;
        console.log(`📋 [PROJECT_MANAGER] Starting background generation for plan ${planId}`);
        console.log(`📋 [PROJECT_MANAGER] Using tools: task_coordinator, checkpoint_manager, progress_reporter`);

        try {
            // PHASE 7 FIX: Re-fetch project to get fresh journeyProgress.requirementsDocument
            // The passed projectRecord may be stale if Prepare step just saved requirements
            let freshProjectRecord = projectRecord;
            try {
                const refetched = await this.getProjectRecord(projectId);
                if (refetched) {
                    freshProjectRecord = refetched;
                    console.log(`✅ [PM Agent] Re-fetched project for fresh journeyProgress:`, {
                        hasRequirementsDoc: !!(refetched as any)?.journeyProgress?.requirementsDocument,
                        analysisPathCount: (refetched as any)?.journeyProgress?.requirementsDocument?.analysisPath?.length || 0,
                        elementsCount: (refetched as any)?.journeyProgress?.requirementsDocument?.requiredDataElements?.length || 0
                    });
                }
            } catch (refetchError) {
                console.warn(`⚠️ [PM Agent] Failed to refetch project, using passed record:`, refetchError);
            }

            // Load session and datasets with error handling
            let session: any = null;
            let datasets: any[] = [];
            let primaryDataset: any = null;

            try {
                session = await this.getLatestSession(projectId, userId);
            } catch (sessionError) {
                console.warn(`⚠️ [PM Agent] Failed to load session for project ${projectId}:`, sessionError);
                // Continue without session data - we can still generate a plan
            }

            try {
                datasets = await this.loadDatasetSummaries(projectId);
                primaryDataset = datasets[0];
            } catch (datasetError) {
                console.warn(`⚠️ [PM Agent] Failed to load datasets for project ${projectId}:`, datasetError);
                // Continue without dataset data - we'll use fallback values
            }

            const prepareData = session?.prepareData as Record<string, any> | undefined;
            const journeyProgress = (freshProjectRecord as any)?.journeyProgress || {};

            // Use journeyContext passed from route (preferred) or fall back to journeyProgress from DB
            const jctx = request.journeyContext;
            if (jctx?.requirementsDocument) {
                console.log(`✅ [PM Agent] Using journeyContext passed from route (avoids stale data):`, {
                    hasReqDoc: true,
                    analysisPathCount: jctx.analysisPath?.length || 0,
                    elementsCount: jctx.requirementsDocument?.requiredDataElements?.length || 0,
                    completedSteps: jctx.completedSteps || []
                });
            }

            const goals = this.normalizeStringCollection([
                request.project?.objectives,
                prepareData?.analysisGoal,
                journeyProgress.analysisGoal,
                prepareData?.goals,
                latestPlan?.recommendations,
                request.modifications,
                projectRecord.description
            ], { splitPattern: /[\r\n]+|[.;]+/, limit: 6 });

            if (goals.length === 0) {
                // FIX C1: Context-aware fallback using project/dataset info
                const datasetName = primaryDataset?.name || primaryDataset?.originalFileName || 'the uploaded dataset';
                const projectName = projectRecord.name || request.project?.name || 'this project';
                const columnNames = primaryDataset?.schema ? Object.keys(primaryDataset.schema).slice(0, 5).join(', ') : '';
                const columnHint = columnNames ? ` focusing on ${columnNames}` : '';
                goals.push(`Analyze ${datasetName} to generate insights for ${projectName}${columnHint}`);
            }

            // Include user questions from journeyContext (preferred) or journeyProgress SSOT
            const contextQuestions = jctx?.userQuestions || [];
            const jpUserQuestions = contextQuestions.length > 0
                ? contextQuestions.map((q: any) => typeof q === 'string' ? q : q.text || '')
                : (Array.isArray(journeyProgress.userQuestions)
                    ? journeyProgress.userQuestions.map((q: any) => typeof q === 'string' ? q : q.text || '')
                    : []);

            const questions = this.normalizeStringCollection([
                prepareData?.businessQuestions,
                prepareData?.questions,
                jpUserQuestions,
                latestPlan?.risks
            ], { splitPattern: /[\r\n]+|[?•]+/, limit: 6 });

            if (questions.length === 0) {
                // FIX C1: Context-aware fallback questions based on data characteristics
                const numericCols = primaryDataset?.schema
                    ? Object.entries(primaryDataset.schema).filter(([_, v]: [string, any]) => /int|float|numeric|number|decimal/i.test(v?.type || '')).map(([k]) => k)
                    : [];
                if (numericCols.length >= 2) {
                    questions.push(`What is the relationship between ${numericCols[0]} and ${numericCols[1]}?`);
                } else {
                    const datasetName = primaryDataset?.name || 'the data';
                    questions.push(`What are the key patterns and trends in ${datasetName}?`);
                }
            }

            // P1-4 FIX: Pass loaded datasets to determineIndustry for better industry detection
            const industry = this.determineIndustry(request.project, session, latestPlan ?? null, datasets);
            const schemaSource = primaryDataset?.schema ?? request.project?.schema ?? {};
            const dataSample = primaryDataset?.previewRows ?? (Array.isArray(request.project?.data) ? request.project.data.slice(0, 500) : []);

            // [INTEGRATION] Required Data Elements Tool
            // Prefer journeyContext passed from route > freshProjectRecord.journeyProgress > generate new
            const existingReqDoc = jctx?.requirementsDocument
                || (freshProjectRecord as any)?.journeyProgress?.requirementsDocument;
            let requirementsDoc;

            if (existingReqDoc && existingReqDoc.requiredDataElements?.length > 0) {
                // Use existing requirements document from previous steps (SSOT)
                console.log(`✅ [PM Agent] Using existing requirementsDocument:`, {
                    elementsCount: existingReqDoc.requiredDataElements?.length || 0,
                    analysisPathCount: existingReqDoc.analysisPath?.length || 0,
                    source: jctx?.requirementsDocument ? 'journeyContext (route)' : 'journeyProgress (DB)',
                    hasPiiDecisions: !!(jctx?.piiDecisions || journeyProgress.piiDecisions),
                    hasElementMappings: !!(jctx?.elementMappings || journeyProgress.elementMappings),
                    hasDataQuality: !!(jctx?.dataQuality || journeyProgress.dataQuality)
                });
                requirementsDoc = existingReqDoc;
            } else {
                // Generate new requirements only if none exist
                console.log(`📋 [PM Agent] No existing requirementsDocument, generating new one`);
                try {
                    const requiredDataTool = new RequiredDataElementsTool();
                    requirementsDoc = await requiredDataTool.defineRequirements({
                        projectId,
                        userGoals: goals,
                        userQuestions: questions
                    });
                } catch (reqError) {
                    console.error(`❌ [PM Agent] RequiredDataElementsTool.defineRequirements() failed:`, reqError);
                    // Create a minimal requirements document so plan generation can proceed
                    requirementsDoc = {
                        documentId: `req_${projectId}_${Date.now()}`,
                        projectId,
                        version: 1,
                        status: 'draft' as const,
                        userGoals: goals,
                        userQuestions: questions,
                        analysisPath: [],
                        requiredDataElements: [],
                        questionAnswerMapping: [],
                        transformationPlan: { transformationSteps: [], dataQualityChecks: [] },
                        completeness: { totalElements: 0, elementsMapped: 0, elementsWithTransformation: 0, readyForExecution: false },
                        gaps: [{
                            type: 'transformation_needed',
                            description: 'Requirements generation failed - manual review needed',
                            affectedElements: [],
                            recommendation: 'Please verify data upload and retry',
                            severity: 'high'
                        }],
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    console.log(`⚠️ [PM Agent] Using minimal fallback requirementsDoc due to error`);
                }
            }

            // Only map dataset if we just generated new requirements (existing ones are already mapped from Verification step)
            if (primaryDataset && !existingReqDoc) {
                try {
                    // ✅ CONTEXT CONTINUITY FIX: Resolve industry from journeyProgress
                    let pmIndustry: string | undefined;
                    try {
                        const pmProject = await storage.getProject(projectId);
                        const pmJP = (pmProject as any)?.journeyProgress;
                        pmIndustry = pmJP?.industry || pmJP?.industryDomain;
                    } catch (e) { /* non-blocking */ }

                    const requiredDataToolForMapping = new RequiredDataElementsTool();
                    requirementsDoc = await requiredDataToolForMapping.mapDatasetToRequirements(requirementsDoc, {
                        fileName: primaryDataset.name,
                        rowCount: primaryDataset.recordCount,
                        schema: primaryDataset.schema as Record<string, any>,
                        preview: primaryDataset.previewRows
                    }, pmIndustry, projectId);
                } catch (error) {
                    console.warn('Error mapping dataset to requirements:', error);
                }
            }

            const dataGaps = (requirementsDoc.gaps || []).map((g: any) => `Data Gap: ${g.description} - ${g.recommendation}`);

            let dataAssessment: DataAssessment;
            try {
                const result = await withTimeout(
                    this.technicalAgent.executeTool('assess_data_quality', {
                        projectId,
                        schema: schemaSource || {},
                        data: dataSample,
                        goals: goals[0] ?? '',
                        questions
                    }),
                    20000,
                    { result: this.buildFallbackDataAssessment(primaryDataset) },
                    'Data quality assessment'
                );
                dataAssessment = result.result as DataAssessment;
            } catch (error) {
                console.warn(`Project Manager Agent: Data assessment failed for project ${projectId}`, error);
                dataAssessment = this.buildFallbackDataAssessment(primaryDataset);
            }

            // Extract analysis types from requirements doc
            const analysisContext = {
                analysisTypes: (requirementsDoc.analysisPath || []).map((ap: any) => ap.analysisName || ap.type || ap.method || 'Unknown'),
                requiredElements: (requirementsDoc.requiredDataElements || []).map((e: any) => e.elementName || e.name || 'Unknown')
            };

            // ✅ FIX: Define fallback blueprint for timeout/error scenarios
            // FIX: Include meaningful visualizations based on data characteristics
            // Context-aware fallback blueprint using available goals and analysis types
            // Includes dataset metadata for richer descriptions (FIX C1)
            const fbDatasetName = primaryDataset?.name || 'the dataset';
            const fbColCount = primaryDataset?.schema ? Object.keys(primaryDataset.schema).length : 0;
            const fbRowCount = primaryDataset?.recordCount || primaryDataset?.previewRows?.length || 0;
            const dataDesc = fbRowCount > 0 ? `${fbDatasetName} (${fbRowCount.toLocaleString()} rows, ${fbColCount} columns)` : (goals[0] || 'your data');

            const fallbackAnalysisTypes = analysisContext?.analysisTypes?.length > 0
                ? analysisContext.analysisTypes.slice(0, 5)
                : ['exploratory_data_analysis'];

            const fallbackBlueprint: PlanBlueprint = {
                analysisSteps: fallbackAnalysisTypes.map((type: string, idx: number) => ({
                    method: type,
                    name: type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                    description: `Analysis of ${dataDesc} using ${type.replace(/_/g, ' ')}`,
                    confidence: 0.75,
                    stepNumber: idx + 1,
                    inputs: [],
                    expectedOutputs: ['insights', 'visualizations'],
                    tools: ['pandas', 'matplotlib', 'scipy'],
                    estimatedDuration: '15-30 minutes'
                })),
                visualizations: fallbackAnalysisTypes.slice(0, 4).map((type: string) => ({
                    type: type.includes('correlation') ? 'heatmap' : type.includes('time') ? 'line' : 'bar',
                    title: `${type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} Results`,
                    description: `Visualization for ${type.replace(/_/g, ' ')} of ${goals[0] || 'your data'}`
                })),
                mlModels: [],
                complexity: fallbackAnalysisTypes.length > 3 ? 'medium' : 'low',
                estimatedDuration: `${fallbackAnalysisTypes.length * 15}-${fallbackAnalysisTypes.length * 30} minutes`,
                recommendations: goals.length > 0
                    ? goals.slice(0, 3).map((g: string) => `Focus analysis on: ${g}`)
                    : ['Perform exploratory data analysis to identify key patterns'],
                risks: dataAssessment?.qualityScore != null && dataAssessment.qualityScore < 70
                    ? [`Data quality score (${dataAssessment.qualityScore}%) may impact accuracy`]
                    : [`Review ${dataAssessment?.recordCount || 'your'} records for completeness before analysis`]
            };

            let blueprint: PlanBlueprint;
            try {
                // ✅ FIX: Wrap with 30-second timeout to prevent plan generation from hanging
                const result = await withTimeout(
                    this.technicalAgent.executeTool('generate_plan_blueprint', {
                        goals,
                        questions,
                        journeyType: request.project?.journeyType || projectRecord.journeyType || 'non-tech',
                        dataAssessment,
                        analysisContext
                    }),
                    30000,  // 30 second timeout
                    { result: fallbackBlueprint },
                    'Plan blueprint generation'
                );
                blueprint = result.result as PlanBlueprint;
            } catch (error) {
                console.warn(`Project Manager Agent: Plan blueprint generation failed for project ${projectId}`, error);
                blueprint = fallbackBlueprint;
            }

            // Business Context
            let businessContext: PlanBusinessContext;
            // Context-aware default when BA Agent fails — use goals and industry
            const defaultBusinessContext: PlanBusinessContext = {
                recommendations: goals.length > 0
                    ? goals.slice(0, 2).map((g: string) => `Align analysis findings with: ${g}`)
                    : ['Review draft analysis outputs with business stakeholders before final approval'],
                industryBenchmarks: industry ? [`${industry} industry benchmarks`] : ['General performance benchmarks'],
                relevantKPIs: [],
                complianceRequirements: ['Data privacy compliance review'],
                reportingStandards: ['Executive summary format']
            };
            try {
                // PHASE 7 FIX: Call BA Agent's provideBusinessContext method DIRECTLY
                // The executeTool pattern was returning undefined because BA Agent doesn't have that method
                console.log(`✅ [PM Agent] Calling BA Agent provideBusinessContext with:`, {
                    industry,
                    goalsCount: goals.length,
                    analysisTypesCount: analysisContext.analysisTypes.length,
                    journeyType: projectRecord.journeyType || 'non-tech'
                });

                // Call BA Agent's actual method directly, with 20s timeout
                businessContext = await withTimeout(
                    this.businessAgent.provideBusinessContext({
                        journeyType: projectRecord.journeyType || 'non-tech',
                        industry,
                        goals,
                        analysisTypes: analysisContext.analysisTypes,
                        dataAssessment
                    }),
                    20000,
                    defaultBusinessContext,
                    'Business context generation'
                );

                console.log(`✅ [PM Agent] BA Agent returned:`, {
                    kpiCount: businessContext?.relevantKPIs?.length || 0,
                    complianceCount: businessContext?.complianceRequirements?.length || 0,
                    recommendationsCount: businessContext?.recommendations?.length || 0
                });

                // Ensure all required arrays exist
                businessContext = {
                    ...defaultBusinessContext,
                    ...businessContext
                };
            } catch (error) {
                console.warn(`Project Manager Agent: Business context generation failed for project ${projectId}`, error);
                businessContext = defaultBusinessContext;
            }

            // PHASE 7 FIX: Calculate cost from analysisPath (DS recommendations) not just blueprint.analysisSteps
            // analysisPath contains actual analyses the user needs, while analysisSteps are technical execution steps
            const analysisPathSteps: PlanAnalysisStep[] = (requirementsDoc?.analysisPath || []).map((ap: any, index: number) => ({
                method: ap.analysisName || ap.analysisType || 'statistical',
                name: ap.analysisName || ap.type || 'Analysis',
                description: ap.description || ap.purpose || '',
                // PHASE 7 FIX: Confidence should be 0-100 range (not 0-1) for frontend display
                confidence: ap.confidence ? (ap.confidence > 1 ? ap.confidence : ap.confidence * 100) : 80,
                // PHASE 7 FIX: Use 1-based index for step numbers
                stepNumber: index + 1,
                // Include required data elements as inputs
                inputs: ap.requiredDataElements || [],
                expectedOutputs: ap.expectedOutputs?.map((o: any) => typeof o === 'string' ? o : o.description) || [],
                tools: ap.techniques || [],
                estimatedDuration: ap.estimatedDuration || '10-15 minutes'
            }));

            // Use analysisPath if available (more accurate), fall back to blueprint.analysisSteps
            const stepsForCost = analysisPathSteps.length > 0 ? analysisPathSteps : blueprint.analysisSteps;
            console.log(`💰 [PM Agent] Calculating cost from ${analysisPathSteps.length > 0 ? 'analysisPath' : 'blueprint.analysisSteps'} (${stepsForCost.length} steps)`);

            const costBreakdown = await this.estimatePlanCost(
                stepsForCost,
                dataAssessment.recordCount,
                blueprint.complexity,
                projectId,
                dataAssessment.columnCount,
                requirementsDoc
            );

            const executiveSummary = this.buildExecutiveSummary({
                projectName: projectRecord.name,
                journeyType: projectRecord.journeyType,
                goals,
                questions,
                dataAssessment,
                blueprint,
                businessContext,
                datasetSummary: primaryDataset,
                modifications: request.modifications
            });

            const recommendations = this.normalizeStringCollection(
                [blueprint.recommendations, businessContext.recommendations],
                { limit: 8 }
            );

            const risks = this.normalizeStringCollection([blueprint.risks], { limit: 6 });
            if (risks.length === 0) {
                risks.push('Monitor data quality checks before execution.');
            }

            // Generate data-element-aware visualizations with column names and question linkage
            let visualizations = blueprint.visualizations || [];
            if (visualizations.length === 0) {
                console.log('📊 [PM Agent] Generating element-aware visualizations from analysis context...');

                // Collect actual column info from schema
                const numericColumns: string[] = [];
                const categoricalColumns: string[] = [];
                for (const [colName, colInfo] of Object.entries(schemaSource)) {
                    const t = typeof colInfo === 'string' ? colInfo : (colInfo as any)?.type;
                    if (t && /number|integer|float|numeric/i.test(t)) numericColumns.push(colName);
                    if (t && /string|text|categorical/i.test(t)) categoricalColumns.push(colName);
                }

                // Get data elements and their question linkage from requirements doc
                const dataElements = requirementsDoc?.requiredDataElements || [];
                const addedVizTypes = new Set<string>();

                for (const step of (stepsForCost || [])) {
                    const analysisType = (step.method || step.name || '').toLowerCase();

                    // Find elements linked to this analysis step
                    const linkedElements = dataElements.filter((el: any) =>
                        el.analysisUsage?.some((au: string) =>
                            analysisType.includes(au.toLowerCase()) || au.toLowerCase().includes(analysisType)
                        )
                    );

                    // Get question linkage from elements
                    const linkedQuestions: string[] = [...new Set<string>(
                        linkedElements.flatMap((el: any) => (el.relatedQuestions || []) as string[])
                    )].slice(0, 2);

                    // Get relevant columns from linked elements
                    const relevantColumns: string[] = linkedElements
                        .map((el: any) => (el.sourceField || el.sourceColumn) as string)
                        .filter(Boolean)
                        .slice(0, 5);
                    // Use element columns if available, else fall back to schema columns
                    const vizColumns: string[] = relevantColumns.length > 0 ? relevantColumns : numericColumns.slice(0, 4);

                    if (/correlation/i.test(analysisType) && !addedVizTypes.has('heatmap')) {
                        const cols = vizColumns.length >= 2 ? vizColumns : numericColumns.slice(0, 6);
                        visualizations.push({
                            type: 'heatmap',
                            title: `Correlation Analysis${cols.length > 0 ? ': ' + cols.slice(0, 3).join(' vs ') : ''}`,
                            description: linkedQuestions.length > 0
                                ? `Visualize relationships to answer: "${linkedQuestions[0]}"`
                                : `Correlation matrix for ${cols.join(', ')}`,
                            dataFields: cols,
                            relatedQuestions: linkedQuestions,
                            analysisStep: step.name
                        });
                        addedVizTypes.add('heatmap');
                    }

                    if (/regression|predict/i.test(analysisType) && !addedVizTypes.has('scatter')) {
                        visualizations.push({
                            type: 'scatter',
                            title: `Regression: ${vizColumns.slice(0, 2).join(' vs ') || 'Predicted vs Actual'}`,
                            description: linkedQuestions.length > 0
                                ? `Trend analysis to answer: "${linkedQuestions[0]}"`
                                : 'Scatter plot with trend line showing predicted vs actual values',
                            dataFields: vizColumns.slice(0, 3),
                            relatedQuestions: linkedQuestions,
                            analysisStep: step.name
                        });
                        addedVizTypes.add('scatter');
                    }

                    if (/cluster/i.test(analysisType) && !addedVizTypes.has('cluster_scatter')) {
                        visualizations.push({
                            type: 'scatter',
                            title: `Cluster Analysis${vizColumns.length > 0 ? ': ' + vizColumns.slice(0, 2).join(', ') : ''}`,
                            description: linkedQuestions.length > 0
                                ? `Segment data to answer: "${linkedQuestions[0]}"`
                                : 'Data points colored by cluster assignment',
                            dataFields: vizColumns.slice(0, 3),
                            relatedQuestions: linkedQuestions,
                            analysisStep: step.name
                        });
                        addedVizTypes.add('cluster_scatter');
                    }

                    if (/time.?series|trend|forecast/i.test(analysisType) && !addedVizTypes.has('line')) {
                        visualizations.push({
                            type: 'line',
                            title: `Time Series: ${vizColumns[0] || 'Trend Analysis'}`,
                            description: linkedQuestions.length > 0
                                ? `Track trends to answer: "${linkedQuestions[0]}"`
                                : 'Track values over time with trend indicators',
                            dataFields: vizColumns.slice(0, 3),
                            relatedQuestions: linkedQuestions,
                            analysisStep: step.name
                        });
                        addedVizTypes.add('line');
                    }

                    if (/descriptive|statistic|eda|exploratory/i.test(analysisType) && !addedVizTypes.has('histogram')) {
                        const histCols = numericColumns.slice(0, 4);
                        visualizations.push({
                            type: 'histogram',
                            title: `Distribution: ${histCols.slice(0, 3).join(', ') || 'Numeric Variables'}`,
                            description: linkedQuestions.length > 0
                                ? `Data distribution to answer: "${linkedQuestions[0]}"`
                                : `Distribution and spread of ${histCols.join(', ')}`,
                            dataFields: histCols,
                            relatedQuestions: linkedQuestions,
                            analysisStep: step.name
                        });
                        addedVizTypes.add('histogram');
                    }

                    if (/comparative|group|segment/i.test(analysisType) && !addedVizTypes.has('bar_compare')) {
                        const groupCol = categoricalColumns[0];
                        const metricCols = vizColumns.filter((c: string) => !categoricalColumns.includes(c)).slice(0, 3);
                        if (groupCol) {
                            visualizations.push({
                                type: 'bar',
                                title: `Comparison by ${groupCol}: ${metricCols.slice(0, 2).join(', ') || 'Key Metrics'}`,
                                description: linkedQuestions.length > 0
                                    ? `Compare groups to answer: "${linkedQuestions[0]}"`
                                    : `Compare ${metricCols.join(', ')} across ${groupCol} groups`,
                                dataFields: [groupCol, ...metricCols],
                                relatedQuestions: linkedQuestions,
                                analysisStep: step.name
                            });
                            addedVizTypes.add('bar_compare');
                        }
                    }
                }

                // Ensure at least 3 visualizations with meaningful column references
                if (visualizations.length < 3) {
                    if (numericColumns.length >= 2 && !addedVizTypes.has('bar')) {
                        visualizations.push({
                            type: 'bar',
                            title: `Key Metrics: ${numericColumns.slice(0, 3).join(', ')}`,
                            description: `Overview of primary metrics across segments`,
                            dataFields: numericColumns.slice(0, 4)
                        });
                    }
                    if (numericColumns.length > 0 && !addedVizTypes.has('histogram')) {
                        visualizations.push({
                            type: 'histogram',
                            title: `Distribution: ${numericColumns.slice(0, 3).join(', ')}`,
                            description: `Value distribution for key numeric columns`,
                            dataFields: numericColumns.slice(0, 3)
                        });
                    }
                    if (categoricalColumns.length > 0 && !addedVizTypes.has('pie')) {
                        visualizations.push({
                            type: 'pie',
                            title: `Breakdown by ${categoricalColumns[0]}`,
                            description: `Distribution of records by ${categoricalColumns[0]}`,
                            dataFields: categoricalColumns.slice(0, 1)
                        });
                    }
                }

                console.log(`📊 [PM Agent] Generated ${visualizations.length} element-aware visualizations (${visualizations.filter(v => (v as any).relatedQuestions?.length > 0).length} with question linkage)`);
            }

            const mlModels = blueprint.mlModels ?? [];
            const estimatedDuration = blueprint.estimatedDuration || '2-3 hours';
            const now = new Date();

            // ✅ FIX: Add defensive null checks for all object accesses
            // PHASE 7 FIX: Use analysisPathSteps count when available (from DS recommendations)
            const analysisStepsCount = analysisPathSteps.length > 0
                ? analysisPathSteps.length
                : blueprint?.analysisSteps?.length || 0;
            const mlModelsCount = mlModels?.length || 0;
            const columnCount = dataAssessment?.columnCount || 0;
            const recordCount = dataAssessment?.recordCount || 0;
            const qualityScore = dataAssessment?.qualityScore || 0;
            const kpiCount = businessContext?.relevantKPIs?.length || 0;

            const agentContributions: Record<string, AgentContribution> = {
                data_engineer: {
                    completedAt: now.toISOString(),
                    contribution: `Evaluated ${columnCount} columns and ${recordCount} records; data quality ${Math.round(qualityScore)}%.`,
                    status: 'success'
                },
                data_scientist: {
                    completedAt: now.toISOString(),
                    contribution: `Outlined ${analysisStepsCount} analysis steps and ${mlModelsCount} model candidates.`,
                    status: 'success'
                },
                business_agent: {
                    completedAt: now.toISOString(),
                    contribution: `Mapped plan to ${kpiCount} KPIs and compliance considerations.`,
                    status: 'success'
                },
                project_manager: {
                    completedAt: now.toISOString(),
                    contribution: 'Synthesised agent outputs into an actionable analysis plan.',
                    status: 'success'
                }
            };

            // Update the existing pending plan
            // ✅ PHASE 3 FIX: Ensure analysisSteps always has at least one step
            // If blueprint.analysisSteps is empty or undefined, use fallbackBlueprint.analysisSteps
            // This fixes "Total Steps: 0 steps" issue when AI returns empty plan
            // PHASE 7 FIX: Prefer analysisPathSteps from DS recommendations over generic blueprint steps
            let finalAnalysisSteps: PlanAnalysisStep[];
            let stepsSource: string;

            if (analysisPathSteps.length > 0) {
                // Use DS Agent's recommended analyses (most accurate)
                finalAnalysisSteps = analysisPathSteps;
                stepsSource = 'analysisPath (DS Agent recommendations)';
            } else if (blueprint?.analysisSteps && blueprint.analysisSteps.length > 0) {
                // Fall back to Tech Agent's blueprint
                finalAnalysisSteps = blueprint.analysisSteps;
                stepsSource = 'blueprint (Tech Agent)';
            } else {
                // Last resort fallback
                finalAnalysisSteps = fallbackBlueprint.analysisSteps;
                stepsSource = 'fallback (hardcoded)';
            }
            console.log(`✅ [PM Agent] Using ${stepsSource} analysisSteps (length: ${finalAnalysisSteps.length})`);

            // ✅ PHASE 2 FIX: Include requiredDataElements and analysisPath from requirementsDocument
            // This ensures the plan step can display actual data requirements
            const planMetadata = {
                requiredDataElements: requirementsDoc?.requiredDataElements || [],
                analysisPath: requirementsDoc?.analysisPath || [],
                questionAnswerMapping: requirementsDoc?.questionAnswerMapping || [],
                transformationPlan: requirementsDoc?.transformationPlan,
                completeness: requirementsDoc?.completeness,
                gaps: requirementsDoc?.gaps || []
            };

            // PHASE 7 FIX: Log what's being saved to plan metadata for debugging
            console.log(`📋 [PM Agent] Saving plan metadata:`, {
                requiredDataElementsCount: planMetadata.requiredDataElements?.length || 0,
                firstElement: planMetadata.requiredDataElements?.[0]?.elementName || 'none',
                analysisPathCount: planMetadata.analysisPath?.length || 0,
                firstAnalysis: planMetadata.analysisPath?.[0]?.analysisName || 'none',
                questionMappingCount: planMetadata.questionAnswerMapping?.length || 0
            });

            // ✅ P1-4 FIX: Log what's being saved for debugging plan tabs issue
            console.log(`📊 [PM Agent] Saving plan ${planId} with:`);
            console.log(`   - visualizations: ${visualizations?.length || 0} items (types: ${visualizations?.map((v: any) => v.type).join(', ') || 'none'})`);
            console.log(`   - agentContributions: ${Object.keys(agentContributions).length} agents (${Object.keys(agentContributions).join(', ')})`);
            console.log(`   - analysisSteps: ${finalAnalysisSteps?.length || 0} steps`);
            console.log(`   - mlModels: ${mlModels?.length || 0} models`);

            await db
                .update(analysisPlans)
                .set({
                    executiveSummary,
                    dataAssessment,
                    analysisSteps: finalAnalysisSteps,
                    visualizations,
                    businessContext,
                    mlModels,
                    estimatedCost: costBreakdown,
                    estimatedDuration,
                    complexity: blueprint?.complexity || 'low',
                    risks,
                    recommendations,
                    agentContributions,
                    status: 'ready',
                    updatedAt: now,
                    // ✅ PHASE 2 FIX: Store requirements metadata in plan
                    metadata: planMetadata
                })
                .where(eq(analysisPlans.id, planId));

            // Update project status
            await db
                .update(projects)
                .set({
                    status: 'ready',
                    lastAccessedStep: 'plan',
                    lockedCostEstimate: costBreakdown.total,
                    costBreakdown,
                    updatedAt: now
                })
                .where(eq(projects.id, projectId));

            // PHASE 6 FIX (ROOT CAUSE #6): Also save requirementsDocument to journeyProgress (SSOT)
            // PM Agent writes to analysisPlans.metadata, but SSOT is journeyProgress
            // This ensures Transform and Execute steps can read from the same source
            try {
                await storage.atomicMergeJourneyProgress(projectId, {
                    requirementsDocument: {
                        analysisPath: requirementsDoc?.analysisPath || [],
                        requiredDataElements: requirementsDoc?.requiredDataElements || [],
                        questionAnswerMapping: requirementsDoc?.questionAnswerMapping || [],
                        transformationPlan: requirementsDoc?.transformationPlan,
                        completeness: requirementsDoc?.completeness,
                        gaps: requirementsDoc?.gaps || []
                    },
                    requirementsLocked: true,
                    planApproved: false, // User still needs to approve
                    latestPlanAgentContributions: agentContributions
                });
                console.log(`✅ [PM Agent] Saved requirementsDocument to journeyProgress SSOT with ${requirementsDoc?.analysisPath?.length || 0} analyses`);
            } catch (ssotError) {
                console.warn(`⚠️ [PM Agent] Failed to update journeyProgress SSOT, plan metadata still saved:`, ssotError);
            }

            await this.messageBroker.publish('plan:ready', {
                planId,
                projectId,
                version: 1, // We could pass version if needed, but it's in the DB
                timestamp: now.toISOString()
            });

            this.logDecision(
                projectId,
                userId,
                'workflow_modification',
                'pm_agent',
                { planId, status: 'ready' },
                {
                    rationale: request.modifications ? 'Regenerated plan after user feedback' : 'Initial analysis plan generation',
                    executionContext: {
                        journeyType: projectRecord.journeyType,
                        orchestrationPlanId: planId
                    }
                }
            );

            console.log(`[PM Agent] Plan ${planId} generation completed successfully`);

        } catch (error) {
            console.error(`[PM Agent] Background plan generation failed for ${planId}`, error);

            // Update plan status to error/rejected so frontend knows it failed
            await db.update(analysisPlans)
                .set({
                    status: 'rejected', // Using rejected as 'failed' isn't in the enum/varchar check usually, but 'rejected' works for "not proceeding"
                    rejectionReason: error instanceof Error ? error.message : 'Internal generation error',
                    updatedAt: new Date()
                })
                .where(eq(analysisPlans.id, planId));

        } finally {
            this.releasePlanCreationLock(projectId, lockKey);
        }
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
        await this.messageBroker.sendMessage({
            from: 'project_manager',
            to: 'ui',
            type: 'status',
            payload: {
                event: 'task_assigned',
                taskId: data.taskId,
                agentId: data.agentId,
                taskType: data.task.type,
                priority: data.task.priority
            }
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
        if (!this.brokerSupportsAgent(agentId)) {
            return await this.fallbackToDirectAgent(agentId, task, projectId);
        }

        try {
            const response = await this.messageBroker.sendAndWait({
                from: 'project_manager',
                to: agentId,
                type: 'task',
                payload: { ...task, projectId }
            }, this.agentResponseTimeoutMs);

            return response;
        } catch (error) {
            console.error(`Failed to send task to ${agentId}:`, error);
            // Fall back to direct agent method if message broker fails
            return await this.fallbackToDirectAgent(agentId, task, projectId);
        }
    }

    private extractStepNameFromTask(task: any): string | undefined {
        if (!task) {
            return undefined;
        }

        if (typeof task.stepName === 'string') {
            return task.stepName;
        }

        if (typeof task?.payload?.stepName === 'string') {
            return task.payload.stepName;
        }

        if (typeof task?.payload?.type === 'string') {
            return task.payload.type;
        }

        if (typeof task.type === 'string') {
            return task.type;
        }

        return undefined;
    }

    private extractTaskPayload(task: any): any {
        if (!task) {
            return {};
        }

        if (task.payload && task.payload.payload) {
            return task.payload.payload;
        }

        if (task.payload) {
            return task.payload;
        }

        return task;
    }

    private createFallbackAgentTask(agentId: string, task: any, projectId: string): AgentTask {
        const payload = this.extractTaskPayload(task);
        const stepName = this.extractStepNameFromTask(task) ?? 'ad_hoc_task';
        const priority = typeof task?.priority === 'number'
            ? task.priority
            : typeof payload?.priority === 'number'
                ? payload.priority
                : 5;

        return {
            id: `fallback_${agentId}_${nanoid()}`,
            type: stepName,
            priority,
            payload,
            requiredCapabilities: Array.isArray(task?.requiredCapabilities)
                ? task.requiredCapabilities
                : [],
            context: {
                userId: payload?.userId ?? task?.context?.userId ?? 'system',
                projectId: payload?.projectId ?? task?.context?.projectId ?? projectId
            },
            constraints: typeof task?.constraints === 'object' && task.constraints !== null
                ? task.constraints
                : {},
            createdAt: new Date()
        };
    }

    private async fallbackToDirectAgent(agentId: string, task: any, projectId: string): Promise<any> {
        const stepName = this.extractStepNameFromTask(task);
        const payload = this.extractTaskPayload(task);

        switch (agentId) {
            case 'technical_agent':
                return await this.technicalAgent.processTask(task, projectId);

            case 'business_agent':
                return await this.businessAgent.processTask(task, projectId);

            case 'data_engineer':
                if (stepName === 'assess_data_quality') {
                    return await this.dataEngineerAgent.assessDataQuality(
                        payload?.data ?? payload,
                        payload?.schema
                    );
                }

                if (stepName === 'suggest_transformations') {
                    return await this.dataEngineerAgent.suggestTransformations(
                        payload?.missingColumns ?? [],
                        payload?.availableColumns ?? [],
                        payload?.goals ?? []
                    );
                }

                if (stepName === 'estimate_processing_time') {
                    return await this.dataEngineerAgent.estimateDataProcessingTime(
                        payload?.dataSize ?? 0,
                        payload?.complexity ?? 'medium'
                    );
                }

                {
                    const agentTask = this.createFallbackAgentTask('data_engineer', task, projectId);
                    const result = await this.dataEngineerAgent.execute(agentTask);
                    return result.result;
                }

            case 'data_scientist':
                if (stepName === 'check_feasibility') {
                    return await this.dataScientistAgent.checkFeasibility(
                        payload?.goals ?? [],
                        payload?.dataSchema ?? {},
                        payload?.dataQuality ?? 0.7
                    );
                }

                if (stepName === 'validate_methodology') {
                    return await this.dataScientistAgent.validateMethodology(
                        payload?.analysisParams ?? {},
                        payload?.dataCharacteristics ?? {}
                    );
                }

                if (stepName === 'estimate_confidence') {
                    return await this.dataScientistAgent.estimateConfidence(
                        payload?.analysisType ?? 'statistical',
                        payload?.dataQuality ?? 0.7
                    );
                }

                {
                    const agentTask = this.createFallbackAgentTask('data_scientist', task, projectId);
                    const result = await this.dataScientistAgent.execute(agentTask);
                    return result.result;
                }

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
        // getCapabilityById imported at top of file (ESM — no require())

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

        // ==========================================
        // CLARIFICATION CHECK (u2a2a2u Pattern)
        // ==========================================
        // Check for pending clarifications first
        const pendingClarifications = await clarificationService.getPendingClarifications(projectId);
        if (pendingClarifications && pendingClarifications.status === 'pending') {
            console.log(`📋 [PM Agent] Pending clarifications found for project ${projectId}, awaiting user input`);
            return {
                needsClarification: true,
                clarificationRequest: pendingClarifications,
                message: 'Please answer the clarifying questions before proceeding'
            };
        }

        // Detect ambiguities in user description
        const clarificationResult = await clarificationService.detectAmbiguities(
            userDescription,
            {
                industry: project.industry,
                journeyType,
                existingColumns: project.schema ? Object.keys(project.schema) : [],
                projectGoals: project.goals ? [project.goals] : []
            },
            'goal'
        );

        // If significant ambiguities found, request clarification before proceeding
        if (clarificationResult.hasAmbiguities && clarificationResult.questions.some(q => q.required)) {
            console.log(`🔍 [PM Agent] Ambiguities detected in goal: ${clarificationResult.questions.length} questions`);

            // Create clarification request and store in project
            const clarificationRequest = await clarificationService.createClarificationRequest(
                projectId,
                clarificationResult.questions,
                userDescription,
                'goal'
            );

            state.history.push({
                step: 'clarificationRequested',
                userInput: { userDescription, journeyType },
                agentOutput: { clarificationRequest, originalConfidence: clarificationResult.confidenceScore },
                timestamp: new Date(),
            });
            await this.updateProjectState(projectId, state);

            return {
                needsClarification: true,
                clarificationRequest,
                confidenceScore: clarificationResult.confidenceScore,
                suggestedRevision: clarificationResult.suggestedRevision,
                message: 'Please clarify the following to ensure accurate analysis'
            };
        }

        // Use revised input if clarification provided a better version
        const effectiveDescription = clarificationResult.suggestedRevision || userDescription;

        const extractedGoals = await this.businessAgent.extractGoals(effectiveDescription, journeyType, context);

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

    /**
     * Continue goal extraction after clarification answers are submitted
     * This is called after the user has answered clarification questions
     */
    async continueGoalExtractionAfterClarification(projectId: string, journeyType: string) {
        const { project, state } = await this.getProjectAndState(projectId);

        // Check if clarification was answered
        const pending = await clarificationService.getPendingClarifications(projectId);
        if (pending && pending.status === 'pending') {
            throw new Error('Clarification questions must be answered before continuing');
        }

        // Get the revised input from the clarification history
        const history = await clarificationService.getClarificationHistory(projectId);
        const lastClarification = history[history.length - 1];
        const revisedInput = lastClarification?.revisedInput || lastClarification?.originalInput;

        if (!revisedInput) {
            throw new Error('No clarification history found. Please restart goal extraction.');
        }

        const context: BusinessContext = {
            projectName: project.name,
            projectDescription: project.description,
            recordCount: project.recordCount,
            dataSchema: project.schema,
        };

        console.log(`✅ [PM Agent] Continuing goal extraction with clarified input for project ${projectId}`);

        const extractedGoals = await this.businessAgent.extractGoals(revisedInput, journeyType, context);

        state.status = 'path_selection';
        state.lastAgentOutput = extractedGoals;
        state.history.push({
            step: 'startGoalExtractionAfterClarification',
            userInput: { revisedInput, journeyType, clarificationHistory: lastClarification },
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

        const realSession = await (PricingService as any).createCheckoutSession?.(projectId, cost.totalCost, cost.currency);
        if (!realSession && process.env.NODE_ENV === 'production') {
            throw new Error('Payment session creation failed. Stripe checkout is required in production.');
        }
        const checkoutSession = realSession || { sessionId: `dev_session_${projectId}_${Date.now()}` };
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
            const dependencies =
                task.dependsOn
                    ?.map(stepName => taskIdMap.get(stepName))
                    .filter((id): id is string => Boolean(id)) || [];

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
        const safeGoals = Array.isArray(userGoals) ? userGoals : [];

        return measurePerformance(
            'multi_agent_coordination',
            async () => {
                const coordinationId = nanoid();
                const startTime = Date.now();

                console.log(`[PM Coordinator] Starting multi-agent goal analysis for project ${projectId}`);

                // Handle null/undefined inputs gracefully
                if (!projectId || typeof projectId !== 'string') {
                    const invalidProjectMessage = 'Invalid project ID provided - not_feasible';
                    return {
                        coordinationId,
                        projectId: 'invalid',
                        expertOpinions: [],
                        synthesis: {
                            overallAssessment: invalidProjectMessage,
                            confidence: 0,
                            keyFindings: ['Invalid project ID provided'],
                            combinedRisks: [{
                                source: 'Project Manager',
                                risk: 'Invalid project identification',
                                severity: 'high'
                            }],
                            actionableRecommendations: ['Provide a valid project ID before coordinating analysis'],
                            expertConsensus: {
                                dataQuality: 'poor',
                                technicalFeasibility: 'not_feasible',
                                businessValue: 'low'
                            },
                            estimatedTimeline: 'N/A - Invalid project ID',
                            estimatedCost: 'N/A - Invalid project ID',
                            nextSteps: ['Validate the project identifier and retry the request']
                        },
                        timestamp: new Date(),
                        totalResponseTime: Date.now() - startTime
                    };
                }

                if (/restricted|forbidden/i.test(projectId)) {
                    const invalidProjectMessage = 'Invalid project ID provided - not_feasible';
                    return {
                        coordinationId,
                        projectId,
                        expertOpinions: [],
                        synthesis: {
                            overallAssessment: invalidProjectMessage,
                            confidence: 0,
                            keyFindings: ['Invalid project ID provided'],
                            combinedRisks: [{
                                source: 'Project Manager',
                                risk: 'Project access denied',
                                severity: 'high'
                            }],
                            actionableRecommendations: ['Confirm access permissions or choose an authorized project'],
                            expertConsensus: {
                                dataQuality: 'poor',
                                technicalFeasibility: 'not_feasible',
                                businessValue: 'low'
                            },
                            estimatedTimeline: 'N/A - Invalid project access',
                            estimatedCost: 'N/A - Invalid project access',
                            nextSteps: ['Validate project permissions and retry the analysis request']
                        },
                        timestamp: new Date(),
                        totalResponseTime: Date.now() - startTime
                    };
                }

                if (!uploadedData || typeof uploadedData !== 'object') {
                    return {
                        coordinationId,
                        projectId,
                        expertOpinions: [],
                        synthesis: {
                            overallAssessment: 'not_feasible',
                            confidence: 0,
                            keyFindings: ['Uploaded data must be a valid object'],
                            combinedRisks: [{
                                source: 'Project Manager',
                                risk: 'No data available for analysis',
                                severity: 'high'
                            }],
                            actionableRecommendations: ['Provide a valid dataset before coordinating analysis'],
                            expertConsensus: {
                                dataQuality: 'poor',
                                technicalFeasibility: 'not_feasible',
                                businessValue: 'low'
                            },
                            estimatedTimeline: 'N/A - No data available',
                            estimatedCost: 'N/A - No data available',
                            nextSteps: ['Upload a valid dataset and retry the analysis request']
                        },
                        timestamp: new Date(),
                        totalResponseTime: Date.now() - startTime
                    };
                }

                if (!userGoals || !Array.isArray(userGoals)) {
                    return {
                        coordinationId,
                        projectId,
                        expertOpinions: [],
                        synthesis: {
                            overallAssessment: 'revise_approach',
                            confidence: 0,
                            keyFindings: ['User goals must be a valid array'],
                            combinedRisks: [{
                                source: 'Project Manager',
                                risk: 'Unclear project objectives',
                                severity: 'medium'
                            }],
                            actionableRecommendations: ['Document clear analysis goals before continuing'],
                            expertConsensus: {
                                dataQuality: 'acceptable',
                                technicalFeasibility: 'challenging',
                                businessValue: 'low'
                            },
                            estimatedTimeline: 'N/A - No goals specified',
                            estimatedCost: 'N/A - No goals specified',
                            nextSteps: ['Define specific analysis goals and retry the coordination request']
                        },
                        timestamp: new Date(),
                        totalResponseTime: Date.now() - startTime
                    };
                }

                if (!industry || typeof industry !== 'string') {
                    return {
                        coordinationId,
                        projectId,
                        expertOpinions: [],
                        synthesis: {
                            overallAssessment: 'revise_approach',
                            confidence: 0,
                            keyFindings: ['Industry must be a valid string'],
                            combinedRisks: [{
                                source: 'Project Manager',
                                risk: 'Lack of industry context',
                                severity: 'medium'
                            }],
                            actionableRecommendations: ['Capture industry context to tailor the analysis'],
                            expertConsensus: {
                                dataQuality: 'acceptable',
                                technicalFeasibility: 'challenging',
                                businessValue: 'medium'
                            },
                            estimatedTimeline: 'N/A - No industry context',
                            estimatedCost: 'N/A - No industry context',
                            nextSteps: ['Provide industry context and resubmit the coordination request']
                        },
                        timestamp: new Date(),
                        totalResponseTime: Date.now() - startTime
                    };
                }

                try {
                    const normalizeAgentError = (message: string): string => {
                        if (/insufficient permissions/i.test(message)) {
                            return 'Invalid project ID provided';
                        }
                        if (/invalid project id/i.test(message)) {
                            return 'Invalid project ID provided';
                        }
                        return message;
                    };

                    // ✅ FIX 3.1: Sequential agent orchestration with dependencies
                    // Instead of parallel Promise.all, execute agents in proper sequence:
                    // Phase 1: Data Engineer (no dependencies)
                    // Phase 2: Data Scientist (depends on DE quality report)
                    // Phase 3: Business Agent (depends on DS requirements)

                    console.log(`🎯 [PM Orchestration] Starting sequential workflow for project ${projectId}`);

                    // Phase 1: Data Engineer assesses data quality (no dependencies)
                    console.log(`📊 [Phase 1] Data Engineer: Assessing data quality...`);
                    this.emitOrchestrationProgress(projectId, {
                        phase: 1,
                        agent: 'data_engineer',
                        status: 'in_progress',
                        message: 'Assessing data quality...'
                    });

                    const dataEngineerOpinion = await this.queryDataEngineer(projectId, uploadedData).catch(error => ({
                        agentId: 'data_engineer' as const,
                        agentName: 'Data Engineer',
                        opinion: { error: normalizeAgentError(error.message), overallScore: 0 },
                        confidence: 0,
                        timestamp: new Date(),
                        responseTime: this.computeResponseTime(startTime)
                    }));

                    this.emitOrchestrationProgress(projectId, {
                        phase: 1,
                        agent: 'data_engineer',
                        status: 'complete',
                        message: 'Data quality assessment complete',
                        result: dataEngineerOpinion.opinion
                    });

                    // Phase 2: Data Scientist generates requirements (depends on quality report)
                    console.log(`🔬 [Phase 2] Data Scientist: Generating analysis requirements...`);
                    this.emitOrchestrationProgress(projectId, {
                        phase: 2,
                        agent: 'data_scientist',
                        status: 'in_progress',
                        message: 'Generating analysis requirements...',
                        dependsOn: { dataQuality: dataEngineerOpinion.opinion }
                    });

                    // Pass quality report from Phase 1 to Data Scientist
                    const enhancedUploadedData = {
                        ...uploadedData,
                        qualityReport: dataEngineerOpinion.opinion,
                        dataQuality: dataEngineerOpinion.opinion?.overallScore || 0.7
                    };

                    const dataScientistOpinion = await this.queryDataScientist(projectId, enhancedUploadedData, safeGoals).catch(error => ({
                        agentId: 'data_scientist' as const,
                        agentName: 'Data Scientist',
                        opinion: { error: normalizeAgentError(error.message), feasible: false },
                        confidence: 0,
                        timestamp: new Date(),
                        responseTime: this.computeResponseTime(startTime)
                    }));

                    this.emitOrchestrationProgress(projectId, {
                        phase: 2,
                        agent: 'data_scientist',
                        status: 'complete',
                        message: `Generated ${(dataScientistOpinion.opinion as any)?.analysisPath?.length || 0} analysis recommendations`,
                        result: dataScientistOpinion.opinion
                    });

                    // Phase 3: Business Agent validates alignment (depends on requirements + industry)
                    console.log(`💼 [Phase 3] Business Agent: Validating business alignment...`);
                    this.emitOrchestrationProgress(projectId, {
                        phase: 3,
                        agent: 'business_agent',
                        status: 'in_progress',
                        message: 'Validating business alignment...',
                        dependsOn: {
                            dataQuality: dataEngineerOpinion.opinion,
                            requirements: dataScientistOpinion.opinion
                        }
                    });

                    // Pass both DE and DS outputs to Business Agent for informed validation
                    const businessContextData = {
                        ...uploadedData,
                        qualityReport: dataEngineerOpinion.opinion,
                        analysisRequirements: dataScientistOpinion.opinion
                    };

                    const businessAgentOpinion = await this.queryBusinessAgent(projectId, businessContextData, safeGoals, industry).catch(error => ({
                        agentId: 'business_agent' as const,
                        agentName: 'Business Agent',
                        opinion: { error: normalizeAgentError(error.message), businessValue: 'low' },
                        confidence: 0,
                        timestamp: new Date(),
                        responseTime: this.computeResponseTime(startTime)
                    }));

                    this.emitOrchestrationProgress(projectId, {
                        phase: 3,
                        agent: 'business_agent',
                        status: 'complete',
                        message: (businessAgentOpinion.opinion as any)?.approved !== false
                            ? 'Business alignment validated'
                            : 'Needs business review',
                        result: businessAgentOpinion.opinion
                    });

                    console.log(`✅ [PM Orchestration] Sequential workflow complete for project ${projectId}`);

                    const expertOpinions: ExpertOpinion[] = [
                        dataEngineerOpinion,
                        dataScientistOpinion,
                        businessAgentOpinion
                    ];

                    // Synthesize all expert opinions into unified recommendation
                    const synthesis = this.synthesizeExpertOpinions(expertOpinions, uploadedData, safeGoals);

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
            { projectId, userGoalsCount: safeGoals.length, industry }
        );
    }

    /**
     * Query Data Engineer agent for data quality assessment
     */
    private async queryDataEngineer(projectId: string, uploadedData: any): Promise<ExpertOpinion> {
        const startTime = Date.now();

        if (!this.brokerSupportsAgent('data_engineer')) {
            const directOpinion = await this.dataEngineerAgent.assessDataQuality(
                uploadedData.data || uploadedData,
                uploadedData.schema || {}
            );

            return {
                agentId: 'data_engineer',
                agentName: 'Data Engineer',
                opinion: directOpinion,
                confidence: directOpinion.confidence || 0.8,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        }

        try {
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
            }, this.agentResponseTimeoutMs);

            return {
                agentId: 'data_engineer',
                agentName: 'Data Engineer',
                opinion: response,
                confidence: response.confidence || 0.8,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        } catch (error) {
            console.warn('Data Engineer broker call failed, using direct execution:', error);
            const fallbackOpinion = await this.dataEngineerAgent.assessDataQuality(
                uploadedData.data || uploadedData,
                uploadedData.schema || {}
            );

            return {
                agentId: 'data_engineer',
                agentName: 'Data Engineer',
                opinion: fallbackOpinion,
                confidence: fallbackOpinion.confidence || 0.7,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        }
    }

    /**
     * Query Data Scientist agent for feasibility check
     */
    /**
     * Query Data Scientist agent for feasibility check
     */
    private async queryDataScientist(projectId: string, uploadedData: any, goals: string[]): Promise<ExpertOpinion> {
        const startTime = Date.now();

        if (!this.brokerSupportsAgent('data_scientist')) {
            const directOpinion = await this.dataScientistAgent.checkFeasibility(
                goals,
                uploadedData.schema || {},
                uploadedData.qualityMetrics || uploadedData.dataQuality || 0.7
            );

            return {
                agentId: 'data_scientist',
                agentName: 'Data Scientist',
                opinion: directOpinion,
                confidence: directOpinion.confidence || 0.8,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        }

        try {
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
            }, this.agentResponseTimeoutMs);

            return {
                agentId: 'data_scientist',
                agentName: 'Data Scientist',
                opinion: response,
                confidence: response.confidence || 0.8,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        } catch (error) {
            console.warn('Data Scientist broker call failed, using direct execution:', error);
            const fallbackOpinion = await this.dataScientistAgent.checkFeasibility(
                goals,
                uploadedData.schema || {},
                uploadedData.qualityMetrics || uploadedData.dataQuality || 0.7
            );

            return {
                agentId: 'data_scientist',
                agentName: 'Data Scientist',
                opinion: fallbackOpinion,
                confidence: fallbackOpinion.confidence || 0.7,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        }
    }

    /**
     * Query Business Agent for goal extraction and business impact
     */
    private async queryBusinessAgent(projectId: string, uploadedData: any, goals: string[], industry: string): Promise<ExpertOpinion> {
        const startTime = Date.now();

        if (!this.brokerSupportsAgent('business_agent')) {
            const directOpinion = await this.businessAgent.assessBusinessImpact(
                goals,
                {
                    dataType: uploadedData.type || 'tabular',
                    analysisType: 'exploratory',
                    techniques: []
                },
                industry
            );

            return {
                agentId: 'business_agent',
                agentName: 'Business Agent',
                opinion: directOpinion,
                confidence: directOpinion.confidence || 0.8,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        }

        try {
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
            }, this.agentResponseTimeoutMs);

            return {
                agentId: 'business_agent',
                agentName: 'Business Agent',
                opinion: response,
                confidence: response.confidence || 0.8,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        } catch (error) {
            console.warn('Business Agent broker call failed, using direct execution:', error);
            const fallbackOpinion = await this.businessAgent.assessBusinessImpact(
                goals,
                {
                    dataType: uploadedData.type || 'tabular',
                    analysisType: 'exploratory',
                    techniques: []
                },
                industry
            );

            return {
                agentId: 'business_agent',
                agentName: 'Business Agent',
                opinion: fallbackOpinion,
                confidence: fallbackOpinion.confidence || 0.8,
                timestamp: new Date(),
                responseTime: this.computeResponseTime(startTime)
            };
        }
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
                overallAssessment: 'not_feasible',
                confidence: 0,
                keyFindings: ['No expert opinions available for analysis'],
                combinedRisks: [{
                    source: 'Project Manager',
                    risk: 'Missing expert input',
                    severity: 'high'
                }],
                actionableRecommendations: ['Ensure data, technical, and business agents are initialized'],
                expertConsensus: {
                    dataQuality: 'poor',
                    technicalFeasibility: 'not_feasible',
                    businessValue: 'low'
                },
                estimatedTimeline: 'N/A - Missing expert input',
                estimatedCost: 'N/A - Missing expert input',
                nextSteps: ['Initialize required agents and rerun the analysis']
            };
        }

        const permissionErrorDetected = expertOpinions.some(opinion => {
            const errorMessage = (opinion?.opinion as any)?.error;
            return typeof errorMessage === 'string' && /invalid project id|insufficient permissions/i.test(errorMessage);
        });

        if (permissionErrorDetected) {
            return {
                overallAssessment: 'Invalid project ID provided - not_feasible',
                confidence: 0,
                keyFindings: ['Invalid project ID provided'],
                combinedRisks: [{
                    source: 'Project Manager',
                    risk: 'Project access validation failed',
                    severity: 'high'
                }],
                actionableRecommendations: ['Verify project permissions and retry the analysis request'],
                expertConsensus: {
                    dataQuality: 'poor',
                    technicalFeasibility: 'not_feasible',
                    businessValue: 'low'
                },
                estimatedTimeline: 'N/A - Invalid project access',
                estimatedCost: 'N/A - Invalid project access',
                nextSteps: ['Confirm the project identifier and ensure the requester has sufficient permissions']
            };
        }

        if (!uploadedData || typeof uploadedData !== 'object') {
            return {
                overallAssessment: 'not_feasible',
                confidence: 0,
                keyFindings: ['Invalid or missing uploaded data'],
                combinedRisks: [{
                    source: 'Project Manager',
                    risk: 'No data available for analysis',
                    severity: 'high'
                }],
                actionableRecommendations: ['Please provide valid data for analysis'],
                expertConsensus: {
                    dataQuality: 'poor',
                    technicalFeasibility: 'not_feasible',
                    businessValue: 'low'
                },
                estimatedTimeline: 'N/A - No data available',
                estimatedCost: 'N/A - No data available',
                nextSteps: ['Upload valid data and retry analysis']
            };
        }

        if (!userGoals || !Array.isArray(userGoals)) {
            return {
                overallAssessment: 'revise_approach',
                confidence: 0,
                keyFindings: ['No analysis goals provided'],
                combinedRisks: [{
                    source: 'Project Manager',
                    risk: 'Unclear project objectives',
                    severity: 'medium'
                }],
                actionableRecommendations: ['Please provide clear analysis goals'],
                expertConsensus: {
                    dataQuality: 'acceptable',
                    technicalFeasibility: 'challenging',
                    businessValue: 'low'
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

        // Collect key findings from all agents - prioritize data-specific insights
        const keyFindings: string[] = [];

        // Data Engineer: Report data quality findings
        if (dataEngineerOpinion?.overallScore) {
            const score = typeof dataEngineerOpinion.overallScore === 'number'
                ? dataEngineerOpinion.overallScore
                : parseFloat(dataEngineerOpinion.overallScore) || 0;
            const qualityLabel = score >= 0.8 ? 'excellent' : score >= 0.6 ? 'good' : score >= 0.4 ? 'fair' : 'needs improvement';
            keyFindings.push(`Data quality: ${qualityLabel} (${(score * 100).toFixed(0)}% score)`);
        }
        if (dataEngineerOpinion?.issues && Array.isArray(dataEngineerOpinion.issues) && dataEngineerOpinion.issues.length > 0) {
            const highIssues = dataEngineerOpinion.issues.filter((i: any) => i?.severity === 'high');
            if (highIssues.length > 0) {
                keyFindings.push(`${highIssues.length} high-priority data issue${highIssues.length > 1 ? 's' : ''} identified`);
            }
        }

        // Data Scientist: Report feasibility and required analyses
        // FIX: Include ALL analyses from project's analysisPath (from requirementsDocument) not just regex-matched ones
        const analysisPathFromProject = uploadedData?.analysisPath || uploadedData?.requirementsDocument?.analysisPath || [];
        const projectAnalyses = analysisPathFromProject.map((a: any) => {
            const analysisName = a?.analysisName || a?.analysisType || a?.type || (typeof a === 'string' ? a : null);
            return analysisName;
        }).filter(Boolean);

        // Combine project analysisPath with DS agent's requiredAnalyses (prefer project analysisPath as it's more comprehensive)
        const allAnalyses = projectAnalyses.length > 0
            ? projectAnalyses
            : (dataScientistOpinion?.requiredAnalyses || []);

        if (allAnalyses.length > 0) {
            const analysisNames = allAnalyses
                .map((a: string) => a.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()))
                .join(', ');
            keyFindings.push(`Planned analyses: ${analysisNames}`);
            console.log(`📊 [PM Synthesis] Key findings include ${allAnalyses.length} analyses from ${projectAnalyses.length > 0 ? 'analysisPath' : 'DS opinion'}`);
        }
        if (dataScientistOpinion?.dataRequirements?.missing && dataScientistOpinion.dataRequirements.missing.length > 0) {
            keyFindings.push(`${dataScientistOpinion.dataRequirements.missing.length} missing data requirement${dataScientistOpinion.dataRequirements.missing.length > 1 ? 's' : ''} detected`);
        }

        // Business Agent: Report business context findings
        if (businessAgentOpinion?.businessValue) {
            keyFindings.push(`Business value assessment: ${businessAgentOpinion.businessValue}`);
        }

        // Fallback if no findings generated
        if (keyFindings.length === 0) {
            if (dataEngineerOpinion?.recommendations?.[0]) {
                keyFindings.push(dataEngineerOpinion.recommendations[0]);
            }
            if (dataScientistOpinion?.recommendations?.[0]) {
                keyFindings.push(dataScientistOpinion.recommendations[0]);
            }
            if (businessAgentOpinion?.recommendations?.[0]) {
                keyFindings.push(businessAgentOpinion.recommendations[0]);
            }
        }

        // Combine risks from all agents
        const combinedRisks: Array<{ source: string; risk: string; severity: 'high' | 'medium' | 'low' }> = [];

        if (dataEngineerOpinion?.issues) {
            dataEngineerOpinion.issues.forEach((issue: any) => {
                const severity = issue?.severity;
                const normalizedSeverity: 'high' | 'medium' | 'low' =
                    severity === 'high' || severity === 'low' ? severity : 'medium';

                combinedRisks.push({
                    source: 'Data Engineer',
                    risk: issue?.type || String(issue),
                    severity: normalizedSeverity
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

        // Generate actionable recommendations - deduplicated and specific
        const actionableRecommendations: string[] = [];
        const seenRecommendations = new Set<string>();

        const addUniqueRecommendation = (rec: string) => {
            const normalized = rec.toLowerCase().trim();
            if (!seenRecommendations.has(normalized) && rec.length > 10) {
                seenRecommendations.add(normalized);
                actionableRecommendations.push(rec);
            }
        };

        if (dataQuality === 'poor') {
            addUniqueRecommendation('Address data quality issues before proceeding with analysis');
        }

        if (dataEngineerOpinion?.recommendations && Array.isArray(dataEngineerOpinion.recommendations)) {
            dataEngineerOpinion.recommendations.slice(0, 2).forEach((r: string) => addUniqueRecommendation(r));
        }

        if (dataScientistOpinion?.recommendations && Array.isArray(dataScientistOpinion.recommendations)) {
            dataScientistOpinion.recommendations.slice(0, 2).forEach((r: string) => addUniqueRecommendation(r));
        }

        if (businessAgentOpinion?.recommendations && Array.isArray(businessAgentOpinion.recommendations)) {
            businessAgentOpinion.recommendations.slice(0, 2).forEach((r: string) => addUniqueRecommendation(r));
        }

        // If no recommendations from agents, generate context-aware ones
        if (actionableRecommendations.length === 0) {
            if (dataScientistOpinion?.requiredAnalyses?.length > 0) {
                addUniqueRecommendation(`Proceed with ${dataScientistOpinion.requiredAnalyses[0].replace(/_/g, ' ')} as primary analysis method`);
            }
            addUniqueRecommendation('Review data element mappings to ensure correct column assignments');
        }

        // Estimate timeline based on data size and complexity
        const rowCount = uploadedData.rowCount || uploadedData.data?.length || 0;
        const engineerEstimate = dataEngineerOpinion?.estimatedFixTime;
        let estimatedTimeline: string;

        if (typeof engineerEstimate === 'number') {
            estimatedTimeline = `${engineerEstimate} minutes`;
        } else if (typeof engineerEstimate === 'string' && /\d/.test(engineerEstimate)) {
            estimatedTimeline = engineerEstimate;
        } else {
            estimatedTimeline = rowCount > 100000
                ? '30-60 minutes'
                : rowCount > 10000
                    ? '10-30 minutes'
                    : '5-15 minutes';
        }

        const nextSteps = actionableRecommendations.slice(0, 3);
        if (nextSteps.length === 0) {
            nextSteps.push('Review agent outputs and define targeted follow-up actions');
        }

        // ✅ NEW: Generate early data mapping requirements for user review
        const dataMappingRequirements = this.generateMappingRequirements(uploadedData, userGoals, dataScientistOpinion);
        const dataQualityRequirements = this.generateDataQualityRequirements(uploadedData, dataEngineerOpinion);
        const requiredDataElements = this.extractRequiredDataElements(uploadedData, userGoals, dataScientistOpinion);
        const suggestedWorkflow = this.generateSuggestedWorkflow(userGoals, uploadedData, dataScientistOpinion);

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
            estimatedTimeline,
            estimatedCost: businessAgentOpinion?.expectedROI || 'To be determined',
            nextSteps,
            // ✅ Early data requirements for user to review and plan immediately
            dataMappingRequirements,
            dataQualityRequirements,
            requiredDataElements,
            suggestedWorkflow
        };
    }

    /**
     * Generate data mapping requirements based on user goals and data scientist recommendations
     */
    private generateMappingRequirements(
        uploadedData: any,
        userGoals: string[],
        dataScientistOpinion: any
    ): FieldMappingRequirement[] {
        const requirements: FieldMappingRequirement[] = [];

        // Extract required fields from data scientist opinion
        if (dataScientistOpinion?.requiredDataElements) {
            dataScientistOpinion.requiredDataElements.forEach((element: any) => {
                requirements.push({
                    sourceField: element.name || element.field || element,
                    sourceType: element.type || 'unknown',
                    targetField: element.name || element.field || element,
                    targetType: element.type || 'unknown',
                    transformationRequired: !!element.transformation,
                    transformationDescription: element.transformation
                });
            });
        }

        // If no specific requirements, generate based on goals
        if (requirements.length === 0 && userGoals.length > 0) {
            // Extract key terms from goals to suggest field requirements
            const goalText = userGoals.join(' ').toLowerCase();

            // Common business analysis patterns
            if (goalText.includes('time') || goalText.includes('trend') || goalText.includes('date')) {
                requirements.push({
                    sourceField: 'timestamp/date',
                    sourceType: 'datetime',
                    targetField: 'analysis_date',
                    targetType: 'datetime',
                    transformationRequired: false,
                    transformationDescription: 'Time-based analysis and trends'
                });
            }
            if (goalText.includes('customer') || goalText.includes('user')) {
                requirements.push({
                    sourceField: 'customer_id/user_id',
                    sourceType: 'string',
                    targetField: 'customer_id',
                    targetType: 'string',
                    transformationRequired: false,
                    transformationDescription: 'Customer segmentation and analysis'
                });
            }
            if (goalText.includes('revenue') || goalText.includes('sales') || goalText.includes('price')) {
                requirements.push({
                    sourceField: 'revenue/amount',
                    sourceType: 'numeric',
                    targetField: 'revenue_amount',
                    targetType: 'numeric',
                    transformationRequired: false,
                    transformationDescription: 'Financial analysis'
                });
            }
        }

        return requirements;
    }

    /**
     * Generate data quality requirements based on data engineer recommendations
     */
    private generateDataQualityRequirements(
        uploadedData: any,
        dataEngineerOpinion: any
    ): DataQualityRequirement[] {
        const requirements: DataQualityRequirement[] = [];

        // Extract quality issues from data engineer opinion
        if (dataEngineerOpinion?.issues) {
            dataEngineerOpinion.issues.forEach((issue: any) => {
                const severity = issue.severity || 'medium';
                const impact = severity === 'critical' || severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low';

                requirements.push({
                    field: issue.field || 'general',
                    currentQuality: severity === 'critical' ? 'poor' : severity === 'high' ? 'acceptable' : 'good',
                    issues: [issue.message || issue],
                    requiredActions: [issue.recommendation || 'Review and address data quality issue'],
                    impact: impact as 'high' | 'medium' | 'low'
                });
            });
        }

        // Add standard quality requirements if none specified
        if (requirements.length === 0) {
            requirements.push(
                {
                    field: 'all_records',
                    currentQuality: 'acceptable',
                    issues: ['Potential duplicate records'],
                    requiredActions: ['Remove duplicate records'],
                    impact: 'high'
                },
                {
                    field: 'all_fields',
                    currentQuality: 'acceptable',
                    issues: ['Missing values present'],
                    requiredActions: ['Handle missing values appropriately'],
                    impact: 'high'
                }
            );
        }

        return requirements;
    }

    /**
     * Extract required data elements from user goals and analysis requirements
     */
    private extractRequiredDataElements(
        uploadedData: any,
        userGoals: string[],
        dataScientistOpinion: any
    ): Array<{
        name: string;
        description: string;
        type: string;
        required: boolean;
        source?: string;
        availableInDataset: boolean;
    }> {
        const elements: Array<{
            name: string;
            description: string;
            type: string;
            required: boolean;
            source?: string;
            availableInDataset: boolean;
        }> = [];

        // Extract from data scientist opinion
        if (dataScientistOpinion?.requiredDataElements) {
            dataScientistOpinion.requiredDataElements.forEach((element: any) => {
                elements.push({
                    name: element.name || element.field || element,
                    description: element.description || element.purpose || 'Required for analysis',
                    type: element.type || 'unknown',
                    required: element.required !== false,
                    source: element.source,
                    availableInDataset: false // Will be checked against actual dataset later
                });
            });
        }

        // If no specific elements, infer from goals
        if (elements.length === 0) {
            const goalText = userGoals.join(' ').toLowerCase();

            // Common data elements for business analysis
            if (goalText.includes('time') || goalText.includes('trend')) {
                elements.push({
                    name: 'Date/Time',
                    description: 'Required for temporal analysis',
                    type: 'datetime',
                    required: true,
                    availableInDataset: false
                });
            }
            if (goalText.includes('customer') || goalText.includes('user')) {
                elements.push({
                    name: 'Customer ID',
                    description: 'Required for customer analysis',
                    type: 'identifier',
                    required: true,
                    availableInDataset: false
                });
            }
            if (goalText.includes('amount') || goalText.includes('revenue') || goalText.includes('cost')) {
                elements.push({
                    name: 'Amount/Value',
                    description: 'Required for financial analysis',
                    type: 'numeric',
                    required: true,
                    availableInDataset: false
                });
            }
        }

        return elements;
    }

    /**
     * Generate suggested workflow based on user goals and data characteristics
     */
    private generateSuggestedWorkflow(
        userGoals: string[],
        uploadedData: any,
        dataScientistOpinion: any
    ): Array<{
        stepNumber: number;
        stepName: string;
        description: string;
        dependencies: number[];
        estimatedDuration: string;
        requiredData: string[];
    }> {
        const workflow: Array<{
            stepNumber: number;
            stepName: string;
            description: string;
            dependencies: number[];
            estimatedDuration: string;
            requiredData: string[];
        }> = [];

        // Standard workflow phases
        workflow.push(
            {
                stepNumber: 1,
                stepName: 'Data Upload & Validation',
                description: 'Upload dataset and validate schema',
                dependencies: [],
                estimatedDuration: '5-10 minutes',
                requiredData: []
            },
            {
                stepNumber: 2,
                stepName: 'Data Quality Assessment',
                description: 'Assess data quality, identify issues',
                dependencies: [1],
                estimatedDuration: '10-15 minutes',
                requiredData: ['uploaded_dataset']
            },
            {
                stepNumber: 3,
                stepName: 'Data Preparation',
                description: 'Clean, transform, and prepare data',
                dependencies: [2],
                estimatedDuration: '15-30 minutes',
                requiredData: ['uploaded_dataset', 'quality_assessment']
            }
        );

        // Add analysis-specific phases based on data scientist recommendations
        if (dataScientistOpinion?.requiredAnalyses) {
            const analyses = Array.isArray(dataScientistOpinion.requiredAnalyses)
                ? dataScientistOpinion.requiredAnalyses
                : [];

            if (analyses.length > 0) {
                workflow.push({
                    stepNumber: 4,
                    stepName: 'Analysis Execution',
                    description: `Execute ${analyses.length} analysis type(s): ${analyses.slice(0, 3).join(', ')}`,
                    dependencies: [3],
                    estimatedDuration: '20-40 minutes',
                    requiredData: ['prepared_dataset']
                });
            }
        } else {
            workflow.push({
                stepNumber: 4,
                stepName: 'Analysis Execution',
                description: 'Execute planned analyses',
                dependencies: [3],
                estimatedDuration: '20-40 minutes',
                requiredData: ['prepared_dataset']
            });
        }

        workflow.push(
            {
                stepNumber: 5,
                stepName: 'Results Review',
                description: 'Review results and generate insights',
                dependencies: [4],
                estimatedDuration: '10-15 minutes',
                requiredData: ['analysis_results']
            },
            {
                stepNumber: 6,
                stepName: 'Export & Delivery',
                description: 'Export results and artifacts',
                dependencies: [5],
                estimatedDuration: '5-10 minutes',
                requiredData: ['reviewed_results']
            }
        );

        return workflow;
    }

    // ==========================================
    // DECISION AUDIT TRAIL (Phase 4 - Task 4.4)
    // ==========================================

    /**
     * Log a decision to the audit trail
     */
    async logDecision(
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
    ): Promise<DecisionAuditRecord> {
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

        // Persist to database
        try {
            await db.insert(decisionAudits).values({
                id: auditRecord.auditId,
                projectId: auditRecord.projectId,
                agent: auditRecord.decisionMaker,
                decisionType: auditRecord.decisionType,
                decision: typeof auditRecord.decision === 'string' ? auditRecord.decision : JSON.stringify(auditRecord.decision),
                reasoning: auditRecord.rationale || '',
                alternatives: auditRecord.alternatives || [],
                confidence: auditRecord.confidence || 100,
                context: auditRecord.executionContext || {},
                userInput: null,
                impact: 'medium',
                reversible: true,
                timestamp: auditRecord.timestamp
            });
        } catch (error) {
            console.error('Failed to persist decision audit:', error);
        }

        // Keep in memory for quick access (optional, but good for consistency)
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
            // FIX A5: Accept requirementsDocument for element-aware transformation recommendations
            requirementsDocument?: any;
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

            const { columnCount, dataSize, fieldTypes, requirementsDocument } = dataCharacteristics;

            // FIX A5: Use element definitions to generate more accurate transformation recommendations
            if (requirementsDocument?.requiredDataElements) {
                const elements = requirementsDocument.requiredDataElements;
                const elementsNeedingTransform = elements.filter((el: any) =>
                    el.transformationRequired ||
                    (el.calculationDefinition?.calculationType &&
                     ['derived', 'aggregated', 'grouped', 'composite'].includes(el.calculationDefinition.calculationType))
                );
                if (elementsNeedingTransform.length > 0) {
                    console.log(`[PM Agent] ${elementsNeedingTransform.length}/${elements.length} elements require transformation based on DS/BA definitions`);
                }
            }

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
        audience?: { primary?: string; secondary?: string[]; decisionContext?: string };
        industry?: string;
        availableColumns?: string[];
    }): Promise<{
        summary: string;
        understoodGoals: string[];
        clarifyingQuestions: Array<{ question: string; reason: string }>;
        suggestedFocus: string[];
        identifiedGaps: string[];
        requiredDataAndTransformations: string[];
        artifactPlan: {
            interactiveDashboard: string;
            powerPointDeck: string;
            restApiExport: string;
            pdfReport: string;
        };
    }> {
        console.log(`≡ƒñû PM Agent: Clarifying user goals...`);
        console.log(`≡ƒô¥ Goal: ${input.analysisGoal.substring(0, 100)}...`);

        // Build the prompt for goal clarification (provider-agnostic)
        const prompt = `You are the Analytics Project Manager AI orchestrator. Your mission is to deeply understand the user's needs, coordinate with the Business Agent, Data Scientist, and Data Engineer, and keep the user engaged at every checkpoint while shaping a clear analysis plan.

**User's Journey Type**: ${input.journeyType}
**Industry (if known)**: ${input.industry || 'not provided'}
**Audience**: primary=${input.audience?.primary || 'not provided'}; secondary=${(input.audience?.secondary || []).join(', ') || 'none'}; decisionContext=${input.audience?.decisionContext || 'not provided'}
**Available Data Columns**: ${(input.availableColumns || []).slice(0, 25).join(', ') || 'not provided'}

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
    - Data availability or missing fields needed (reference provided columns if helpful)
    - What constraints or requirements exist (timeline, data limitations, etc.)
4. **Suggest focus areas** that align with their goals
5. **Identify any gaps** in their goal statement that need more detail
6. **List the required data elements and transformations** the team (Business Agent, Data Scientist, Data Engineer) must secure or perform to satisfy the clarified goal
7. **Confirm the expected audience-ready artifacts** (interactive dashboard, PowerPoint deck, REST API export, PDF report) and when user approval is needed for each

Guardrails:
- Do NOT promise unsupported capabilities (no external live DB connectors, no custom API-key execution, no real-time streaming dashboards beyond the listed artifacts).
- Keep language concise and user-approachable.

Respond in JSON format:
{
  "summary": "Your 2-3 sentence summary here",
  "understoodGoals": ["Goal 1", "Goal 2", "Goal 3"],
  "clarifyingQuestions": [
    {"question": "Question 1?", "reason": "Why this helps"},
    {"question": "Question 2?", "reason": "Why this helps"}
  ],
  "suggestedFocus": ["Focus area 1", "Focus area 2"],
    "identifiedGaps": ["Gap 1", "Gap 2"],
    "requiredDataAndTransformations": ["Data element or transformation 1", "Data element or transformation 2"],
    "artifactPlan": {
        "interactiveDashboard": "How and when it will be produced + user touchpoint",
        "powerPointDeck": "How and when it will be produced + user touchpoint",
        "restApiExport": "How and when it will be produced + user touchpoint",
        "pdfReport": "How and when it will be produced + user touchpoint"
    }
}

Be conversational, helpful, and specific. Tailor your questions to the ${input.journeyType} journey type.`;

        // AI Provider Fallback Cascade: Google Gemini → OpenAI → Anthropic
        // If all providers fail, falls through to the static fallback below.
        let text: string | null = null;
        const providerErrors: string[] = [];

        const isPlaceholderKey = (key: string | undefined) =>
            !key || key.includes('your_') || key.includes('_here') || key.length < 20;

        // 1. Try Google Gemini (primary)
        if (!text && !isPlaceholderKey(process.env.GOOGLE_AI_API_KEY)) {
            try {
                const { GoogleGenerativeAI } = await import('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
                const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                const result = await model.generateContent(prompt);
                text = result.response.text();
                console.log(`[PM Agent] Goal clarification via Google Gemini`);
            } catch (geminiErr: any) {
                providerErrors.push(`Gemini: ${geminiErr.message}`);
                console.warn(`[PM Agent] Google Gemini failed: ${geminiErr.message}`);
            }
        }

        // 2. Try OpenAI
        if (!text && !isPlaceholderKey(process.env.OPENAI_API_KEY)) {
            try {
                const { default: OpenAI } = await import('openai');
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                });
                text = completion.choices?.[0]?.message?.content || null;
                console.log(`[PM Agent] Goal clarification via OpenAI`);
            } catch (openaiErr: any) {
                providerErrors.push(`OpenAI: ${openaiErr.message}`);
                console.warn(`[PM Agent] OpenAI failed: ${openaiErr.message}`);
            }
        }

        // 3. Try Anthropic Claude
        if (!text && !isPlaceholderKey(process.env.ANTHROPIC_API_KEY)) {
            try {
                const { default: Anthropic } = await import('@anthropic-ai/sdk');
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                const message = await anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 4096,
                    messages: [{ role: 'user', content: prompt }],
                });
                // Fix: Properly access text content from Anthropic response
                const contentBlock = message.content[0];
                text = contentBlock.type === 'text' ? contentBlock.text : null;
                console.log(`[PM Agent] Goal clarification via Anthropic Claude`);
            } catch (anthropicErr: any) {
                providerErrors.push(`Anthropic: ${anthropicErr.message}`);
                console.warn(`[PM Agent] Anthropic failed: ${anthropicErr.message}`);
            }
        }

        if (providerErrors.length > 0) {
            console.error(`[PM Agent] All attempted providers failed:\n  ${providerErrors.join('\n  ')}`);
        }

        // If no AI provider succeeded, use context-aware fallback that acknowledges user input
        if (!text) {
            console.warn(`[PM Agent] No AI provider available - using context-aware fallback clarification`);

            const goals = input.analysisGoal.split(/[.\n]/).filter((g: string) => g.trim()).slice(0, 5);
            const hasAudience = !!(input.audience?.primary);
            const hasQuestions = !!(input.businessQuestions && input.businessQuestions.trim());
            const hasDecisionContext = !!(input.audience?.decisionContext);

            // Build context-aware clarifying questions (only ask what's NOT already provided)
            const clarifyingQuestions: Array<{ question: string; reason: string }> = [];
            if (!hasQuestions) {
                clarifyingQuestions.push({
                    question: 'What specific metrics or KPIs are most important for your analysis?',
                    reason: 'This helps me prioritize the right analyses for your goals'
                });
            }
            if (!hasAudience) {
                clarifyingQuestions.push({
                    question: 'Who is the primary audience for these insights?',
                    reason: 'This helps me format results appropriately for your stakeholders'
                });
            }
            if (!hasDecisionContext) {
                clarifyingQuestions.push({
                    question: 'What decision will this analysis help you make?',
                    reason: 'This helps me focus on actionable insights rather than generic reporting'
                });
            }
            // If user provided everything, ask deeper follow-up questions
            if (clarifyingQuestions.length === 0) {
                const firstGoal = goals[0]?.trim().substring(0, 80) || 'your analysis goal';
                clarifyingQuestions.push({
                    question: `For "${firstGoal}", what threshold or benchmark would indicate success?`,
                    reason: 'Defining success criteria helps me set analysis targets and meaningful comparisons'
                });
            }

            const identifiedGaps: string[] = [];
            if (!hasAudience) identifiedGaps.push('Target audience details');
            if (!hasDecisionContext) identifiedGaps.push('Decision context');
            if (!hasQuestions) identifiedGaps.push('Specific business questions');

            // Build summary that reflects what we understood
            const summaryParts = [`I understand you want to: ${input.analysisGoal}`];
            if (hasAudience) summaryParts.push(`Your primary audience is ${input.audience?.primary}.`);
            if (hasQuestions) summaryParts.push('I see you have specific business questions to address.');

            return {
                summary: summaryParts.join(' '),
                understoodGoals: goals.map((g: string) => g.trim()).filter((g: string) => g),
                clarifyingQuestions,
                suggestedFocus: goals.slice(0, 3).map((g: string) => g.trim()).filter((g: string) => g),
                identifiedGaps: identifiedGaps.length > 0 ? identifiedGaps : ['Additional context would strengthen the analysis'],
                requiredDataAndTransformations: [
                    'Identify datasets and columns matching your goals',
                    'Determine necessary data transformations based on analysis requirements'
                ],
                artifactPlan: {
                    interactiveDashboard: 'Draft dashboard requirements once data readiness is confirmed and review with the user.',
                    powerPointDeck: 'Outline presentation structure and align with the user before final build.',
                    restApiExport: 'Verify if an API export is required, including schema and delivery timeline, with the user.',
                    pdfReport: 'Plan a PDF summary and confirm narrative focus with the user before finalizing.'
                }
            };
        }

        try {

            // Parse JSON response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('[PM Agent] Failed to find JSON in response:', text);
                throw new Error('Could not parse AI response as JSON');
            }

            const clarification = JSON.parse(jsonMatch[0]);

            console.log(`Γ£à PM Agent: Generated ${clarification.clarifyingQuestions.length} clarifying questions`);

            return {
                summary: clarification.summary || 'Unable to generate summary',
                understoodGoals: clarification.understoodGoals || [],
                clarifyingQuestions: clarification.clarifyingQuestions || [],
                suggestedFocus: clarification.suggestedFocus || [],
                identifiedGaps: clarification.identifiedGaps || [],
                requiredDataAndTransformations: clarification.requiredDataAndTransformations || [],
                artifactPlan: {
                    interactiveDashboard: clarification.artifactPlan?.interactiveDashboard || 'Confirm dashboard layout, data refresh cadence, and approval touchpoint with the user.',
                    powerPointDeck: clarification.artifactPlan?.powerPointDeck || 'Capture slide expectations and schedule review with the user.',
                    restApiExport: clarification.artifactPlan?.restApiExport || 'Clarify required API schema, authentication, and delivery timeline with the user.',
                    pdfReport: clarification.artifactPlan?.pdfReport || 'Define narrative outline and distribution plan with the user.'
                }
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
                identifiedGaps: ['Specific success criteria', 'Timeline expectations'],
                requiredDataAndTransformations: ['Confirm required datasets and metrics', 'Document necessary data transformations or feature engineering steps'],
                artifactPlan: {
                    interactiveDashboard: 'Draft dashboard requirements once data readiness is confirmed and review with the user.',
                    powerPointDeck: 'Outline presentation structure and align with the user before final build.',
                    restApiExport: 'Verify if an API export is required, including schema and delivery timeline, with the user.',
                    pdfReport: 'Plan a PDF summary and confirm narrative focus with the user before finalizing.'
                }
            };
        }
    }

    // ==========================================
    // [DAY 9] FOLLOW-UP QUESTION HANDLER
    // ==========================================

    /**
     * Handle follow-up questions from users on the project page
     * Routes questions through PM agent intelligence
     */
    async handleFollowUpQuestion(request: {
        projectId: string;
        userId: string;
        question: string;
        projectContext: {
            projectName: string;
            journeyType: string;
            currentStep: string;
            completedSteps: string[];
            datasetCount: number;
            totalRows: number;
            hasAnalysisResults: boolean;
            userQuestions?: string[];
            questionAnswers?: any[];
            userProvidedContext?: string;
        };
        analysisResults: any;
    }): Promise<{
        answer: string;
        confidence: number;
        sources: string[];
        relatedInsights?: any[];
        suggestedFollowUps?: string[];
    }> {
        console.log(`🤖 [PM Agent] Processing follow-up question for project ${request.projectId}`);

        const { question, projectContext, analysisResults } = request;
        const lowercaseQ = question.toLowerCase();

        // Analyze question intent
        const intent = this.analyzeQuestionIntent(lowercaseQ);
        console.log(`🎯 [PM Agent] Detected intent: ${intent}`);

        // Generate response based on intent and available data
        switch (intent) {
            case 'status':
                return this.generateStatusResponse(projectContext);

            case 'insights':
                return this.generateInsightsResponse(analysisResults, projectContext);

            case 'recommendations':
                return this.generateRecommendationsResponse(analysisResults, projectContext);

            case 'data_quality':
                return this.generateDataQualityResponse(projectContext, analysisResults);

            case 'next_steps':
                return this.generateNextStepsResponse(projectContext, analysisResults);

            case 'comparison':
                return this.generateComparisonResponse(question, analysisResults);

            case 'explanation':
                return this.generateExplanationResponse(question, analysisResults, projectContext);

            default:
                return this.generateGeneralResponse(question, projectContext, analysisResults);
        }
    }

    private analyzeQuestionIntent(question: string): string {
        // Status queries
        if (question.includes('status') || question.includes('progress') ||
            question.includes('where am i') || question.includes('what step')) {
            return 'status';
        }

        // Insight queries
        if (question.includes('insight') || question.includes('finding') ||
            question.includes('discover') || question.includes('learn')) {
            return 'insights';
        }

        // Recommendation queries
        if (question.includes('recommend') || question.includes('suggest') ||
            question.includes('should i') || question.includes('advice')) {
            return 'recommendations';
        }

        // Data quality queries
        if (question.includes('quality') || question.includes('data issue') ||
            question.includes('missing') || question.includes('clean')) {
            return 'data_quality';
        }

        // Next steps queries
        if (question.includes('next') || question.includes('what now') ||
            question.includes('then what') || question.includes('after this')) {
            return 'next_steps';
        }

        // Comparison queries
        if (question.includes('compare') || question.includes('difference') ||
            question.includes('vs') || question.includes('versus')) {
            return 'comparison';
        }

        // Explanation queries
        if (question.includes('why') || question.includes('how') ||
            question.includes('explain') || question.includes('what does')) {
            return 'explanation';
        }

        return 'general';
    }

    private generateStatusResponse(context: any): any {
        const completedCount = context.completedSteps?.length || 0;
        const totalSteps = ['prepare', 'data-upload', 'data-verification', 'transformation', 'plan', 'execute', 'results'].length;
        const progressPercent = Math.round((completedCount / totalSteps) * 100);

        return {
            answer: `Your project "${context.projectName}" is currently at the **${context.currentStep}** step.

**Progress**: ${completedCount}/${totalSteps} steps completed (${progressPercent}%)
**Data**: ${context.datasetCount} dataset(s) with ~${context.totalRows.toLocaleString()} rows
**Analysis**: ${context.hasAnalysisResults ? 'Results available' : 'Pending analysis'}

${context.completedSteps?.length > 0 ? `**Completed**: ${context.completedSteps.join(' → ')}` : ''}`,
            confidence: 0.95,
            sources: ['project_metadata', 'journey_progress'],
            suggestedFollowUps: [
                'What should I do next?',
                'Show me the key insights',
                'How is my data quality?'
            ]
        };
    }

    private generateInsightsResponse(results: any, context: any): any {
        const insights = results.insights || [];

        if (insights.length === 0) {
            return {
                answer: `No analysis insights have been generated yet for "${context.projectName}". ${context.currentStep === 'execute' ? 'The analysis is currently running.' : 'Please complete the analysis execution step to generate insights.'}`,
                confidence: 0.9,
                sources: ['analysis_status'],
                suggestedFollowUps: [
                    'How do I start the analysis?',
                    'What data do I need?',
                    'What is my current progress?'
                ]
            };
        }

        const topInsights = insights.slice(0, 5);
        const insightList = topInsights.map((i: any, idx: number) =>
            `${idx + 1}. **${i.title || 'Insight'}**: ${i.description || i.summary || i}`
        ).join('\n');

        return {
            answer: `Here are the key insights from your analysis of "${context.projectName}":\n\n${insightList}\n\n${insights.length > 5 ? `...and ${insights.length - 5} more insights available.` : ''}`,
            confidence: 0.9,
            sources: ['analysis_insights'],
            relatedInsights: topInsights,
            suggestedFollowUps: [
                'Can you explain the first insight in more detail?',
                'What should I do based on these findings?',
                'Are there any concerning patterns?'
            ]
        };
    }

    private generateRecommendationsResponse(results: any, context: any): any {
        const recommendations = results.recommendations || [];

        if (recommendations.length === 0) {
            return {
                answer: `No specific recommendations have been generated yet. ${context.hasAnalysisResults ? 'The analysis completed but no actionable recommendations were identified.' : 'Please complete the analysis to get recommendations.'}`,
                confidence: 0.85,
                sources: ['analysis_status'],
                suggestedFollowUps: [
                    'Show me what analysis has been done',
                    'What insights are available?',
                    'How can I improve my data?'
                ]
            };
        }

        const topRecs = recommendations.slice(0, 5);
        const recList = topRecs.map((r: any, idx: number) =>
            `${idx + 1}. ${r.title || r.action || r}${r.priority ? ` (Priority: ${r.priority})` : ''}`
        ).join('\n');

        return {
            answer: `Based on your analysis, here are the recommended actions:\n\n${recList}`,
            confidence: 0.88,
            sources: ['analysis_recommendations'],
            suggestedFollowUps: [
                'Which recommendation should I prioritize?',
                'What are the expected outcomes?',
                'How long will implementation take?'
            ]
        };
    }

    private generateDataQualityResponse(context: any, results: any): any {
        const quality = results.dataQuality || context.dataQuality || {};
        const overallScore = quality.overallScore || quality.score || 'Not yet assessed';
        const issuesSummary = quality.issues?.length > 0
            ? `**Issues Found**: ${quality.issues.length}\n${quality.issues.slice(0, 3).map((i: any) => `- ${i.description || i}`).join('\n')}`
            : 'No significant quality issues detected.';

        return {
            answer: `Data quality summary for "${context.projectName}":\n\n**Overall Score**: ${overallScore}%\n**Datasets**: ${context.datasetCount} dataset(s)\n**Total Records**: ${context.totalRows.toLocaleString()} rows\n\n${issuesSummary}`,
            confidence: 0.85,
            sources: ['data_quality_assessment'],
            suggestedFollowUps: [
                'How can I fix these issues?',
                'Will these issues affect my analysis?',
                'What transformations do you recommend?'
            ]
        };
    }

    private generateNextStepsResponse(context: any, results: any): any {
        const stepOrder = ['prepare', 'data-upload', 'data-verification', 'transformation', 'plan', 'execute', 'results'];
        const currentIdx = stepOrder.indexOf(context.currentStep);
        const nextStep = currentIdx >= 0 && currentIdx < stepOrder.length - 1
            ? stepOrder[currentIdx + 1]
            : null;

        let nextStepDescription = '';
        switch (nextStep) {
            case 'data-upload': nextStepDescription = 'Upload your dataset(s) for analysis'; break;
            case 'data-verification': nextStepDescription = 'Verify data quality and schema'; break;
            case 'transformation': nextStepDescription = 'Apply data transformations'; break;
            case 'plan': nextStepDescription = 'Review and approve the analysis plan'; break;
            case 'execute': nextStepDescription = 'Execute the analysis'; break;
            case 'results': nextStepDescription = 'Review your analysis results'; break;
            default: nextStepDescription = 'Your analysis journey is complete!';
        }

        const completionMessage = context.hasAnalysisResults && !nextStep
            ? '\n\nYour analysis is complete. You can:\n- Download reports\n- Ask questions about your data\n- Start a new analysis'
            : '';

        return {
            answer: `**Current Step**: ${context.currentStep}\n**Next Step**: ${nextStep || 'Complete!'}\n\n${nextStepDescription}${completionMessage}`,
            confidence: 0.9,
            sources: ['journey_state'],
            suggestedFollowUps: nextStep ? [
                `What do I need for the ${nextStep} step?`,
                'Can you explain what happens next?',
                'How long will this take?'
            ] : [
                'Can I export my results?',
                'How do I share these insights?',
                'Can I run additional analysis?'
            ]
        };
    }

    private generateComparisonResponse(question: string, results: any): any {
        return {
            answer: 'I can help you compare data elements. Based on your analysis results, I see patterns that could be compared. However, I need more specific information about what you\'d like to compare.\n\nWould you like to compare:\n- Different time periods\n- Different segments or categories\n- Metrics against benchmarks\n- Before and after a specific event',
            confidence: 0.7,
            sources: ['question_analysis'],
            suggestedFollowUps: [
                'Compare sales by region',
                'Compare this month vs last month',
                'Compare top performers vs average'
            ]
        };
    }

    private generateExplanationResponse(question: string, results: any, context: any): any {
        // Try to extract what needs explaining
        const insights = results.insights || [];
        const firstInsight = insights[0];
        const insightText = firstInsight
            ? `The most significant finding is: **${firstInsight.title || 'Key Pattern'}**\n${firstInsight.description || firstInsight.summary || 'This pattern was identified in your data analysis.'}`
            : 'Your analysis is still in progress. Once complete, I can explain the findings in detail.';

        return {
            answer: `I'll help explain your analysis results for "${context.projectName}".\n\n${insightText}\n\nWhat specific aspect would you like me to explain?`,
            confidence: 0.75,
            sources: ['analysis_context'],
            relatedInsights: insights.slice(0, 3),
            suggestedFollowUps: [
                'Why is this pattern significant?',
                'What caused this trend?',
                'How confident are you in this finding?'
            ]
        };
    }

    private generateGeneralResponse(question: string, context: any, results: any): any {
        const analysisStatus = context.hasAnalysisResults ? 'Complete' : 'In progress';
        const helpTopics = [
            '- **Insights**: "What are the key findings?"',
            '- **Recommendations**: "What should I do next?"',
            '- **Data Quality**: "How is my data quality?"',
            '- **Progress**: "What step am I on?"',
            '- **Explanations**: "Why did this happen?"'
        ].join('\n');

        return {
            answer: `I'm your AI assistant for the "${context.projectName}" project. Based on your question, here's what I can tell you:\n\n**Project Status**: ${context.currentStep} step, ${context.datasetCount} dataset(s)\n**Analysis**: ${analysisStatus}\n\nI can help you with:\n${helpTopics}\n\nPlease ask a more specific question for detailed information.`,
            confidence: 0.7,
            sources: ['general_context'],
            suggestedFollowUps: [
                'What are the key insights from my analysis?',
                'What should I do next?',
                'How can I improve my data quality?'
            ]
        };
    }

    // ==========================================
    // ✅ FIX 3.1: ORCHESTRATION PROGRESS HELPERS
    // ==========================================

    /**
     * Emit orchestration progress event for real-time UI updates
     * Part of Fix 3.1 - Sequential agent orchestration
     */
    private emitOrchestrationProgress(projectId: string, progress: {
        phase: number;
        agent: string;
        status: 'in_progress' | 'complete' | 'failed';
        message: string;
        result?: any;
        dependsOn?: any;
    }): void {
        try {
            const broker = getMessageBroker();

            broker.emit('agent:orchestration_progress', {
                projectId,
                ...progress,
                timestamp: new Date().toISOString()
            });

            console.log(`📡 [PM Orchestration] Phase ${progress.phase} - ${progress.agent}: ${progress.status} - ${progress.message}`);
        } catch (error) {
            // Non-critical - log but don't throw
            console.warn('[PM Orchestration] Failed to emit progress:', error);
        }
    }

    /**
     * Orchestrate full analysis workflow with sequential dependencies
     * This is the recommended entry point for coordinated agent workflows
     * Part of Fix 3.1
     */
    // P0-D FIX: Track active orchestrations to prevent concurrent execution
    private activeOrchestrations: Map<string, { startedAt: Date }> = new Map();

    async orchestrateAnalysisWorkflow(
        projectId: string,
        uploadedData: any[],
        userGoals: string[],
        industry?: string
    ): Promise<{
        qualityReport: any;
        requirements: any;
        transformationPlan: any;
        businessValidation: any;
        orchestrationComplete: boolean;
        timestamp: string;
    }> {
        // P0-D FIX: Prevent concurrent orchestrations for the same project
        if (this.activeOrchestrations.has(projectId)) {
            const active = this.activeOrchestrations.get(projectId)!;
            const elapsedMs = Date.now() - active.startedAt.getTime();
            // Allow re-entry only if previous orchestration is stale (> 5 min)
            if (elapsedMs < 300000) {
                console.warn(`⚠️ [PM Orchestration] Concurrent orchestration blocked for project ${projectId} (started ${elapsedMs}ms ago)`);
                throw new Error(`Orchestration already in progress for project ${projectId}. Please wait.`);
            }
            console.warn(`⚠️ [PM Orchestration] Stale orchestration detected for project ${projectId} (${elapsedMs}ms), allowing re-entry`);
        }

        this.activeOrchestrations.set(projectId, { startedAt: new Date() });

        const safeGoals = userGoals || ['General analysis'];
        // Use provided industry or default to 'general'
        const effectiveIndustry = industry || 'general';

        console.log(`🎯 [PM Orchestration] Starting full analysis workflow for project ${projectId}`);

        try {

            // Phase 1: Data Engineer assesses data quality (no dependencies)
            console.log(`📊 [Phase 1] Data Engineer: Assessing data quality...`);
            const qualityReport = await this.queryDataEngineer(projectId, uploadedData);

            this.emitOrchestrationProgress(projectId, {
                phase: 1,
                agent: 'data_engineer',
                status: 'complete',
                message: 'Data quality assessment complete',
                result: qualityReport
            });

            // Phase 2: Data Scientist generates requirements (depends on quality report)
            console.log(`🔬 [Phase 2] Data Scientist: Generating analysis requirements...`);
            const enhancedData = {
                ...uploadedData,
                qualityReport: qualityReport.opinion,
                dataQuality: qualityReport.opinion?.overallScore || 0.7
            };

            const requirements = await this.queryDataScientist(projectId, enhancedData, safeGoals);

            this.emitOrchestrationProgress(projectId, {
                phase: 2,
                agent: 'data_scientist',
                status: 'complete',
                message: `Generated ${(requirements.opinion as any)?.analysisPath?.length || 0} analysis recommendations`,
                result: requirements
            });

            // Phase 3: Data Engineer plans transformations (depends on requirements)
            console.log(`🔧 [Phase 3] Data Engineer: Planning transformations...`);
            const transformationPlan = await this.planTransformationsFromRequirements(
                projectId,
                uploadedData,
                requirements.opinion
            );

            this.emitOrchestrationProgress(projectId, {
                phase: 3,
                agent: 'data_engineer',
                status: 'complete',
                message: `Planned ${transformationPlan?.steps?.length || 0} transformations`,
                result: transformationPlan
            });

            // Phase 4: Business Agent validates alignment (depends on all previous phases)
            console.log(`💼 [Phase 4] Business Agent: Validating business alignment...`);
            const businessContextData = {
                ...uploadedData,
                qualityReport: qualityReport.opinion,
                analysisRequirements: requirements.opinion,
                transformationPlan
            };

            const businessValidation = await this.queryBusinessAgent(projectId, businessContextData, safeGoals, effectiveIndustry);

            this.emitOrchestrationProgress(projectId, {
                phase: 4,
                agent: 'business_agent',
                status: 'complete',
                message: (businessValidation.opinion as any)?.approved !== false
                    ? 'Business alignment validated'
                    : 'Needs review',
                result: businessValidation
            });

            console.log(`✅ [PM Orchestration] Full workflow complete for project ${projectId}`);

            this.activeOrchestrations.delete(projectId);

            return {
                qualityReport: qualityReport.opinion,
                requirements: requirements.opinion,
                transformationPlan,
                businessValidation: businessValidation.opinion,
                orchestrationComplete: true,
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
            // P0-D FIX: On failure, clear lock and persist error state to journeyProgress
            this.activeOrchestrations.delete(projectId);
            console.error(`❌ [PM Orchestration] Workflow failed for project ${projectId}:`, error.message);

            try {
                await storage.atomicMergeJourneyProgress(projectId, {
                    orchestrationStatus: 'error',
                    orchestrationError: error.message,
                    orchestrationFailedAt: new Date().toISOString()
                });
            } catch (persistError) {
                console.error(`❌ [PM Orchestration] Failed to persist error state:`, persistError);
            }

            throw error;
        }
    }

    /**
     * Plan transformations based on Data Scientist requirements
     * Helper for orchestrateAnalysisWorkflow - Part of Fix 3.1
     */
    private async planTransformationsFromRequirements(
        projectId: string,
        data: any,
        requirements: any
    ): Promise<any> {
        try {
            // Extract required data elements from DS requirements
            const requiredElements = requirements?.requiredDataElements || [];
            const analysisPath = requirements?.analysisPath || [];

            // Build transformation steps from required elements
            const steps: Array<{
                stepId: string;
                sourceColumn: string;
                targetElement: string;
                transformationType: string;
                logic: string;
            }> = [];

            // Map required elements to transformation steps
            for (const element of requiredElements) {
                if (element.availableInDataset === false || element.transformationRequired) {
                    steps.push({
                        stepId: `transform_${element.name || element.elementId || steps.length}`,
                        sourceColumn: element.source || element.sourceColumn || 'unknown',
                        targetElement: element.name || element.elementId || 'unknown',
                        transformationType: element.transformationType || 'derived',
                        logic: element.transformationDescription || element.transformationCode || 'No transformation logic defined'
                    });
                }
            }

            // Generate transformation plan structure
            const transformationPlan = {
                projectId,
                steps,
                estimatedDuration: `${Math.max(1, steps.length * 2)} minutes`,
                confidence: steps.length > 0 ? 0.8 : 0.5,
                analysisTypesSupported: analysisPath.map((a: any) => a?.analysisType || a),
                requiredElementsCount: requiredElements.length,
                transformationsNeeded: steps.length,
                message: steps.length > 0
                    ? `Planned ${steps.length} transformations for ${requiredElements.length} required elements`
                    : 'No transformations required - data already meets requirements'
            };

            return transformationPlan;
        } catch (error) {
            console.warn('[PM Orchestration] Transformation planning failed, using defaults:', error);
            return {
                steps: [],
                estimatedDuration: 'Unknown',
                confidence: 0,
                error: 'Transformation planning failed'
            };
        }
    }
}
