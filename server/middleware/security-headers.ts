import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

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

const shouldBypassRateLimit = (req: any): boolean => {
  const headerRaw = (req.get?.(INTERNAL_REQUEST_HEADER) || '').toString();
  const headerValue = headerRaw.toLowerCase().trim();

  if (INTERNAL_REQUEST_TOKEN && headerValue === INTERNAL_REQUEST_TOKEN.toLowerCase()) {
    return true;
  }

  if (!INTERNAL_REQUEST_TOKEN && process.env.NODE_ENV === 'development') {
    // Allow opt-in bypass without shared secret while developing
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
 * Security headers middleware using Helmet
 * Provides comprehensive security headers for the application
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://js.stripe.com", "ws://localhost:3000", "ws://localhost:5173"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    interestCohort: []
  }
} as any);

/**
 * Rate limiting for API endpoints
 * Prevents abuse and DoS attacks
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased for testing)
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = (req as any).user;
    if (user?.id) {
      return `user:${user.id}`;
    }
    const clientId = req.get?.('x-chimari-client-id');
    if (clientId) {
      return `client:${clientId}`;
    }
    const ipKey = ipKeyGenerator(typeof req.ip === 'string' ? req.ip : '');
    return `ip:${ipKey}`;
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'development' && (process.env.ENABLE_RATE_LIMITING || '').toLowerCase() === 'false') {
      return true;
    }
    return shouldBypassRateLimit(req);
  },
  handler: (req, res) => {
    console.warn('🚨 Rate limit exceeded:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 auth requests per windowMs (increased for testing)
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => {
    if (process.env.NODE_ENV === 'development' && (process.env.ENABLE_RATE_LIMITING || '').toLowerCase() === 'false') {
      return true;
    }
    return shouldBypassRateLimit(req);
  },
  handler: (req, res) => {
    console.warn('🚨 Auth rate limit exceeded:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Rate limiting for file upload endpoints
 */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: {
    success: false,
    error: 'Upload limit exceeded, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'development' && (process.env.ENABLE_RATE_LIMITING || '').toLowerCase() === 'false') {
      return true;
    }
    return shouldBypassRateLimit(req);
  },
  handler: (req, res) => {
    console.warn('🚨 Upload rate limit exceeded:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      success: false,
      error: 'Upload limit exceeded, please try again later.',
      retryAfter: '1 hour'
    });
  }
});

/**
 * CORS configuration for security
 */
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // In production, specify allowed origins
    const allowedOrigins = [
      'https://chimaridata.com',
      'https://www.chimaridata.com',
      'https://app.chimaridata.com'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn('🚨 CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'authorization', 'X-Forwarded-Authorization', 'x-forwarded-authorization', 'X-Requested-With', 'X-Customer-Context'],
  exposedHeaders: ['Authorization', 'X-Forwarded-Authorization'],
  maxAge: 86400 // 24 hours
};

/**
 * Request logging middleware for security monitoring
 */
export const securityLogging = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log suspicious requests
    if (res.statusCode >= 400) {
      console.warn('🚨 Suspicious request:', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Log slow requests
    if (duration > 5000) {
      console.warn('🐌 Slow request detected:', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  next();
};

/**
 * Rate limiting for admin endpoints
 * More restrictive than API rate limiting
 */
export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 admin requests per windowMs
  message: {
    success: false,
    error: 'Too many admin requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn('🚨 Admin rate limit exceeded:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many admin requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  },
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env.NODE_ENV === 'development' && req.ip === '127.0.0.1') {
      return true;
    }
    if (process.env.NODE_ENV === 'development' && (process.env.ENABLE_RATE_LIMITING || '').toLowerCase() === 'false') {
      return true;
    }
    return shouldBypassRateLimit(req);
  }
});
