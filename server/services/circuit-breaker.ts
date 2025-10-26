/**
 * Circuit Breaker Implementation for AI Service Calls
 * 
 * Prevents cascade failures during AI service downtime by implementing
 * the circuit breaker pattern with timeout handling and graceful degradation
 */

export interface CircuitBreakerConfig {
    failureThreshold: number;      // Number of failures before opening circuit
    recoveryTimeout: number;       // Time to wait before attempting recovery (ms)
    requestTimeout: number;        // Timeout for individual requests (ms)
    successThreshold: number;      // Consecutive successes needed to close circuit
}

export enum CircuitState {
    CLOSED = 'CLOSED',     // Normal operation
    OPEN = 'OPEN',         // Circuit broken, rejecting requests
    HALF_OPEN = 'HALF_OPEN' // Testing recovery
}

export interface CircuitBreakerStats {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    totalRequests: number;
    totalSuccesses: number;
    totalFailures: number;
    totalTimeouts: number;
    averageResponseTime: number;
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime: number = 0;
    private nextAttemptTime: number = 0;
    
    // Statistics
    private totalRequests: number = 0;
    private totalSuccesses: number = 0;
    private totalFailures: number = 0;
    private totalTimeouts: number = 0;
    private responseTimes: number[] = [];

    constructor(
        private name: string,
        private config: CircuitBreakerConfig
    ) {}

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        const startTime = Date.now();
        this.totalRequests++;

        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttemptTime) {
                throw new Error(`Circuit breaker ${this.name} is OPEN. Next attempt in ${this.nextAttemptTime - Date.now()}ms`);
            } else {
                // Transition to half-open for testing
                this.state = CircuitState.HALF_OPEN;
                this.successCount = 0;
                console.log(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
            }
        }

        try {
            // Execute with timeout
            const result = await this.executeWithTimeout(fn, this.config.requestTimeout);
            
            // Record success metrics
            const responseTime = Date.now() - startTime;
            this.recordSuccess(responseTime);
            
            return result;
        } catch (error) {
            // Record failure metrics
            const responseTime = Date.now() - startTime;
            this.recordFailure(error, responseTime);
            throw error;
        }
    }

    /**
     * Execute function with timeout protection
     */
    private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.totalTimeouts++;
                reject(new Error(`Request timeout after ${timeout}ms`));
            }, timeout);

            fn()
                .then((result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    /**
     * Record successful execution
     */
    private recordSuccess(responseTime: number): void {
        this.totalSuccesses++;
        this.failureCount = 0; // Reset failure count on success
        this.recordResponseTime(responseTime);

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.state = CircuitState.CLOSED;
                console.log(`Circuit breaker ${this.name} recovered - transitioning to CLOSED`);
            }
        }
    }

    /**
     * Record failed execution
     */
    private recordFailure(error: any, responseTime: number): void {
        this.totalFailures++;
        this.failureCount++;
        this.lastFailureTime = Date.now();
        this.recordResponseTime(responseTime);

        console.warn(`Circuit breaker ${this.name} recorded failure:`, error.message);

        // Check if we should open the circuit
        if (this.failureCount >= this.config.failureThreshold && this.state === CircuitState.CLOSED) {
            this.openCircuit();
        } else if (this.state === CircuitState.HALF_OPEN) {
            // Any failure in half-open state reopens the circuit
            this.openCircuit();
        }
    }

    /**
     * Open the circuit breaker
     */
    private openCircuit(): void {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
        console.error(`Circuit breaker ${this.name} OPENED due to ${this.failureCount} failures. Recovery attempt in ${this.config.recoveryTimeout}ms`);
    }

    /**
     * Record response time for metrics
     */
    private recordResponseTime(responseTime: number): void {
        this.responseTimes.push(responseTime);
        
        // Keep only last 100 response times for memory efficiency
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift();
        }
    }

    /**
     * Get current circuit breaker statistics
     */
    getStats(): CircuitBreakerStats {
        const averageResponseTime = this.responseTimes.length > 0
            ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
            : 0;

        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            totalRequests: this.totalRequests,
            totalSuccesses: this.totalSuccesses,
            totalFailures: this.totalFailures,
            totalTimeouts: this.totalTimeouts,
            averageResponseTime: Math.round(averageResponseTime)
        };
    }

    /**
     * Get health status
     */
    isHealthy(): boolean {
        return this.state === CircuitState.CLOSED && this.failureCount === 0;
    }

    /**
     * Reset circuit breaker to initial state
     */
    reset(): void {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.nextAttemptTime = 0;
        console.log(`Circuit breaker ${this.name} has been reset`);
    }

    /**
     * Force open the circuit (for testing or maintenance)
     */
    forceOpen(): void {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
        console.log(`Circuit breaker ${this.name} has been forced OPEN`);
    }

    /**
     * Force close the circuit (for testing)
     */
    forceClose(): void {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        console.log(`Circuit breaker ${this.name} has been forced CLOSED`);
    }
}

/**
 * Circuit Breaker Registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
    private static instance: CircuitBreakerRegistry;
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();

    private constructor() {}

    static getInstance(): CircuitBreakerRegistry {
        if (!CircuitBreakerRegistry.instance) {
            CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
        }
        return CircuitBreakerRegistry.instance;
    }

    /**
     * Get or create a circuit breaker
     */
    getCircuitBreaker(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
        if (!this.circuitBreakers.has(name)) {
            const defaultConfig: CircuitBreakerConfig = {
                failureThreshold: 5,      // Open after 5 failures
                recoveryTimeout: 60000,   // Wait 1 minute before retry
                requestTimeout: 30000,    // 30 second request timeout
                successThreshold: 3       // Need 3 successes to close
            };
            
            const finalConfig = { ...defaultConfig, ...config };
            this.circuitBreakers.set(name, new CircuitBreaker(name, finalConfig));
        }
        
        return this.circuitBreakers.get(name)!;
    }

    /**
     * Get all circuit breakers stats
     */
    getAllStats(): Record<string, CircuitBreakerStats> {
        const stats: Record<string, CircuitBreakerStats> = {};
        for (const [name, breaker] of this.circuitBreakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }

    /**
     * Get health status of all circuit breakers
     */
    getOverallHealth(): { healthy: boolean; details: Record<string, boolean> } {
        const details: Record<string, boolean> = {};
        let overallHealthy = true;

        for (const [name, breaker] of this.circuitBreakers) {
            const isHealthy = breaker.isHealthy();
            details[name] = isHealthy;
            if (!isHealthy) {
                overallHealthy = false;
            }
        }

        return { healthy: overallHealthy, details };
    }

    /**
     * Reset all circuit breakers
     */
    resetAll(): void {
        for (const breaker of this.circuitBreakers.values()) {
            breaker.reset();
        }
        console.log('All circuit breakers have been reset');
    }
}