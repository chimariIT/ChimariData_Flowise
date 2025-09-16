# Adding OAuth Providers Guide

This system is designed to make adding new OAuth providers simple. Follow these steps to add Microsoft and Apple authentication when ready.

## Current Status
- ✅ Google OAuth: Fully implemented and ready to use
- ⏳ Microsoft OAuth: Ready to enable (just add credentials)
- ⏳ Apple OAuth: Ready to enable (just add credentials)

## Adding Microsoft OAuth

### 1. Get Microsoft Credentials
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" → "App registrations"
3. Create a new registration
4. Add redirect URI: `https://YOUR_DOMAIN/api/auth/microsoft/callback`
5. Generate a client secret

### 2. Add Environment Variables
```bash
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
```

### 3. Update oauth-providers.ts
Uncomment and complete the Microsoft provider:

```typescript
// Add this import at the top
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';

// Replace the microsoftProvider definition with:
export const microsoftProvider: OAuthProviderConfig = {
  name: 'microsoft',
  strategy: new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    callbackURL: "/api/auth/microsoft/callback",
    scope: ['user.read']
  }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email found in Microsoft profile'), null);
      }

      let existingUser = await storage.getUserByEmail(email);
      
      if (existingUser) {
        return done(null, existingUser);
      } else {
        const newUser = await storage.createUser({
          id: `microsoft_${profile.id}`,
          username: email,
          password: null,
          email: email,
          firstName: profile.name?.givenName || null,
          lastName: profile.name?.familyName || null,
          profileImageUrl: profile.photos?.[0]?.value || null,
          provider: 'microsoft',
          providerId: profile.id
        });
        return done(null, newUser);
      }
    } catch (error) {
      return done(error, null);
    }
  }),
  routes: {
    auth: '/api/auth/microsoft',
    callback: '/api/auth/microsoft/callback'
  },
  scopes: ['user.read'],
  isEnabled: () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
};
```

## Adding Apple OAuth

### 1. Get Apple Credentials
1. Go to [Apple Developer Console](https://developer.apple.com/)
2. Create an App ID and enable Sign In with Apple
3. Create a Services ID and configure domain and redirect URLs
4. Generate a private key for Sign In with Apple

### 2. Add Environment Variables
```bash
APPLE_CLIENT_ID=your_apple_service_id
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----"
```

### 3. Update oauth-providers.ts
Similar pattern as Microsoft - uncomment and complete the Apple provider configuration.

## That's it!

The frontend will automatically detect and display all enabled providers. No additional frontend changes needed!

## Testing
1. Add the environment variables
2. Restart the server
3. Visit `/auth` - you'll see all configured providers
4. The system automatically handles user creation and authentication for all providers