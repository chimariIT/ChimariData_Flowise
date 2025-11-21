import { renderHook, act } from '@testing-library/react';
import { useProjectSession } from '@/hooks/useProjectSession';

const mockGetSession = vi.fn();
const mockUpdateStep = vi.fn();
const mockValidateSession = vi.fn();
const mockLinkProject = vi.fn();
const mockClearSession = vi.fn();

vi.mock('@/hooks/useOptimizedAuth', () => ({
  useOptimizedAuth: () => ({
    isAuthenticated: true,
    loading: false
  })
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    getProjectSession: (...args: any[]) => mockGetSession(...args),
    updateProjectSessionStep: (...args: any[]) => mockUpdateStep(...args),
    validateProjectSession: (...args: any[]) => mockValidateSession(...args),
    linkProjectSession: (...args: any[]) => mockLinkProject(...args),
    clearProjectSession: (...args: any[]) => mockClearSession(...args)
  }
}));

const createSession = (overrides: Partial<any> = {}) => ({
  id: 'session-123',
  userId: 'user-1',
  projectId: 'project-1',
  journeyType: 'non-tech',
  currentStep: 'prepare',
  prepareData: null,
  dataUploadData: null,
  executeData: null,
  pricingData: null,
  resultsData: null,
  dataHash: null,
  serverValidated: false,
  lastActivity: new Date().toISOString(),
  expiresAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

describe('useProjectSession hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('auth_token', 'test-token');
  });

  it('initializes session on demand', async () => {
    mockGetSession.mockResolvedValueOnce({ session: createSession({ id: 'session-init' }) });

    const { result } = renderHook(() => useProjectSession({ journeyType: 'non-tech', autoSync: false }));

    await act(async () => {
      await result.current.initSession();
    });

    expect(mockGetSession).toHaveBeenCalledWith('non-tech');
    expect(result.current.session?.id).toBe('session-init');
  });

  it('updates step data and caches it locally', async () => {
    mockGetSession.mockResolvedValueOnce({ session: createSession() });
    mockUpdateStep.mockResolvedValueOnce({
      session: createSession({ prepareData: { goal: 'Grow' } })
    });

    const { result } = renderHook(() => useProjectSession({ journeyType: 'non-tech', autoSync: false }));

    await act(async () => {
      await result.current.initSession();
    });

    await act(async () => {
      await result.current.updateStep('prepare', { goal: 'Grow' });
    });

    expect(mockUpdateStep).toHaveBeenCalledWith('session-123', 'prepare', { goal: 'Grow' });
    const cached = JSON.parse(localStorage.getItem('chimari_prepare_data') || 'null');
    expect(cached).toEqual({ goal: 'Grow' });
    expect(result.current.session?.prepareData).toEqual({ goal: 'Grow' });
  });

  it('validates execution results with the server', async () => {
    mockGetSession.mockResolvedValueOnce({ session: createSession() });
    mockValidateSession.mockResolvedValueOnce({
      session: createSession({ executeData: { status: 'ok' } }),
      validated: true
    });

    const { result } = renderHook(() => useProjectSession({ journeyType: 'non-tech', autoSync: false }));

    await act(async () => {
      await result.current.initSession();
    });

    let validated = false;
    await act(async () => {
      validated = await result.current.validateExecution({ status: 'ok' });
    });

    expect(validated).toBe(true);
    expect(mockValidateSession).toHaveBeenCalledWith('session-123', { status: 'ok' });
    expect(result.current.session?.executeData).toEqual({ status: 'ok' });
  });
});

