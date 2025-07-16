import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import Stripe from "stripe";
import { storage } from "./hybrid-storage";
import { FileProcessor } from "./file-processor";
import { PythonProcessor } from "./python-processor";
import { PricingService } from "./pricing-service";
import { chimaridataAI } from "./chimaridata-ai";
import { 
  insertDataProjectSchema, 
  fileUploadResponseSchema,
  featureRequestSchema 
} from "@shared/schema";
import { PIIAnalyzer } from './pii-analyzer';
import { GoogleDriveService } from './google-drive-service';
import { DataTransformer } from './data-transformer';
import { AdvancedAnalyzer } from './advanced-analyzer';
import { MCPAIService } from './mcp-ai-service';
import { AnonymizationEngine } from './anonymization-engine';
import { UnifiedPIIProcessor } from './unified-pii-processor';
import bcrypt from 'bcrypt';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-05-28.basil',
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for paid features
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/json',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/octet-stream' // For files without proper mimetype
    ];
    
    const allowedExtensions = ['.json', '.csv', '.xlsx', '.xls', '.txt'];
    const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    // Allow if mimetype matches OR if extension is valid
    if (allowedTypes.includes(file.mimetype) || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload CSV, JSON, Excel, or text files.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize MCP AI Service
  MCPAIService.initializeMCPServer().catch(console.error);
  
  // Token store for authentication
  const tokenStore = new Map<string, string>();
  
  // Authentication middleware
  const ensureAuthenticated = async (req: any, res: any, next: any) => {
    try {
      // First try OAuth session authentication
      if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
      }
      
      // Then try token authentication
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const userId = tokenStore.get(token);
        if (userId) {
          const user = await storage.getUser(userId);
          if (user) {
            req.user = user;
            return next();
          }
        }
      }
      
      res.status(401).json({ error: "Authentication required" });
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(401).json({ error: "Authentication required" });
    }
  };
  
  // Temporary storage for trial file data
  const tempTrialData = new Map();

  // Enhanced trial upload endpoint with PII analysis
  app.post("/api/trial-upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: "No file uploaded" 
        });
      }

      const file = req.file;
      const freeTrialLimit = PricingService.getFreeTrialLimits();

      // Check file size limit for free trial
      if (file.size > freeTrialLimit.maxFileSize) {
        return res.status(400).json({
          success: false,
          error: `File size exceeds free trial limit of ${Math.round(freeTrialLimit.maxFileSize / (1024 * 1024))}MB`
        });
      }

      console.log(`Processing trial file: ${file.originalname} (${file.size} bytes)`);

      // Process the file
      const processedData = await FileProcessor.processFile(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      // Perform PII analysis
      const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});

      // Check if PII decision is required
      if (piiAnalysis.detectedPII && piiAnalysis.detectedPII.length > 0) {
        // Store temporary file info for PII decision
        const tempFileId = `trial_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store processed data temporarily
        tempTrialData.set(tempFileId, {
          processedData,
          piiAnalysis,
          fileInfo: {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype
          }
        });

        // Clean up old temp data (older than 1 hour)
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        for (const [key, value] of tempTrialData.entries()) {
          if (key.includes('trial_temp_') && parseInt(key.split('_')[2]) < oneHourAgo) {
            tempTrialData.delete(key);
          }
        }
        
        // Return PII detection result - don't run analysis yet
        return res.json({
          success: true,
          requiresPIIDecision: true,
          tempFileId,
          piiResult: piiAnalysis,
          sampleData: processedData.preview,
          fileInfo: {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype
          }
        });
      }

      // Run Python trial analysis if no PII detected
      const trialResults = await PythonProcessor.processTrial(
        `trial_${Date.now()}`,
        {
          preview: processedData.preview,
          schema: processedData.schema,
          recordCount: processedData.recordCount
        }
      );

      if (!trialResults.success) {
        return res.status(500).json({
          success: false,
          error: "Failed to process trial analysis"
        });
      }

      res.json({
        success: true,
        isTrial: true,
        trialResults: {
          schema: processedData.schema,
          descriptiveAnalysis: trialResults.data,
          basicVisualizations: trialResults.visualizations || [],
          piiAnalysis: piiAnalysis
        }
      });

    } catch (error: any) {
      console.error("Trial upload error:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to process trial file" 
      });
    }
  });

  // Google Drive integration endpoints
  app.get("/api/google-drive/auth-url", (req, res) => {
    try {
      const authUrl = GoogleDriveService.getAuthUrl();
      res.json({ authUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google-drive/callback", async (req, res) => {
    try {
      const { code } = req.body;
      const tokens = await GoogleDriveService.getTokenFromCode(code);
      res.json({ tokens });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google-drive/files", async (req, res) => {
    try {
      const { accessToken, refreshToken, query } = req.body;
      const driveService = new GoogleDriveService();
      await driveService.initializeWithToken(accessToken, refreshToken);
      
      const files = await driveService.listFiles(query);
      res.json({ files });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google-drive/download", async (req, res) => {
    try {
      const { accessToken, refreshToken, fileId } = req.body;
      const driveService = new GoogleDriveService();
      await driveService.initializeWithToken(accessToken, refreshToken);
      
      const fileBuffer = await driveService.downloadFile(fileId);
      const metadata = await driveService.getFileMetadata(fileId);
      
      // Process the downloaded file
      const processedData = await FileProcessor.processFile(
        fileBuffer,
        metadata.name,
        metadata.mimeType
      );

      // Perform PII analysis
      const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});

      res.json({
        success: true,
        data: processedData,
        piiAnalysis,
        metadata
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PII consent endpoint
  app.post("/api/pii-consent", async (req, res) => {
    try {
      const { projectId, consent, detectedPII } = req.body;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const updatedProject = await storage.updateProject(projectId, {
        piiAnalysis: {
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

  // PII decision endpoint - unified for both JSON and FormData
  app.post("/api/pii-decision", ensureAuthenticated, (req, res, next) => {
    // Apply upload middleware only for FormData requests
    if (req.get('Content-Type')?.includes('application/json')) {
      // Skip file upload middleware for JSON requests
      next();
    } else {
      // Apply upload middleware for FormData requests
      upload.single('file')(req, res, next);
    }
  }, async (req, res) => {
    try {
      console.log("PII Decision Request - Content-Type:", req.get('Content-Type'));
      console.log("PII Decision Request - Body:", req.body);
      console.log("PII Decision Request - File:", req.file);
      
      // Handle both JSON and FormData formats
      let isJsonRequest = req.get('Content-Type')?.includes('application/json');
      console.log("Is JSON request:", isJsonRequest);
      
      if (isJsonRequest) {
        // JSON request (unified approach) - use temporary file data
        const { tempFileId, decision, anonymizationConfig, projectData } = req.body;
        
        console.log("PII Decision Request Data:", {
          tempFileId,
          decision,
          anonymizationConfig,
          projectData
        });
        
        if (!tempFileId || !tempTrialData.has(tempFileId)) {
          return res.status(400).json({
            success: false,
            error: "Temporary file data not found. Please upload the file again."
          });
        }
        
        const tempData = tempTrialData.get(tempFileId);
        const { processedData, piiAnalysis, fileInfo } = tempData;
        
        let finalData, updatedSchema;
        
        // Check if PII should be bypassed entirely
        if (anonymizationConfig?.bypassPII && anonymizationConfig?.overriddenColumns?.length > 0) {
          // All PII was false positive - proceed without PII processing
          finalData = processedData.data;
          updatedSchema = processedData.schema;
          console.log("Bypassing PII processing - all columns marked as Not PII");
        } else {
          // Apply PII handling using unified processor
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
          console.log(UnifiedPIIProcessor.generateProcessingSummary(piiProcessingResult));
        }
        
        processedData.schema = updatedSchema;
        
        // Create project with processed data
        const projectMetadata = projectData || {};
        const actualDecision = anonymizationConfig?.bypassPII ? 'bypassed' : decision;
        
        // Validate fileInfo exists and has required fields
        if (!fileInfo || !fileInfo.originalname || !fileInfo.size || !fileInfo.mimetype) {
          console.error("FileInfo validation failed:", fileInfo);
          return res.status(500).json({
            success: false,
            error: "File information is missing or invalid"
          });
        }
        
        const newProjectData = {
          userId: req.user?.id || 'anonymous',
          name: projectMetadata.name || "Uploaded Data",
          description: projectMetadata.description || "",
          questions: projectMetadata.questions || [],
          fileName: fileInfo.originalname,
          fileSize: fileInfo.size,
          fileType: fileInfo.mimetype,
          data: finalData,
          schema: processedData.schema,
          recordCount: finalData.length,
          piiAnalysis: {
            ...piiAnalysis,
            userDecision: actualDecision,
            overriddenColumns: anonymizationConfig?.overriddenColumns || [],
            decisionTimestamp: new Date()
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        

        
        const project = await storage.createProject(newProjectData);
        
        // Clean up temporary data
        tempTrialData.delete(tempFileId);
        
        console.log("Returning project ID:", project.id);
        
        return res.json({
          success: true,
          projectId: project.id,
          project: project,
          message: "Project created successfully with PII decision applied"
        });
      } else {
        // FormData request (legacy approach)
        const { name, description, questions, tempFileId, decision, anonymizationConfig } = req.body;
        
        if (!req.file) {
          return res.status(400).json({ 
            success: false, 
            error: "No file uploaded" 
          });
        }

        // Process the uploaded file
        const processedData = await FileProcessor.processFile(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );

        // Parse questions
        let parsedQuestions = [];
        if (questions) {
          try {
            parsedQuestions = typeof questions === 'string' ? JSON.parse(questions) : questions;
          } catch (e) {
            parsedQuestions = questions.split('\n').filter(q => q.trim());
          }
        }

      // Apply PII handling using unified processor
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
      
      console.log(UnifiedPIIProcessor.generateProcessingSummary(piiProcessingResult));

      // Create project with processed data
      const project = await storage.createProject({
        userId: req.user?.id || 'anonymous',
        name: name.trim(),
        description: description || '',
        questions: parsedQuestions,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: new Date(),
        processed: true,
        schema: updatedSchema,
        recordCount: processedData.recordCount,
        data: finalData,
        isTrial: false,
        purchasedFeatures: [],
        piiAnalysis: {
          ...piiAnalysis,
          userDecision: decision,
          decisionTimestamp: new Date()
        }
      });

      console.log(`Project created successfully with PII decision: ${project.id}`);

      res.json({
        success: true,
        projectId: project.id,
        schema: updatedSchema, // Use the updated schema after PII processing
        project: {
          ...project,
          preview: finalData.slice(0, 10)
        }
      });
      }
    } catch (error: any) {
      console.error("PII decision processing error:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to process PII decision" 
      });
    }
  });

  // Trial PII decision endpoint - No authentication required for free trial
  app.post("/api/trial-pii-decision", async (req, res) => {
    try {
      const { tempFileId, decision, anonymizationConfig = {} } = req.body;
      
      console.log("Request body values:", {
        tempFileId: tempFileId,
        decision: decision,
        anonymizationConfig: anonymizationConfig
      });
      
      if (!decision) {
        return res.status(400).json({ 
          success: false, 
          error: "PII decision is required" 
        });
      }

      // Get temporary data from storage
      const tempData = tempTrialData.get(tempFileId);
      if (!tempData) {
        return res.status(400).json({ 
          success: false, 
          error: "Temporary file data not found. Please upload the file again." 
        });
      }

      const { processedData, piiAnalysis, fileInfo } = tempData;

      // Check if PII should be bypassed entirely
      if (anonymizationConfig?.bypassPII && anonymizationConfig?.overriddenColumns?.length > 0) {
        // All PII was false positive - proceed without PII processing
        const finalData = processedData.data;
        const updatedSchema = processedData.schema;
        
        // Generate trial results with original data
        const trialResults = await PythonProcessor.processTrial(
          `trial_${Date.now()}`,
          {
            preview: finalData.slice(0, 100), // Use first 100 rows as preview
            schema: updatedSchema,
            recordCount: finalData.length,
            piiDecision: 'bypassed'
          }
        );

        if (!trialResults.success) {
          console.error("Trial processing failed:", trialResults.error);
          return res.status(500).json({
            success: false,
            error: `Failed to process trial analysis: ${trialResults.error || 'Unknown error'}`
          });
        }

        // Clean up temporary data
        tempTrialData.delete(tempFileId);
        
        return res.json({
          success: true,
          trialResults: {
            schema: updatedSchema,
            descriptiveAnalysis: trialResults.data,
            basicVisualizations: trialResults.visualizations || [],
            piiAnalysis: {
              ...piiAnalysis,
              userDecision: 'bypassed',
              overriddenColumns: anonymizationConfig.overriddenColumns,
              decisionTimestamp: new Date()
            },
            piiDecision: 'bypassed',
            recordCount: finalData.length
          }
        });
      }

      // Apply PII handling using unified processor
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
      
      console.log(UnifiedPIIProcessor.generateProcessingSummary(piiProcessingResult));

      // Generate trial results with processed data
      const trialResults = await PythonProcessor.processTrial(
        `trial_${Date.now()}`,
        {
          preview: finalData.slice(0, 100), // Use first 100 rows as preview
          schema: updatedSchema,
          recordCount: finalData.length,
          piiDecision: decision
        }
      );

      if (!trialResults.success) {
        console.error("Trial processing failed:", trialResults.error);
        return res.status(500).json({
          success: false,
          error: `Failed to process trial analysis with PII decision: ${trialResults.error || 'Unknown error'}`
        });
      }

      // Clean up temporary data only after successful processing
      tempTrialData.delete(tempFileId);
      
      res.json({
        success: true,
        trialResults: {
          schema: updatedSchema,
          descriptiveAnalysis: trialResults.data,
          basicVisualizations: trialResults.visualizations || [],
          piiAnalysis: {
            ...piiAnalysis,
            userDecision: decision,
            decisionTimestamp: new Date()
          },
          piiDecision: decision,
          recordCount: finalData.length
        }
      });

    } catch (error: any) {
      console.error("Trial PII decision processing error:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to process trial PII decision" 
      });
    }
  });

  // Unique identifier selection endpoint
  app.post("/api/unique-identifiers", async (req, res) => {
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

  // Data transformation endpoints
  app.post("/api/data-join", async (req, res) => {
    try {
      const { config } = req.body;
      const result = await DataTransformer.joinData(config);
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/outlier-detection", async (req, res) => {
    try {
      const { projectId, config } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get project data (you would implement this based on your data storage)
      const projectData = []; // placeholder - implement actual data retrieval
      const result = await DataTransformer.detectOutliers(projectData, config);
      
      // Update project with outlier analysis
      await storage.updateProject(projectId, {
        outlierAnalysis: {
          method: config.method,
          threshold: config.threshold,
          outliers: result.outliers
        }
      });

      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/missing-data-analysis", async (req, res) => {
    try {
      const { projectId, config } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const projectData = []; // placeholder - implement actual data retrieval
      const result = await DataTransformer.analyzeMissingData(projectData, config);
      
      // Update project with missing data analysis
      await storage.updateProject(projectId, {
        missingDataAnalysis: {
          patterns: result.patterns,
          recommendations: result.recommendations
        }
      });

      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/normality-test", async (req, res) => {
    try {
      const { projectId, config } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const projectData = []; // placeholder - implement actual data retrieval
      const result = await DataTransformer.testNormality(projectData, config);
      
      // Update project with normality test results
      await storage.updateProject(projectId, {
        normalityTests: result.tests
      });

      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Advanced analysis endpoints
  app.post("/api/step-by-step-analysis", unifiedAuth, async (req, res) => {
    try {
      const { projectId, config } = req.body;
      console.log('Step-by-step analysis request:', { projectId, config });
      console.log('Authenticated user:', req.user?.username || 'No user');
      
      // Debug: Show all available projects
      const allProjects = await storage.getAllProjects();
      console.log('All available projects:', allProjects.map(p => ({ id: p.id, name: p.name })));
      
      const project = await storage.getProject(projectId);
      console.log('Project found:', project ? 'Yes' : 'No');
      
      if (!project) {
        console.log('Project not found. Available projects:', allProjects.map(p => ({ id: p.id, name: p.name })));
        return res.status(404).json({ 
          error: "Project not found", 
          message: "Project data may have been lost due to server restart. Please re-upload your data file.",
          availableProjects: allProjects.length,
          requestedId: projectId
        });
      }

      const projectData = project.data || []; // Get actual project data
      console.log('Project data length:', projectData.length);
      
      const result = await AdvancedAnalyzer.performStepByStepAnalysis(projectData, config);
      
      // Update project with step-by-step analysis
      await storage.updateProject(projectId, {
        stepByStepAnalysis: {
          question: config.question,
          targetVariable: config.targetVariable,
          multivariateVariables: config.multivariateVariables,
          analysisType: config.analysisType,
          results: result
        }
      });

      res.json({ success: true, result });
    } catch (error: any) {
      console.error('Step-by-step analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Main project upload endpoint with PII detection
  app.post("/api/projects/upload", ensureAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: "No file uploaded" 
        });
      }

      const { name, description, questions, selectedSheet, headerRow, encoding, piiHandled, anonymizationApplied, selectedColumns } = req.body;
      
      console.log('Request body values:', { name, piiHandled, anonymizationApplied });
      
      if (!name || !name.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: "Project name is required" 
        });
      }

      console.log(`Processing file: ${req.file.originalname} (${req.file.size} bytes)`);

      // Process the uploaded file
      const processedData = await FileProcessor.processFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        {
          selectedSheet,
          headerRow: headerRow ? parseInt(headerRow) : 0,
          encoding
        }
      );

      console.log('File processed successfully, rows:', processedData.recordCount);

      // Parse questions if provided
      let parsedQuestions = [];
      if (questions) {
        try {
          parsedQuestions = typeof questions === 'string' ? JSON.parse(questions) : questions;
        } catch (e) {
          // If JSON parsing fails, treat as plain text and split by newlines
          parsedQuestions = questions.split('\n').filter(q => q.trim());
        }
      }

      // Perform PII analysis
      console.log('Starting PII analysis...');
      const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});
      console.log('PII analysis completed:', piiAnalysis.detectedPII);
      
      // If PII detected and not handled, return for user consent
      if (piiAnalysis.detectedPII.length > 0 && !(piiHandled === "true" || piiHandled === true)) {
        console.log('PII detected, requesting user consent');
        
        // Store temporary file info for PII decision (unified approach)
        const tempFileId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store processed data temporarily
        tempTrialData.set(tempFileId, {
          processedData,
          piiAnalysis,
          fileInfo: {
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
          }
        });

        // Clean up old temp data (older than 1 hour)
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        for (const [key, value] of tempTrialData.entries()) {
          if (key.includes('temp_') && parseInt(key.split('_')[1]) < oneHourAgo) {
            tempTrialData.delete(key);
          }
        }
        
        return res.json({
          success: true,
          requiresPIIDecision: true,
          piiResult: piiAnalysis,
          tempFileId,
          name: name.trim(),
          questions: parsedQuestions,
          sampleData: processedData.preview,
          message: 'PII detected - user consent required'
        });
      }

      // Create project with actual data
      const project = await storage.createProject({
        userId: req.user?.id || 'anonymous',
        name: name.trim(),
        description: description || '',
        questions: parsedQuestions,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: new Date(),
        processed: true,
        schema: processedData.schema,
        recordCount: processedData.recordCount,
        data: processedData.data, // Store actual data rows
        isTrial: false,
        purchasedFeatures: [],
        piiAnalysis: piiAnalysis
      });

      console.log(`Project created successfully: ${project.id}`);

      res.json({
        success: true,
        projectId: project.id,
        project: {
          ...project,
          preview: processedData.preview
        },
        piiAnalysis
      });

    } catch (error: any) {
      console.error("File upload error:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to process file" 
      });
    }
  });

  // AI role and actions endpoints
  app.get("/api/ai-roles", (req, res) => {
    try {
      const roles = MCPAIService.getAvailableRoles();
      res.json({ roles });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/mcp-resources", (req, res) => {
    try {
      const resources = MCPAIService.getAllResources();
      res.json({ resources });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-request", async (req, res) => {
    try {
      const { projectId, role, actions, context } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const projectData = []; // placeholder - implement actual data retrieval
      const result = await MCPAIService.processAIRequest({
        role,
        actions,
        data: projectData,
        context
      });

      // Update project with AI results
      await storage.updateProject(projectId, {
        aiRole: role.name,
        aiActions: actions.map(a => a.type),
        aiInsights: result
      });

      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Paid project upload endpoint
  app.post("/api/upload", ensureAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: "No file uploaded" 
        });
      }

      const file = req.file;
      const description = req.body.description || '';

      console.log(`Processing file: ${file.originalname} (${file.size} bytes)`);

      // Process the file
      const processedData = await FileProcessor.processFile(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      // Perform PII analysis
      const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});

      // Check if PII consent is required
      if (piiAnalysis.detectedPII && piiAnalysis.detectedPII.length > 0) {
        // Store temporary file info for PII consent
        const tempFileId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store processed data temporarily
        tempTrialData.set(tempFileId, {
          processedData,
          piiAnalysis,
          fileInfo: {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype
          }
        });

        // Clean up old temp data (older than 1 hour)
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        for (const [key, value] of tempTrialData.entries()) {
          if (key.includes('temp_') && parseInt(key.split('_')[1]) < oneHourAgo) {
            tempTrialData.delete(key);
          }
        }
        
        // Return PII detection result - don't create project yet
        return res.json({
          success: true,
          requiresPIIDecision: true,
          tempFileId,
          piiResult: piiAnalysis,
          sampleData: processedData.preview,
          name: file.originalname.replace(/\.[^/.]+$/, ""),
          fileInfo: {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype
          }
        });
      }

      // Create project in storage
      const project = await storage.createProject({
        userId: req.user?.id || 'anonymous',
        name: file.originalname.replace(/\.[^/.]+$/, ""),
        fileName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        description,
        schema: processedData.schema,
        recordCount: processedData.recordCount,
        isTrial: false,
        purchasedFeatures: [],
        piiAnalysis: piiAnalysis
      });

      // Mark as processed
      await storage.updateProject(project.id, { processed: true });

      console.log(`File processed successfully: ${project.id}`);

      res.json({
        success: true,
        projectId: project.id,
        project: {
          ...project,
          preview: processedData.preview
        }
      });

    } catch (error: any) {
      console.error("File upload error:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to process file" 
      });
    }
  });

  // Get pricing information
  app.get("/api/pricing", async (req, res) => {
    try {
      const features = PricingService.getFeatureDescriptions();
      const discounts = PricingService.getDiscountInfo();
      const freeTrialLimits = PricingService.getFreeTrialLimits();

      res.json({
        features,
        discounts,
        freeTrialLimits
      });
    } catch (error: any) {
      console.error("Error fetching pricing:", error);
      res.status(500).json({ error: "Failed to fetch pricing information" });
    }
  });

  // Calculate pricing for selected features
  app.post("/api/calculate-price", async (req, res) => {
    try {
      const { features } = req.body;
      
      if (!Array.isArray(features) || features.length === 0) {
        return res.status(400).json({ error: "Features array is required" });
      }

      const validation = PricingService.validateFeatures(features);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: "Invalid features", 
          invalidFeatures: validation.invalidFeatures 
        });
      }

      const pricing = PricingService.calculatePrice(features);
      res.json(pricing);
    } catch (error: any) {
      console.error("Error calculating price:", error);
      res.status(500).json({ error: "Failed to calculate price" });
    }
  });

  // Create payment intent
  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      const { features, projectId } = req.body;
      
      const pricing = PricingService.calculatePrice(features);
      const amount = Math.round(pricing.total * 100); // Convert to cents

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        metadata: {
          projectId,
          features: JSON.stringify(features)
        }
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        amount: pricing.total,
        breakdown: pricing
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  // Handle payment completion and project creation
  app.post("/api/complete-payment", async (req, res) => {
    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ error: "Payment Intent ID is required" });
      }

      // Verify payment
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: "Payment not completed" });
      }

      const { projectId, features } = paymentIntent.metadata;
      const selectedFeatures = JSON.parse(features);

      // Check if project exists (for upgrade flow)
      let project = await storage.getProject(projectId);
      
      if (project) {
        // Update existing project with paid features
        const updatedProject = await storage.updateProject(projectId, {
          isPaid: true,
          selectedFeatures,
          paymentIntentId,
          upgradedAt: new Date()
        });
        
        res.json({
          success: true,
          projectId: project.id,
          project: updatedProject,
          features: selectedFeatures
        });
      } else {
        // Project doesn't exist - this shouldn't happen in upgrade flow
        console.error(`Project ${projectId} not found for payment completion`);
        res.status(404).json({ 
          error: "Project not found", 
          message: "The project may have been deleted or the payment is invalid" 
        });
      }
    } catch (error: any) {
      console.error("Error completing payment:", error);
      res.status(500).json({ error: "Failed to complete payment" });
    }
  });

  // Create guided analysis payment intent
  app.post("/api/create-guided-analysis-payment", unifiedAuth, async (req, res) => {
    try {
      const { analysisConfig, pricing } = req.body;
      
      if (!analysisConfig || !pricing) {
        return res.status(400).json({ error: 'Analysis configuration and pricing are required' });
      }

      const amount = Math.round(pricing.total * 100); // Convert to cents

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        metadata: {
          type: 'guided_analysis',
          analysisType: analysisConfig.analysisType,
          projectId: analysisConfig.projectId,
          userId: req.user.id,
          variableCount: analysisConfig.selectedVariables.length.toString(),
          deliverablesCount: analysisConfig.deliverables.length.toString(),
          // timeline field removed
        }
      });

      // Store analysis configuration for post-payment processing
      const analysisId = `analysis_${Date.now()}_${req.user.id}`;
      await storage.storeGuidedAnalysisOrder(analysisId, {
        userId: req.user.id,
        config: analysisConfig,
        pricing: pricing,
        paymentIntentId: paymentIntent.id,
        status: 'pending_payment',
        createdAt: new Date().toISOString()
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        analysisId: analysisId,
        amount: pricing.total,
        configuration: analysisConfig,
        pricing: pricing
      });
    } catch (error: any) {
      console.error('Guided analysis payment creation error:', error);
      res.status(500).json({ error: 'Failed to create guided analysis payment' });
    }
  });

  // Execute guided analysis after payment
  app.post("/api/execute-guided-analysis", unifiedAuth, async (req, res) => {
    try {
      const { analysisId, paymentIntentId } = req.body;
      
      if (!analysisId) {
        return res.status(400).json({ error: 'Analysis ID is required' });
      }

      // Get the analysis order
      const analysisOrder = await storage.getGuidedAnalysisOrder(analysisId);
      if (!analysisOrder) {
        return res.status(404).json({ error: 'Analysis order not found' });
      }

      // Verify payment if provided
      if (paymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
          return res.status(400).json({ error: "Payment not completed" });
        }
      }

      // Get the project
      const project = await storage.getProject(analysisOrder.config.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Update analysis order status
      await storage.updateGuidedAnalysisOrder(analysisId, {
        status: 'processing',
        startedAt: new Date().toISOString()
      });

      // Execute the analysis based on the configuration
      const analysisConfig = analysisOrder.config;
      const results: any = {};

      try {
        // Execute the specific analysis type
        switch (analysisConfig.analysisType) {
          case 'anova':
          case 'ANOVA':
            results.analysis = await PythonProcessor.runAnova(
              analysisConfig.projectId,
              {
                dependentVariable: analysisConfig.selectedVariables[0],
                independentVariables: analysisConfig.selectedVariables.slice(1),
                significanceLevel: 0.05
              }
            );
            break;

          case 'ancova':
          case 'ANCOVA':
            results.analysis = await PythonProcessor.runAncova(
              analysisConfig.projectId,
              {
                dependentVariable: analysisConfig.selectedVariables[0],
                independentVariables: analysisConfig.selectedVariables.slice(1),
                covariates: analysisConfig.selectedVariables.slice(2),
                significanceLevel: 0.05
              }
            );
            break;

          case 'regression':
          case 'multiple_regression':
            results.analysis = await PythonProcessor.runRegression(
              analysisConfig.projectId,
              {
                dependentVariable: analysisConfig.selectedVariables[0],
                independentVariables: analysisConfig.selectedVariables.slice(1),
                analysisType: 'multiple_regression'
              }
            );
            break;

          case 'machine_learning':
          case 'feature_importance':
          case 'ml_prediction':
            results.analysis = await PythonProcessor.runMLAnalysis(
              analysisConfig.projectId,
              {
                targetVariable: analysisConfig.targetVariable || analysisConfig.selectedVariables[0],
                features: analysisConfig.featureVariables || analysisConfig.selectedVariables.slice(1),
                mlType: analysisConfig.mlType || 'prediction',
                algorithm: analysisConfig.algorithm || 'random_forest',
                testSize: analysisConfig.testSize || 0.2,
                crossValidation: analysisConfig.crossValidation || 5,
                evaluationMetrics: analysisConfig.evaluationMetrics || ['accuracy', 'precision', 'recall', 'f1_score']
              }
            );
            break;

          default:
            // Default comprehensive analysis
            results.analysis = await PythonProcessor.analyzeData(
              analysisConfig.projectId,
              { schema: project.schema, recordCount: project.recordCount },
              'comprehensive',
              { variables: analysisConfig.selectedVariables }
            );
            break;
        }

        // Generate AI insights
        results.insights = await chimaridataAI.generateInsights(
          {
            schema: project.schema,
            recordCount: project.recordCount,
            fileName: project.fileName,
            analysisResults: results.analysis
          },
          'guided_analysis'
        );

        // Update analysis order with results
        await storage.updateGuidedAnalysisOrder(analysisId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          results: results
        });

        res.json({
          success: true,
          analysisId: analysisId,
          status: 'completed',
          results: results
        });

      } catch (analysisError) {
        console.error('Analysis execution error:', analysisError);
        
        // Update analysis order with error
        await storage.updateGuidedAnalysisOrder(analysisId, {
          status: 'failed',
          error: analysisError.message,
          failedAt: new Date().toISOString()
        });

        res.status(500).json({
          error: 'Analysis execution failed',
          details: analysisError.message
        });
      }

    } catch (error: any) {
      console.error('Guided analysis execution error:', error);
      res.status(500).json({ error: 'Failed to execute guided analysis' });
    }
  });

  // Get guided analysis results
  app.get("/api/guided-analysis/:analysisId", async (req, res) => {
    try {
      const { analysisId } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const analysisOrder = await storage.getGuidedAnalysisOrder(analysisId);
      if (!analysisOrder) {
        return res.status(404).json({ error: 'Analysis not found' });
      }

      // Verify ownership
      if (analysisOrder.userId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        analysisId,
        status: analysisOrder.status,
        config: analysisOrder.config,
        pricing: analysisOrder.pricing,
        results: analysisOrder.results || null,
        createdAt: analysisOrder.createdAt,
        startedAt: analysisOrder.startedAt,
        completedAt: analysisOrder.completedAt,
        error: analysisOrder.error
      });

    } catch (error: any) {
      console.error('Get guided analysis error:', error);
      res.status(500).json({ error: 'Failed to get guided analysis' });
    }
  });

  // Process feature request after payment
  app.post("/api/process-features", async (req, res) => {
    try {
      const { projectId, features, paymentIntentId } = req.body;

      // Verify payment if provided
      if (paymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
          return res.status(400).json({ error: "Payment not completed" });
        }
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Update project with purchased features
      await storage.updateProject(projectId, {
        purchasedFeatures: [...(project.purchasedFeatures || []), ...features]
      });

      // Process each feature
      const results: any = {};

      for (const feature of features) {
        console.log(`Processing feature: ${feature} for project ${projectId}`);
        
        try {
          switch (feature) {
            case 'transformation':
              // For now, return transformation options - actual processing would be triggered by user
              results[feature] = {
                status: 'available',
                message: 'Data transformation tools are now available'
              };
              break;

            case 'analysis':
              // Perform statistical analysis
              const analysisResult = await PythonProcessor.analyzeData(
                projectId,
                { schema: project.schema, recordCount: project.recordCount },
                'comprehensive',
                {}
              );
              results[feature] = analysisResult;
              break;

            case 'visualization':
              // Generate visualizations
              const vizResult = await PythonProcessor.visualizeData(
                projectId,
                { schema: project.schema, recordCount: project.recordCount },
                ['distribution', 'correlation', 'trends'],
                {}
              );
              results[feature] = vizResult;
              break;

            case 'ai_insights':
              // Generate AI insights
              const aiResult = await chimaridataAI.generateInsights(
                {
                  schema: project.schema,
                  recordCount: project.recordCount,
                  fileName: project.fileName
                },
                'comprehensive_analysis'
              );
              results[feature] = aiResult;
              break;
          }
        } catch (featureError) {
          console.error(`Error processing feature ${feature}:`, featureError);
          results[feature] = {
            success: false,
            error: featureError.message
          };
        }
      }

      res.json({
        success: true,
        projectId,
        features,
        results
      });

    } catch (error: any) {
      console.error("Error processing features:", error);
      res.status(500).json({ error: "Failed to process features" });
    }
  });

  // Get all projects for authenticated user
  app.get("/api/projects", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        // Return empty projects for unauthenticated users instead of 401
        return res.json({ projects: [] });
      }
      
      const projects = await storage.getProjectsByUser(userId);
      res.json({ projects });
    } catch (error: any) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Get specific project for authenticated user
  app.get("/api/projects/:id", unifiedAuth, async (req, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      console.log(`Fetching project: ${projectId} for user: ${userId}`);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        console.log(`Project ${projectId} not found`);
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Check if project belongs to user
      if (project.userId !== userId) {
        console.log(`Project ${projectId} does not belong to user ${userId}`);
        return res.status(403).json({ error: "Access denied" });
      }
      
      console.log(`Project ${projectId} found successfully`);
      res.json(project);
    } catch (error: any) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const success = await storage.deleteProject(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // AI providers status
  app.get("/api/ai-status", async (req, res) => {
    try {
      const providers = chimaridataAI.getAvailableProviders();
      res.json({ 
        available: providers,
        primary: providers[0] || 'none'
      });
    } catch (error: any) {
      console.error("Error fetching AI status:", error);
      res.status(500).json({ error: "Failed to fetch AI status" });
    }
  });

  // Trial upgrade endpoint
  app.post("/api/upgrade-trial", async (req, res) => {
    try {
      const { projectId, selectedFeatures, paymentIntentId } = req.body;
      
      if (!projectId || !selectedFeatures || !paymentIntentId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment not completed' });
      }

      // Update project with paid features
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const updatedProject = await storage.updateProject(projectId, {
        isPaid: true,
        selectedFeatures,
        paymentIntentId,
        upgradedAt: new Date()
      });

      res.json({
        success: true,
        project: updatedProject,
        features: selectedFeatures
      });
    } catch (error: any) {
      console.error('Trial upgrade error:', error);
      res.status(500).json({ error: 'Failed to upgrade trial' });
    }
  });

  // Process full analysis with paid features
  app.post("/api/process-full-analysis", upload.single('file'), async (req, res) => {
    try {
      const { features, paymentIntentId } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!features || !paymentIntentId) {
        return res.status(400).json({ error: 'Features and payment verification required' });
      }

      // Verify payment
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment not verified' });
      }

      const selectedFeatures = JSON.parse(features);

      // Process file with smart header detection
      const processedData = await FileProcessor.processFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      // Create project
      const project = await storage.createProject({
        userId: req.user?.id || 'anonymous',
        name: req.file.originalname.replace(/\.[^/.]+$/, ""),
        fileName: req.file.originalname,
        fileSize: req.file.size,
        schema: processedData.schema,
        recordCount: processedData.recordCount,
        isPaid: true,
        selectedFeatures,
        paymentIntentId
      });

      // Process with Python based on selected features - enhanced multivariate analysis
      const config = {
        include_transformation: selectedFeatures.includes('transformation'),
        include_analysis: selectedFeatures.includes('analysis'),
        include_visualizations: selectedFeatures.includes('visualization'),
        include_ai_insights: selectedFeatures.includes('ai_insights'),
        include_multivariate: true,
        include_group_analysis: true,
        is_paid: true
      };

      const analysisResults = await PythonProcessor.processData(
        processedData,
        config,
        project.id
      );

      // Update project with results
      await storage.updateProject(project.id, {
        processed: true,
        analysisResults
      });

      res.json({
        success: true,
        projectId: project.id,
        results: analysisResults,
        features: selectedFeatures
      });

    } catch (error: any) {
      console.error('Full analysis processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process full analysis'
      });
    }
  });

  // Anonymization API routes
  app.get('/api/anonymization/techniques', (req, res) => {
    try {
      const techniques = AnonymizationEngine.getTechniques();
      res.json({ techniques });
    } catch (error: any) {
      console.error('Error getting techniques:', error);
      res.status(500).json({ error: 'Failed to get techniques' });
    }
  });

  app.post('/api/anonymization/preview', async (req, res) => {
    try {
      const { projectId, columnMappings, sampleSize } = req.body;
      
      if (!projectId || !columnMappings) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const data = project.data || [];
      const preview = AnonymizationEngine.previewAnonymization(data, columnMappings, sampleSize);
      
      res.json(preview);
    } catch (error: any) {
      console.error('Error generating preview:', error);
      res.status(500).json({ error: 'Failed to generate preview' });
    }
  });

  app.post('/api/anonymization/apply', async (req, res) => {
    try {
      const { projectId, columnMappings } = req.body;
      
      if (!projectId || !columnMappings) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const data = project.data || [];
      const anonymizedData = AnonymizationEngine.anonymizeDataset(data, columnMappings);
      
      // Update project with anonymized data
      await storage.updateProject(projectId, {
        data: anonymizedData,
        metadata: {
          ...project.metadata,
          anonymized: true,
          anonymizationDate: new Date().toISOString(),
          anonymizationTechniques: columnMappings
        }
      });

      res.json({ 
        success: true, 
        message: 'Data anonymized successfully',
        recordsProcessed: anonymizedData.length
      });
    } catch (error: any) {
      console.error('Error applying anonymization:', error);
      res.status(500).json({ error: 'Failed to apply anonymization' });
    }
  });

  // Authentication routes


  // Unified authentication middleware that handles both OAuth and token-based auth
  async function unifiedAuth(req: any, res: any, next: any) {
    // First check if already authenticated via OAuth/passport session
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    
    // Check for Authorization header with Bearer token (email-based auth)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        // Check if token exists in our token store
        const userId = tokenStore.get(token);
        
        if (userId) {
          // Verify user still exists
          const user = await storage.getUser(userId);
          
          if (user) {
            // Set user on request object to match OAuth format
            req.user = { id: user.id };
            req.userId = user.id; // Also set direct userId for compatibility
            return next();
          }
        }
      } catch (error) {
        console.error('Token validation error:', error);
      }
    }
    
    // If neither authentication method worked, return 401
    res.status(401).json({ error: 'Authentication required' });
  }

  // OAuth providers endpoint
  app.get('/api/auth/providers', (req, res) => {
    // Return available OAuth providers - for now only Google is fully configured
    const providers = [
      {
        name: 'google',
        authUrl: '/api/auth/google',
        displayName: 'Google',
        enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
      }
    ];
    res.json(providers);
  });

  // Email Authentication Routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      // Validate input
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      // Password constraints: minimum 8 characters, at least one number, at least one capital letter
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      if (!/[0-9]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one number" });
      }
      if (!/[A-Z]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one capital letter" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists with this email" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Generate verification token
      const crypto = await import('crypto');
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Create user
      const user = await storage.createUser({
        email,
        hashedPassword,
        firstName,
        lastName,
        provider: "local",
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires
      });
      
      // Send verification email (log for development)
      const verificationUrl = `${req.protocol}://${req.get('host')}/verify-email?token=${verificationToken}`;
      console.log(`
===============================================
EMAIL VERIFICATION REQUIRED
===============================================
To: ${email}
Subject: Verify your ChimariData account

Please click the link below to verify your email:
${verificationUrl}

This link will expire in 24 hours.
===============================================
      `);
      
      // Generate simple auth token
      const authToken = crypto.randomBytes(32).toString('hex');
      
      // Store token in our simple token store
      tokenStore.set(authToken, user.id);
      
      res.status(201).json({
        success: true,
        message: "Account created successfully. Please check your email for verification.",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified
        },
        token: authToken
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Check if user is using email/password authentication
      if (user.provider !== "local" || !user.password) {
        return res.status(400).json({ error: "This account uses social login. Please use the sign-in button." });
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Generate simple auth token
      const crypto = await import('crypto');
      const authToken = crypto.randomBytes(32).toString('hex');
      
      // Store token in our simple token store
      tokenStore.set(authToken, user.id);
      
      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified
        },
        token: authToken
      });
      
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        storage: 'operational',
        ai: 'available'
      }
    });
  });

  // Get current user (unified auth - handles both token and OAuth session)
  app.get('/api/auth/user', async (req, res) => {
    try {
      let user = null;
      
      // First try OAuth session authentication
      if (req.user) {
        user = req.user;
      } else {
        // Try token authentication
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const userId = tokenStore.get(token);
          if (userId) {
            user = await storage.getUser(userId);
          }
        }
      }
      
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified
        }
      });
      
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    try {
      // Handle token logout
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        tokenStore.delete(token);
      }
      
      // Handle OAuth logout
      if (req.logout) {
        req.logout((err) => {
          if (err) {
            console.error('OAuth logout error:', err);
          }
        });
      }
      
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Email verification endpoint
  app.get('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }
      
      // Find user by verification token
      const user = await storage.getUserByVerificationToken(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }
      
      // Check if token is expired
      if (user.emailVerificationExpires && new Date() > user.emailVerificationExpires) {
        return res.status(400).json({ error: "Verification token has expired" });
      }
      
      // Update user as verified
      await storage.updateUser(user.id, {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null
      });
      
      res.json({
        success: true,
        message: "Email verified successfully"
      });
      
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: "Email verification failed" });
    }
  });

  // Google OAuth Routes
  app.get('/api/auth/google', (req, res) => {
    // For now, redirect to a simple OAuth implementation
    // In production, this would use passport-google-oauth20
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return res.status(500).json({ error: "Google OAuth not configured" });
    }
    
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const scope = 'openid email profile';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code`;
    
    res.redirect(authUrl);
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, error } = req.query;
      
      if (error) {
        return res.redirect('/?error=oauth_error');
      }
      
      if (!code) {
        return res.redirect('/?error=no_code');
      }
      
      // For now, redirect to success page
      // In production, this would exchange the code for tokens and create/login user
      res.redirect('/?oauth=success');
      
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/?error=oauth_callback_error');
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}