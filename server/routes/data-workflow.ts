/**
 * Data Workflow Routes
 * Handles resilient workflow execution with interactive clarifications
 */

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { requireOwnership } from '../middleware/rbac';
import { resilientWorkflowManager } from '../services/resilient-workflow-manager';
import { db } from '../db';
import { projects, projectSessions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/data-workflow/start
 * Start a resilient workflow for data processing
 */
router.post('/start', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const {
      projectId,
      sessionId,
      files,
      userGoal,
      questions,
      allowFallbacks = true,
      requireClarifications = true
    } = req.body;

    // Validate required fields
    if (!projectId || !sessionId || !files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, sessionId, files (array)'
      });
    }

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, userId)
      )
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found or access denied'
      });
    }

    console.log(`🚀 Starting resilient workflow for project ${projectId}, session ${sessionId}`);

    // Execute workflow
    const workflowState = await resilientWorkflowManager.executeWorkflow({
      projectId,
      sessionId,
      files,
      userGoal,
      questions,
      allowFallbacks,
      requireClarifications
    });

    // Check if workflow paused for clarifications
    if (workflowState.clarificationsPending.length > 0) {
      return res.status(200).json({
        success: true,
        status: 'paused_for_clarifications',
        message: `Workflow paused: ${workflowState.clarificationsPending.length} clarifications needed`,
        workflowState: {
          sessionId: workflowState.sessionId,
          currentStage: workflowState.currentStage,
          clarificationsNeeded: workflowState.clarificationsPending.length,
          clarifications: workflowState.clarificationsPending,
          stagesSummary: workflowState.stages.map(s => ({
            name: s.name,
            status: s.status,
            fallbackUsed: s.fallbackUsed
          }))
        }
      });
    }

    // Workflow completed
    return res.status(200).json({
      success: true,
      status: 'completed',
      message: 'Workflow completed successfully',
      workflowState: {
        sessionId: workflowState.sessionId,
        currentStage: workflowState.currentStage,
        stagesSummary: workflowState.stages.map(s => ({
          name: s.name,
          status: s.status,
          fallbackUsed: s.fallbackUsed,
          duration: s.startTime && s.endTime
            ? Math.round((s.endTime.getTime() - s.startTime.getTime()) / 1000)
            : null
        })),
        hasResults: !!workflowState.analysisResults
      }
    });

  } catch (error: any) {
    console.error('❌ Workflow start error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to start workflow'
    });
  }
});

/**
 * GET /api/data-workflow/:sessionId/clarifications
 * Get pending clarifications for a workflow session
 */
router.get('/:sessionId/clarifications', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { sessionId } = req.params;

    // Get session and verify ownership
    const session = await db.query.projectSessions.findFirst({
      where: eq(projectSessions.id, sessionId),
      with: {
        project: true
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    if (session.project.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get workflow state from session
    const workflowState = session.workflowState as any;

    if (!workflowState || !workflowState.clarificationsPending) {
      return res.status(200).json({
        success: true,
        clarifications: [],
        message: 'No clarifications pending'
      });
    }

    return res.status(200).json({
      success: true,
      clarifications: workflowState.clarificationsPending,
      sessionId: workflowState.sessionId,
      currentStage: workflowState.currentStage,
      projectId: workflowState.projectId
    });

  } catch (error: any) {
    console.error('❌ Get clarifications error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get clarifications'
    });
  }
});

/**
 * POST /api/data-workflow/:sessionId/clarifications/submit
 * Submit clarification answers and resume workflow
 */
router.post('/:sessionId/clarifications/submit', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { sessionId } = req.params;
    const { answers } = req.body;

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid answers format. Expected object with column names as keys.'
      });
    }

    // Get session and verify ownership
    const session = await db.query.projectSessions.findFirst({
      where: eq(projectSessions.id, sessionId),
      with: {
        project: true
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    if (session.project.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    console.log(`▶️  Resuming workflow for session ${sessionId} with ${Object.keys(answers).length} clarifications`);

    // Resume workflow with answers
    const workflowState = await resilientWorkflowManager.resumeWorkflow(sessionId, answers);

    // Check if more clarifications needed (edge case)
    if (workflowState.clarificationsPending.length > 0) {
      return res.status(200).json({
        success: true,
        status: 'paused_for_clarifications',
        message: `Additional clarifications needed: ${workflowState.clarificationsPending.length}`,
        workflowState: {
          sessionId: workflowState.sessionId,
          currentStage: workflowState.currentStage,
          clarificationsNeeded: workflowState.clarificationsPending.length,
          clarifications: workflowState.clarificationsPending,
          stagesSummary: workflowState.stages.map(s => ({
            name: s.name,
            status: s.status,
            fallbackUsed: s.fallbackUsed
          }))
        }
      });
    }

    // Workflow completed
    return res.status(200).json({
      success: true,
      status: 'completed',
      message: 'Workflow resumed and completed successfully',
      workflowState: {
        sessionId: workflowState.sessionId,
        currentStage: workflowState.currentStage,
        stagesSummary: workflowState.stages.map(s => ({
          name: s.name,
          status: s.status,
          fallbackUsed: s.fallbackUsed,
          duration: s.startTime && s.endTime
            ? Math.round((s.endTime.getTime() - s.startTime.getTime()) / 1000)
            : null
        })),
        hasResults: !!workflowState.analysisResults,
        transformedData: workflowState.transformedData,
        analysisResults: workflowState.analysisResults
      }
    });

  } catch (error: any) {
    console.error('❌ Submit clarifications error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit clarifications and resume workflow'
    });
  }
});

/**
 * GET /api/data-workflow/:sessionId/status
 * Get current workflow status
 */
router.get('/:sessionId/status', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { sessionId } = req.params;

    // Get session and verify ownership
    const session = await db.query.projectSessions.findFirst({
      where: eq(projectSessions.id, sessionId),
      with: {
        project: true
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    if (session.project.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get workflow state from session
    const workflowState = session.workflowState as any;

    if (!workflowState) {
      return res.status(200).json({
        success: true,
        status: 'not_started',
        message: 'Workflow not started for this session'
      });
    }

    // Determine overall status
    let overallStatus = 'in_progress';
    const failedStages = workflowState.stages?.filter((s: any) => s.status === 'failed') || [];
    const completedStages = workflowState.stages?.filter((s: any) => s.status === 'completed') || [];
    const allStagesCount = workflowState.stages?.length || 0;

    if (workflowState.clarificationsPending?.length > 0) {
      overallStatus = 'paused_for_clarifications';
    } else if (failedStages.length > 0) {
      overallStatus = 'failed';
    } else if (completedStages.length === allStagesCount) {
      overallStatus = 'completed';
    }

    return res.status(200).json({
      success: true,
      status: overallStatus,
      workflowState: {
        sessionId: workflowState.sessionId,
        projectId: workflowState.projectId,
        currentStage: workflowState.currentStage,
        clarificationsNeeded: workflowState.clarificationsPending?.length || 0,
        lastCheckpoint: workflowState.lastCheckpoint,
        stages: workflowState.stages?.map((s: any) => ({
          name: s.name,
          status: s.status,
          fallbackUsed: s.fallbackUsed,
          error: s.error,
          duration: s.startTime && s.endTime
            ? Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 1000)
            : null
        })) || []
      }
    });

  } catch (error: any) {
    console.error('❌ Get workflow status error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get workflow status'
    });
  }
});

export default router;
