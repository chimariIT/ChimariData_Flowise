import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useJourneyState } from '@/hooks/useJourneyState';

const getJourneyStateMock = vi.fn();

vi.mock('@/lib/api', () => ({
  apiClient: {
    getJourneyState: (...args: any[]) => getJourneyStateMock(...args)
  }
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useJourneyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns journey state when projectId is provided', async () => {
    const journeyResponse = {
      projectId: 'project-1',
      projectName: 'Demo',
      journeyType: 'business',
      templateId: 'template-1',
      templateName: 'Business',
      steps: [],
      currentStep: { id: 'step-1', name: 'Prepare', index: 0 },
      totalSteps: 5,
      completedSteps: [],
      percentComplete: 0,
      costs: { estimated: 100, spent: 0, remaining: 100 },
      canResume: true
    };
    getJourneyStateMock.mockResolvedValueOnce(journeyResponse);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useJourneyState('project-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(journeyResponse));
    expect(getJourneyStateMock).toHaveBeenCalledWith('project-1');
  });

  it('does not run when projectId is missing', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useJourneyState(undefined), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeUndefined();
    });
    expect(getJourneyStateMock).not.toHaveBeenCalled();
  });
});

