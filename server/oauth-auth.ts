import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { Strategy as AppleStrategy } from 'passport-apple';
import { google } from 'googleapis';
import { storage } from './storage';
import type { Express } from 'express';

// Google Drive integration
export class GoogleDriveService {
  private oauth2Client: any;

  constructor(accessToken: string, refreshToken: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });
  }

  async listFiles() {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const response = await drive.files.list({
      q: "mimeType='text/csv' or mimeType='application/vnd.ms-excel' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
      fields: 'files(id, name, mimeType, size, modifiedTime)',
      pageSize: 20
    });
    return response.data.files;
  }

  async downloadFile(fileId: string) {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const response = await drive.files.get({
      fileId,
      alt: 'media'
    });
    return response.data;
  }
}

export function setupOAuthProviders(app: Express) {
  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
      scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        
        let user = await storage.getUserByEmail(email);
        if (!user) {
          user = await storage.createUser({
            username: email,
            email,
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || '',
            profileImageUrl: profile.photos?.[0]?.value || '',
            provider: 'google',
            providerId: profile.id,
            accessToken,
            refreshToken
          });
        } else {
          // Update tokens for existing user
          await storage.updateUserTokens(user.id, accessToken, refreshToken);
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));
  }

  // Microsoft OAuth Strategy
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    passport.use(new MicrosoftStrategy({
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: "/auth/microsoft/callback",
      scope: ['user.read', 'files.read']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        
        let user = await storage.getUserByEmail(email);
        if (!user) {
          user = await storage.createUser({
            username: email,
            email,
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || '',
            provider: 'microsoft',
            providerId: profile.id,
            accessToken,
            refreshToken
          });
        } else {
          await storage.updateUserTokens(user.id, accessToken, refreshToken);
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));
  }

  // Apple OAuth Strategy
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID) {
    passport.use(new AppleStrategy({
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      keyID: process.env.APPLE_KEY_ID,
      privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH || './apple-private-key.p8',
      callbackURL: "/auth/apple/callback",
      scope: ['name', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.email;
        const name = profile.name ? `${profile.name.firstName} ${profile.name.lastName}` : email;
        
        let user = await storage.getUserByEmail(email);
        if (!user) {
          user = await storage.createUser({
            username: email,
            email,
            firstName: profile.name?.firstName || '',
            lastName: profile.name?.lastName || '',
            provider: 'apple',
            providerId: profile.id,
            accessToken,
            refreshToken
          });
        } else {
          await storage.updateUserTokens(user.id, accessToken, refreshToken);
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));
  }

  // OAuth routes
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly'] }));
  app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    res.redirect('/dashboard');
  });

  app.get('/auth/microsoft', passport.authenticate('microsoft', { scope: ['user.read', 'files.read'] }));
  app.get('/auth/microsoft/callback', passport.authenticate('microsoft', { failureRedirect: '/login' }), (req, res) => {
    res.redirect('/dashboard');
  });

  app.get('/auth/apple', passport.authenticate('apple', { scope: ['name', 'email'] }));
  app.get('/auth/apple/callback', passport.authenticate('apple', { failureRedirect: '/login' }), (req, res) => {
    res.redirect('/dashboard');
  });
}