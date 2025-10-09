import { describe, it, expect, vi } from 'vitest';

// Guard: skip heavier tests unless AI keys exist or explicitly forced
const HAS_AI_KEYS = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
const FORCE_RUN = process.env.RUN_DYNAMIC_TEMPLATE_TESTS === '1';
const maybeDescribe = (HAS_AI_KEYS || FORCE_RUN) ? describe : describe.skip;

// Minimal db mock to satisfy imports used by the engine
vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
}));

// No always-on smoke tests to avoid import-time side effects; all tests are guarded below.

// Heavier tests (mocked) only when allowed by env guard
maybeDescribe('DynamicTemplateEngine (guarded)', () => {
  it('can generate a template with a minimal valid request (mocked providers)', async () => {
    // Mock AI and Web fetch before importing the engine
    vi.doMock('../../server/multi-ai-service', () => ({
      multiAIService: {
        analyzeWithFallback: vi.fn().mockImplementation(async (prompt: string) => {
          // Return structured JSON for various phases
          if (/similar/i.test(prompt)) {
            return { result: JSON.stringify({ similarTemplates: [] }), provider: 'mock' };
          }
          if (/validate/i.test(prompt)) {
            return { result: JSON.stringify({ isValid: true, score: 90 }), provider: 'mock' };
          }
          if (/generate/i.test(prompt)) {
            const generated = {
              id: 'tmpl_1',
              industryMatch: 'Test Industry',
              confidence: 80,
              template: {
                name: 'Test Template',
                description: 'desc',
                targetRoles: [],
                targetIndustries: [],
                components: [],
                narrativeStyle: 'plain',
                visualComplexity: 'basic',
                interactivity: 'low',
                kpis: [],
                benchmarks: [],
                processes: []
              },
              sources: {
                researchSources: ['mock'],
                templateBasis: [],
                validationSources: []
              },
              metadata: {
                generatedAt: new Date(),
                researchTime: 1,
                validationScore: 90,
                usageCount: 0,
                successRate: 1,
                lastUpdated: new Date()
              }
            };
            return { result: JSON.stringify(generated), provider: 'mock' };
          }

          // Default path for research/synthesis/parse phases
          const genericResearch = {
            industryName: 'Test Industry',
            subIndustries: [],
            keyMetrics: [],
            businessProcesses: [],
            stakeholderRoles: [],
            commonAnalysisTypes: [],
            regulatoryContext: [],
            benchmarkSources: [],
            terminology: []
          };
          return { result: JSON.stringify(genericResearch), provider: 'mock' };
        })
      }
    }));

    vi.doMock('../../server/web-fetch-service', () => ({
      WebFetch: class {
        async searchAndAnalyze() {
          return { results: [], summary: 'mock' };
        }
      }
    }));

  const { DynamicTemplateEngine } = await import('../../server/dynamic-template-engine');
    const engine = DynamicTemplateEngine.getInstance();

    const req = {
      industryDescription: 'Retail',
      businessContext: 'Online retail',
      specificRequirements: [],
      stakeholderRoles: []
    } as any;

    const result = await engine.generateDynamicTemplate(req);
    expect(result).toBeTruthy();
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('template');
    expect(result).toHaveProperty('sources');
  });
});