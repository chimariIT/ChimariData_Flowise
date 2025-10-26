// server/routes/auth.ts
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { Router } from 'express';
import multer from "multer";
import bcrypt from 'bcryptjs';
import { storage } from '../services/storage';
import { tokenStorage } from '../token-storage';

import { 
    GoogleDriveService,
    FileProcessor,
    PIIAnalyzer,
    SecurityUtils
} from '../services';
import { PythonProcessor } from '../services/python-processor';
import { UnifiedPIIProcessor } from '../services/unified-pii-processor';

import { tempStore } from '../services/temp-store';
import { performanceWebhookService } from '../services/performance-webhook-service';

const router = Router();

// Performance monitoring middleware for auth routes
router.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warning' : 'success';
        
        // Log to console
        console.log(`🔐 Auth ${req.method} ${req.path} - ${duration}ms (${res.statusCode})`);
        if (duration > 1000) {
            console.warn(`⚠️  Slow auth operation: ${req.method} ${req.path} took ${duration}ms`);
        }

        // Send to webhook service for monitoring
        performanceWebhookService.recordMetric({
            timestamp: new Date(),
            service: 'auth',
            operation: `${req.method.toLowerCase()}_${req.path.replace(/^\//, '').replace(/\//g, '_') || 'root'}`,
            duration,
            status,
            details: {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                userAgent: req.get('User-Agent'),
                ip: req.ip || req.connection.remoteAddress
            },
            userId: (req as any).user?.id,
            sessionId: req.sessionID
        }).catch(error => {
            console.error('Failed to record performance metric:', error);
        });
    });
    next();
});

// OAuth providers endpoint
router.get("/providers", async (req, res) => {
    try {
        // Return empty array since OAuth is not configured in this environment
        res.json([]);
    } catch (error: any) {
        console.error('Error fetching OAuth providers:', error);
        res.status(500).json({ error: 'Failed to fetch OAuth providers' });
    }
});

// Login endpoint
router.post("/login", async (req, res) => {
    const loginStart = Date.now();
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Get user by email
        const dbStart = Date.now();
        const user = await storage.getUserByEmail(email);
        const dbTime = Date.now() - dbStart;

        if (user && user.hashedPassword) {
            // Validate password
            const bcryptStart = Date.now();
            const isValidPassword = await bcrypt.compare(password, user.hashedPassword);
            const bcryptTime = Date.now() - bcryptStart;
            
            if (isValidPassword) {
                // Generate JWT token
                const tokenStart = Date.now();
                const token = tokenStorage.generateToken(user.id, user.email);
                const tokenTime = Date.now() - tokenStart;

                const totalTime = Date.now() - loginStart;
                console.log(`📊 Login timing - DB: ${dbTime}ms, Bcrypt: ${bcryptTime}ms, Token: ${tokenTime}ms, Total: ${totalTime}ms`);

                // Send detailed login metrics to webhook service
                await performanceWebhookService.recordMetric({
                    timestamp: new Date(),
                    service: 'auth',
                    operation: 'login_breakdown',
                    duration: totalTime,
                    status: 'success',
                    details: {
                        dbTime,
                        bcryptTime,
                        tokenTime,
                        email: email, // Consider privacy implications
                        breakdown: {
                            database: { duration: dbTime, percentage: (dbTime / totalTime * 100).toFixed(1) },
                            bcrypt: { duration: bcryptTime, percentage: (bcryptTime / totalTime * 100).toFixed(1) },
                            token: { duration: tokenTime, percentage: (tokenTime / totalTime * 100).toFixed(1) }
                        }
                    },
                    userId: user.id
                });

                res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        subscriptionTier: user.subscriptionTier
                    }
                });
            } else {
                res.status(401).json({ error: "Invalid credentials" });
            }
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ error: "Login failed" });
    }
});

// Register endpoint
router.post("/register", async (req, res) => {
    try {
        const { email, firstName, lastName, password } = req.body;

        if (!email || !firstName || !lastName || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Check if user already exists
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ error: "User already exists" });
        }

        // Create new user with optimized password hashing (reduced from 12 to 10 rounds for better performance)
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = await storage.createUser({
            email,
            firstName,
            lastName,
            hashedPassword,
            provider: 'local',
            subscriptionTier: 'trial'
        });

        // Generate JWT token
        const token = tokenStorage.generateToken(user.id, user.email);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                subscriptionTier: user.subscriptionTier
            }
        });
    } catch (error: any) {
        console.error('Registration error:', error);
        console.error('Registration error details:', error.message, error.stack);
        res.status(500).json({ error: "Registration failed", details: error.message });
    }
});

// Get current user endpoint
router.get("/user", async (req, res) => {
    try {
        // Check for Bearer token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const token = authHeader.substring(7);
        const tokenData = tokenStorage.validateToken(token);
        
        if (!tokenData) {
            return res.status(401).json({ error: "Invalid token" });
        }

        const user = await storage.getUser(tokenData.userId);
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                subscriptionTier: user.subscriptionTier
            }
        });
    } catch (error: any) {
        console.error('Get current user error:', error);
        res.status(500).json({ error: "Failed to get user" });
    }
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for paid features
  },
});

// Removed old tokenStore - now using tokenStorage

// Define ensureAuthenticated middleware
/**
 * @summary Middleware to ensure a user is authenticated.
 * @description Checks for a valid session or a bearer token in the Authorization header.
 * If authenticated, attaches the user object to the request.
 * @auth Required.
 * @input
 * - `req.headers.authorization`: "Bearer <token>" (optional if session authenticated)
 * @process
 * 1. Checks for session-based authentication (`req.isAuthenticated`).
 * 2. If not found, checks for a "Bearer <token>" in the `Authorization` header.
 * 3. Validates the token using `tokenStorage`.
 * 4. Retrieves the user from `storage` and attaches it to `req.user`.
 * 5. If authentication fails at any step, it returns a 401 Unauthorized error.
 * @output
 * - Success: Calls `next()` to proceed to the next middleware/handler.
 * - Error: Responds with 401 { error: "Authentication required" }.
 * @dependencies `storage`, `tokenStorage`.
 */
export const ensureAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
    try {
            // Check session-based authentication first
            if (req.isAuthenticated && req.isAuthenticated()) {
                // Some environments may report authenticated without attaching user
                if (req.user) {
                    return next();
                }
                // Fall through to token-based auth to attach user
            }

      // Check Bearer token authentication
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        // Additional validation: ensure token isn't empty after extraction
        if (!token || token.trim() === '') {
          console.error('Authentication failed: Empty token after Bearer extraction');
          return res.status(401).json({ error: "Authentication required" });
        }

        const tokenData = tokenStorage.validateToken(token);
        if (tokenData) {
          const user = await storage.getUser(tokenData.userId);
          if (user) {
            req.user = user;
            req.userId = user.id;
            return next();
          } else {
            console.error('Authentication failed: User not found for token');
          }
        } else {
          console.error('Authentication failed: Invalid token');
        }
      } else {
        console.error('Authentication failed: No valid authorization header');
      }

            res.status(401).json({ error: "Authentication required" });
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(401).json({ error: "Authentication required" });
    }
};

// Unified auth middleware
/**
 * @summary A unified authentication middleware, similar to `ensureAuthenticated`.
 * @description Primarily used across different routes for consistent auth checking.
 * @auth Required.
 * @input
 * - `req.headers.authorization`: "Bearer <token>"
 * @process
 * 1. Checks for a "Bearer <token>" in the `Authorization` header.
 * 2. Validates the token and retrieves the user.
 * 3. Attaches user information to the request (`req.user`, `req.userId`).
 * 4. Returns 401 if authentication fails.
 * @output
 * - Success: Calls `next()`.
 * - Error: Responds with 401 { error: "Authentication required" }.
 * @dependencies `storage`, `tokenStorage`.
 */
export const unifiedAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
      }
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const tokenData = tokenStorage.validateToken(token);
          if (tokenData) {
            const user = await storage.getUser(tokenData.userId);
            if (user) {
              req.user = user;
              req.userId = user.id;
              return next();
            }
          }
        } catch (error) {
          console.error('Token validation error:', error);
        }
      }
      res.status(401).json({ error: 'Authentication required' });
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(401).json({ error: 'Authentication required' });
    }
};

/**
 * @summary Test-only endpoint to log in and get an auth token.
 * @description Creates a test user if one doesn't exist and returns a valid auth token.
 * This is used to bootstrap authentication in E2E tests.
 * @route POST /api/auth/login-test
 * @auth Not required.
 * @input None.
 * @process
 * 1. Defines a static test user ID.
 * 2. Retrieves or creates the test user in `storage`.
 * 3. Generates a random token and stores it in `tokenStore` mapped to the user ID.
 * @output
 * - Success: 200 { success: true, token: string }
 * - Error: 500 { success: false, error: string }
 * @dependencies `storage`, `tokenStorage`.
 */
router.post("/login-test", async (req, res) => {
    try {
        const testUserId = 'test-user-e2e';
        let user = await storage.getUser(testUserId);

        if (!user) {
            try {
                // Try to create test user with proper fields matching the schema
                user = await storage.createUser({
                    id: testUserId,
                    email: 'test-e2e@example.com',
                    firstName: 'Test',
                    lastName: 'User',
                    hashedPassword: 'dummy-password', // Not used for test login
                    provider: 'local',
                    subscriptionTier: 'professional',
                    isPaid: true,
                });
            } catch (createError: any) {
                // If user creation fails (e.g., duplicate key), try to get the user again
                console.warn('Test user creation failed, attempting to retrieve existing user:', createError.message);
                user = await storage.getUser(testUserId);

                // If still not found, this is a real error
                if (!user) {
                    throw new Error(`Failed to create or retrieve test user: ${createError.message}`);
                }
            }
        }

        const token = tokenStorage.generateToken(user.id, user.email);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                subscriptionTier: user.subscriptionTier
            }
        });
    } catch (error: any) {
        console.error('Test login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Google Drive integration endpoints
router.get("/google-drive/auth-url", (req, res) => {
    try {
      const authUrl = GoogleDriveService.getAuthUrl();
      res.json({ authUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

router.post("/google-drive/callback", async (req, res) => {
    try {
      const { code } = req.body;
      const tokens = await GoogleDriveService.getTokenFromCode(code);
      res.json({ tokens });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

// PII consent endpoint
router.post("/pii-consent", async (req, res) => {
    try {
      const { projectId, consent, detectedPII } = req.body;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const updatedProject = await storage.updateProject(projectId, {
        piiAnalysis: {
          ...project.piiAnalysis,
          detectedPII,
          userConsent: consent,
          consentTimestamp: new Date()
        }
      });

      res.json({ success: true, project: updatedProject });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

// PII decision endpoint
/**
 * @summary Handles the user's decision on detected PII and creates a project.
 * @description After a file is uploaded and PII is detected, the frontend sends the user's
 * decision (e.g., proceed, anonymize) to this endpoint. The server then applies the decision
 * and creates a new project with the processed data.
 * @route POST /api/auth/pii-decision
 * @auth Required (`unifiedAuth` middleware).
 * @input
 * - `req.body`: { tempFileId: string, decision: string, anonymizationConfig: object, projectData: object }
 * @process
 * 1. Retrieves the temporary file data using `tempFileId`.
 * 2. Verifies user authentication.
 * 3. Applies PII decisions (anonymization, etc.) using `UnifiedPIIProcessor`.
 * 4. Constructs a new project object with the final data and metadata.
 * 5. Creates the project using `storage.createProject`.
 * 6. Deletes the temporary file data.
 * @output
 * - Success: 200 { success: true, projectId: string, project: object, message: string }
 * - Error: 400, 401, or 500 with an error message.
 * @dependencies `storage`, `tempStore`, `UnifiedPIIProcessor`.
 */
router.post("/pii-decision", unifiedAuth, (req, res, next) => {
    if (req.get('Content-Type')?.includes('application/json')) {
      next();
    } else {
      upload.single('file')(req, res, next);
    }
  }, async (req, res) => {
    try {
        let isJsonRequest = req.get('Content-Type')?.includes('application/json');
        if (isJsonRequest) {
            const { tempFileId, decision, anonymizationConfig, projectData } = req.body;
            if (!tempFileId || !tempStore.get(tempFileId)) {
                return res.status(400).json({ success: false, error: "Temporary file data not found. Please upload the file again." });
            }
            const tempData = tempStore.get(tempFileId) as any;
            const { processedData, piiAnalysis, fileInfo, projectMetadata } = tempData;
            const user = req.user as any;
            if (!user) {
                return res.status(401).json({ success: false, error: "Authentication required." });
            }
            const userId = user.id;
            const hasTrialLimits = !user?.isPaid;
            let finalData, updatedSchema;
            if (anonymizationConfig?.bypassPII && anonymizationConfig?.overriddenColumns?.length > 0) {
                finalData = processedData.data;
                updatedSchema = processedData.schema;
            } else {
                const piiProcessingResult = await UnifiedPIIProcessor.processPIIData({
                    decision,
                    anonymizationConfig,
                    piiAnalysis,
                    originalData: processedData.data,
                    originalSchema: processedData.schema,
                    overriddenColumns: anonymizationConfig?.overriddenColumns || []
                });
                finalData = piiProcessingResult.finalData;
                updatedSchema = piiProcessingResult.updatedSchema;
            }
            processedData.schema = updatedSchema;
            const actualDecision = anonymizationConfig?.bypassPII ? 'bypassed' : decision;
            if (!fileInfo || !fileInfo.originalname || !fileInfo.size || !fileInfo.mimetype) {
                return res.status(500).json({ success: false, error: "File information is missing or invalid" });
            }
            const newProjectData = {
                userId: userId,
                name: (projectData || projectMetadata)?.name || "Uploaded Data",
                description: (projectData || projectMetadata)?.description || "",
                fileName: fileInfo.originalname,
                fileSize: fileInfo.size,
                fileType: fileInfo.mimetype,
                isTrial: hasTrialLimits,
                dataSource: "upload" as const,
                isPaid: false,
                schema: updatedSchema,
                recordCount: finalData.length,
                piiAnalysis: {
                    ...piiAnalysis,
                    userDecision: actualDecision,
                    overriddenColumns: anonymizationConfig?.overriddenColumns || [],
                    decisionTimestamp: new Date()
                },
                // data is not stored on the project directly anymore
            };
            const project = await storage.createProject(newProjectData);

            // Create a dataset and link it
            const dataset = await storage.createDataset({
                id: `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                ownerId: userId,
                sourceType: 'upload',
                originalFileName: fileInfo.originalname,
                mimeType: fileInfo.mimetype,
                fileSize: fileInfo.size,
                storageUri: `mem://${project.id}/${fileInfo.originalname}`,
                schema: updatedSchema,
                recordCount: finalData.length,
                data: finalData,
            });
            await storage.linkProjectToDataset(project.id, dataset.id);

            tempStore.delete(tempFileId);
            return res.json({ success: true, projectId: project.id, project: project, message: "Project created successfully with PII decision applied" });
        } else {
            const { name, description, questions, tempFileId, decision, anonymizationConfig } = req.body;
            if (!req.file) {
                return res.status(400).json({ success: false, error: "No file uploaded" });
            }
            const processedData = await FileProcessor.processFile(req.file.buffer, req.file.originalname, req.file.mimetype);
            let parsedQuestions: string[] = [];
            if (questions) {
                try {
                    parsedQuestions = typeof questions === 'string' ? JSON.parse(questions) : questions;
                } catch (e) {
                    parsedQuestions = questions.split('\n').filter((q: string) => q.trim());
                }
            }
            const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});
            const piiProcessingResult = await UnifiedPIIProcessor.processPIIData({
                decision,
                anonymizationConfig,
                piiAnalysis,
                originalData: processedData.data,
                originalSchema: processedData.schema,
                overriddenColumns: anonymizationConfig?.overriddenColumns || []
            });
            const finalData = piiProcessingResult.finalData;
            const updatedSchema = piiProcessingResult.updatedSchema;
            const project = await storage.createProject({
                userId: (req.user as any)?.id || 'anonymous',
                name: name.trim(),
                description: description || '',
                fileName: req.file.originalname,
                fileSize: req.file.size,
                fileType: req.file.mimetype,
                isTrial: false,
                dataSource: "upload" as const,
                isPaid: false,
                schema: updatedSchema,
                recordCount: processedData.recordCount,
                data: finalData,
                piiAnalysis: {
                    ...piiAnalysis,
                    userDecision: decision,
                    decisionTimestamp: new Date()
                },
            });
            res.json({ success: true, projectId: project.id, schema: updatedSchema, project: { ...project, preview: finalData.slice(0, 10) } });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to process PII decision" });
    }
});

// Trial PII decision endpoint
router.post("/trial-pii-decision", async (req, res) => {
    try {
        const { tempFileId, decision, anonymizationConfig = {} } = req.body;
        if (!decision) {
            return res.status(400).json({ success: false, error: "PII decision is required" });
        }
        const tempData = tempStore.get(tempFileId) as any;
        if (!tempData) {
            return res.status(400).json({ success: false, error: "Temporary file data not found. Please upload the file again." });
        }
        const { processedData, piiAnalysis, fileInfo } = tempData;
        if (anonymizationConfig?.bypassPII && anonymizationConfig?.overriddenColumns?.length > 0) {
            const finalData = processedData.data;
            const updatedSchema = processedData.schema;
            const trialResults = await PythonProcessor.processTrial(`trial_${Date.now()}`, {
                preview: finalData.slice(0, 100),
                schema: updatedSchema,
                recordCount: finalData.length,
            });
            if (!trialResults.success) {
                return res.status(500).json({ success: false, error: `Failed to process trial analysis: ${trialResults.error || 'Unknown error'}` });
            }
            tempStore.delete(tempFileId);
            return res.json({
                success: true,
                trialResults: {
                    schema: updatedSchema,
                    descriptiveAnalysis: trialResults.data,
                    basicVisualizations: trialResults.visualizations || [],
                    piiAnalysis: { ...piiAnalysis, userDecision: 'bypassed', overriddenColumns: anonymizationConfig.overriddenColumns, decisionTimestamp: new Date() },
                    piiDecision: 'bypassed',
                    recordCount: finalData.length
                },
                recordCount: finalData.length
            });
        }
        const piiProcessingResult = await UnifiedPIIProcessor.processPIIData({
            decision,
            anonymizationConfig,
            piiAnalysis,
            originalData: processedData.data,
            originalSchema: processedData.schema,
            overriddenColumns: anonymizationConfig?.overriddenColumns || []
        });
        const finalData = piiProcessingResult.finalData;
        const updatedSchema = piiProcessingResult.updatedSchema;
        const trialResults = await PythonProcessor.processTrial(`trial_${Date.now()}`, {
            preview: finalData.slice(0, 100),
            schema: updatedSchema,
            recordCount: finalData.length,
        });
        if (!trialResults.success) {
            return res.status(500).json({ success: false, error: `Failed to process trial analysis with PII decision: ${trialResults.error || 'Unknown error'}` });
        }
        tempStore.delete(tempFileId);
        res.json({
            success: true,
            trialResults: {
                schema: updatedSchema,
                descriptiveAnalysis: trialResults.data,
                basicVisualizations: trialResults.visualizations || [],
                piiAnalysis: { ...piiAnalysis, userDecision: decision, decisionTimestamp: new Date() },
                piiDecision: decision,
                recordCount: finalData.length
            },
            recordCount: finalData.length
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to process trial PII decision" });
    }
});

// Unique identifier selection endpoint
router.post("/unique-identifiers", async (req, res) => {
    try {
      const { projectId, identifiers } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const updatedProject = await storage.updateProject(projectId, {
        uniqueIdentifiers: identifiers
      });
      res.json({ success: true, project: updatedProject });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

export default router;
