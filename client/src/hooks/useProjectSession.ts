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
import { apiClient } from '@/lib/api';

type SessionJourneyType = 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom';

const JOURNEY_TYPE_MAP: Record<string, SessionJourneyType> = {
  'non-tech': 'non-tech',
  'non_tech': 'non-tech',
  'ai_guided': 'non-tech',
  guided: 'non-tech',
  business: 'business',
  'template_based': 'business',
  technical: 'technical',
  'self_service': 'technical',
  consultation: 'consultation',
  custom: 'custom',
};

function normalizeSessionJourneyType(input?: string | SessionJourneyType): SessionJourneyType {
  if (!input) return 'non-tech';
  const key = `${input}`.toLowerCase();
  return JOURNEY_TYPE_MAP[key] ?? 'non-tech';
}

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
  journeyType?: string | SessionJourneyType;
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

export function useProjectSession(options?: UseProjectSessionOptions): UseProjectSessionReturn {
  const normalizedJourneyType = normalizeSessionJourneyType(options?.journeyType);
  const autoSync = options?.autoSync ?? true;
  const { isAuthenticated, loading: authLoading } = useOptimizedAuth();


  const [session, setSession] = useState<ProjectSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearLocalSessionArtifacts = useCallback((journeyKey: SessionJourneyType) => {
    try {
      localStorage.removeItem(`chimari_session_${journeyKey}`);
      ['prepare', 'execute', 'pricing', 'results', 'data'].forEach(step => {
        localStorage.removeItem(`chimari_${step}_data`);
      });
    } catch (storageError) {
      console.warn('Failed to clear cached session artifacts:', storageError);
    }
  }, []);

  const refreshSession = useCallback(async (reason: string): Promise<ProjectSession | null> => {
    const journeyKey = normalizeSessionJourneyType(session?.journeyType || normalizedJourneyType);
    if (!journeyKey) {
      console.warn(`Cannot refresh session during ${reason}: unknown journey type`);
      return null;
    }

    try {
      console.log(`♻️ Refreshing project session (${reason}) for journey ${journeyKey}`);
      const data = await apiClient.getProjectSession(journeyKey);
      if (data?.session) {
        const expiresAtValue = data.session.expiresAt ? new Date(data.session.expiresAt) : null;
        const now = new Date();

        if (expiresAtValue && now.getTime() - expiresAtValue.getTime() > 60 * 60 * 1000) {
          console.warn(`🛑 Session ${data.session.id} is stale (expired at ${expiresAtValue.toISOString()}). Clearing cached session.`);
          try {
            await apiClient.clearProjectSession(data.session.id);
          } catch (clearError) {
            console.warn('Failed to clear expired project session:', clearError);
          }
          clearLocalSessionArtifacts(journeyKey);
          setSession(null);

          try {
            const replacement = await apiClient.getProjectSession(journeyKey);
            if (replacement?.session) {
              console.info(`✅ Started fresh project session ${replacement.session.id} after clearing expired session ${data.session.id}`);
              try {
                localStorage.setItem(`chimari_session_${journeyKey}`, replacement.session.id);
              } catch (cacheError) {
                console.warn('Failed to cache new session ID after expiry replacement:', cacheError);
              }
              setSession(replacement.session);
              setError(null);
              return replacement.session;
            }
          } catch (replacementError) {
            console.error('Failed to create a replacement project session:', replacementError);
          }

          setError('Session expired. Please restart your journey.');
          return null;
        }

        setSession(data.session);
        setError(null);
        return data.session;
      }

      console.warn(`Session refresh (${reason}) returned no session payload`);
      return null;
    } catch (refreshError: any) {
      console.error(`Failed to refresh project session during ${reason}:`, refreshError);
      setError(refreshError?.message || 'Session expired. Please restart your journey.');
      return null;
    }
  }, [session?.journeyType, normalizedJourneyType, clearLocalSessionArtifacts]);

  // Initialize or retrieve session
  const initSession = useCallback(async () => {
    // CRITICAL: Wait for auth loading to complete before checking authentication status
    // This prevents premature skipping of session init
    if (authLoading) {
      // Still loading - wait for auth check to complete
      return;
    }
    
    // Avoid session initialization when user is not authenticated or token missing
    if (!isAuthenticated || !localStorage.getItem('auth_token')) {
      console.warn('User not authenticated, skipping session init');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.getProjectSession(normalizedJourneyType);
      setSession(data.session);

      // Cache session ID in localStorage for quick access
      if (data.session?.id) {
        try {
          localStorage.setItem(`chimari_session_${normalizedJourneyType}`, data.session.id);
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
  }, [isAuthenticated, normalizedJourneyType]);

  // Update session data for specific step
  const updateStep = useCallback(async (step: string, data: any) => {
    setLoading(true);
    setError(null);

    const performUpdate = async (targetSession: ProjectSession) => {
      const result = await apiClient.updateProjectSessionStep(targetSession.id, step, data);
      setSession(result.session);

      try {
        const cacheKey = `chimari_${step}_data`;
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to cache step data:', e);
      }
    };

    try {
      const activeSession = session || await refreshSession(`update-step(${step})`);
      if (!activeSession) {
        throw new Error('Session unavailable. Please restart your journey.');
      }

      await performUpdate(activeSession);

    } catch (err: any) {
      console.error('Error updating session step:', err);
      if (err?.status === 410) {
        const refreshedSession = await refreshSession(`retry-step(${step})`);
        if (refreshedSession) {
          try {
            await performUpdate(refreshedSession);
            return;
          } catch (retryError) {
            console.error('Retry after session refresh failed:', retryError);
            const retryMessage = retryError instanceof Error ? retryError.message : null;
            setError(retryMessage || 'Failed to update session after refresh');
            throw retryError;
          }
        }

        console.warn('Session refresh failed after 410 response. Clearing local session state.');
        setSession(null);
      }

      setError(err.message || 'Failed to update session');
      throw err; // Re-throw so caller can handle
    } finally {
      setLoading(false);
    }
  }, [session, refreshSession]);

  // Validate execution results with server
  const validateExecution = useCallback(async (executionResults: any): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const performValidation = async (targetSession: ProjectSession) => {
      const result = await apiClient.validateProjectSession(targetSession.id, executionResults);
      setSession(result.session);
      return result.validated;
    };

    try {
      const activeSession = session || await refreshSession('validate-execution');
      if (!activeSession) {
        throw new Error('Session unavailable. Please restart your journey.');
      }

      return await performValidation(activeSession);

    } catch (err: any) {
      console.error('Error validating execution:', err);
      const tamperingDetected = err?.details?.tamperingDetected;
      const message = tamperingDetected
        ? '❌ Data tampering detected! Please re-run your analysis.'
        : err?.message || 'Validation failed';
      if (err?.status === 410) {
        const refreshedSession = await refreshSession('retry-validate');
        if (refreshedSession) {
          try {
            return await performValidation(refreshedSession);
          } catch (retryError) {
            console.error('Retry validation after session refresh failed:', retryError);
            const retryMessage = retryError instanceof Error ? retryError.message : null;
            setError(retryMessage || message);
            return false;
          }
        }
      }

      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [session, refreshSession]);

  // Link project to session
  const linkProject = useCallback(async (projectId: string) => {
    try {
      const activeSession = session || await refreshSession('link-project');
      if (!activeSession) {
        throw new Error('Session unavailable. Please restart your journey.');
      }

      const result = await apiClient.linkProjectSession(activeSession.id, projectId);
      setSession(result.session);

    } catch (err: any) {
      console.error('Error linking project:', err);
      setError(err.message || 'Failed to link project');
    }
  }, [session, refreshSession]);

  // Clear/expire session
  const clearSession = useCallback(async () => {
    if (!session) return;

    try {
      await apiClient.clearProjectSession(session.id);

      setSession(null);

      // Clear localStorage cache
      clearLocalSessionArtifacts(normalizedJourneyType);

    } catch (err: any) {
      console.error('Error clearing session:', err);
    }
  }, [session, normalizedJourneyType, clearLocalSessionArtifacts]);

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

  // Auto-initialize session on mount - wait for auth loading to complete
  useEffect(() => {
    if (autoSync && !authLoading && isAuthenticated) {
      initSession();
    }
  }, [autoSync, authLoading, isAuthenticated, initSession]);

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
