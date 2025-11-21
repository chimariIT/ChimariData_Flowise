import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api';

interface AuthState {
  user: any | null;
  loading: boolean;
  lastCheck: number;
  isAuthenticated: boolean;
}

// Request cache to prevent duplicate auth calls
const authRequestCache = new Map<string, Promise<any>>();
const AUTH_CACHE_TTL = 5000; // 5 seconds

export function useOptimizedAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    lastCheck: 0,
    isAuthenticated: false
  });
  
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTimeRef = useRef<number>(0);

  // Throttled auth check to prevent excessive requests
  const checkAuth = useCallback(async (force = false) => {
    const now = Date.now();
    
    // Throttle requests to maximum once per 5 seconds
    if (!force && now - lastRequestTimeRef.current < AUTH_CACHE_TTL) {
      return authState;
    }
    
    lastRequestTimeRef.current = now;
    
    try {
      const token = localStorage.getItem('auth_token');
      
      // Create cache key for this request
      const cacheKey = `auth_check_${token || 'no_token'}`;
      
      // Check if we have a pending request for the same token
      if (authRequestCache.has(cacheKey)) {
        console.log('🚀 Using cached auth request');
        const cachedResult = await authRequestCache.get(cacheKey);
        return cachedResult;
      }
      
      // Create new request promise
      const authPromise = (async () => {
        if (!token) {
          setAuthState(prev => ({
            ...prev,
            user: null,
            loading: false,
            isAuthenticated: false,
            lastCheck: now
          }));
          return { user: null, isAuthenticated: false };
        }
        
        try {
          const userData = await apiClient.getCurrentUser();
          
          setAuthState(prev => ({
            ...prev,
            user: userData,
            loading: false,
            isAuthenticated: true,
            lastCheck: now
          }));
          
          return { user: userData, isAuthenticated: true };
        } catch (error) {
          // Clear invalid token
          console.error('🔐 [useOptimizedAuth] checkAuth failed, REMOVING TOKEN');
          console.error('🔐 [useOptimizedAuth] Error was:', error);
          localStorage.removeItem('auth_token');

          setAuthState(prev => ({
            ...prev,
            user: null,
            loading: false,
            isAuthenticated: false,
            lastCheck: now
          }));

          return { user: null, isAuthenticated: false };
        }
      })();
      
      // Cache the promise
      authRequestCache.set(cacheKey, authPromise);
      
      // Clean up cache after request completes
      setTimeout(() => {
        authRequestCache.delete(cacheKey);
      }, AUTH_CACHE_TTL);
      
      return await authPromise;
      
    } catch (error) {
      console.error('Auth check failed:', error);
      
      setAuthState(prev => ({
        ...prev,
        user: null,
        loading: false,
        isAuthenticated: false,
        lastCheck: now
      }));
      
      return { user: null, isAuthenticated: false };
    }
  }, [authState]);

  // Optimized login function
  const login = useCallback(async (credentials: { email: string; password: string }) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));
      
      const result = await apiClient.login(credentials);
      
      if (result.token) {
        localStorage.setItem('auth_token', result.token);
        window.dispatchEvent(new Event('auth-token-stored'));
      }
      
      // Force auth check after login
      await checkAuth(true);
      
      return result;
    } catch (error) {
      setAuthState(prev => ({ ...prev, loading: false }));
      throw error;
    }
  }, [checkAuth]);

  // Optimized logout function
  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear local state regardless of API response
      localStorage.removeItem('auth_token');
      
      setAuthState({
        user: null,
        loading: false,
        lastCheck: 0,
        isAuthenticated: false
      });
      
      // Clear any pending auth requests
      authRequestCache.clear();
      window.dispatchEvent(new Event('auth-token-cleared'));
    }
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    checkAuth(true);
  }, []);

  // Listen for auth token storage events (triggered after login)
  useEffect(() => {
    const handleAuthTokenStored = () => {
      // Clear cache and force immediate auth check when token is stored
      authRequestCache.clear();
      lastRequestTimeRef.current = 0; // Reset throttle
      checkAuth(true);
    };

    const handleAuthTokenCleared = () => {
      authRequestCache.clear();
      lastRequestTimeRef.current = 0;
      setAuthState({
        user: null,
        loading: false,
        lastCheck: Date.now(),
        isAuthenticated: false
      });
    };

    window.addEventListener('auth-token-stored', handleAuthTokenStored);
    window.addEventListener('auth-token-cleared', handleAuthTokenCleared);
    return () => {
      window.removeEventListener('auth-token-stored', handleAuthTokenStored);
      window.removeEventListener('auth-token-cleared', handleAuthTokenCleared);
    };
  }, [checkAuth]);

  // Set up periodic auth checks (less frequent)
  useEffect(() => {
    // Check auth every 30 seconds instead of constantly
    checkIntervalRef.current = setInterval(() => {
      checkAuth();
    }, 30000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [checkAuth]);

  return {
    user: authState.user,
    loading: authState.loading,
    isAuthenticated: authState.isAuthenticated,
    lastCheck: authState.lastCheck,
    login,
    logout,
    checkAuth: () => checkAuth(true),
    clearCache: () => authRequestCache.clear()
  };
}

// Hook for components that need to know auth state
export function useAuthState() {
  const { user, loading, isAuthenticated } = useOptimizedAuth();
  
  return {
    user,
    loading,
    isAuthenticated,
    isReady: !loading
  };
}

// Hook for auth-protected routes
export function useAuthGuard() {
  const { user, loading, isAuthenticated } = useOptimizedAuth();
  
  return {
    user,
    loading,
    isAuthenticated,
    canAccess: isAuthenticated && !loading,
    redirectToLogin: !isAuthenticated && !loading
  };
}












