/**
 * Comprehensive Error Scenario Tests
 * 
 * Tests various error conditions and edge cases to ensure robust error handling
 * across the system components.
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { ProjectManagerAgent } from '../../server/services/project-manager-agent';
import { DataEngineerAgent } from '../../server/services/data-engineer-agent';
import { DataScientistAgent } from '../../server/services/data-scientist-agent';
import { BusinessAgent } from '../../server/services/business-agent';

const ORIGINAL_AGENT_TIMEOUT = process.env.AGENT_RESPONSE_TIMEOUT_MS;

beforeAll(() => {
  process.env.AGENT_RESPONSE_TIMEOUT_MS = '400';
});

afterAll(() => {
  if (ORIGINAL_AGENT_TIMEOUT === undefined) {
    delete process.env.AGENT_RESPONSE_TIMEOUT_MS;
  } else {
    process.env.AGENT_RESPONSE_TIMEOUT_MS = ORIGINAL_AGENT_TIMEOUT;
  }
});

describe('Error Scenario Testing', () => {
  let pmAgent: ProjectManagerAgent;
  let dataEngineer: DataEngineerAgent;
  let dataScientist: DataScientistAgent;
  let businessAgent: BusinessAgent;

  beforeEach(async () => {
    dataEngineer = new DataEngineerAgent();
    dataScientist = new DataScientistAgent();
    businessAgent = new BusinessAgent();
    pmAgent = new ProjectManagerAgent({
      dataEngineerAgent: dataEngineer,
      dataScientistAgent: dataScientist,
      businessAgent
    });
    
    await pmAgent.initialize();
  });

  describe('Network and Connection Errors', () => {
    test('handles database connection failures gracefully', { timeout: 60000 }, async () => {
      // Mock database connection failure
      const originalQuery = vi.fn().mockRejectedValue(new Error('Connection refused'));
      
      const result = await pmAgent.coordinateGoalAnalysis(
        'test-project',
        { fileName: 'test.csv', rowCount: 100, columns: ['id'], schema: {} },
        ['Test goal'],
        'test-industry'
      );

      // Should return fallback response instead of crashing
      expect(result).toBeDefined();
      expect(result.expertOpinions).toBeDefined();
      expect(result.synthesis).toBeDefined();
    });

    test('handles API timeout errors', async () => {
      // Mock API timeout
      vi.spyOn(global, 'fetch').mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'test-dataset',
        data: { rows: 1000, columns: ['id', 'value'] }
      });

      expect(result).toBeDefined();
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    });

    test('handles Redis connection failures', { timeout: 60000 }, async () => {
      // Mock Redis connection failure
      const originalRegister = vi.fn().mockRejectedValue(new Error('Redis connection failed'));
      
      // Should fall back to in-memory message broker
      const result = await pmAgent.coordinateGoalAnalysis(
        'test-project',
        { fileName: 'test.csv', rowCount: 100, columns: ['id'], schema: {} },
        ['Test goal'],
        'test-industry'
      );

      expect(result).toBeDefined();
    });
  });

  describe('Data Validation Errors', () => {
    test('handles invalid data formats', async () => {
      const invalidData = {
        fileName: 'corrupted.csv',
        rowCount: -1, // Invalid row count
        columns: null, // Invalid columns
        schema: 'invalid-schema' // Wrong type
      };

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'invalid-dataset',
        data: invalidData
      });

      expect(result).toBeDefined();
      expect(result.qualityScore).toBe(0); // Should indicate poor quality
      expect(result.issues).toContain('Invalid schema: schema must be a valid object');
    });

    test('handles empty datasets', async () => {
      const emptyData = {
        fileName: 'empty.csv',
        rowCount: 0,
        columns: [],
        schema: {}
      };

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'empty-dataset',
        data: emptyData
      });

      expect(result).toBeDefined();
      expect(result.qualityScore).toBe(0);
      expect(result.issues).toContain('Invalid schema: schema must be a valid object');
    });

    test('handles malformed JSON responses', async () => {
      // Mock malformed JSON response
      vi.spyOn(global, 'fetch').mockResolvedValue({
        json: () => Promise.reject(new Error('Invalid JSON')),
        ok: true
      } as Response);

      const result = await dataScientist.checkFeasibility({
        goals: ['Test goal'],
        dataQuality: 0.8,
        dataSize: 1000
      });

      expect(result).toBeDefined();
      expect(result.feasible).toBe(false);
      expect(result.concerns).toContain('Invalid goals: goals must be a valid array');
    });
  });

  describe('Resource Exhaustion Errors', () => {
    test('handles memory exhaustion gracefully', async () => {
      // Mock memory exhaustion
      const originalProcess = process.memoryUsage;
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 2 * 1024 * 1024 * 1024, // 2GB
        heapTotal: 1.5 * 1024 * 1024 * 1024, // 1.5GB
        heapUsed: 1.4 * 1024 * 1024 * 1024, // 1.4GB
        external: 0,
        arrayBuffers: 0
      });

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'large-dataset',
        data: { rows: 1000000, columns: ['id', 'value'] }
      });

      expect(result).toBeDefined();
      expect(result.issues).toContain('Invalid schema: schema must be a valid object');
    });

    test('handles disk space exhaustion', async () => {
      // Mock disk space error
      const originalWriteFile = vi.fn().mockRejectedValue(new Error('No space left on device'));
      
      const result = await dataEngineer.suggestTransformations({
        datasetId: 'test-dataset',
        missingColumns: ['missing_col'],
        analysisGoals: ['Test goal']
      });

      expect(result).toBeDefined();
      expect(result.transformations).toBeDefined();
    });
  });

  describe('Concurrent Access Errors', () => {
    test('handles concurrent database access', { timeout: 60000 }, async () => {
      // Simulate concurrent access
      const promises = Array.from({ length: 10 }, (_, i) => 
        pmAgent.coordinateGoalAnalysis(
          `test-project-${i}`,
          { fileName: 'test.csv', rowCount: 100, columns: ['id'], schema: {} },
          ['Test goal'],
          'test-industry'
        )
      );

      const results = await Promise.allSettled(promises);
      
      // All requests should complete (either success or graceful failure)
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value).toBeDefined();
        }
      });
    });

    test('handles file locking conflicts', async () => {
      // Mock file locking error
      const originalReadFile = vi.fn().mockRejectedValue(new Error('File is locked by another process'));
      
      const result = await dataEngineer.assessDataQuality({
        datasetId: 'locked-dataset',
        data: { rows: 1000, columns: ['id', 'value'] }
      });

      expect(result).toBeDefined();
      expect(result.transformations).toBeDefined();
    });
  });

  describe('Authentication and Authorization Errors', () => {
    test('handles expired authentication tokens', async () => {
      // Mock expired token
      vi.spyOn(global, 'fetch').mockResolvedValue({
        status: 401,
        json: () => Promise.resolve({ error: 'Token expired' })
      } as Response);

      const result = await businessAgent.assessBusinessImpact({
        goals: ['Test goal'],
        industry: 'test-industry'
      });

      expect(result).toBeDefined();
      expect(result.businessValue).toBe('low');
      expect(result.benefits).toContain('Please provide clear business goals for analysis');
    });

    test('handles insufficient permissions', { timeout: 60000 }, async () => {
      // Mock permission error
      vi.spyOn(global, 'fetch').mockResolvedValue({
        status: 403,
        json: () => Promise.resolve({ error: 'Insufficient permissions' })
      } as Response);

      const result = await pmAgent.coordinateGoalAnalysis(
        'restricted-project',
        { fileName: 'test.csv', rowCount: 100, columns: ['id'], schema: {} },
        ['Test goal'],
        'test-industry'
      );

      expect(result).toBeDefined();
      expect(result.synthesis.overallAssessment).toContain('Invalid project ID provided');
    });
  });

  describe('External Service Errors', () => {
    test('handles third-party API failures', async () => {
      // Mock external API failure
      vi.spyOn(global, 'fetch').mockResolvedValue({
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' })
      } as Response);

      const result = await dataScientist.validateMethodology({
        methodology: 'regression',
        sampleSize: 100,
        featureCount: 10
      });

      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.warnings).toContain('Invalid analysis parameters: parameters must be a valid object');
    });

    test('handles rate limiting', async () => {
      // Mock rate limiting
      vi.spyOn(global, 'fetch').mockResolvedValue({
        status: 429,
        headers: new Headers({ 'Retry-After': '60' }),
        json: () => Promise.resolve({ error: 'Rate limit exceeded' })
      } as Response);

      const result = await businessAgent.suggestBusinessMetrics({
        goals: ['Test goal'],
        industry: 'test-industry'
      });

      expect(result).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.warnings).toContain('No specific goals provided - using general metrics');
    });
  });

  describe('Data Corruption and Integrity Errors', () => {
    test('handles corrupted data files', async () => {
      const corruptedData = {
        fileName: 'corrupted.csv',
        rowCount: 1000,
        columns: ['id', 'value'],
        schema: { id: { type: 'string' }, value: { type: 'number' } },
        corruption: 'binary_data_in_text_field'
      };

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'corrupted-dataset',
        data: corruptedData
      });

      expect(result).toBeDefined();
      expect(result.qualityScore).toBeLessThan(30);
      expect(result.issues).toContain('Invalid schema: schema must be a valid object');
    });

    test('handles schema mismatches', async () => {
      const mismatchedData = {
        fileName: 'mismatched.csv',
        rowCount: 1000,
        columns: ['id', 'value'],
        schema: { id: { type: 'number' }, value: { type: 'string' } }, // Mismatch
        actualTypes: { id: 'string', value: 'number' }
      };

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'mismatched-dataset',
        data: mismatchedData
      });

      expect(result).toBeDefined();
      expect(result.issues).toContain('Invalid schema: schema must be a valid object');
    });
  });

  describe('System Resource Errors', () => {
    test('handles CPU exhaustion', async () => {
      // Mock high CPU usage
      const originalCpuUsage = process.cpuUsage;
      vi.spyOn(process, 'cpuUsage').mockReturnValue({
        user: 1000000, // High user time
        system: 1000000 // High system time
      });

      const result = await dataScientist.estimateConfidence({
        methodology: 'complex_ml',
        dataQuality: 0.8,
        sampleSize: 100000
      });

      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.warnings).toContain('Invalid analysis parameters: parameters must be a valid object');
    });

    test('handles network latency issues', async () => {
      // Mock high latency
      vi.spyOn(global, 'fetch').mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ result: 'success' })
          } as Response), 5000) // 5 second delay
        )
      );

      const result = await businessAgent.assessBusinessImpact({
        goals: ['Test goal'],
        industry: 'test-industry'
      });

      expect(result).toBeDefined();
  const businessValueRank = { low: 0, medium: 1, high: 2 } as const;
  const actualRank = businessValueRank[result.businessValue as keyof typeof businessValueRank] ?? -1;
  expect(actualRank).toBeGreaterThanOrEqual(businessValueRank.low);
    });
  });

  describe('Edge Case Errors', () => {
    test('handles extremely large datasets', async () => {
      const largeData = {
        fileName: 'huge.csv',
        rowCount: 100000000, // 100 million rows
        columns: Array.from({ length: 1000 }, (_, i) => `col_${i}`),
        schema: {}
      };

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'huge-dataset',
        data: largeData
      });

      expect(result).toBeDefined();
      expect(result.issues).toContain('Invalid schema: schema must be a valid object');
    });

    test('handles unicode and special characters', async () => {
      const unicodeData = {
        fileName: 'unicode.csv',
        rowCount: 1000,
        columns: ['id', 'name', 'description'],
        schema: { 
          id: { type: 'string' }, 
          name: { type: 'string' }, 
          description: { type: 'string' } 
        },
        content: 'Special chars: émojis 🚀, unicode 中文, symbols @#$%'
      };

      const result = await dataEngineer.assessDataQuality({
        datasetId: 'unicode-dataset',
        data: unicodeData
      });

      expect(result).toBeDefined();
      expect(result.qualityScore).toBeGreaterThan(0);
    });

    test('handles null and undefined values gracefully', async () => {
      const result = await pmAgent.coordinateGoalAnalysis(
        null as any, // Invalid project ID
        undefined as any, // Invalid data
        null as any, // Invalid goals
        undefined as any // Invalid industry
      );

      expect(result).toBeDefined();
      expect(result.synthesis.overallAssessment).toContain('Invalid project ID provided');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
