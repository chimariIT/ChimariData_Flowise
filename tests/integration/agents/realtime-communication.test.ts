/**
 * Integration Tests: Real-Time Agent Communication
 *
 * Tests the complete agent communication stack with real Redis
 * Requires REDIS_URL environment variable
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { getMessageBroker, resetMessageBroker } from '../../../server/services/agents/message-broker';
import { getAgentBridge, resetAgentBridge, RealtimeAgentBridge } from '../../../server/services/agents/realtime-agent-bridge';

// Mock RealtimeServer
class MockRealtimeServer extends EventEmitter {
  private clients: Map<string, any> = new Map();

  broadcast(event: any, filters?: { userId?: string; projectId?: string }) {
    this.emit('broadcast', { event, filters });
  }

  on(eventName: string, listener: (...args: any[]) => void): this {
    return super.on(eventName, listener);
  }
}

// Skip if no Redis test URL explicitly configured (requires running Redis instance)
const REDIS_URL = process.env.REDIS_TEST_URL;
const skipTests = !REDIS_URL;

describe.skipIf(skipTests)('Real-Time Agent Communication', () => {
  let messageBroker: ReturnType<typeof getMessageBroker>;
  let realtimeServer: MockRealtimeServer;
  let agentBridge: RealtimeAgentBridge;

  beforeAll(() => {
    realtimeServer = new MockRealtimeServer();
  });

  beforeEach(async () => {
    // Reset singletons
    resetMessageBroker();
    resetAgentBridge();

    // Initialize services
    messageBroker = getMessageBroker(REDIS_URL);
    agentBridge = getAgentBridge(realtimeServer as any, REDIS_URL);

    // Wait for Redis connection and channel subscription
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    await messageBroker.shutdown();
    await agentBridge.shutdown();
  });

  describe('Agent Registration', () => {
    test('registers agent with message broker', async () => {
      await messageBroker.registerAgent('test_agent');

      const stats = messageBroker.getStats();
      expect(stats.registeredAgents).toBe(1);
    });

    test('unregisters agent cleanly', async () => {
      await messageBroker.registerAgent('test_agent');
      await messageBroker.unregisterAgent('test_agent');

      const stats = messageBroker.getStats();
      expect(stats.registeredAgents).toBe(0);
    });
  });

  describe('Agent-to-Agent Communication', () => {
    test('sends message between agents', async () => {
      await messageBroker.registerAgent('agent_a');
      await messageBroker.registerAgent('agent_b');

      let receivedMessage: any = null;

      messageBroker.on('message:agent_b', (msg: any) => {
        receivedMessage = msg;
      });

      await messageBroker.sendMessage({
        from: 'agent_a',
        to: 'agent_b',
        type: 'task',
        payload: { action: 'analyze_data' }
      });

      // Wait for message delivery
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessage).not.toBeNull();
      expect(receivedMessage.from).toBe('agent_a');
      expect(receivedMessage.payload.action).toBe('analyze_data');
    });

    test('request-response pattern works', async () => {
      await messageBroker.registerAgent('agent_a');
      await messageBroker.registerAgent('agent_b');

      // Agent B listens and responds
      messageBroker.on('message:agent_b', async (msg: any) => {
        if (msg.correlationId) {
          await messageBroker.sendMessage({
            from: 'agent_b',
            to: 'agent_a',
            type: 'result',
            payload: { result: 'success', data: 'analyzed' },
            correlationId: msg.correlationId
          });
        }
      });

      // Agent A sends and waits
      const response = await messageBroker.sendAndWait({
        from: 'agent_a',
        to: 'agent_b',
        type: 'task',
        payload: { action: 'analyze' }
      }, 5000);

      expect(response.result).toBe('success');
      expect(response.data).toBe('analyzed');
    });

    test('broadcast reaches all agents', async () => {
      await messageBroker.registerAgent('agent_1');
      await messageBroker.registerAgent('agent_2');
      await messageBroker.registerAgent('agent_3');

      const receivedBy: string[] = [];

      messageBroker.on('message', (msg: any) => {
        if (msg.to === 'broadcast') {
          receivedBy.push(msg.from);
        }
      });

      await messageBroker.broadcast({
        from: 'system',
        type: 'status',
        payload: { announcement: 'maintenance' }
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(receivedBy).toContain('system');
    });
  });

  describe('Checkpoint Flow: Agent → User', () => {
    test('forwards checkpoint from agent to user via WebSocket', async () => {
      await messageBroker.registerAgent('data_scientist');

      let broadcastedEvent: any = null;

      realtimeServer.on('broadcast', (data: any) => {
        broadcastedEvent = data.event;
      });

      // Agent sends checkpoint
      const checkpoint = {
        checkpointId: 'cp_123',
        projectId: 'proj_456',
        agentId: 'data_scientist',
        step: 'schema_validation',
        question: 'Approve detected schema?',
        options: ['Approve', 'Modify', 'Reject'],
        artifacts: [{ type: 'schema', data: { columns: ['id', 'name'] } }],
        timestamp: new Date()
      };

      await messageBroker.sendCheckpoint(checkpoint);

      // Wait for bridge to forward to WebSocket (Redis pub/sub + async DB lookup)
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(broadcastedEvent).not.toBeNull();
      expect(broadcastedEvent.data.eventType).toBe('agent_checkpoint');
      expect(broadcastedEvent.data.checkpoint.checkpointId).toBe('cp_123');
    });

    test('includes checkpoint artifacts in WebSocket event', async () => {
      await messageBroker.registerAgent('technical_agent');

      let broadcastedEvent: any = null;

      realtimeServer.on('broadcast', (data: any) => {
        broadcastedEvent = data.event;
      });

      const checkpoint = {
        checkpointId: 'cp_artifacts',
        projectId: 'proj_123',
        agentId: 'technical_agent',
        step: 'methodology_review',
        question: 'Approve analysis methodology?',
        options: ['Approve', 'Reject'],
        artifacts: [
          { type: 'methodology', data: { steps: ['clean', 'analyze', 'visualize'] } },
          { type: 'timeline', data: { estimatedDuration: '2 hours' } }
        ],
        timestamp: new Date()
      };

      await messageBroker.sendCheckpoint(checkpoint);
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(broadcastedEvent.data.checkpoint.artifacts).toHaveLength(2);
    });
  });

  describe('Checkpoint Flow: User → Agent', () => {
    test('forwards user response from WebSocket to agent', async () => {
      const checkpointId = 'cp_user_response';

      // Simulate agent waiting for checkpoint
      const responsePromise = messageBroker.waitForCheckpointResponse(checkpointId, 5000);

      // Simulate user response via WebSocket
      await new Promise(resolve => setTimeout(resolve, 100));

      realtimeServer.emit('client_message', {
        type: 'checkpoint_response',
        checkpointId,
        approved: true,
        feedback: 'Schema looks good'
      });

      // Wait for response
      const response = await responsePromise;

      expect(response.approved).toBe(true);
      expect(response.feedback).toBe('Schema looks good');
    });

    test('handles checkpoint rejection from user', async () => {
      const checkpointId = 'cp_rejection';

      const responsePromise = messageBroker.waitForCheckpointResponse(checkpointId, 5000);

      await new Promise(resolve => setTimeout(resolve, 100));

      realtimeServer.emit('client_message', {
        type: 'checkpoint_response',
        checkpointId,
        approved: false,
        feedback: 'Schema needs modifications'
      });

      const response = await responsePromise;

      expect(response.approved).toBe(false);
      expect(response.feedback).toBe('Schema needs modifications');
    });

    test('handles checkpoint modifications from user', async () => {
      const checkpointId = 'cp_modifications';

      const responsePromise = messageBroker.waitForCheckpointResponse(checkpointId, 5000);

      await new Promise(resolve => setTimeout(resolve, 100));

      realtimeServer.emit('client_message', {
        type: 'checkpoint_response',
        checkpointId,
        approved: true,
        modifications: {
          schema: { addColumn: 'email', removeColumn: 'legacy_id' }
        }
      });

      const response = await responsePromise;

      expect(response.approved).toBe(true);
      expect(response.modifications.schema.addColumn).toBe('email');
    });
  });

  describe('Agent Status Broadcasting', () => {
    test('broadcasts agent status updates', async () => {
      await messageBroker.registerAgent('test_agent');

      let broadcastedEvent: any = null;

      realtimeServer.on('broadcast', (data: any) => {
        if (data.event.data?.eventType === 'agent_status') {
          broadcastedEvent = data.event;
        }
      });

      messageBroker.updateAgentStatus('test_agent', {
        status: 'busy',
        currentTask: 'analysis',
        queuedTasks: 3
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(broadcastedEvent).not.toBeNull();
      expect(broadcastedEvent.data.status).toBe('busy');
      expect(broadcastedEvent.data.currentTask).toBe('analysis');
    });
  });

  describe('Error Handling', () => {
    test('handles agent errors and forwards to user', async () => {
      await messageBroker.registerAgent('error_agent');

      let broadcastedEvent: any = null;

      realtimeServer.on('broadcast', (data: any) => {
        if (data.event.type === 'error') {
          broadcastedEvent = data.event;
        }
      });

      await messageBroker.sendMessage({
        from: 'error_agent',
        to: 'user_interface',
        type: 'error',
        payload: {
          message: 'Analysis failed',
          error: 'Invalid schema format',
          projectId: 'proj_123'
        }
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(broadcastedEvent).not.toBeNull();
      expect(broadcastedEvent.data.eventType).toBe('agent_error');
      expect(broadcastedEvent.data.error).toContain('Analysis failed');
    });
  });

  describe('Performance & Reliability', () => {
    test('handles concurrent checkpoint requests', async () => {
      const checkpoints = [
        { id: 'cp_1', approved: true },
        { id: 'cp_2', approved: false },
        { id: 'cp_3', approved: true }
      ];

      const promises = checkpoints.map(cp =>
        messageBroker.waitForCheckpointResponse(cp.id, 5000)
      );

      // Simulate user responses
      await new Promise(resolve => setTimeout(resolve, 100));

      for (const cp of checkpoints) {
        realtimeServer.emit('client_message', {
          type: 'checkpoint_response',
          checkpointId: cp.id,
          approved: cp.approved
        });
      }

      const responses = await Promise.all(promises);

      expect(responses[0].approved).toBe(true);
      expect(responses[1].approved).toBe(false);
      expect(responses[2].approved).toBe(true);
    });

    test('message delivery is fast (<200ms)', async () => {
      await messageBroker.registerAgent('fast_agent');

      const startTime = Date.now();

      await messageBroker.sendMessage({
        from: 'test',
        to: 'fast_agent',
        type: 'ping',
        payload: {}
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      // Allow up to 200ms for CI environments with variable load
      expect(latency).toBeLessThan(200);
    });
  });

  describe('Bridge Health Monitoring', () => {
    test('bridge is healthy when broker is connected', async () => {
      const healthy = await agentBridge.isHealthy();
      expect(healthy).toBe(true);
    });

    test('bridge stats include pending checkpoints', async () => {
      // Create pending checkpoint
      messageBroker.waitForCheckpointResponse('cp_pending', 10000).catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = agentBridge.getStats();
      expect(stats.pendingCheckpoints).toBeGreaterThan(0);
      expect(stats.messageBrokerStats).toBeDefined();
    });
  });
});
