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

// Dynamic callback URL that adapts to any Replit domain
function getDynamicCallbackURL(req?: any): string {
  if (req && req.get('host')) {
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    return `${protocol}://${req.get('host')}/api/auth/google/callback`;
  }
  // Fallback - use relative URL which should work with Passport.js
  return "/api/auth/google/callback";
}

// Google OAuth Provider with dynamic callback
class DynamicGoogleStrategy extends GoogleStrategy {
  constructor(options: any, verify: any) {
    super(options, verify);
  }

  authenticate(req: any, options?: any) {
    // Update callback URL dynamically based on the request
    if (req && req.get('host')) {
      const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      this._callbackURL = `${protocol}://${req.get('host')}/api/auth/google/callback`;
      console.log('Dynamic OAuth Callback URL:', this._callbackURL);
    }
    return super.authenticate(req, options);
  }
}

export const googleProvider: OAuthProviderConfig = {
  name: 'google',
  strategy: new DynamicGoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: "/api/auth/google/callback" // Dynamic URL is handled by the DynamicGoogleStrategy
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