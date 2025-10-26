// server/routes/analysis-execution.ts
/**
 * Analysis Execution API Routes
 * Endpoints for executing and retrieving real data analysis
 */

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { AnalysisExecutionService } from '../services/analysis-execution';
import { z } from 'zod';

const router = Router();

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

    console.log(`🚀 Analysis execution requested for project ${projectId}`);
    console.log(`📊 Analysis types: ${analysisTypes.join(', ')}`);

    // Execute analysis
    const results = await AnalysisExecutionService.executeAnalysis({
      projectId,
      userId,
      analysisTypes,
      datasetIds
    });

    res.json({
      success: true,
      message: 'Analysis completed successfully',
      results: {
        projectId: results.projectId,
        summary: results.summary,
        insightCount: results.insights.length,
        recommendationCount: results.recommendations.length,
        executedAt: results.metadata.executedAt
      }
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
 * Generate preview of analysis results before payment
 * GET /api/analysis-execution/preview/:projectId
 */
router.get('/preview/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    console.log(`👁️ Generating preview for project ${projectId}`);

    // Generate preview (sample analysis on 10% of data)
    const preview = await AnalysisExecutionService.generatePreview(projectId, userId);

    res.json({
      success: true,
      preview: {
        summary: preview.summary,
        keyInsights: preview.keyInsights.slice(0, 3), // Limit to 3 insights
        sampleSize: preview.sampleSize,
        totalRecords: preview.totalRecords,
        estimatedDuration: preview.estimatedDuration,
        expectedVisualizations: preview.expectedVisualizations
      },
      upgradePrompt: 'Upgrade to see full analysis results',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Preview generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate preview'
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
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    console.log(`📖 Fetching results for project ${projectId}`);

    // Get results
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
