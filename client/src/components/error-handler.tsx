import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  RefreshCw, 
  HelpCircle, 
  ExternalLink,
  Copy,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import { FeedbackToast } from './ui/feedback';

interface ErrorDetails {
  code: string;
  message: string;
  suggestion: string;
  documentation?: string;
  retryable: boolean;
  timestamp: Date;
  context?: Record<string, any>;
}

interface ErrorHandlerProps {
  error: Error | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  context?: string;
  className?: string;
}

export function ErrorHandler({ 
  error, 
  onRetry, 
  onDismiss, 
  context = 'operation',
  className 
}: ErrorHandlerProps) {
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (error) {
      const details = analyzeError(error);
      setErrorDetails(details);
    }
  }, [error]);

  const analyzeError = (error: Error): ErrorDetails => {
    const message = error.message.toLowerCase();
    
    // Database errors
    if (message.includes('database') || message.includes('connection')) {
      return {
        code: 'DB_CONNECTION_ERROR',
        message: 'Database connection failed',
        suggestion: 'Please check your internet connection and try again. If the problem persists, contact support.',
        documentation: '/docs/troubleshooting/database',
        retryable: true,
        timestamp: new Date(),
        context: { originalError: error.message }
      };
    }
    
    // Authentication errors
    if (message.includes('auth') || message.includes('unauthorized')) {
      return {
        code: 'AUTH_ERROR',
        message: 'Authentication failed',
        suggestion: 'Please log in again to continue.',
        documentation: '/docs/authentication',
        retryable: false,
        timestamp: new Date(),
        context: { originalError: error.message }
      };
    }
    
    // File upload errors
    if (message.includes('file') || message.includes('upload')) {
      return {
        code: 'FILE_UPLOAD_ERROR',
        message: 'File upload failed',
        suggestion: 'Please check your file format and size, then try uploading again.',
        documentation: '/docs/file-formats',
        retryable: true,
        timestamp: new Date(),
        context: { originalError: error.message }
      };
    }
    
    // Agent errors
    if (message.includes('agent') || message.includes('coordination')) {
      return {
        code: 'AGENT_ERROR',
        message: 'Analysis agent error',
        suggestion: 'The analysis system encountered an issue. Please try again or contact support if the problem persists.',
        documentation: '/docs/agents',
        retryable: true,
        timestamp: new Date(),
        context: { originalError: error.message }
      };
    }
    
    // Generic error
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
      suggestion: 'Please try again. If the problem persists, contact support with the error details.',
      documentation: '/docs/support',
      retryable: true,
      timestamp: new Date(),
      context: { originalError: error.message }
    };
  };

  const copyErrorDetails = async () => {
    if (errorDetails) {
      const errorText = `
Error Code: ${errorDetails.code}
Message: ${errorDetails.message}
Context: ${context}
Timestamp: ${errorDetails.timestamp.toISOString()}
Original Error: ${errorDetails.context?.originalError || 'N/A'}
      `.trim();
      
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!error || !errorDetails) {
    return null;
  }

  const getErrorIcon = () => {
    switch (errorDetails.code) {
      case 'DB_CONNECTION_ERROR':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'AUTH_ERROR':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'FILE_UPLOAD_ERROR':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'AGENT_ERROR':
        return <AlertTriangle className="w-5 h-5 text-purple-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
  };

  const getErrorColor = () => {
    switch (errorDetails.code) {
      case 'DB_CONNECTION_ERROR':
        return 'border-red-200 bg-red-50';
      case 'AUTH_ERROR':
        return 'border-yellow-200 bg-yellow-50';
      case 'FILE_UPLOAD_ERROR':
        return 'border-orange-200 bg-orange-50';
      case 'AGENT_ERROR':
        return 'border-purple-200 bg-purple-50';
      default:
        return 'border-red-200 bg-red-50';
    }
  };

  return (
    <div className={className}>
      <Card className={getErrorColor()}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            {getErrorIcon()}
            <span>Error: {errorDetails.message}</span>
            <Badge variant="outline" className="ml-auto">
              {errorDetails.code}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {errorDetails.suggestion}
          </div>
          
          <div className="flex items-center space-x-2">
            {errorDetails.retryable && onRetry && (
              <Button
                onClick={onRetry}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
            
            {errorDetails.documentation && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(errorDetails.documentation, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Documentation
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={copyErrorDetails}
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              {copied ? 'Copied!' : 'Copy Details'}
            </Button>
            
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
              >
                Dismiss
              </Button>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground">
            Error occurred at {errorDetails.timestamp.toLocaleTimeString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });
    
    // Log error to monitoring service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} retry={this.handleRetry} />;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Something went wrong</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Please try refreshing the page.
              </p>
              
              <div className="flex space-x-2">
                <Button onClick={this.handleRetry} className="flex-1">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.reload()}
                  className="flex-1"
                >
                  Refresh Page
                </Button>
              </div>
              
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Error Details</summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

interface UserFeedbackProps {
  onSubmit: (feedback: {
    rating: number;
    comment: string;
    category: string;
  }) => void;
  className?: string;
}

export function UserFeedback({ onSubmit, className }: UserFeedbackProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState('general');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    onSubmit({ rating, comment, category });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card className={className}>
        <CardContent className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="font-medium mb-2">Thank you for your feedback!</h3>
          <p className="text-sm text-muted-foreground">
            Your input helps us improve the platform.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <HelpCircle className="w-5 h-5" />
          <span>Share Your Feedback</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">How would you rate your experience?</label>
          <div className="flex space-x-1 mt-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`text-2xl ${
                  star <= rating ? 'text-yellow-400' : 'text-gray-300'
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        
        <div>
          <label className="text-sm font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full mt-1 p-2 border rounded-md"
          >
            <option value="general">General Feedback</option>
            <option value="bug">Bug Report</option>
            <option value="feature">Feature Request</option>
            <option value="performance">Performance Issue</option>
            <option value="ui">User Interface</option>
          </select>
        </div>
        
        <div>
          <label className="text-sm font-medium">Comments (optional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us more about your experience..."
            className="w-full mt-1 p-2 border rounded-md h-20"
          />
        </div>
        
        <Button 
          onClick={handleSubmit} 
          disabled={rating === 0}
          className="w-full"
        >
          Submit Feedback
        </Button>
      </CardContent>
    </Card>
  );
}

export default ErrorHandler;
