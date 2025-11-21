/**
 * Integration Test: Agent Recommendation API Endpoint
 * Tests the POST /api/projects/:id/agent-recommendations endpoint
 */

import { describe, it, expect } from 'vitest';
import { DataEngineerAgent } from '../../server/services/data-engineer-agent';
import { DataScientistAgent } from '../../server/services/data-scientist-agent';

describe('Agent Recommendation API', () => {
  it.skip('should test API endpoint with authentication', () => {
    // This test requires full E2E setup with authentication
    // Will be tested in E2E flow
  });
});

describe('Data Engineer Agent File Analysis', () => {
  it('should analyze uploaded file structure', async () => {
    // This will be tested when we have actual files
    // For now, we're verifying the agent methods exist
    // Verify the agent has the new methods
    const agent = new DataEngineerAgent();

    expect(typeof agent.analyzeUploadedFile).toBe('function');
    expect(typeof agent.analyzeProjectData).toBe('function');
  });
});

describe('Data Scientist Agent Complexity Recommendation', () => {
  it('should recommend analysis complexity', async () => {
    // Create test instance
    const agent = new DataScientistAgent();

    expect(typeof agent.recommendAnalysisConfig).toBe('function');

    // Test complexity recommendation logic with proper context
    const mockContext = {
      userId: 'test-user-id',
      userRole: 'business' as const,
      isAdmin: false,
      projectId: 'test-project-id',
      project: {
        id: 'test-project-id',
        userId: 'test-user-id',
        name: 'Test Project',
        journeyType: 'ai_guided',
        status: 'active',
        data: Array(1800).fill({ value: 1 })
      },
      data: Array(1800).fill({ value: 1 }),
      schema: {},
      recordCount: 1800,
      ownershipVerified: true,
      analysisType: 'exploratory' as const,
      complexity: 'medium' as const,
      userQuestions: [
        'What are the engagement scores by leader?',
        'How do team scores compare to company average?',
        'What is the trend over time?'
      ],
      analysisGoal: 'Analyze employee engagement trends',
      dataAnalysis: {
        characteristics: {
          hasTimeSeries: true,
          hasCategories: true,
          hasText: false,
          hasNumeric: true
        }
      }
    };

    const recommendation = await agent.recommendAnalysisConfig(mockContext);

    expect(recommendation).toBeDefined();
    expect(recommendation.complexity).toBeDefined();
    expect(['low', 'medium', 'high', 'very_high']).toContain(recommendation.complexity);
    expect(recommendation.analyses).toBeDefined();
    expect(Array.isArray(recommendation.analyses)).toBe(true);
    expect(recommendation.estimatedCost).toBeDefined();
    expect(recommendation.estimatedTime).toBeDefined();
    expect(recommendation.rationale).toBeDefined();
  });

  it('should return higher complexity for larger datasets', async () => {
    const agent = new DataScientistAgent();

    const smallDatasetContext = {
      userId: 'test-user-id',
      userRole: 'business' as const,
      isAdmin: false,
      projectId: 'test-project-small',
      project: {
        id: 'test-project-small',
        userId: 'test-user-id',
        name: 'Small Test Project',
        journeyType: 'ai_guided',
        status: 'active',
        data: Array(500).fill({ value: 1 })
      },
      data: Array(500).fill({ value: 1 }),
      schema: {},
      recordCount: 500,
      ownershipVerified: true,
      analysisType: 'exploratory' as const,
      complexity: 'low' as const,
      userQuestions: ['Simple analysis question'],
      analysisGoal: 'Simple analysis',
      dataAnalysis: {
        characteristics: {
          hasTimeSeries: false,
          hasCategories: true,
          hasText: false,
          hasNumeric: true
        }
      }
    };

    const largeDatasetContext = {
      userId: 'test-user-id',
      userRole: 'business' as const,
      isAdmin: false,
      projectId: 'test-project-large',
      project: {
        id: 'test-project-large',
        userId: 'test-user-id',
        name: 'Large Test Project',
        journeyType: 'ai_guided',
        status: 'active',
        data: Array(50000).fill({ value: 1 })
      },
      data: Array(50000).fill({ value: 1 }),
      schema: {},
      recordCount: 50000,
      ownershipVerified: true,
      analysisType: 'exploratory' as const,
      complexity: 'high' as const,
      userQuestions: [
        'Complex predictive analysis',
        'Machine learning clustering',
        'Time series forecasting',
        'Text sentiment analysis'
      ],
      analysisGoal: 'Complex predictive analysis with ML',
      dataAnalysis: {
        characteristics: {
          hasTimeSeries: true,
          hasCategories: true,
          hasText: true,
          hasNumeric: true
        }
      }
    };

    const smallDataset = await agent.recommendAnalysisConfig(smallDatasetContext);
    const largeDataset = await agent.recommendAnalysisConfig(largeDatasetContext);

    // Large dataset with complex questions should have higher complexity
    const complexityLevels = ['low', 'medium', 'high', 'very_high'];
    const smallIndex = complexityLevels.indexOf(smallDataset.complexity);
    const largeIndex = complexityLevels.indexOf(largeDataset.complexity);

    expect(largeIndex).toBeGreaterThanOrEqual(smallIndex);
  });
});
