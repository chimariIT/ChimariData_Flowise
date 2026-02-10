import * as DOMPurifyModule from 'dompurify';
const DOMPurify = (DOMPurifyModule as any).default || DOMPurifyModule;
import { JSDOM } from 'jsdom';

// Create a virtual DOM for DOMPurify
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

/**
 * Input sanitization middleware
 * Removes potentially dangerous HTML/script content from user inputs
 */
export const sanitizeInput = (req: any, res: any, next: any) => {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove script tags and dangerous HTML
      return purify.sanitize(obj, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true
      }).replace(/[<>]/g, '');
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * SQL injection pattern detection
 */
export const detectSQLInjection = (input: string): boolean => {
  const sqlPatterns = [
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
    /(\b(OR|AND)\s+['"]\w+['"]\s*=\s*['"]\w+['"])/i,
    // FIX: Only detect SQL comments, not general double-dashes
    // -- must be followed by space and text (SQL comment), or /* */ block comments
    /(--\s+[a-z])/i, // SQL line comment with text
    /(\/\*[\s\S]*?\*\/)/,  // SQL block comment
    // Skip SCRIPT detection - too many false positives with legitimate text
    // /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b)/i,
    /(UNION\s+(ALL\s+)?SELECT)/i,
    /(DROP\s+TABLE)/i,
    /(INSERT\s+INTO)/i,
    /(DELETE\s+FROM)/i,
    /(UPDATE\s+\w+\s+SET)/i, // More specific UPDATE pattern
    /(CREATE\s+TABLE)/i,
    /(ALTER\s+TABLE)/i,
    /(EXEC\s+xp_)/i,
    /(;\s*(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER))/i  // Chained SQL statements
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
};

/**
 * XSS pattern detection
 */
export const detectXSS = (input: string): boolean => {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /onmouseover\s*=/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi
  ];

  return xssPatterns.some(pattern => pattern.test(input));
};

/**
 * SQL injection protection middleware
 */
export const sqlInjectionProtection = (req: any, res: any, next: any) => {
  const checkForSQLInjection = (obj: any): boolean => {
    if (typeof obj === 'string' && detectSQLInjection(obj)) {
      return true;
    }

    if (Array.isArray(obj)) {
      return obj.some(checkForSQLInjection);
    }

    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(checkForSQLInjection);
    }

    return false;
  };

  if (checkForSQLInjection(req.body) || checkForSQLInjection(req.query)) {
    console.warn('🚨 SQL injection attempt detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    return res.status(400).json({
      success: false,
      error: 'Invalid input detected. Please remove special characters.',
      code: 'INVALID_INPUT'
    });
  }

  next();
};

/**
 * XSS protection middleware
 */
export const xssProtection = (req: any, res: any, next: any) => {
  const checkForXSS = (obj: any): boolean => {
    if (typeof obj === 'string' && detectXSS(obj)) {
      return true;
    }

    if (Array.isArray(obj)) {
      return obj.some(checkForXSS);
    }

    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(checkForXSS);
    }

    return false;
  };

  if (checkForXSS(req.body) || checkForXSS(req.query)) {
    console.warn('🚨 XSS attempt detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    return res.status(400).json({
      success: false,
      error: 'Invalid input detected. Please remove HTML tags and scripts.',
      code: 'INVALID_INPUT'
    });
  }

  next();
};

/**
 * Combined security middleware for critical endpoints
 */
export const securityMiddleware = [sanitizeInput, sqlInjectionProtection, xssProtection];

/**
 * Log security events
 */
export const logSecurityEvent = (event: string, details: any) => {
  console.log(`🔒 Security Event: ${event}`, {
    ...details,
    timestamp: new Date().toISOString()
  });
};












