import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import Stripe from "stripe";
import { storage } from "./storage";
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

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
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

      // Run Python trial analysis
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

    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google-drive/callback", async (req, res) => {
    try {
      const { code } = req.body;
      const tokens = await GoogleDriveService.getTokenFromCode(code);
      res.json({ tokens });
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: error.message });
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Data transformation endpoints
  app.post("/api/data-join", async (req, res) => {
    try {
      const { config } = req.body;
      const result = await DataTransformer.joinData(config);
      res.json({ success: true, result });
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Advanced analysis endpoints
  app.post("/api/step-by-step-analysis", async (req, res) => {
    try {
      const { projectId, config } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const projectData = []; // placeholder - implement actual data retrieval
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Main project upload endpoint with PII detection
  app.post("/api/projects/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: "No file uploaded" 
        });
      }

      const { name, description, questions, selectedSheet, headerRow, encoding } = req.body;
      
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

      // Perform PII analysis
      console.log('Starting PII analysis...');
      const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});
      console.log('PII analysis completed');

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

      // Create project
      const project = await storage.createProject({
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

    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/mcp-resources", (req, res) => {
    try {
      const resources = MCPAIService.getAllResources();
      res.json({ resources });
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Paid project upload endpoint
  app.post("/api/upload", upload.single('file'), async (req, res) => {
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
        
        // Return PII detection result - don't create project yet
        return res.json({
          success: false,
          requiresPIIDecision: true,
          tempFileId,
          piiResult: piiAnalysis,
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

    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
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

    } catch (error) {
      console.error("Error processing features:", error);
      res.status(500).json({ error: "Failed to process features" });
    }
  });

  // Get all projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getAllProjects();
      res.json({ projects });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Get specific project
  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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

    } catch (error) {
      console.error('Full analysis processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process full analysis'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}