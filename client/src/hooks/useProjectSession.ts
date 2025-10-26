/**
 * useProjectSession Hook
 *
 * Secure session management hook that syncs with server-side storage.
 * Replaces insecure localStorage with tamper-proof server state.
 *
 * Features:
 * - Automatic session creation and retrieval
 * - Hybrid storage: Server (authoritative) + localStorage (cache)
 * - Integrity validation
 * - Cross-device resume support
 * - Automatic session cleanup
 */

import { useState, useEffect, useCallback } from 'react';
import { useOptimizedAuth } from './useOptimizedAuth';

interface ProjectSession {
  id: string;
  userId: string;
  projectId: string | null;
  journeyType: string;
  currentStep: string;
  prepareData: any;
  dataUploadData: any;
  executeData: any;
  pricingData: any;
  resultsData: any;
  dataHash: string | null;
  serverValidated: boolean;
  lastActivity: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UseProjectSessionOptions {
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';
  autoSync?: boolean; // Auto-sync with server (default: true)
}

interface UseProjectSessionReturn {
  session: ProjectSession | null;
  loading: boolean;
  error: string | null;

  // Session management
  initSession: () => Promise<void>;
  updateStep: (step: string, data: any) => Promise<void>;
  validateExecution: (executionResults: any) => Promise<boolean>;
  linkProject: (projectId: string) => Promise<void>;
  clearSession: () => Promise<void>;

  // Getters for step data
  getPrepareData: () => any;
  getExecuteData: () => any;
  getPricingData: () => any;
}

export function useProjectSession(options: UseProjectSessionOptions): UseProjectSessionReturn {
  const { journeyType, autoSync = true } = options;
  const { token, isAuthenticated } = useOptimizedAuth();

  const [session, setSession] = useState<ProjectSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or retrieve session
  const initSession = useCallback(async () => {
    if (!isAuthenticated || !token) {
      console.warn('User not authenticated, skipping session init');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/project-session/current?journeyType=${journeyType}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to initialize session');
      }

      const data = await response.json();
      setSession(data.session);

      // Cache session ID in localStorage for quick access
      if (data.session?.id) {
        try {
          localStorage.setItem(`chimari_session_${journeyType}`, data.session.id);
        } catch (e) {
          console.warn('Failed to cache session ID:', e);
        }
      }

    } catch (err: any) {
      console.error('Error initializing session:', err);
      setError(err.message || 'Failed to initialize session');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, journeyType]);

  // Update session data for specific step
  const updateStep = useCallback(async (step: string, data: any) => {
    if (!session) {
      console.error('No active session to update');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/project-session/${session.id}/update-step`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ step, data })
      });

      if (!response.ok) {
        throw new Error('Failed to update session step');
      }

      const result = await response.json();
      setSession(result.session);

      // Also cache in localStorage for offline access
      try {
        const cacheKey = `chimari_${step}_data`;
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to cache step data:', e);
      }

    } catch (err: any) {
      console.error('Error updating session step:', err);
      setError(err.message || 'Failed to update session');
      throw err; // Re-throw so caller can handle
    } finally {
      setLoading(false);
    }
  }, [session, token]);

  // Validate execution results with server
  const validateExecution = useCallback(async (executionResults: any): Promise<boolean> => {
    if (!session) {
      console.error('No active session to validate');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/project-session/${session.id}/validate-execution`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ executionResults })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.tamperingDetected) {
          throw new Error('❌ Data tampering detected! Please re-run your analysis.');
        }
        throw new Error('Validation failed');
      }

      const result = await response.json();
      setSession(result.session);

      return result.validated;

    } catch (err: any) {
      console.error('Error validating execution:', err);
      setError(err.message || 'Validation failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [session, token]);

  // Link project to session
  const linkProject = useCallback(async (projectId: string) => {
    if (!session) {
      console.error('No active session to link project');
      return;
    }

    try {
      const response = await fetch(`/api/project-session/${session.id}/link-project`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectId })
      });

      if (!response.ok) {
        throw new Error('Failed to link project');
      }

      const result = await response.json();
      setSession(result.session);

    } catch (err: any) {
      console.error('Error linking project:', err);
      setError(err.message || 'Failed to link project');
    }
  }, [session, token]);

  // Clear/expire session
  const clearSession = useCallback(async () => {
    if (!session) return;

    try {
      await fetch(`/api/project-session/${session.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setSession(null);

      // Clear localStorage cache
      try {
        localStorage.removeItem(`chimari_session_${journeyType}`);
        ['prepare', 'execute', 'pricing'].forEach(step => {
          localStorage.removeItem(`chimari_${step}_data`);
        });
      } catch (e) {
        console.warn('Failed to clear localStorage:', e);
      }

    } catch (err: any) {
      console.error('Error clearing session:', err);
    }
  }, [session, token, journeyType]);

  // Getters for step data (with fallback to localStorage)
  const getPrepareData = useCallback(() => {
    if (session?.prepareData) return session.prepareData;

    // Fallback to localStorage cache
    try {
      const cached = localStorage.getItem('chimari_prepare_data');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }, [session]);

  const getExecuteData = useCallback(() => {
    if (session?.executeData) return session.executeData;

    try {
      const cached = localStorage.getItem('chimari_execution_results');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }, [session]);

  const getPricingData = useCallback(() => {
    if (session?.pricingData) return session.pricingData;

    try {
      const cached = localStorage.getItem('chimari_pricing_data');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }, [session]);

  // Auto-initialize session on mount
  useEffect(() => {
    if (autoSync && isAuthenticated) {
      initSession();
    }
  }, [autoSync, isAuthenticated, initSession]);

  return {
    session,
    loading,
    error,
    initSession,
    updateStep,
    validateExecution,
    linkProject,
    clearSession,
    getPrepareData,
    getExecuteData,
    getPricingData,
  };
}
