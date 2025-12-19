/**
 * Production-ready logging utility
 *
 * Features:
 * - Log levels controlled by environment variable LOG_LEVEL
 * - Structured logging with timestamp and source
 * - Conditional debug logging for development
 * - No-op in production for debug/verbose levels unless explicitly enabled
 *
 * Usage:
 * ```typescript
 * import { logger } from '../utils/logger';
 *
 * logger.info('message');           // Always shown
 * logger.warn('message');           // Always shown
 * logger.error('message');          // Always shown
 * logger.debug('message');          // Only in development or LOG_LEVEL=debug
 * logger.verbose('message');        // Only when LOG_LEVEL=verbose
 * logger.trace('message', data);    // Only when LOG_LEVEL=trace (includes data)
 * ```
 *
 * Environment variables:
 * - LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'trace' (default: 'info' in production, 'debug' in development)
 * - ENABLE_DEBUG_LOGGING: 'true' to force debug logging in production
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'trace';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
  trace: 5,
};

class Logger {
  private level: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';

    // Determine log level
    const envLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || undefined;
    const debugEnabled = process.env.ENABLE_DEBUG_LOGGING === 'true';

    if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
      this.level = envLevel;
    } else if (this.isProduction) {
      this.level = debugEnabled ? 'debug' : 'info';
    } else {
      this.level = 'debug'; // Development default
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, source?: string): string {
    const timestamp = this.formatTimestamp();
    const src = source ? ` [${source}]` : '';
    return `${timestamp} [${level.toUpperCase()}]${src} ${message}`;
  }

  error(message: string, error?: Error | unknown, source?: string): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, source));
      if (error) {
        if (error instanceof Error) {
          console.error(`  Stack: ${error.stack || error.message}`);
        } else {
          console.error('  Details:', error);
        }
      }
    }
  }

  warn(message: string, source?: string): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, source));
    }
  }

  info(message: string, source?: string): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, source));
    }
  }

  debug(message: string, source?: string): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, source));
    }
  }

  verbose(message: string, source?: string): void {
    if (this.shouldLog('verbose')) {
      console.log(this.formatMessage('verbose', message, source));
    }
  }

  trace(message: string, data?: unknown, source?: string): void {
    if (this.shouldLog('trace')) {
      console.log(this.formatMessage('trace', message, source));
      if (data !== undefined) {
        console.log('  Data:', JSON.stringify(data, null, 2));
      }
    }
  }

  // Convenience method for agent logging
  agent(agentName: string, message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      const emoji = this.getAgentEmoji(agentName);
      console.log(this.formatMessage('debug', `${emoji} [${agentName}] ${message}`));
      if (data !== undefined && this.shouldLog('trace')) {
        console.log('  Data:', JSON.stringify(data, null, 2));
      }
    }
  }

  private getAgentEmoji(agentName: string): string {
    const emojiMap: Record<string, string> = {
      'project-manager': '📋',
      'data-scientist': '🔬',
      'data-engineer': '⚙️',
      'business': '💼',
      'template-research': '📚',
      'customer-support': '🎧',
    };
    return emojiMap[agentName.toLowerCase()] || '🤖';
  }

  // Get current log level
  getLevel(): LogLevel {
    return this.level;
  }

  // Check if in production
  getIsProduction(): boolean {
    return this.isProduction;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for convenience - keeps API similar to console
export default logger;
