import type { EnhancedTaskQueue } from '../enhanced-task-queue';

export interface QueueAgentRegistration {
    agentId: string;
    capabilities: string[];
    maxConcurrentTasks: number;
}

const DEFAULT_QUEUE_AGENT_REGISTRATIONS: readonly QueueAgentRegistration[] = Object.freeze([
    {
        agentId: 'technical_agent',
        capabilities: [
            'data_analysis',
            'statistical_analysis',
            'machine_learning',
            'code_generation',
            'data_processing',
            'visualization'
        ],
        maxConcurrentTasks: 3
    },
    {
        agentId: 'business_agent',
        capabilities: [
            'business_analysis',
            'report_generation',
            'industry_analysis',
            'compliance_check',
            'business_intelligence'
        ],
        maxConcurrentTasks: 2
    },
    {
        agentId: 'project_manager',
        capabilities: [
            'orchestration',
            'workflow_management',
            'project_coordination',
            'artifact_management'
        ],
        maxConcurrentTasks: 5
    }
]);

export function registerQueueAgents(
    queue: EnhancedTaskQueue,
    definitions: readonly QueueAgentRegistration[] = DEFAULT_QUEUE_AGENT_REGISTRATIONS
): void {
    for (const definition of definitions) {
        queue.registerAgent(definition.agentId, definition.capabilities, definition.maxConcurrentTasks);
    }
}

export function registerQueueAgent(queue: EnhancedTaskQueue, definition: QueueAgentRegistration): void {
    queue.registerAgent(definition.agentId, definition.capabilities, definition.maxConcurrentTasks);
}

export function getDefaultQueueAgentRegistrations(): QueueAgentRegistration[] {
    return DEFAULT_QUEUE_AGENT_REGISTRATIONS.map(definition => ({ ...definition }));
}
