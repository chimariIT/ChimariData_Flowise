// server/routes/analysis-plans.ts
// API routes for Plan Step - Analysis Plan creation, approval, and execution

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';
import { db } from '../db';
import { analysisPlans, projects, decisionAudits, datasets, projectDatasets, agentCheckpoints } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { getMessageBroker } from '../services/agents/message-broker';
import { nanoid } from 'nanoid';

const router = Router();
const STALE_PLAN_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const projectManagerAgent = new ProjectManagerAgent();
const messageBroker = getMessageBroker();

// ==========================================
// Helper: Calculate Per-Analysis Duration (Phase 4 - Jan 2026)
// ==========================================
/**
 * Calculates realistic duration estimate for each analysis type
 * Based on analysis complexity, dataset size, and technique count
 */
function calculateAnalysisDuration(analysisType: string, datasetSize: number, techniqueCount: number = 1): string {
  // Base minutes for each analysis type
  const baseMinutes: Record<string, number> = {
    // Descriptive
    'descriptive': 2,
    'descriptive_statistics': 2,
    'exploratory_data_analysis': 3,
    'summary_statistics': 2,

    // Correlation & Relationships
    'correlation': 3,
    'correlation_analysis': 3,
    'relationship_analysis': 4,

    // Regression & Prediction
    'regression': 5,
    'regression_analysis': 5,
    'predictive_modeling': 7,
    'prediction': 7,
    'forecast': 8,
    'forecasting': 8,

    // Clustering & Segmentation
    'clustering': 7,
    'segmentation': 5,
    'customer_segmentation': 6,
    'market_segmentation': 6,

    // Classification
    'classification': 8,
    'classification_modeling': 8,

    // Time Series
    'time_series': 10,
    'time_series_analysis': 10,
    'trend_analysis': 5,

    // Text & Sentiment
    'sentiment': 6,
    'sentiment_analysis': 6,
    'text_analysis': 8,

    // Comparative
    'comparative': 4,
    'comparative_analysis': 4,
    'benchmark_analysis': 5,

    // Advanced
    'anomaly_detection': 6,
    'feature_engineering': 4,
    'dimensionality_reduction': 5,
  };

  // Normalize analysis type for lookup
  const normalizedType = (analysisType || 'descriptive').toLowerCase()
    .replace(/[^a-z_]/g, '_')
    .replace(/_+/g, '_');

  const base = baseMinutes[normalizedType] || 5; // Default 5 minutes for unknown types

  // Scale by dataset size (rows)
  let scaleFactor = 1;
  if (datasetSize > 10000) scaleFactor = 1.5;
  if (datasetSize > 100000) scaleFactor = 2;
  if (datasetSize > 500000) scaleFactor = 2.5;
  if (datasetSize > 1000000) scaleFactor = 3;

  // Scale by technique count
  const techniqueMultiplier = 1 + (techniqueCount - 1) * 0.2;

  const minutes = Math.ceil(base * scaleFactor * techniqueMultiplier);

  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? '1 hr' : `${hours} hrs`;
}

/**
 * Sums duration strings into total estimate
 */
function sumDurations(analyses: Array<{ estimatedDuration?: string }>): string {
  let totalMinutes = 0;

  for (const analysis of analyses) {
    const duration = analysis.estimatedDuration || '5 min';
    const match = duration.match(/(\d+)\s*(min|hr)/i);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      totalMinutes += unit === 'hr' || unit === 'hrs' ? value * 60 : value;
    }
  }

  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return hours === 1 ? '1 hr' : `${hours} hrs`;
  return `${hours} hr ${mins} min`;
}

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

    // ✅ SLA: Plan creation must complete in under 30 seconds for <1 minute total journey lifecycle
    const PLAN_CREATION_TIMEOUT = 30 * 1000; // 30 seconds (reduced from 5 minutes for SLA compliance)
    const planPromise = projectManagerAgent.createAnalysisPlan({
      projectId,
      userId,
      project: {
        id: project.id,
        name: project.name || '',
        journeyType: project.journeyType || 'non-tech',
        data: project.data || [],
        schema: project.schema || {},
        objectives: project.objectives || '',
        businessContext: project.businessContext || {},
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

    const project = accessCheck.project;

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

    // ==========================================
    // PHASE 4 FIX: Extract analysisPath from requirementsDocument (Jan 2026)
    // Pull real analysis types from DS recommendations with per-analysis estimates
    // ==========================================
    const journeyProgress = (project as any)?.journeyProgress || {};
    const requirementsDoc = journeyProgress?.requirementsDocument || {};
    let analysisPath = requirementsDoc?.analysisPath || [];

    // DEBUG: Log analysisPath sources
    console.log(`📊 [Plan Progress] Checking analysisPath for project ${projectId}:`);
    console.log(`   - requirementsDocument.analysisPath: ${analysisPath.length} items`);
    console.log(`   - plan.analysisSteps: ${(plan.analysisSteps as any[])?.length || 0} items`);

    // Fallback to plan.analysisSteps if requirementsDocument.analysisPath is empty
    if (analysisPath.length === 0 && plan.analysisSteps && (plan.analysisSteps as any[]).length > 0) {
        console.log(`📊 [Plan Progress] Using plan.analysisSteps as fallback for analysisPath`);
        analysisPath = (plan.analysisSteps as any[]).map((step: any) => ({
            analysisId: step.id || step.analysisId,
            analysisName: step.name || step.analysisName || step.type,
            analysisType: step.type || step.analysisType || 'descriptive',
            techniques: step.techniques || [],
            dependencies: step.dependencies || [],
            description: step.description || ''
        }));
    }

    // Get dataset size for duration calculation
    let datasetSize = 0;
    try {
      const { storage } = await import('../services/storage');
      const projectDatasetsList = await storage.getProjectDatasets(projectId);
      if (projectDatasetsList && projectDatasetsList.length > 0) {
        const primaryDataset = projectDatasetsList[0];
        const datasetObj = (primaryDataset as any)?.dataset || primaryDataset;
        datasetSize = (datasetObj as any)?.recordCount || (datasetObj as any)?.rowCount || 0;
      }
    } catch (e) {
      console.warn('Could not fetch dataset size for duration calculation:', e);
    }

    // Build per-analysis breakdown with realistic estimates
    const analysesBreakdown = analysisPath.map((analysis: any, index: number) => {
      const analysisType = analysis?.analysisType || analysis?.type || analysis?.method || 'descriptive';
      const techniques = analysis?.techniques || [];

      return {
        analysisId: analysis?.analysisId || `analysis_${index + 1}`,
        analysisName: analysis?.analysisName || analysis?.name || `Analysis ${index + 1}`,
        analysisType,
        techniques,
        requiredElements: analysis?.requiredDataElements || [],
        estimatedDuration: calculateAnalysisDuration(analysisType, datasetSize, techniques.length || 1),
        dependencies: analysis?.dependencies || [],
        status: 'pending',
        description: analysis?.description || analysis?.purpose || '',
        expectedOutputs: analysis?.expectedOutputs || []
      };
    });

    // Calculate total duration from per-analysis estimates
    const totalEstimatedDuration = analysesBreakdown.length > 0
      ? sumDurations(analysesBreakdown)
      : plan.estimatedDuration || 'Calculating...';

    console.log(`📋 Retrieved plan ${plan.id} for project ${projectId} (status: ${plan.status})`);
    console.log(`📊 [Phase 4] Per-analysis breakdown: ${analysesBreakdown.length} analyses, total: ${totalEstimatedDuration}`);

    // ✅ P1-4 FIX: Ensure visualizations and agentContributions always have valid defaults
    // Database JSONB columns may return null if not set, causing frontend errors
    const safeVisualizations = Array.isArray(plan.visualizations) ? plan.visualizations : [];
    const safeAgentContributions = (plan.agentContributions && typeof plan.agentContributions === 'object')
      ? plan.agentContributions
      : {};

    // Log for debugging
    console.log(`📊 [Plan GET] Returning visualizations: ${safeVisualizations.length} items`);
    console.log(`📊 [Plan GET] Returning agentContributions: ${Object.keys(safeAgentContributions).length} agents`);

    // TASK 3 FIX: Include requirementsDocument metadata in plan response
    // This allows frontend to access data elements even if journeyProgress wasn't loaded
    const metadata = {
      requiredDataElements: requirementsDoc?.requiredDataElements || [],
      analysisPath: analysisPath,
      questionAnswerMapping: requirementsDoc?.questionAnswerMapping || [],
      completeness: requirementsDoc?.completeness || null
    };

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
        visualizations: safeVisualizations,
        businessContext: plan.businessContext,
        mlModels: plan.mlModels || [],
        estimatedCost: plan.estimatedCost,
        estimatedDuration: plan.estimatedDuration,
        complexity: plan.complexity,
        risks: plan.risks || [],
        recommendations: plan.recommendations || [],
        agentContributions: safeAgentContributions,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        approvedAt: plan.approvedAt,
        approvedBy: plan.approvedBy,
        rejectionReason: plan.rejectionReason,
        modificationsRequested: plan.modificationsRequested,
        // ==========================================
        // NEW: Per-analysis breakdown (Phase 4 - Jan 2026)
        // ==========================================
        analyses: analysesBreakdown,
        totalEstimatedDuration,
        datasetSize,
        // TASK 3 FIX: Include requirementsDocument metadata for frontend fallback
        metadata
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
    // P2-3 FIX: Extract per-analysis breakdown from request body
    const { analysisBreakdown } = req.body || {};

    // Use CostTrackingService to lock the estimated cost
    if (plan.estimatedCost) {
      const { costTrackingService } = await import('../services/cost-tracking');
      await costTrackingService.lockEstimatedCost(projectId, plan.estimatedCost);
    }

    await db.transaction(async (tx: any) => {
      // P2-3 FIX: Persist analysisBreakdown to plan metadata
      const existingMetadata = (plan as any).metadata || {};
      const updatedMetadata = analysisBreakdown
        ? { ...existingMetadata, analysisBreakdown }
        : existingMetadata;

      await tx.update(analysisPlans)
        .set({
          status: 'approved',
          approvedAt: now,
          approvedBy: userId,
          updatedAt: now,
          metadata: updatedMetadata as any
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

    // Sync analysisPath to journeyProgress so execute step can read it
    try {
      const { storage } = await import('../services/storage');
      const currentProject = await storage.getProject(projectId);
      const currentProgress = (currentProject as any)?.journeyProgress || {};
      const currentReqDoc = currentProgress.requirementsDocument || {};

      // Build analysisPath from plan's analysisSteps
      const planAnalysisSteps = plan.analysisSteps as any[] || [];
      const analysisPath = planAnalysisSteps.map((step: any, index: number) => ({
        analysisId: step.id || `analysis_${index}`,
        analysisName: step.name || step.title || step.analysisType,
        analysisType: step.type || step.analysisType || 'descriptive',
        priority: step.priority || index + 1,
        requiredDataElements: step.requiredDataElements || step.dataElements || []
      }));

      await storage.updateProject(projectId, {
        journeyProgress: {
          ...currentProgress,
          requirementsDocument: {
            ...currentReqDoc,
            analysisPath,
            approvedPlanId: planId
          },
          approvedPlanAnalyses: analysisPath
        }
      } as any);

      console.log(`✅ [Plan Approval] Synced ${analysisPath.length} analyses to journeyProgress.requirementsDocument.analysisPath`);
    } catch (syncError) {
      console.error('⚠️ [Plan Approval] Failed to sync analysisPath:', syncError);
      // Don't fail the approval - this is a best-effort sync
    }

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

    // Verify plan is in a rejectable status (ready or approved)
    // Users can reject even approved plans if they haven't started execution
    const rejectableStatuses = ['ready', 'approved'];
    if (!rejectableStatuses.includes(plan.status || '')) {
      return res.status(400).json({
        success: false,
        error: `Cannot reject plan in '${plan.status}' status. Plan must be 'ready' or 'approved'.`
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

    // [DAY 8] Plan Refinement Loop - Call DS agent to regenerate plan with feedback
    console.log(`🔄 [Plan Refinement] Starting plan regeneration with DS agent...`);

    try {
      // Get project data for context
      const project = accessCheck.project;
      // Get datasets through projectDatasets join table
      const projectDatasetsJoin = await db.select({ dataset: datasets })
        .from(projectDatasets)
        .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
        .where(eq(projectDatasets.projectId, projectId));
      const datasetsForProject = projectDatasetsJoin.map((r: any) => r.dataset);

      // Build refinement context from previous plan
      const previousPlanContext = {
        executiveSummary: plan.executiveSummary,
        analysisSteps: JSON.parse(typeof plan.analysisSteps === 'string' ? plan.analysisSteps : JSON.stringify(plan.analysisSteps || [])),
        complexity: plan.complexity,
        risks: JSON.parse(typeof plan.risks === 'string' ? plan.risks : JSON.stringify(plan.risks || [])),
        recommendations: JSON.parse(typeof plan.recommendations === 'string' ? plan.recommendations : JSON.stringify(plan.recommendations || []))
      };

      // Import DS agent for refinement
      const { dataScienceOrchestrator } = await import('../services/data-science-orchestrator');

      // Request refined plan from DS agent
      const refinementResult = await dataScienceOrchestrator.refinePlan({
        projectId,
        userId,
        previousPlan: previousPlanContext,
        rejectionReason: reason,
        modificationsRequested: modifications,
        projectContext: {
          name: project.name,
          description: (project as any).description,
          journeyType: (project as any).journeyType || 'general',
          datasetCount: datasetsForProject.length,
          totalRows: datasetsForProject.reduce((sum: number, d: any) => sum + (d.recordCount || 0), 0)
        }
      });

      if (refinementResult.success && refinementResult.plan) {
        // Create new plan version
        const newPlanId = `plan_${nanoid()}`;
        const newVersion = (plan.version || 1) + 1;

        await db.insert(analysisPlans).values({
          id: newPlanId,
          projectId,
          version: newVersion,
          status: 'ready',
          executiveSummary: refinementResult.plan.executiveSummary || `Refined plan based on feedback: ${reason.substring(0, 100)}`,
          analysisSteps: JSON.stringify(refinementResult.plan.analysisSteps || []),
          dataAssessment: JSON.stringify(refinementResult.plan.dataAssessment || {}),
          businessContext: JSON.stringify(refinementResult.plan.businessContext || {}),
          mlModels: JSON.stringify(refinementResult.plan.mlModels || []),
          visualizations: JSON.stringify(refinementResult.plan.visualizations || []),
          estimatedCost: JSON.stringify(refinementResult.plan.estimatedCost || { total: 0 }),
          estimatedDuration: refinementResult.plan.estimatedDuration || '30 minutes',
          complexity: refinementResult.plan.complexity || 'medium',
          risks: JSON.stringify(refinementResult.plan.risks || []),
          recommendations: JSON.stringify([
            `Refined based on user feedback: ${reason.substring(0, 100)}`,
            ...(refinementResult.plan.recommendations || [])
          ]),
          agentContributions: JSON.stringify({
            data_scientist: {
              status: 'completed',
              timestamp: new Date().toISOString(),
              contribution: 'Refined plan based on user rejection feedback'
            }
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log(`✅ [Plan Refinement] New plan ${newPlanId} (v${newVersion}) generated`);

        // Create checkpoint for refined plan
        const checkpointId = nanoid();
        await db.insert(agentCheckpoints).values({
          id: checkpointId,
          projectId,
          stepName: 'plan_refinement',
          agentType: 'data_scientist',
          status: 'pending',
          message: `Refined analysis plan (v${newVersion}) generated based on user feedback`,
          data: {
            previousPlanId: planId,
            newPlanId,
            rejectionReason: reason,
            modifications,
            timestamp: new Date().toISOString()
          }
        });

        return res.json({
          success: true,
          message: 'Analysis plan rejected. New plan has been generated based on your feedback.',
          planId,
          newPlanId,
          newVersion,
          status: 'rejected',
          checkpointId
        });
      } else {
        console.warn(`⚠️ [Plan Refinement] DS agent refinement failed:`, refinementResult.error);
        return res.json({
          success: true,
          message: 'Analysis plan rejected. DS agent could not generate refined plan - please create manually.',
          planId,
          status: 'rejected',
          error: refinementResult.error || 'DS agent refinement failed'
        });
      }
    } catch (refinementError: any) {
      console.error(`❌ [Plan Refinement] Error during refinement:`, refinementError);
      // Non-blocking: Return success for rejection even if refinement fails
      return res.json({
        success: true,
        message: 'Analysis plan rejected. Automatic refinement encountered an error - please create a new plan manually.',
        planId,
        status: 'rejected',
        refinementError: refinementError.message
      });
    }

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

    // Build progress response with error details for failed states
    const isFailedState = ['rejected', 'failed', 'cancelled'].includes(plan.status || '');

    const progress = {
      planId: plan.id,
      status: plan.status,
      agentProgress: {
        dataEngineer: contributions.data_engineer?.status || 'pending',
        dataScientist: contributions.data_scientist?.status || 'pending',
        businessAgent: contributions.business_agent?.status || 'pending',
      },
      percentComplete: calculateProgressPercent(contributions),
      estimatedTimeRemaining: estimateTimeRemaining(contributions, plan.status),
      // Include error information for failed states
      ...(isFailedState && {
        error: plan.rejectionReason || `Plan ${plan.status}`,
        rejectionReason: plan.rejectionReason,
        errorDetails: {
          agentErrors: {
            dataEngineer: contributions.data_engineer?.error,
            dataScientist: contributions.data_scientist?.error,
            businessAgent: contributions.business_agent?.error,
          }
        }
      })
    };

    console.log(`📋 [Plan Progress] Project ${projectId}: status=${plan.status}, percent=${progress.percentComplete}%${isFailedState ? `, error=${plan.rejectionReason}` : ''}`);

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
