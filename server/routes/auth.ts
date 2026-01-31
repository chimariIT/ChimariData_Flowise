// server/routes/auth.ts
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { Router } from 'express';
import multer from "multer";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { storage } from '../services/storage';
import { tokenStorage } from '../token-storage';
import { EmailService } from '../email-service';

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
import type { InsertDataProject, JourneyType } from "../../shared/schema.js";
import { getAuthHeader } from '../utils/auth-headers';

const VALID_PROJECT_JOURNEYS: JourneyType[] = ["non-tech", "business", "technical", "consultation", "custom"];

const normalizeProjectJourneyType = (value: unknown): JourneyType => {
    return VALID_PROJECT_JOURNEYS.includes(value as JourneyType) ? (value as JourneyType) : "non-tech";
};

const normalizeExpressUser = (user: any): Record<string, any> => ({
    ...user,
    role: user?.role ?? undefined,
    technicalLevel: user?.technicalLevel ?? undefined,
    preferredJourney: user?.preferredJourney ?? undefined
});

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
        // Dynamically return configured OAuth providers based on environment variables
        const providers: Array<{ id: string; name: string; icon: string }> = [];

        if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
            providers.push({ id: 'google', name: 'Google', icon: 'google' });
        }
        if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
            providers.push({ id: 'github', name: 'GitHub', icon: 'github' });
        }
        if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
            providers.push({ id: 'microsoft', name: 'Microsoft', icon: 'microsoft' });
        }
        if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
            providers.push({ id: 'apple', name: 'Apple', icon: 'apple' });
        }

        res.json(providers);
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

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (!normalizedEmail || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Get user by email
        const dbStart = Date.now();
        const user = await storage.getUserByEmail(normalizedEmail);
        const dbTime = Date.now() - dbStart;

        if (user && user.hashedPassword) {
            // Validate password
            const bcryptStart = Date.now();
            const isValidPassword = await bcrypt.compare(password, user.hashedPassword);
            const bcryptTime = Date.now() - bcryptStart;

            if (isValidPassword) {
                // Check email verification in production
                const isProduction = process.env.NODE_ENV === 'production';
                if (isProduction && !user.emailVerified) {
                    return res.status(403).json({
                        error: "Email not verified",
                        message: "Please verify your email address before logging in. Check your inbox for the verification link.",
                        requiresEmailVerification: true
                    });
                }

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
                        email: normalizedEmail, // Consider privacy implications
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
                console.warn(`⚠️  Login failed for ${normalizedEmail}: password mismatch`);
                res.status(401).json({ error: "Invalid credentials" });
            }
        } else {
            if (!user) {
                console.warn(`⚠️  Login attempt for unknown email ${normalizedEmail}`);
            } else if (!user.hashedPassword) {
                console.warn(`⚠️  Login attempt for ${normalizedEmail} without a password on record (provider=${user.provider})`);
            }
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
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (!normalizedEmail || !firstName || !lastName || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Check if user already exists
        const existingUser = await storage.getUserByEmail(normalizedEmail);
        if (existingUser) {
            return res.status(409).json({ error: "User already exists" });
        }

        // Hash password with 12 rounds (OWASP 2025 recommendation)
        const hashedPassword = await bcrypt.hash(password, 12);

        // Check environment for email verification
        const isProduction = process.env.NODE_ENV === 'production';

        // Generate verification token for production
        const verificationToken = isProduction ? crypto.randomBytes(32).toString('hex') : null;
        const verificationExpires = isProduction ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null; // 24 hours

        const user = await storage.createUser({
            email: normalizedEmail,
            firstName,
            lastName,
            hashedPassword,
            provider: 'local',
            subscriptionTier: 'trial',
            emailVerified: !isProduction, // Auto-verify in development, require verification in production
            emailVerificationToken: verificationToken,
            emailVerificationExpires: verificationExpires
        });

        // Send verification email in production only
        if (isProduction && verificationToken) {
            const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
            const host = req.get('host');
            const verificationUrl = `${protocol}://${host}/api/auth/verify-email?token=${verificationToken}`;

            await EmailService.sendVerificationEmail({
                to: normalizedEmail,
                firstName,
                verificationUrl
            });

            console.log(`📧 Verification email sent to ${normalizedEmail}`);
        } else {
            console.log(`🔓 DEV MODE: User ${normalizedEmail} auto-verified (email verification bypassed)`);
        }

        // Registration successful - do NOT auto-login
        // User must explicitly log in after registration
        res.json({
            success: true,
            message: isProduction
                ? 'Account created successfully. Please check your email to verify your account before logging in.'
                : 'Account created successfully. Please log in.',
            requiresEmailVerification: isProduction,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName
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
        const authHeader = getAuthHeader(req);
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

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
    try {
        const authHeader = getAuthHeader(req);
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const existingToken = authHeader.substring(7).trim();
        if (!existingToken) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const refreshedToken = tokenStorage.refreshToken(existingToken);
        if (!refreshedToken) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const decoded = tokenStorage.validateToken(refreshedToken);

        res.json({
            success: true,
            token: refreshedToken,
            expiresAt: decoded?.exp ? decoded.exp * 1000 : null
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
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
        // Debug: Log all headers for upload requests
        const isUploadRequest = req.path === '/upload' || req.url.includes('/upload') || req.url.includes('/projects/upload');
        const derivedAuthHeader = getAuthHeader(req);
        if (isUploadRequest) {
            console.log('🔍 Upload request authentication check:', {
                path: req.path,
                url: req.url,
                method: req.method,
                hasAuthHeader: !!derivedAuthHeader,
                authHeaderPreview: derivedAuthHeader?.substring(0, 30),
                rawAuthorizationHeader: req.headers.authorization?.substring(0, 30),
                forwardedAuthorizationHeader: typeof req.headers['x-forwarded-authorization'] === 'string'
                    ? (req.headers['x-forwarded-authorization'] as string).substring(0, 30)
                    : undefined,
                hasSession: !!req.isAuthenticated?.(),
                contentType: req.headers['content-type']?.substring(0, 50),
                allHeaderKeys: Object.keys(req.headers).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('authorization'))
            });
        }

        // Check session-based authentication first
        if (req.isAuthenticated && req.isAuthenticated()) {
            // If user is already attached, ensure identifiers are normalized then proceed
            if (req.user) {
                const sessionUser: any = req.user;
                const resolvedId = sessionUser.id || sessionUser.userId;

                if (resolvedId) {
                    sessionUser.userId = resolvedId;
                    req.userId = resolvedId;
                }

                if (isUploadRequest) {
                    console.log('✅ Session-based authentication successful for upload');
                }
                return next();
            }

            // Session authenticated but user not attached - this should not happen with proper Passport config
            // but we'll handle it gracefully
            console.warn('Session authenticated but user not attached, checking bearer token as fallback');
        }

        // Check Bearer token authentication
        // Debug: Log ALL headers to see what's actually coming in
        console.log('🔍 [AUTH DEBUG] All request headers:', JSON.stringify(req.headers, null, 2));
        console.log('🔍 [AUTH DEBUG] Derived authorization header:', derivedAuthHeader);
        console.log('🔍 [AUTH DEBUG] Raw authorization variants:', {
            authorization: req.headers.authorization,
            forwarded: req.headers['x-forwarded-authorization']
        });
        console.log('🔍 [AUTH DEBUG] Headers keys:', Object.keys(req.headers));

        const authHeader = derivedAuthHeader;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7).trim();

            // Additional validation: ensure token isn't empty after extraction
            if (!token || token === '') {
                console.error('❌ Authentication failed: Empty token after Bearer extraction', {
                    authHeaderLength: authHeader.length,
                    extractedTokenLength: token.length
                });
                return res.status(401).json({ error: "Authentication required" });
            }

            const tokenData = tokenStorage.validateToken(token);
            if (tokenData) {
                const user = await storage.getUser(tokenData.userId);
                if (user) {
                    req.user = normalizeExpressUser(user);
                    req.userId = user.id;
                    if (isUploadRequest) {
                        console.log('✅ Bearer token authentication successful for upload:', {
                            userId: user.id,
                            email: user.email
                        });
                    }
                    return next();
                } else {
                    console.error('❌ Authentication failed: User not found for token', {
                        userId: tokenData.userId
                    });
                }
            } else {
                console.error('❌ Authentication failed: Invalid token', {
                    tokenPreview: token.substring(0, 20) + '...',
                    tokenLength: token.length
                });
            }
        } else {
            console.error('❌ Authentication failed: No valid authorization header', {
                hasAuthHeader: !!authHeader,
                authHeaderType: typeof authHeader,
                authHeaderValue: authHeader ? authHeader.substring(0, 50) : 'null'
            });
        }

        res.status(401).json({ error: "Authentication required" });
    } catch (error) {
        console.error('❌ Authentication error:', error);
        res.status(401).json({ error: "Authentication required" });
    }
};

// Logout endpoint - must be after ensureAuthenticated definition
router.post("/logout", ensureAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any)?.id;

        // Clear server-side session if using sessions
        if (req.session) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                }
            });
        }

        console.log(`✅ User ${userId} logged out`);
        res.json({ success: true, message: "Logged out successfully" });
    } catch (error: any) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed', details: error.message });
    }
});

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
        const authHeader = getAuthHeader(req);
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const tokenData = tokenStorage.validateToken(token);
                if (tokenData) {
                    const user = await storage.getUser(tokenData.userId);
                    if (user) {
                        const normalizedUser = normalizeExpressUser(user) as any;
                        normalizedUser.userId = user.id;
                        req.user = normalizedUser;
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
    if (process.env.NODE_ENV !== 'test') {
        return res.status(404).json({ error: 'Not found' });
    }
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
                    subscriptionTier: 'enterprise', // Full access for testing
                    subscriptionStatus: 'active',
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

        // Ensure test user has active enterprise tier for full access
        if (user && (user.subscriptionTier !== 'enterprise' || user.subscriptionStatus !== 'active')) {
            await storage.updateUser(testUserId, {
                subscriptionTier: 'enterprise',
                subscriptionStatus: 'active',
                isPaid: true
            } as any);
            user = await storage.getUser(testUserId);
        }

        // ✅ TypeScript fix: Add null check after storage.getUser()
        if (!user) {
            throw new Error('Failed to retrieve test user after update');
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
                } as any);
                finalData = (piiProcessingResult as any).finalData;
                updatedSchema = (piiProcessingResult as any).updatedSchema;
            }
            processedData.schema = updatedSchema;
            const actualDecision = anonymizationConfig?.bypassPII ? 'bypassed' : decision;
            if (!fileInfo || !fileInfo.originalname || !fileInfo.size || !fileInfo.mimetype) {
                return res.status(500).json({ success: false, error: "File information is missing or invalid" });
            }
            const newProjectData: InsertDataProject = {
                userId: userId,
                journeyType: normalizeProjectJourneyType((projectData || projectMetadata)?.journeyType),
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

            const { descriptiveStats, datasetSummary, relationships } = FileProcessor.createDataProfile(finalData || [], updatedSchema || {});
            // Build columnTypes summary from schema
            const columnTypes: Record<string, string[]> = {};
            for (const [colName, colSchema] of Object.entries(updatedSchema || {})) {
                const type = (colSchema as any)?.type || 'string';
                if (!columnTypes[type]) columnTypes[type] = [];
                columnTypes[type].push(colName);
            }
            const ingestionMetadata = {
                recordCount: finalData.length,
                fileSize: fileInfo.size,
                fileType: fileInfo.mimetype,
                dataDescription: datasetSummary.overview,
                datasetSummary,
                descriptiveStats,
                qualityMetrics: processedData.qualityMetrics,
                relationships,
                columnTypes,
                generatedAt: new Date().toISOString()
            };

            // Create a dataset and link it
            const dataset = await storage.createDataset({
                id: `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                userId: userId,
                sourceType: 'upload',
                originalFileName: fileInfo.originalname,
                mimeType: fileInfo.mimetype,
                fileSize: fileInfo.size,
                storageUri: `mem://${project.id}/${fileInfo.originalname}`,
                schema: updatedSchema,
                recordCount: finalData.length,
                data: finalData,
                ingestionMetadata
            });
            await storage.linkProjectToDataset(project.id, dataset.id);

            tempStore.delete(tempFileId);
            return res.json({
                success: true,
                projectId: project.id,
                project,
                message: "Project created successfully with PII decision applied",
                dataDescription: datasetSummary.overview,
                datasetSummary,
                descriptiveStats,
                qualityMetrics: processedData.qualityMetrics,
                relationships
            });
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
            } as any);
            const finalData = (piiProcessingResult as any).finalData;
            const updatedSchema = (piiProcessingResult as any).updatedSchema;
            const { descriptiveStats, datasetSummary, relationships } = FileProcessor.createDataProfile(finalData || [], updatedSchema || {});
            const project = await storage.createProject({
                userId: (req.user as any)?.id || 'anonymous',
                journeyType: normalizeProjectJourneyType(req.body?.journeyType),
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
            res.json({
                success: true,
                projectId: project.id,
                schema: updatedSchema,
                project: { ...project, preview: finalData.slice(0, 10) },
                dataDescription: datasetSummary.overview,
                datasetSummary,
                descriptiveStats,
                qualityMetrics: processedData.qualityMetrics,
                relationships
            });
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
        } as any);
        const finalData = (piiProcessingResult as any).finalData;
        const updatedSchema = (piiProcessingResult as any).updatedSchema;
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

// Email verification endpoint
/**
 * @summary Verifies a user's email address using a verification token.
 * @description Users receive a verification email with a link containing a token.
 * This endpoint validates the token and marks the email as verified.
 * @route GET /api/auth/verify-email?token=...
 * @auth Not required.
 * @input
 * - `req.query.token`: Verification token from email link
 * @process
 * 1. Validates token is present and non-empty
 * 2. Finds user with matching verification token
 * 3. Checks if token has expired (24 hours)
 * 4. Updates user to verified status and clears token
 * @output
 * - Success: 200 { success: true, message: string }
 * - Error: 400 { error: string, canResend?: boolean }
 * @dependencies `storage`.
 */
router.get("/verify-email", async (req, res) => {
    try {
        const { token } = req.query;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({
                error: "Verification token is required"
            });
        }

        // Find user with this verification token
        const user = await storage.getUserByVerificationToken(token);

        if (!user) {
            return res.status(400).json({
                error: "Invalid or expired verification token",
                canResend: true
            });
        }

        // Check if token has expired
        if (user.emailVerificationExpires && new Date() > user.emailVerificationExpires) {
            return res.status(400).json({
                error: "Verification token has expired. Please request a new verification email.",
                canResend: true
            });
        }

        // Update user to verified
        await storage.updateUser(user.id, {
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpires: null
        });

        console.log(`✅ Email verified for user: ${user.email}`);

        res.json({
            success: true,
            message: "Email verified successfully! You can now log in."
        });
    } catch (error: any) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: "Verification failed" });
    }
});

// Resend verification email endpoint
/**
 * @summary Resends a verification email to a user.
 * @description Generates a new verification token and sends a new email.
 * Used when the original verification link expires or is lost.
 * @route POST /api/auth/resend-verification
 * @auth Not required.
 * @input
 * - `req.body.email`: User's email address
 * @process
 * 1. Validates email is provided
 * 2. Finds user by email
 * 3. Checks if already verified
 * 4. Generates new verification token with 24-hour expiration
 * 5. Sends new verification email via SendGrid
 * @output
 * - Success: 200 { success: true, message: string }
 * - Error: 400 or 500 { error: string }
 * @dependencies `storage`, `EmailService`.
 */
router.post("/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await storage.getUserByEmail(email);

        if (!user) {
            // Don't reveal if email exists for security
            return res.json({
                success: true,
                message: "If the email exists and is not verified, a verification link has been sent."
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({
                error: "Email is already verified. You can log in now."
            });
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await storage.updateUser(user.id, {
            emailVerificationToken: verificationToken,
            emailVerificationExpires: verificationExpires
        });

        const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
        const host = req.get('host');
        const verificationUrl = `${protocol}://${host}/api/auth/verify-email?token=${verificationToken}`;

        await EmailService.sendVerificationEmail({
            to: email,
            firstName: user.firstName || 'User',
            verificationUrl
        });

        console.log(`📧 Verification email resent to ${email}`);

        res.json({
            success: true,
            message: "Verification email sent. Please check your inbox."
        });
    } catch (error: any) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: "Failed to resend verification email" });
    }
});

/**
 * @summary Creates or updates a user account to have admin privileges.
 * @description Development/testing endpoint to bootstrap admin accounts.
 * This endpoint allows creating or upgrading a user to admin status without authentication.
 * ⚠️ SECURITY: Should be disabled or restricted in production environments.
 * @route POST /api/auth/setup-admin
 * @auth Not required (for development/testing only).
 * @input
 * - `req.body.email`: Admin email address
 * - `req.body.password`: Admin password (will be hashed)
 * - `req.body.firstName`: Admin first name
 * - `req.body.lastName`: Admin last name
 * @process
 * 1. Validates required fields (email, password, firstName, lastName)
 * 2. Checks if user exists by email
 * 3. If exists: Updates user to admin status with enterprise tier
 * 4. If not exists: Creates new admin user with enterprise tier
 * 5. Hashes password with bcrypt (10 rounds)
 * 6. Generates JWT token for immediate authentication
 * 7. Returns token and user object
 * @output
 * - Success: 200 { success: true, token: string, user: User }
 * - Error: 400 or 500 { success: false, error: string }
 * @dependencies `storage`, `tokenStorage`, `bcrypt`.
 */
router.post("/setup-admin", async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (!normalizedEmail || !password || !firstName || !lastName) {
            return res.status(400).json({
                success: false,
                error: "Email, password, firstName, and lastName are required"
            });
        }

        if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_ADMIN_SETUP) {
            return res.status(403).json({
                success: false,
                error: "Admin setup is disabled in production"
            });
        }

        // Check if user already exists
        const existingUser = await storage.getUserByEmail(normalizedEmail);
        const hashedPassword = await bcrypt.hash(password, 12);
        let isNewUser = false;

        let user;
        if (existingUser) {
            // Update existing user to admin
            console.log(`🔄 Updating existing user ${normalizedEmail} to admin status`);
            user = await storage.updateUser(existingUser.id, {
                firstName,
                lastName,
                hashedPassword,
                isAdmin: true,
                subscriptionTier: 'enterprise',
                emailVerified: true, // Auto-verify admin accounts
                role: 'admin'
            }) as any;
        } else {
            // Create new admin user
            isNewUser = true;
            console.log(`✨ Creating new admin user: ${normalizedEmail}`);
            user = await storage.createUser({
                email: normalizedEmail,
                firstName,
                lastName,
                hashedPassword,
                provider: 'local',
                subscriptionTier: 'enterprise',
                emailVerified: true, // Auto-verify admin accounts
                isAdmin: true,
                role: 'admin'
            } as any);
        }

        // Generate JWT token for immediate authentication
        const token = tokenStorage.generateToken(user.id, user.email);
        console.log(`✅ Admin account ${isNewUser ? 'created' : 'updated'} successfully: ${normalizedEmail}`);

        res.json({
            success: true,
            message: isNewUser ? "Admin account created successfully" : "Admin account updated successfully",
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                isAdmin: true,
                subscriptionTier: user.subscriptionTier || 'enterprise',
                role: 'admin'
            }
        });
    } catch (error: any) {
        console.error('Admin setup error:', error);
        res.status(500).json({
            success: false,
            error: "Admin setup failed",
            details: error.message
        });
    }
});

export default router;
