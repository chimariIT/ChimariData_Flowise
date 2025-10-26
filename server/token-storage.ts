import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'chimari-dev-secret-key-change-in-production-2024';

export interface TokenData {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export class TokenStorage {
  /**
   * Generate a JWT token for a user
   */
  generateToken(userId: string, email: string): string {
    const payload: TokenData = {
      userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    
    return jwt.sign(payload, JWT_SECRET);
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

      const decoded = jwt.verify(token, JWT_SECRET) as TokenData;

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
      const decoded = jwt.verify(token, JWT_SECRET) as TokenData;
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
}

// Export singleton instance
export const tokenStorage = new TokenStorage();
export type { TokenData, TokenStorage };
export type { TokenData, TokenStorage };
export type { TokenData, TokenStorage };
export type { TokenData, TokenStorage };
export type { TokenData, TokenStorage };
export type { TokenData, TokenStorage };
export type { TokenData, TokenStorage };
export type { TokenData, TokenStorage };