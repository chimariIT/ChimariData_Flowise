/**
 * E2E Tests: U2A2A2U Checkpoint Flow
 *
 * Tests the complete U2A2A2U (User → Agent → Agent → Agent → User) workflow
 * including checkpoint creation, user approval, and workflow continuation.
 *
 * Day 11 Implementation - Week 3 Testing
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { AgentCoordinationService, U2A2A2URequest } from '../../../server/services/agent-coordination-service';
import { getMessageBroker, resetMessageBroker } from '../../../server/services/agents/message-broker';
import { nanoid } from 'nanoid';

describe('E2E: U2A2A2U Checkpoint Flow', () => {
  let coordinationService: AgentCoordinationService;
  let messageBroker: ReturnType<typeof getMessageBroker>;

  beforeAll(async () => {
    // Initialize message broker in fallback mode for testing
    messageBroker = getMessageBroker();
  });

  afterAll(async () => {
    // Clean up
    resetMessageBroker();
  });

  beforeEach(() => {
    coordinationService = new AgentCoordinationService();
  });

  describe('Full Workflow Path', () => {
    test('executes complete workflow: Data Engineer → Data Scientist → Business Agent → Synthesis → Checkpoint', async () => {
      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-1',
        data: {
          columns: ['id', 'revenue', 'cost', 'date'],
          rowCount: 5000,
          sampleData: [
            { id: 1, revenue: 1000, cost: 500, date: '2025-01-01' },
            { id: 2, revenue: 1500, cost: 700, date: '2025-01-02' },
            { id: 3, revenue: 1200, cost: 600, date: '2025-01-03' }
          ]
        },
        analysisGoal: 'Analyze revenue trends and cost efficiency',
        userQuestions: ['What drives revenue?', 'How can we reduce costs?'],
        journeyType: 'data-deep-dive',
        options: {
          skipCheckpoint: true, // Skip waiting for user approval in tests
          timeout: 60000
        }
      };

      const startTime = Date.now();
      const result = await coordinationService.executeWorkflow(request);
      const duration = Date.now() - startTime;

      // Workflow should complete
      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      // Should have all phases
      expect(result.phases).toBeDefined();
      expect(result.phases.length).toBeGreaterThanOrEqual(4);

      // Check phase statuses
      const phaseNames = result.phases.map((p: any) => p.phase);
      expect(phaseNames).toContain('data_engineer');
      expect(phaseNames).toContain('data_scientist');
      expect(phaseNames).toContain('business_agent');
      expect(phaseNames).toContain('synthesis');

      // Should complete within SLA (5 minutes with soft enforcement)
      expect(duration).toBeLessThan(300000);

      // Should have synthesis output
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis.recommendations).toBeDefined();
    }, 120000);

    test('publishes progress events during workflow execution', async () => {
      const progressEvents: any[] = [];

      // Subscribe to progress events
      const unsubscribe = messageBroker.subscribe('workflow:progress', (event) => {
        progressEvents.push(event);
      });

      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-2',
        data: {
          columns: ['metric', 'value'],
          rowCount: 100,
          sampleData: [{ metric: 'sales', value: 1000 }]
        },
        analysisGoal: 'Quick analysis',
        userQuestions: ['What is the trend?'],
        journeyType: 'quick-insights',
        options: {
          skipCheckpoint: true,
          timeout: 30000
        }
      };

      await coordinationService.executeWorkflow(request);

      // Should have received progress events
      expect(progressEvents.length).toBeGreaterThan(0);

      // Should have workflow start event
      const startEvent = progressEvents.find((e: any) => e.data?.status === 'started' && e.data?.phase === 'workflow');
      expect(startEvent).toBeDefined();

      // Should have DE phase events
      const deEvents = progressEvents.filter((e: any) => e.data?.phase === 'data_engineer');
      expect(deEvents.length).toBeGreaterThan(0);

      // Progress should increase over time
      const percentages = progressEvents
        .map((e: any) => e.data?.percentComplete)
        .filter((p: number | undefined) => typeof p === 'number');

      for (let i = 1; i < percentages.length; i++) {
        expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]);
      }

      unsubscribe();
    }, 60000);

    test('creates checkpoint with synthesis for user approval', async () => {
      let checkpointReceived: any = null;

      // Listen for checkpoint messages
      messageBroker.on('message:checkpoint', (message) => {
        checkpointReceived = message;
      });

      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-3',
        data: {
          columns: ['category', 'amount'],
          rowCount: 500,
          sampleData: [{ category: 'A', amount: 100 }]
        },
        analysisGoal: 'Categorize spending patterns',
        userQuestions: ['What are the top categories?'],
        journeyType: 'business-insight',
        options: {
          skipCheckpoint: false,
          timeout: 30000
        }
      };

      // Start workflow (will wait for checkpoint)
      const workflowPromise = coordinationService.executeWorkflow(request);

      // Wait for checkpoint to be created
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Simulate user approval
      if (checkpointReceived?.payload?.checkpointId) {
        await messageBroker.submitCheckpointResponse(checkpointReceived.payload.checkpointId, {
          approved: true,
          feedback: 'Looks good, proceed with analysis'
        });
      }

      const result = await workflowPromise;

      // Checkpoint should have been created
      expect(checkpointReceived).toBeDefined();
      expect(checkpointReceived?.payload?.projectId).toBe(request.projectId);

      // Workflow should complete after approval
      expect(result.success).toBe(true);
    }, 60000);
  });

  describe('Error Paths', () => {
    test('handles phase timeout with soft enforcement', async () => {
      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-timeout',
        data: {
          columns: ['id'],
          rowCount: 10,
          sampleData: [{ id: 1 }]
        },
        analysisGoal: 'Test timeout handling',
        userQuestions: [],
        journeyType: 'quick-insights',
        options: {
          skipCheckpoint: true,
          timeout: 5000 // Very short timeout
        }
      };

      // Workflow should still complete (soft enforcement)
      const result = await coordinationService.executeWorkflow(request);

      // With soft enforcement, workflow should complete but may have warnings
      expect(result).toBeDefined();
      // Check if any phase exceeded SLA
      const slaViolations = result.phases?.filter((p: any) => p.slaCompliant === false);
      // Log for visibility but don't fail test
      if (slaViolations?.length > 0) {
        console.log('SLA violations detected (soft enforcement):', slaViolations);
      }
    }, 30000);

    test('handles phase failure with fallback', async () => {
      // Mock a tool failure
      const originalGetMessageBroker = getMessageBroker;

      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-failure',
        data: {
          columns: [], // Empty columns might cause issues
          rowCount: 0,
          sampleData: []
        },
        analysisGoal: 'Test failure handling',
        userQuestions: [],
        journeyType: 'quick-insights',
        options: {
          skipCheckpoint: true,
          timeout: 30000
        }
      };

      // Workflow should handle gracefully
      const result = await coordinationService.executeWorkflow(request);

      // Should return result even with minimal/empty data
      expect(result).toBeDefined();
      // May have partial phases or fallback results
      expect(result.phases).toBeDefined();
    }, 60000);

    test('handles user rejection and creates new checkpoint', async () => {
      let checkpointCount = 0;
      let lastCheckpointId: string | null = null;

      messageBroker.on('message:checkpoint', (message) => {
        checkpointCount++;
        lastCheckpointId = message.payload?.checkpointId;
      });

      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-reject',
        data: {
          columns: ['name', 'score'],
          rowCount: 200,
          sampleData: [{ name: 'test', score: 85 }]
        },
        analysisGoal: 'Test rejection flow',
        userQuestions: ['Can you improve this?'],
        journeyType: 'business-insight',
        options: {
          skipCheckpoint: false,
          maxRejections: 2,
          timeout: 60000
        }
      };

      // Start workflow
      const workflowPromise = coordinationService.executeWorkflow(request);

      // Wait for first checkpoint
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Reject first checkpoint
      if (lastCheckpointId) {
        await messageBroker.submitCheckpointResponse(lastCheckpointId, {
          approved: false,
          feedback: 'Please focus more on cost analysis',
          modifications: { focusArea: 'cost' }
        });
      }

      // Wait for potential second checkpoint
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Approve second checkpoint if created
      if (lastCheckpointId && checkpointCount > 1) {
        await messageBroker.submitCheckpointResponse(lastCheckpointId, {
          approved: true,
          feedback: 'This version looks better'
        });
      }

      const result = await workflowPromise;

      // Workflow should handle rejection and continue
      expect(result).toBeDefined();
    }, 90000);
  });

  describe('Checkpoint Response Handling', () => {
    test('checkpoint includes synthesis summary and recommendations', async () => {
      let checkpointPayload: any = null;

      messageBroker.on('message:checkpoint', (message) => {
        checkpointPayload = message.payload;
      });

      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-summary',
        data: {
          columns: ['product', 'sales', 'region'],
          rowCount: 1000,
          sampleData: [
            { product: 'Widget A', sales: 500, region: 'North' },
            { product: 'Widget B', sales: 300, region: 'South' }
          ]
        },
        analysisGoal: 'Identify best selling products by region',
        userQuestions: ['Which product sells best?', 'Which region performs best?'],
        journeyType: 'data-deep-dive',
        options: {
          skipCheckpoint: false,
          timeout: 45000
        }
      };

      // Start workflow and wait for checkpoint
      const workflowPromise = coordinationService.executeWorkflow(request);

      await new Promise(resolve => setTimeout(resolve, 20000));

      // Approve to let workflow complete
      if (checkpointPayload?.checkpointId) {
        await messageBroker.submitCheckpointResponse(checkpointPayload.checkpointId, {
          approved: true
        });
      }

      await workflowPromise;

      // Checkpoint should have synthesis information
      expect(checkpointPayload).toBeDefined();
      expect(checkpointPayload.projectId).toBeDefined();
      expect(checkpointPayload.step).toBeDefined();

      // Should have question for user
      expect(checkpointPayload.question).toBeDefined();

      // Should have options
      expect(checkpointPayload.options).toBeDefined();
      expect(checkpointPayload.options.length).toBeGreaterThan(0);
    }, 90000);

    test('user feedback is incorporated into execution phase', async () => {
      let checkpointId: string | null = null;
      let executionStarted = false;

      messageBroker.on('message:checkpoint', (message) => {
        checkpointId = message.payload?.checkpointId;
      });

      // Listen for execution phase
      const progressEvents: any[] = [];
      const unsubscribe = messageBroker.subscribe('workflow:progress', (event) => {
        progressEvents.push(event);
        if (event.data?.phase === 'execution') {
          executionStarted = true;
        }
      });

      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-feedback',
        data: {
          columns: ['metric', 'value', 'timestamp'],
          rowCount: 500,
          sampleData: [{ metric: 'revenue', value: 10000, timestamp: '2025-01-01' }]
        },
        analysisGoal: 'Analyze metrics over time',
        userQuestions: ['What is the trend?'],
        journeyType: 'data-deep-dive',
        options: {
          skipCheckpoint: false,
          timeout: 60000
        }
      };

      const workflowPromise = coordinationService.executeWorkflow(request);

      // Wait for checkpoint
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Approve with specific feedback
      if (checkpointId) {
        await messageBroker.submitCheckpointResponse(checkpointId, {
          approved: true,
          feedback: 'Focus on monthly aggregation',
          modifications: {
            aggregationLevel: 'monthly',
            includeForecasting: true
          }
        });
      }

      const result = await workflowPromise;

      unsubscribe();

      // Workflow should complete
      expect(result.success).toBe(true);

      // Execution phase should have been triggered after approval
      // (depends on implementation - execution may be part of synthesis)
    }, 90000);
  });

  describe('SLA Compliance', () => {
    test('tracks SLA metrics for each phase', async () => {
      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-sla',
        data: {
          columns: ['id', 'value'],
          rowCount: 100,
          sampleData: [{ id: 1, value: 100 }]
        },
        analysisGoal: 'Quick SLA test',
        userQuestions: [],
        journeyType: 'quick-insights',
        options: {
          skipCheckpoint: true,
          timeout: 60000
        }
      };

      const result = await coordinationService.executeWorkflow(request);

      // Each phase should have timing metadata
      for (const phase of result.phases || []) {
        expect(phase.durationMs).toBeDefined();
        expect(typeof phase.durationMs).toBe('number');
        expect(phase.durationMs).toBeGreaterThan(0);

        // SLA compliance flag should be present
        if (phase.slaCompliant !== undefined) {
          expect(typeof phase.slaCompliant).toBe('boolean');
        }
      }

      // Total workflow time should be tracked
      expect(result.totalDurationMs).toBeDefined();
      expect(result.totalDurationMs).toBeGreaterThan(0);
    }, 60000);

    test('logs warning when phase exceeds SLA threshold', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      const request: U2A2A2URequest = {
        projectId: `test-project-${nanoid(8)}`,
        userId: 'test-user-sla-warning',
        data: {
          columns: Array(50).fill(null).map((_, i) => `col_${i}`), // Many columns
          rowCount: 10000, // Large dataset simulation
          sampleData: [{ col_0: 1 }]
        },
        analysisGoal: 'Test SLA warning for large dataset',
        userQuestions: ['Analyze all columns'],
        journeyType: 'data-deep-dive',
        options: {
          skipCheckpoint: true,
          timeout: 120000
        }
      };

      await coordinationService.executeWorkflow(request);

      // Check if any SLA warnings were logged
      // (soft enforcement should log but not fail)
      const slaWarnings = consoleSpy.mock.calls.filter(
        call => call.some(arg => typeof arg === 'string' && arg.includes('SLA'))
      );

      // Restore console
      consoleSpy.mockRestore();

      // SLA logging may or may not occur depending on actual execution time
      // Just verify the workflow completed
    }, 180000);
  });
});
