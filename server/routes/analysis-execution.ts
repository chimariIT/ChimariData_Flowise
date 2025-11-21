// server/routes/analysis-execution.ts
/**
 * Analysis Execution API Routes
 * Endpoints for executing and retrieving real data analysis
 */

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { AnalysisExecutionService } from '../services/analysis-execution';
import { canAccessProject } from '../middleware/ownership';
import { z } from 'zod';
import { ArtifactGenerator } from '../services/artifact-generator';
import { storage } from '../storage';
import { JourneyStateManager } from '../services/journey-state-manager';
import type { CostBreakdown } from '@shared/schema';

const router = Router();

type AnalysisExecutionResult = Awaited<ReturnType<typeof AnalysisExecutionService.executeAnalysis>>;

interface AnalysisExecutionResponsePayload {
  projectId: AnalysisExecutionResult['projectId'];
  summary: AnalysisExecutionResult['summary'];
  insights: AnalysisExecutionResult['insights'];
  recommendations: AnalysisExecutionResult['recommendations'];
  visualizations: AnalysisExecutionResult['visualizations'];
  analysisTypes: AnalysisExecutionResult['analysisTypes'];
  metadata: AnalysisExecutionResult['metadata'] & { datasetCount: number };
  insightCount: number;
  recommendationCount: number;
  datasetCount: number;
  dataRowsProcessed: number;
  columnsAnalyzed: number;
  qualityScore: number;
  executionTimeSeconds: number | null;
  cost: number | null;
  costBreakdown: CostBreakdown | null;
  journeyType: string;
  datasetIds: string[] | null;
}

/**
 * Execute analysis on a project's datasets
 * POST /api/analysis-execution/execute
 */
router.post('/execute', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    // Validate request
    const schema = z.object({
      projectId: z.string().min(1),
      analysisTypes: z.array(z.string()).min(1),
      datasetIds: z.array(z.string()).optional()
    });

    const validation = schema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request',
        details: validation.error.errors
      });
    }

    const { projectId, analysisTypes, datasetIds } = validation.data;

    const project = await storage.getProject(projectId);

    console.log(`🚀 Analysis execution requested for project ${projectId}`);
    console.log(`📊 Analysis types: ${analysisTypes.join(', ')}`);

    // Execute analysis
    const results = await AnalysisExecutionService.executeAnalysis({
      projectId,
      userId,
      analysisTypes,
      datasetIds
    });

    // ✅ SLA: Generate artifacts asynchronously (don't block journey completion)
    // Start artifact generation in background to meet <1 minute journey lifecycle SLA
    if (project) {
      console.log(`📦 Queueing artifact generation for project ${projectId} (async)`);
      
      // Run artifact generation in background without awaiting
      setImmediate(async () => {
        try {
          const artifactGenerator = new ArtifactGenerator();

          const artifacts = await artifactGenerator.generateArtifacts({
            projectId,
            projectName: project.name || projectId, // Pass project name for folder structure
            userId,
            journeyType: (project.journeyType || 'ai_guided') as 'non-tech' | 'business' | 'technical' | 'consultation',
            analysisResults: results.insights || [], // Pass insights as analysis results
            visualizations: results.visualizations || [],
            insights: (results.insights || []).map(insight => insight.title), // Convert AnalysisInsight[] to string[]
            datasetSizeMB: project.data ? (JSON.stringify(project.data).length / (1024 * 1024)) : 0
          });

          console.log(`✅ Generated ${Object.keys(artifacts).length} artifacts (async):`);
          console.log(`   - PDF Report: ${artifacts.pdf ? '✅' : '❌'}`);
          console.log(`   - Presentation: ${artifacts.presentation ? '✅' : '❌'}`);
          console.log(`   - CSV Export: ${artifacts.csv ? '✅' : '❌'}`);
          console.log(`   - JSON Data: ${artifacts.json ? '✅' : '❌'}`);
          console.log(`   - Dashboard: ${artifacts.dashboard ? '✅' : '❌'}`);
          console.log(`   Total Size: ${artifacts.totalSizeMB} MB`);
          console.log(`   Total Cost: $${(artifacts.totalCost / 100).toFixed(2)}`);
          console.log(`📁 [ARTIFACTS] All artifacts saved to: uploads/artifacts/${projectId}/`);
        } catch (artifactError) {
          console.error('❌ Failed to generate artifacts (async):', artifactError);
          // Artifacts can be regenerated later if needed
        }
      });
    } else {
      console.warn(`⚠️ Project ${projectId} not found, skipping artifact generation`);
    }

    // ✅ Update journey state - mark analysis execution as complete
    try {
      const journeyStateManager = new JourneyStateManager();

      await journeyStateManager.completeStep(projectId, 'execute');
      console.log(`✅ Journey state updated: analysis execution complete for project ${projectId}`);
    } catch (journeyError) {
      console.error('❌ Failed to update journey state:', journeyError);
      // Don't fail the request if journey state update fails
    }

    const refreshedProject = await storage.getProject(projectId);
    const totalCost = refreshedProject?.totalCostIncurred ? Number(refreshedProject.totalCostIncurred) : null;
    const executionSeconds = typeof results.summary.executionTime === 'string'
      ? parseFloat(results.summary.executionTime)
      : results.summary.executionTime;

    const costBreakdown = (refreshedProject?.costBreakdown ?? null) as CostBreakdown | null;

    const responsePayload: AnalysisExecutionResponsePayload = {
      projectId: results.projectId,
      summary: results.summary,
      insights: results.insights,
      recommendations: results.recommendations,
      visualizations: results.visualizations,
      analysisTypes: results.analysisTypes,
      metadata: {
        ...results.metadata,
        datasetCount: results.metadata.datasetNames.length,
        executedAt: results.metadata.executedAt,
      },
      insightCount: results.insights.length,
      recommendationCount: results.recommendations.length,
      datasetCount: results.metadata.datasetNames.length,
      dataRowsProcessed: results.summary.dataRowsProcessed,
      columnsAnalyzed: results.summary.columnsAnalyzed,
      qualityScore: results.summary.qualityScore,
      executionTimeSeconds: Number.isFinite(executionSeconds) ? executionSeconds : null,
      cost: totalCost,
      costBreakdown,
      journeyType: project?.journeyType ?? 'ai_guided',
      datasetIds: datasetIds ?? null
    };

    res.json({
      success: true,
      message: 'Analysis completed successfully',
      results: responsePayload
    });

  } catch (error: any) {
    console.error('❌ Analysis execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute analysis'
    });
  }
});

/**
 * Get analysis results for a project
 * GET /api/analysis-execution/results/:projectId
 */
router.get('/results/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdminUser = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // ✅ Add explicit authorization check at route level
    const accessCheck = await canAccessProject(userId, projectId, isAdminUser);
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({
        success: false,
        error: accessCheck.reason
      });
    }

    console.log(`📖 Fetching results for project ${projectId}`);

    // Get results (service layer can still validate, but route is primary gate)
    const results = await AnalysisExecutionService.getResults(projectId, userId);

    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'No analysis results found for this project'
      });
    }

    res.json({
      success: true,
      results
    });

  } catch (error: any) {
    console.error('❌ Error fetching results:', error);

    if (error.message.includes('Access denied')) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch analysis results'
    });
  }
});

/**
 * Get analysis status (for progress tracking)
 * GET /api/analysis-execution/status/:projectId
 */
router.get('/status/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    // Check if results exist
    const results = await AnalysisExecutionService.getResults(projectId, userId);

    if (!results) {
      return res.json({
        success: true,
        status: 'pending',
        message: 'No analysis has been executed yet'
      });
    }

    res.json({
      success: true,
      status: 'completed',
      summary: results.summary,
      executedAt: results.metadata.executedAt,
      insightCount: results.insights.length,
      recommendationCount: results.recommendations.length
    });

  } catch (error: any) {
    console.error('❌ Error checking status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check analysis status'
    });
  }
});

export default router;
