// server/config/environment.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Environment Configuration Loader
 *
 * Loads environment-specific configuration from .env files
 * Supports: development, staging, production
 */

export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface EnvironmentConfig {
  // Environment
  NODE_ENV: Environment;

  // Server
  PORT: number;
  HOST: string;

  // Database
  DATABASE_URL: string;
  DATABASE_POOL_MIN?: number;
  DATABASE_POOL_MAX?: number;
  DATABASE_TIMEOUT: number;

  // Redis
  REDIS_ENABLED: boolean;
  REDIS_URL?: string;

  // AI Providers
  GOOGLE_AI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;

  // Payment Processing
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLIC_KEY?: string;

  // Email
  SENDGRID_API_KEY?: string;
  FROM_EMAIL?: string;

  // OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  // Spark
  SPARK_ENABLED: boolean;
  SPARK_MASTER_URL?: string;
  SPARK_APP_NAME?: string;

  // Security
  SESSION_SECRET: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  HELMET_ENABLED?: boolean;
  STRICT_TRANSPORT_SECURITY?: boolean;

  // Feature Flags
  ENABLE_MOCK_MODE: boolean;
  ENABLE_DEBUG_LOGGING: boolean;
  ENABLE_RATE_LIMITING: boolean;
  ENABLE_WEBHOOK_SIGNATURE_VERIFICATION: boolean;
  ENABLE_AUTOMATED_BACKUPS?: boolean;

  // File Upload
  MAX_FILE_SIZE_MB: number;
  UPLOAD_DIR: string;

  // Service Timeouts
  API_TIMEOUT: number;
  PYTHON_SCRIPT_TIMEOUT: number;

  // Monitoring
  ENABLE_QUERY_LOGGING: boolean;
  ENABLE_PERFORMANCE_METRICS: boolean;
  SENTRY_DSN?: string;
  DATADOG_API_KEY?: string;

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS?: number;
  RATE_LIMIT_MAX_REQUESTS?: number;

  // Cloud Storage
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_S3_BUCKET?: string;
}

/**
 * Load environment configuration
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as Environment;

  // Load environment-specific .env file
  const envFile = `.env.${nodeEnv}`;
  const envPath = path.resolve(process.cwd(), envFile);

  console.log(`[Environment] Loading configuration for: ${nodeEnv}`);
  console.log(`[Environment] Loading from: ${envPath}`);

  // Load environment file
  const result = dotenv.config({ path: envPath });

  if (result.error && nodeEnv !== 'test') {
    console.warn(`[Environment] Warning: Could not load ${envFile}, falling back to process.env`);
  }

  // Build configuration object
  const config: EnvironmentConfig = {
    // Environment
    NODE_ENV: nodeEnv,

    // Server
    PORT: parseInt(process.env.PORT || '5000', 10),
    HOST: process.env.HOST || 'localhost',

    // Database
    DATABASE_URL: process.env.DATABASE_URL || '',
    DATABASE_POOL_MIN: process.env.DATABASE_POOL_MIN ? parseInt(process.env.DATABASE_POOL_MIN, 10) : undefined,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX, 10) : undefined,
    DATABASE_TIMEOUT: parseInt(process.env.DATABASE_TIMEOUT || '10000', 10),

    // Redis
    REDIS_ENABLED: process.env.REDIS_ENABLED === 'true' || nodeEnv === 'production',
    REDIS_URL: process.env.REDIS_URL,

    // AI Providers
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,

    // Payment Processing
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLIC_KEY: process.env.VITE_STRIPE_PUBLIC_KEY,

    // Email
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,

    // OAuth
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,

    // Spark
    SPARK_ENABLED: process.env.SPARK_ENABLED === 'true',
    SPARK_MASTER_URL: process.env.SPARK_MASTER_URL,
    SPARK_APP_NAME: process.env.SPARK_APP_NAME,

    // Security
    SESSION_SECRET: process.env.SESSION_SECRET || 'fallback_session_secret_not_secure',
    JWT_SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret_not_secure',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    HELMET_ENABLED: process.env.HELMET_ENABLED === 'true',
    STRICT_TRANSPORT_SECURITY: process.env.STRICT_TRANSPORT_SECURITY === 'true',

    // Feature Flags
    ENABLE_MOCK_MODE: process.env.ENABLE_MOCK_MODE === 'true',
    ENABLE_DEBUG_LOGGING: process.env.ENABLE_DEBUG_LOGGING === 'true',
    ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING === 'true' || nodeEnv === 'production',
    ENABLE_WEBHOOK_SIGNATURE_VERIFICATION: process.env.ENABLE_WEBHOOK_SIGNATURE_VERIFICATION === 'true' || nodeEnv === 'production',
    ENABLE_AUTOMATED_BACKUPS: process.env.ENABLE_AUTOMATED_BACKUPS === 'true',

    // File Upload
    MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10),
    UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',

    // Service Timeouts
    API_TIMEOUT: parseInt(process.env.API_TIMEOUT || '30000', 10),
    PYTHON_SCRIPT_TIMEOUT: parseInt(process.env.PYTHON_SCRIPT_TIMEOUT || '300000', 10),

    // Monitoring
    ENABLE_QUERY_LOGGING: process.env.ENABLE_QUERY_LOGGING === 'true',
    ENABLE_PERFORMANCE_METRICS: process.env.ENABLE_PERFORMANCE_METRICS === 'true',
    SENTRY_DSN: process.env.SENTRY_DSN,
    DATADOG_API_KEY: process.env.DATADOG_API_KEY,

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) : undefined,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) : undefined,

    // Cloud Storage
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET
  };

  // Validate critical configuration for production
  if (nodeEnv === 'production') {
    validateProductionConfig(config);
  }

  return config;
}

/**
 * Validate production configuration
 */
function validateProductionConfig(config: EnvironmentConfig): void {
  const errors: string[] = [];

  // Required in production
  if (!config.DATABASE_URL) {
    errors.push('DATABASE_URL is required in production');
  }

  if (!config.REDIS_URL) {
    errors.push('REDIS_URL is required in production');
  }

  if (!config.GOOGLE_AI_API_KEY && !config.OPENAI_API_KEY && !config.ANTHROPIC_API_KEY) {
    errors.push('At least one AI provider API key is required in production');
  }

  if (config.SESSION_SECRET === 'fallback_session_secret_not_secure') {
    errors.push('SESSION_SECRET must be set to a secure value in production');
  }

  if (config.JWT_SECRET === 'fallback_jwt_secret_not_secure') {
    errors.push('JWT_SECRET must be set to a secure value in production');
  }

  if (!config.SENDGRID_API_KEY) {
    errors.push('SENDGRID_API_KEY is required in production for email functionality');
  }

  // Security features must be enabled
  if (!config.ENABLE_RATE_LIMITING) {
    errors.push('ENABLE_RATE_LIMITING must be true in production');
  }

  if (!config.ENABLE_WEBHOOK_SIGNATURE_VERIFICATION) {
    errors.push('ENABLE_WEBHOOK_SIGNATURE_VERIFICATION must be true in production');
  }

  if (config.ENABLE_MOCK_MODE) {
    errors.push('ENABLE_MOCK_MODE must be false in production');
  }

  if (config.ENABLE_DEBUG_LOGGING) {
    console.warn('[Environment] Warning: Debug logging is enabled in production - this may expose sensitive data');
  }

  // Throw error if validation fails
  if (errors.length > 0) {
    console.error('[Environment] Production configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error(`Production configuration validation failed with ${errors.length} error(s)`);
  }

  console.log('[Environment] ✅ Production configuration validated successfully');
}

/**
 * Get current environment
 */
export function getEnvironment(): Environment {
  return (process.env.NODE_ENV || 'development') as Environment;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnvironment() === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnvironment() === 'development';
}

/**
 * Check if running in staging
 */
export function isStaging(): boolean {
  return getEnvironment() === 'staging';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return getEnvironment() === 'test';
}

/**
 * Get feature flag value
 */
export function isFeatureEnabled(feature: keyof EnvironmentConfig): boolean {
  const config = loadEnvironmentConfig();
  return Boolean(config[feature]);
}

// Export singleton instance
let configInstance: EnvironmentConfig | null = null;

export function getConfig(): EnvironmentConfig {
  if (!configInstance) {
    configInstance = loadEnvironmentConfig();
  }
  return configInstance;
}

// Export for testing
export function resetConfig(): void {
  configInstance = null;
}
