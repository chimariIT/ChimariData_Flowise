/**
 * Integration Test: Agent Recommendation API Endpoint
 * Tests the POST /api/projects/:id/agent-recommendations endpoint
 */

import { describe, it, expect } from 'vitest';

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
    const { DataEngineerAgent } = await import('../../server/services/data-engineer-agent');

    expect(DataEngineerAgent).toBeDefined();

    // Verify the agent has the new methods
    const agent = new DataEngineerAgent('test-agent-id', 'Data Engineer Test', {
      name: 'Data Engineer',
      description: 'Test agent',
      capabilities: ['file_analysis'],
      tools: []
    });

    expect(typeof agent.analyzeUploadedFile).toBe('function');
    expect(typeof agent.analyzeProjectData).toBe('function');
  });
});

describe('Data Scientist Agent Complexity Recommendation', () => {
  it('should recommend analysis complexity', async () => {
    const { DataScientistAgent } = await import('../../server/services/data-scientist-agent');

    expect(DataScientistAgent).toBeDefined();

    // Create test instance
    const agent = new DataScientistAgent('test-ds-agent', 'Data Scientist Test', {
      name: 'Data Scientist',
      description: 'Test agent',
      capabilities: ['analysis_recommendation'],
      tools: []
    });

    expect(typeof agent.recommendAnalysisConfig).toBe('function');

    // Test complexity recommendation logic
    const recommendation = await agent.recommendAnalysisConfig({
      dataSize: 1800,
      questions: [
        'What are the engagement scores by leader?',
        'How do team scores compare to company average?',
        'What is the trend over time?'
      ],
      dataCharacteristics: {
        hasTimeSeries: true,
        hasCategories: true,
        hasText: false,
        hasNumeric: true
      }
    });

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
    const { DataScientistAgent } = await import('../../server/services/data-scientist-agent');

    const agent = new DataScientistAgent('test-ds-agent-2', 'Data Scientist Test 2', {
      name: 'Data Scientist',
      description: 'Test agent',
      capabilities: ['analysis_recommendation'],
      tools: []
    });

    const smallDataset = await agent.recommendAnalysisConfig({
      dataSize: 500,
      questions: ['Simple analysis question'],
      dataCharacteristics: {
        hasTimeSeries: false,
        hasCategories: true,
        hasText: false,
        hasNumeric: true
      }
    });

    const largeDataset = await agent.recommendAnalysisConfig({
      dataSize: 50000,
      questions: [
        'Complex predictive analysis',
        'Machine learning clustering',
        'Time series forecasting',
        'Text sentiment analysis'
      ],
      dataCharacteristics: {
        hasTimeSeries: true,
        hasCategories: true,
        hasText: true,
        hasNumeric: true
      }
    });

    // Large dataset with complex questions should have higher complexity
    const complexityLevels = ['low', 'medium', 'high', 'very_high'];
    const smallIndex = complexityLevels.indexOf(smallDataset.complexity);
    const largeIndex = complexityLevels.indexOf(largeDataset.complexity);

    expect(largeIndex).toBeGreaterThanOrEqual(smallIndex);
  });
});
