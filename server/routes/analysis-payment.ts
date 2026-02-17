import { Router } from 'express';
import crypto from 'crypto';
import { storage } from '../services/storage';
import { ensureAuthenticated } from './auth';
import { CostEstimationService } from '../services/cost-estimation-service';

interface PricingBreakdown {
  basePrice: number;
  dataSizeCharge: number;
  complexityCharge: number;
  questionsCharge: number;
  analysisTypeCharge: number;
  perAnalysisBreakdown?: Array<{ type: string; cost: number }>;
}

interface PricingResponse {
  finalPrice: number;
  priceInCents: number;
  breakdown: PricingBreakdown;
  source: 'locked' | 'calculated';
}

interface PricingInput {
  dataSizeMB: number;
  recordCount: number;
  questionsCount: number;
  analysisType?: string;
}

const router = Router();

function sanitizeCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

/**
 * FIX C2+F1: buildPricing now delegates to CostEstimationService (single source of truth)
 * instead of using PricingService directly. This ensures Plan cost = Pricing step cost = Payment cost.
 */
async function buildPricing(projectId: string, input: PricingInput, overrideFinalPrice?: number, source: 'locked' | 'calculated' = 'calculated'): Promise<PricingResponse> {
  const analysisTypes = (input as any).analysisTypes || [input.analysisType || 'descriptive'];
  const complexity = input.recordCount > 100_000 ? 'advanced' as const
    : input.recordCount > 10_000 ? 'intermediate' as const
    : 'basic' as const;

  const estimate = await CostEstimationService.estimateAnalysisCost(
    projectId,
    analysisTypes,
    { rows: input.recordCount, columns: Math.max(1, Math.ceil(input.dataSizeMB * 10)) },
    complexity,
    ['report']
  );

  const finalPrice = sanitizeCurrency(overrideFinalPrice ?? estimate.totalCost);

  // Map CostEstimationService breakdown to PricingBreakdown format
  const breakdownItems = estimate.breakdown || [];
  const basePrice = breakdownItems.find(b => b.item === 'Platform Fee')?.cost || 0;
  const dataSizeCharge = breakdownItems.find(b => b.item === 'Data Processing')?.cost || 0;
  const analysisItems = breakdownItems.filter(b => b.item.includes('Analysis'));
  const analysisTypeCharge = sanitizeCurrency(analysisItems.reduce((sum, b) => sum + b.cost, 0));
  const complexityCharge = sanitizeCurrency(analysisTypeCharge - (analysisItems.length * (breakdownItems.find(b => b.factor)?.factor || 1)));
  const questionsCharge = 0; // Questions are not separately charged in CostEstimationService

  const perAnalysisBreakdown = analysisItems.map(b => ({
    type: b.item.replace(' Analysis', '').toLowerCase().replace(/\s+/g, '_'),
    cost: b.cost
  }));

  console.log(`💰 [buildPricing→CostEstimationService] ${analysisTypes.length} analyses: [${analysisTypes.join(', ')}] = $${analysisTypeCharge.toFixed(2)} (total $${finalPrice.toFixed(2)})`);

  return {
    finalPrice,
    priceInCents: Math.round(finalPrice * 100),
    breakdown: {
      basePrice: sanitizeCurrency(basePrice),
      dataSizeCharge: sanitizeCurrency(dataSizeCharge),
      complexityCharge: sanitizeCurrency(Math.max(0, complexityCharge)),
      questionsCharge,
      analysisTypeCharge,
      perAnalysisBreakdown: perAnalysisBreakdown.length > 1 ? perAnalysisBreakdown : undefined,
    },
    source,
  };
}

function determineComplexity(recordCount: number): 'simple' | 'moderate' | 'complex' {
  if (recordCount > 100_000) {
    return 'complex';
  }
  if (recordCount > 10_000) {
    return 'moderate';
  }
  return 'simple';
}

/**
 * POST /api/analysis-payment/validate-coupon
 * Validate a coupon code without incrementing usage. Returns discount preview.
 */
router.post('/validate-coupon', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { projectId, couponCode } = req.body;
    if (!couponCode || typeof couponCode !== 'string') {
      return res.status(400).json({ success: false, error: 'couponCode is required' });
    }

    const { getBillingService } = await import('../services/billing/unified-billing-service');
    const billingService = getBillingService();

    const result = await billingService.validateCampaign(userId, couponCode.trim());

    if (!result.valid) {
      return res.json({ success: false, error: result.reason || 'Invalid coupon code' });
    }

    // Calculate discount amount based on the project's locked cost (if available)
    let discountAmountCents = 0;
    let baseAmountCents = 0;

    if (projectId) {
      const project = await storage.getProject(projectId);
      if (project) {
        const journeyProgress = (project as any).journeyProgress || {};
        const lockedCost = journeyProgress.lockedCostEstimate;
        baseAmountCents = Math.max(Math.round((parseFloat(String(lockedCost)) || 0) * 100), 0);

        if (baseAmountCents > 0 && result.campaign) {
          discountAmountCents = billingService.calculateDiscount(result.campaign, baseAmountCents);
        }
      }
    }

    return res.json({
      success: true,
      campaign: {
        id: result.campaign!.id,
        name: result.campaign!.name,
        type: result.discountType,
        value: result.discountValue,
        couponCode: result.campaign!.couponCode,
      },
      discount: {
        type: result.discountType,
        value: result.discountValue,
        amountCents: discountAmountCents,
        amountDollars: (discountAmountCents / 100).toFixed(2),
        baseAmountCents,
        finalAmountCents: Math.max(baseAmountCents - discountAmountCents, 0),
      }
    });
  } catch (error: any) {
    console.error('Error validating coupon:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to validate coupon' });
  }
});

router.post('/calculate', async (req, res) => {
  try {
    const { dataSizeMB, recordCount, questionsCount, analysisType } = req.body as PricingInput;

    if (
      typeof dataSizeMB !== 'number' ||
      typeof recordCount !== 'number' ||
      typeof questionsCount !== 'number'
    ) {
      return res.status(400).json({ success: false, error: 'Invalid pricing payload' });
    }

    const pricing = await buildPricing('calculate', { dataSizeMB, recordCount, questionsCount, analysisType });
    const dataComplexity = determineComplexity(recordCount);

    return res.json({ success: true, pricing, dataComplexity });
  } catch (error: any) {
    console.error('Pricing calculation error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to calculate pricing' });
  }
});

router.post('/create-intent', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const {
      projectId,
      dataSizeMB,
      recordCount,
      questionsCount,
      analysisType,
      payableCents,
      couponCode,
    } = req.body as PricingInput & { projectId?: string; payableCents?: number; couponCode?: string };

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Prefer server-side facts over client-provided values to prevent tampering
    const journeyProgress = (project as any).journeyProgress || {};
    const joinedData = journeyProgress.joinedData || {};

    const effectiveRecordCount = Number.isFinite(joinedData.rowCount)
      ? Number(joinedData.rowCount)
      : Number.isFinite(project.recordCount)
        ? Number(project.recordCount)
        : recordCount;

    const effectiveDataSizeMB = Number.isFinite(joinedData.dataSizeMB)
      ? Number(joinedData.dataSizeMB)
      : Number.isFinite(dataSizeMB)
        ? dataSizeMB
        : Math.max(1, Math.ceil(effectiveRecordCount / 1000));

    // Ensure we have at least 1 record and 1MB to avoid 0 cost
    const workingRecordCount = Math.max(1, effectiveRecordCount);
    const workingDataSizeMB = Math.max(1, effectiveDataSizeMB);

    const effectiveQuestionsCount = Array.isArray(journeyProgress.userQuestions)
      ? journeyProgress.userQuestions.length
      : Number.isFinite(questionsCount)
        ? questionsCount
        : 0;

    if (!Number.isFinite(effectiveRecordCount) || !Number.isFinite(effectiveDataSizeMB)) {
      return res.status(400).json({ success: false, error: 'Invalid pricing payload' });
    }

    // PHASE 5 SSOT FIX: Read locked cost from journeyProgress.lockedCostEstimate ONLY (no fallbacks)
    const lockedCostEstimate = journeyProgress.lockedCostEstimate;

    if (!lockedCostEstimate || parseFloat(String(lockedCostEstimate)) <= 0) {
      console.error(`❌ [Payment SSOT] No locked cost estimate in journeyProgress for project ${projectId}`);
      return res.status(400).json({
        success: false,
        error: 'COST_NOT_LOCKED',
        message: 'Cost must be locked before payment. Return to pricing step.'
      });
    }

    const lockedCost = typeof lockedCostEstimate === 'string'
      ? parseFloat(lockedCostEstimate)
      : (typeof lockedCostEstimate === 'number' ? lockedCostEstimate : 0);

    if (typeof lockedCostEstimate !== 'string' && typeof lockedCostEstimate !== 'number') {
      console.warn(`⚠️ [Payment] lockedCostEstimate has unexpected type: ${typeof lockedCostEstimate}, defaulting to 0 for project ${projectId}`);
    }

    console.log(`✅ [Payment SSOT] Using journeyProgress.lockedCostEstimate: $${lockedCost.toFixed(2)} for project ${projectId}`);

    const totalCostIncurred = Number((project as any).totalCostIncurred ?? 0);
    const lockedCostCents = Math.max(Math.round(Number.isFinite(lockedCost) ? lockedCost * 100 : 0), 0);
    const spentCostCents = Math.max(Math.round(Number.isFinite(totalCostIncurred) ? totalCostIncurred * 100 : 0), 0);
    const remainingCostCents = Math.max(lockedCostCents - spentCostCents, 0);

    const hasLockedCost = lockedCostCents > 0;

    // ✅ PHASE 3 FIX: Log locked cost usage for debugging cost mismatch issues
    console.log(`✅ [Payment] Project ${projectId}: lockedCostEstimate=${lockedCost}, lockedCostCents=${lockedCostCents}, hasLockedCost=${hasLockedCost}`);

    const pricing = await buildPricing(
      projectId,
      { dataSizeMB: workingDataSizeMB, recordCount: workingRecordCount, questionsCount: effectiveQuestionsCount, analysisType },
      hasLockedCost ? lockedCostCents / 100 : undefined,
      hasLockedCost ? 'locked' : 'calculated'
    );

    // ✅ PHASE 3 FIX: Always prefer locked cost over calculated price to prevent cost mismatch
    // Previously could use pricing.priceInCents (calculated) which differs from UI's locked cost
    let amountCents = hasLockedCost ? remainingCostCents : pricing.priceInCents;
    console.log(`✅ [Payment] Using ${hasLockedCost ? 'locked' : 'calculated'} cost: ${amountCents} cents (remaining: ${remainingCostCents}, calculated: ${pricing.priceInCents})`);

    // Apply coupon discount if provided
    let appliedCampaignInfo: any = null;
    if (couponCode && couponCode.trim()) {
      try {
        const { getBillingService } = await import('../services/billing/unified-billing-service');
        const billingService = getBillingService();

        const validation = await billingService.validateCampaign(userId, couponCode.trim());
        if (validation.valid && validation.campaign) {
          const discountCents = billingService.calculateDiscount(validation.campaign, amountCents);
          const originalCents = amountCents;
          amountCents = Math.max(amountCents - discountCents, 0);

          // Increment campaign usage atomically
          await billingService.applyCampaign(userId, couponCode.trim());

          appliedCampaignInfo = {
            campaignId: validation.campaign.id,
            couponCode: validation.campaign.couponCode,
            discountType: validation.campaign.type,
            discountValue: validation.campaign.value,
            discountAmountCents: discountCents,
            originalAmountCents: originalCents,
            appliedAt: new Date().toISOString(),
          };

          console.log(`✅ [Payment] Coupon "${couponCode}" applied: -${discountCents}c (${originalCents}c → ${amountCents}c)`);

          // Persist applied campaign to journeyProgress
          await storage.atomicMergeJourneyProgress(projectId, {
            appliedCampaign: appliedCampaignInfo,
          });
        } else {
          console.warn(`⚠️ [Payment] Coupon "${couponCode}" invalid: ${validation.reason}`);
          // Don't fail the payment - just skip the discount
        }
      } catch (couponErr: any) {
        console.warn(`⚠️ [Payment] Coupon processing error:`, couponErr.message);
        // Don't fail the payment for coupon errors
      }
    }

    if (amountCents <= 0) {
      // Coupon covered the full cost - auto-complete payment
      try {
        await storage.updateProject(projectId, { isPaid: true, paymentStatus: 'completed', paidAt: new Date().toISOString() } as any);
        // P1-6 FIX: Also update journeyProgress SSOT with payment status
        try {
          await storage.atomicMergeJourneyProgress(projectId, {
            isPaid: true,
            paymentStatus: 'completed',
            paidAt: new Date().toISOString()
          });
        } catch (jpErr) { console.warn('⚠️ Failed to update journeyProgress payment status:', jpErr); }
        console.log(`✅ [Payment] Full discount applied - project ${projectId} auto-marked as paid`);

        // P1-6 FIX: Standardize response to always include isPaid and paymentStatus
        return res.json({
          success: true,
          isPaid: true,
          paymentComplete: true, // Keep for backward compatibility
          paymentStatus: 'paid',
          message: 'Coupon covered the full cost. No payment required.',
          appliedCampaign: appliedCampaignInfo,
        });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: 'Failed to process free payment' });
      }
    }

    // Payment amount validation with tolerance
    // Use 1% tolerance or minimum 10 cents to account for rounding differences
    // between frontend and backend price calculations
    if (typeof payableCents === 'number') {
      const tolerance = Math.max(10, Math.round(amountCents * 0.01)); // 1% or 10 cents minimum
      const difference = Math.abs(payableCents - amountCents);

      if (difference > tolerance) {
        console.error(`❌ [Payment] Amount mismatch: frontend=${payableCents}c, backend=${amountCents}c, diff=${difference}c, tolerance=${tolerance}c`);
        return res.status(409).json({
          success: false,
          error: 'Payment amount mismatch detected. Refresh the page and retry.',
          expectedCents: amountCents,
          receivedCents: payableCents,
          difference,
          tolerance
        });
      }
      console.log(`✅ [Payment] Amount validation passed: frontend=${payableCents}c, backend=${amountCents}c, diff=${difference}c, tolerance=${tolerance}c`);
    }

    // FIX: Use real Stripe API instead of mock payment intent
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    let clientSecret: string;
    let paymentIntentId: string;

    // P0-6 FIX: Check if Stripe is properly configured
    const isStripeConfigured = stripeSecretKey && stripeSecretKey !== 'sk_test_your_stripe_secret_key';
    const isProduction = process.env.NODE_ENV === 'production';

    // CRITICAL: Block mock payments in production
    if (!isStripeConfigured && isProduction) {
      console.error('🔴 CRITICAL: Stripe not configured in production - blocking payment!');
      return res.status(503).json({
        success: false,
        error: 'Payment service unavailable. Please contact support.',
        code: 'STRIPE_NOT_CONFIGURED'
      });
    }

    if (isStripeConfigured) {
      // Real Stripe integration
      console.log(`💳 Creating real Stripe PaymentIntent for project ${projectId}: ${amountCents} cents`);

      try {
        // FIX Jan 20: Use stable Stripe API version
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as any });

        // P0-A FIX: Use idempotency key to prevent duplicate PaymentIntents
        // P0-3 FIX: Exclude mutable amountCents - key must be stable across price recalculations
        const idempotencyKey = `analysis-${projectId}-${userId}-${lockedCostCents}-${spentCostCents}`;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: 'usd',
          metadata: {
            projectId,
            userId,
            analysisType: analysisType || 'standard',
            source: 'analysis_payment',
            idempotencyKey
          },
          description: `Analysis for project ${project.name || projectId}`
        }, {
          idempotencyKey
        });

        clientSecret = paymentIntent.client_secret!;
        paymentIntentId = paymentIntent.id;

        console.log(`✅ Created Stripe PaymentIntent: ${paymentIntentId}`);
      } catch (stripeError: any) {
        console.error('❌ Stripe API error:', stripeError);
        return res.status(500).json({
          success: false,
          error: `Stripe integration failed: ${stripeError.message}`
        });
      }
    } else {
      // P2-9 FIX: Only allow simulated payments in development mode
      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        console.error('❌ [Payment] Stripe not configured in production/staging environment');
        return res.status(503).json({
          success: false,
          error: 'Payment system unavailable. Stripe is not configured. Please contact support.'
        });
      }

      // FIX F2: In development mode, return simulated payment intent so the flow can proceed
      console.warn('⚠️ [Dev Mode] Stripe not configured - returning simulated payment intent');
      const simulatedId = `pi_sim_${crypto.randomBytes(12).toString('hex')}`;
      clientSecret = `${simulatedId}_secret_simulated`;
      paymentIntentId = simulatedId;

      // Auto-mark project as paid in dev mode
      try {
        await storage.updateProject(projectId, { isPaid: true } as any);
        console.log(`✅ [Dev Mode] Auto-marked project ${projectId} as paid`);

        // Also advance journey progress to 'execute' step
        try {
          const { defaultJourneyTemplateCatalog } = await import('../../shared/journey-templates');
          const project = await storage.getProject(projectId);
          if (project) {
            const progress = (project as any).journeyProgress;

            // Resolve template: try templateId first, then journeyType mapping
            let template: any = null;
            const templateId = progress?.templateId;
            if (templateId) {
              for (const key of Object.keys(defaultJourneyTemplateCatalog)) {
                const match = (defaultJourneyTemplateCatalog as any)[key]?.find((tpl: any) => tpl.id === templateId);
                if (match) { template = JSON.parse(JSON.stringify(match)); break; }
              }
            }
            if (!template) {
              const jt = (project.journeyType as string || 'non-tech').toLowerCase().replace(/[^a-z_-]/g, '');
              const mapped = jt === 'business' ? 'non-tech' : jt === 'technical' ? 'technical' : 'non-tech';
              const catalogEntry = (defaultJourneyTemplateCatalog as any)[mapped]?.[0];
              if (catalogEntry) template = JSON.parse(JSON.stringify(catalogEntry));
            }
            if (!template) throw new Error('No template found');
            const executeIndex = template.steps.findIndex((s: any) => s.id === 'execute');

            if (executeIndex >= 0) {
              const completedSteps = Array.isArray(progress?.completedSteps) ? [...progress.completedSteps] : [];
              for (let i = 0; i < executeIndex; i++) {
                const stepId = template.steps[i].id;
                if (!completedSteps.includes(stepId)) {
                  completedSteps.push(stepId);
                }
              }
              await storage.atomicMergeJourneyProgress(projectId, {
                currentStepId: 'execute',
                currentStepIndex: executeIndex,
                currentStepName: 'Execute Analysis',
                completedSteps,
                percentComplete: Math.round((completedSteps.length / template.steps.length) * 100),
                lastStepCompletedAt: new Date().toISOString(),
                paymentCompletedAt: new Date().toISOString(),
              });
              console.log(`✅ [Dev Mode] Journey advanced to 'execute' step for project ${projectId}`);
            }
          }
        } catch (journeyErr) {
          console.warn('⚠️ [Dev Mode] Failed to advance journey:', journeyErr);
        }
      } catch (updateErr) {
        console.warn('⚠️ [Dev Mode] Failed to auto-mark project as paid:', updateErr);
      }
    }

    // AGENT ORCHESTRATION: Log billing decision via PM agent for audit trail
    try {
      const { db } = await import('../db');
      const { decisionAudits } = await import('../../shared/schema');
      const { nanoid } = await import('nanoid');

      await db.insert(decisionAudits).values({
        id: nanoid(),
        projectId,
        agent: 'project_manager',
        decisionType: 'billing_payment_initiated',
        decision: `Payment intent created for ${(amountCents / 100).toFixed(2)} USD`,
        reasoning: `Analysis payment for ${analysisType || 'standard'} analysis.${hasLockedCost ? 'Using locked cost estimate.' : 'Calculated from project parameters.'} `,
        alternatives: JSON.stringify([]),
        confidence: 100,
        context: JSON.stringify({
          amountCents,
          lockedCostCents,
          spentCostCents,
          remainingCostCents,
          analysisType,
          paymentIntentId,
          pricingSource: pricing.source
        }),
        userInput: null,
        reversible: false,
        impact: 'high',
        timestamp: new Date()
      });

      console.log(`📋[PM Agent] Logged billing decision for project ${projectId}`);
    } catch (auditError) {
      console.warn('⚠️  Failed to log billing decision to audit trail:', auditError);
      // Don't fail payment creation if audit logging fails
    }

    const dataComplexity = determineComplexity(effectiveRecordCount);

    return res.json({
      success: true,
      clientSecret,
      pricing,
      payableCents: amountCents,
      lockedCostCents,
      spentCostCents,
      remainingCostCents,
      dataComplexity,
      // FIX F2: Flag simulated payments so frontend can show dev-mode banner
      isSimulated: !isStripeConfigured,
      // Campaign discount info (if coupon was applied)
      appliedCampaign: appliedCampaignInfo || undefined,
    });
  } catch (error: any) {
    console.error('Payment intent creation error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create payment intent' });
  }
});

export default router;
