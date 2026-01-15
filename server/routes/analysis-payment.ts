import { Router } from 'express';
import crypto from 'crypto';
import { storage } from '../services/storage';

interface PricingBreakdown {
  basePrice: number;
  dataSizeCharge: number;
  complexityCharge: number;
  questionsCharge: number;
  analysisTypeCharge: number;
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
  const basePrice = 5.0;
  const dataSizeCharge = Math.max(0, (input.dataSizeMB - 10) * 0.1);
  const complexityCharge = input.recordCount > 100_000 ? 15.0 : input.recordCount > 10_000 ? 8.0 : 0;
  const questionsCharge = Math.max(0, (input.questionsCount - 3) * 1.0);
  const analysisTypeCharge = input.analysisType === 'advanced' ? 10.0 : input.analysisType === 'custom' ? 20.0 : 0;

  const calculatedFinal = basePrice + dataSizeCharge + complexityCharge + questionsCharge + analysisTypeCharge;
  const finalPrice = sanitizeCurrency(overrideFinalPrice ?? calculatedFinal);

  return {
    finalPrice,
    priceInCents: Math.round(finalPrice * 100),
    breakdown: {
      basePrice: sanitizeCurrency(basePrice),
      dataSizeCharge: sanitizeCurrency(dataSizeCharge),
      complexityCharge: sanitizeCurrency(complexityCharge),
      questionsCharge: sanitizeCurrency(questionsCharge),
      analysisTypeCharge: sanitizeCurrency(analysisTypeCharge),
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

router.post('/create-intent', async (req, res) => {
  try {
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

    const lockedCost = Number((project as any).lockedCostEstimate ?? 0);
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

    if (stripeSecretKey && stripeSecretKey !== 'sk_test_your_stripe_secret_key') {
      // Real Stripe integration
      console.log(`💳 Creating real Stripe PaymentIntent for project ${projectId}: ${amountCents} cents`);

      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-08-27.basil' });

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: 'usd',
          metadata: {
            projectId,
            analysisType: analysisType || 'standard',
            source: 'analysis_payment'
          },
          description: `Analysis for project ${project.name || projectId}`
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
      // Development fallback (mock)
      console.warn('⚠️  Stripe not configured - using mock payment intent for development');
      const id = `pi_mock_${crypto.randomBytes(12).toString('hex')}`;
      const secret = crypto.randomBytes(24).toString('hex');
      clientSecret = `${id}_secret_${secret}`;
      paymentIntentId = id;
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
