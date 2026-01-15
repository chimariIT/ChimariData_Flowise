import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrepareStep from '@/pages/prepare-step';
import DataUploadStep from '@/pages/data-upload-step';
import DashboardStep from '@/pages/dashboard-step';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    uploadFile: vi.fn(),
    getEnhancedCapabilities: vi.fn(),
    getProjectArtifacts: vi.fn(),
    getProjectDatasets: vi.fn(),
    runAudienceAnalysis: vi.fn(),
    getAudienceAnalysisResults: vi.fn(),
    getAudienceAnalysisTypes: vi.fn(),
    createProjectVisualization: vi.fn()
  }
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

vi.mock('@/components/agent-checkpoints', () => ({
  default: () => <div data-testid="agent-checkpoints" />
}));

vi.mock('@/components/PIIDetectionDialog', () => ({
  PIIDetectionDialog: () => null
}));

vi.mock('@/components/SchemaAnalysis', () => ({
  SchemaAnalysis: () => null
}));

vi.mock('@/components/AgentRecommendationDialog', () => ({
  AgentRecommendationDialog: () => null
}));

vi.mock('@/components/data-transformation-ui', () => ({
  DataTransformationUI: () => null
}));

vi.mock('@/components/agent-chat-interface', () => ({
  AgentChatInterface: () => null
}));

vi.mock('@/components/AudienceDefinitionSection', () => ({
  AudienceDefinitionSection: () => <div data-testid="audience-section" />
}));

vi.mock('@/components/PMAgentClarificationDialog', () => ({
  PMAgentClarificationDialog: () => null
}));

vi.mock('@/lib/performanceTracker', () => ({
  startClientMetric: () => ({
    end: vi.fn()
  })
}));

const sessionHookMock = vi.fn();
vi.mock('@/hooks/useProjectSession', () => ({
  useProjectSession: () => sessionHookMock()
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionHookMock.mockReturnValue({
    session: null,
    updateStep: vi.fn(),
    getPrepareData: () => null,
    loading: false,
    error: null
  });
  (apiClient.getEnhancedCapabilities as Mock).mockResolvedValue({ businessTemplates: [] });
  (apiClient.post as Mock).mockResolvedValue({ success: true });
  (apiClient.getProjectArtifacts as Mock).mockResolvedValue({ artifacts: [] });
  (apiClient.getProjectDatasets as Mock).mockResolvedValue({ datasets: [] });
  (apiClient.runAudienceAnalysis as Mock).mockResolvedValue({ success: true, analysisType: 'descriptive', rawResults: {}, formattedResults: {}, metadata: {} });
  (apiClient.getAudienceAnalysisResults as Mock).mockResolvedValue({ success: true, formattedResults: {}, metadata: { analysisType: 'descriptive', timestamp: new Date().toISOString(), dataSize: 0, columnCount: 0 }, audienceContext: { primaryAudience: 'mixed' } });
  (apiClient.getAudienceAnalysisTypes as Mock).mockResolvedValue({ success: true, availableTypes: ['descriptive', 'custom', 'visualization'], schema: { columns: [], columnTypes: [] } });
  (apiClient.createProjectVisualization as Mock).mockResolvedValue({ success: true, visualization: { title: 'Test', insights: [] } });
  localStorage.clear();
});

describe('PrepareStep', () => {
  it('prefills fields from session data for business journeys', async () => {
    sessionHookMock.mockReturnValue({
      session: { id: 'session-123' },
      updateStep: vi.fn(),
      getPrepareData: () => ({
        analysisGoal: 'Improve family engagement',
        businessQuestions: 'How satisfied are parents?\nWhere are the gaps?',
        selectedTemplates: ['template-1'],
        audience: { primaryAudience: 'mixed', secondaryAudiences: ['parents'], decisionContext: 'Board review' }
      }),
      loading: false,
      error: null
    });

    (apiClient.getEnhancedCapabilities as Mock).mockResolvedValue({
      businessTemplates: [
        { templateId: 'template-1', name: 'Engagement Template', description: 'Parent feedback tracker' }
      ]
    });

    render(<PrepareStep journeyType="business" />);

    expect(await screen.findByText('Business Analysis Preparation')).toBeInTheDocument();
    expect(screen.getByLabelText('Describe your goals')).toHaveValue('Improve family engagement');
    expect(
      screen.getByLabelText("Any initial questions? (You'll refine these in Step 4)")
    ).toHaveValue('How satisfied are parents?\nWhere are the gaps?');
  });
});

describe('DataUploadStep', () => {
  it('shows journey specific hero copy', () => {
    render(<DataUploadStep journeyType="technical" />);
    expect(screen.getByText('Technical Data Upload')).toBeInTheDocument();
    expect(screen.getByText(/full control over validation/i)).toBeInTheDocument();
  });
});

describe('DashboardStep', () => {
  it('renders insights when results load successfully', async () => {
    sessionHookMock.mockReturnValue({
      session: { projectId: 'project-42' },
      updateStep: vi.fn(),
      getPrepareData: () => null,
      loading: false,
      error: null
    });

    (apiClient.get as Mock).mockResolvedValueOnce({
      success: true,
      results: {
        insights: [{
          id: 'insight-1',
          title: 'Parent satisfaction climbing',
          description: 'Up 12% quarter over quarter',
          impact: 'High',
          confidence: 85,
          category: 'Engagement'
        }],
        recommendations: [],
        decisionFramework: { executiveSummary: 'All good', options: [] }
      }
    });

    render(<DashboardStep journeyType="non-tech" />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /insights/i }));
    expect(await screen.findByText('Parent satisfaction climbing')).toBeInTheDocument();
  });

  it('shows error card when API call fails', async () => {
    sessionHookMock.mockReturnValue({
      session: { projectId: 'project-99' },
      updateStep: vi.fn(),
      getPrepareData: () => null,
      loading: false,
      error: null
    });

    (apiClient.get as Mock).mockRejectedValueOnce(new Error('Network down'));

    render(<DashboardStep journeyType="business" />);

    expect(await screen.findByText('Results Not Available')).toBeInTheDocument();
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });
});

