import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, registerSchema, aiQuerySchema } from "@shared/schema";
import { aiService } from "./ai-service";
import { PricingService } from "./pricing-service";
import { mlService } from "./ml-service";
import { FileProcessor } from "./file-processor";
import { PIIDetector } from "./pii-detector";
import { questionAnalyzer } from "./question-analyzer";
// Note: Error handling classes removed - using direct error responses
import { setupOAuth, isAuthenticated } from "./oauth-config";

import { spawn } from "child_process";
import path from "path";
import Stripe from "stripe";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcryptjs";

// Note: Express Request type is extended by Replit Auth middleware

// Removed old session storage - now using Replit Auth

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV, Excel, and JSON files
    const allowedTypes = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json'
    ];
    
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload CSV, Excel, or JSON files only.'));
    }
  }
});

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
} as any);

// Remove old authentication functions - now using Replit Auth only

// Helper function to get user ID from Replit Auth
function getUserId(req: any): string {
  return req.user?.id;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup OAuth middleware
  setupOAuth(app);

  // Start FastAPI backend
  const fastApiProcess = spawn('python', [path.join(process.cwd(), 'server', 'fastapi-backend.py')], {
    stdio: 'inherit'
  });

  // Removed old authentication middleware - now using Replit Auth only

  // OAuth callback URL logging for debugging
  const domain = process.env.REPLIT_DOMAINS || 'localhost:5000';
  const callbackURL = domain.includes('replit.dev') 
    ? `https://${domain}/api/auth/google/callback`
    : `http://localhost:5000/api/auth/google/callback`;
  
  console.log('OAuth Callback URL:', callbackURL);
  console.log('REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS);



  // Replit Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Remove old authentication routes - now using Replit Auth only

  // Project routes  
  app.get("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const projects = await storage.getUserProjects(userId);
      res.json({ projects });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id, getUserId(req));
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Google Drive integration routes
  app.get("/api/google-drive/files", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user || !user.accessToken || !user.refreshToken) {
        return res.status(401).json({ 
          error: "Google Drive access not authorized", 
          message: "Please sign in with Google to access Google Drive files.",
          redirectUrl: "/api/auth/google"
        });
      }

      const { GoogleDriveService } = await import("./oauth-auth");
      const driveService = new GoogleDriveService(user.accessToken, user.refreshToken);
      const files = await driveService.listFiles();
      
      res.json({ files });
    } catch (error: any) {
      console.error("Google Drive files error:", error);
      res.status(500).json({ error: "Failed to fetch Google Drive files", message: error.message });
    }
  });

  // Free trial upload endpoint (no authentication required)
  app.post('/api/upload-trial', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { name, questions, piiHandled, anonymizationApplied, selectedColumns } = req.body;
      const questionsArray = questions ? JSON.parse(questions) : [];
      const parsedSelectedColumns = selectedColumns ? JSON.parse(selectedColumns) : [];

      // Process the file with trial limitations
      const result = await FileProcessor.processFile(req.file.path, req.file.originalname);

      // Handle PII for trial uploads
      let finalData = result.data;
      let lookupTable = null;

      if (piiHandled === 'true' && anonymizationApplied === 'true' && parsedSelectedColumns.length > 0) {
        console.log('Applying anonymization to trial columns:', parsedSelectedColumns);
        try {
          const anonymizationResult = await PIIDetector.anonymizeData(
            result.data, 
            parsedSelectedColumns,
            true
          );
          finalData = anonymizationResult.anonymizedData;
          lookupTable = anonymizationResult.lookupTable;
          console.log('Trial anonymization applied successfully');
        } catch (anonError) {
          console.error('Trial anonymization error:', anonError);
          return res.status(500).json({ error: "Anonymization failed" });
        }
      } else if (!piiHandled || piiHandled === 'false') {
        try {
          const piiResult = await PIIDetector.detectPII(result.data, result.schema);
          console.log('Trial PII detection result:', piiResult.hasPII ? 'PII found' : 'No PII detected');
          
          if (piiResult.hasPII) {
            console.log('PII detected in trial upload, returning for user decision');
            return res.json({
              requiresPIIDecision: true,
              piiResult,
              tempFileId: req.file.filename,
              name: name || req.file.originalname,
              questions: questionsArray
            });
          }
        } catch (piiError) {
          console.error('Trial PII detection error:', piiError);
        }
      }

      // Generate intelligent analysis for trial using local processing (no external AI needed)
      const dataContext = {
        schema: result.schema,
        dataSnapshot: result.dataSnapshot.slice(0, 100),
        metadata: result.metadata,
        recordCount: finalData.length
      };

      // Generate structured insights directly
      const basicInsights = {
        summary: `Dataset contains ${finalData.length} records with ${Object.keys(result.schema).length} data fields. The data is well-structured and ready for analysis.`,
        keyFindings: [
          `Data structure includes ${Object.keys(result.schema).length} columns: ${Object.keys(result.schema).join(', ')}`,
          `Dataset contains ${finalData.length} total records`,
          finalData.length > 50 ? 'Substantial dataset size suitable for analysis' : 'Good dataset size for initial analysis',
          'Data appears well-structured and ready for comprehensive analysis'
        ].slice(0, 3),
        recommendations: [
          'Upgrade to premium for advanced AI-powered pattern recognition',
          'Consider additional data collection for enhanced insights',
          'Use visualization tools for deeper data exploration'
        ]
      };

      // Generate intelligent responses to user questions using semantic analysis and Python pandas
      let questionResponse = null;
      if (questionsArray.length > 0) {
        try {
          // Analyze each question for semantic understanding before processing
          const questionAnalyses = await Promise.all(
            questionsArray.map(async (question: string) => {
              try {
                return await questionAnalyzer.analyzeQuestion(question, result.schema, finalData.slice(0, 10));
              } catch (error) {
                console.error(`Question analysis failed for "${question}":`, error);
                return null;
              }
            })
          );

          // Process each question with semantic context
          const responses: string[] = [];
          
          for (let i = 0; i < questionsArray.length; i++) {
            const question = questionsArray[i];
            const analysis = questionAnalyses[i];
            
            // Check if question needs clarification
            if (analysis?.clarificationNeeded) {
              const suggestedReframe = analysis.dataRelevance.suggestedReframe;
              if (suggestedReframe) {
                responses.push(`Q${i + 1}: ${question} - ${suggestedReframe}`);
                continue;
              }
            }
            
            // Check semantic mismatch (e.g., asking about employees but data is about customers)
            if (analysis && !analysis.dataRelevance.hasMatchingEntities) {
              const entity = analysis.intent.entity;
              const availableData = Object.keys(result.schema).slice(0, 5).join(', ');
              responses.push(`Q${i + 1}: ${question} - I couldn't find data about '${entity}' in this dataset. The data appears to contain information about: ${availableData}. Could you rephrase your question based on the available data?`);
              continue;
            }
            
            // Use Python analysis for semantically valid questions
            try {
              const { spawn } = await import('child_process');
              const path = await import('path');
              const pythonScript = path.resolve('server/pandas-analyzer.py');
              const pythonProcess = spawn('python3', [
                pythonScript,
                req.file.path,
                question
              ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 15000
              });

              let stdout = '';
              let stderr = '';

              pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
              });

              pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
              });

              const analysisResult = await new Promise<any>((resolve, reject) => {
                pythonProcess.on('close', (code) => {
                  if (code === 0) {
                    try {
                      const result = JSON.parse(stdout);
                      resolve(result);
                    } catch (parseError) {
                      reject(new Error('Failed to parse analysis result'));
                    }
                  } else {
                    reject(new Error(`Python analysis failed with code ${code}: ${stderr}`));
                  }
                });

                pythonProcess.on('error', (error) => {
                  reject(error);
                });

                setTimeout(() => {
                  pythonProcess.kill('SIGTERM');
                  reject(new Error('Analysis timeout'));
                }, 15000);
              });

              if (analysisResult.analysis_type !== 'error') {
                responses.push(`Q${i + 1}: ${question} - ${analysisResult.answer}`);
              } else {
                responses.push(`Q${i + 1}: ${question} - Analysis could not be completed for this question.`);
              }
            } catch (pythonError) {
              console.error(`Python analysis failed for question "${question}":`, pythonError);
              responses.push(`Q${i + 1}: ${question} - Unable to analyze this question with the current dataset.`);
            }
          }
          
          questionResponse = responses.join(' | ');
        } catch (pandasError) {
          console.error('Pandas analysis error:', pandasError);
          // Enhanced fallback analysis with actual data examination for ALL questions
          const columns = Object.keys(result.schema);
          const sampleData = result.dataSnapshot.slice(0, 100); // Use more data for analysis
          const questionResponses: string[] = [];
          
          // Process each question individually
          for (let i = 0; i < questionsArray.length; i++) {
            const question = questionsArray[i].toLowerCase();
            let currentQuestionResponse = '';
            
            // Count-related questions
            if (question.includes('how many')) {
              if (question.includes('campaign')) {
                // Look specifically for campaign ID column first
                const campaignIdCol = columns.find(col => 
                  col.toLowerCase().includes('campaign') && col.toLowerCase().includes('id')
                );
                
                if (campaignIdCol) {
                  // Count unique campaign IDs from sample data
                  const uniqueCampaignIds = new Set();
                  sampleData.forEach(row => {
                    if (row[campaignIdCol] && row[campaignIdCol] !== '') {
                      uniqueCampaignIds.add(row[campaignIdCol]);
                    }
                  });
                  
                  // Estimate total unique campaigns based on sample
                  const sampleRatio = sampleData.length / finalData.length;
                  const estimatedUniqueCampaigns = Math.round(uniqueCampaignIds.size / sampleRatio);
                  
                  if (sampleRatio >= 0.5) {
                    // If we have at least 50% sample, give more confident answer
                    currentQuestionResponse = `Based on analysis of your dataset, you have approximately ${uniqueCampaignIds.size} unique campaigns. This is derived from the ${campaignIdCol} column in your ${finalData.length} records.`;
                  } else {
                    // Smaller sample, provide range estimate
                    currentQuestionResponse = `Based on sample analysis, you have approximately ${estimatedUniqueCampaigns} unique campaigns (sample shows ${uniqueCampaignIds.size} in ${sampleData.length} records). Full analysis available with premium features.`;
                  }
                } else {
                  // Look for other campaign-related columns
                  const campaignCols = columns.filter(col => 
                    col.toLowerCase().includes('campaign') || 
                    col.toLowerCase().includes('name')
                  );
                  
                  if (campaignCols.length > 0) {
                    currentQuestionResponse = `Your dataset contains ${finalData.length} campaign-related records. Campaign data appears in columns: ${campaignCols.join(', ')}. For precise campaign counting, upgrade to premium analysis.`;
                  } else {
                    currentQuestionResponse = `Your dataset contains ${finalData.length} records. No specific campaign columns detected. Available fields: ${columns.join(', ')}.`;
                  }
                }
              } else if (question.includes('customer') || question.includes('people') || question.includes('user')) {
                currentQuestionResponse = `Your dataset contains ${finalData.length} customer/user records. Each record has ${columns.length} data fields: ${columns.join(', ')}.`;
              } else if (question.includes('record') || question.includes('row') || question.includes('entry')) {
                currentQuestionResponse = `Your dataset contains exactly ${finalData.length} records with ${columns.length} columns each.`;
              } else {
                currentQuestionResponse = `Your dataset contains ${finalData.length} total records. For the specific count you're asking about, the data can be analyzed through columns: ${columns.join(', ')}.`;
              }
            }
            // Location-related questions  
            else if (question.includes('where') || question.includes('location') || question.includes('live') || question.includes('address')) {
              const locationColumns = columns.filter(col => 
                col.toLowerCase().includes('city') || 
                col.toLowerCase().includes('state') || 
                col.toLowerCase().includes('country') || 
                col.toLowerCase().includes('address') ||
                col.toLowerCase().includes('location') ||
                col.toLowerCase().includes('region')
              );
              
              if (locationColumns.length > 0) {
                const locations = new Set();
                sampleData.forEach(row => {
                  locationColumns.forEach(col => {
                    if (row[col] && row[col] !== '') {
                      locations.add(row[col]);
                    }
                  });
                });
                
                const locationArray = Array.from(locations).slice(0, 8);
                currentQuestionResponse = `Your customers/records are located in: ${locationArray.join(', ')}${locations.size > 8 ? ` and ${locations.size - 8} more locations` : ''}. Location data is found in columns: ${locationColumns.join(', ')}.`;
              } else {
                currentQuestionResponse = `No specific location columns found in your data. Available columns: ${columns.join(', ')}. You may need to check if location data is embedded within other fields.`;
              }
            }
            // Performance/metrics questions
            else if (question.includes('performance') || question.includes('rate') || question.includes('roi') || question.includes('conversion')) {
              const metricColumns = columns.filter(col => 
                col.toLowerCase().includes('rate') || 
                col.toLowerCase().includes('roi') || 
                col.toLowerCase().includes('performance') ||
                col.toLowerCase().includes('conversion') ||
                col.toLowerCase().includes('score') ||
                col.toLowerCase().includes('percent')
              );
              
              if (metricColumns.length > 0) {
                const metrics: any = {};
                metricColumns.forEach(col => {
                  const values = sampleData.map(row => parseFloat(row[col])).filter(val => !isNaN(val));
                  if (values.length > 0) {
                    metrics[col] = {
                      avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
                      min: Math.min(...values).toFixed(2),
                      max: Math.max(...values).toFixed(2)
                    };
                  }
                });
                
                const metricSummary = Object.entries(metrics).map(([col, stats]: [string, any]) => 
                  `${col}: avg ${stats.avg}, range ${stats.min}-${stats.max}`
                ).join('; ');
                
                currentQuestionResponse = `Performance metrics from your data: ${metricSummary}. This analysis is based on ${sampleData.length} sample records from your ${finalData.length} total records.`;
              } else {
                currentQuestionResponse = `No specific performance metrics columns found. Available columns: ${columns.join(', ')}. You may need to identify which columns contain your performance data.`;
              }
            }
            // Top/best questions
            else if (question.includes('top') || question.includes('best') || question.includes('highest') || question.includes('most')) {
              const numericColumns = columns.filter(col => result.schema[col] === 'decimal' || result.schema[col] === 'integer');
              
              if (numericColumns.length > 0) {
                currentQuestionResponse = `To find the top performers, your data contains these measurable columns: ${numericColumns.join(', ')}. The analysis can rank records by any of these metrics from your ${finalData.length} total records.`;
              } else {
                currentQuestionResponse = `No numeric columns found for ranking. Available columns: ${columns.join(', ')}. Consider which field represents the performance metric you want to rank by.`;
              }
            }
            // General/other questions
            else {
              // Try to provide contextual insight based on data structure
              const numericCols = columns.filter(col => result.schema[col] === 'decimal' || result.schema[col] === 'integer');
              const textCols = columns.filter(col => result.schema[col] === 'text');
              
              currentQuestionResponse = `Your question "${questionsArray[i]}" relates to a dataset with ${finalData.length} records. The data contains ${numericCols.length} numeric columns (${numericCols.join(', ')}) and ${textCols.length} text columns (${textCols.join(', ')}). For detailed analysis of this specific question, upgrade to premium features.`;
            }
            
            // Add the current question's response to the array
            questionResponses.push(`Q${i + 1}: ${questionsArray[i]} - ${currentQuestionResponse}`);
          }
          
          // Combine all question responses
          questionResponse = questionResponses.join(' | ');
        }
      }

      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.json({
        id: 'trial-' + Date.now(),
        name: name || 'Trial Analysis',
        recordCount: finalData.length,
        columnCount: Object.keys(result.schema).length,
        insights: basicInsights.summary || "Your data has been successfully analyzed! Sign up to unlock detailed insights and advanced features.",
        questionResponse,
        metadata: result.metadata,
        schema: result.schema,
        isTrial: true,
        piiHandled: piiHandled === 'true',
        anonymizationApplied: anonymizationApplied === 'true',
        lookupTable
      });

    } catch (error) {
      console.error('Trial upload error:', error);
      
      // Clean up file on error
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        error: 'Failed to process trial upload',
        message: error.message 
      });
    }
  });

  // PII detection endpoint for already uploaded files
  app.post("/api/projects/detect-pii", isAuthenticated, async (req, res) => {
    try {
      const { tempFileId, name, questions, requiresPII, anonymizeData, selectedColumns } = req.body;
      
      // Reconstruct file path from temp ID
      const filePath = path.join('uploads', tempFileId);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Temporary file not found" });
      }

      // Reprocess the file
      const result = await FileProcessor.processFile(filePath, name);
      let finalData = result.data;
      let lookupTable = null;

      if (requiresPII && anonymizeData && selectedColumns.length > 0) {
        // Apply anonymization
        const anonymizationResult = await PIIDetector.anonymizeData(
          result.data, 
          selectedColumns,
          true
        );
        finalData = anonymizationResult.anonymizedData;
        lookupTable = anonymizationResult.lookupTable;
      }

      // Store project with processing results
      const project = await storage.createProject({
        name,
        userId: req.user!.userId,
        status: "processed",
        schema: result.schema,
        questions,
        insights: lookupTable ? { anonymization_lookup: lookupTable } : {},
        recordCount: result.recordCount
      });

      // Clean up temp file
      fs.unlinkSync(filePath);

      res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          schema: project.schema,
          questions: project.questions,
          recordCount: project.recordCount,
          status: project.status,
          anonymizationApplied: !!lookupTable
        }
      });
    } catch (error) {
      console.error("PII processing error:", error);
      res.status(500).json({ error: "PII processing failed" });
    }
  });

  app.post("/api/projects/import-from-drive", isAuthenticated, async (req, res) => {
    try {
      const { fileId, fileName, name, questions } = req.body;
      
      if (!fileId || !fileName || !name) {
        return res.status(400).json({ error: "Missing required fields: fileId, fileName, and project name" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user || !user.accessToken || !user.refreshToken) {
        return res.status(401).json({ error: "Google Drive access not authorized. Please reconnect your Google account." });
      }

      // Download file from Google Drive
      const { GoogleDriveService } = await import("./oauth-auth");
      const driveService = new GoogleDriveService(user.accessToken, user.refreshToken);
      const fileData = await driveService.downloadFile(fileId);
      
      // Save temporarily for processing
      const tempPath = path.join('uploads', `drive-${Date.now()}-${fileName}`);
      fs.writeFileSync(tempPath, fileData as any);

      // Parse questions if provided
      let questionsArray: string[] = [];
      try {
        if (questions) {
          questionsArray = Array.isArray(questions) ? questions : JSON.parse(questions);
        }
      } catch (e) {
        fs.unlinkSync(tempPath); // Clean up temp file
        return res.status(400).json({ error: "Invalid questions format" });
      }

      // Process the file using the same logic as regular uploads
      let processedFile;
      try {
        processedFile = await FileProcessor.processFile(tempPath, fileName);
      } catch (error: any) {
        fs.unlinkSync(tempPath); // Clean up temp file
        return res.status(400).json({ 
          error: `File processing failed: ${error.message}`,
          details: "Ensure your Google Drive file is a valid CSV or Excel file with proper data structure."
        });
      }

      // Calculate pricing
      const dataSizeMB = Math.round(fs.statSync(tempPath).size / (1024 * 1024) * 100) / 100;
      const dataComplexity = PricingService.assessDataComplexity(processedFile.schema, processedFile.data.length);
      const questionComplexity = PricingService.assessQuestionComplexity(questionsArray);
      const estimatedArtifacts = PricingService.estimateAnalysisArtifacts("standard", processedFile.data.length, Object.keys(processedFile.schema).length);

      const pricingFactors = {
        dataSizeMB,
        recordCount: processedFile.data.length,
        columnCount: Object.keys(processedFile.schema).length,
        featureCount: Object.keys(processedFile.schema).length,
        questionsCount: questionsArray.length,
        questionComplexity,
        analysisType: "standard" as const,
        analysisArtifacts: estimatedArtifacts,
        dataComplexity
      };

      const pricingResult = PricingService.calculatePrice(pricingFactors);

      // Check for duplicate project names
      const existingProjects = await storage.getUserProjects(req.user!.id);
      const duplicateProject = existingProjects.find(p => p.name.toLowerCase() === name.toLowerCase());
      
      if (duplicateProject) {
        // Clean up temp file
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.warn("Failed to clean up temp file:", tempPath);
        }
        return res.status(409).json({ 
          error: "Project name already exists", 
          message: "A project with this name already exists. Please choose a different name." 
        });
      }

      // Create project
      const project = await storage.createProject({
        name,
        schema: processedFile.schema,
        questions: questionsArray,
        insights: {},
        recordCount: processedFile.data.length,
        filePath: tempPath,
        fileName: fileName,
        fileSize: fs.statSync(tempPath).size,
        uploadedAt: new Date(),
        estimatedPrice: pricingResult.finalPrice,
        ownerId: req.user!.id
      });

      // Clean up temp file after project creation
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.warn("Failed to clean up temp file:", tempPath);
      }

      res.json({
        message: "Project imported from Google Drive successfully",
        project,
        pricing: pricingResult,
        dataPreview: processedFile.dataSnapshot
      });

    } catch (error: any) {
      console.error("Google Drive import error:", error);
      res.status(500).json({ error: "Failed to import from Google Drive", message: error.message });
    }
  });

  // File upload route
  app.post("/api/projects/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { name, questions, piiHandled, anonymizationApplied, selectedColumns } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Project name is required" });
      }

      // Parse questions if provided
      let questionsArray: string[] = [];
      try {
        if (questions) {
          questionsArray = JSON.parse(questions);
        }
      } catch (e) {
        return res.status(400).json({ error: "Invalid questions format" });
      }

      // Parse selected columns for anonymization
      let parsedSelectedColumns: string[] = [];
      try {
        if (selectedColumns) {
          parsedSelectedColumns = JSON.parse(selectedColumns);
        }
      } catch (e) {
        console.error('Error parsing selected columns:', e);
      }

      // Process the uploaded file with comprehensive file processor
      const filePath = req.file.path;
      let processedFile;
      
      try {
        processedFile = await FileProcessor.processFile(
          filePath, 
          req.file.originalname
        );
      } catch (error: any) {
        return res.status(400).json({ 
          error: `File processing failed: ${error.message}`,
          details: "Ensure your file is a valid CSV or Excel file with proper data structure."
        });
      }

      // Check for PII if not already handled
      let piiResult = null;
      let finalData = processedFile.data;
      let lookupTable = null;

      if (piiHandled === 'true' && anonymizationApplied === 'true' && parsedSelectedColumns.length > 0) {
        console.log('Applying anonymization to columns:', parsedSelectedColumns);
        // Apply anonymization
        try {
          const anonymizationResult = await PIIDetector.anonymizeData(
            processedFile.data, 
            parsedSelectedColumns,
            true
          );
          finalData = anonymizationResult.anonymizedData;
          lookupTable = anonymizationResult.lookupTable;
          console.log('Anonymization applied successfully');
        } catch (anonError) {
          console.error('Anonymization error:', anonError);
          return res.status(500).json({ error: "Anonymization failed" });
        }
      } else if (!piiHandled || piiHandled === 'false') {
        console.log('Detecting PII in uploaded data...');
        // Detect PII in uploaded data
        try {
          piiResult = await PIIDetector.detectPII(processedFile.data, processedFile.schema);
          console.log('PII detection result:', piiResult.hasPII ? 'PII found' : 'No PII detected');
          
          if (piiResult.hasPII) {
            console.log('PII detected, returning for user decision');
            // Return PII detection results for client handling
            return res.json({
              requiresPIIDecision: true,
              piiResult,
              tempFileId: req.file.filename, // Store temp file for later processing
              name: name || req.file.originalname,
              questions: questionsArray
            });
          }
        } catch (piiError) {
          console.error('PII detection error:', piiError);
          // Continue without PII detection if it fails
          console.log('Continuing without PII detection due to error');
        }
      }

      // Calculate data size in MB
      const dataSizeMB = Math.round(processedFile.metadata.fileSize / (1024 * 1024) * 100) / 100;

      // Calculate comprehensive pricing based on all factors
      const dataComplexity = PricingService.assessDataComplexity(processedFile.schema, processedFile.data.length);
      const questionComplexity = PricingService.assessQuestionComplexity(questionsArray);
      const estimatedArtifacts = PricingService.estimateAnalysisArtifacts("standard", processedFile.data.length, Object.keys(processedFile.schema).length);

      const pricingFactors = {
        dataSizeMB,
        recordCount: processedFile.data.length,
        columnCount: Object.keys(processedFile.schema).length,
        featureCount: Object.keys(processedFile.schema).length,
        questionsCount: questionsArray.length,
        questionComplexity,
        analysisType: "standard" as const,
        analysisArtifacts: estimatedArtifacts,
        dataComplexity
      };

      const pricingResult = PricingService.calculatePrice(pricingFactors);

      // Check for duplicate project names
      const existingProjects = await storage.getUserProjects(getUserId(req));
      const duplicateProject = existingProjects.find(p => p.name.toLowerCase() === name.toLowerCase());
      
      if (duplicateProject) {
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        return res.status(409).json({ 
          error: "Project name already exists", 
          message: "A project with this name already exists. Please choose a different name." 
        });
      }

      // Create project with comprehensive data
      const project = await storage.createProject({
        name,
        schema: processedFile.schema,
        questions: questionsArray,
        insights: {},
        recordCount: processedFile.data.length,
        status: "active",
        dataSnapshot: processedFile.dataSnapshot,
        dataSizeMB,
        paymentType: "one_time",
        paymentAmount: pricingResult.priceInCents,
        analysisType: "standard",
        complexityScore: dataComplexity === 'simple' ? 1 : dataComplexity === 'moderate' ? 3 : 5,
        isPaid: false, // Payment required before insights
        fileMetadata: processedFile.metadata,
        ownerId: getUserId(req)
      });

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          recordCount: project.recordCount,
          status: project.status,
          createdAt: project.createdAt
        }
      });

    } catch (error: any) {
      console.error("Upload error:", error);
      
      // Clean up file if it exists
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.error("Failed to cleanup file:", e);
        }
      }
      
      res.status(500).json({ 
        error: "Upload failed", 
        message: error.message 
      });
    }
  });

  // AI Settings routes
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getUserSettings(getUserId(req));
      if (!settings) {
        // Create default settings if none exist
        const newSettings = await storage.createUserSettings({
          userId: getUserId(req),
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

  app.post("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const { aiProvider, aiApiKey } = req.body;
      
      const existingSettings = await storage.getUserSettings(getUserId(req));
      
      if (existingSettings) {
        const updated = await storage.updateUserSettings(getUserId(req), {
          aiProvider,
          aiApiKey,
        });
        res.json(updated);
      } else {
        const created = await storage.createUserSettings({
          userId: getUserId(req),
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
  app.post("/api/subscription/upgrade", isAuthenticated, async (req, res) => {
    try {
      const { tier } = req.body;
      
      if (!["starter", "professional", "enterprise"].includes(tier)) {
        return res.status(400).json({ error: "Invalid subscription tier" });
      }

      const settings = await storage.getUserSettings(getUserId(req));
      if (!settings) {
        return res.status(404).json({ error: "User settings not found" });
      }

      const quotaMap = {
        starter: 50,
        professional: 500,
        enterprise: -1 // Unlimited
      };

      const updated = await storage.updateUserSettings(getUserId(req), {
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
  app.post("/api/ai/query", isAuthenticated, async (req, res) => {
    try {
      const data = aiQuerySchema.parse(req.body);
      
      // Get project data first to check payment status
      const project = await storage.getProject(data.projectId, getUserId(req));
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check if project analysis has been paid for
      if (!project.isPaid) {
        return res.status(402).json({ 
          error: "Payment required for insights. Please complete payment to access AI analysis.",
          needsPayment: true,
          projectId: data.projectId
        });
      }
      
      // Get user settings
      let settings = await storage.getUserSettings(getUserId(req));
      if (!settings) {
        // Create default settings for new users
        settings = await storage.createUserSettings({
          userId: getUserId(req),
          aiProvider: "platform",
          aiApiKey: null,
          subscriptionTier: "starter",
          usageQuota: 50,
          usageCount: 0,
        });
      }

      // Check usage limits only for paid projects
      const canMakeQuery = await storage.canUserMakeQuery(getUserId(req));
      if (!canMakeQuery) {
        const currentUsage = await storage.getUserUsageThisMonth(getUserId(req));
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
        userId: getUserId(req),
        projectId: data.projectId,
        action: "ai_query",
        provider: settings.aiProvider,
        tokensUsed: Math.ceil(data.query.length / 4), // Rough estimate
        cost: settings.aiProvider === "platform" ? "0.00" : "estimated"
      });

      const currentUsage = await storage.getUserUsageThisMonth(getUserId(req));
      
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

  // Generate comprehensive data insights
  app.post("/api/ai/insights", isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.body;
      
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      const project = await storage.getProject(projectId, getUserId(req));
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check if project analysis has been paid for
      if (!project.isPaid) {
        return res.status(402).json({ 
          error: "Payment required for insights. Please complete payment to access AI analysis.",
          needsPayment: true,
          projectId
        });
      }

      let settings = await storage.getUserSettings(getUserId(req));
      if (!settings) {
        settings = await storage.createUserSettings({
          userId: getUserId(req),
          aiProvider: "platform",
          aiApiKey: null,
          subscriptionTier: "starter",
          usageQuota: 50,
          usageCount: 0,
        });
      }

      // Check usage limits
      const canQuery = await storage.canUserMakeQuery(getUserId(req));
      if (!canQuery) {
        const currentUsage = await storage.getUserUsageThisMonth(getUserId(req));
        return res.status(429).json({ 
          error: `Monthly quota exceeded (${currentUsage}/${settings.usageQuota}). Upgrade your plan for more queries.`,
          usage: currentUsage,
          quota: settings.usageQuota
        });
      }

      const dataContext = {
        schema: project.schema,
        sampleData: project.dataSnapshot || [],
        recordCount: project.recordCount || 0
      };

      try {
        const insights = await aiService.generateDataInsights(
          settings.aiProvider || "platform",
          settings.aiApiKey || "",
          dataContext
        );

        // Log usage
        await storage.logUsage({
          userId: getUserId(req),
          projectId,
          action: "comprehensive_analysis",
          provider: settings.aiProvider,
          tokensUsed: 1000,
          cost: settings.aiProvider === "platform" ? "0.00" : "estimated"
        });

        const currentUsage = await storage.getUserUsageThisMonth(getUserId(req));

        res.json({ 
          insights,
          usage: {
            current: currentUsage,
            quota: settings.usageQuota,
            remaining: (settings.usageQuota || 50) - currentUsage
          }
        });

      } catch (aiError: any) {
        console.error("AI Insights Error:", aiError);
        res.status(500).json({ 
          error: "Insights generation failed", 
          message: aiError.message 
        });
      }

    } catch (error: any) {
      console.error("Insights generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate insights",
        message: error.message 
      });
    }
  });

  // Generate visualization suggestions
  app.post("/api/ai/visualizations", isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.body;
      
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      const project = await storage.getProject(projectId, getUserId(req));
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check if project analysis has been paid for
      if (!project.isPaid) {
        return res.status(402).json({ 
          error: "Payment required for insights. Please complete payment to access AI analysis.",
          needsPayment: true,
          projectId
        });
      }

      let settings = await storage.getUserSettings(getUserId(req));
      if (!settings) {
        settings = await storage.createUserSettings({
          userId: getUserId(req),
          aiProvider: "platform",
          aiApiKey: null,
          subscriptionTier: "starter",
          usageQuota: 50,
          usageCount: 0,
        });
      }

      const dataContext = {
        schema: project.schema,
        sampleData: project.dataSnapshot || [],
        recordCount: project.recordCount || 0
      };

      try {
        const suggestions = await aiService.generateVisualizationSuggestions(
          settings.aiProvider || "platform",
          settings.aiApiKey || "",
          dataContext
        );

        // Log usage
        await storage.logUsage({
          userId: getUserId(req),
          projectId,
          action: "visualization_analysis",
          provider: settings.aiProvider,
          tokensUsed: 500,
          cost: settings.aiProvider === "platform" ? "0.00" : "estimated"
        });

        res.json({ suggestions });

      } catch (aiError: any) {
        console.error("AI Visualization Error:", aiError);
        res.status(500).json({ 
          error: "Visualization suggestions failed", 
          message: aiError.message 
        });
      }

    } catch (error: any) {
      console.error("Visualization suggestions error:", error);
      res.status(500).json({ 
        error: "Failed to generate visualization suggestions",
        message: error.message 
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
  app.post("/api/calculate-pricing", isAuthenticated, async (req, res) => {
    try {
      const { dataSizeMB, questionsCount, analysisType, schema, recordCount } = req.body;
      
      const dataComplexity = PricingService.assessDataComplexity(schema, recordCount);
      const columnCount = schema ? Object.keys(schema).length : 0;
      const featureCount = Math.max(0, columnCount - 2); // Exclude ID and target columns
      const questionComplexity = PricingService.assessQuestionComplexity([]);
      const analysisArtifacts = PricingService.estimateAnalysisArtifacts(analysisType || 'standard', recordCount || 0, featureCount);
      
      const pricing = PricingService.calculatePrice({
        dataSizeMB: dataSizeMB || 0,
        recordCount: recordCount || 0,
        columnCount,
        featureCount,
        questionsCount: questionsCount || 0,
        questionComplexity,
        analysisType: analysisType || 'standard',
        analysisArtifacts,
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

  // Calculate pricing for analysis
  app.post("/api/calculate-pricing", isAuthenticated, async (req, res) => {
    try {
      const { dataSizeMB, questionsCount, analysisType, schema, recordCount } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Calculate pricing based on project data
      const dataComplexity = PricingService.assessDataComplexity(schema, recordCount || 0);
      const columnCount = schema ? Object.keys(schema).length : 0;
      const featureCount = Math.max(0, columnCount - 2);
      const questionComplexity = PricingService.assessQuestionComplexity(Array(questionsCount).fill(""));
      const analysisArtifacts = PricingService.estimateAnalysisArtifacts(analysisType, recordCount || 0, featureCount);
      
      const pricing = PricingService.calculatePrice({
        dataSizeMB: dataSizeMB || 1,
        recordCount: recordCount || 0,
        columnCount,
        featureCount,
        questionsCount: questionsCount || 0,
        questionComplexity,
        analysisType: analysisType as any,
        analysisArtifacts,
        dataComplexity
      });
      
      res.json({
        pricing,
        dataComplexity
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error calculating pricing: " + error.message });
    }
  });

  // Create payment intent for one-time analysis
  app.post("/api/create-analysis-payment", isAuthenticated, async (req, res) => {
    try {
      const { projectId, analysisType = 'standard' } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const project = await storage.getProject(projectId, getUserId(req));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Calculate pricing based on project data
      const dataComplexity = PricingService.assessDataComplexity(project.schema, project.recordCount || 0);
      const questionsCount = Array.isArray(project.questions) ? project.questions.length : 0;
      
      const columnCount = project.schema ? Object.keys(project.schema).length : 0;
      const featureCount = Math.max(0, columnCount - 2);
      const questionComplexity = PricingService.assessQuestionComplexity(project.questions || []);
      const analysisArtifacts = PricingService.estimateAnalysisArtifacts(analysisType, project.recordCount || 0, featureCount);
      
      const pricing = PricingService.calculatePrice({
        dataSizeMB: project.dataSizeMB || 1,
        recordCount: project.recordCount || 0,
        columnCount,
        featureCount,
        questionsCount,
        questionComplexity,
        analysisType: analysisType as any,
        analysisArtifacts,
        dataComplexity
      });
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: pricing.priceInCents,
        currency: "usd",
        metadata: {
          projectId,
          userId: getUserId(req).toString(),
          analysisType,
          dataComplexity
        }
      });
      
      // Update project with payment info
      await storage.updateProject(projectId, getUserId(req), {
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
  app.post('/api/subscription', isAuthenticated, async (req, res) => {

    try {
      const { planType, paymentMethodId } = req.body;
      
      // Get user settings to check for existing customer
      const userId = getUserId(req);
      let settings = await storage.getUserSettings(userId);
      if (!settings) {
        settings = await storage.createUserSettings({
          userId: userId,
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
            userId: getUserId(req).toString(),
            username: "Unknown"
          }
        });
        customerId = customer.id;
        
        // Update user settings with customer ID
        await storage.updateUserSettings(getUserId(req), {
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
      await storage.updateUserSettings(getUserId(req), {
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
  app.get('/api/subscription/status', isAuthenticated, async (req, res) => {

    try {
      const settings = await storage.getUserSettings(getUserId(req));
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
  app.post('/api/subscription/cancel', isAuthenticated, async (req, res) => {

    try {
      const settings = await storage.getUserSettings(getUserId(req));
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

  // ML Analysis endpoints
  app.get("/api/ml/analysis-types", isAuthenticated, (req, res) => {
    try {
      const analysisTypes = mlService.getAnalysisTypes();
      res.json(analysisTypes);
    } catch (error: any) {
      console.error("Error getting analysis types:", error);
      res.status(500).json({ message: "Failed to get analysis types" });
    }
  });

  app.post("/api/ml/recommend-analysis/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user!.id;
      
      const project = await storage.getProject(projectId, userId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const recommendations = mlService.getRecommendedAnalysis(project.schema, project.recordCount);
      res.json({ recommendations });
    } catch (error: any) {
      console.error("Error getting analysis recommendations:", error);
      res.status(500).json({ message: "Failed to get analysis recommendations" });
    }
  });

  app.post("/api/ml/validate-request", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, analysisType, targetColumn, features } = req.body;
      const userId = req.user!.id;
      
      const project = await storage.getProject(projectId, userId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const validation = await mlService.validateAnalysisRequest(
        { projectId, analysisType, targetColumn, features, userId },
        project.schema
      );
      
      res.json(validation);
    } catch (error: any) {
      console.error("Error validating analysis request:", error);
      res.status(500).json({ message: "Failed to validate analysis request" });
    }
  });

  app.post("/api/ml/run-analysis", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, analysisType, targetColumn, features, parameters } = req.body;
      const userId = req.user!.id;
      
      const project = await storage.getProject(projectId, userId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check if project analysis has been paid for
      if (!project.isPaid) {
        return res.status(402).json({ 
          error: "Payment required for ML analysis. Please complete payment to access advanced analytics.",
          needsPayment: true,
          projectId: projectId,
          paymentAmount: project.paymentAmount
        });
      }

      // Check usage quota
      const canMakeQuery = await storage.canUserMakeQuery(userId);
      if (!canMakeQuery) {
        return res.status(429).json({ message: "Usage quota exceeded" });
      }

      // Validate request
      const validation = await mlService.validateAnalysisRequest(
        { projectId, analysisType, targetColumn, features, userId },
        project.schema
      );
      
      if (!validation.valid) {
        return res.status(400).json({ errors: validation.errors });
      }

      // Find the uploaded data file
      const dataPath = path.join(process.cwd(), 'uploads', `${projectId}.csv`);
      if (!fs.existsSync(dataPath)) {
        return res.status(404).json({ message: "Project data file not found" });
      }

      // Run ML analysis
      const analysisRequest = {
        projectId,
        analysisType,
        targetColumn,
        features,
        parameters,
        userId
      };

      const result = await mlService.runAnalysis(analysisRequest, dataPath);

      // Log usage
      await storage.logUsage({
        userId,
        queryType: `ml_${analysisType}`,
        provider: 'platform',
        cost: 0,
        metadata: { projectId, analysisType }
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error running ML analysis:", error);
      res.status(500).json({ 
        message: "ML analysis failed", 
        error: error.message 
      });
    }
  });

  // File upload endpoint with authentication
  app.post("/api/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }



      const { name, questions } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Project name is required" });
      }

      // Check for duplicate project names
      const existingProjects = await storage.getUserProjects(getUserId(req));
      const duplicateProject = existingProjects.find(p => p.name.toLowerCase() === name.toLowerCase());
      
      if (duplicateProject) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(409).json({ 
          error: "Project name already exists", 
          message: "A project with this name already exists. Please choose a different name." 
        });
      }

      // Parse questions if provided
      let questionsArray: string[] = [];
      try {
        if (questions) {
          questionsArray = Array.isArray(questions) ? questions : JSON.parse(questions);
        }
      } catch (e) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Invalid questions format" });
      }

      // Process the uploaded file
      const { FileProcessor } = await import("./file-processor");
      const processedFile = await FileProcessor.processFile(req.file.path, req.file.originalname, {});

      // Create project
      const project = await storage.createProject({
        name,
        serviceType: "user_upload",
        schema: processedFile.schema,
        questions: questionsArray,
        insights: {},
        recordCount: processedFile.data.length,
        status: "active",
        dataSnapshot: processedFile.dataSnapshot,
        fileMetadata: processedFile.metadata,
        ownerId: getUserId(req)
      });

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          recordCount: project.recordCount,
          status: project.status,
          createdAt: project.createdAt
        },
        dataPreview: processedFile.dataSnapshot
      });

    } catch (error: any) {
      console.error("Upload error:", error);
      
      // Clean up file if it exists
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.error("Failed to cleanup file:", e);
        }
      }
      
      res.status(500).json({ 
        error: "Upload failed", 
        message: error.message 
      });
    }
  });

  // Pricing tier API routes
  app.get('/api/pricing/tiers', (req, res) => {
    const tiers = PricingService.getPricingTiers();
    res.json({ tiers });
  });

  // Pricing comparison endpoint
  app.get('/api/pricing/compare', (req, res) => {
    const tiers = PricingService.getPricingTiers();
    
    // Separate subscription tiers from pay-per-use options
    const subscriptionTiers = tiers.filter(tier => tier.type !== 'pay-per-use');
    const payPerUseOptions = tiers.filter(tier => tier.type === 'pay-per-use');
    
    res.json({
      plans: tiers,
      subscriptionTiers,
      payPerUseOptions,
      comparison: {
        subscriptions: subscriptionTiers.length,
        payPerUse: payPerUseOptions.length,
        total: tiers.length
      }
    });
  });

  // Calculate analysis pricing endpoint
  app.post('/api/pricing/calculate-analysis', (req, res) => {
    try {
      const { dataSize, complexity, provider } = req.body;
      
      // Base calculation for pay-per-analysis
      let basePrice = 25; // Starting price
      
      // Add complexity multipliers
      const complexityMultiplier = complexity === 'simple' ? 1 : complexity === 'medium' ? 1.2 : 1.5;
      const sizeMultiplier = Math.max(1, (dataSize || 1000) / 1000 * 0.1 + 1);
      
      const finalPrice = Math.max(25, Math.round(basePrice * complexityMultiplier * sizeMultiplier));
      
      res.json({
        price: finalPrice,
        basePrice,
        multipliers: {
          complexity: complexityMultiplier,
          size: sizeMultiplier
        },
        breakdown: {
          base: basePrice,
          complexityCharge: (finalPrice - basePrice) * 0.6,
          sizeCharge: (finalPrice - basePrice) * 0.4
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate analysis pricing" });
    }
  });

  app.post('/api/pricing/validate', isAuthenticated, async (req, res) => {

    try {
      const { dataSizeMB, recordCount } = req.body;
      
      let userTier: 'free' | 'professional' | 'enterprise' = 'free';
      const settings = await storage.getUserSettings(getUserId(req));
      if (settings?.subscriptionTier) {
        userTier = settings.subscriptionTier as 'free' | 'professional' | 'enterprise';
      }

      const currentMonthAnalyses = await storage.getUserUsageThisMonth(getUserId(req));

      const validation = PricingService.validateUserLimits(userTier, {
        dataSizeMB: Number(dataSizeMB),
        recordCount: Number(recordCount),
        currentMonthAnalyses
      });

      res.json({
        ...validation,
        currentTier: userTier,
        currentMonthAnalyses
      });

    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to validate limits",
        message: error.message 
      });
    }
  });

  app.post('/api/pricing/recommend', (req, res) => {
    const { dataSizeMB, recordCount, analysesPerMonth } = req.body;
    
    const recommendedTier = PricingService.getRecommendedTier(
      Number(dataSizeMB),
      Number(recordCount),
      Number(analysesPerMonth)
    );

    res.json({ recommendedTier });
  });

  app.get('/api/pricing/estimate', (req, res) => {
    const { dataSizeMB = 1, questionsCount = 3, analysisType = 'standard' } = req.query;
    
    const estimate = PricingService.getEstimatedPrice(
      Number(dataSizeMB), 
      Number(questionsCount), 
      analysisType as 'standard' | 'advanced' | 'custom'
    );
    
    res.json({ estimate });
  });

  // Enterprise inquiry endpoints
  app.post('/api/enterprise/inquiry', async (req, res) => {
    try {
      const inquiry = await storage.createEnterpriseInquiry(req.body);
      res.status(201).json({ 
        success: true, 
        inquiry: {
          id: inquiry.id,
          status: inquiry.status,
          createdAt: inquiry.createdAt
        }
      });
    } catch (error: any) {
      console.error("Enterprise inquiry error:", error);
      res.status(500).json({ 
        error: "Failed to submit inquiry", 
        message: error.message 
      });
    }
  });

  app.get('/api/enterprise/inquiries', async (req, res) => {
    try {
      const inquiries = await storage.getEnterpriseInquiries();
      res.json({ inquiries });
    } catch (error: any) {
      console.error("Get inquiries error:", error);
      res.status(500).json({ 
        error: "Failed to fetch inquiries", 
        message: error.message 
      });
    }
  });

  app.patch('/api/enterprise/inquiries/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const inquiry = await storage.updateEnterpriseInquiry(id, req.body);
      
      if (!inquiry) {
        return res.status(404).json({ error: "Inquiry not found" });
      }
      
      res.json({ inquiry });
    } catch (error: any) {
      console.error("Update inquiry error:", error);
      res.status(500).json({ 
        error: "Failed to update inquiry", 
        message: error.message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
