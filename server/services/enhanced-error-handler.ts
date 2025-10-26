/**
 * Enhanced Error Handling Service
 * 
 * Comprehensive error handling with:
 * - Graceful degradation strategies
 * - Circuit breaker patterns
 * - Intelligent retry mechanisms
 * - Error categorization and tracking
 * - Fallback mechanisms
 * - Error metrics and alerting
 * - Recovery strategies
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  DATABASE = 'database',
  AI_SERVICE = 'ai_service',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  EXTERNAL_API = 'external_api'
}

export interface ErrorContext {
  operation: string;
  userId?: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  requestId?: string;
  clientInfo?: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
  additionalData?: Record<string, any>;
}

export interface ErrorRecord {
  id: string;
  timestamp: Date;
  error: Error;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  stackTrace?: string;
  resolution?: string;
  retryCount: number;
  recovered: boolean;
  recoveryStrategy?: string;
  metadata: Record<string, any>;
}

export interface CircuitBreakerState {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  failureThreshold: number;
  timeout: number;
  lastFailureTime: Date | null;
  successCount: number;
  nextAttemptTime: Date | null;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitterFactor: number;
  retryCondition?: (error: Error) => boolean;
}

export interface FallbackStrategy {
  name: string;
  priority: number;
  condition: (error: Error, context: ErrorContext) => boolean;
  execute: (context: ErrorContext) => Promise<any>;
  timeout?: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private metrics: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageResponseTime: number;
    lastCall: Date | null;
  };

  constructor(
    private name: string,
    private config: {
      failureThreshold: number;
      timeout: number;
      monitoringPeriod?: number;
    }
  ) {
    this.state = {
      name,
      state: 'CLOSED',
      failureCount: 0,
      failureThreshold: config.failureThreshold,
      timeout: config.timeout,
      lastFailureTime: null,
      successCount: 0,
      nextAttemptTime: null
    };

    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      lastCall: null
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.metrics.totalCalls++;
    this.metrics.lastCall = new Date();

    // Check if circuit is open
    if (this.state.state === 'OPEN') {
      if (this.state.nextAttemptTime && new Date() < this.state.nextAttemptTime) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}. Next attempt at ${this.state.nextAttemptTime}`);
      } else {
        // Move to half-open state
        this.state.state = 'HALF_OPEN';
        this.state.successCount = 0;
      }
    }

    const startTime = Date.now();

    try {
      const result = await operation();
      
      // Record success
      const duration = Date.now() - startTime;
      this.recordSuccess(duration);
      
      return result;
    } catch (error) {
      // Record failure
      this.recordFailure();
      throw error;
    }
  }

  private recordSuccess(duration: number): void {
    this.metrics.successfulCalls++;
    this.updateAverageResponseTime(duration);

    if (this.state.state === 'HALF_OPEN') {
      this.state.successCount++;
      // Reset to closed after successful calls in half-open state
      if (this.state.successCount >= 3) {
        this.state.state = 'CLOSED';
        this.state.failureCount = 0;
        this.state.lastFailureTime = null;
        this.state.nextAttemptTime = null;
      }
    } else if (this.state.state === 'CLOSED') {
      // Reset failure count on success
      this.state.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.metrics.failedCalls++;
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    if (this.state.state === 'HALF_OPEN') {
      // Move back to open if failure in half-open state
      this.state.state = 'OPEN';
      this.state.nextAttemptTime = new Date(Date.now() + this.state.timeout);
    } else if (this.state.failureCount >= this.state.failureThreshold) {
      // Open circuit if threshold exceeded
      this.state.state = 'OPEN';
      this.state.nextAttemptTime = new Date(Date.now() + this.state.timeout);
    }
  }

  private updateAverageResponseTime(duration: number): void {
    const totalCalls = this.metrics.successfulCalls;
    this.metrics.averageResponseTime = 
      ((this.metrics.averageResponseTime * (totalCalls - 1)) + duration) / totalCalls;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  getMetrics() {
    return { ...this.metrics };
  }

  reset(): void {
    this.state.state = 'CLOSED';
    this.state.failureCount = 0;
    this.state.lastFailureTime = null;
    this.state.nextAttemptTime = null;
    this.state.successCount = 0;
  }
}

export class EnhancedErrorHandler {
  private errorHistory: Map<string, ErrorRecord[]> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private fallbackStrategies: Map<string, FallbackStrategy[]> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private lastCleanup: Date = new Date();

  constructor(private config: {
    maxErrorHistory?: number;
    cleanupInterval?: number;
    defaultRetryConfig?: RetryConfig;
  } = {}) {
    this.config = {
      maxErrorHistory: 1000,
      cleanupInterval: 3600000, // 1 hour
      defaultRetryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        exponentialBase: 2,
        jitterFactor: 0.1
      },
      ...config
    };

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Create or get circuit breaker for operation
   */
  getCircuitBreaker(
    name: string, 
    config: { failureThreshold: number; timeout: number; }
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(name, config));
    }
    return this.circuitBreakers.get(name)!;
  }

  /**
   * Register fallback strategy for operation
   */
  registerFallback(operationName: string, strategy: FallbackStrategy): void {
    if (!this.fallbackStrategies.has(operationName)) {
      this.fallbackStrategies.set(operationName, []);
    }
    
    const strategies = this.fallbackStrategies.get(operationName)!;
    strategies.push(strategy);
    
    // Sort by priority (higher priority first)
    strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute operation with comprehensive error handling
   */
  async executeWithHandling<T>(
    operationName: string,
    operation: () => Promise<T>,
    context: ErrorContext,
    options: {
      useCircuitBreaker?: boolean;
      circuitBreakerConfig?: { failureThreshold: number; timeout: number; };
      retryConfig?: Partial<RetryConfig>;
      enableFallback?: boolean;
    } = {}
  ): Promise<T> {
    const {
      useCircuitBreaker = true,
      circuitBreakerConfig = { failureThreshold: 5, timeout: 60000 },
      retryConfig = {},
      enableFallback = true
    } = options;

    const finalRetryConfig: RetryConfig = {
      ...this.config.defaultRetryConfig!,
      ...retryConfig
    };

    let lastError: Error | null = null;

    // Create wrapper operation with circuit breaker if enabled
    const wrappedOperation = useCircuitBreaker
      ? () => {
          const circuitBreaker = this.getCircuitBreaker(operationName, circuitBreakerConfig);
          return circuitBreaker.execute(operation);
        }
      : operation;

    // Retry logic
    for (let attempt = 1; attempt <= finalRetryConfig.maxAttempts; attempt++) {
      try {
        const result = await wrappedOperation();
        
        // Record successful execution
        if (attempt > 1) {
          console.log(`Operation "${operationName}" succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Record error
        await this.recordError(error as Error, operationName, context, attempt);
        
        // Check if we should retry
        if (attempt < finalRetryConfig.maxAttempts && this.shouldRetry(error as Error, finalRetryConfig)) {
          const delay = this.calculateRetryDelay(attempt, finalRetryConfig);
          console.warn(`Operation "${operationName}" failed on attempt ${attempt}, retrying in ${delay}ms`);
          await this.sleep(delay);
          continue;
        }
        
        break;
      }
    }

    // If all retries failed, try fallback strategies
    if (enableFallback && lastError) {
      const fallbackResult = await this.executeFallback(operationName, lastError, context);
      if (fallbackResult !== null) {
        return fallbackResult;
      }
    }

    // If everything failed, throw the last error
    throw lastError;
  }

  /**
   * Record error with categorization and metrics
   */
  private async recordError(
    error: Error,
    operation: string,
    context: ErrorContext,
    retryCount: number
  ): Promise<void> {
    const errorId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const errorRecord: ErrorRecord = {
      id: errorId,
      timestamp: new Date(),
      error,
      category: this.categorizeError(error),
      severity: this.determineSeverity(error),
      context,
      stackTrace: error.stack,
      retryCount,
      recovered: false,
      metadata: {
        operation,
        errorMessage: error.message,
        errorName: error.name
      }
    };

    // Store error record
    if (!this.errorHistory.has(operation)) {
      this.errorHistory.set(operation, []);
    }
    
    const history = this.errorHistory.get(operation)!;
    history.push(errorRecord);
    
    // Limit history size
    if (history.length > this.config.maxErrorHistory!) {
      history.shift();
    }

    // Update error counts
    const countKey = `${operation}_${errorRecord.category}`;
    this.errorCounts.set(countKey, (this.errorCounts.get(countKey) || 0) + 1);

    // Log error appropriately based on severity
    this.logError(errorRecord);
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
      return ErrorCategory.NETWORK;
    }
    
    if (message.includes('database') || message.includes('sql') || message.includes('query')) {
      return ErrorCategory.DATABASE;
    }
    
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('authentication')) {
      return ErrorCategory.AUTHENTICATION;
    }
    
    if (message.includes('validation') || message.includes('invalid') || name.includes('validation')) {
      return ErrorCategory.VALIDATION;
    }
    
    if (message.includes('ai') || message.includes('openai') || message.includes('gemini') || message.includes('anthropic')) {
      return ErrorCategory.AI_SERVICE;
    }
    
    if (message.includes('api') || message.includes('http') || message.includes('request')) {
      return ErrorCategory.EXTERNAL_API;
    }

    return ErrorCategory.SYSTEM;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal') || message.includes('crash')) {
      return ErrorSeverity.CRITICAL;
    }
    
    if (message.includes('database') || message.includes('authentication') || message.includes('unauthorized')) {
      return ErrorSeverity.HIGH;
    }
    
    if (message.includes('validation') || message.includes('timeout') || message.includes('network')) {
      return ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.LOW;
  }

  /**
   * Check if error should trigger retry
   */
  private shouldRetry(error: Error, config: RetryConfig): boolean {
    if (config.retryCondition) {
      return config.retryCondition(error);
    }

    // Default retry conditions
    const message = error.message.toLowerCase();
    
    // Don't retry validation or authentication errors
    if (message.includes('validation') || message.includes('unauthorized') || message.includes('forbidden')) {
      return false;
    }
    
    // Retry network, timeout, and temporary errors
    return message.includes('timeout') || 
           message.includes('network') || 
           message.includes('temporary') || 
           message.includes('503') || 
           message.includes('502') || 
           message.includes('429'); // Rate limited
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelay * Math.pow(config.exponentialBase, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * config.jitterFactor * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Execute fallback strategies
   */
  private async executeFallback(
    operationName: string,
    error: Error,
    context: ErrorContext
  ): Promise<any> {
    const strategies = this.fallbackStrategies.get(operationName);
    if (!strategies) {
      return null;
    }

    for (const strategy of strategies) {
      if (strategy.condition(error, context)) {
        try {
          console.log(`Executing fallback strategy "${strategy.name}" for operation "${operationName}"`);
          
          const result = strategy.timeout 
            ? await Promise.race([
                strategy.execute(context),
                this.timeoutPromise(strategy.timeout)
              ])
            : await strategy.execute(context);
          
          // Record successful fallback
          console.log(`Fallback strategy "${strategy.name}" succeeded`);
          return result;
        } catch (fallbackError) {
          console.warn(`Fallback strategy "${strategy.name}" failed:`, fallbackError);
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Create timeout promise
   */
  private timeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Fallback operation timed out after ${timeout}ms`)), timeout);
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log error based on severity
   */
  private logError(errorRecord: ErrorRecord): void {
    const logMessage = `[${errorRecord.severity.toUpperCase()}] ${errorRecord.category}: ${errorRecord.error.message}`;
    
    switch (errorRecord.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR:', logMessage, {
          operation: errorRecord.context.operation,
          errorId: errorRecord.id,
          stack: errorRecord.stackTrace
        });
        break;
      case ErrorSeverity.HIGH:
        console.error('🔴 HIGH ERROR:', logMessage, {
          operation: errorRecord.context.operation,
          errorId: errorRecord.id
        });
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('🟡 MEDIUM ERROR:', logMessage, {
          operation: errorRecord.context.operation,
          errorId: errorRecord.id
        });
        break;
      case ErrorSeverity.LOW:
        console.log('🔵 LOW ERROR:', logMessage, {
          operation: errorRecord.context.operation,
          errorId: errorRecord.id
        });
        break;
    }
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(timeWindow?: number): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    topOperations: Array<{ operation: string; count: number; }>;
    recentErrors: ErrorRecord[];
  } {
    const now = new Date();
    const windowStart = timeWindow ? new Date(now.getTime() - timeWindow) : new Date(0);
    
    let totalErrors = 0;
    const errorsByCategory: Record<ErrorCategory, number> = {
      [ErrorCategory.NETWORK]: 0,
      [ErrorCategory.DATABASE]: 0,
      [ErrorCategory.AI_SERVICE]: 0,
      [ErrorCategory.AUTHENTICATION]: 0,
      [ErrorCategory.VALIDATION]: 0,
      [ErrorCategory.BUSINESS_LOGIC]: 0,
      [ErrorCategory.SYSTEM]: 0,
      [ErrorCategory.EXTERNAL_API]: 0
    };
    
    const errorsBySeverity: Record<ErrorSeverity, number> = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0
    };
    
    const operationCounts: Map<string, number> = new Map();
    const recentErrors: ErrorRecord[] = [];

    // Aggregate statistics from all error histories
    for (const [operation, errors] of this.errorHistory.entries()) {
      const filteredErrors = errors.filter(error => error.timestamp >= windowStart);
      
      operationCounts.set(operation, filteredErrors.length);
      totalErrors += filteredErrors.length;
      
      for (const error of filteredErrors) {
        errorsByCategory[error.category]++;
        errorsBySeverity[error.severity]++;
        recentErrors.push(error);
      }
    }

    // Sort recent errors by timestamp (most recent first)
    recentErrors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Get top operations by error count
    const topOperations = Array.from(operationCounts.entries())
      .map(([operation, count]) => ({ operation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalErrors,
      errorsByCategory,
      errorsBySeverity,
      topOperations,
      recentErrors: recentErrors.slice(0, 50)
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): Array<{
    name: string;
    state: CircuitBreakerState;
    metrics: any;
  }> {
    return Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => ({
      name,
      state: breaker.getState(),
      metrics: breaker.getMetrics()
    }));
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(name: string): boolean {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      breaker.reset();
      return true;
    }
    return false;
  }

  /**
   * Start periodic cleanup of old error records
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupOldErrors();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up old error records
   */
  private cleanupOldErrors(): void {
    const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
    
    for (const [operation, errors] of this.errorHistory.entries()) {
      const filteredErrors = errors.filter(error => error.timestamp > cutoffTime);
      if (filteredErrors.length !== errors.length) {
        this.errorHistory.set(operation, filteredErrors);
      }
    }
    
    console.log('Error history cleanup completed');
  }

  /**
   * Shutdown error handler
   */
  shutdown(): void {
    // Clear all error history
    this.errorHistory.clear();
    this.circuitBreakers.clear();
    this.fallbackStrategies.clear();
    this.errorCounts.clear();
    
    console.log('Enhanced error handler shutdown complete');
  }
}

// Create and export singleton instance
export const errorHandler = new EnhancedErrorHandler({
  maxErrorHistory: 1000,
  cleanupInterval: 3600000, // 1 hour
  defaultRetryConfig: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    exponentialBase: 2,
    jitterFactor: 0.1
  }
});

export default errorHandler;