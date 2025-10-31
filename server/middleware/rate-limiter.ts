// server/middleware/rate-limiter.ts
import rateLimit, { RateLimitRequestHandler, ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import { getConfig } from '../config/environment';

const config = getConfig();

const INTERNAL_REQUEST_HEADER = 'x-chimari-internal';
const INTERNAL_REQUEST_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
const INTERNAL_USER_AGENT_MARKERS = ['ChimariService', 'ChimariInternal', 'Playwright'];
const INTERNAL_PATH_PREFIXES = [
  '/api/system/health',
  '/api/system/status',
  '/api/health',
  '/api/realtime/diagnostics',
  '/api/performance/heartbeat'
];

const shouldBypassRateLimit = (req: Request): boolean => {
  const headerRaw = (req.get?.(INTERNAL_REQUEST_HEADER) || '').toString();
  const headerValue = headerRaw.toLowerCase().trim();

  if (INTERNAL_REQUEST_TOKEN && headerValue === INTERNAL_REQUEST_TOKEN.toLowerCase()) {
    return true;
  }

  if (!INTERNAL_REQUEST_TOKEN && config.NODE_ENV === 'development') {
    if (headerValue === 'true' || headerValue === '1' || headerValue === 'internal') {
      return true;
    }
  }

  const userAgent = (req.get?.('user-agent') || '').toString();
  if (INTERNAL_USER_AGENT_MARKERS.some(marker => userAgent.includes(marker))) {
    return true;
  }

  const path = req.path || req.originalUrl || '';
  if (typeof path === 'string' && INTERNAL_PATH_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return true;
  }

  return false;
};

/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse with configurable rate limits
 * Different limits for different endpoint types:
 * - Authentication endpoints (stricter)
 * - API endpoints (moderate)
 * - Public endpoints (relaxed)
 */

/**
 * Standard rate limiter for API endpoints
 * Default: 100 requests per 15 minutes per IP
 */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: config.RATE_LIMIT_MAX_REQUESTS || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] API rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * Protects against brute force attacks
 * Default: 5 attempts per 15 minutes per IP
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful login attempts
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Your account has been temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Strict rate limiter for registration endpoints
 * Prevents automated account creation
 * Default: 3 registrations per hour per IP
 */
export const registrationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations
  message: {
    error: 'Too many registration attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Registration rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many registration attempts',
      message: 'Too many accounts created from this IP address. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Moderate rate limiter for data upload endpoints
 * Prevents upload abuse
 * Default: 20 uploads per hour per IP
 */
export const uploadLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Upload rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many uploads',
      message: 'You have exceeded the file upload limit. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Relaxed rate limiter for public endpoints
 * Default: 200 requests per 15 minutes per IP
 */
export const publicLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Public rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please slow down your requests.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Very strict rate limiter for password reset endpoints
 * Prevents password reset spam
 * Default: 3 attempts per hour per IP
 */
export const passwordResetLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Password reset rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many password reset attempts',
      message: 'Too many password reset requests from this IP. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Strict rate limiter for payment endpoints
 * Prevents payment abuse
 * Default: 10 requests per hour per IP
 */
export const paymentLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Too many payment requests, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Payment rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many payment requests',
      message: 'You have exceeded the payment request limit. Please contact support if this is an error.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Moderate rate limiter for AI/analysis endpoints
 * Prevents excessive AI usage
 * Default: 30 requests per hour per user
 */
export const aiAnalysisLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: {
    error: 'Too many analysis requests, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key by user ID if authenticated, otherwise by IP
  keyGenerator: (req: Request) => {
    const user = req.user as any;
    if (user?.id) {
      return `user:${user.id}`;
    }
    const ipKey = ipKeyGenerator(typeof req.ip === 'string' ? req.ip : '');
    return `ip:${ipKey}`;
  },
  skip: (req) => {
    if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
      return true;
    }
    return shouldBypassRateLimit(req as Request);
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] AI analysis rate limit exceeded for user/IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many analysis requests',
      message: 'You have exceeded your analysis quota. Please upgrade your plan or try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Create a custom rate limiter with specific settings
 */
export function createCustomLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message || 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    skip: (req) => {
      if (config.NODE_ENV === 'development' && !config.ENABLE_RATE_LIMITING) {
        return true;
      }
      return shouldBypassRateLimit(req as Request);
    },
    handler: (req: Request, res: Response) => {
      console.warn(`[RateLimit] Custom rate limit exceeded for: ${req.ip}`);
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: options.message || 'Too many requests, please try again later.',
        retryAfter: res.getHeader('Retry-After')
      });
    }
  });
}

/**
 * Log rate limit status
 */
export function logRateLimitStatus(): void {
  const status = config.ENABLE_RATE_LIMITING ? 'ENABLED' : 'DISABLED';
  const environment = config.NODE_ENV;

  console.log(`[RateLimit] Status: ${status} (Environment: ${environment})`);

  if (config.ENABLE_RATE_LIMITING) {
    console.log(`[RateLimit] Window: ${config.RATE_LIMIT_WINDOW_MS}ms`);
    console.log(`[RateLimit] Max requests: ${config.RATE_LIMIT_MAX_REQUESTS}`);
  } else {
    console.warn(`[RateLimit] ⚠️  Rate limiting is DISABLED. Enable for production!`);
  }
}
