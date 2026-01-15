/**
 * Agent Workflow Routes
 *
 * API endpoints for U2A2A2U workflow:
 * - Start workflow
 * - Get workflow status
 * - Continue after approval
 * - Get agent results
 */

import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';
import { agentCoordinationService } from '../services/agent-coordination-service';
import { agentResultService } from '../services/agent-result-service';
import { JourneyStateManager } from '../services/journey-state-manager';
import { getBillingService } from '../services/billing/unified-billing-service';
import { db } from '../db';

const router = Router();

/**
 * POST /api/agent-workflow/start
 * Start the U2A2A2U workflow for a project
 */
router.post('/start', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const schema = z.object({
      projectId: z.string().min(1),
      goals: z.array(z.string()).min(1),
      questions: z.array(z.string()).optional().default([]),
      analysisTypes: z.array(z.string()).min(1),
      audience: z.string().optional(),
      // CRITICAL: Accept DS-recommended analyses with priority
      analysisPath: z.array(z.any()).optional().default([]),
      // CRITICAL: Accept question-to-analysis mapping for evidence chain
      questionAnswerMapping: z.array(z.any()).optional().default([]),
      // Accept required data elements for validation
      requiredDataElements: z.array(z.any()).optional().default([]),
      // Accept PII decisions for filtering
      piiDecisions: z.any().optional().nullable()
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: validation.error.errors
      });
    }

    const { projectId, goals, questions, analysisTypes, audience, analysisPath, questionAnswerMapping, requiredDataElements, piiDecisions } = validation.data;

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    console.log(`🔄 [API] Starting U2A2A2U workflow for project ${projectId}`);
    if (analysisPath.length > 0) {
      console.log(`📋 [API] Received ${analysisPath.length} DS-recommended analyses`);
    }
    if (questionAnswerMapping.length > 0) {
      console.log(`🔗 [API] Received ${questionAnswerMapping.length} question-to-analysis mappings`);
    }

    // Start the workflow with full requirements context
    const result = await agentCoordinationService.executeWorkflow({
      projectId,
      userId,
      goals,
      questions,
      analysisTypes,
      audience,
      // CRITICAL: Pass DS recommendations and evidence chain data
      analysisPath,
      questionAnswerMapping,
      requiredDataElements,
      piiDecisions
    });

    // Track billing for workflow start
    const billingService = getBillingService();
    await billingService.trackFeatureUsage(userId, 'agent_workflow', 'large', 0);

    // Update journey state
    try {
      const journeyManager = new JourneyStateManager();
      if (result.status === 'awaiting_approval') {
        // Don't advance - waiting for user
        console.log(`⏳ Journey paused at analyze step, awaiting approval`);
      } else if (result.status === 'completed') {
        await journeyManager.completeStep(projectId, 'analyze');
      }
    } catch (journeyError) {
      console.warn('Failed to update journey state:', journeyError);
    }

    res.json({
      success: true,
      workflow: result
    });

  } catch (error: any) {
    console.error('❌ Agent workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start agent workflow'
    });
  }
});

/**
 * POST /api/agent-workflow/continue
 * Continue workflow after user approval
 */
router.post('/continue', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const schema = z.object({
      projectId: z.string().min(1),
      checkpointId: z.string().min(1),
      feedback: z.string().optional().default('approved')
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: validation.error.errors
      });
    }

    const { projectId, checkpointId, feedback } = validation.data;

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    console.log(`▶️ [API] Continuing workflow for project ${projectId}`);

    // Continue the workflow
    const result = await agentCoordinationService.continueAfterApproval(
      projectId,
      checkpointId,
      feedback
    );

    // Update journey state on completion
    if (result.status === 'completed') {
      try {
        const journeyManager = new JourneyStateManager();
        await journeyManager.completeStep(projectId, 'analyze');
        await journeyManager.completeStep(projectId, 'results');
      } catch (journeyError) {
        console.warn('Failed to update journey state:', journeyError);
      }
    }

    res.json({
      success: true,
      workflow: result
    });

  } catch (error: any) {
    console.error('❌ Continue workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to continue workflow'
    });
  }
});

/**
 * GET /api/agent-workflow/:projectId/results
 * Get all agent results for a project
 */
router.get('/:projectId/results', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    const results = await agentResultService.getProjectResults(projectId);

    res.json({
      success: true,
      results,
      count: results.length
    });

  } catch (error: any) {
    console.error('❌ Get agent results error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get agent results'
    });
  }
});

/**
 * GET /api/agent-workflow/:projectId/results/latest
 * Get latest result from each agent for a project
 */
router.get('/:projectId/results/latest', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    const latestResults = await agentResultService.getLatestResultsPerAgent(projectId);

    res.json({
      success: true,
      results: latestResults
    });

  } catch (error: any) {
    console.error('❌ Get latest results error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get latest results'
    });
  }
});

/**
 * GET /api/agent-workflow/:projectId/results/:agentType
 * Get results for a specific agent
 */
router.get('/:projectId/results/:agentType', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId, agentType } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Validate agent type
    const validAgentTypes = ['project_manager', 'data_engineer', 'data_scientist', 'business_agent'];
    if (!validAgentTypes.includes(agentType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid agent type. Must be one of: ${validAgentTypes.join(', ')}`
      });
    }

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    const results = await agentResultService.getAgentResults(projectId, agentType as any);

    res.json({
      success: true,
      results,
      count: results.length
    });

  } catch (error: any) {
    console.error('❌ Get agent type results error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get agent results'
    });
  }
});

/**
 * GET /api/agent-workflow/:projectId/status
 * Get current workflow status including blocking checkpoints
 */
router.get('/:projectId/status', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Get latest results per agent
    const latestResults = await agentResultService.getLatestResultsPerAgent(projectId);

    // Determine workflow status
    const hasDE = latestResults.data_engineer?.status === 'success';
    const hasDS = latestResults.data_scientist?.status === 'success';
    const hasBA = latestResults.business_agent?.status === 'success' || latestResults.business_agent?.status === 'partial';
    const hasPM = latestResults.project_manager?.status === 'success';

    let workflowStatus = 'not_started';
    let currentPhase = 'data_engineer';

    if (hasPM) {
      workflowStatus = 'awaiting_approval';
      currentPhase = 'checkpoint';
    } else if (hasBA || (hasDS && !hasBA)) {
      workflowStatus = 'in_progress';
      currentPhase = 'business_agent';
    } else if (hasDS) {
      workflowStatus = 'in_progress';
      currentPhase = 'business_agent';
    } else if (hasDE) {
      workflowStatus = 'in_progress';
      currentPhase = 'data_scientist';
    } else if (latestResults.data_engineer) {
      workflowStatus = 'in_progress';
      currentPhase = 'data_engineer';
    }

    // Check for synthesis/PM result which indicates checkpoint
    const allResults = await agentResultService.getProjectResults(projectId);
    const synthesisResult = allResults.find(r => r.agentType === 'project_manager' && r.taskType === 'synthesis');

    if (synthesisResult?.status === 'success') {
      workflowStatus = 'awaiting_approval';
      currentPhase = 'checkpoint';
    }

    res.json({
      success: true,
      status: {
        workflowStatus,
        currentPhase,
        agentStatuses: {
          data_engineer: latestResults.data_engineer?.status || 'not_started',
          data_scientist: latestResults.data_scientist?.status || 'not_started',
          business_agent: latestResults.business_agent?.status || 'not_started',
          project_manager: latestResults.project_manager?.status || 'not_started'
        },
        completedPhases: [
          hasDE ? 'data_engineer' : null,
          hasDS ? 'data_scientist' : null,
          hasBA ? 'business_agent' : null,
          hasPM ? 'synthesis' : null
        ].filter(Boolean)
      }
    });

  } catch (error: any) {
    console.error('❌ Get workflow status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get workflow status'
    });
  }
});

/**
 * GET /api/workflow/transparency/:projectId
 * Get workflow transparency data for dashboard
 */
router.get('/transparency/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    const project = accessCheck.project;

    // Get journey state
    const journeyManager = new JourneyStateManager();
    const journeyState = await journeyManager.getJourneyState(projectId);

    // Get agent results
    const agentResults = await agentResultService.getLatestResultsPerAgent(projectId);

    // Build workflow steps from journey progress
    const steps = [];
    const completedSteps = journeyState?.completedSteps || [];

    // Map journey steps to workflow steps
    const stepMappings = [
      { id: 'data-upload', title: 'Data Upload', agent: 'system', description: 'Upload and validate data files' },
      { id: 'data-verification', title: 'Data Verification', agent: 'data_engineer', description: 'Verify data quality and schema' },
      { id: 'data-transformation', title: 'Data Transformation', agent: 'data_engineer', description: 'Transform and prepare data' },
      { id: 'plan', title: 'Analysis Planning', agent: 'project_manager', description: 'Create analysis plan' },
      { id: 'execute', title: 'Analysis Execution', agent: 'data_scientist', description: 'Execute analysis' },
      { id: 'results', title: 'Results Review', agent: 'business_agent', description: 'Review and validate results' }
    ];

    for (const stepMapping of stepMappings) {
      const isCompleted = completedSteps.includes(stepMapping.id);
      const isCurrent = journeyState?.currentStep?.id === stepMapping.id;

      steps.push({
        id: stepMapping.id,
        title: stepMapping.title,
        description: stepMapping.description,
        status: isCompleted ? 'completed' : isCurrent ? 'in_progress' : 'pending',
        agent: stepMapping.agent,
        decisions: [],
        artifacts: [],
        dependencies: []
      });
    }

    res.json({
      steps,
      completedSteps: completedSteps.length,
      totalSteps: steps.length,
      currentPhase: journeyState?.currentStep?.id || 'Not started',
      estimatedCompletion: 'Based on analysis complexity',
      agentStatuses: {
        data_engineer: agentResults.data_engineer?.status || 'idle',
        data_scientist: agentResults.data_scientist?.status || 'idle',
        business_agent: agentResults.business_agent?.status || 'idle',
        project_manager: agentResults.project_manager?.status || 'idle'
      }
    });

  } catch (error: any) {
    console.error('❌ Get workflow transparency error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get workflow transparency'
    });
  }
});

/**
 * GET /api/agents/activities/:projectId
 * Get agent activities for a project
 */
router.get('/activities/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Get agent results
    const agentResults = await agentResultService.getLatestResultsPerAgent(projectId);

    // Map to activities format
    const activities = [];
    const agentTypes = ['project_manager', 'data_scientist', 'business_agent', 'data_engineer'];

    for (const agentType of agentTypes) {
      const result = (agentResults as any)[agentType];
      if (result) {
        activities.push({
          id: result.id || `${agentType}_${projectId}`,
          agent: agentType,
          activity: result.status === 'success' ? 'Completed' : result.status === 'running' ? 'Processing' : 'Waiting',
          status: result.status === 'success' ? 'idle' : result.status === 'running' ? 'active' : 'waiting_for_user',
          currentTask: result.taskType || 'Analysis',
          progress: result.status === 'success' ? 100 : result.status === 'running' ? 50 : 0,
          lastUpdate: result.createdAt || new Date()
        });
      }
    }

    res.json(activities);

  } catch (error: any) {
    console.error('❌ Get agent activities error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get agent activities'
    });
  }
});

/**
 * GET /api/workflow/decisions/:projectId
 * FIX: Production Readiness - Get decision audit trail for workflow transparency
 */
router.get('/decisions/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Get decision audits from database
    const { decisionAudits } = await import('@shared/schema');
    const decisions = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.projectId, projectId))
      .orderBy(decisionAudits.timestamp);

    // Format for dashboard
    const formattedDecisions = decisions.map((d: any) => ({
      id: d.id,
      agent: d.agent,
      decisionType: d.decisionType,
      decision: d.decision,
      reasoning: d.reasoning,
      confidence: d.confidence,
      impact: d.impact,
      timestamp: d.timestamp,
      alternatives: d.alternatives ? JSON.parse(d.alternatives as string) : [],
      context: d.context ? JSON.parse(d.context as string) : {}
    }));

    res.json({
      success: true,
      decisions: formattedDecisions,
      totalDecisions: formattedDecisions.length
    });

  } catch (error: any) {
    console.error('❌ Get workflow decisions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get workflow decisions'
    });
  }
});

export default router;
