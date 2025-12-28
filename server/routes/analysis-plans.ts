// server/routes/analysis-plans.ts
// API routes for Plan Step - Analysis Plan creation, approval, and execution

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';
import { db } from '../db';
import { analysisPlans, projects, decisionAudits } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { getMessageBroker } from '../services/agents/message-broker';
import { nanoid } from 'nanoid';
import { normalizeJourneyType } from '@shared/canonical-types';
import { parseJourneyProgress } from '../utils/journey-progress';

const router = Router();
const STALE_PLAN_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const projectManagerAgent = new ProjectManagerAgent();
const messageBroker = getMessageBroker();

// ==========================================
// Plan Step Event Subscriptions
// ==========================================
console.log('📋 Setting up Plan Step event subscriptions...');

messageBroker.on('plan:creation_started', async (message) => {
  console.log('📨 Plan Creation Started:', message.data?.projectId);
});

messageBroker.on('plan:ready', async (message) => {
  console.log('📨 Plan Ready for Approval:', message.data?.planId);
});

messageBroker.on('plan:approved', async (message) => {
  console.log('📨 Plan Approved:', message.data?.planId);
});

messageBroker.on('plan:rejected', async (message) => {
  console.log('📨 Plan Rejected:', message.data?.planId, message.data?.reason);
});

// ==========================================
// ROUTE: Create Analysis Plan
// POST /api/projects/:projectId/plan/create
// ==========================================
/**
 * Initiates analysis plan creation by coordinating PM, DE, DS, and Business agents
 *
 * Flow:
 * 1. Verify project ownership
 * 2. Check if plan already exists
 * 3. Trigger PM agent orchestration (createAnalysisPlan)
 * 4. Return plan ID and status
 */
router.post('/:projectId/plan/create', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    console.log(`📋 Plan creation requested for project ${projectId} by user ${userId}`);

    // Verify project ownership
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      console.log(`⚠️ Access denied: ${accessCheck.reason}`);
      return res.status(403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    const project = accessCheck.project;

    // Check if plan already exists for this project
    const existingPlan = await db.select()
      .from(analysisPlans)
      .where(eq(analysisPlans.projectId, projectId))
      .orderBy(desc(analysisPlans.version))
      .limit(1);

    if (existingPlan.length > 0) {
      const activeStatuses = new Set(['pending', 'ready', 'approved', 'executing']);
      const latestPlan = existingPlan[0];

      if (activeStatuses.has(latestPlan.status)) {
        const isPending = latestPlan.status === 'pending';
        const createdAtMs = latestPlan.createdAt ? new Date(latestPlan.createdAt).getTime() : 0;
        const isStale = isPending && (!createdAtMs || (Date.now() - createdAtMs) > STALE_PLAN_THRESHOLD_MS);

        if (isPending && isStale) {
          console.warn(`⚠️ Stale pending plan detected (${latestPlan.id}). Auto-cancelling to regenerate.`);
          await db.update(analysisPlans)
            .set({
              status: 'cancelled',
              updatedAt: new Date(),
              rejectionReason: 'Automatically cancelled after exceeding SLA'
            })
            .where(eq(analysisPlans.id, latestPlan.id));
        } else {
          console.log(`⚠️ Active plan already exists: ${latestPlan.id} (${latestPlan.status})`);
          return res.status(400).json({
            success: false,
            error: 'An active analysis plan already exists for this project',
            existingPlanId: latestPlan.id,
            status: latestPlan.status
          });
        }
      }
    }

    // Publish plan creation start event
    await messageBroker.publish('plan:creation_started', {
      projectId,
      userId,
      timestamp: new Date().toISOString()
    });

    // [DATA CONTINUITY FIX] Extract journeyProgress to use transformed data and previous step outputs
    const journeyProgress = parseJourneyProgress((project as any)?.journeyProgress || {}) as any;

    // Prioritize transformed data over original data (Step 4→5 data flow)
    const transformedData = journeyProgress?.transformationStepData?.transformedData ||
                           journeyProgress?.joinedData?.fullData ||
                           project.data || [];

    // Use joined schema or transformed schema over original
    const effectiveSchema = journeyProgress?.joinedData?.schema ||
                           journeyProgress?.transformationStepData?.schema ||
                           project.schema || {};

    // Extract user questions and analysis goal from journeyProgress (Step 2→5 data flow)
    const userQuestions = journeyProgress?.userQuestions?.map((q: any) => q.text || q) || [];
    const analysisGoal = journeyProgress?.analysisGoal || project.objectives || '';
    const requirementsDocument = journeyProgress?.requirementsDocument || null;
    const transformationDocument = journeyProgress?.transformationDocument || null;

    console.log(`📋 [STEP 4→5 FIX] Using ${transformedData.length} rows (${journeyProgress?.transformationStepData ? 'transformed' : journeyProgress?.joinedData ? 'joined' : 'original'} data)`);
    console.log(`📋 [STEP 4→5 FIX] Schema has ${Object.keys(effectiveSchema).length} columns, ${userQuestions.length} user questions`);

    // ✅ SLA: Plan creation must complete in under 30 seconds for <1 minute total journey lifecycle
    const PLAN_CREATION_TIMEOUT = 30 * 1000; // 30 seconds (reduced from 5 minutes for SLA compliance)
    const planPromise = projectManagerAgent.createAnalysisPlan({
      projectId,
      userId,
      project: {
        id: project.id,
        name: project.name || '',
        journeyType: normalizeJourneyType(project.journeyType as string | null),
        data: transformedData,  // [FIX] Use transformed data from Step 4
        schema: effectiveSchema, // [FIX] Use joined/transformed schema
        objectives: analysisGoal, // [FIX] Use analysis goal from Step 2
        businessContext: project.businessContext || {},
      },
      // [DATA CONTINUITY] Pass previous step artifacts for context
      journeyContext: {
        userQuestions,
        analysisGoal,
        requirementsDocument,
        transformationDocument,
        audience: journeyProgress?.audience || null,
        dataQualityApproved: journeyProgress?.dataQualityApproved || false,
        completedSteps: journeyProgress?.completedSteps || [],
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Plan creation timed out after 30 seconds. Please try again or contact support if the issue persists.')), PLAN_CREATION_TIMEOUT)
    );

    const planResult = await Promise.race([planPromise, timeoutPromise]) as any;

    if (!planResult.success) {
      console.log(`❌ Plan creation failed: ${planResult.error}`);
      return res.status(500).json({
        success: false,
        error: planResult.error
      });
    }

    console.log(`✅ Plan created: ${planResult.planId}`);

    // ✅ Create decision audit trail entries
    try {
      console.log(`📝 Creating decision audit trail for project ${projectId}`);

      const plan = planResult.plan;
      if (!plan) {
        console.warn('⚠️ Plan is undefined, skipping audit trail creation');
        return res.status(201).json({
          success: true,
          message: 'Analysis plan created successfully',
          planId: planResult.planId,
          plan: planResult.plan,
          status: 'ready'
        });
      }

      const auditEntries = [];
      const agentContributions = plan.agentContributions as Record<string, any> || {};

      // Data Engineer decision
      if (agentContributions.data_engineer) {
        const deContribution = agentContributions.data_engineer;
        auditEntries.push({
          id: nanoid(),
          projectId,
          agent: 'data_engineer',
          decisionType: 'data_quality_assessment',
          decision: 'Data quality approved for analysis',
          reasoning: deContribution.contribution || 'Data meets quality standards',
          alternatives: JSON.stringify(['reject_data', 'request_cleaning']),
          confidence: 90,
          context: JSON.stringify({ stepId: 'data_verification', planId: planResult.planId }),
          impact: 'high',
          reversible: false,
          timestamp: new Date()
        });
      }

      // Data Scientist decision
      if (agentContributions.data_scientist) {
        const dsContribution = agentContributions.data_scientist;
        auditEntries.push({
          id: nanoid(),
          projectId,
          agent: 'data_scientist',
          decisionType: 'analysis_recommendation',
          decision: `Recommended ${plan.analysisSteps?.length || 0} analysis steps`,
          reasoning: dsContribution.contribution || 'Based on data characteristics',
          alternatives: JSON.stringify([]),
          confidence: 85,
          context: JSON.stringify({ stepId: 'plan', planId: planResult.planId, analysisSteps: plan.analysisSteps }),
          impact: 'high',
          reversible: true,
          timestamp: new Date()
        });
      }

      // Project Manager decision
      auditEntries.push({
        id: nanoid(),
        projectId,
        agent: 'project_manager',
        decisionType: 'cost_estimation',
        decision: `Estimated analysis cost: $${plan.estimatedCost?.total || 0}`,
        reasoning: 'Based on complexity, data volume, and selected analysis types',
        alternatives: JSON.stringify([]),
        confidence: 80,
        context: JSON.stringify({ stepId: 'plan', planId: planResult.planId, breakdown: plan.estimatedCost }),
        impact: 'medium',
        reversible: false,
        timestamp: new Date()
      });

      // Insert all audit entries
      if (auditEntries.length > 0) {
        await db.insert(decisionAudits).values(auditEntries);
        console.log(`✅ Created ${auditEntries.length} decision audit entries`);
      }

    } catch (auditError) {
      console.error('❌ Failed to create decision audit:', auditError);
      // Don't fail the whole request if audit creation fails
    }

    return res.status(201).json({
      success: true,
      message: 'Analysis plan created successfully',
      planId: planResult.planId,
      plan: planResult.plan,
      status: 'ready'
    });

  } catch (error) {
    console.error('❌ Error creating analysis plan:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create analysis plan'
    });
  }
});

// ==========================================
// ROUTE: Get Analysis Plan
// GET /api/projects/:projectId/plan
// ==========================================
/**
 * Retrieves the current analysis plan for a project
 * Returns the latest version if multiple plans exist
 */
router.get('/:projectId/plan', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    // Verify project ownership
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Get latest plan
    const plans = await db.select()
      .from(analysisPlans)
      .where(eq(analysisPlans.projectId, projectId))
      .orderBy(desc(analysisPlans.version))
      .limit(1);

    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No analysis plan found for this project'
      });
    }

    const plan = plans[0];

    console.log(`📋 Retrieved plan ${plan.id} for project ${projectId} (status: ${plan.status})`);

    return res.json({
      success: true,
      plan: {
        id: plan.id,
        projectId: plan.projectId,
        version: plan.version,
        status: plan.status,
        executiveSummary: plan.executiveSummary,
        dataAssessment: plan.dataAssessment,
        analysisSteps: plan.analysisSteps,
        visualizations: plan.visualizations,
        businessContext: plan.businessContext,
        mlModels: plan.mlModels,
        estimatedCost: plan.estimatedCost,
        estimatedDuration: plan.estimatedDuration,
        complexity: plan.complexity,
        risks: plan.risks,
        recommendations: plan.recommendations,
        agentContributions: plan.agentContributions,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        approvedAt: plan.approvedAt,
        approvedBy: plan.approvedBy,
        rejectionReason: plan.rejectionReason,
        modificationsRequested: plan.modificationsRequested,
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving analysis plan:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve analysis plan'
    });
  }
});

// ==========================================
// ROUTE: Approve Analysis Plan
// POST /api/projects/:projectId/plan/:planId/approve
// ==========================================
/**
 * User approves the analysis plan
 * Updates status from 'ready' to 'approved'
 * Plan can now be executed
 */
router.post('/:projectId/plan/:planId/approve', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId, planId } = req.params;

    console.log(`✅ Plan approval requested: ${planId} by user ${userId}`);

    // Verify project ownership
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Get the plan
    const plans = await db.select()
      .from(analysisPlans)
      .where(and(
        eq(analysisPlans.id, planId),
        eq(analysisPlans.projectId, projectId)
      ))
      .limit(1);

    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Analysis plan not found'
      });
    }

    const plan = plans[0];

    // Verify plan is in 'ready' status
    if (plan.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: `Cannot approve plan in '${plan.status}' status. Plan must be 'ready'.`
      });
    }

    const now = new Date();

    // Use CostTrackingService to lock the estimated cost
    if (plan.estimatedCost) {
      const { costTrackingService } = await import('../services/cost-tracking');
      await costTrackingService.lockEstimatedCost(projectId, plan.estimatedCost);
    }

    await db.transaction(async (tx: any) => {
      await tx.update(analysisPlans)
        .set({
          status: 'approved',
          approvedAt: now,
          approvedBy: userId,
          updatedAt: now,
        })
        .where(eq(analysisPlans.id, planId));

      await tx.update(projects)
        .set({
          approvedPlanId: planId,
          // Cost fields are handled by lockEstimatedCost above
          analysisExecutedAt: null,
          analysisBilledAt: null,
          analysisResults: null,
          updatedAt: now,
        })
        .where(eq(projects.id, projectId));
    });

    // Publish approval event
    await messageBroker.publish('plan:approved', {
      planId,
      projectId,
      userId,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ Plan ${planId} approved by user ${userId}`);

    return res.json({
      success: true,
      message: 'Analysis plan approved successfully',
      planId,
      status: 'approved'
    });

  } catch (error) {
    console.error('❌ Error approving analysis plan:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve analysis plan'
    });
  }
});

// ==========================================
// ROUTE: Reject Analysis Plan
// POST /api/projects/:projectId/plan/:planId/reject
// ==========================================
/**
 * User rejects the analysis plan with feedback
 * PM agent will regenerate plan based on feedback
 *
 * Request body: { reason: string, modifications?: string }
 */
router.post('/:projectId/plan/:planId/reject', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId, planId } = req.params;
    const { reason, modifications } = req.body;

    console.log(`❌ Plan rejection requested: ${planId} by user ${userId}`);

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    // Verify project ownership
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Get the plan
    const plans = await db.select()
      .from(analysisPlans)
      .where(and(
        eq(analysisPlans.id, planId),
        eq(analysisPlans.projectId, projectId)
      ))
      .limit(1);

    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Analysis plan not found'
      });
    }

    const plan = plans[0];

    // Verify plan is in 'ready' status
    if (plan.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: `Cannot reject plan in '${plan.status}' status. Plan must be 'ready'.`
      });
    }

    // Update plan status to 'rejected'
    await db.update(analysisPlans)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        modificationsRequested: modifications || null,
        updatedAt: new Date(),
      })
      .where(eq(analysisPlans.id, planId));

    // Publish rejection event
    await messageBroker.publish('plan:rejected', {
      planId,
      projectId,
      userId,
      reason,
      modifications,
      timestamp: new Date().toISOString()
    });

    console.log(`❌ Plan ${planId} rejected by user ${userId}: ${reason}`);

    // TODO: Implement handlePlanRejection method in ProjectManagerAgent
    // This method should regenerate the analysis plan based on user feedback
    // For now, just updating the plan status to rejected
    console.log(`❌ Plan ${planId} rejected by user ${userId}: ${reason}`);
    console.log(`⚠️ Plan regeneration not yet implemented - plan status set to rejected`);

    return res.json({
      success: true,
      message: 'Analysis plan rejected. Plan regeneration feature needs implementation.',
      planId,
      status: 'rejected',
      note: 'handlePlanRejection method not yet implemented in ProjectManagerAgent'
    });

    /* UNCOMMENT WHEN IMPLEMENTED:
    const regenerationResult = await projectManagerAgent.handlePlanRejection({
      planId,
      projectId,
      userId,
      rejectionReason: reason,
      modificationsRequested: modifications,
      previousPlan: plan
    });

    if (regenerationResult.success) {
      console.log(`✅ New plan generated: ${regenerationResult.newPlanId}`);
      return res.json({
        success: true,
        message: 'Analysis plan rejected. New plan has been generated based on your feedback.',
        planId,
        newPlanId: regenerationResult.newPlanId,
        status: 'rejected'
      });
    } else {
      console.error(`❌ Plan regeneration failed: ${regenerationResult.error}`);
      return res.json({
        success: true,
        message: 'Analysis plan rejected. Plan regeneration encountered an error.',
        planId,
        status: 'rejected',
        error: regenerationResult.error
      });
    }
    */

  } catch (error) {
    console.error('❌ Error rejecting analysis plan:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reject analysis plan'
    });
  }
});

// ==========================================
// ROUTE: Get Plan Creation Progress
// GET /api/projects/:projectId/plan/progress
// ==========================================
/**
 * Real-time progress updates during plan creation
 * Shows which agents have completed their analysis
 */
router.get('/:projectId/plan/progress', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;
    const { projectId } = req.params;

    // Verify project ownership
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Get latest plan
    const plans = await db.select()
      .from(analysisPlans)
      .where(eq(analysisPlans.projectId, projectId))
      .orderBy(desc(analysisPlans.version))
      .limit(1);

    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No analysis plan found for this project'
      });
    }

    const plan = plans[0];

    // Extract agent progress from agentContributions
    const contributions = plan.agentContributions as Record<string, any> || {};

    // FIX #33: Include rejectionReason in progress response so frontend can display error
    const progress = {
      planId: plan.id,
      status: plan.status,
      rejectionReason: plan.rejectionReason || null, // FIX: Return rejection reason for failed/rejected plans
      agentProgress: {
        dataEngineer: contributions.data_engineer?.status || 'pending',
        dataScientist: contributions.data_scientist?.status || 'pending',
        businessAgent: contributions.business_agent?.status || 'pending',
      },
      percentComplete: calculateProgressPercent(contributions),
      estimatedTimeRemaining: estimateTimeRemaining(contributions, plan.status),
    };

    return res.json({
      success: true,
      progress
    });

  } catch (error) {
    console.error('❌ Error retrieving plan progress:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve plan progress'
    });
  }
});

// ==========================================
// Helper Functions
// ==========================================

/**
 * Calculate overall progress percentage based on agent contributions
 */
function calculateProgressPercent(contributions: Record<string, any>): number {
  const agents = ['data_engineer', 'data_scientist', 'business_agent'];
  let completed = 0;

  for (const agent of agents) {
    if (contributions[agent]?.status === 'completed') {
      completed++;
    }
  }

  return Math.round((completed / agents.length) * 100);
}

/**
 * Estimate time remaining based on agent progress
 */
function estimateTimeRemaining(contributions: Record<string, any>, planStatus: string): string {
  if (planStatus === 'ready' || planStatus === 'approved') {
    return '0 minutes';
  }

  const agents = ['data_engineer', 'data_scientist', 'business_agent'];
  let pending = 0;

  for (const agent of agents) {
    if (contributions[agent]?.status !== 'completed') {
      pending++;
    }
  }

  // Rough estimate: 2 minutes per agent
  const estimatedMinutes = pending * 2;
  return `${estimatedMinutes} minutes`;
}

export default router;
