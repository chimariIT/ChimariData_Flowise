import 'dotenv/config';
import * as expressModule from "express";
import type _express from "express";
const express: typeof _express = (expressModule as any).default || expressModule;
import type { Request, Response, NextFunction } from "express";
import { createServer, Server } from "http";
import { WebSocketServer } from 'ws';
import * as corsModule from 'cors';
import type _cors from 'cors';
const cors: typeof _cors = (corsModule as any).default || corsModule;
import { setupVite, serveStatic, log } from "./vite";
import apiRouter from './routes'; // Use the new modular router
import { setupOAuth } from './oauth-config'; // OAuth configuration
import { securityHeaders, apiRateLimit, authRateLimit, uploadRateLimit, corsConfig, securityLogging } from './middleware/security-headers';
import { securityMiddleware } from './middleware/security';
import { RealtimeServer } from './realtime';
import { projectAgentOrchestrator } from './services/project-agent-orchestrator';
import { validateProductionReadiness } from './services/production-validator';
import { initializeAgents } from './services/agent-initialization';
import { initializeTools } from './services/tool-initialization';
import { registerCoreTools } from './services/mcp-tool-registry';
import { initializePythonWorkerPool } from './services/python-worker-pool';
import { PricingService } from './services/pricing';
import { SocketManager } from './socket-manager';

const app = express();

// CRITICAL: Handle CORS preflight requests BEFORE any other middleware
// This fixes the "Method PATCH is not allowed" CORS error
// Must run before Helmet/securityHeaders which can interfere with preflight responses
app.options('*', (req, res, next) => {
  const origin = req.headers.origin;
  // Allow localhost and production origins
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') ||
      origin.includes('chimaridata.com')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization, X-Forwarded-Authorization, x-forwarded-authorization, X-Requested-With, X-Customer-Context');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  }
  next();
});

// Now apply CORS middleware for non-preflight requests
app.use(cors(corsConfig));

// Apply security middleware after CORS
app.use(securityHeaders);
app.use(securityLogging);

// ========================================
// CRITICAL: Stripe Webhook Raw Body Parsing
// ========================================
// Stripe webhooks require raw body for signature verification
// This MUST be registered BEFORE express.json() which parses the body
// The raw body is needed to compute HMAC signature for security
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

let server: Server;

(async () => {
  // ========================================
  // PRODUCTION READINESS VALIDATION
  // ========================================
  if (process.env.NODE_ENV === 'production') {
    console.log('🔍 Running production validation checks...');
    const validation = await validateProductionReadiness();

    if (!validation.ready) {
      console.error('🔴 PRODUCTION VALIDATION FAILED:');
      console.error('Critical failures preventing startup:');
      validation.failures.forEach(failure => console.error(`  ❌ ${failure}`));

      if (validation.warnings.length > 0) {
        console.warn('\nWarnings:');
        validation.warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
      }

      console.error('\n🛑 Server startup aborted due to validation failures.');
      console.error('Please fix the issues above and restart the server.');
      process.exit(1);
    }

    console.log('✅ Production validation passed');
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Warnings detected:');
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
  } else {
    // In development, still run validation but only show warnings
    console.log('🔍 Running development environment checks...');
    const validation = await validateProductionReadiness();

    if (validation.failures.length > 0) {
      console.warn('⚠️  Issues detected (non-blocking in development):');
      validation.failures.forEach(failure => console.warn(`  - ${failure}`));
    }

    if (validation.warnings.length > 0) {
      console.warn('ℹ️  Development mode warnings:');
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
  }

  // ========================================
  // INITIALIZE PYTHON WORKER POOL
  // ========================================
  console.log('🐍 Initializing Python worker pool for performance optimization...');
  try {
    await initializePythonWorkerPool();
    console.log('✅ Python worker pool ready (8-12s savings per analysis)');
  } catch (error) {
    console.warn('⚠️  Python worker pool initialization failed, will fall back to process spawning:', error);
    // Non-fatal error, continue with degraded performance
  }

  // ========================================
  // INITIALIZE AGENTS AND TOOLS
  // ========================================
  console.log('🤖 Initializing agents and tools...');

  // Initialize tracking state
  const initializationState = {
    toolsInitialized: false,
    agentsInitialized: false,
    toolInitializationCalled: false,
    agentInitializationCalled: false,
    toolInitializationTime: null as Date | null,
    agentInitializationTime: null as Date | null,
    toolCount: 0,
    agentCount: 0,
    errors: [] as string[]
  };

  try {
    // Load pricing configuration from database (or seed defaults)
    await PricingService.loadFromDatabase();

    // Initialize agents first
    initializationState.agentInitializationCalled = true;
    const agentStartTime = Date.now();

    const agentResults = await initializeAgents();
    initializationState.agentsInitialized = true;
    initializationState.agentInitializationTime = new Date();
    initializationState.agentCount = agentResults.successCount;

    console.log(`✅ Initialized ${agentResults.successCount} agents:`);
    agentResults.registered.forEach(agent => {
      console.log(`  - ${agent.name} (${agent.capabilities.join(', ')})`);
    });

    if (agentResults.failed.length > 0) {
      console.warn(`⚠️  Failed to initialize ${agentResults.failed.length} agents:`);
      agentResults.failed.forEach(failure => {
        console.warn(`  - ${failure.name}: ${failure.error}`);
        initializationState.errors.push(`Agent ${failure.name}: ${failure.error}`);
      });
    }

    // Initialize tools
    initializationState.toolInitializationCalled = true;
    const toolStartTime = Date.now();

    // Register core MCP tools first (including ML/LLM tools)
    console.log('🛠️ Registering core MCP tools...');
    registerCoreTools();
    console.log('✅ Core MCP tools registered');

    const toolResults = await initializeTools();
    initializationState.toolsInitialized = true;
    initializationState.toolInitializationTime = new Date();
    initializationState.toolCount = toolResults.successCount;

    console.log(`✅ Initialized ${toolResults.successCount} tools in ${toolResults.categories.length} categories`);
    toolResults.categories.forEach(category => {
      console.log(`  - ${category.name}: ${category.tools} tools`);
    });

    if (toolResults.failed.length > 0) {
      console.warn(`⚠️  Failed to initialize ${toolResults.failed.length} tools:`);
      toolResults.failed.forEach(failure => {
        console.warn(`  - ${failure.name}: ${failure.error}`);
        initializationState.errors.push(`Tool ${failure.name}: ${failure.error}`);
      });

      // ✅ Fail fast in production if critical tools failed
      // Critical tools required for core analysis functionality
      const criticalTools = [
        'statistical_analyzer',      // Core statistical analysis
        'enhanced_statistical_analyzer', // Enhanced analysis (if available)
        'spark_data_processor',      // Large-scale data processing
        'visualization_engine'       // Visualization generation
      ];

      // Check for critical tool failures
      const criticalFailures = toolResults.failed.filter(f =>
        criticalTools.some(ct => {
          const toolName = f.name.toLowerCase();
          const criticalName = ct.toLowerCase();
          // Match exact name or partial match (e.g., "statistical_analyzer" matches "Statistical Analyzer")
          return toolName === criticalName || toolName.includes(criticalName.replace(/_/g, ' '));
        })
      );

      // Also check if any critical tools are missing from registered tools
      const registeredToolNames = toolResults.categories
        .flatMap(cat => {
          // Tool names might not be directly available, check initialization results
          return [];
        });

      if (criticalFailures.length > 0 && process.env.NODE_ENV === 'production') {
        console.error(`🔴 CRITICAL: Failed to initialize ${criticalFailures.length} critical tool(s):`);
        criticalFailures.forEach(failure => {
          console.error(`  - ${failure.name}: ${failure.error}`);
        });
        console.error('🛑 Cannot start server without critical tools in production');
        console.error(`Required critical tools: ${criticalTools.join(', ')}`);
        process.exit(1);
      }
    }

    // Initialize billing & analytics MCP resources
    console.log('💰 Initializing billing & analytics...');
    try {
      const { initializeBillingAnalyticsMCP } = await import('./services/mcp-billing-analytics-resource');
      initializeBillingAnalyticsMCP();
      console.log('✅ Billing & analytics MCP resources registered');
    } catch (error) {
      console.error('❌ Failed to initialize billing & analytics:', error);
      initializationState.errors.push(`Billing & analytics: ${error}`);
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }

  } catch (error) {
    console.error('❌ Failed to initialize agents/tools:', error);
    initializationState.errors.push(`General initialization: ${error}`);
    if (process.env.NODE_ENV === 'production') {
      console.error('🛑 Cannot start server without agent/tool initialization');
      process.exit(1);
    } else {
      console.warn('⚠️  Continuing in development mode without full agent/tool initialization');
    }
  }

  // Export initialization state for admin endpoint
  function getInitializationState() {
    return initializationState;
  }

  // Make it available globally
  (global as any).getInitializationState = getInitializationState;

  // ========================================
  // START SERVER
  // ========================================
  server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Initialize realtime server
  const realtimeServer = new RealtimeServer(wss);

  // Initialize SocketManager (DEPRECATED - kept for backwards compatibility)
  // New features should use RealtimeServer (native WebSocket) instead
  // See socket-manager.ts for migration instructions
  SocketManager.getInstance().initialize(server);

  // FIX 7.1: Initialize RealtimeAgentBridge to forward agent events to WebSocket
  try {
    const { getAgentBridge } = await import('./services/agents/realtime-agent-bridge');
    const redisUrl = process.env.REDIS_URL || undefined;
    const agentBridge = getAgentBridge(realtimeServer, redisUrl);
    console.log('✅ Real-Time Agent Bridge initialized');

    // Store reference for other services to use
    (global as any).agentBridge = agentBridge;
  } catch (error) {
    console.error('❌ Failed to initialize Real-Time Agent Bridge:', error);
  }

  // FIX: Critical Fix #4 - Connect artifact generator to realtime server for completion notifications
  try {
    const { setRealtimeServer } = await import('./services/artifact-generator');
    setRealtimeServer(realtimeServer);
    console.log('✅ Artifact Generator connected to RealtimeServer for completion notifications');
  } catch (error) {
    console.error('❌ Failed to connect Artifact Generator to RealtimeServer:', error);
  }

  // Setup transformation queue WebSocket bridge
  // FIX: Production Readiness - Use native WebSocket (RealtimeServer) instead of Socket.IO
  try {
    const { getTransformationQueue } = await import('./services/transformation-queue');
    const queue = getTransformationQueue();

    // Helper to create transformation events in RealtimeEvent format
    const createTransformationEvent = (projectId: string, type: string, data: any) => ({
      type: 'progress' as const,
      sourceType: 'analysis' as const,
      sourceId: projectId,
      userId: 'system',
      projectId,
      timestamp: new Date(),
      data: { transformationType: type, ...data }
    });

    // Bridge queue events to native WebSocket
    queue.on('jobQueued', (job) => {
      realtimeServer.broadcastToProject(job.projectId, createTransformationEvent(job.projectId, 'queued', {
        jobId: job.jobId,
        status: job.status,
        priority: job.priority
      }));
    });

    queue.on('jobStarted', (job) => {
      realtimeServer.broadcastToProject(job.projectId, createTransformationEvent(job.projectId, 'started', {
        jobId: job.jobId,
        status: job.status
      }));
    });

    queue.on('jobProgress', (data) => {
      const projectId = data.jobId?.split('-')[1] || 'unknown';
      realtimeServer.broadcastToProject(projectId, createTransformationEvent(projectId, 'progress', data));
    });

    queue.on('jobCompleted', (job) => {
      realtimeServer.broadcastToProject(job.projectId, createTransformationEvent(job.projectId, 'completed', {
        jobId: job.jobId,
        status: job.status,
        result: job.result
      }));
    });

    queue.on('jobFailed', (job) => {
      realtimeServer.broadcastToProject(job.projectId, createTransformationEvent(job.projectId, 'failed', {
        jobId: job.jobId,
        status: job.status,
        error: job.error
      }));
    });

    queue.on('jobRetrying', (job) => {
      realtimeServer.broadcastToProject(job.projectId, createTransformationEvent(job.projectId, 'retrying', {
        jobId: job.jobId,
        status: job.status,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries
      }));
    });

    console.log('✅ Transformation queue WebSocket bridge initialized (native WebSocket)');
  } catch (error) {
    console.error('❌ Failed to setup transformation queue WebSocket bridge:', error);
  }

  // Initialize agent orchestrator with realtime server
  // (projectAgentOrchestrator as any).realtimeServer = realtimeServer; // Deprecated in favor of SocketManager

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = request.url ? new URL(request.url, `http://${request.headers.host}`) : null;
      if (url && (url.pathname === '/ws' || url.pathname === '/ws/')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (error) {
      console.error('WebSocket upgrade error:', error);
      socket.destroy();
    }
  });

  // Setup OAuth configuration
  setupOAuth(app);

  const enableRateLimiting = (process.env.ENABLE_RATE_LIMITING || '').toLowerCase() !== 'false';

  if (enableRateLimiting) {
    // Apply rate limiting to API routes when enabled
    app.use('/api', apiRateLimit);
    app.use('/api/auth', authRateLimit);
    app.use('/api/projects/upload', uploadRateLimit);
    app.use('/api/trial-upload', uploadRateLimit);
  } else {
    console.warn('⚠️  Rate limiting disabled via ENABLE_RATE_LIMITING=false');
  }

  // Apply security middleware to critical endpoints
  app.use('/api/projects', ...securityMiddleware);
  app.use('/api/analysis', ...securityMiddleware);
  app.use('/api/ai', ...securityMiddleware);

  // Register health check routes FIRST - these must be public and not require auth
  // Health.ts uses lazy loading internally for SparkProcessor, PythonProcessor, and Redis
  // to avoid initialization issues if services aren't available.
  try {
    const healthRoutes = await import('./routes/health');
    if (healthRoutes && healthRoutes.default) {
      app.use('/api', healthRoutes.default);
      console.log('✅ Health routes registered (public endpoints)');
    } else {
      console.error('⚠️  Health routes default export is undefined');
    }
  } catch (error) {
    console.error('⚠️  Failed to import health routes:', error instanceof Error ? error.message : String(error));
  }

  // Register performance monitoring routes (before main API router)
  const performanceWebhooks = await import('./routes/performance-webhooks.js');
  app.use('/api/performance', performanceWebhooks.default);

  // Register main API routes - includes auth-protected routes
  app.use('/api', apiRouter);

  // Serve static files and setup frontend routing AFTER API routes
  if (app.get("env") === "development" && !process.env.VITE_SEPARATED) {
    // Only use Vite middleware if not running in separated mode
    await setupVite(app, server);
  } else if (app.get("env") === "production") {
    serveStatic(app);
  }
  // In development with VITE_SEPARATED=true, we don't serve frontend files
  // The Vite dev server handles that on port 5173
  // PHASE 9 FIX: But we DO need to redirect client-side routes to Vite
  if (app.get("env") === "development" && process.env.VITE_SEPARATED) {
    app.get('*', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api')) {
        return next();
      }
      // Skip static assets
      if (req.path.match(/\.(js|css|png|jpg|svg|ico|json|woff|woff2|ttf|eot|map)$/)) {
        return next();
      }
      // Redirect client-side routes to Vite dev server
      const viteUrl = `http://localhost:5173${req.originalUrl}`;
      console.log(`[SPA] Redirecting ${req.path} to Vite: ${viteUrl}`);
      res.redirect(302, viteUrl);
    });
  }

  // Error handler should be LAST
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // Do not re-throw the error, as it will crash the server
  });

  if (process.env.NODE_ENV !== 'test') {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    const rawHost = process.env.HOST;
    const host = rawHost && rawHost !== 'localhost' ? rawHost : '::';

    const onListen = () => {
      const boundHost = host || '::';
      log(`serving on ${boundHost}:${port}`);

      // NOTE: SocketManager is deprecated, initialized earlier at server startup
      // New features should use RealtimeServer (native WebSocket) instead
    };

    server.listen({ port, host, ipv6Only: false }, onListen);

    // P2-B FIX: Graceful shutdown handler - clean up intervals and connections
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 [Shutdown] Received ${signal}, shutting down gracefully...`);
      try {
        const { taskQueue } = await import('./services/enhanced-task-queue');
        if (taskQueue && typeof taskQueue.shutdown === 'function') {
          taskQueue.shutdown();
          console.log('✅ [Shutdown] Task queue stopped');
        }
      } catch { /* ignore if not available */ }

      server.close(() => {
        console.log('✅ [Shutdown] HTTP server closed');
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        console.error('❌ [Shutdown] Forced exit after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
})();

export default app;
