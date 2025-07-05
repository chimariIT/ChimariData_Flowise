import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { storage } from './storage';

export interface OAuthProviderConfig {
  name: string;
  strategy: any;
  routes: {
    auth: string;
    callback: string;
  };
  scopes: string[];
  isEnabled: () => boolean;
}

// Helper function to get the base URL
function getBaseUrl(): string {
  // Use REPLIT_DOMAINS environment variable if available
  const replitDomain = process.env.REPLIT_DOMAINS;
  if (replitDomain) {
    return `https://${replitDomain.split(',')[0]}`;
  }
  // Fallback for development
  return process.env.NODE_ENV === 'production' ? 'https://chimaridata.com' : 'http://localhost:5000';
}

// Google OAuth Provider
const callbackURL = `${getBaseUrl()}/api/auth/google/callback`;
console.log('OAuth Callback URL:', callbackURL);

export const googleProvider: OAuthProviderConfig = {
  name: 'google',
  strategy: new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: callbackURL
  }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email found in Google profile'), null);
      }

      let existingUser = await storage.getUserByEmail(email);
      
      if (existingUser) {
        // Return existing user (can be enhanced with update logic later)
        return done(null, existingUser);
      } else {
        // Create new user
        const newUser = await storage.createUser({
          id: `google_${profile.id}`,
          username: email,
          password: null,
          email: email,
          firstName: profile.name?.givenName || null,
          lastName: profile.name?.familyName || null,
          profileImageUrl: profile.photos?.[0]?.value || null,
          provider: 'google',
          providerId: profile.id
        });
        return done(null, newUser);
      }
    } catch (error) {
      return done(error, null);
    }
  }),
  routes: {
    auth: '/api/auth/google',
    callback: '/api/auth/google/callback'
  },
  scopes: ['profile', 'email'],
  isEnabled: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
};

// Microsoft OAuth Provider (ready to enable)
export const microsoftProvider: OAuthProviderConfig = {
  name: 'microsoft',
  strategy: null, // Will be initialized when credentials are available
  routes: {
    auth: '/api/auth/microsoft',
    callback: '/api/auth/microsoft/callback'
  },
  scopes: ['user.read'],
  isEnabled: () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
};

// Apple OAuth Provider (ready to enable)
export const appleProvider: OAuthProviderConfig = {
  name: 'apple',
  strategy: null, // Will be initialized when credentials are available
  routes: {
    auth: '/api/auth/apple',
    callback: '/api/auth/apple/callback'
  },
  scopes: ['name', 'email'],
  isEnabled: () => !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY)
};

// Export all providers for easy management
export const allProviders = [googleProvider, microsoftProvider, appleProvider];
export const enabledProviders = allProviders.filter(provider => provider.isEnabled());