/**
 * Unit Tests: Message Broker
 *
 * Tests the AgentMessageBroker pub/sub logic without Redis dependency
 * Uses EventEmitter mocking for fast unit testing
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock Redis
vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis extends EventEmitter {
      async subscribe(...channels: string[]): Promise<void> {
        for (const channel of channels) {
          this.emit('subscribe', channel, 1);
        }
      }

      async unsubscribe(...channels: string[]): Promise<void> {
        for (const channel of channels) {
          this.emit('unsubscribe', channel, 0);
        }
      }

      async publish(channel: string, message: string): Promise<number> {
        // Simulate message delivery
        setImmediate(() => {
          this.emit('message', channel, message);
        });
        return 1;
      }

      async ping(): Promise<'PONG'> {
        return 'PONG';
      }

      async quit(): Promise<'OK'> {
        return 'OK';
      }
    }
  };
});

// Import after mocking
import { AgentMessageBroker, AgentMessage, AgentCheckpoint } from '../../../server/services/agents/message-broker';

describe('AgentMessageBroker', () => {
  let broker: AgentMessageBroker;

  beforeEach(() => {
    broker = new AgentMessageBroker();
  });

  afterEach(async () => {
    await broker.shutdown();
  });

  describe('Agent Registration', () => {
    test('registers agent successfully', async () => {
      await broker.registerAgent('test_agent');

      const stats = broker.getStats();
      expect(stats.registeredAgents).toBe(1);
    });

    test('unregisters agent successfully', async () => {
      await broker.registerAgent('test_agent');
      await broker.unregisterAgent('test_agent');

      const stats = broker.getStats();
      expect(stats.registeredAgents).toBe(0);
    });

    test('tracks agent status on registration', async () => {
      await broker.registerAgent('test_agent');

      const status = broker.getAgentStatus('test_agent');
      expect(status).not.toBeNull();
      expect(status?.agentId).toBe('test_agent');
      expect(status?.status).toBe('idle');
      expect(status?.activeConnections).toBe(1);
    });
  });

  describe('Message Sending', () => {
    test('sends message successfully', async () => {
      const message = {
        from: 'agent_a',
        to: 'agent_b',
        type: 'task' as const,
        payload: { action: 'process_data' }
      };

      await broker.sendMessage(message);

      // Message should have ID and timestamp
      // Check via event listener
      let receivedMessage: AgentMessage | null = null;
      broker.on('message_sent', (msg: AgentMessage) => {
        receivedMessage = msg;
      });

      await broker.sendMessage(message);

      // Wait for async event
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedMessage).not.toBeNull();
      expect(receivedMessage?.from).toBe('agent_a');
      expect(receivedMessage?.to).toBe('agent_b');
    });

    test('broadcasts to all agents', async () => {
      const message = {
        from: 'agent_a',
        type: 'status' as const,
        payload: { status: 'busy' }
      };

      await broker.broadcast(message);

      // Should send to 'broadcast' channel
      let receivedMessage: AgentMessage | null = null;
      broker.on('message_sent', (msg: AgentMessage) => {
        receivedMessage = msg;
      });

      await broker.broadcast(message);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedMessage?.to).toBe('broadcast');
    });
  });

  describe('Request-Response Pattern', () => {
    test('sendAndWait receives response', async () => {
      const message = {
        from: 'agent_a',
        to: 'agent_b',
        type: 'task' as const,
        payload: { action: 'analyze' }
      };

      // Simulate response after 100ms
      setTimeout(() => {
        broker.emit('message', {
          from: 'agent_b',
          to: 'agent_a',
          type: 'result',
          payload: { result: 'success' },
          correlationId: message.correlationId
        });
      }, 100);

      const response = await broker.sendAndWait(message, 1000);
      expect(response).toEqual({ result: 'success' });
    });

    test('sendAndWait times out if no response', async () => {
      const message = {
        from: 'agent_a',
        to: 'agent_b',
        type: 'task' as const,
        payload: { action: 'analyze' }
      };

      await expect(broker.sendAndWait(message, 100)).rejects.toThrow('timeout');
    });
  });

  describe('Checkpoint Flow', () => {
    test('sends checkpoint and waits for response', async () => {
      const checkpoint: AgentCheckpoint = {
        checkpointId: 'cp_123',
        projectId: 'proj_456',
        agentId: 'data_scientist',
        step: 'schema_validation',
        question: 'Approve detected schema?',
        options: ['Approve', 'Modify', 'Reject'],
        artifacts: [{ type: 'schema', data: { columns: ['id', 'name'] } }],
        timestamp: new Date()
      };

      // Send checkpoint
      const checkpointId = await broker.sendCheckpoint(checkpoint);
      expect(checkpointId).toBe('cp_123');

      // Simulate user response after 200ms
      setTimeout(() => {
        broker.submitCheckpointResponse(checkpointId, {
          approved: true,
          feedback: 'Looks good!'
        });
      }, 200);

      // Wait for response
      const response = await broker.waitForCheckpointResponse(checkpointId, 5000);
      expect(response.approved).toBe(true);
      expect(response.feedback).toBe('Looks good!');
    });

    test('checkpoint times out if user does not respond', async () => {
      const checkpoint: AgentCheckpoint = {
        checkpointId: 'cp_timeout',
        projectId: 'proj_456',
        agentId: 'data_scientist',
        step: 'schema_validation',
        question: 'Approve schema?',
        options: ['Approve', 'Reject'],
        timestamp: new Date()
      };

      await broker.sendCheckpoint(checkpoint);

      await expect(
        broker.waitForCheckpointResponse('cp_timeout', 100)
      ).rejects.toThrow('timeout');
    });

    test('handles checkpoint rejection', async () => {
      const checkpointId = 'cp_reject';

      setTimeout(() => {
        broker.submitCheckpointResponse(checkpointId, {
          approved: false,
          feedback: 'Schema incorrect'
        });
      }, 50);

      const response = await broker.waitForCheckpointResponse(checkpointId, 1000);
      expect(response.approved).toBe(false);
      expect(response.feedback).toBe('Schema incorrect');
    });

    test('handles checkpoint modifications', async () => {
      const checkpointId = 'cp_modify';

      setTimeout(() => {
        broker.submitCheckpointResponse(checkpointId, {
          approved: true,
          modifications: {
            schema: { addColumn: 'email' }
          }
        });
      }, 50);

      const response = await broker.waitForCheckpointResponse(checkpointId, 1000);
      expect(response.approved).toBe(true);
      expect(response.modifications).toEqual({ schema: { addColumn: 'email' } });
    });
  });

  describe('Agent Status Tracking', () => {
    test('updates agent status', () => {
      broker.updateAgentStatus('test_agent', {
        status: 'busy',
        currentTask: 'analysis',
        queuedTasks: 3
      });

      const status = broker.getAgentStatus('test_agent');
      expect(status?.status).toBe('busy');
      expect(status?.currentTask).toBe('analysis');
      expect(status?.queuedTasks).toBe(3);
    });

    test('returns all agent statuses', async () => {
      await broker.registerAgent('agent_1');
      await broker.registerAgent('agent_2');

      broker.updateAgentStatus('agent_1', { status: 'busy' });
      broker.updateAgentStatus('agent_2', { status: 'idle' });

      const allStatuses = broker.getAllAgentStatuses();
      expect(allStatuses).toHaveLength(2);
      expect(allStatuses.find(s => s.agentId === 'agent_1')?.status).toBe('busy');
      expect(allStatuses.find(s => s.agentId === 'agent_2')?.status).toBe('idle');
    });

    test('updates last activity timestamp', () => {
      const beforeTime = new Date();

      broker.updateAgentStatus('test_agent', { status: 'busy' });

      const status = broker.getAgentStatus('test_agent');
      const afterTime = new Date();

      expect(status?.lastActivity.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(status?.lastActivity.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('Message Priority', () => {
    test('accepts priority levels', async () => {
      const message = {
        from: 'agent_a',
        to: 'agent_b',
        type: 'task' as const,
        payload: { action: 'urgent_analysis' },
        priority: 'urgent' as const
      };

      await broker.sendMessage(message);

      let receivedMessage: AgentMessage | null = null;
      broker.on('message_sent', (msg: AgentMessage) => {
        receivedMessage = msg;
      });

      await broker.sendMessage(message);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedMessage?.priority).toBe('urgent');
    });
  });

  describe('Message TTL', () => {
    test('accepts TTL parameter', async () => {
      const message = {
        from: 'agent_a',
        to: 'agent_b',
        type: 'task' as const,
        payload: { action: 'quick_task' },
        ttl: 60 // 60 seconds
      };

      await broker.sendMessage(message);

      let receivedMessage: AgentMessage | null = null;
      broker.on('message_sent', (msg: AgentMessage) => {
        receivedMessage = msg;
      });

      await broker.sendMessage(message);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedMessage?.ttl).toBe(60);
    });
  });

  describe('Health Checks', () => {
    test('isHealthy returns true when connected', async () => {
      const healthy = await broker.isHealthy();
      expect(healthy).toBe(true);
    });

    test('getStats returns broker statistics', async () => {
      await broker.registerAgent('agent_1');
      await broker.registerAgent('agent_2');

      const stats = broker.getStats();

      expect(stats.registeredAgents).toBe(2);
      expect(stats.channels).toBe(3); // 2 agents + 1 broadcast
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('emits parse_error on invalid JSON', () => {
      let errorEmitted = false;

      broker.on('parse_error', () => {
        errorEmitted = true;
      });

      // Simulate invalid message
      const invalidMessage = 'not-valid-json';
      (broker as any).handleMessage('agent:test', invalidMessage);

      expect(errorEmitted).toBe(true);
    });
  });

  describe('Correlation IDs', () => {
    test('generates unique correlation IDs', async () => {
      const correlationIds = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const message = {
          from: 'agent_a',
          to: 'agent_b',
          type: 'task' as const,
          payload: { index: i }
        };

        broker.on('message_sent', (msg: AgentMessage) => {
          if (msg.correlationId) {
            correlationIds.add(msg.correlationId);
          }
        });

        await broker.sendAndWait(message, 10).catch(() => {}); // Ignore timeout
      }

      expect(correlationIds.size).toBe(10);
    });
  });

  describe('Shutdown', () => {
    test('clears all resources on shutdown', async () => {
      await broker.registerAgent('agent_1');
      await broker.registerAgent('agent_2');

      await broker.shutdown();

      const stats = broker.getStats();
      expect(stats.registeredAgents).toBe(0);
      expect(stats.pendingResponses).toBe(0);
    });
  });
});
