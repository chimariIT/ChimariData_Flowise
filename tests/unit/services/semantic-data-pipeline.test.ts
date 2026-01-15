/**
 * Semantic Data Pipeline Service - Unit Tests
 *
 * Tests the core functionality of the vector-based semantic data pipeline:
 * - Data element extraction from datasets
 * - Question-to-element semantic linking
 * - Transformation inference
 * - Evidence chain building
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the database
vi.mock('../../../server/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue({}),
        onConflictDoNothing: vi.fn().mockResolvedValue({}),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock embedding service
vi.mock('../../../server/services/embedding-service', () => ({
  embeddingService: {
    isAvailable: vi.fn().mockReturnValue(true),
    embedText: vi.fn().mockResolvedValue({
      text: 'test',
      embedding: new Array(1536).fill(0.1),
      model: 'text-embedding-ada-002',
      tokensUsed: 10,
    }),
    embedBatch: vi.fn().mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(text => ({
        text,
        embedding: new Array(1536).fill(0.1),
        model: 'text-embedding-ada-002',
        tokensUsed: 10,
      })))
    ),
    getDimension: vi.fn().mockReturnValue(1536),
  },
}));

// Import after mocks
import { SemanticDataPipelineService } from '../../../server/services/semantic-data-pipeline';

describe('SemanticDataPipelineService', () => {
  let service: SemanticDataPipelineService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SemanticDataPipelineService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractDataElements', () => {
    it('should extract data elements from a single dataset', async () => {
      const projectId = 'test-project-1';
      const datasets = [{
        id: 'dataset-1',
        schema: {
          employee_id: 'string',
          department: 'string',
          salary: 'number',
          hire_date: 'date',
        },
        preview: [
          { employee_id: 'E001', department: 'Engineering', salary: 75000, hire_date: '2023-01-15' },
          { employee_id: 'E002', department: 'Marketing', salary: 65000, hire_date: '2022-06-01' },
        ],
        name: 'employees.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);

      expect(elements).toHaveLength(4);
      expect(elements.map(e => e.elementName)).toContain('employee_id');
      expect(elements.map(e => e.elementName)).toContain('department');
      expect(elements.map(e => e.elementName)).toContain('salary');
      expect(elements.map(e => e.elementName)).toContain('hire_date');
    });

    it('should correctly infer element types', async () => {
      const projectId = 'test-project-2';
      const datasets = [{
        id: 'dataset-1',
        schema: {
          user_id: 'string',
          category: 'string',
          amount: 'number',
          status: 'string',
        },
        preview: [],
        name: 'transactions.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);

      const userIdElement = elements.find(e => e.elementName === 'user_id');
      const categoryElement = elements.find(e => e.elementName === 'category');
      const amountElement = elements.find(e => e.elementName === 'amount');

      expect(userIdElement?.elementType).toBe('key');
      expect(categoryElement?.elementType).toBe('dimension');
      expect(amountElement?.elementType).toBe('measure');
    });

    it('should extract elements from multiple datasets', async () => {
      const projectId = 'test-project-3';
      const datasets = [
        {
          id: 'dataset-1',
          schema: { employee_id: 'string', name: 'string' },
          preview: [],
          name: 'employees.csv',
        },
        {
          id: 'dataset-2',
          schema: { emp_id: 'string', engagement_score: 'number' },
          preview: [],
          name: 'engagement.csv',
        },
      ];

      const elements = await service.extractDataElements(projectId, datasets);

      expect(elements).toHaveLength(4);
      expect(elements.filter(e => e.sourceDatasetId === 'dataset-1')).toHaveLength(2);
      expect(elements.filter(e => e.sourceDatasetId === 'dataset-2')).toHaveLength(2);
    });

    it('should return empty array for empty datasets', async () => {
      const projectId = 'test-project-4';
      const datasets: any[] = [];

      const elements = await service.extractDataElements(projectId, datasets);

      expect(elements).toHaveLength(0);
    });

    it('should infer analysis roles correctly', async () => {
      const projectId = 'test-project-5';
      const datasets = [{
        id: 'dataset-1',
        schema: {
          department_id: 'string',
          total_amount: 'number',
          created_date: 'date',
          status_type: 'string',
        },
        preview: [],
        name: 'data.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);

      const deptElement = elements.find(e => e.elementName === 'department_id');
      const amountElement = elements.find(e => e.elementName === 'total_amount');
      const dateElement = elements.find(e => e.elementName === 'created_date');

      expect(deptElement?.analysisRoles).toContain('joining');
      expect(amountElement?.analysisRoles).toContain('aggregation');
      expect(dateElement?.analysisRoles).toContain('time_series');
    });
  });

  describe('semantic description generation', () => {
    it('should generate meaningful descriptions for ID columns', async () => {
      const projectId = 'test-project-6';
      const datasets = [{
        id: 'dataset-1',
        schema: { employee_id: 'string' },
        preview: [{ employee_id: 'E001' }],
        name: 'data.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);
      const idElement = elements.find(e => e.elementName === 'employee_id');

      expect(idElement?.semanticDescription).toContain('identifier');
    });

    it('should generate meaningful descriptions for date columns', async () => {
      const projectId = 'test-project-7';
      const datasets = [{
        id: 'dataset-1',
        schema: { hire_date: 'date' },
        preview: [{ hire_date: '2023-01-15' }],
        name: 'data.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);
      const dateElement = elements.find(e => e.elementName === 'hire_date');

      expect(dateElement?.semanticDescription).toContain('temporal');
    });

    it('should generate meaningful descriptions for amount columns', async () => {
      const projectId = 'test-project-8';
      const datasets = [{
        id: 'dataset-1',
        schema: { total_amount: 'number' },
        preview: [{ total_amount: 1500 }],
        name: 'data.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);
      const amountElement = elements.find(e => e.elementName === 'total_amount');

      expect(amountElement?.semanticDescription).toContain('aggregation');
    });
  });

  describe('element type inference', () => {
    it('should classify ID columns as keys', async () => {
      const projectId = 'test-project-9';
      const datasets = [{
        id: 'dataset-1',
        schema: {
          id: 'string',
          user_id: 'string',
          primary_key: 'string',
        },
        preview: [],
        name: 'data.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);

      elements.forEach(e => {
        expect(e.elementType).toBe('key');
      });
    });

    it('should classify numeric columns as measures', async () => {
      const projectId = 'test-project-10';
      const datasets = [{
        id: 'dataset-1',
        schema: {
          total_count: 'number',
          avg_score: 'number',
          sum_amount: 'number',
        },
        preview: [],
        name: 'data.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);

      elements.forEach(e => {
        expect(e.elementType).toBe('measure');
      });
    });

    it('should classify categorical columns as dimensions', async () => {
      const projectId = 'test-project-11';
      const datasets = [{
        id: 'dataset-1',
        schema: {
          category: 'string',
          department: 'string',
          region: 'string',
          status: 'string',
        },
        preview: [],
        name: 'data.csv',
      }];

      const elements = await service.extractDataElements(projectId, datasets);

      elements.forEach(e => {
        expect(e.elementType).toBe('dimension');
      });
    });
  });

  describe('cosine similarity calculation', () => {
    it('should return 1 for identical vectors', () => {
      const a = [1, 0, 0, 0, 0];
      const b = [1, 0, 0, 0, 0];

      // Access private method for testing
      const similarity = (service as any).cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0, 0, 0];
      const b = [0, 1, 0, 0, 0];

      const similarity = (service as any).cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should handle zero vectors gracefully', () => {
      const a = [0, 0, 0, 0, 0];
      const b = [1, 0, 0, 0, 0];

      const similarity = (service as any).cosineSimilarity(a, b);

      expect(similarity).toBe(0);
    });

    it('should return 0 for mismatched dimensions', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0, 0, 0];

      const similarity = (service as any).cosineSimilarity(a, b);

      expect(similarity).toBe(0);
    });
  });

  describe('needs aggregation detection', () => {
    it('should detect aggregation keywords', () => {
      const questions = [
        'What is the total revenue by department?',
        'Show me the average salary',
        'How many employees are there?',
        'What is the sum of all transactions?',
        'Calculate the count per category',
      ];

      questions.forEach(q => {
        const needsAgg = (service as any).needsAggregation(q);
        expect(needsAgg).toBe(true);
      });
    });

    it('should not detect aggregation for non-aggregate questions', () => {
      const questions = [
        'Show me all employees',
        'List the departments',
        'What are the categories?',
      ];

      questions.forEach(q => {
        const needsAgg = (service as any).needsAggregation(q);
        expect(needsAgg).toBe(false);
      });
    });
  });

  describe('needs filtering detection', () => {
    it('should detect filter keywords', () => {
      const questions = [
        'Show employees where department is Engineering',
        'Only include active users',
        'Filter by specific date range',
        'Show only specific category results',
      ];

      questions.forEach(q => {
        const needsFilter = (service as any).needsFiltering(q);
        expect(needsFilter).toBe(true);
      });
    });

    it('should not detect filtering for non-filter questions', () => {
      const questions = [
        'Show all data',
        'List everything',
        'Total revenue',
      ];

      questions.forEach(q => {
        const needsFilter = (service as any).needsFiltering(q);
        expect(needsFilter).toBe(false);
      });
    });
  });

  describe('join key candidate detection', () => {
    it('should detect matching column names as join candidates', () => {
      const candidates = [
        ['employee_id', 'employee_id'],  // Exact match
        ['user_id', 'user_id'],          // Exact match
        ['id', 'id'],                    // Simple ID match
        ['employee_id', 'employeeid'],   // With/without underscore
      ];

      candidates.forEach(([a, b]) => {
        const isCandidate = (service as any).areJoinKeyCandidates(a, b);
        expect(isCandidate).toBe(true);
      });
    });

    it('should not match unrelated columns', () => {
      const nonCandidates = [
        ['name', 'salary'],
        ['department', 'revenue'],
        ['date', 'amount'],
      ];

      nonCandidates.forEach(([a, b]) => {
        const isCandidate = (service as any).areJoinKeyCandidates(a, b);
        expect(isCandidate).toBe(false);
      });
    });
  });

  describe('link type inference', () => {
    it('should infer groups_by for grouping patterns', () => {
      const cases = [
        { question: 'revenue by department', element: 'department' },
        { question: 'count per category', element: 'category' },
        { question: 'for each region', element: 'region' },
      ];

      cases.forEach(({ question, element }) => {
        const linkType = (service as any).inferLinkType(question, element);
        expect(linkType).toBe('groups_by');
      });
    });

    it('should infer aggregates for measure patterns', () => {
      const cases = [
        { question: 'total revenue', element: 'amount' },
        { question: 'average score', element: 'score' },
        { question: 'sum of salary', element: 'salary' },
      ];

      cases.forEach(({ question, element }) => {
        const linkType = (service as any).inferLinkType(question, element);
        expect(linkType).toBe('aggregates');
      });
    });

    it('should infer filters_by for filter patterns', () => {
      const cases = [
        { question: 'filter where status equals active', element: 'status' },
        { question: 'show only specific data', element: 'data' },
        { question: 'filter by particular region', element: 'region' },
      ];

      cases.forEach(({ question, element }) => {
        const linkType = (service as any).inferLinkType(question, element);
        expect(linkType).toBe('filters_by');
      });
    });

    it('should default to requires for unknown patterns', () => {
      const linkType = (service as any).inferLinkType(
        'show me the data',
        'random_column'
      );
      expect(linkType).toBe('requires');
    });
  });

  describe('data type normalization', () => {
    it('should normalize numeric types', () => {
      const numericTypes = ['int', 'integer', 'float', 'number', 'decimal'];

      numericTypes.forEach(type => {
        const normalized = (service as any).normalizeDataType(type);
        expect(normalized).toBe('number');
      });
    });

    it('should normalize date types', () => {
      const dateTypes = ['date', 'datetime', 'timestamp', 'time'];

      dateTypes.forEach(type => {
        const normalized = (service as any).normalizeDataType(type);
        expect(normalized).toBe('date');
      });
    });

    it('should normalize boolean types', () => {
      const boolTypes = ['bool', 'boolean'];

      boolTypes.forEach(type => {
        const normalized = (service as any).normalizeDataType(type);
        expect(normalized).toBe('boolean');
      });
    });

    it('should default to string for unknown types', () => {
      const unknownTypes = ['varchar', 'text', 'char', 'unknown'];

      unknownTypes.forEach(type => {
        const normalized = (service as any).normalizeDataType(type);
        expect(normalized).toBe('string');
      });
    });
  });
});

describe('Semantic Pipeline Integration Scenarios', () => {
  let service: SemanticDataPipelineService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SemanticDataPipelineService();
  });

  describe('HR Engagement Analysis Scenario', () => {
    const employeeDataset = {
      id: 'employees-dataset',
      schema: {
        employee_id: 'string',
        name: 'string',
        department: 'string',
        hire_date: 'date',
        salary: 'number',
      },
      preview: [
        { employee_id: 'E001', name: 'John', department: 'Engineering', hire_date: '2022-01-15', salary: 85000 },
        { employee_id: 'E002', name: 'Jane', department: 'Marketing', hire_date: '2021-06-01', salary: 72000 },
      ],
      name: 'employees.csv',
    };

    const engagementDataset = {
      id: 'engagement-dataset',
      schema: {
        emp_id: 'string',
        survey_date: 'date',
        engagement_score: 'number',
        satisfaction_rating: 'number',
      },
      preview: [
        { emp_id: 'E001', survey_date: '2024-01-01', engagement_score: 85, satisfaction_rating: 4.2 },
        { emp_id: 'E002', survey_date: '2024-01-01', engagement_score: 78, satisfaction_rating: 3.8 },
      ],
      name: 'engagement.csv',
    };

    it('should extract elements from both datasets', async () => {
      const elements = await service.extractDataElements('hr-project', [employeeDataset, engagementDataset]);

      // 5 from employees + 4 from engagement = 9 total
      expect(elements).toHaveLength(9);

      // Verify key columns detected
      const keyElements = elements.filter(e => e.elementType === 'key');
      expect(keyElements.length).toBeGreaterThanOrEqual(2);

      // Verify measure columns detected
      const measureElements = elements.filter(e => e.elementType === 'measure');
      expect(measureElements.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect join keys between datasets', async () => {
      const elements = await service.extractDataElements('hr-project', [employeeDataset, engagementDataset]);

      const employeeId = elements.find(e => e.elementName === 'employee_id');
      const empId = elements.find(e => e.elementName === 'emp_id');

      expect(employeeId?.elementType).toBe('key');
      expect(empId?.elementType).toBe('key');

      // Check if they can be joined
      const areJoinable = (service as any).areJoinKeyCandidates('employee_id', 'emp_id');
      expect(areJoinable).toBe(true);
    });

    it('should correctly classify engagement score as a measure', async () => {
      const elements = await service.extractDataElements('hr-project', [engagementDataset]);

      const scoreElement = elements.find(e => e.elementName === 'engagement_score');
      expect(scoreElement?.elementType).toBe('measure');
      expect(scoreElement?.analysisRoles).toContain('aggregation');
    });

    it('should correctly classify department as a dimension', async () => {
      const elements = await service.extractDataElements('hr-project', [employeeDataset]);

      const deptElement = elements.find(e => e.elementName === 'department');
      expect(deptElement?.elementType).toBe('dimension');
      expect(deptElement?.analysisRoles).toContain('grouping');
    });
  });

  describe('Question-to-Element Matching Scenarios', () => {
    it('should correctly parse aggregation question: average engagement by department', () => {
      const question = 'What is the average engagement score by department?';

      const needsAgg = (service as any).needsAggregation(question);
      expect(needsAgg).toBe(true);

      const engagementLink = (service as any).inferLinkType(question, 'engagement_score');
      expect(engagementLink).toBe('aggregates');

      const departmentLink = (service as any).inferLinkType(question, 'department');
      expect(departmentLink).toBe('groups_by');
    });

    it('should correctly parse filter question: only Engineering department', () => {
      const question = 'Show me only employees in the Engineering department';

      const needsFilter = (service as any).needsFiltering(question);
      expect(needsFilter).toBe(true);
    });

    it('should correctly parse count question: how many employees', () => {
      const question = 'How many employees are there per department?';

      const needsAgg = (service as any).needsAggregation(question);
      expect(needsAgg).toBe(true);

      const deptLink = (service as any).inferLinkType(question, 'department');
      expect(deptLink).toBe('groups_by');
    });
  });
});
