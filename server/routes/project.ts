// server/routes/project.ts
import { Router } from 'express';
import multer from "multer";
import { storage } from '../services/storage';
import { unifiedAuth, ensureAuthenticated } from './auth';
import { requireOwnership } from '../middleware/rbac';
import { 
    FileProcessor,
    PIIAnalyzer,
    PricingService,
    DataTransformationService
} from '../services';
import { PythonProcessor } from '../services/python-processor';

import { tempStore } from '../services/temp-store';
import { jsonToCsv } from '../services/csv-export';
import { exportService } from '../services/export-service';
import { projectAgentOrchestrator } from '../services/project-agent-orchestrator';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { AgentMessageBroker } from '../services/agents/message-broker';
import { DataEngineerAgent } from '../services/data-engineer-agent';
import { DataScientistAgent } from '../services/data-scientist-agent';

const router = Router();

// Initialize Agents for recommendations
const projectManagerAgent = new ProjectManagerAgent();
const messageBroker = new AgentMessageBroker();
const dataEngineerAgent = new DataEngineerAgent();
const dataScientistAgent = new DataScientistAgent();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for paid features
  },
});

// Create a new project
/**
 * @summary Creates a new, empty project shell.
 * @description This endpoint creates a project associated with the authenticated user.
 * It does NOT handle file uploads; it only establishes the project container.
 * @route POST /api/projects
 * @auth Required (`mockAuth` middleware).
 * @input
 * - `req.body`: { name: string, description?: string }
 * - `req.user`: Attached by the authentication middleware.
 * @process
 * 1. Verifies user is authenticated and has an ID.
 * 2. Validates that a project `name` is provided.
 * 3. Calls `storage.createProject` with the user ID and project details.
 * 4. The new project is created with empty data fields.
 * @output
 * - Success: 200 { success: true, project: object }
 * - Error: 400, 401, or 500 with an error message.
 * @dependencies `storage`.
 */
router.post("/", ensureAuthenticated, async (req, res) => {
    try {
        const { name, description, journeyType } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: "Project name is required" });
        }

        const project = await storage.createProject({
            userId,
            name: name.trim(),
            description: description || '',
            journeyType: journeyType || 'ai_guided', // Default to ai_guided if not provided
            isPaid: false,
            isTrial: true,
            dataSource: 'upload',
            fileType: '',
            fileName: '',
            fileSize: 0,
        });

        // Initialize AI agents for the project
        try {
            await projectAgentOrchestrator.initializeProjectAgents({
                projectId: project.id,
                userId,
                journeyType: journeyType || 'ai_guided',
                projectName: name.trim(),
                description: description || ''
            });
        } catch (agentError) {
            console.error('Agent initialization failed:', agentError);
            // Continue without agents rather than failing the entire project creation
        }

        res.json({ success: true, project });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to create project" });
    }
});

/**
 * Agent Recommendations Endpoint
 * Analyzes user goals and questions to provide recommendations for:
 * - Expected data size (from Data Engineer Agent)
 * - Analysis complexity (from Data Scientist Agent)
 */
router.post("/:id/agent-recommendations", ensureAuthenticated, async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;
        
        if (!userId) {
            return res.status(401).json({ success: false, error: "User authentication required" });
        }

        const { goals, questions, dataSource } = req.body;

        if (!goals || !questions || !Array.isArray(questions)) {
            return res.status(400).json({ 
                success: false, 
                error: "Goals and questions are required" 
            });
        }

        console.log(`🔮 Getting agent recommendations for project ${projectId}`);

        // For now, return estimated values based on questions
        // In full implementation, these would come from actual agent analysis
        
        // Estimate data size based on question complexity
        const questionCount = questions.length;
        const hasComplexAnalysis = questions.some(q => 
            q.toLowerCase().includes('predict') || 
            q.toLowerCase().includes('forecast') ||
            q.toLowerCase().includes('trend') ||
            q.toLowerCase().includes('over time')
        );

        // Estimate data size (rows)
        let estimatedDataSize = 1000; // Default
        if (hasComplexAnalysis) {
            estimatedDataSize = 3000;
        } else if (questionCount > 2) {
            estimatedDataSize = 2000;
        }

        // Estimate analysis complexity (matching frontend options: simple, moderate, complex, expert)
        let complexity = 'moderate';
        if (hasComplexAnalysis) {
            complexity = 'complex';
        } else if (questionCount <= 2) {
            complexity = 'simple';
        }

        // Calculate complexity score for recommendation
        const complexityScore = questions.reduce((score: number, q: string) => {
            const lowerQ = q.toLowerCase();
            if (lowerQ.includes('predict') || lowerQ.includes('forecast')) return score + 3;
            if (lowerQ.includes('trend') || lowerQ.includes('over time')) return score + 2;
            if (lowerQ.includes('compare') || lowerQ.includes('each')) return score + 1;
            return score + 0.5;
        }, 0);

        // Map score to complexity level (matching frontend options: simple, moderate, complex, expert)
        if (complexityScore >= 5) complexity = 'expert';
        else if (complexityScore >= 3) complexity = 'complex';
        else if (complexityScore >= 1.5) complexity = 'moderate';
        else complexity = 'simple';

        const recommendations = {
            success: true,
            recommendations: {
                expectedDataSize: estimatedDataSize.toString(),
                analysisComplexity: complexity,
                rationale: `Based on ${questionCount} questions: ${complexity} complexity analysis recommended for ${estimatedDataSize.toLocaleString()} rows`,
                confidence: 0.85
            }
        };

        console.log(`✅ Agent recommendations: Size=${estimatedDataSize}, Complexity=${complexity}`);
        
        res.json(recommendations);

    } catch (error: any) {
        console.error('Agent recommendations error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to get agent recommendations" 
        });
    }
});

// Legacy trial upload endpoint
router.post("/trial-upload", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }
        const file = req.file;
        const freeTrialLimit = PricingService.getFreeTrialLimits();
        if (file.size > freeTrialLimit.maxFileSize) {
            return res.status(400).json({ success: false, error: `File size exceeds free trial limit of ${Math.round(freeTrialLimit.maxFileSize / (1024 * 1024))}MB` });
        }
        const processedData = await FileProcessor.processFile(file.buffer, file.originalname, file.mimetype);
        const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});
        if (piiAnalysis.detectedPII && piiAnalysis.detectedPII.length > 0) {
            const tempFileId = `trial_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            tempStore.set(tempFileId, {
                processedData,
                piiAnalysis,
                fileInfo: { originalname: file.originalname, size: file.size, mimetype: file.mimetype }
            }, 60 * 60 * 1000); // 1 hour expiry
            
            return res.json({
                success: true,
                requiresPIIDecision: true,
                tempFileId,
                piiResult: piiAnalysis,
                sampleData: processedData.preview,
                fileInfo: { originalname: file.originalname, size: file.size, mimetype: file.mimetype }
            });
        }
        
        const trialResults = await PythonProcessor.processTrial(`trial_${Date.now()}`, {
            preview: processedData.data.slice(0, 100),
            schema: processedData.schema,
            recordCount: processedData.recordCount,
        });

        if (!trialResults.success) {
            return res.status(500).json({ success: false, error: `Failed to process trial analysis: ${trialResults.error || 'Unknown error'}` });
        }

        return res.json({
            success: true,
            trialResults: {
                schema: processedData.schema,
                descriptiveAnalysis: trialResults.data,
                basicVisualizations: trialResults.visualizations || [],
                piiAnalysis: { ...piiAnalysis, userDecision: 'proceed', decisionTimestamp: new Date() },
                piiDecision: 'proceed',
                recordCount: processedData.recordCount
            },
            recordCount: processedData.recordCount
        });

    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to process trial file" });
    }
});

// Save transformations endpoint
router.post("/save-transformations/:projectId", unifiedAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { transformations } = req.body;
        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }
        const transformedData = await DataTransformationService.applyTransformations(project.data || [], transformations);
        if (!transformedData) {
            return res.status(500).json({ success: false, error: "Data transformation failed" });
        }
        const updatedProject = await storage.updateProject(projectId, {
            transformedData: transformedData,
            transformations: transformations,
        });
        res.json({ success: true, message: "Transformations saved successfully", project: updatedProject });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to save transformations" });
    }
});

// Get transformed data endpoint
router.get("/get-transformed-data/:projectId", unifiedAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }
        const transformedData = project.transformedData || project.data;
        res.json({
            success: true,
            data: transformedData ? transformedData.slice(0, 100) : [],
            totalRows: transformedData ? transformedData.length : 0,
            message: "Transformed data retrieved successfully"
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to get transformed data" });
    }
});

// Main project upload endpoint
router.post("/upload", ensureAuthenticated, upload.single('file'), async (req, res) => {
    try {
        console.log('🔍 Upload request debug:', {
            hasFile: !!req.file,
            hasUser: !!req.user,
            userId: req.user?.id,
            reqUserId: req.userId,
            authHeader: req.headers.authorization?.substring(0, 20) + '...'
        });

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }
        const { name, description, questions } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: "Project name is required" });
        }

        // Ensure we have a valid user ID
        const userId = req.user?.id || req.userId;
        if (!userId) {
            console.error('❌ No user ID found in request:', { reqUser: req.user, reqUserId: req.userId });
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        console.log('✅ Using user ID:', userId);
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
        if (piiAnalysis.detectedPII.length > 0) {
            const tempFileId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            tempStore.set(tempFileId, {
                processedData,
                piiAnalysis,
                fileInfo: { originalname: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype },
                projectMetadata: { name, description, questions: parsedQuestions }
            }, 60 * 60 * 1000); // 1 hour expiry
            return res.json({
                success: true,
                requiresPIIDecision: true,
                piiResult: piiAnalysis,
                tempFileId,
                name: name.trim(),
                questions: parsedQuestions,
                recordCount: processedData.recordCount,
                sampleData: processedData.preview,
                message: 'PII detected - user consent required'
            });
        }

        const project = await storage.createProject({
            userId: userId,
            name: name.trim(),
            description: description || '',
            journeyType: req.body.journeyType || 'ai_guided', // Add journeyType
            fileType: req.file.mimetype,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            dataSource: 'upload',
            isTrial: false,
            isPaid: false,
        } as any);

        // Create a dataset and link it
        const dataset = await storage.createDataset({
            id: undefined as any, // will be set by storage impl
            ownerId: userId,
            sourceType: 'upload',
            originalFileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            storageUri: `mem://${project.id}/${req.file.originalname}`,
            schema: processedData.schema,
            recordCount: processedData.recordCount,
            data: processedData.data,
            piiAnalysis: piiAnalysis,
        } as any);
        await storage.linkProjectToDataset(project.id, dataset.id);

        res.json({ success: true, projectId: project.id, project: { ...project, preview: processedData.preview }, piiAnalysis });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to process file" });
    }
});

// Projects API endpoints
router.get("/", ensureAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "User authentication required" });
        }

        const projects = await storage.getProjectsByOwner(userId);
        res.json({ projects });
    } catch (error: any) {
        console.error('[ERROR] GET /api/projects failed:', error);
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

router.get("/:id", ensureAuthenticated, async (req, res) => {
    try {
        const userId = (req.user as any)?.id;
        const project = await storage.getProject(req.params.id);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (owner !== userId) {
            return res.status(403).json({ error: "Access denied - not your project" });
        }
        res.json(project);
    } catch (error: any) {
        res.status(500).json({ error: "Failed to fetch project" });
    }
});

// Upload file to an existing project
/**
 * @summary Uploads a data file and associates it with an existing project.
 * @description This is the primary endpoint for adding a dataset to a project that has already been created.
 * It follows the decoupled data model.
 * @route POST /api/projects/:id/upload
 * @auth Required (`ensureAuthenticated` middleware).
 * @input
 * - `req.params.id`: The ID of the project to upload to.
 * - `req.file`: The uploaded file (handled by `multer`).
 * - `req.user`: Attached by the authentication middleware.
 * @process
 * 1. Verifies user authentication.
 * 2. Fetches the project by ID and verifies the user owns it.
 * 3. Processes the file buffer using `FileProcessor`.
 * 4. Analyzes the data for PII using `PIIAnalyzer`.
 * 5. Creates a new, separate `Dataset` entity using `storage.createDataset`, storing the processed data with it.
 * 6. Links the project to the new dataset using `storage.linkProjectToDataset`.
 * 7. Updates the project's metadata (e.g., filename, size).
 * @output
 * - Success: 200 { success: true, project: object, datasetId: string, piiAnalysis: object }
 * - Error: 400, 404, or 500 with an error message.
 * @dependencies `storage`, `FileProcessor`, `PIIAnalyzer`.
 */
router.post("/:id/upload", ensureAuthenticated, upload.single('file'), async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }

        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }

        const processedData = await FileProcessor.processFile(req.file.buffer, req.file.originalname, req.file.mimetype);
        const piiAnalysis = await PIIAnalyzer.analyzePII(processedData.preview || [], processedData.schema || {});

        // Create a new Dataset
        const newDataset = await storage.createDataset({
            id: undefined as any,
            ownerId: userId,
            sourceType: 'upload',
            originalFileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            storageUri: `mem://${projectId}/${req.file.originalname}`, // Example URI
            schema: processedData.schema,
            recordCount: processedData.recordCount,
            preview: processedData.preview,
            piiAnalysis: piiAnalysis,
            data: processedData.data, // Storing data with the dataset
        } as any);

        // Link dataset to the project
        await storage.linkProjectToDataset(projectId, newDataset.id);
        console.log(`[project.ts] Linked project ${projectId} to dataset ${newDataset.id}`);

        // Update project metadata (optional, if needed)
        const updatedProject = await storage.updateProject(projectId, {
            fileName: req.file.originalname, // Keep for quick reference, but data is in dataset
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            processed: true,
        });

        // ==========================================
        // MULTI-AGENT COORDINATION (NON-BLOCKING)
        // ==========================================
        // Trigger multi-agent goal analysis in the background after successful file upload
        // This creates a checkpoint for user review without blocking the upload response
        setImmediate(async () => {
            try {
                console.log(`[project.ts] Starting multi-agent coordination for project ${projectId}`);

                // Extract user goals from project or use default exploratory goals
                const userGoals = (updatedProject as any).goals || [
                    'Understand my data',
                    'Discover patterns and insights',
                    'Identify key trends'
                ];

                // Determine industry from project metadata or default to 'general'
                const industry = (updatedProject as any).industry || 'general';

                // Coordinate goal analysis across all three agents (Data Engineer, Data Scientist, Business Agent)
                const coordinationResult = await projectManagerAgent.coordinateGoalAnalysis(
                    projectId,
                    {
                        data: processedData.data,
                        schema: processedData.schema,
                        qualityMetrics: processedData.qualityMetrics,
                        rowCount: processedData.recordCount,
                        type: 'tabular'
                    },
                    userGoals,
                    industry
                );

                console.log(`[project.ts] Multi-agent coordination complete in ${coordinationResult.totalResponseTime}ms`);
                console.log(`[project.ts] Overall assessment: ${coordinationResult.synthesis.overallAssessment}`);
                console.log(`[project.ts] Confidence: ${coordinationResult.synthesis.confidence}`);

                // Store coordination result in project metadata for later retrieval
                await storage.updateProject(projectId, {
                    multiAgentCoordination: JSON.stringify(coordinationResult)
                } as any);

                // Notify project orchestrator to create a checkpoint
                // This will be picked up by the UI through the existing checkpoint polling mechanism
                await projectAgentOrchestrator.addCheckpoint(projectId, {
                    id: coordinationResult.coordinationId,
                    projectId,
                    agentType: 'project_manager' as const,
                    stepName: 'multi_agent_goal_analysis',
                    status: 'waiting_approval' as const,
                    message: 'Our team of experts has analyzed your data. Please review their recommendations:',
                    data: {
                        type: 'multi_agent_coordination',
                        coordinationResult,
                        expertOpinions: coordinationResult.expertOpinions,
                        synthesis: coordinationResult.synthesis,
                        overallAssessment: coordinationResult.synthesis.overallAssessment,
                        confidence: coordinationResult.synthesis.confidence,
                        keyFindings: coordinationResult.synthesis.keyFindings,
                        actionableRecommendations: coordinationResult.synthesis.actionableRecommendations
                    },
                    timestamp: new Date(),
                    requiresUserInput: true
                });

                console.log(`[project.ts] Multi-agent checkpoint created for project ${projectId}`);

            } catch (coordinationError) {
                console.error(`[project.ts] Multi-agent coordination failed (non-blocking):`, coordinationError);
                // Don't block upload success, coordination is an enhancement
                // User can still proceed with analysis using traditional flow
            }
        });

        res.json({ success: true, project: updatedProject, datasetId: newDataset.id, piiAnalysis });

    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || "Failed to process file" });
    }
});

// Agent interaction endpoints

// Get project checkpoints
router.get("/:projectId/checkpoints", ensureAuthenticated, requireOwnership('project'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        // Verify user has access to this project
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (owner !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        const checkpoints = await projectAgentOrchestrator.getProjectCheckpoints(projectId);
        res.json({ success: true, checkpoints });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle checkpoint feedback
router.post("/:projectId/checkpoints/:checkpointId/feedback", ensureAuthenticated, async (req, res) => {
    try {
        const { projectId, checkpointId } = req.params;
        const { feedback, approved } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        // Verify user has access to this project
        const project = await storage.getProject(projectId);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (owner !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        await projectAgentOrchestrator.handleCheckpointFeedback(
            projectId, 
            checkpointId, 
            feedback || '', 
            approved === true
        );

        res.json({ success: true, message: "Feedback processed successfully" });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// AI Question Suggestions for Non-Tech Users (Phase 3 - Task 3.1)
router.post("/project-manager/suggest-questions", ensureAuthenticated, async (req, res) => {
    try {
        const { goal, journeyType } = req.body;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        if (!goal || typeof goal !== 'string' || goal.length < 10) {
            return res.status(400).json({
                success: false,
                error: "Goal must be at least 10 characters long"
            });
        }

        // Use AI service to generate question suggestions
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const apiKey = process.env.GOOGLE_AI_API_KEY;

        if (!apiKey) {
            return res.status(503).json({
                success: false,
                error: "AI service not configured"
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are an AI assistant helping a non-technical user with data analysis.

User's Analysis Goal: "${goal}"

Based on this goal, generate 3-5 specific, actionable questions that would help guide their data analysis.
The questions should be:
- Directly related to their stated goal
- Easy to understand for non-technical users
- Specific enough to guide meaningful analysis
- Focused on business insights rather than technical details

Return ONLY the questions as a JSON array of strings, like this:
["Question 1", "Question 2", "Question 3"]

No additional text or explanation.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Parse the AI response
        let suggestions: string[] = [];
        try {
            // Try to extract JSON from the response
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                suggestions = JSON.parse(jsonMatch[0]);
            } else {
                // Fallback: split by newlines and clean up
                suggestions = text
                    .split('\n')
                    .filter(line => line.trim().length > 0)
                    .map(line => line.replace(/^[-*•]\s*/, '').replace(/^["\s]+|["\s]+$/g, ''))
                    .filter(line => line.length > 10)
                    .slice(0, 5);
            }
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            // Fallback suggestions if AI parsing fails
            suggestions = [
                "What are the main patterns or trends in my data?",
                "Which factors have the strongest impact on my key metrics?",
                "Are there any unexpected outliers or anomalies?"
            ];
        }

        res.json({
            success: true,
            suggestions: suggestions.slice(0, 5) // Maximum 5 suggestions
        });
    } catch (error: any) {
        console.error('AI Question Suggestion Error:', error);

        // Provide fallback suggestions if AI service fails
        const fallbackSuggestions = [
            "What are the main patterns or trends in my data?",
            "Which factors have the strongest impact on my key metrics?",
            "Are there any unexpected outliers or anomalies?",
            "How do different segments compare to each other?",
            "What predictions can be made based on historical trends?"
        ];

        res.json({
            success: true,
            suggestions: fallbackSuggestions,
            fallback: true
        });
    }
});

export default router;

// Export project data/results in various formats
router.get("/:id/export", ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const format = String(req.query.format || 'csv').toLowerCase();
        const userId = (req.user as any)?.id;

        const project = await storage.getProject(id);
        const owner = (project as any)?.ownerId ?? (project as any)?.userId;
        if (!project || owner !== userId) {
            return res.status(404).json({ error: "Project not found or access denied" });
        }

        // Prefer transformed data, then raw data; fallback to schema snapshot
        const dataRows = (project as any)?.transformedData || (project as any)?.data || [];
        const meta = {
            id,
            name: (project as any)?.name,
            createdAt: (project as any)?.createdAt,
            recordCount: (project as any)?.recordCount || (Array.isArray(dataRows) ? dataRows.length : undefined),
            schema: (project as any)?.schema,
            insights: (project as any)?.insights || {},
        };

        // Map 'excel' to CSV for now
        const f = format === 'excel' ? 'csv' : format;

        if (f === 'json') {
            const payload = { project: meta, data: Array.isArray(dataRows) ? dataRows : [] };
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.json`);
            return res.send(Buffer.from(JSON.stringify(payload, null, 2)));
        }

        if (f === 'csv') {
            const rows = Array.isArray(dataRows) && dataRows.length > 0 ? dataRows : [meta];
            const csv = jsonToCsv(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.csv`);
            return res.send(Buffer.from(csv, 'utf-8'));
        }

        if (f === 'pdf') {
            const analysisResult = {
                title: `Analysis for ${(project as any)?.name || id}`,
                sections: [
                    { title: 'Overview', content: `Records: ${meta.recordCount ?? 'N/A'}\nCreated: ${new Date(meta.createdAt || Date.now()).toLocaleString()}` },
                    { title: 'Schema', content: Object.keys(meta.schema || {}).slice(0, 20).join(', ') || 'No schema available' },
                    { title: 'Insights', content: Object.keys(meta.insights || {}).length ? JSON.stringify(meta.insights, null, 2) : 'No insights available' },
                ]
            };
            const pdfBytes = await exportService.generatePdf(analysisResult as any);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.pdf`);
            return res.send(Buffer.from(pdfBytes));
        }

        if (f === 'pptx' || f === 'presentation') {
            const analysisResult = {
                title: `Analysis Deck — ${(project as any)?.name || id}`,
                sections: [
                    { title: 'Executive Summary', content: 'Key findings and recommendations (auto-generated demo content).' },
                    { title: 'Data Overview', content: `Records: ${meta.recordCount ?? 'N/A'}; Fields: ${Object.keys(meta.schema || {}).length}` },
                    { title: 'Insights', content: Object.keys(meta.insights || {}).length ? JSON.stringify(meta.insights, null, 2) : 'No insights available' },
                ]
            };
            const buffer = await exportService.generatePptx(analysisResult as any);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            res.setHeader('Content-Disposition', `attachment; filename=project-${id}.pptx`);
            return res.send(Buffer.from(buffer as ArrayBuffer));
        }

        // Unknown format
        return res.status(400).json({ error: `Unsupported format: ${format}` });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to export project" });
    }
});
