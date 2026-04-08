/**
 * Error Handling Utilities
 */

/**
 * Base service error class
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ServiceError {
  constructor(message: string, public details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends ServiceError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ServiceError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Wrap async function in error handler
 */
export function asyncHandler<T>(
  fn: (...args: any[]) => Promise<T>
): (...args: any[]) => Promise<T> {
  return async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('An unexpected error occurred');
    }
  };
}
