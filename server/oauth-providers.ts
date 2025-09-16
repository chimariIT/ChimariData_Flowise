import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
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
function getDynamicCallbackURL(provider: string, req?: any): string {
  if (req && req.get('host')) {
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    return `${protocol}://${req.get('host')}/api/auth/${provider}/callback`;
  }
  // Fallback - use relative URL which should work with Passport.js
  return `/api/auth/${provider}/callback`;
}

// Generate cryptographically secure state parameter
function generateStateParameter(): string {
  return require('crypto').randomBytes(32).toString('hex');
}

// Google OAuth Provider with dynamic callback and CSRF protection
class DynamicGoogleStrategy extends GoogleStrategy {
  constructor(options: any, verify: any) {
    super(options, verify);
  }

  authenticate(req: any, options?: any) {
    // Update callback URL dynamically based on the request
    if (req && req.get('host')) {
      const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      (this as any)._callbackURL = `${protocol}://${req.get('host')}/api/auth/google/callback`;
      console.log('Dynamic Google OAuth Callback URL:', (this as any)._callbackURL);
    }

    // Generate and store state parameter for CSRF protection
    if (!req.query?.code) {
      const state = generateStateParameter();
      if (req.session) {
        req.session.oauth_state = state;
      }
      options = { ...options, state };
      console.log('Google OAuth: Generated CSRF state parameter');
    } else {
      // Verify state parameter on callback
      const sentState = req.query.state;
      const sessionState = req.session?.oauth_state;
      
      if (!sentState || !sessionState || sentState !== sessionState) {
        console.error('Google OAuth: CSRF state verification failed');
        return this.error(new Error('CSRF state verification failed'));
      }
      
      // Clear the state from session after verification
      if (req.session) {
        delete req.session.oauth_state;
      }
      console.log('Google OAuth: CSRF state verified successfully');
    }
    
    return super.authenticate(req, options);
  }
}

// GitHub OAuth Provider with dynamic callback and CSRF protection
class DynamicGitHubStrategy extends GitHubStrategy {
  constructor(options: any, verify: any) {
    super(options, verify);
  }

  authenticate(req: any, options?: any) {
    // Update callback URL dynamically based on the request
    if (req && req.get('host')) {
      const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      (this as any)._callbackURL = `${protocol}://${req.get('host')}/api/auth/github/callback`;
      console.log('Dynamic GitHub OAuth Callback URL:', (this as any)._callbackURL);
    }

    // Generate and store state parameter for CSRF protection
    if (!req.query?.code) {
      const state = generateStateParameter();
      if (req.session) {
        req.session.oauth_state_github = state;
      }
      options = { ...options, state };
      console.log('GitHub OAuth: Generated CSRF state parameter');
    } else {
      // Verify state parameter on callback
      const sentState = req.query.state;
      const sessionState = req.session?.oauth_state_github;
      
      if (!sentState || !sessionState || sentState !== sessionState) {
        console.error('GitHub OAuth: CSRF state verification failed');
        return this.error(new Error('CSRF state verification failed'));
      }
      
      // Clear the state from session after verification
      if (req.session) {
        delete req.session.oauth_state_github;
      }
      console.log('GitHub OAuth: CSRF state verified successfully');
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
          email: email,
          password: null,
          hashedPassword: null,
          firstName: profile.name?.givenName || null,
          lastName: profile.name?.familyName || null,
          profileImageUrl: profile.photos?.[0]?.value || null,
          provider: 'google',
          providerId: profile.id || null,
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          passwordResetToken: null,
          passwordResetExpires: null,
          subscriptionTier: 'none',
          subscriptionStatus: 'inactive',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          subscriptionExpiresAt: null,
          monthlyUploads: 0,
          monthlyDataVolume: 0,
          monthlyAIInsights: 0,
          usageResetAt: new Date()
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

// GitHub OAuth Provider
export const githubProvider: OAuthProviderConfig = {
  name: 'github',
  strategy: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? 
    new DynamicGitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "/api/auth/github/callback" // Dynamic URL is handled by the DynamicGitHubStrategy
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email found in GitHub profile'), null);
      }

      let existingUser = await storage.getUserByEmail(email);
      
      if (existingUser) {
        // Return existing user (can be enhanced with update logic later)
        return done(null, existingUser);
      } else {
        // Create new user
        const newUser = await storage.createUser({
          id: `github_${profile.id}`,
          email: email,
          password: null,
          hashedPassword: null,
          firstName: profile.displayName?.split(' ')[0] || profile.username || null,
          lastName: profile.displayName?.split(' ').slice(1).join(' ') || null,
          profileImageUrl: profile.photos?.[0]?.value || null,
          provider: 'github',
          providerId: profile.id || null,
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          passwordResetToken: null,
          passwordResetExpires: null,
          subscriptionTier: 'none',
          subscriptionStatus: 'inactive',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          subscriptionExpiresAt: null,
          monthlyUploads: 0,
          monthlyDataVolume: 0,
          monthlyAIInsights: 0,
          usageResetAt: new Date()
        });
        return done(null, newUser);
      }
    } catch (error) {
      return done(error, null);
    }
  }) : null,
  routes: {
    auth: '/api/auth/github',
    callback: '/api/auth/github/callback'
  },
  scopes: ['user:email'],
  isEnabled: () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
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
export const allProviders = [googleProvider, microsoftProvider, githubProvider, appleProvider];
export const enabledProviders = allProviders.filter(provider => provider.isEnabled());