// server/routes/analysis-execution.ts
/**
 * Analysis Execution API Routes
 * Endpoints for executing and retrieving real data analysis
 *
 * Payment Gate Architecture (Aligned with Billing System):
 * 1. Check subscription tier via canAccessJourney() - tier determines allowed journey types
 * 2. Check/track quota via trackFeatureUsage() - within quota = free, exceeded = overage charges
 * 3. Fallback: Pay-per-analysis for one-off projects (project.isPaid)
 * 4. Preview mode available for all tiers before consuming quota
 */

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { AnalysisExecutionService } from '../services/analysis-execution';
import { canAccessProject } from '../middleware/ownership';
import { z } from 'zod';
import { ArtifactGenerator } from '../services/artifact-generator';
import { storage } from '../storage';
import { JourneyStateManager } from '../services/journey-state-manager';
import { getPiiExcludedColumns, getPiiConfig } from '../services/pii-helper';
import { extractDatasetRows } from '../services/analysis-data-helpers';
import { getBillingService } from '../services/billing/unified-billing-service';
import { requireAnyFeature, GATED_FEATURES } from '../middleware/feature-gate';
import type { CostBreakdown } from '@shared/schema';
import type { FeatureComplexity, JourneyType } from '@shared/canonical-types';
import { resolvePipelineIndustry } from '../services/pipeline-context';

const router = Router();

type AnalysisExecutionResult = Awaited<ReturnType<typeof AnalysisExecutionService.executeAnalysis>>;

interface AnalysisExecutionResponsePayload {
  projectId: AnalysisExecutionResult['projectId'];
  summary: AnalysisExecutionResult['summary'];
  insights: AnalysisExecutionResult['insights'];
  recommendations: AnalysisExecutionResult['recommendations'];
  visualizations: AnalysisExecutionResult['visualizations'];
  analysisTypes: AnalysisExecutionResult['analysisTypes'];
  metadata: AnalysisExecutionResult['metadata'] & {
    datasetCount: number;
    requestedAnalysisTypes?: string[];
    normalizedAnalysisTypes?: string[];
  };
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
  // PHASE 6: Per-analysis execution tracking for dashboard display
  analysisStatuses?: Array<{
    analysisId: string;
    analysisName: string;
    analysisType: string;
    status: string;
    insightCount: number;
    errorMessage?: string;
    executionTimeMs?: number;
    requiredDataElements?: string[];
  }>;
  perAnalysisBreakdown?: Record<string, {
    status: string;
    insights?: any[];
    visualizations?: any[];
    recommendations?: any[];
    error?: string;
    executionTimeMs?: number;
  }>;
}

/**
 * Helper function to determine analysis complexity based on project data
 */
function determineComplexity(project: any): FeatureComplexity {
  const datasets = project?.datasets || [];
  const totalRows = datasets.reduce((sum: number, ds: any) => {
    const count = ds?.dataset?.recordCount || ds?.recordCount || 0;
    return sum + count;
  }, 0);
  const totalCols = datasets.reduce((sum: number, ds: any) => {
    const cols = Object.keys(ds?.dataset?.schema || ds?.schema || {}).length;
    return sum + cols;
  }, 0);

  // Complexity based on data size
  if (totalRows > 1000000 || totalCols > 100) return 'extra_large';
  if (totalRows > 100000 || totalCols > 50) return 'large';
  if (totalRows > 10000 || totalCols > 20) return 'medium';
  return 'small';
}

/**
 * Helper function to get recommended tier for upgrade
 */
function getRecommendedTier(currentTier: string): string {
  switch (currentTier) {
    case 'none':
    case 'trial':
      return 'starter';
    case 'starter':
      return 'professional';
    case 'professional':
      return 'enterprise';
    default:
      return 'professional';
  }
}

/**
 * Execute analysis on a project's datasets
 * POST /api/analysis-execution/execute
 *
 * Payment Gate Flow (Subscription-First Model):
 * 1. Project already paid (one-off) → Execute with full access
 * 2. Check subscription tier → canAccessJourney()
 * 3. Check/track quota → trackFeatureUsage()
 * 4. Preview mode → Limited execution without consuming quota
 */
// P0-5 FIX: Removed requireAnyFeature middleware - payment/subscription checks done in handler
// The handler already checks: isPaid, subscription tier, journey access, and trial credits
// Having the middleware block BEFORE we can check isPaid prevented paid projects from executing
router.post('/execute', ensureAuthenticated, async (req, res) => {
  // Declare variables outside try block so they're accessible in catch block
  const userId = (req.user as any)?.id;
  let projectId: string = '';
  let quotaTracked = false;
  let trackedFeatureId = '';
  let trackedComplexity: FeatureComplexity = 'small';

  try {
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Validate request
    // ✅ GAP 5 FIX: Extended schema to accept analysisPath and questionAnswerMapping
    // These enable the evidence chain from questions → requirements → analysis → answers
    const schema = z.object({
      projectId: z.string().min(1),
      analysisTypes: z.array(z.string()).min(1),
      datasetIds: z.array(z.string()).optional(),
      previewOnly: z.boolean().optional(),
      // GAP 5 + GAP A: DS agent recommended analyses with required data elements and priority ordering
      analysisPath: z.array(z.object({
        analysisId: z.string(),
        analysisName: z.string(),
        analysisType: z.string().optional(),
        requiredDataElements: z.array(z.string()).optional(),
        priority: z.number().optional(),
        dependencies: z.array(z.string()).optional() // GAP A: Other analysis IDs that must complete first
      })).optional(),
      // GAP 5: Question-to-analysis mapping for evidence chain
      questionAnswerMapping: z.array(z.object({
        questionId: z.string(),
        questionText: z.string(),
        recommendedAnalyses: z.array(z.string()).optional(),
        requiredDataElements: z.array(z.string()).optional()
      })).optional()
    });

    const validation = schema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: validation.error.errors
      });
    }

    const { projectId: validatedProjectId, analysisTypes: requestedAnalysisTypes, datasetIds, analysisPath, questionAnswerMapping, previewOnly } = validation.data;
    projectId = validatedProjectId; // Assign to outer scope variable for catch block access

    // Expand analysisTypes from analysisPath if the DS agent recommended more types
    let analysisTypes = [...requestedAnalysisTypes];
    if (analysisPath && analysisPath.length > 0) {
      const pathTypes = analysisPath
        .map((a: any) => a.analysisType || a.type)
        .filter((t: string | undefined): t is string => !!t);
      const merged = [...new Set([...analysisTypes, ...pathTypes])];
      if (merged.length > analysisTypes.length) {
        console.log(`📊 [Execution] Expanded analysisTypes from ${analysisTypes.length} to ${merged.length} using analysisPath: [${merged.join(', ')}]`);
        analysisTypes = merged;
      }
    }

    const project = await storage.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get billing service for subscription/quota checks
    const billingService = getBillingService();
    const user = await storage.getUser(userId);
    const userTier = (user as any)?.subscriptionTier || 'trial';

    // ============================================================
    // PAYMENT GATE: Subscription-First Model (Aligned with Billing)
    // ============================================================

    // P0-B FIX: Validate locked cost exists before execution (unless paid or subscribed)
    const journeyProgress = (project as any).journeyProgress || {};
    // Cost SSOT: Read from journeyProgress only (project-level field is for admin views)
    const hasLockedCost = journeyProgress.lockedCostEstimate != null;

    // Step 1: Check if project already paid (one-off payment)
    const isPaid = (project as any).isPaid === true;
    if (isPaid) {
      console.log(`✅ [Billing] Project ${projectId} already paid - executing with full access`);
      // Continue to execution (no quota consumption for paid projects)
    } else {
      // P1-C FIX: If payment session exists but isPaid=false, payment hasn't completed
      const paymentSessionId = (project as any).paymentSessionId;
      if (paymentSessionId && !isPaid) {
        console.warn(`⚠️ [Billing] Project ${projectId} has payment session ${paymentSessionId} but isPaid=false`);
        // Allow execution only if user has subscription or trial credits (checked below)
      }

      // Step 2: Check subscription tier and journey access
      const journeyType = ((project as any).journeyType || 'non-tech') as JourneyType;
      const journeyAccess = await billingService.canAccessJourney(userId, journeyType);

      if (!journeyAccess.allowed) {
        console.log(`🚫 [Billing] Journey access denied for ${journeyType} (tier: ${userTier})`);
        return res.status(403).json({
          success: false,
          error: 'Journey access denied',
          message: journeyAccess.message || `Your ${userTier} tier does not include access to ${journeyType} journeys.`,
          requiresUpgrade: true,
          minimumTier: journeyAccess.minimumTier,
          upgradeUrl: '/billing/upgrade',
          code: 'TIER_UPGRADE_REQUIRED'
        });
      }

      // Step 3: Check and track quota usage (unless preview only)
      // Track ALL analysis types, not just the first, to prevent under-charging for multi-analysis execution
      if (!previewOnly) {
        const analysisType = analysisTypes?.[0] || 'statistical_analysis';
        const complexity = determineComplexity(project);
        trackedFeatureId = analysisType;
        trackedComplexity = complexity;
        const analysisCount = analysisTypes.length || 1;

        console.log(`📊 [Billing] Checking quota for ${analysisCount} analyses [${analysisTypes.join(', ')}] (${complexity}) - tier: ${userTier}`);

        const usageResult = await billingService.trackFeatureUsage(
          userId,
          analysisType,
          complexity,
          analysisCount // quantity: track ALL requested analyses, not just 1
        );

        if (!usageResult.allowed) {
          // Quota exceeded - check if user has trial credits as fallback
          const creditsRequired = billingService.calculateCreditsRequired(complexity, analysisTypes.length);
          const creditCheck = await billingService.checkTrialCredits(userId, creditsRequired);

          if (creditCheck.hasCredits) {
            // P0-B FIX: Add execution idempotency - check if credits already deducted for this project
            const lastExecutionId = journeyProgress.lastCreditDeductionId;
            const currentExecutionId = `${projectId}-${analysisType}-${Date.now().toString(36)}`;

            if (lastExecutionId && lastExecutionId.startsWith(`${projectId}-${analysisType}`)) {
              // Credits already deducted for this project+type - allow execution without re-deducting
              console.log(`✅ [Trial Credits] Idempotency: Credits already deducted (${lastExecutionId}), allowing execution`);
              quotaTracked = true;
            } else {
              // User has trial credits - deduct and allow execution
              console.log(`💳 [Trial Credits] Using ${creditsRequired} trial credits for ${analysisType} (${complexity})`);
              const deductResult = await billingService.deductTrialCredits(userId, creditsRequired);

              if (deductResult.success) {
                console.log(`✅ [Trial Credits] Deducted ${creditsRequired} credits. Remaining: ${deductResult.newBalance}`);
                quotaTracked = true;
                // Store deduction ID for idempotency
                try {
                  await storage.atomicMergeJourneyProgress(projectId, {
                    lastCreditDeductionId: currentExecutionId
                  });
                } catch (e) { /* non-fatal */ }
              } else {
                // P0-B FIX: Return specific error instead of falling through to generic "quota exceeded"
                console.error(`❌ [Trial Credits] Failed to deduct credits: ${deductResult.message}`);
                return res.status(500).json({
                  success: false,
                  error: 'Credit deduction failed',
                  message: 'Failed to deduct trial credits. Please retry your request.',
                  code: 'CREDIT_DEDUCTION_FAILED',
                  retryable: true
                });
              }
            }
          }

          if (!creditCheck.hasCredits || !quotaTracked) {
            // No credits available - return quota exceeded with options
            const quotaStatus = await billingService.getQuotaStatus(userId, analysisType, complexity);
            const trialCreditsStatus = await billingService.getTrialCreditsStatus(userId);

            console.log(`⚠️ [Billing] Quota exceeded for ${analysisType} (${complexity}), no trial credits available`);

            return res.status(402).json({
              success: false,
              error: 'Quota exceeded',
              message: creditCheck.expired
                ? 'Your trial credits have expired. Please upgrade to continue.'
                : usageResult.message || `Your ${complexity} ${analysisType} quota has been exceeded.`,
              quotaStatus: quotaStatus || { quota: 0, used: 0, remaining: 0, percentUsed: 100, isExceeded: true },
              trialCredits: trialCreditsStatus ? {
                remaining: trialCreditsStatus.remaining,
                required: creditsRequired,
                expired: trialCreditsStatus.expired,
                expiresAt: trialCreditsStatus.expiresAt
              } : null,
              options: {
                payOverage: {
                  cost: usageResult.cost,
                  // PHASE 10 FIX: Route to payment page with overage flag instead of non-existent endpoint
                  url: `/projects/${projectId}/payment?type=overage&cost=${usageResult.cost}`
                },
                upgradeTier: {
                  url: '/billing/upgrade',
                  recommendedTier: getRecommendedTier(userTier)
                },
                payPerProject: {
                  url: `/projects/${projectId}/payment`,
                  description: 'Pay for this specific project analysis'
                }
              },
              code: creditCheck.expired ? 'TRIAL_EXPIRED' : 'QUOTA_EXCEEDED'
            });
          }
        }

        quotaTracked = true;
        console.log(`✅ [Billing] Quota check passed (remaining: ${usageResult.remainingQuota}, cost: $${usageResult.cost.toFixed(2)})`);

        // If there's an overage cost, log it
        if (usageResult.cost > 0) {
          console.log(`💰 [Billing] Overage charge: $${usageResult.cost.toFixed(2)} for ${analysisType} (${complexity})`);
        }
      } else {
        console.log(`👁️ [Billing] Preview mode - skipping quota tracking`);
      }
    }

    console.log(`🚀 Analysis execution requested for project ${projectId} (isPaid: ${isPaid}, tier: ${userTier})`);
    console.log(`📊 Analysis types: ${analysisTypes.join(', ')}`);

    // ✅ GAP 5 FIX: Log received DS recommendations and question mappings
    if (analysisPath && analysisPath.length > 0) {
      console.log(`📋 [GAP 5] Received ${analysisPath.length} DS-recommended analyses`);
    }
    if (questionAnswerMapping && questionAnswerMapping.length > 0) {
      console.log(`❓ [GAP 5] Received ${questionAnswerMapping.length} question-answer mappings for evidence chain`);
    }

    // PII SSOT: Use centralized helper to read excluded columns from journeyProgress
    const columnsToExclude = getPiiExcludedColumns(journeyProgress);

    if (columnsToExclude.length > 0) {
      console.log(`🔒 [PII] Columns to exclude from analysis: [${columnsToExclude.join(', ')}]`);
    } else {
      console.log(`ℹ️ [PII] No PII exclusions found in journeyProgress`);
    }

    // Set executionStatus BEFORE starting analysis (so dashboard can detect in-progress state)
    try {
      await storage.atomicMergeJourneyProgress(projectId, {
        executionStatus: 'executing',
        executionStartedAt: new Date().toISOString()
      });
      console.log(`🔄 [Execution] Set executionStatus='executing' in journeyProgress for ${projectId}`);
    } catch (statusErr) {
      console.warn(`⚠️ [Execution] Failed to set executionStatus: ${statusErr}`);
    }

    // Execute analysis with total timeout guard
    // ✅ FIX: Use executeComprehensiveAnalysis which uses DataScienceOrchestrator
    // with type-specific Python scripts (correlation_analysis.py, regression_analysis.py, etc.)
    // instead of hardcoded generic statistics
    const TOTAL_EXECUTION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes max for entire job
    const results = await Promise.race([
      AnalysisExecutionService.executeComprehensiveAnalysis({
        projectId,
        userId,
        analysisTypes,
        datasetIds,
        analysisPath,
        questionAnswerMapping,
        columnsToExclude: columnsToExclude.length > 0 ? columnsToExclude : undefined,
        // Phase 4E: Pass requirementsDocument for column role resolution in AnalysisDataPreparer
        requirementsDocument: journeyProgress?.requirementsDocument,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
          `Total analysis execution timed out after ${TOTAL_EXECUTION_TIMEOUT_MS / 1000}s. ` +
          `This usually indicates the dataset is too large or too many analysis types were selected.`
        )), TOTAL_EXECUTION_TIMEOUT_MS)
      )
    ]);

    // Set executionStatus to completed in journeyProgress + cache summary for dashboard
    try {
      // FIX 5D: Include isPreview flag — journeyProgress cache stores limited results
      const isPaid = (project as any)?.isPaid === true;
      await storage.atomicMergeJourneyProgress(projectId, {
        executionStatus: 'completed',
        executionCompletedAt: new Date().toISOString(),
        analysisResults: {
          insights: (results.insights || []).slice(0, 10),
          recommendations: (results.recommendations || []).slice(0, 5),
          summary: results.summary,
          isPreview: !isPaid, // FIX 5D: Flag to indicate limited cached results for unpaid users
          cachedAt: new Date().toISOString()
        }
      });
      console.log(`✅ [Execution] Set executionStatus='completed' in journeyProgress for ${projectId}`);
    } catch (statusErr) {
      console.warn(`⚠️ [Execution] Failed to update executionStatus: ${statusErr}`);
    }

    // Track execution cost
    try {
      const { costTrackingService } = await import('../services/cost-tracking');
      await costTrackingService.trackExecutionCost(projectId, results);
    } catch (costError) {
      console.error('❌ Failed to track execution cost:', costError);
      // Don't fail execution if cost tracking fails, but log it
    }

    // ✅ SLA: Generate artifacts asynchronously (don't block journey completion)
    // Start artifact generation in background to meet <1 minute journey lifecycle SLA
    if (project) {
      console.log(`📦 Queueing artifact generation for project ${projectId} (async)`);

      // PII SSOT: Use centralized helper for artifact generation PII config
      const journeyProgressForArtifacts = (project as any)?.journeyProgress || {};
      const piiConfig = getPiiConfig(journeyProgressForArtifacts);

      if (piiConfig.excludedColumns.length > 0) {
        console.log(`🔒 [PII] Artifact generation: ${piiConfig.excludedColumns.length} columns to exclude`);
      }

      // Run artifact generation in background without awaiting
      setImmediate(async () => {
        try {
          const artifactGenerator = new ArtifactGenerator();
          const columnsToExclude = new Set(piiConfig.excludedColumns || []);

          let datasetRowsForArtifacts: any[] = [];
          try {
            const datasets = await storage.getProjectDatasets(projectId);
            if (Array.isArray(datasets)) {
              for (const dataset of datasets) {
                try {
                  const rows = extractDatasetRows(dataset, columnsToExclude);
                  if (Array.isArray(rows) && rows.length > 0) {
                    datasetRowsForArtifacts = rows;
                    break;
                  }
                } catch (rowError) {
                  console.warn(`⚠️ [Artifacts] Failed to extract rows for dataset ${dataset?.id || 'unknown'}:`, rowError);
                }
              }
            }
          } catch (datasetError) {
            console.warn('⚠️ [Artifacts] Failed to load project datasets for export:', datasetError);
          }

          if (datasetRowsForArtifacts.length === 0) {
            console.warn('⚠️ [Artifacts] No dataset rows available for CSV/JSON export; falling back to insights');
          }

          // Build comprehensiveResults from analysis output to populate Q&A in artifacts
          const comprehensiveResults: any = {
            executiveSummary: {
              keyFindings: (results.insights || []).slice(0, 5).map((i: any) =>
                typeof i === 'string' ? i : i.title || i.description || ''
              ),
              recommendations: (results.recommendations || []).map((rec: any) => ({
                title: rec.title || 'Recommendation',
                description: rec.description || '',
                priority: rec.priority || 'medium',
                impact: rec.expectedImpact || rec.impact || ''
              })),
              answeredQuestions: [] as Array<{ question: string; answer: string; confidence: number; evidence?: string[] }>
            },
            metadata: {
              totalRows: results.summary?.dataRowsProcessed || 0,
              totalColumns: results.summary?.columnsAnalyzed || 0,
              analysisTypes: results.analysisTypes || [],
              executionTimeMs: parseInt(results.summary?.executionTime || '0') * 1000
            }
          };

          // Map questionAnswerMapping + insightToQuestionMap → answeredQuestions
          const qaMapping = results.questionAnswerMapping || [];
          if (qaMapping.length > 0) {
            comprehensiveResults.executiveSummary.answeredQuestions = qaMapping.map((qam: any) => {
              // Find insights tagged as answering this question
              const insightIds = results.insightToQuestionMap?.[qam.questionId] || [];
              const matchedInsights = insightIds
                .map((iId: string) => (results.insights || []).find((ins: any) => ins.id?.toString() === iId))
                .filter(Boolean);

              const answer = matchedInsights.length > 0
                ? matchedInsights.map((ins: any) => `${ins.title}: ${ins.description}`).join('. ')
                : `Analysis completed for: ${qam.recommendedAnalyses?.join(', ') || 'general analysis'}`;

              const evidence = matchedInsights.map((ins: any) => ins.dataSource || ins.category || '').filter(Boolean);
              const confidence = matchedInsights.length > 0 ? Math.min(0.95, 0.6 + matchedInsights.length * 0.1) : 0.5;

              return {
                question: qam.questionText,
                answer,
                confidence,
                evidence: evidence.length > 0 ? evidence : undefined
              };
            });
            console.log(`📋 [Artifacts] Built ${comprehensiveResults.executiveSummary.answeredQuestions.length} answered questions for artifact generation`);
          }

          // Add per-analysis breakdown for PPTX slides (from legacyResults stored in DB)
          if (results.perAnalysisBreakdown) {
            comprehensiveResults.perAnalysisBreakdown = Object.fromEntries(
              Object.entries(results.perAnalysisBreakdown as Record<string, any>).map(([id, r]) => [id, {
                status: r.status,
                insights: (r.insights || []).slice(0, 3).map((i: any) => ({
                  title: i.title || '',
                  description: i.description || ''
                })),
                error: r.error,
                executionTimeMs: r.executionTimeMs
              }])
            );
          }
          if (results.analysisStatuses) {
            comprehensiveResults.analysisStatuses = (results.analysisStatuses as any[]).map((s: any) => ({
              analysisId: s.analysisId,
              analysisName: s.analysisName || 'Unknown',
              analysisType: s.analysisType || 'unknown',
              status: s.status,
              insightCount: s.insightCount || 0,
              errorMessage: s.errorMessage
            }));
          }

          const artifacts = await artifactGenerator.generateArtifacts({
            projectId,
            projectName: project.name || projectId, // Pass project name for folder structure
            userId,
            journeyType: (project.journeyType || 'non-tech') as 'non-tech' | 'business' | 'technical' | 'consultation',
            analysisResults: results.insights || [], // Pass insights as analysis results
            dataRows: datasetRowsForArtifacts,
            visualizations: results.visualizations || [],
            insights: (results.insights || []).map(insight => insight.title), // Convert AnalysisInsight[] to string[]
            datasetSizeMB: project.data ? (JSON.stringify(project.data).length / (1024 * 1024)) : 0,
            piiConfig, // ✅ GAP 7 FIX: Pass PII config to artifact generator
            comprehensiveResults // ✅ P0-6/P0-7 FIX: Pass Q&A data to artifact generator
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

    // ✅ Knowledge Enrichment: enrich user profile + knowledge graph from completed project
    setImmediate(async () => {
      try {
        const { KnowledgeEnrichmentService } = await import('../services/knowledge-enrichment-service');
        const enrichmentService = new KnowledgeEnrichmentService();

        const { industry: enrichIndustry } = resolvePipelineIndustry(
          (project as any)?.journeyProgress
        );

        const enrichResult = await enrichmentService.enrich({
          projectId,
          userId,
          industry: enrichIndustry,
          analysisTypes: results.analysisTypes || [],
          userGoals: ((project as any)?.journeyProgress?.userGoals || []).map((g: any) => typeof g === 'string' ? g : g.text || ''),
          userQuestions: ((project as any)?.journeyProgress?.questions || []).map((q: any) => typeof q === 'string' ? q : q.text || ''),
          insightCount: results.insights?.length || 0,
          qualityScore: results.summary?.qualityScore || 0,
          // P2-1 FIX: Source column names from journeyProgress schema/datasets, not results.metadata (which never has columnNames)
          columnNames: (() => {
            const jp = (project as any)?.journeyProgress;
            // Try joined data schema first (multi-dataset)
            const joinedSchema = jp?.joinedData?.schema;
            if (joinedSchema && typeof joinedSchema === 'object') {
              return Object.keys(joinedSchema);
            }
            // Fallback: requirements document data elements
            const reqDoc = jp?.requirementsDocument;
            if (reqDoc?.dataElements && Array.isArray(reqDoc.dataElements)) {
              return reqDoc.dataElements.map((de: any) => de.sourceColumn || de.name).filter(Boolean);
            }
            return [];
          })(),
          executionTimeSeconds: parseFloat(results.summary?.executionTime || '0'),
          questionAnswerMapping: results.questionAnswerMapping
        });

        console.log(`📚 [Knowledge Enrichment] User profile: ${enrichResult.userProfileUpdates.length} updates, KB: ${enrichResult.knowledgeGraphUpdates.length} updates`);
        if (enrichResult.errors.length > 0) {
          console.warn(`⚠️ [Knowledge Enrichment] ${enrichResult.errors.length} non-fatal errors:`, enrichResult.errors.slice(0, 3));
        }
      } catch (enrichError) {
        console.error('❌ [Knowledge Enrichment] Failed (non-blocking):', enrichError);
      }
    });

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
        requestedAnalysisTypes: analysisTypes,
        normalizedAnalysisTypes: results.analysisTypes || [],
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
      journeyType: project?.journeyType ?? 'non-tech',
      datasetIds: datasetIds ?? null,
      // PHASE 6 FIX: Include per-analysis execution tracking for dashboard display
      analysisStatuses: (results as any).analysisStatuses,
      perAnalysisBreakdown: (results as any).perAnalysisBreakdown
    };

    // Log per-analysis execution summary for debugging
    if ((results as any).analysisStatuses?.length > 0) {
      console.log(`📊 [Execution Response] Returning ${(results as any).analysisStatuses.length} analysis statuses`);
      (results as any).analysisStatuses.forEach((status: any) => {
        console.log(`   - ${status.analysisName} (${status.analysisType}): ${status.status}, ${status.insightCount} insights`);
      });
    }

    if (analysisTypes.join('|') !== (results.analysisTypes || []).join('|')) {
      console.log(`📊 [Execution Response] Normalized analysis types: [${analysisTypes.join(', ')}] → [${(results.analysisTypes || []).join(', ')}]`);
    }

    // FIX E2: Add billing context so frontend knows how the analysis was paid for
    let billingInfo: { method: string; cost: number | null; quotaRemaining?: number; tierName?: string } | null = null;
    try {
      const user = await storage.getUser(userId);
      const userTier = (user as any)?.subscriptionTier || 'none';
      const subscriptionStatus = (user as any)?.subscriptionStatus || 'inactive';
      const isSubscribed = ['active', 'trialing'].includes(subscriptionStatus) && userTier !== 'none';

      if (isSubscribed) {
        const billingService = getBillingService();
        const quotaStatus = await billingService.getQuotaStatus(userId, 'analysis_execution', 'small');
        billingInfo = {
          method: 'subscription',
          cost: 0,
          quotaRemaining: quotaStatus?.remaining ?? undefined,
          tierName: userTier
        };
      } else {
        billingInfo = {
          method: 'pay_per_use',
          cost: totalCost
        };
      }
    } catch (billingErr) {
      console.warn('⚠️ Failed to fetch billing info for response:', billingErr);
    }

    res.json({
      success: true,
      message: 'Analysis completed successfully',
      results: responsePayload,
      billingInfo
    });

  } catch (error: any) {
    console.error('❌ Analysis execution error:', error);

    // Set executionStatus to failed in journeyProgress
    try {
      await storage.atomicMergeJourneyProgress(projectId, {
        executionStatus: 'failed',
        executionError: error.message,
        executionFailedAt: new Date().toISOString()
      });
    } catch (statusErr) { /* non-fatal */ }

    // ✅ FIX: Refund quota usage if execution failed
    // Note: For subscriptions, we track usage but can reverse it on failure
    if (quotaTracked && trackedFeatureId) {
      try {
        console.log(`💰 [Billing] Refunding quota for ${trackedFeatureId} (${trackedComplexity}) due to execution failure`);
        const billingService = getBillingService();
        // Track negative usage to reverse the deduction
        await billingService.trackFeatureUsage(
          userId,
          trackedFeatureId,
          trackedComplexity,
          -1 // Negative to refund
        );
        console.log(`✅ [Billing] Successfully refunded quota`);
      } catch (refundError) {
        console.error('⚠️ Failed to refund quota:', refundError);
        // Log but continue with error response
      }
    }

    // DT-2 FIX: Detect transformation data integrity errors and return structured diagnostics
    if (error.isTransformationError && error.diagnostics) {
      return res.status(422).json({
        success: false,
        error: error.message,
        errorType: 'TRANSFORMATION_DATA_MISSING',
        diagnostics: error.diagnostics,
        recoveryAction: 'RE_RUN_TRANSFORMATION',
        quotaRefunded: quotaTracked
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute analysis',
      quotaRefunded: quotaTracked // Let frontend know quota was refunded
    });
  }
});

/**
 * Get analysis results for a project
 * GET /api/analysis-execution/results/:projectId
 *
 * Results Gate (Aligned with Billing):
 * 1. Paid project → Full results
 * 2. Active subscription → Full results (already consumed quota)
 * 3. No payment/subscription → Preview-only results
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

    const project = accessCheck.project;
    console.log(`📖 Fetching results for project ${projectId}`);

    // Get results (service layer can still validate, but route is primary gate)
    const results = await AnalysisExecutionService.getResults(projectId, userId);

    if (!results) {
      const executionStatus = (project as any)?.journeyProgress?.executionStatus;
      const isPaid = (project as any)?.isPaid === true;

      // FIX 6: Return proper HTTP status codes based on execution state
      // 202 = still executing (dashboard should continue polling)
      // 402 = payment required (not paid yet)
      // 422 = permanently failed (dashboard should stop polling and show error)
      // 404 = not started (no results exist)
      if (executionStatus === 'executing' || executionStatus === 'in_progress') {
        return res.status(202).json({
          success: false,
          status: 'executing',
          executionStatus: 'executing',
          message: 'Analysis is still running. Results will be available shortly.',
          isPaid,
        });
      }

      if (executionStatus === 'failed') {
        const executionError = (project as any)?.journeyProgress?.executionError;
        return res.status(422).json({
          success: false,
          status: 'failed',
          executionStatus: 'failed',
          error: executionError || 'Analysis execution failed',
          message: 'Analysis execution failed. Please retry from the Execute step.',
          isPaid,
        });
      }

      // P0-6 FIX: Check if execution completed but results were lost (transaction failure)
      if (executionStatus === 'completed' || executionStatus === 'complete') {
        console.error(`🚨 [P0-6] Execution status is '${executionStatus}' but analysisResults is null for project ${projectId}. Data may have been lost during save.`);
        return res.status(500).json({
          success: false,
          error: 'Analysis completed but results could not be retrieved. This may indicate a save error.',
          status: 'results_missing',
          isPaid,
          hint: 'Please re-run the analysis from the Execute step. If the issue persists, contact support.'
        });
      }

      // FIX 1A: Only return 402 when execution has genuinely never started AND not paid.
      // Previously this check was BEFORE the 'completed' check, which meant unpaid projects
      // returning from Stripe payment (before verify-session sets isPaid=true) would get 402
      // instead of 404. The frontend treats 402 as a billing error and shows a persistent banner.
      if (!executionStatus && !isPaid) {
        return res.status(402).json({
          success: false,
          error: 'Payment is required before running the analysis.',
          status: 'payment_required',
          isPaid: false
        });
      }

      return res.status(404).json({
        success: false,
        error: 'No analysis results found for this project',
        status: executionStatus || 'not_started',
        isPaid,
        hint: isPaid
          ? 'Analysis has not been triggered yet. Navigate to the Execute step to start analysis.'
          : 'Payment may still be processing. Please wait a moment and try again.'
      });
    }

    // ============================================================
    // RESULTS GATE: Subscription-Aware (Aligned with Billing)
    // ============================================================

    const isPaid = (project as any)?.isPaid === true;
    const billingService = getBillingService();
    const user = await storage.getUser(userId);
    const userTier = (user as any)?.subscriptionTier || 'none';
    const subscriptionStatus = (user as any)?.subscriptionStatus || 'inactive';

    // P1-C FIX: Check trial credits for trialing users - exhausted credits = no full access
    let hasActiveSubscription = ['active', 'trialing'].includes(subscriptionStatus) && userTier !== 'none';
    if (subscriptionStatus === 'trialing' && hasActiveSubscription) {
      try {
        const trialCreditsStatus = await billingService.getTrialCreditsStatus(userId);
        if (trialCreditsStatus && (trialCreditsStatus.remaining <= 0 || trialCreditsStatus.expired)) {
          console.log(`⚠️ [Billing] Trial credits exhausted for user ${userId} - restricting to preview`);
          hasActiveSubscription = false;
        }
      } catch { /* Non-critical: default to allowing access */ }
    }
    const hasFullAccess = isPaid || hasActiveSubscription || isAdminUser;

    if (!hasFullAccess) {
      console.log(`🔒 [Billing] Returning preview-only results for project ${projectId} (tier: ${userTier}, status: ${subscriptionStatus})`);

      // Calculate counts for display
      const totalInsights = results.insights?.length || 0;
      const totalVisualizations = results.visualizations?.length || 0;
      const totalRecommendations = results.recommendations?.length || 0;

      // Return limited preview (10% of insights, 2 charts max, no recommendations)
      const previewInsights = (results.insights || []).slice(0, Math.max(1, Math.ceil(totalInsights * 0.1)));
      const previewVisualizations = (results.visualizations || []).slice(0, 2);

      const limitedResults = {
        ...results,
        isPreview: true,
        paymentRequired: true,
        paymentUrl: `/projects/${projectId}/payment`,
        subscriptionRequired: !hasActiveSubscription,
        subscriptionUrl: '/billing/subscribe',
        currentTier: userTier,

        // Limited data
        insights: previewInsights,
        recommendations: [], // Hide recommendations until paid
        visualizations: previewVisualizations,

        // Truncate question answers
        questionAnswers: results.questionAnswers ? {
          ...results.questionAnswers,
          answers: (results.questionAnswers.answers || []).map((qa: any) => ({
            ...qa,
            answer: qa.answer
              ? qa.answer.substring(0, 150) + '... [Complete answer requires payment or subscription]'
              : null,
            supportingInsights: [], // Hide evidence chain
            confidence: qa.confidence
          }))
        } : undefined,

        // Include counts so frontend knows what's hidden
        fullInsightCount: totalInsights,
        fullVisualizationCount: totalVisualizations,
        fullRecommendationCount: totalRecommendations,
        previewInsightCount: previewInsights.length,
        previewVisualizationCount: previewVisualizations.length
      };

      return res.json({
        success: true,
        results: limitedResults,
        message: 'Preview results. Subscribe or pay for this project to unlock full analysis.'
      });
    }

    console.log(`✅ [Billing] Returning full results for project ${projectId} (isPaid: ${isPaid}, tier: ${userTier})`);

    // Full results for paid projects, active subscribers, or admins
    res.json({
      success: true,
      results: {
        ...results,
        isPreview: false,
        paymentRequired: false,
        subscriptionTier: userTier
      }
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
