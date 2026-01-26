import { Router } from 'express';
import crypto from 'crypto';
import { storage } from '../services/storage';
import { ensureAuthenticated } from './auth';
import { PRICING_CONSTANTS, getRecordCountMultiplier, getAnalysisTypeFactor } from '../../shared/pricing-config';

interface PricingBreakdown {
  basePrice: number;
  dataSizeCharge: number;
  complexityCharge: number;
  questionsCharge: number;
  analysisTypeCharge: number;
  // ✅ FIX: Add per-analysis breakdown for multiple analysis types
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

function buildPricing(input: PricingInput, overrideFinalPrice?: number, source: 'locked' | 'calculated' = 'calculated'): PricingResponse {
  // P1-B FIX: Use shared pricing constants (single source of truth) - imported at top of file
  const basePlatformFee = PRICING_CONSTANTS.basePlatformFee;
  const dataProcessingPer1K = PRICING_CONSTANTS.dataProcessingPer1K;
  const baseAnalysisCost = PRICING_CONSTANTS.baseAnalysisCost;

  const complexityMultiplier = getRecordCountMultiplier(input.recordCount);

  // Data processing charge based on row count
  const dataRowsK = input.recordCount / 1000;
  const dataSizeCharge = sanitizeCurrency(dataRowsK * dataProcessingPer1K);

  // ✅ FIX: Support multiple analysis types
  // If analysisTypes array is provided, calculate cost for each; otherwise use single analysisType
  const analysisTypes = (input as any).analysisTypes || [input.analysisType || 'default'];
  let totalAnalysisCharge = 0;
  const perAnalysisBreakdown: Array<{ type: string; cost: number }> = [];

  for (const analysisType of analysisTypes) {
    const typeFactor = getAnalysisTypeFactor(analysisType);
    const analysisCost = sanitizeCurrency(baseAnalysisCost * typeFactor * complexityMultiplier);
    totalAnalysisCharge += analysisCost;
    perAnalysisBreakdown.push({ type: analysisType, cost: analysisCost });
  }

  const analysisTypeCharge = sanitizeCurrency(totalAnalysisCharge);

  // Questions don't directly affect cost in CostEstimationService - keep minimal charge for extras
  const questionsCharge = sanitizeCurrency(Math.max(0, (input.questionsCount - 5) * 0.10));

  const calculatedFinal = basePlatformFee + dataSizeCharge + analysisTypeCharge + questionsCharge;
  const finalPrice = sanitizeCurrency(overrideFinalPrice ?? calculatedFinal);

  console.log(`💰 [buildPricing] ${analysisTypes.length} analyses: [${analysisTypes.join(', ')}] = $${analysisTypeCharge.toFixed(2)} (total $${finalPrice.toFixed(2)})`);

  return {
    finalPrice,
    priceInCents: Math.round(finalPrice * 100),
    breakdown: {
      basePrice: sanitizeCurrency(basePlatformFee),
      dataSizeCharge,
      complexityCharge: sanitizeCurrency(totalAnalysisCharge - baseAnalysisCost * analysisTypes.length), // complexity portion only
      questionsCharge,
      analysisTypeCharge,
      // ✅ NEW: Per-analysis breakdown for transparency
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

    const pricing = buildPricing({ dataSizeMB, recordCount, questionsCount, analysisType });
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
    } = req.body as PricingInput & { projectId?: string; payableCents?: number };

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }

    if (
      typeof dataSizeMB !== 'number' ||
      typeof recordCount !== 'number' ||
      typeof questionsCount !== 'number'
    ) {
      return res.status(400).json({ success: false, error: 'Invalid pricing payload' });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // PHASE 5 SSOT FIX: Read locked cost from journeyProgress.lockedCostEstimate ONLY (no fallbacks)
    const journeyProgress = (project as any).journeyProgress || {};
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

    console.log(`✅ [Payment SSOT] Using journeyProgress.lockedCostEstimate: $${lockedCost.toFixed(2)} for project ${projectId}`);

    const totalCostIncurred = Number((project as any).totalCostIncurred ?? 0);
    const lockedCostCents = Math.max(Math.round(Number.isFinite(lockedCost) ? lockedCost * 100 : 0), 0);
    const spentCostCents = Math.max(Math.round(Number.isFinite(totalCostIncurred) ? totalCostIncurred * 100 : 0), 0);
    const remainingCostCents = Math.max(lockedCostCents - spentCostCents, 0);

    const hasLockedCost = lockedCostCents > 0;

    // ✅ PHASE 3 FIX: Log locked cost usage for debugging cost mismatch issues
    console.log(`✅ [Payment] Project ${projectId}: lockedCostEstimate=${lockedCost}, lockedCostCents=${lockedCostCents}, hasLockedCost=${hasLockedCost}`);

    const pricing = buildPricing(
      { dataSizeMB, recordCount, questionsCount, analysisType },
      hasLockedCost ? lockedCostCents / 100 : undefined,
      hasLockedCost ? 'locked' : 'calculated'
    );

    // ✅ PHASE 3 FIX: Always prefer locked cost over calculated price to prevent cost mismatch
    // Previously could use pricing.priceInCents (calculated) which differs from UI's locked cost
    const amountCents = hasLockedCost ? remainingCostCents : pricing.priceInCents;
    console.log(`✅ [Payment] Using ${hasLockedCost ? 'locked' : 'calculated'} cost: ${amountCents} cents (remaining: ${remainingCostCents}, calculated: ${pricing.priceInCents})`);

    if (amountCents <= 0) {
      return res.status(400).json({ success: false, error: 'No outstanding balance for this analysis' });
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
        const idempotencyKey = `analysis-${projectId}-${userId}-${amountCents}`;

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
      console.error('🔴 Stripe not configured - cannot create payment intent!');
      return res.status(503).json({
        success: false,
        error: 'Payment service unavailable. Stripe is not configured.',
        code: 'STRIPE_NOT_CONFIGURED'
      });
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

    const dataComplexity = determineComplexity(recordCount);

    return res.json({
      success: true,
      clientSecret,
      pricing,
      payableCents: amountCents,
      lockedCostCents,
      spentCostCents,
      remainingCostCents,
      dataComplexity,
    });
  } catch (error: any) {
    console.error('Payment intent creation error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create payment intent' });
  }
});

export default router;
