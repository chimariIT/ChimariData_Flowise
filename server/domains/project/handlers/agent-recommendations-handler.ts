/**
 * Agent Recommendations Handler
 *
 * HTTP route handlers for agent recommendations
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';

const router = Router();

/**
 * Get agent recommendations
 */
router.post('/:id/agent-recommendations', ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required',
      });
    }

    const { goals, questions, dataSource } = req.body;

    if (!goals || !questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        error: 'Goals and questions are required',
      });
    }

    // Get project for context
    const { storage } = await import('../../../services/storage');
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Verify ownership with admin bypass
    const isAdminUser = (req.user as any)?.isAdmin || false;
    if (!isAdminUser && project.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    console.log(`[Agent Recommendations] Starting recommendation workflow for project ${projectId}`);
    console.log(`[Agent Recommendations] Input: ${questions.length} questions, ${goals.length} goals`);

    // Import agent orchestrator
    const { projectAgentOrchestrator } = await import('../../../services/project-agent-orchestrator');

    // Step 1: Get data requirements estimation
    console.log('[Agent Recommendations] Step 1: Estimating data requirements...');
    const dataEngineerAgent = await projectAgentOrchestrator.getDataEngineerAgent();
    const dataEstimate = await dataEngineerAgent.estimateDataRequirements({
      projectId,
      userId,
      goals,
      questions,
      dataSource: dataSource || 'upload',
      journeyType: project.journeyType || 'non-tech'
    });

    // Step 2: Get analysis configuration recommendations
    console.log('[Agent Recommendations] Step 2: Getting analysis config recommendations...');
    const dataScientistAgent = await projectAgentOrchestrator.getDataScientistAgent();
    const dsRecommendations = await dataScientistAgent.recommendAnalysisConfig({
      projectId,
      userId,
      dataAnalysis: dataEstimate,
      userQuestions: questions,
      analysisGoal: goals,
      journeyType: project.journeyType || 'non-tech'
    });

    // Combine results
    const result = {
      projectId,
      userId,
      dataRequirements: dataEstimate,
      analysisConfig: dsRecommendations,
      recommendedActions: [
        'Review data requirements estimation',
        'Configure analysis settings based on recommendations',
        'Proceed with analysis execution',
      ],
      generatedAt: new Date().toISOString(),
    };

    console.log('[Agent Recommendations] Workflow complete:', {
      dataRequirementsFound: !!dataEstimate,
      analysisConfigFound: !!dsRecommendations,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Agent recommendations error:', error);
    const status = error instanceof Error && error.message.includes('not found') ? 404 :
                  error instanceof Error && error.message.includes('denied') ? 403 :
                  error instanceof Error && error.message.includes('required') ? 400 :
                  500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get agent recommendations',
    });
  }
});

export default router;
