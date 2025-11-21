import { describe, it, expect } from 'vitest';
import { buildAgentContext } from '../../../server/utils/agent-context';

describe('buildAgentContext', () => {
  it('maps user and project fields into the execution context snapshot', () => {
    const user = {
      id: 'user_123',
      email: 'owner@example.com',
      userRole: 'business',
      isAdmin: true,
      subscriptionTier: 'enterprise'
    };

    const project = {
      id: 'project_456',
      userId: 'user_123',
      name: 'Growth Plan',
      description: 'AI-driven growth experiments',
      journeyType: 'ai_guided',
      status: 'active',
      data: [{ id: 1 }, { id: 2 }],
      schema: { fields: [{ name: 'id' }] },
      transformedData: [{ id: 1, normalized: true }]
    };

    const context = buildAgentContext(user, project);

    expect(context).toMatchObject({
      userId: 'user_123',
      userEmail: 'owner@example.com',
      userRole: 'business',
      isAdmin: true,
      subscriptionTier: 'enterprise',
      projectId: 'project_456',
      project: {
        id: 'project_456',
        userId: 'user_123',
        name: 'Growth Plan',
        description: 'AI-driven growth experiments',
        journeyType: 'ai_guided',
        status: 'active',
        data: [{ id: 1 }, { id: 2 }],
        schema: { fields: [{ name: 'id' }] },
        transformedData: [{ id: 1, normalized: true }]
      },
      data: [{ id: 1 }, { id: 2 }],
      schema: { fields: [{ name: 'id' }] },
      recordCount: 2,
      ownershipVerified: true,
      source: 'api'
    });

    expect(context.timestamp).toBeInstanceOf(Date);
  });

  it('defaults optional values for users without roles or projects without data', () => {
    const user = {
      id: 'user_anon',
      email: 'anon@example.com'
    };

    const project = {
      id: 'project_sparse',
      userId: 'user_anon',
      name: 'Sparse Project'
    };

    const context = buildAgentContext(user, project);

    expect(context.userRole).toBe('non-tech');
    expect(context.isAdmin).toBe(false);
    expect(context.data).toEqual([]);
    expect(context.schema).toEqual({});
    expect(context.recordCount).toBe(0);
    expect(context.project).toMatchObject({
      id: 'project_sparse',
      userId: 'user_anon',
      name: 'Sparse Project'
    });
    expect(context.subscriptionTier).toBeUndefined();
  });
});
