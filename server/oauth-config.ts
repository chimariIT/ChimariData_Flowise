import passport from 'passport';
import { Express } from 'express';
import session from 'express-session';
import { storage } from './storage';
import { enabledProviders } from './oauth-providers';

export function setupOAuth(app: Express) {
  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Serialize/deserialize user
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Register all enabled OAuth providers
  enabledProviders.forEach(provider => {
    if (provider.strategy) {
      console.log(`Registering OAuth provider: ${provider.name}`);
      passport.use(provider.name, provider.strategy);

      // Setup auth route with dynamic domain logging
      app.get(provider.routes.auth, (req, res, next) => {
        const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
        const host = req.get('host');
        const dynamicCallback = `${protocol}://${host}/api/auth/google/callback`;
        console.log(`OAuth request from domain: ${protocol}://${host}`);
        console.log(`Expected callback URL: ${dynamicCallback}`);
        
        passport.authenticate(provider.name, { scope: provider.scopes })(req, res, next);
      });

      // Setup callback route
      app.get(provider.routes.callback,
        passport.authenticate(provider.name, { failureRedirect: '/auth' }),
        (req, res) => {
          // Successful authentication, redirect to dashboard
          res.redirect('/dashboard');
        }
      );
    }
  });

  // Get current user
  app.get('/api/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ message: 'Logged out successfully' });
    });
  });

  // API endpoint to get available providers
  app.get('/api/auth/providers', (req, res) => {
    const availableProviders = enabledProviders.map(provider => ({
      name: provider.name,
      authUrl: provider.routes.auth
    }));
    res.json(availableProviders);
  });

  // Debug endpoint to show OAuth configuration
  app.get('/api/auth/debug', (req, res) => {
    const replitDomain = process.env.REPLIT_DOMAINS;
    const baseUrl = replitDomain ? `https://${replitDomain.split(',')[0]}` : 'http://localhost:5000';
    const callbackUrl = `${baseUrl}/api/auth/google/callback`;
    
    res.json({
      baseUrl,
      callbackUrl,
      replitDomains: process.env.REPLIT_DOMAINS,
      nodeEnv: process.env.NODE_ENV,
      clientId: process.env.GOOGLE_CLIENT_ID ? 'Present' : 'Missing'
    });
  });
}

// Middleware to check if user is authenticated
export function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}