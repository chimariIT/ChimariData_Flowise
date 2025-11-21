import { renderHook, act, waitFor } from '@testing-library/react';
import { useOptimizedAuth } from '@/hooks/useOptimizedAuth';

const getCurrentUserMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();

vi.mock('@/lib/api', () => ({
  apiClient: {
    getCurrentUser: (...args: any[]) => getCurrentUserMock(...args),
    login: (...args: any[]) => loginMock(...args),
    logout: (...args: any[]) => logoutMock(...args)
  }
}));

describe('useOptimizedAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('reports unauthenticated state when no token is present', async () => {
    const { result } = renderHook(() => useOptimizedAuth());

    await act(async () => {
      await result.current.checkAuth();
    });

    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('fetches current user when a token exists', async () => {
    localStorage.setItem('auth_token', 'token-123');
    getCurrentUserMock.mockResolvedValueOnce({ id: 'user-1', email: 'test@example.com' });

    const { result } = renderHook(() => useOptimizedAuth());

    await act(async () => {
      await result.current.checkAuth();
    });

    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({ id: 'user-1', email: 'test@example.com' });
  });

  it('stores token on login and triggers auth check', async () => {
    loginMock.mockResolvedValueOnce({ token: 'new-token' });
    getCurrentUserMock.mockResolvedValueOnce({ id: 'user-2' });

    const { result, unmount } = renderHook(() => useOptimizedAuth());

    await act(async () => {
      await result.current.login({ email: 'user@example.com', password: 'secret' });
    });

    expect(loginMock).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret' });
    expect(localStorage.getItem('auth_token')).toBe('new-token');
    await waitFor(() => expect(getCurrentUserMock).toHaveBeenCalled());
    unmount();
  });
});

