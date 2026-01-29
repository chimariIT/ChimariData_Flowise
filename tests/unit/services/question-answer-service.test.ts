
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestionAnswerService } from '../../../server/services/question-answer-service';

// Mock dependencies using vi.hoisted to avoid reference errors
const mocks = vi.hoisted(() => ({
    storage: {
        getProject: vi.fn(),
        updateProject: vi.fn()
    },
    aiService: {
        queryData: vi.fn()
    }
}));

vi.mock('../../../server/storage', () => ({
    storage: mocks.storage
}));

// We need to handle the dynamic import in the service
vi.mock('../../../server/ai-service', () => ({
    aiService: mocks.aiService
}));

describe('QuestionAnswerService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockProjectId = 'test-project-id';
    const mockUserId = 'test-user-id';
    const mockAnalysisResults = {
        insights: [
            {
                title: 'Sales increased by 20%',
                description: 'Q3 sales were significantly higher than Q2 due to new marketing',
                impact: 'High',
                confidence: 90,
                category: 'Performance',
                dataSource: 'sales_data.csv'
            }
        ],
        recommendations: [
            {
                title: 'Invest in marketing',
                description: 'Continue the successful Q3 campaign',
                priority: 'High'
            }
        ],
        summary: {
            totalAnalyses: 5,
            dataRowsProcessed: 1000,
            qualityScore: 95,
            executionTime: '2s'
        }
    };

    it('should generate answers for valid questions', async () => {
        // Setup mocks
        mocks.storage.getProject.mockResolvedValue({
            id: mockProjectId,
            analysisResults: mockAnalysisResults
        });

        mocks.aiService.queryData.mockResolvedValue(
            'Based on the analysis, sales increased by 20% in Q3.'
        );

        // Execute
        const result = await QuestionAnswerService.generateAnswers({
            projectId: mockProjectId,
            userId: mockUserId,
            questions: ['How did sales perform?'],
            analysisResults: mockAnalysisResults
        });

        // Verify
        expect(result).toBeDefined();
        expect(result.answers).toHaveLength(1);
        expect(result.answers[0].question).toBe('How did sales perform?');
        expect(result.answers[0].answer).toContain('sales increased by 20%');
        expect(result.answers[0].relatedInsights).toContain('Sales increased by 20%');

        // Check storage update
        expect(mocks.storage.updateProject).toHaveBeenCalledWith(
            mockProjectId,
            expect.objectContaining({
                analysisResults: expect.objectContaining({
                    questionAnswers: result
                })
            })
        );
    });

    it('should handle audience-specific formatting for CEO', async () => {
        mocks.storage.getProject.mockResolvedValue({
            id: mockProjectId,
            analysisResults: mockAnalysisResults
        });

        mocks.aiService.queryData.mockResolvedValue(
            'Strategic Overview: Sales up 20% impacting bottom line.'
        );

        await QuestionAnswerService.generateAnswers({
            projectId: mockProjectId,
            userId: mockUserId,
            questions: ['Status update'],
            analysisResults: mockAnalysisResults,
            audience: { primaryAudience: 'ceo', technicalLevel: 'intermediate' }
        });

        // Check if AI was called
        expect(mocks.aiService.queryData).toHaveBeenCalled();
    });

    it('should handle empty questions gracefully', async () => {
        const result = await QuestionAnswerService.generateAnswers({
            projectId: mockProjectId,
            userId: mockUserId,
            questions: [],
            analysisResults: mockAnalysisResults
        });

        expect(result.answers).toHaveLength(0);
        expect(mocks.aiService.queryData).not.toHaveBeenCalled();
    });

    it('should extract sources and confidence correctly', async () => {
        mocks.storage.getProject.mockResolvedValue({
            id: mockProjectId,
            analysisResults: mockAnalysisResults
        });

        mocks.aiService.queryData.mockResolvedValue(
            'Sales increased by 20% according to sales_data.csv.'
        );

        const result = await QuestionAnswerService.generateAnswers({
            projectId: mockProjectId,
            userId: mockUserId,
            questions: ['What happened?'],
            analysisResults: mockAnalysisResults
        });

        expect(result.answers[0].sources).toContain('sales_data.csv');
        // Confidence boost for matching insight + numbers
        expect(result.answers[0].confidence).toBeGreaterThan(60);
    });
});
