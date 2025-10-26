import { Request, Response, NextFunction } from 'express';

// Simple authentication middleware for development
// In production, this should be replaced with proper JWT/session validation

export function authenticateUser(req: Request, res: Response, next: NextFunction) {
  // For development, allow all requests
  // In production, validate JWT token or session
  const token = req.headers.authorization?.replace('Bearer ', '') || 
                req.headers['x-auth-token'] as string ||
                req.cookies?.auth_token;

  if (!token) {
    // In development, continue without authentication
    // In production, return 401
    console.log('No auth token provided, continuing in development mode');
  } else {
    console.log('Auth token provided:', token.substring(0, 10) + '...');
  }

  // Add user info to request (mock for development)
  (req as any).user = {
    id: 'dev-user-123',
    email: 'dev@example.com',
    role: 'user',
    subscriptionTier: 'trial'
  };

  next();
}

export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  // For development, allow all admin requests
  // In production, validate admin role
  const token = req.headers.authorization?.replace('Bearer ', '') || 
                req.headers['x-auth-token'] as string ||
                req.cookies?.auth_token;

  if (!token) {
    console.log('No auth token provided for admin, continuing in development mode');
  }

  // Add admin user info to request (mock for development)
  (req as any).user = {
    id: 'dev-admin-123',
    email: 'admin@example.com',
    role: 'admin',
    subscriptionTier: 'enterprise'
  };

  next();
}

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  // Alias for authenticateUser for backward compatibility
  return authenticateUser(req, res, next);
}



