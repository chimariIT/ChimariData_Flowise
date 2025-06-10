import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, registerSchema, aiQuerySchema } from "@shared/schema";
import { aiService } from "./ai-service";
import { PricingService } from "./pricing-service";
import { spawn } from "child_process";
import path from "path";
import Stripe from "stripe";

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: { id: number; userId: number; username: string };
    }
  }
}

// Simple session storage for demo purposes
const sessions = new Map<string, { userId: number; username: string }>();

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
} as any);

function generateToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function hashPassword(password: string): string {
  // Simple hash for demo - in production use bcrypt
  return Buffer.from(password).toString('base64');
}

function verifyPassword(password: string, hash: string): boolean {
  return Buffer.from(password).toString('base64') === hash;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Start FastAPI backend
  const fastApiProcess = spawn('python', [path.join(process.cwd(), 'server', 'fastapi-backend.py')], {
    stdio: 'inherit'
  });

  // Auth middleware
  const requireAuth = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const session = token ? sessions.get(token) : null;
    
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    req.user = {
      id: session.userId,
      userId: session.userId,
      username: session.username
    };
    next();
  };

  // Auth routes
  app.post("/api/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Create user
      const user = await storage.createUser({
        username: data.username,
        password: hashPassword(data.password),
      });

      // Create session
      const token = generateToken();
      sessions.set(token, { userId: user.id, username: user.username });

      res.json({ 
        token, 
        user: { id: user.id, username: user.username } 
      });
    } catch (error) {
      res.status(400).json({ error: "Invalid data" });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      const user = await storage.getUserByUsername(data.username);
      if (!user || !verifyPassword(data.password, user.password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = generateToken();
      sessions.set(token, { userId: user.id, username: user.username });

      res.json({ 
        token, 
        user: { id: user.id, username: user.username } 
      });
    } catch (error) {
      res.status(400).json({ error: "Invalid data" });
    }
  });

  app.post("/api/logout", requireAuth, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      sessions.delete(token);
    }
    res.json({ success: true });
  });

  // Project routes
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const projects = await storage.getUserProjects(req.user.userId);
      res.json({ projects });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id, req.user.userId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // AI Settings routes
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getUserSettings(req.user.userId);
      if (!settings) {
        // Create default settings if none exist
        const newSettings = await storage.createUserSettings({
          userId: req.user.userId,
          aiProvider: "anthropic",
          aiApiKey: null,
        });
        return res.json(newSettings);
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", requireAuth, async (req, res) => {
    try {
      const { aiProvider, aiApiKey } = req.body;
      
      const existingSettings = await storage.getUserSettings(req.user.userId);
      
      if (existingSettings) {
        const updated = await storage.updateUserSettings(req.user.userId, {
          aiProvider,
          aiApiKey,
        });
        res.json(updated);
      } else {
        const created = await storage.createUserSettings({
          userId: req.user.userId,
          aiProvider,
          aiApiKey,
        });
        res.json(created);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/ai/providers", (req, res) => {
    res.json({
      providers: aiService.getAvailableProviders(),
      info: aiService.getProviderInfo(),
      tiers: aiService.getSubscriptionTiers()
    });
  });

  // Subscription management
  app.post("/api/subscription/upgrade", requireAuth, async (req, res) => {
    try {
      const { tier } = req.body;
      
      if (!["starter", "professional", "enterprise"].includes(tier)) {
        return res.status(400).json({ error: "Invalid subscription tier" });
      }

      const settings = await storage.getUserSettings(req.user.userId);
      if (!settings) {
        return res.status(404).json({ error: "User settings not found" });
      }

      const quotaMap = {
        starter: 50,
        professional: 500,
        enterprise: -1 // Unlimited
      };

      const updated = await storage.updateUserSettings(req.user.userId, {
        subscriptionTier: tier,
        usageQuota: quotaMap[tier as keyof typeof quotaMap]
      });

      res.json({ 
        message: `Subscription upgraded to ${tier}`,
        settings: updated 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to upgrade subscription" });
    }
  });

  // AI Query route
  app.post("/api/ai/query", requireAuth, async (req, res) => {
    try {
      const data = aiQuerySchema.parse(req.body);
      
      // Get user settings
      let settings = await storage.getUserSettings(req.user.userId);
      if (!settings) {
        // Create default settings for new users
        settings = await storage.createUserSettings({
          userId: req.user.userId,
          aiProvider: "platform",
          aiApiKey: null,
          subscriptionTier: "starter",
          usageQuota: 50,
          usageCount: 0,
        });
      }

      // Check usage limits
      const canMakeQuery = await storage.canUserMakeQuery(req.user.userId);
      if (!canMakeQuery) {
        const currentUsage = await storage.getUserUsageThisMonth(req.user.userId);
        return res.status(429).json({ 
          error: `Monthly quota exceeded (${currentUsage}/${settings.usageQuota}). Upgrade your plan for more queries.`,
          usage: currentUsage,
          quota: settings.usageQuota
        });
      }

      // For non-platform providers, check API key
      if (settings.aiProvider !== "platform" && !settings.aiApiKey) {
        return res.status(400).json({ 
          error: "AI provider not configured. Please add your API key in settings or switch to platform provider." 
        });
      }

      // Get project data
      const project = await storage.getProject(data.projectId, req.user.userId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Prepare data context for AI
      const dataContext = {
        schema: project.schema,
        sampleData: project.dataSnapshot || [],
        recordCount: project.recordCount || 0,
      };

      // Query AI
      const response = await aiService.queryData(
        settings.aiProvider || "platform",
        settings.aiApiKey || "",
        data.query,
        dataContext
      );

      // Log usage
      await storage.logUsage({
        userId: req.user.userId,
        projectId: data.projectId,
        action: "ai_query",
        provider: settings.aiProvider,
        tokensUsed: Math.ceil(data.query.length / 4), // Rough estimate
        cost: settings.aiProvider === "platform" ? "0.00" : "estimated"
      });

      const currentUsage = await storage.getUserUsageThisMonth(req.user.userId);
      
      res.json({ 
        response, 
        provider: settings.aiProvider,
        usage: {
          current: currentUsage,
          quota: settings.usageQuota,
          remaining: (settings.usageQuota || 50) - currentUsage
        }
      });
    } catch (error) {
      console.error("AI Query Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process AI query" 
      });
    }
  });

  // Stripe Payment Routes
  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      const { amount, planName } = req.body;
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        metadata: {
          planName: planName || "professional"
        }
      });
      
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        amount: amount,
        planName: planName
      });
    } catch (error: any) {
      console.error("Payment intent creation error:", error);
      res.status(500).json({ 
        error: "Failed to create payment intent",
        message: error.message 
      });
    }
  });

  // Calculate pricing for data analysis
  app.post("/api/calculate-pricing", requireAuth, async (req, res) => {
    try {
      const { dataSizeMB, questionsCount, analysisType, schema, recordCount } = req.body;
      
      const dataComplexity = PricingService.assessDataComplexity(schema, recordCount);
      const pricing = PricingService.calculatePrice({
        dataSizeMB: dataSizeMB || 0,
        recordCount: recordCount || 0,
        columnCount: schema ? Object.keys(schema).length : 0,
        questionsCount: questionsCount || 0,
        analysisType: analysisType || 'standard',
        dataComplexity
      });
      
      res.json({
        pricing,
        dataComplexity,
        estimatedProcessingTime: analysisType === 'custom' ? '10-30 minutes' : '2-10 minutes'
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error calculating pricing: " + error.message });
    }
  });

  // Create payment intent for one-time analysis
  app.post("/api/create-analysis-payment", requireAuth, async (req, res) => {
    try {
      const { projectId, analysisType = 'standard' } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const project = await storage.getProject(projectId, req.user.userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Calculate pricing based on project data
      const dataComplexity = PricingService.assessDataComplexity(project.schema, project.recordCount || 0);
      const questionsCount = Array.isArray(project.questions) ? project.questions.length : 0;
      
      const pricing = PricingService.calculatePrice({
        dataSizeMB: project.dataSizeMB || 1,
        recordCount: project.recordCount || 0,
        columnCount: project.schema ? Object.keys(project.schema).length : 0,
        questionsCount,
        analysisType: analysisType as any,
        dataComplexity
      });
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: pricing.priceInCents,
        currency: "usd",
        metadata: {
          projectId,
          userId: req.user.userId.toString(),
          analysisType,
          dataComplexity
        }
      });
      
      // Update project with payment info
      await storage.updateProject(projectId, req.user.userId, {
        paymentType: 'one_time',
        paymentAmount: pricing.priceInCents,
        stripePaymentIntentId: paymentIntent.id,
        analysisType,
        complexityScore: dataComplexity === 'simple' ? 1 : dataComplexity === 'moderate' ? 3 : 5
      });
      
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        pricing,
        dataComplexity
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Create or retrieve subscription
  app.post('/api/subscription', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);
    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    try {
      const { planType, paymentMethodId } = req.body;
      
      // Get user settings to check for existing customer
      let settings = await storage.getUserSettings(session.userId);
      if (!settings) {
        settings = await storage.createUserSettings({
          userId: session.userId,
          aiProvider: "gemini",
          subscriptionTier: "starter",
          usageQuota: 50,
          monthlyUsage: 0
        });
      }

      let customerId = settings.stripeCustomerId;
      
      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          metadata: {
            userId: session.userId.toString(),
            username: session.username
          }
        });
        customerId = customer.id;
        
        // Update user settings with customer ID
        await storage.updateUserSettings(session.userId, {
          stripeCustomerId: customerId
        });
      }

      // Attach payment method to customer
      if (paymentMethodId) {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });

        // Set as default payment method
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      // Create subscription based on plan type
      let priceId: string;
      let newTier: string;
      let newQuota: number;

      switch (planType) {
        case "professional":
          priceId = "price_professional"; // You'll need to create this in Stripe Dashboard
          newTier = "professional";
          newQuota = 1000;
          break;
        case "enterprise":
          priceId = "price_enterprise"; // You'll need to create this in Stripe Dashboard
          newTier = "enterprise";
          newQuota = -1; // Unlimited
          break;
        default:
          return res.status(400).json({ error: "Invalid plan type" });
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      // Update user settings with subscription info
      await storage.updateUserSettings(session.userId, {
        stripeSubscriptionId: subscription.id,
        subscriptionTier: newTier,
        usageQuota: newQuota
      });

      res.json({
        subscriptionId: subscription.id,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
        status: subscription.status
      });

    } catch (error: any) {
      console.error("Subscription creation error:", error);
      res.status(500).json({ 
        error: "Failed to create subscription",
        message: error.message 
      });
    }
  });

  // Get subscription status
  app.get('/api/subscription/status', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);
    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    try {
      const settings = await storage.getUserSettings(session.userId);
      if (!settings?.stripeSubscriptionId) {
        return res.json({ 
          hasSubscription: false,
          tier: "starter",
          quota: 50
        });
      }

      const subscription = await stripe.subscriptions.retrieve(settings.stripeSubscriptionId);
      
      res.json({
        hasSubscription: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        tier: settings.subscriptionTier,
        quota: settings.usageQuota,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });

    } catch (error: any) {
      console.error("Subscription status error:", error);
      res.status(500).json({ 
        error: "Failed to get subscription status",
        message: error.message 
      });
    }
  });

  // Cancel subscription
  app.post('/api/subscription/cancel', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);
    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    try {
      const settings = await storage.getUserSettings(session.userId);
      if (!settings?.stripeSubscriptionId) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      const subscription = await stripe.subscriptions.update(
        settings.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );

      res.json({
        message: "Subscription will be canceled at the end of the current period",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.current_period_end
      });

    } catch (error: any) {
      console.error("Subscription cancellation error:", error);
      res.status(500).json({ 
        error: "Failed to cancel subscription",
        message: error.message 
      });
    }
  });

  // Proxy requests to FastAPI for file upload
  app.use("/api/upload", (req, res) => {
    // This would proxy to the FastAPI backend running on port 8000
    res.status(501).json({ error: "File upload endpoint not implemented - connect to FastAPI backend" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
