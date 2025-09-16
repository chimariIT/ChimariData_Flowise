import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { ErrorHandler, type AppError } from "@/lib/errorHandler";

interface UseErrorHandlerOptions {
  showToast?: boolean;
  logErrors?: boolean;
  onError?: (error: AppError) => void;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { showToast = true, logErrors = true, onError } = options;
  const { toast } = useToast();

  const handleError = useCallback((error: Error | string, context?: string) => {
    const appError = ErrorHandler.handleError(error, context);
    
    // Log error if enabled
    if (logErrors) {
      console.error('Application Error:', {
        code: appError.code,
        message: appError.message,
        context: appError.details,
        severity: appError.severity,
        timestamp: new Date().toISOString()
      });
    }

    // Show toast notification if enabled
    if (showToast) {
      const formatted = ErrorHandler.formatErrorForUser(appError);
      
      toast({
        title: formatted.title,
        description: formatted.description,
        variant: formatted.variant,
        duration: appError.severity === 'critical' ? 0 : // Keep critical errors visible
                   appError.severity === 'high' ? 8000 :
                   appError.severity === 'medium' ? 6000 : 4000
      });
    }

    // Call custom error handler if provided
    if (onError) {
      onError(appError);
    }

    return appError;
  }, [toast, showToast, logErrors, onError]);

  const handleApiError = useCallback(async (response: Response, context?: string) => {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const data = await response.json();
      if (data.error) {
        errorMessage = data.error;
      } else if (data.message) {
        errorMessage = data.message;
      }
    } catch (e) {
      // Response is not JSON, use status text
    }

    return handleError(errorMessage, context);
  }, [handleError]);

  const handleNetworkError = useCallback((error: Error, context?: string) => {
    if (error.name === 'AbortError') {
      return handleError('Request was cancelled', context);
    }
    
    if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
      return handleError('NETWORK_ERROR', context);
    }

    return handleError(error, context);
  }, [handleError]);

  const clearErrors = useCallback(() => {
    // This would clear any persistent error states if we had them
    // For now, just dismiss any active toasts
    toast({ title: "", description: "", duration: 0 });
  }, [toast]);

  return {
    handleError,
    handleApiError,
    handleNetworkError,
    clearErrors,
    ErrorHandler
  };
}

// Specialized hooks for specific error types

export function useAuthErrorHandler() {
  return useErrorHandler({
    showToast: true,
    onError: (error) => {
      // Redirect to login for certain auth errors
      if (error.code === 'AUTH_SESSION_EXPIRED' || error.code === 'AUTH_UNAUTHORIZED') {
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    }
  });
}

export function useUploadErrorHandler() {
  return useErrorHandler({
    showToast: true,
    onError: (error) => {
      // Track upload errors for analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'upload_error', {
          error_code: error.code,
          error_severity: error.severity
        });
      }
    }
  });
}

export function usePaymentErrorHandler() {
  return useErrorHandler({
    showToast: true,
    onError: (error) => {
      // Special handling for payment errors
      if (error.code.startsWith('PAYMENT_')) {
        // Track payment failures
        if (typeof window !== 'undefined' && (window as any).gtag) {
          (window as any).gtag('event', 'payment_error', {
            error_code: error.code
          });
        }
      }
    }
  });
}