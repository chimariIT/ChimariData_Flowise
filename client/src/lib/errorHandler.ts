/**
 * Comprehensive Error Handling System
 * Provides user-friendly error messages and consistent error handling across the application
 */

export interface AppError {
  code: string;
  message: string;
  details?: string;
  userMessage: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  suggestedActions: string[];
}

export class ErrorHandler {
  private static errorMap: Record<string, Partial<AppError>> = {
    // Authentication Errors
    'AUTH_INVALID_CREDENTIALS': {
      userMessage: 'Invalid email or password. Please check your credentials and try again.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Verify your email address is correct',
        'Check if Caps Lock is on',
        'Try resetting your password if you forgot it'
      ]
    },
    'AUTH_USER_NOT_FOUND': {
      userMessage: 'No account found with this email address.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Check if you spelled your email correctly',
        'Try signing up for a new account',
        'Use a different sign-in method (Google, Microsoft, Apple)'
      ]
    },
    'AUTH_SESSION_EXPIRED': {
      userMessage: 'Your session has expired. Please sign in again.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Sign in again to continue',
        'Your data and progress have been saved'
      ]
    },
    'AUTH_UNAUTHORIZED': {
      userMessage: 'You need to sign in to access this feature.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Sign in to your account',
        'Create a new account if you don\'t have one'
      ]
    },

    // File Upload Errors
    'UPLOAD_FILE_TOO_LARGE': {
      userMessage: 'The file you selected is too large.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Try a smaller file (under 100MB for paid plans, 10MB for free trial)',
        'Compress your data or split it into multiple files',
        'Contact support if you need to upload larger files'
      ]
    },
    'UPLOAD_INVALID_FORMAT': {
      userMessage: 'This file format is not supported.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Use CSV, Excel (.xlsx, .xls), or JSON format',
        'Convert your file to a supported format',
        'Check our documentation for supported file types'
      ]
    },
    'UPLOAD_CORRUPTED_FILE': {
      userMessage: 'The file appears to be corrupted or damaged.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Try re-saving the file from the original source',
        'Check if the file opens correctly in other applications',
        'Upload a different version of the file'
      ]
    },
    'UPLOAD_NETWORK_ERROR': {
      userMessage: 'Upload failed due to a network issue.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Check your internet connection',
        'Try uploading again',
        'Try a smaller file if the issue persists'
      ]
    },

    // Analysis Errors
    'ANALYSIS_INSUFFICIENT_DATA': {
      userMessage: 'Not enough data to perform the requested analysis.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Upload a file with more data rows',
        'Try a simpler analysis type',
        'Combine multiple datasets if possible'
      ]
    },
    'ANALYSIS_INVALID_QUESTIONS': {
      userMessage: 'The analysis questions need to be more specific.',
      severity: 'low',
      recoverable: true,
      suggestedActions: [
        'Provide more detailed questions about what you want to learn',
        'Use our suggested question templates',
        'Focus on specific metrics or patterns you\'re interested in'
      ]
    },
    'ANALYSIS_PROCESSING_FAILED': {
      userMessage: 'Analysis processing encountered an error.',
      severity: 'high',
      recoverable: true,
      suggestedActions: [
        'Try running the analysis again',
        'Check if your data has any formatting issues',
        'Contact support if the problem continues'
      ]
    },
    'ANALYSIS_TIMEOUT': {
      userMessage: 'Analysis is taking longer than expected.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Large datasets may take more time - please wait',
        'Try with a smaller data sample first',
        'Consider upgrading for faster processing'
      ]
    },

    // Payment Errors
    'PAYMENT_CARD_DECLINED': {
      userMessage: 'Your payment card was declined.',
      severity: 'high',
      recoverable: true,
      suggestedActions: [
        'Check with your bank about the transaction',
        'Verify your card details are correct',
        'Try a different payment method'
      ]
    },
    'PAYMENT_INSUFFICIENT_FUNDS': {
      userMessage: 'Insufficient funds available for this transaction.',
      severity: 'high',
      recoverable: true,
      suggestedActions: [
        'Check your account balance',
        'Try a different payment method',
        'Contact your bank if needed'
      ]
    },
    'PAYMENT_PROCESSING_ERROR': {
      userMessage: 'Payment processing failed. Please try again.',
      severity: 'high',
      recoverable: true,
      suggestedActions: [
        'Wait a moment and try again',
        'Check your internet connection',
        'Contact support if the issue persists'
      ]
    },

    // Data Security Errors
    'SECURITY_PII_DETECTED': {
      userMessage: 'Personal information detected in your data.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Review the detected sensitive information',
        'Choose to anonymize the data before analysis',
        'Remove sensitive columns if not needed for analysis'
      ]
    },
    'SECURITY_MALWARE_DETECTED': {
      userMessage: 'Security scan detected potential threats in the uploaded file.',
      severity: 'critical',
      recoverable: false,
      suggestedActions: [
        'Do not open this file on your computer',
        'Scan the file with your antivirus software',
        'Contact support if you believe this is a false positive'
      ]
    },
    'SECURITY_FILE_REJECTED': {
      userMessage: 'File rejected due to security policy.',
      severity: 'high',
      recoverable: true,
      suggestedActions: [
        'Ensure the file is from a trusted source',
        'Try a different file format',
        'Contact support for assistance'
      ]
    },

    // Service Errors
    'SERVICE_UNAVAILABLE': {
      userMessage: 'Service is temporarily unavailable.',
      severity: 'high',
      recoverable: true,
      suggestedActions: [
        'Please try again in a few minutes',
        'Check our status page for updates',
        'Contact support if the issue continues'
      ]
    },
    'SERVICE_MAINTENANCE': {
      userMessage: 'Service is under maintenance.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Maintenance should complete shortly',
        'Try again in 15-30 minutes',
        'Follow our status updates for completion time'
      ]
    },
    'RATE_LIMIT_EXCEEDED': {
      userMessage: 'Too many requests. Please slow down.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Wait a moment before trying again',
        'Consider upgrading for higher limits',
        'Spread out your requests over time'
      ]
    },

    // Generic Errors
    'NETWORK_ERROR': {
      userMessage: 'Network connection issue detected.',
      severity: 'medium',
      recoverable: true,
      suggestedActions: [
        'Check your internet connection',
        'Try refreshing the page',
        'Wait a moment and try again'
      ]
    },
    'UNKNOWN_ERROR': {
      userMessage: 'An unexpected error occurred.',
      severity: 'high',
      recoverable: true,
      suggestedActions: [
        'Try refreshing the page',
        'Check if the issue persists',
        'Contact support with details about what you were doing'
      ]
    }
  };

  static handleError(error: Error | string, context?: string): AppError {
    let errorCode = 'UNKNOWN_ERROR';
    let originalMessage = '';

    if (typeof error === 'string') {
      originalMessage = error;
      errorCode = this.detectErrorCode(error);
    } else {
      originalMessage = error.message;
      errorCode = this.detectErrorCode(error.message) || error.name || 'UNKNOWN_ERROR';
    }

    const errorTemplate = this.errorMap[errorCode] || this.errorMap['UNKNOWN_ERROR'];

    return {
      code: errorCode,
      message: originalMessage,
      details: context,
      userMessage: errorTemplate.userMessage!,
      severity: errorTemplate.severity!,
      recoverable: errorTemplate.recoverable!,
      suggestedActions: errorTemplate.suggestedActions!
    };
  }

  static detectErrorCode(message: string): string {
    const lowercaseMessage = message.toLowerCase();

    // Authentication patterns
    if (lowercaseMessage.includes('unauthorized') || lowercaseMessage.includes('401')) {
      return 'AUTH_UNAUTHORIZED';
    }
    if (lowercaseMessage.includes('invalid credentials') || lowercaseMessage.includes('login failed')) {
      return 'AUTH_INVALID_CREDENTIALS';
    }
    if (lowercaseMessage.includes('user not found') || lowercaseMessage.includes('no user')) {
      return 'AUTH_USER_NOT_FOUND';
    }
    if (lowercaseMessage.includes('session expired') || lowercaseMessage.includes('token expired')) {
      return 'AUTH_SESSION_EXPIRED';
    }

    // File upload patterns
    if (lowercaseMessage.includes('file too large') || lowercaseMessage.includes('size limit')) {
      return 'UPLOAD_FILE_TOO_LARGE';
    }
    if (lowercaseMessage.includes('invalid format') || lowercaseMessage.includes('unsupported format')) {
      return 'UPLOAD_INVALID_FORMAT';
    }
    if (lowercaseMessage.includes('corrupted') || lowercaseMessage.includes('damaged')) {
      return 'UPLOAD_CORRUPTED_FILE';
    }

    // Payment patterns
    if (lowercaseMessage.includes('card declined') || lowercaseMessage.includes('payment declined')) {
      return 'PAYMENT_CARD_DECLINED';
    }
    if (lowercaseMessage.includes('insufficient funds')) {
      return 'PAYMENT_INSUFFICIENT_FUNDS';
    }
    if (lowercaseMessage.includes('payment failed') || lowercaseMessage.includes('payment error')) {
      return 'PAYMENT_PROCESSING_ERROR';
    }

    // Security patterns
    if (lowercaseMessage.includes('pii detected') || lowercaseMessage.includes('personal information')) {
      return 'SECURITY_PII_DETECTED';
    }
    if (lowercaseMessage.includes('malware') || lowercaseMessage.includes('virus')) {
      return 'SECURITY_MALWARE_DETECTED';
    }

    // Service patterns
    if (lowercaseMessage.includes('service unavailable') || lowercaseMessage.includes('503')) {
      return 'SERVICE_UNAVAILABLE';
    }
    if (lowercaseMessage.includes('maintenance')) {
      return 'SERVICE_MAINTENANCE';
    }
    if (lowercaseMessage.includes('rate limit') || lowercaseMessage.includes('too many requests')) {
      return 'RATE_LIMIT_EXCEEDED';
    }

    // Network patterns
    if (lowercaseMessage.includes('network') || lowercaseMessage.includes('connection')) {
      return 'NETWORK_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  static formatErrorForUser(appError: AppError): {
    title: string;
    description: string;
    actions: string[];
    variant: 'default' | 'destructive' | 'warning';
  } {
    const variant = appError.severity === 'critical' ? 'destructive' 
                   : appError.severity === 'high' ? 'destructive'
                   : appError.severity === 'medium' ? 'warning'
                   : 'default';

    return {
      title: this.getErrorTitle(appError.code),
      description: appError.userMessage,
      actions: appError.suggestedActions,
      variant
    };
  }

  private static getErrorTitle(errorCode: string): string {
    const titles: Record<string, string> = {
      'AUTH_INVALID_CREDENTIALS': 'Sign In Failed',
      'AUTH_USER_NOT_FOUND': 'Account Not Found',
      'AUTH_SESSION_EXPIRED': 'Session Expired',
      'AUTH_UNAUTHORIZED': 'Sign In Required',
      'UPLOAD_FILE_TOO_LARGE': 'File Too Large',
      'UPLOAD_INVALID_FORMAT': 'Unsupported File Format',
      'UPLOAD_CORRUPTED_FILE': 'File Error',
      'UPLOAD_NETWORK_ERROR': 'Upload Failed',
      'ANALYSIS_INSUFFICIENT_DATA': 'Not Enough Data',
      'ANALYSIS_INVALID_QUESTIONS': 'Questions Need Refinement',
      'ANALYSIS_PROCESSING_FAILED': 'Analysis Failed',
      'ANALYSIS_TIMEOUT': 'Processing...',
      'PAYMENT_CARD_DECLINED': 'Payment Declined',
      'PAYMENT_INSUFFICIENT_FUNDS': 'Payment Failed',
      'PAYMENT_PROCESSING_ERROR': 'Payment Error',
      'SECURITY_PII_DETECTED': 'Sensitive Data Detected',
      'SECURITY_MALWARE_DETECTED': 'Security Alert',
      'SECURITY_FILE_REJECTED': 'File Rejected',
      'SERVICE_UNAVAILABLE': 'Service Unavailable',
      'SERVICE_MAINTENANCE': 'Maintenance Mode',
      'RATE_LIMIT_EXCEEDED': 'Too Many Requests',
      'NETWORK_ERROR': 'Connection Issue',
      'UNKNOWN_ERROR': 'Something Went Wrong'
    };

    return titles[errorCode] || 'Error';
  }
}

export default ErrorHandler;