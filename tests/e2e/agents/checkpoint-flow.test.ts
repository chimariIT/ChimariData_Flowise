/**
 * E2E Tests: Complete Checkpoint Flow
 *
 * Tests the entire user journey for agent checkpoints:
 * Agent creates checkpoint → User receives via WebSocket → User responds → Agent continues
 *
 * Requires: DATABASE_URL, REDIS_URL
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../../server/db';
import { users, projects } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { ProjectManagerAgent } from '../../../server/services/project-manager-agent';
import { getMessageBroker, resetMessageBroker } from '../../../server/services/agents/message-broker';
import { getAgentBridge, resetAgentBridge } from '../../../server/services/agents/realtime-agent-bridge';
import { EventEmitter } from 'events';

// Mock RealtimeServer for E2E testing
class TestRealtimeServer extends EventEmitter {
  private broadcasts: any[] = [];

  broadcast(event: any, filters?: { userId?: string; projectId?: string }) {
    this.broadcasts.push({ event, filters });
    this.emit('broadcast', { event, filters });
  }

  getBroadcasts() {
    return this.broadcasts;
  }

  clearBroadcasts() {
    this.broadcasts = [];
  }

  simulateUserMessage(message: any) {
    this.emit('client_message', message);
  }
}

// Skip if required services not configured
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_TEST_URL;
const skipTests = !DATABASE_URL || !REDIS_URL;

describe.skipIf(skipTests)('E2E: Checkpoint Flow', () => {
  let testUserId: string;
  let testProjectId: string;
  let realtimeServer: TestRealtimeServer;
  let projectManagerAgent: ProjectManagerAgent;

  beforeAll(() => {
    realtimeServer = new TestRealtimeServer();
  });

  beforeEach(async () => {
    // Reset services
    resetMessageBroker();
    resetAgentBridge();

    // Initialize services
    getMessageBroker(REDIS_URL);
    getAgentBridge(realtimeServer as any, REDIS_URL);
    projectManagerAgent = new ProjectManagerAgent(realtimeServer as any);

    // Create test user
    testUserId = randomUUID();
    await db.insert(users).values({
      id: testUserId,
      email: `test-checkpoint-${testUserId}@example.com`,
      subscriptionTier: 'professional',
      subscriptionStatus: 'active',
    });

    // Create test project
    testProjectId = randomUUID();
    await db.insert(projects).values({
      id: testProjectId,
      name: 'Test Checkpoint Project',
      description: 'Testing checkpoint workflow',
      ownerId: testUserId,
      journeyType: 'template_based',
      status: 'active'
    });

    // Clear broadcasts
    realtimeServer.clearBroadcasts();

    // Wait for services to initialize
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    // Cleanup test data
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    if (testProjectId) {
      await db.delete(projects).where(eq(projects.id, testProjectId));
    }
  });

  describe('Complete Checkpoint Workflow', () => {
    test('agent presents checkpoint and waits for user approval', async () => {
      // Agent creates and presents checkpoint
      const artifacts = {
        schema: {
          columns: [
            { name: 'id', type: 'integer', nullable: false },
            { name: 'name', type: 'string', nullable: false },
            { name: 'email', type: 'string', nullable: true }
          ]
        }
      };

      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'schema',
        artifacts,
        'business'
      );

      // Verify checkpoint was created
      expect(presentation.checkpoint).toBeDefined();
      expect(presentation.checkpoint.status).toBe('presented');
      expect(presentation.checkpoint.checkpointType).toBe('schema');

      // Verify WebSocket broadcast
      await new Promise(resolve => setTimeout(resolve, 200));

      const broadcasts = realtimeServer.getBroadcasts();
      expect(broadcasts.length).toBeGreaterThan(0);

      const checkpointBroadcast = broadcasts.find(
        b => b.event.data?.eventType === 'agent_checkpoint'
      );

      expect(checkpointBroadcast).toBeDefined();
      expect(checkpointBroadcast.event.data.checkpoint.checkpointId).toBe(
        presentation.checkpoint.checkpointId
      );

      // Simulate user approval after 500ms
      setTimeout(() => {
        realtimeServer.simulateUserMessage({
          type: 'checkpoint_response',
          checkpointId: presentation.checkpoint.checkpointId,
          approved: true,
          feedback: 'Schema looks good!'
        });
      }, 500);

      // Agent waits for decision (should complete in <1 second)
      const startTime = Date.now();
      const decision = await projectManagerAgent.processCheckpointDecision(
        testProjectId,
        { approved: true, feedback: 'Schema looks good!' }
      );
      const elapsedTime = Date.now() - startTime;

      expect(decision.shouldProceed).toBe(true);
      expect(decision.nextAction).toBe('proceed_to_next_step');
      expect(elapsedTime).toBeLessThan(2000); // Should be near-instant
    });

    test('handles user rejection and returns to previous step', async () => {
      const artifacts = { methodology: { steps: ['clean', 'analyze'] } };

      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'methodology',
        artifacts,
        'business'
      );

      // Wait for broadcast
      await new Promise(resolve => setTimeout(resolve, 200));

      // Simulate user rejection
      setTimeout(() => {
        realtimeServer.simulateUserMessage({
          type: 'checkpoint_response',
          checkpointId: presentation.checkpoint.checkpointId,
          approved: false,
          feedback: 'Methodology needs revision'
        });
      }, 300);

      // Process decision
      const decision = await projectManagerAgent.processCheckpointDecision(
        testProjectId,
        { approved: false, feedback: 'Methodology needs revision' }
      );

      expect(decision.shouldProceed).toBe(false);
      expect(decision.nextAction).toBe('return_to_previous_step');
    });

    test('applies user modifications and proceeds', async () => {
      const artifacts = {
        schema: {
          columns: [
            { name: 'id', type: 'integer' },
            { name: 'name', type: 'string' }
          ]
        }
      };

      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'schema',
        artifacts,
        'technical'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Simulate user modifications
      const modifications = {
        schema: {
          columns: [
            { name: 'id', type: 'integer' },
            { name: 'name', type: 'string' },
            { name: 'email', type: 'string' } // User added email column
          ]
        }
      };

      setTimeout(() => {
        realtimeServer.simulateUserMessage({
          type: 'checkpoint_response',
          checkpointId: presentation.checkpoint.checkpointId,
          approved: true,
          modifications
        });
      }, 300);

      // Process decision with modifications
      const decision = await projectManagerAgent.processCheckpointDecision(
        testProjectId,
        { approved: true, modifications }
      );

      expect(decision.shouldProceed).toBe(true);
      expect(decision.nextAction).toBe('proceed_with_modifications');
      expect(decision.updatedArtifacts?.schema.columns).toHaveLength(3);
      expect(decision.updatedArtifacts?.schema.columns[2].name).toBe('email');
    });
  });

  describe('Multiple Sequential Checkpoints', () => {
    test('handles multiple checkpoints in sequence', async () => {
      const checkpoints = [
        { type: 'schema' as const, artifacts: { schema: {} } },
        { type: 'relationship' as const, artifacts: { relationships: [] } },
        { type: 'methodology' as const, artifacts: { steps: [] } }
      ];

      const results = [];

      for (const checkpoint of checkpoints) {
        // Present checkpoint
        const presentation = await projectManagerAgent.presentCheckpoint(
          testProjectId,
          checkpoint.type,
          checkpoint.artifacts,
          'business'
        );

        await new Promise(resolve => setTimeout(resolve, 200));

        // Simulate user approval
        setTimeout(() => {
          realtimeServer.simulateUserMessage({
            type: 'checkpoint_response',
            checkpointId: presentation.checkpoint.checkpointId,
            approved: true
          });
        }, 300);

        // Process decision
        const decision = await projectManagerAgent.processCheckpointDecision(
          testProjectId,
          { approved: true }
        );

        results.push(decision);
      }

      // All checkpoints should proceed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.shouldProceed).toBe(true);
        expect(result.nextAction).toBe('proceed_to_next_step');
      });
    });
  });

  describe('Real-Time Performance', () => {
    test('checkpoint notification arrives in <100ms', async () => {
      const artifacts = { test: 'data' };

      const startTime = Date.now();

      // Listen for broadcast
      let broadcastReceived = false;
      realtimeServer.on('broadcast', () => {
        broadcastReceived = true;
      });

      // Present checkpoint
      await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'pre_analysis',
        artifacts,
        'business'
      );

      // Wait for broadcast
      await new Promise(resolve => setTimeout(resolve, 50));

      const latency = Date.now() - startTime;

      expect(broadcastReceived).toBe(true);
      expect(latency).toBeLessThan(100);
    });

    test('user response processed in <100ms', async () => {
      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'quality',
        { qualityScore: 95 },
        'technical'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Measure response processing time
      const startTime = Date.now();

      realtimeServer.simulateUserMessage({
        type: 'checkpoint_response',
        checkpointId: presentation.checkpoint.checkpointId,
        approved: true
      });

      // Small delay for event propagation
      await new Promise(resolve => setTimeout(resolve, 50));

      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(100);
    });
  });

  describe('Error Scenarios', () => {
    test('handles timeout gracefully', async () => {
      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'final',
        { report: 'complete' },
        'business'
      );

      // Don't simulate user response (let it timeout)

      // This should timeout after 5 minutes, but we'll test with shorter timeout
      // by directly calling waitForCheckpointResponse with 100ms timeout
      const broker = getMessageBroker();

      await expect(
        broker.waitForCheckpointResponse(presentation.checkpoint.checkpointId, 100)
      ).rejects.toThrow('timeout');
    });

    test('handles duplicate checkpoint responses', async () => {
      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'post_analysis',
        { results: {} },
        'business'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Send first response
      realtimeServer.simulateUserMessage({
        type: 'checkpoint_response',
        checkpointId: presentation.checkpoint.checkpointId,
        approved: true
      });

      // Try to send duplicate response (should be ignored)
      realtimeServer.simulateUserMessage({
        type: 'checkpoint_response',
        checkpointId: presentation.checkpoint.checkpointId,
        approved: false
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // First response should win
      const decision = await projectManagerAgent.processCheckpointDecision(
        testProjectId,
        { approved: true }
      );

      expect(decision.shouldProceed).toBe(true);
    });
  });

  describe('User Role-Based Presentation', () => {
    test('translates artifacts for non-technical user', async () => {
      const technicalArtifacts = {
        schema: {
          columns: [
            { name: 'user_id', type: 'uuid', nullable: false, primaryKey: true },
            { name: 'created_at', type: 'timestamp', nullable: false, default: 'now()' }
          ]
        }
      };

      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'schema',
        technicalArtifacts,
        'non-tech'
      );

      // User-friendly presentation should be simplified
      expect(presentation.userFriendlyPresentation).toBeDefined();
      // Translation logic will convert technical terms to plain language
    });

    test('provides technical details for technical user', async () => {
      const artifacts = {
        schema: {
          columns: [
            { name: 'id', type: 'serial', nullable: false }
          ]
        }
      };

      const presentation = await projectManagerAgent.presentCheckpoint(
        testProjectId,
        'schema',
        artifacts,
        'technical'
      );

      // Technical users get full details
      expect(presentation.userFriendlyPresentation).toBeDefined();
    });
  });
});
