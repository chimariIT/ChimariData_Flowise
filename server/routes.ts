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
  
  // Free trial upload endpoint
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
          basicVisualizations: trialResults.visualizations || []
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
        purchasedFeatures: []
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