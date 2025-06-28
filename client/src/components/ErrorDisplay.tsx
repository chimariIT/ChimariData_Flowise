import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  AlertTriangle, 
  XCircle, 
  AlertCircle, 
  Info, 
  RefreshCw, 
  ChevronDown,
  ExternalLink,
  MessageSquare
} from "lucide-react";
import { useState } from "react";
import type { AppError } from "@/lib/errorHandler";

interface ErrorDisplayProps {
  error: AppError;
  onRetry?: () => void;
  onDismiss?: () => void;
  onContactSupport?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss, 
  onContactSupport, 
  className = "",
  compact = false 
}: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getIcon = () => {
    switch (error.severity) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'high':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'medium':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'low':
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getVariant = (): "default" | "destructive" => {
    return error.severity === 'critical' || error.severity === 'high' ? 'destructive' : 'default';
  };

  if (compact) {
    return (
      <Alert variant={getVariant()} className={className}>
        {getIcon()}
        <AlertTitle>Error</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{error.userMessage}</span>
          {onRetry && error.recoverable && (
            <Button size="sm" variant="outline" onClick={onRetry} className="ml-2">
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className={`border-l-4 ${
      error.severity === 'critical' ? 'border-l-red-600' :
      error.severity === 'high' ? 'border-l-red-500' :
      error.severity === 'medium' ? 'border-l-yellow-500' :
      'border-l-blue-500'
    } ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start space-x-3">
          {getIcon()}
          <div className="flex-1">
            <CardTitle className="text-lg">
              {error.code === 'UNKNOWN_ERROR' ? 'Something Went Wrong' : 
               error.code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </CardTitle>
            <CardDescription className="mt-1">
              {error.userMessage}
            </CardDescription>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              ×
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Suggested Actions */}
        {error.suggestedActions.length > 0 && (
          <div>
            <h4 className="font-medium text-sm mb-2">What you can do:</h4>
            <ul className="space-y-1 text-sm">
              {error.suggestedActions.map((action, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {onRetry && error.recoverable && (
            <Button onClick={onRetry} variant="default" size="sm">
              <RefreshCw className="h-3 w-3 mr-1" />
              Try Again
            </Button>
          )}
          
          {onContactSupport && (
            <Button onClick={onContactSupport} variant="outline" size="sm">
              <MessageSquare className="h-3 w-3 mr-1" />
              Contact Support
            </Button>
          )}

          {error.code === 'UPLOAD_INVALID_FORMAT' && (
            <Button variant="outline" size="sm" asChild>
              <a href="/docs/file-formats" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" />
                View Supported Formats
              </a>
            </Button>
          )}

          {error.code.startsWith('PAYMENT_') && (
            <Button variant="outline" size="sm" asChild>
              <a href="/docs/payment-help" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" />
                Payment Help
              </a>
            </Button>
          )}
        </div>

        {/* Technical Details (Collapsible) */}
        {(error.details || error.message !== error.userMessage) && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Technical Details</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-gray-50 p-3 rounded text-xs font-mono">
                <div><strong>Error Code:</strong> {error.code}</div>
                {error.details && <div><strong>Context:</strong> {error.details}</div>}
                {error.message !== error.userMessage && (
                  <div><strong>Technical Message:</strong> {error.message}</div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Recovery Status */}
        {!error.recoverable && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This error cannot be automatically resolved. Please contact support for assistance.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: AppError) => React.ReactNode;
  onError?: (error: AppError) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const appError = ErrorHandler.handleError(error, 'React Error Boundary');
    return {
      hasError: true,
      error: appError
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const appError = ErrorHandler.handleError(error, `Component: ${errorInfo.componentStack}`);
    this.props.onError?.(appError);
    
    // Log to error reporting service
    console.error('Error Boundary caught an error:', {
      error: appError,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <ErrorDisplay 
              error={this.state.error}
              onRetry={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              onContactSupport={() => {
                window.location.href = '/contact-support';
              }}
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}