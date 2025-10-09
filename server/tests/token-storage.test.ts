import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tokenStorage, TokenData } from '../token-storage';

describe('TokenStorage', () => {
  const testUserId = 'test-user-123';
  const testEmail = 'test@example.com';
  let testToken: string;

  beforeEach(() => {
    // Set test JWT secret for consistent testing
    process.env.JWT_SECRET = 'test-secret-key-for-testing';
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.JWT_SECRET;
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      testToken = tokenStorage.generateToken(testUserId, testEmail);

      expect(testToken).toBeDefined();
      expect(typeof testToken).toBe('string');
      expect(testToken.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate different tokens for different users', () => {
      const token1 = tokenStorage.generateToken('user1', 'user1@test.com');
      const token2 = tokenStorage.generateToken('user2', 'user2@test.com');

      expect(token1).not.toBe(token2);
    });

    it('should handle special characters in email', () => {
      const specialEmail = 'test+user@example-domain.co.uk';
      const token = tokenStorage.generateToken(testUserId, specialEmail);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('validateToken', () => {
    beforeEach(() => {
      testToken = tokenStorage.generateToken(testUserId, testEmail);
    });

    it('should validate a valid token', () => {
      const decoded = tokenStorage.validateToken(testToken);

      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(testUserId);
      expect(decoded!.email).toBe(testEmail);
      expect(decoded!.iat).toBeDefined();
      expect(decoded!.exp).toBeDefined();
    });

    it('should return null for invalid token', () => {
      const result = tokenStorage.validateToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for empty token', () => {
      const result = tokenStorage.validateToken('');
      expect(result).toBeNull();
    });

    it('should return null for malformed JWT', () => {
      const result = tokenStorage.validateToken('not.a.jwt');
      expect(result).toBeNull();
    });

    it('should return null for token with wrong secret', () => {
      // Generate token with one secret
      const token = tokenStorage.generateToken(testUserId, testEmail);

      // Change secret and try to validate
      process.env.JWT_SECRET = 'different-secret';
      const result = tokenStorage.validateToken(token);

      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    beforeEach(() => {
      testToken = tokenStorage.generateToken(testUserId, testEmail);
    });

    it('should refresh a valid token', () => {
      const newToken = tokenStorage.refreshToken(testToken);

      expect(newToken).toBeDefined();
      expect(typeof newToken).toBe('string');
      expect(newToken).not.toBe(testToken); // Should be different token

      // New token should be valid
      const decoded = tokenStorage.validateToken(newToken!);
      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(testUserId);
      expect(decoded!.email).toBe(testEmail);
    });

    it('should return null for invalid token', () => {
      const result = tokenStorage.refreshToken('invalid-token');
      expect(result).toBeNull();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
      const authHeader = `Bearer ${token}`;

      const extracted = tokenStorage.extractTokenFromHeader(authHeader);
      expect(extracted).toBe(token);
    });

    it('should return null for invalid header format', () => {
      expect(tokenStorage.extractTokenFromHeader('InvalidHeader')).toBeNull();
      expect(tokenStorage.extractTokenFromHeader('Basic token')).toBeNull();
      expect(tokenStorage.extractTokenFromHeader('Bearer')).toBeNull();
      expect(tokenStorage.extractTokenFromHeader('Bearer token extra')).toBeNull();
    });

    it('should return null for empty header', () => {
      expect(tokenStorage.extractTokenFromHeader('')).toBeNull();
      expect(tokenStorage.extractTokenFromHeader(null as any)).toBeNull();
    });
  });

  describe('Integration Tests', () => {
    it('should complete full token lifecycle', () => {
      // Generate token
      const token = tokenStorage.generateToken(testUserId, testEmail);
      expect(token).toBeDefined();

      // Validate token
      const decoded = tokenStorage.validateToken(token);
      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(testUserId);

      // Refresh token
      const refreshed = tokenStorage.refreshToken(token);
      expect(refreshed).toBeDefined();
      expect(refreshed).not.toBe(token);

      // Validate refreshed token
      const decodedRefreshed = tokenStorage.validateToken(refreshed!);
      expect(decodedRefreshed).toBeDefined();
      expect(decodedRefreshed!.userId).toBe(testUserId);
    });

    it('should work with Authorization header extraction', () => {
      const token = tokenStorage.generateToken(testUserId, testEmail);
      const authHeader = `Bearer ${token}`;

      const extracted = tokenStorage.extractTokenFromHeader(authHeader);
      expect(extracted).toBe(token);

      const decoded = tokenStorage.validateToken(extracted!);
      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(testUserId);
    });
  });
});