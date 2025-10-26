/**
 * Integration Tests: Multi-Agent Coordination
 *
 * Tests the complete multi-agent coordination flow with PM orchestration
 * Includes parallel agent queries, synthesis, error handling, and checkpoint creation
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectManagerAgent } from '../../../server/services/project-manager-agent';
import { DataEngineerAgent } from '../../../server/services/data-engineer-agent';
import { DataScientistAgent } from '../../../server/services/data-scientist-agent';
import { BusinessAgent } from '../../../server/services/business-agent';

describe('Multi-Agent Coordination Integration', () => {
  let pmAgent: ProjectManagerAgent;
  let dataEngineer: DataEngineerAgent;
  let dataScientist: DataScientistAgent;
  let businessAgent: BusinessAgent;

  beforeEach(async () => {
    pmAgent = new ProjectManagerAgent();
    dataEngineer = new DataEngineerAgent();
    dataScientist = new DataScientistAgent();
    businessAgent = new BusinessAgent();
    
    // Initialize agents properly
    await pmAgent.initialize();
  });

  describe('coordinateGoalAnalysis', () => {
    test('queries all three agents in parallel', async () => {
      const projectId = 'test-project-123';
      const uploadedData = {
        fileName: 'customers.csv',
        rowCount: 10000,
        columns: ['customer_id', 'purchase_amount', 'frequency', 'recency'],
        schema: {
          customer_id: { type: 'string' },
          purchase_amount: { type: 'number' },
          frequency: { type: 'number' },
          recency: { type: 'number' }
        }
      };
      const userGoals = ['Identify customer segments for targeted marketing'];
      const industry = 'retail';

      const startTime = Date.now();
      const result = await pmAgent.coordinateGoalAnalysis(
        projectId,
        uploadedData,
        userGoals,
        industry
      );
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 35 seconds for parallel execution)
      expect(duration).toBeLessThan(35000);

      // Should have all three expert opinions
      expect(result.expertOpinions).toHaveLength(3);
      
      const agentIds = result.expertOpinions.map(o => o.agentId);
      expect(agentIds).toContain('data_engineer');
      expect(agentIds).toContain('data_scientist');
      expect(agentIds).toContain('business_agent');

      // Should have synthesis
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis.overallAssessment).toBeDefined();
      expect(result.synthesis.confidence).toBeGreaterThan(0);
      
      // Should have coordination metadata
      expect(result.coordinationId).toBeDefined();
      expect(result.projectId).toBe(projectId);
      expect(result.timestamp).toBeDefined();
      expect(result.totalResponseTime).toBeGreaterThan(0);
    }, 60000); // Increase timeout for integration test

    test('includes detailed expert opinions from each agent', async () => {
      const projectId = 'test-project-456';
      const uploadedData = {
        fileName: 'sales_data.csv',
        rowCount: 5000,
        columns: ['date', 'revenue', 'marketing_spend'],
        schema: {
          date: { type: 'string' },
          revenue: { type: 'number' },
          marketing_spend: { type: 'number' }
        }
      };
      const userGoals = ['Predict monthly revenue'];
      const industry = 'saas';

      const result = await pmAgent.coordinateGoalAnalysis(
        projectId,
        uploadedData,
        userGoals,
        industry
      );

      // Data Engineer opinion should have quality metrics
      const deOpinion = result.expertOpinions.find(o => o.agentId === 'data_engineer');
      expect(deOpinion).toBeDefined();
      expect(deOpinion?.opinion).toBeDefined();
      expect(deOpinion?.confidence).toBeGreaterThanOrEqual(0);
      expect(deOpinion?.responseTime).toBeGreaterThan(0);

      // Data Scientist opinion should have feasibility assessment
      const dsOpinion = result.expertOpinions.find(o => o.agentId === 'data_scientist');
      expect(dsOpinion).toBeDefined();
      expect(dsOpinion?.opinion).toBeDefined();
      expect(dsOpinion?.confidence).toBeGreaterThanOrEqual(0);

      // Business Agent opinion should have business impact
      const baOpinion = result.expertOpinions.find(o => o.agentId === 'business_agent');
      expect(baOpinion).toBeDefined();
      expect(baOpinion?.opinion).toBeDefined();
      expect(baOpinion?.confidence).toBeGreaterThanOrEqual(0);
    }, 60000);

    test('synthesizes opinions into unified recommendation', async () => {
      const projectId = 'test-project-789';
      const uploadedData = {
        fileName: 'customer_churn.csv',
        rowCount: 8000,
        columns: ['customer_id', 'tenure', 'monthly_charges', 'churn'],
        schema: {
          customer_id: { type: 'string' },
          tenure: { type: 'number' },
          monthly_charges: { type: 'number' },
          churn: { type: 'boolean' }
        }
      };
      const userGoals = ['Predict customer churn'];
      const industry = 'telecom';

      const result = await pmAgent.coordinateGoalAnalysis(
        projectId,
        uploadedData,
        userGoals,
        industry
      );

      const synthesis = result.synthesis;
      
      // Should have overall assessment
      expect(['proceed', 'proceed_with_caution', 'revise_approach', 'not_feasible'])
        .toContain(synthesis.overallAssessment);

      // Should have key findings from all agents
      expect(synthesis.keyFindings).toBeDefined();
      expect(synthesis.keyFindings.length).toBeGreaterThan(0);

      // Should have actionable recommendations
      expect(synthesis.actionableRecommendations).toBeDefined();
      expect(synthesis.actionableRecommendations.length).toBeGreaterThan(0);
      expect(synthesis.actionableRecommendations.length).toBeLessThanOrEqual(5);

      // Should have expert consensus
      expect(synthesis.expertConsensus).toBeDefined();
      expect(synthesis.expertConsensus.dataQuality).toMatch(/good|acceptable|poor/);
      expect(synthesis.expertConsensus.technicalFeasibility).toMatch(/feasible|challenging|not_feasible/);
      expect(synthesis.expertConsensus.businessValue).toMatch(/high|medium|low/);

      // Should have timeline estimate
      expect(synthesis.estimatedTimeline).toBeDefined();
      expect(synthesis.estimatedTimeline).toMatch(/\d+.*min/i);
    }, 60000);

    test('handles agent errors gracefully with fallback opinions', async () => {
      // Mock one agent to fail
      const originalMethod = dataEngineer.assessDataQuality;
      vi.spyOn(dataEngineer, 'assessDataQuality').mockRejectedValue(
        new Error('Agent temporarily unavailable')
      );

      const projectId = 'test-project-error';
      const uploadedData = {
        fileName: 'test.csv',
        rowCount: 1000,
        columns: ['id', 'value'],
        schema: { id: { type: 'number' }, value: { type: 'number' } }
      };
      const userGoals = ['Analyze data'];
      const industry = 'general';

      const result = await pmAgent.coordinateGoalAnalysis(
        projectId,
        uploadedData,
        userGoals,
        industry
      );

      // Should still return result with fallback opinions
      expect(result.expertOpinions).toHaveLength(3);

      // Failed agent should have fallback opinion with low confidence
      const failedOpinion = result.expertOpinions.find(o => o.confidence === 0);
      expect(failedOpinion).toBeDefined();
      expect(JSON.stringify(failedOpinion?.opinion)).toMatch(/unavailable|failed|error/i);

      // Synthesis should still proceed with partial opinions
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis.overallAssessment).toBeDefined();

      // Restore original method
      vi.restoreAllMocks();
    }, 60000);

    test('parallel execution faster than sequential', async () => {
      const projectId = 'test-project-performance';
      const uploadedData = {
        fileName: 'performance_test.csv',
        rowCount: 15000,
        columns: ['id', 'feature1', 'feature2', 'target'],
        schema: {
          id: { type: 'number' },
          feature1: { type: 'number' },
          feature2: { type: 'number' },
          target: { type: 'number' }
        }
      };
      const userGoals = ['Perform analysis'];
      const industry = 'general';

      const startTime = Date.now();
      const result = await pmAgent.coordinateGoalAnalysis(
        projectId,
        uploadedData,
        userGoals,
        industry
      );
      const parallelDuration = Date.now() - startTime;

      // Parallel execution should be close to max of individual agent times
      // not the sum of all agent times
      const maxAgentTime = Math.max(...result.expertOpinions.map(o => o.responseTime));
      
      // Total time should be roughly max agent time + synthesis overhead
      // Not more than 2x the max agent time
      expect(result.totalResponseTime).toBeLessThan(maxAgentTime * 2);
      
      // Parallel execution should complete reasonably fast
      expect(parallelDuration).toBeLessThan(35000);
    }, 60000);
  });
});
