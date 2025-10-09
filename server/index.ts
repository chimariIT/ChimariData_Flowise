import 'dotenv/config';
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer, Server } from "http";
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { setupVite, serveStatic, log } from "./vite";
import apiRouter from './routes'; // Use the new modular router
import { setupOAuth } from './oauth-config'; // OAuth configuration
import { securityHeaders, apiRateLimit, authRateLimit, uploadRateLimit, corsConfig, securityLogging } from './middleware/security-headers';
import { securityMiddleware } from './middleware/security';
import { RealtimeServer } from './realtime';
import { projectAgentOrchestrator } from './services/project-agent-orchestrator';

const app = express();

// Apply security middleware first
app.use(securityHeaders);
app.use(cors(corsConfig));
app.use(securityLogging);

// Body parsing middleware
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
  server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  
  // Initialize realtime server
  const realtimeServer = new RealtimeServer(wss);
  
  // Initialize agent orchestrator with realtime server
  (projectAgentOrchestrator as any).realtimeServer = realtimeServer;

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

  // Apply rate limiting to API routes
  app.use('/api', apiRateLimit);
  app.use('/api/auth', authRateLimit);
  app.use('/api/projects/upload', uploadRateLimit);
  app.use('/api/trial-upload', uploadRateLimit);

  // Apply security middleware to critical endpoints
  app.use('/api/projects', ...securityMiddleware);
  app.use('/api/analysis', ...securityMiddleware);
  app.use('/api/ai', ...securityMiddleware);

  // Register API routes FIRST - before static file serving
  app.use('/api', apiRouter);

  // Register performance monitoring routes
  const performanceWebhooks = await import('./routes/performance-webhooks.js');
  app.use('/api/performance', performanceWebhooks.default);

  // Register health check routes
  const healthRoutes = await import('./routes/health.js');
  app.use('/api', healthRoutes.default);

  // Legacy health check endpoint for backwards compatibility
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Serve static files and setup frontend routing AFTER API routes
  if (app.get("env") === "development" && !process.env.VITE_SEPARATED) {
    // Only use Vite middleware if not running in separated mode
    await setupVite(app, server);
  } else if (app.get("env") === "production") {
    serveStatic(app);
  }
  // In development with VITE_SEPARATED=true, we don't serve frontend files
  // The Vite dev server handles that on port 5173

  // Error handler should be LAST
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // Do not re-throw the error, as it will crash the server
  });

  if (process.env.NODE_ENV !== 'test') {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    const host = '127.0.0.1';
    server.listen(port, host, () => {
      log(`serving on ${host}:${port}`);
    });
  }
})();

export default app;
