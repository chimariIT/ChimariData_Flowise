import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { getFlexibleDatabase } from '../../server/db-flexible';
import { users, projects } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { ProjectManagerAgent } from '../../server/services/project-manager-agent';
import { DataEngineerAgent } from '../../server/services/data-engineer-agent';
import { DataScientistAgent } from '../../server/services/data-scientist-agent';
import { BusinessAgent } from '../../server/services/business-agent';

describe('System Performance Benchmarks', () => {
  let db: any;
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    db = await getFlexibleDatabase();

    // Create test user and project for performance tests
    testUserId = randomUUID();
    testProjectId = randomUUID();
    
    await db.insert(users).values({
      id: testUserId,
      email: `perf-test-${testUserId}@example.com`,
      subscriptionTier: 'professional',
      userRole: 'technical',
      technicalLevel: 'advanced'
    });

    await db.insert(projects).values({
      id: testProjectId,
      userId: testUserId,
      ownerId: testUserId,
      name: 'Performance Test Project',
      status: 'draft',
      journeyType: 'self_service'
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('Database Performance', () => {
    test('user creation performance', async () => {
      const start = Date.now();
      
      const userId = randomUUID();
      await db.insert(users).values({
        id: userId,
        email: `perf-user-${userId}@example.com`,
        subscriptionTier: 'starter',
        userRole: 'business'
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50); // Should create user in <50ms

      // Cleanup
      await db.delete(users).where(eq(users.id, userId));
    });

    test('project creation performance', async () => {
      const start = Date.now();
      
      const projectId = randomUUID();
      await db.insert(projects).values({
        id: projectId,
        userId: testUserId,
        ownerId: testUserId,
        name: 'Performance Test Project',
        status: 'draft',
        journeyType: 'ai_guided'
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(30); // Should create project in <30ms

      // Cleanup
      await db.delete(projects).where(eq(projects.id, projectId));
    });

    test('user query performance', async () => {
      const start = Date.now();
      
      const result = await db.select().from(users).where(eq(users.id, testUserId));
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(20); // Should query user in <20ms
      expect(result).toHaveLength(1);
    });

    test('project query performance', async () => {
      const start = Date.now();
      
      const result = await db.select().from(projects).where(eq(projects.id, testProjectId));
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(15); // Should query project in <15ms
      expect(result).toHaveLength(1);
    });

    test('bulk user creation performance', async () => {
      const start = Date.now();
      
      const userIds = Array.from({ length: 100 }, () => randomUUID());
      const userData = userIds.map(id => ({
        id,
        email: `bulk-user-${id}@example.com`,
        subscriptionTier: 'trial' as const,
        userRole: 'non-tech' as const
      }));

      await db.insert(users).values(userData);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // Should create 100 users in <500ms

      // Cleanup
      for (const userId of userIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
    });
  });

  describe('Agent Performance', () => {
    let pmAgent: ProjectManagerAgent;
    let deAgent: DataEngineerAgent;
    let dsAgent: DataScientistAgent;
    let baAgent: BusinessAgent;

    beforeAll(async () => {
      pmAgent = new ProjectManagerAgent();
      deAgent = new DataEngineerAgent();
      dsAgent = new DataScientistAgent();
      baAgent = new BusinessAgent();

      await pmAgent.initialize();
    });

    test('Project Manager Agent initialization performance', async () => {
      const start = Date.now();
      
      const agent = new ProjectManagerAgent();
      await agent.initialize();
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // Should initialize in <2s
    });

    test('Data Engineer Agent data quality assessment performance', async () => {
      const start = Date.now();
      
      const testData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 100,
        category: i % 5 === 0 ? null : `Category ${i % 5}`
      }));

      const schema = {
        id: { type: 'number' },
        name: { type: 'string' },
        value: { type: 'number' },
        category: { type: 'string' }
      };

      const result = await deAgent.assessDataQuality(testData, schema);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should assess 1000 rows in <1s
  expect(result.overallScore).toBeGreaterThan(0);
    });

    test('Data Scientist Agent feasibility check performance', async () => {
      const start = Date.now();
      
      const goals = ['customer segmentation', 'revenue prediction', 'churn analysis'];
      const schema = {
        customer_id: { type: 'string' },
        purchase_amount: { type: 'number' },
        frequency: { type: 'number' },
        last_purchase: { type: 'date' }
      };

      const result = await dsAgent.checkFeasibility(goals, schema, 0.85);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // Should check feasibility in <500ms
      expect(result.feasible).toBeDefined();
    });

    test('Business Agent impact assessment performance', async () => {
      const start = Date.now();
      
      const goals = ['increase customer retention', 'optimize pricing strategy'];
  const result = await baAgent.assessBusinessImpact(goals, { method: 'rfm_analysis' }, 'retail');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(300); // Should assess impact in <300ms
      expect(result.businessValue).toBeDefined();
    });

    test('Multi-agent coordination performance', async () => {
      const start = Date.now();
      
      const testData = Array.from({ length: 500 }, (_, i) => ({
        id: i,
        customer_id: `CUST_${i}`,
        purchase_amount: Math.random() * 1000,
        frequency: Math.floor(Math.random() * 10) + 1
      }));

      const result = await pmAgent.coordinateGoalAnalysis(
        testProjectId,
        testData,
        ['customer segmentation', 'revenue analysis'],
        'retail'
      );
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should coordinate in <5s
      expect(result.expertOpinions).toHaveLength(3); // PM, DE, DS, BA
    });
  });

  describe('Memory Usage Benchmarks', () => {
    test('agent memory usage stays reasonable', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create multiple agents
      const agents = Array.from({ length: 10 }, () => new ProjectManagerAgent());
      
      const afterCreation = process.memoryUsage();
      const memoryIncrease = afterCreation.heapUsed - initialMemory.heapUsed;
      
      // Should not increase memory usage by more than 50MB
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('database connection pool efficiency', async () => {
      const start = Date.now();
      
      // Perform multiple concurrent database operations
      const promises = Array.from({ length: 20 }, async (_, i) => {
        const userId = randomUUID();
        await db.insert(users).values({
          id: userId,
          email: `concurrent-user-${i}-${userId}@example.com`,
          subscriptionTier: 'trial',
          userRole: 'non-tech'
        });
        return userId;
      });

      const userIds = await Promise.all(promises);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should handle 20 concurrent operations in <1s

      // Cleanup
      for (const userId of userIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
    });
  });

  describe('Scalability Benchmarks', () => {
    test('handles large dataset processing', async () => {
      const start = Date.now();
      
      // Create a large dataset
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        timestamp: new Date().toISOString(),
        value: Math.random() * 1000,
        category: `Category_${i % 100}`,
        processed: i % 2 === 0
      }));

      const schema = {
        id: { type: 'number' },
        timestamp: { type: 'string' },
        value: { type: 'number' },
        category: { type: 'string' },
        processed: { type: 'boolean' }
      };

      const deAgent = new DataEngineerAgent();
      const result = await deAgent.assessDataQuality(largeDataset, schema);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // Should process 10k rows in <2s
  expect(result.overallScore).toBeGreaterThan(0);
    });

    test('concurrent agent operations', async () => {
      const start = Date.now();
      
      const operations = Array.from({ length: 5 }, async (_, i) => {
        const agent = new DataEngineerAgent();
        const testData = Array.from({ length: 100 }, (_, j) => ({
          id: j,
          value: Math.random() * 100
        }));
        
        return agent.assessDataQuality(testData, { id: { type: 'number' }, value: { type: 'number' } });
      });

      const results = await Promise.all(operations);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should handle 5 concurrent operations in <1s
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.overallScore).toBeGreaterThan(0);
      });
    });
  });

  describe('Response Time Benchmarks', () => {
    test('API response time targets', async () => {
      // Simulate API operations with timing
      const operations = [
        { name: 'User Creation', target: 50 },
        { name: 'Project Creation', target: 30 },
        { name: 'Data Quality Assessment', target: 200 },
        { name: 'Feasibility Check', target: 150 },
        { name: 'Business Impact Assessment', target: 100 }
      ];

      for (const op of operations) {
        const start = Date.now();
        
        switch (op.name) {
          case 'User Creation':
            const userId = randomUUID();
            await db.insert(users).values({
              id: userId,
              email: `api-test-${userId}@example.com`,
              subscriptionTier: 'starter',
              userRole: 'business'
            });
            await db.delete(users).where(eq(users.id, userId));
            break;
            
          case 'Project Creation':
            const projectId = randomUUID();
            await db.insert(projects).values({
              id: projectId,
              userId: testUserId,
              ownerId: testUserId,
              name: 'API Test Project',
              status: 'draft',
              journeyType: 'template_based'
            });
            await db.delete(projects).where(eq(projects.id, projectId));
            break;
            
          case 'Data Quality Assessment':
            const deAgent = new DataEngineerAgent();
            await deAgent.assessDataQuality(
              Array.from({ length: 100 }, (_, i) => ({ id: i, value: Math.random() })),
              { id: { type: 'number' }, value: { type: 'number' } }
            );
            break;
            
          case 'Feasibility Check':
            const dsAgent = new DataScientistAgent();
            await dsAgent.checkFeasibility(['test goal'], { test: { type: 'string' } }, 0.8);
            break;
            
          case 'Business Impact Assessment':
            const baAgent = new BusinessAgent();
            await baAgent.assessBusinessImpact(['test goal'], { method: 'rfm_analysis' }, 'retail');
            break;
        }
        
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(op.target);
      }
    });
  });
});
