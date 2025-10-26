/**
 * Unit Tests: Project Manager Agent - Opinion Synthesis
 *
 * Tests the PM Agent's ability to synthesize expert opinions from multiple agents
 * into unified recommendations with consensus calculations
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ProjectManagerAgent } from '../../../server/services/project-manager-agent';
import type { ExpertOpinion } from '../../../server/services/project-manager-agent';

describe('Project Manager Agent - Opinion Synthesis', () => {
  let agent: ProjectManagerAgent;

  beforeEach(() => {
    agent = new ProjectManagerAgent();
  });

  describe('synthesizeExpertOpinions', () => {
    test('determines "proceed" when all conditions favorable', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.9,
            completeness: 0.95,
            issues: [],
            recommendations: ['Data is ready for analysis']
          },
          confidence: 0.9,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: true,
            confidence: 0.85,
            requiredAnalyses: ['clustering'],
            estimatedDuration: '15 minutes'
          },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'high',
            alignment: 0.9,
            benefits: ['Improved targeting'],
            expectedROI: '200%'
          },
          confidence: 0.88,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const uploadedData = {
        fileName: 'customers.csv',
        rowCount: 10000,
        columns: ['customer_id', 'purchase_amount', 'frequency']
      };

      const userGoals = ['Identify customer segments'];

      const result = await agent.synthesizeExpertOpinions(expertOpinions, uploadedData, userGoals);

      expect(result.overallAssessment).toBe('proceed');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.keyFindings).toBeDefined();
      expect(result.keyFindings.length).toBeGreaterThan(0);
      expect(result.actionableRecommendations).toBeDefined();
    });

    test('determines "not_feasible" when data quality poor', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.4, // Poor quality
            completeness: 0.5,
            issues: ['Many missing values', 'Duplicate rows'],
            recommendations: ['Clean data before analysis']
          },
          confidence: 0.7,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: true,
            confidence: 0.8,
            requiredAnalyses: ['clustering']
          },
          confidence: 0.8,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'high',
            alignment: 0.85
          },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const result = await agent.synthesizeExpertOpinions(
        expertOpinions,
        { fileName: 'test.csv', rowCount: 1000, columns: [] },
        ['Analyze data']
      );

      expect(result.overallAssessment).toBe('not_feasible');
      expect(result.combinedRisks).toBeDefined();
      expect(result.combinedRisks.length).toBeGreaterThan(0);
    });

    test('determines "not_feasible" when technical feasibility low', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.9,
            completeness: 0.95
          },
          confidence: 0.9,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: false, // Not feasible
            confidence: 0.3,
            concerns: ['Insufficient data for analysis'],
            requiredAnalyses: []
          },
          confidence: 0.3,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'high',
            alignment: 0.85
          },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const result = await agent.synthesizeExpertOpinions(
        expertOpinions,
        { fileName: 'test.csv', rowCount: 100, columns: [] },
        ['Complex analysis']
      );

      expect(result.overallAssessment).toBe('not_feasible');
    });

    test('determines "proceed_with_caution" when business value low', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.85,
            completeness: 0.9
          },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: true,
            confidence: 0.8,
            requiredAnalyses: ['regression']
          },
          confidence: 0.8,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'low', // Low business value
            alignment: 0.6,
            concerns: ['Unclear ROI']
          },
          confidence: 0.6,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const result = await agent.synthesizeExpertOpinions(
        expertOpinions,
        { fileName: 'test.csv', rowCount: 5000, columns: [] },
        ['Analyze data']
      );

      expect(result.overallAssessment).toBe('proceed_with_caution');
    });

    test('determines "revise_approach" when quality acceptable but feasibility challenging', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.7, // Acceptable
            completeness: 0.75
          },
          confidence: 0.7,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: true,
            confidence: 0.55, // Challenging (between 0.5 and 0.7)
            warnings: ['Small sample size']
          },
          confidence: 0.55,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'medium',
            alignment: 0.75
          },
          confidence: 0.75,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const result = await agent.synthesizeExpertOpinions(
        expertOpinions,
        { fileName: 'test.csv', rowCount: 500, columns: [] },
        ['Analysis']
      );

      expect(result.overallAssessment).toBe('revise_approach');
    });

    test('extracts key findings from all agents', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.85,
            recommendations: ['First DE recommendation', 'Second DE recommendation']
          },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: true,
            confidence: 0.8,
            recommendations: ['First DS recommendation']
          },
          confidence: 0.8,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'high',
            recommendations: ['First BA recommendation']
          },
          confidence: 0.82,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const result = await agent.synthesizeExpertOpinions(
        expertOpinions,
        { fileName: 'test.csv', rowCount: 5000, columns: [] },
        ['Analysis']
      );

      expect(result.keyFindings).toContain('First DE recommendation');
      expect(result.keyFindings).toContain('First DS recommendation');
      expect(result.keyFindings).toContain('First BA recommendation');
    });

    test('combines risks with source attribution', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.75,
            issues: [
              { type: 'missing_values', severity: 'high', description: 'DE Risk' }
            ]
          },
          confidence: 0.75,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: true,
            confidence: 0.7,
            concerns: ['DS Concern about methodology']
          },
          confidence: 0.7,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'medium',
            risks: ['BA Risk about ROI']
          },
          confidence: 0.72,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const result = await agent.synthesizeExpertOpinions(
        expertOpinions,
        { fileName: 'test.csv', rowCount: 3000, columns: [] },
        ['Analysis']
      );

      expect(result.combinedRisks).toBeDefined();
      expect(result.combinedRisks.length).toBeGreaterThan(0);
      
      // Check source attribution
      const deRisk = result.combinedRisks.find(r => r.source === 'Data Engineer');
      const dsRisk = result.combinedRisks.find(r => r.source === 'Data Scientist');
      const baRisk = result.combinedRisks.find(r => r.source === 'Business Agent');
      
      expect(deRisk || dsRisk || baRisk).toBeDefined();
    });

    test('estimates timeline based on data size', async () => {
      const baseOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: { overallScore: 0.85 },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: { feasible: true, confidence: 0.8 },
          confidence: 0.8,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: { businessValue: 'high' },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      // Small dataset
      const smallResult = await agent.synthesizeExpertOpinions(
        baseOpinions,
        { fileName: 'small.csv', rowCount: 5000, columns: [] },
        ['Analysis']
      );

      // Large dataset
      const largeResult = await agent.synthesizeExpertOpinions(
        baseOpinions,
        { fileName: 'large.csv', rowCount: 150000, columns: [] },
        ['Analysis']
      );

      expect(smallResult.estimatedTimeline).toMatch(/5.*15.*min/i);
      expect(largeResult.estimatedTimeline).toMatch(/30.*60.*min/i);
    });

    test('prioritizes top 5 actionable recommendations', async () => {
      const expertOpinions: ExpertOpinion[] = [
        {
          agentId: 'data_engineer',
          agentName: 'Data Engineer',
          opinion: {
            overallScore: 0.85,
            recommendations: ['DE Rec 1', 'DE Rec 2', 'DE Rec 3']
          },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1000
        },
        {
          agentId: 'data_scientist',
          agentName: 'Data Scientist',
          opinion: {
            feasible: true,
            confidence: 0.8,
            recommendations: ['DS Rec 1', 'DS Rec 2', 'DS Rec 3']
          },
          confidence: 0.8,
          timestamp: new Date(),
          responseTime: 1200
        },
        {
          agentId: 'business_agent',
          agentName: 'Business Agent',
          opinion: {
            businessValue: 'high',
            recommendations: ['BA Rec 1', 'BA Rec 2', 'BA Rec 3']
          },
          confidence: 0.85,
          timestamp: new Date(),
          responseTime: 1100
        }
      ];

      const result = await agent.synthesizeExpertOpinions(
        expertOpinions,
        { fileName: 'test.csv', rowCount: 10000, columns: [] },
        ['Analysis']
      );

      expect(result.actionableRecommendations).toBeDefined();
      expect(result.actionableRecommendations.length).toBeLessThanOrEqual(5);
    });
  });
});
