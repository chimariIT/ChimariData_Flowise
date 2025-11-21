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
    const pricing = buildPricing(
      { dataSizeMB, recordCount, questionsCount, analysisType },
      hasLockedCost ? lockedCostCents / 100 : undefined,
      hasLockedCost ? 'locked' : 'calculated'
    );

    const amountCents = hasLockedCost ? remainingCostCents : pricing.priceInCents;

    if (amountCents <= 0) {
      return res.status(400).json({ success: false, error: 'No outstanding balance for this analysis' });
    }

    if (typeof payableCents === 'number' && Math.abs(payableCents - amountCents) > 1) {
      return res.status(409).json({ success: false, error: 'Mismatched payable amount', expectedCents: amountCents });
    }

    const id = `pi_${crypto.randomBytes(12).toString('hex')}`;
    const secret = crypto.randomBytes(24).toString('hex');
    const clientSecret = `${id}_secret_${secret}`;

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
