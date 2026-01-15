import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

// Security: Do not use default secret in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not defined in production environment');
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV !== 'production') {
  console.warn('WARNING: JWT_SECRET not set. Using insecure default for development only.');
}

const resolveJwtSecret = (): string => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET is not defined in production environment');
  }
  return 'chimari-dev-secret-key-change-in-production-2024';
};

export interface TokenData {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

export class TokenStorage {
  /**
   * Generate a JWT token for a user
   */
  generateToken(userId: string, email: string): string {
    const secret = resolveJwtSecret();

    return jwt.sign(
      { userId, email },
      secret,
      {
        expiresIn: '24h',
        jwtid: nanoid(),
      }
    );
  }

  /**
   * Validate and decode a JWT token
   */
  validateToken(token: string): TokenData | null {
    try {
      // Check if token is empty or null
      if (!token || token.trim() === '') {
        console.error('Token validation failed: Empty token');
        return null;
      }

      // Basic JWT structure validation (should have 3 parts separated by dots)
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.error('Token validation failed: Invalid JWT structure');
        return null;
      }

      const decoded = jwt.verify(token, resolveJwtSecret()) as TokenData;

      // Verify decoded token has required fields
      if (!decoded.userId || !decoded.email) {
        console.error('Token validation failed: Missing required fields');
        return null;
      }

      return decoded;
    } catch (error) {
      console.error('Token validation failed:', (error as any)?.message || error);
      return null;
    }
  }

  /**
   * Check if a token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.verify(token, resolveJwtSecret()) as TokenData;
      if (!decoded.exp) return true;
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  /**
   * Refresh a token (generate new one with same user data)
   */
  refreshToken(token: string): string | null {
    const decoded = this.validateToken(token);
    if (!decoded) return null;

    return this.generateToken(decoded.userId, decoded.email);
  }

  /**
   * Extract a bearer token from an Authorization header string
   */
  extractTokenFromHeader(header: string | null | undefined): string | null {
    if (!header || typeof header !== 'string') {
      return null;
    }

    const trimmed = header.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const match = /^Bearer\s+(\S+)$/i.exec(trimmed);
    if (!match) {
      return null;
    }

    return match[1] || null;
  }
}

// Export singleton instance
export const tokenStorage = new TokenStorage();