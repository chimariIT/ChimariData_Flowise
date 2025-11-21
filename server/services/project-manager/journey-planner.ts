import type { JourneyRequest, OrchestrationPlan } from './types';
import { journeyTemplateService } from './journey-template-service';
import type { JourneyTemplate } from '@shared/journey-templates';

export interface JourneyBlueprint {
    selectedAgent: string;
    tools: string[];
    workflowSteps: OrchestrationPlan['workflowSteps'];
    estimatedTotalDuration: number;
    confidence: number;
    metadata?: {
        templateId?: string;
        title?: string;
        summary?: string;
        journeyType?: string;
        industry?: string;
        expectedArtifacts?: string[];
        communicationStyle?: string;
        communicationGuidelines?: string[];
        persona?: string;
        tags?: string[];
        version?: string;
        lastUpdated?: string;
        steps?: Array<{
            id: string;
            name: string;
            agent: string;
            tools: string[];
            communicationStyle?: string;
        }>;
    };
}

export type JourneyPlanResult =
    | { type: 'standard'; blueprint: JourneyBlueprint }
    | { type: 'custom' };

const TOOL_AGENT_MAP: Record<string, string> = {
    // Data preparation
    file_processor: 'data_engineer',
    schema_generator: 'data_engineer',
    data_transformer: 'data_engineer',
    spark_data_processor: 'data_engineer',

    // Statistical analysis
    statistical_analyzer: 'technical_ai_agent',
    enhanced_statistical_analyzer: 'technical_ai_agent',
    scipy_analyzer: 'technical_ai_agent',
    statsmodels_analyzer: 'technical_ai_agent',
    pandas_analyzer: 'technical_ai_agent',
    numpy_analyzer: 'technical_ai_agent',
    dask_analyzer: 'technical_ai_agent',
    polars_analyzer: 'technical_ai_agent',
    spark_statistical_analyzer: 'technical_ai_agent',

    // Machine learning
    ml_pipeline: 'technical_ai_agent',
    comprehensive_ml_pipeline: 'technical_ai_agent',
    automl_optimizer: 'technical_ai_agent',
    ml_library_selector: 'technical_ai_agent',
    ml_health_check: 'technical_ai_agent',
    spark_ml_pipeline: 'technical_ai_agent',

    // LLM & advanced
    llm_fine_tuning: 'technical_ai_agent',
    lora_fine_tuning: 'technical_ai_agent',
    llm_method_recommendation: 'technical_ai_agent',
    llm_health_check: 'technical_ai_agent',

    // Visualization
    visualization_engine: 'technical_ai_agent',
    enhanced_visualization_engine: 'technical_ai_agent',
    plotly_generator: 'technical_ai_agent',
    matplotlib_generator: 'technical_ai_agent',
    seaborn_generator: 'technical_ai_agent',
    bokeh_generator: 'technical_ai_agent',
    d3_generator: 'technical_ai_agent',
    spark_visualization_engine: 'technical_ai_agent',

    // Business & templates
    business_templates: 'business_agent',

    // Coordination & oversight
    project_coordinator: 'project_manager',
    decision_auditor: 'project_manager'
};

export function getAgentForTool(toolName: string): string {
    return TOOL_AGENT_MAP[toolName] || 'technical_ai_agent';
}

function buildBlueprintFromTemplate(template: JourneyTemplate): JourneyBlueprint {
    const steps: OrchestrationPlan['workflowSteps'] = template.steps.map(step => ({
        stepId: step.id,
        stepName: step.name,
        agent: step.agent,
        tools: [...step.tools],
        estimatedDuration: step.estimatedDuration ?? 0,
        dependencies: step.dependencies ? [...step.dependencies] : []
    }));

    const aggregatedTools = new Set<string>();
    template.steps.forEach(step => step.tools.forEach(tool => aggregatedTools.add(tool)));

    const estimatedTotalDuration = steps.reduce((sum, step) => sum + (step.estimatedDuration ?? 0), 0);

    return {
        selectedAgent: template.primaryAgent,
        tools: Array.from(aggregatedTools),
        workflowSteps: steps,
        estimatedTotalDuration,
        confidence: template.defaultConfidence ?? 0.85,
        metadata: {
            templateId: template.id,
            title: template.title,
            summary: template.summary,
            journeyType: template.journeyType,
            industry: template.industry,
            expectedArtifacts: template.expectedArtifacts,
            communicationStyle: template.communicationStyle,
            communicationGuidelines: template.communicationGuidelines,
            persona: template.persona,
            tags: template.tags,
            version: template.version,
            lastUpdated: template.lastUpdated,
            steps: template.steps.map(step => ({
                id: step.id,
                name: step.name,
                agent: step.agent,
                tools: [...step.tools],
                communicationStyle: step.communicationStyle
            }))
        }
    };
}

export function buildJourneyBlueprint(request: JourneyRequest): JourneyPlanResult {
    if (request.journeyType === 'custom') {
        return { type: 'custom' };
    }

    const template = journeyTemplateService.resolveTemplate(request);
    const blueprint = buildBlueprintFromTemplate(template);

    return {
        type: 'standard',
        blueprint
    };
}
