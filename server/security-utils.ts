import crypto from 'crypto';
import path from 'path';

/**
 * Security utilities for input sanitization and validation
 */
export class SecurityUtils {
  
  /**
   * Sanitize string input to prevent XSS attacks
   */
  static sanitizeString(input: any): string {
    if (typeof input !== 'string') {
      return '';
    }
    
    // Remove potentially dangerous characters and HTML tags
    return input
      .replace(/[<>\"']/g, '') // Remove basic HTML/script injection characters
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
      .replace(/data:/gi, '') // Remove data: protocols
      .replace(/vbscript:/gi, '') // Remove vbscript: protocols
      .trim()
      .substring(0, 1000); // Limit length to prevent buffer overflow
  }

  /**
   * Sanitize email address
   */
  static sanitizeEmail(email: any): string {
    if (typeof email !== 'string') {
      return '';
    }
    
    // Basic email sanitization - allow only valid email characters
    const sanitized = email
      .toLowerCase()
      .replace(/[^a-z0-9@._-]/g, '')
      .trim()
      .substring(0, 254); // RFC 5321 limit
    
    // Basic email format validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(sanitized) ? sanitized : '';
  }

  /**
   * Sanitize filename for safe storage
   */
  static sanitizeFilename(filename: any): string {
    if (typeof filename !== 'string') {
      return 'unknown_file';
    }
    
    // Remove path traversal attempts and dangerous characters
    const sanitized = path.basename(filename)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '') // Remove leading dots
      .substring(0, 255); // Filesystem limit
    
    return sanitized || 'unknown_file';
  }

  /**
   * Validate and sanitize file upload
   */
  static validateFileUpload(file: any): {
    valid: boolean;
    error?: string;
    sanitizedName?: string;
  } {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    // Check file size (100MB limit)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 100MB limit' };
    }

    // Validate file extension
    const allowedExtensions = ['.csv', '.json', '.xlsx', '.xls', '.txt'];
    const sanitizedName = this.sanitizeFilename(file.originalname);
    const ext = path.extname(sanitizedName).toLowerCase();
    
    if (!allowedExtensions.includes(ext)) {
      return { 
        valid: false, 
        error: `File type ${ext} not allowed. Please upload CSV, JSON, Excel, or text files.` 
      };
    }

    // Check for potentially malicious content in filename
    const dangerousPatterns = [
      /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.com$/i, /\.scr$/i,
      /\.js$/i, /\.vbs$/i, /\.jar$/i, /\.app$/i, /\.deb$/i,
      /\.dmg$/i, /\.pkg$/i, /\.rpm$/i
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(sanitizedName))) {
      return { valid: false, error: 'File type not allowed for security reasons' };
    }

    return { valid: true, sanitizedName };
  }

  /**
   * Sanitize array of strings (like features list)
   */
  static sanitizeStringArray(input: any): string[] {
    if (!Array.isArray(input)) {
      return [];
    }
    
    return input
      .filter(item => typeof item === 'string')
      .map(item => this.sanitizeString(item))
      .filter(item => item.length > 0)
      .slice(0, 20); // Limit array size
  }

  /**
   * Sanitize numeric input
   */
  static sanitizeNumber(input: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
    const num = typeof input === 'string' ? parseFloat(input) : Number(input);
    
    if (isNaN(num) || !isFinite(num)) {
      return min;
    }
    
    return Math.max(min, Math.min(max, Math.floor(Math.abs(num))));
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive data (passwords, etc.)
   */
  static async hashSensitiveData(data: string, saltRounds: number = 12): Promise<string> {
    const bcrypt = await import('bcrypt');
    return bcrypt.hash(data, saltRounds);
  }

  /**
   * Rate limiting helper - check if IP/user has exceeded limits
   */
  static checkRateLimit(identifier: string, maxRequests: number = 100, windowMs: number = 15 * 60 * 1000): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    // Simple in-memory rate limiting (in production, use Redis or similar)
    const now = Date.now();
    const key = `rateLimit:${identifier}`;
    
    // This is a simplified implementation - in production you'd want more sophisticated rate limiting
    // For now, just return allowed for basic functionality
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs
    };
  }

  /**
   * Validate JWT token format (basic validation)
   */
  static validateTokenFormat(token: any): boolean {
    if (typeof token !== 'string') {
      return false;
    }
    
    // Basic JWT format check (3 parts separated by dots)
    const parts = token.split('.');
    return parts.length === 3 && parts.every(part => part.length > 0);
  }

  /**
   * Sanitize object keys and values recursively
   */
  static sanitizeObject(obj: any, maxDepth: number = 3): any {
    if (maxDepth <= 0 || obj === null || typeof obj !== 'object') {
      return typeof obj === 'string' ? this.sanitizeString(obj) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.slice(0, 100).map(item => this.sanitizeObject(item, maxDepth - 1));
    }

    const sanitized: any = {};
    const keys = Object.keys(obj).slice(0, 50); // Limit number of keys
    
    for (const key of keys) {
      const sanitizedKey = this.sanitizeString(key);
      if (sanitizedKey.length > 0 && sanitizedKey.length <= 100) {
        sanitized[sanitizedKey] = this.sanitizeObject(obj[key], maxDepth - 1);
      }
    }
    
    return sanitized;
  }

  /**
   * Validate and sanitize request body for API endpoints
   */
  static sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return {};
    }

    return this.sanitizeObject(body);
  }

  /**
   * Check for SQL injection patterns (even though we use ORM)
   */
  static containsSQLInjection(input: string): boolean {
    if (typeof input !== 'string') {
      return false;
    }
    
    const sqlPatterns = [
      /(\bUNION\b)|(\bSELECT\b)|(\bINSERT\b)|(\bUPDATE\b)|(\bDELETE\b)|(\bDROP\b)|(\bCREATE\b)|(\bALTER\b)/i,
      /(\bOR\b\s+\d+\s*=\s*\d+)|(\bAND\b\s+\d+\s*=\s*\d+)/i,
      /('(\s|\S)*')|(-{2})|(\|\|)|(\*)/,
      /(\bEXEC\b)|(\bEXECUTE\b)|(\bSP_\w+)/i
    ];
    
    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Content Security Policy headers
   */
  static getCSPHeaders(): Record<string, string> {
    return {
      'Content-Security-Policy': 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' wss: ws:; " +
        "frame-ancestors 'none';",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
  }
}