import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, registerSchema } from "@shared/schema";
import { spawn } from "child_process";
import path from "path";

// Simple session storage for demo purposes
const sessions = new Map<string, { userId: number; username: string }>();

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
    
    req.user = session;
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

  // Proxy requests to FastAPI for file upload
  app.use("/api/upload", (req, res) => {
    // This would proxy to the FastAPI backend running on port 8000
    res.status(501).json({ error: "File upload endpoint not implemented - connect to FastAPI backend" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
