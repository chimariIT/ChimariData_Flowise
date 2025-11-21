import { renderHook, act, waitFor } from '@testing-library/react';
import { UsageMonitoringProvider, useUsageMonitoring } from '@/hooks/useUsageMonitoring';

const getMock = vi.fn();
const postMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: (...args: any[]) => getMock(...args),
    post: (...args: any[]) => postMock(...args)
  }
}));

const mockUserRole = {
  userRoleData: { role: 'starter' },
  loading: false,
  error: null
};

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => mockUserRole
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock })
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <UsageMonitoringProvider>{children}</UsageMonitoringProvider>
);

describe('useUsageMonitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({
      usage: {
        aiQueries: 80,
        dataUploads: 4,
        dataVolumeMB: 950,
        projectsCreated: 2,
        visualizationsGenerated: 10,
        codeGenerations: 0,
        consultationMinutes: 30
      },
      limits: {
        maxAiQueries: 100,
        maxDataUploads: 10,
        maxDataVolumeMB: 1000,
        maxProjects: 5,
        maxVisualizations: 20,
        canGenerateCode: true,
        consultationMinutesIncluded: 60
      }
    });
    postMock.mockResolvedValue({ allowed: true });
  });

  it('loads usage data, exposes warnings, and checks actions', async () => {
    const { result } = renderHook(() => useUsageMonitoring(), { wrapper });

    await waitFor(() => expect(result.current.currentUsage).not.toBeNull());
    expect(result.current.currentUsage?.aiQueries).toBe(80);
    expect(result.current.limits?.maxAiQueries).toBe(100);
    expect(result.current.warnings.length).toBeGreaterThan(0);
    expect(result.current.shouldShowUpgradePrompt()).toBe(true);
    let allowed = false;
    await act(async () => {
      allowed = await result.current.checkCanPerformAction('ai_query', 1);
    });
    expect(allowed).toBe(true);
    expect(postMock).toHaveBeenCalledWith('/api/usage/check', { action: 'ai_query', amount: 1 });
  });
});

