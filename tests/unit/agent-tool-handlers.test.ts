import { describe, it, beforeEach, expect, vi } from 'vitest';

const sendMessageMock = vi.fn();
const coordinateGoalAnalysisMock = vi.fn();

vi.mock('../../server/services/agents/message-broker', () => ({
  AgentMessageBroker: vi.fn().mockImplementation(() => ({
    sendMessage: sendMessageMock
  }))
}));

vi.mock('../../server/services/project-manager-agent', () => ({
  ProjectManagerAgent: vi.fn().mockImplementation(() => ({
    coordinateGoalAnalysis: coordinateGoalAnalysisMock
  }))
}));

const { PMToolHandlers } = await import('../../server/services/agent-tool-handlers');

const baseContext = {
  executionId: 'exec-123',
  agentId: 'project_manager',
  userId: 'user-1',
  projectId: 'project-1',
  timestamp: new Date()
};

describe('PMToolHandlers', () => {
  let handlers: PMToolHandlers;

beforeEach(() => {
    vi.clearAllMocks();
    sendMessageMock.mockReset();
    coordinateGoalAnalysisMock.mockReset();
    handlers = new PMToolHandlers();
  });

  it('sends agent communication requests through the broker', async () => {
    sendMessageMock.mockResolvedValueOnce(undefined);

    const result = await handlers.handleAgentCommunication(
      {
        targetAgentId: 'data_scientist',
        messageType: 'request_assistance',
        payload: { question: 'Need data quality guidance' },
        priority: 'high'
      },
      baseContext
    );

    expect(sendMessageMock).toHaveBeenCalledWith({
      from: 'project_manager',
      to: 'data_scientist',
      type: 'request_assistance',
      payload: { question: 'Need data quality guidance' },
      priority: 'high'
    });

    expect(result.status).toBe('success');
    expect(result.result).toMatchObject({
      messageSent: true,
      targetAgent: 'data_scientist',
      messageType: 'request_assistance',
      priority: 'high'
    });
  });

  it('returns error status when broker send fails', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('broker unavailable'));

    const result = await handlers.handleAgentCommunication(
      { targetAgentId: 'data_scientist', messageType: 'ping', payload: {} },
      baseContext
    );

    expect(result.status).toBe('error');
    expect(result.error).toBe('broker unavailable');
  });

  it('evaluates workflow criteria deterministically', async () => {
    const mathSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);

    const result = await handlers.handleWorkflowEvaluator(
      {
        projectId: 'project-99',
        evaluationCriteria: ['planning', 'execution'],
        includeMetrics: true
      },
      baseContext
    );

    expect(result.status).toBe('success');
    expect(result.result.projectId).toBe('project-99');
    expect(result.result.criteria).toHaveLength(2);
    expect(result.result.metrics).toBeDefined();

    mathSpy.mockRestore();
  });

  it('creates task coordination entries with assignments and dependencies', async () => {
    const result = await handlers.handleTaskCoordinator(
      {
        projectId: 'project-456',
        tasks: [
          { name: 'Upload Data' },
          { name: 'Run Quality Checks', assignee: 'data_engineer' }
        ],
        assignees: { 'Upload Data': 'project_manager' },
        dependencies: [{ task: 'Run Quality Checks', dependsOn: 'Upload Data' }]
      },
      baseContext
    );

    expect(result.status).toBe('success');
    expect(result.result.tasksCreated).toBe(2);
    expect(result.result.tasks[0]).toMatchObject({
      name: 'Upload Data',
      assignedTo: 'project_manager'
    });
    expect(result.result.tasks[1]).toMatchObject({
      name: 'Run Quality Checks',
      assignedTo: 'data_engineer'
    });
    expect(result.result.dependencyGraph).toHaveLength(1);
  });

  it('delegates resource allocation to the project manager agent', async () => {
    coordinateGoalAnalysisMock.mockResolvedValueOnce({
      coordinationId: 'coord-1',
      expertOpinions: [{ agentId: 'data_engineer', opinion: { status: 'ready' } }],
      synthesis: { overallAssessment: 'proceed', confidence: 0.82 }
    });

    const result = await handlers.handleResourceAllocator(
      {
        projectId: 'project-xyz',
        requiredAgents: ['data_scientist', 'business_agent'],
        scenario: {
          uploadedData: { datasets: 2 },
          goals: ['Improve retention'],
          industry: 'education'
        }
      },
      baseContext
    );

    expect(coordinateGoalAnalysisMock).toHaveBeenCalledWith(
      'project-xyz',
      { datasets: 2 },
      ['Improve retention'],
      'education'
    );

    expect(result.status).toBe('success');
    expect(result.result).toMatchObject({
      coordinationId: 'coord-1',
      recommendation: 'proceed',
      agentsCoordinated: 1
    });
  });
});

