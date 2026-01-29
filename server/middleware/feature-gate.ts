/**
 * Feature Gate Middleware
 *
 * P0-3 Fix: Enforces subscription tier-based feature access
 *
 * This middleware validates that users have access to specific features
 * based on their subscription tier configuration. Uses the features[]
 * array from AdminSubscriptionTierConfig in unified-billing-service.
 *
 * Feature IDs are defined in tier configurations:
 * - trial: ['non_tech_journey', 'basic_analysis']
 * - starter: ['non_tech_journey', 'business_journey', 'advanced_analysis', 'data_export']
 * - professional: [..., 'technical_journey', 'ml_models', 'code_generation', 'priority_support']
 * - enterprise: ['all_journeys', 'consultation_service', 'unlimited_everything', ...]
 */

import type { Request, Response, NextFunction } from 'express';
import { getBillingService } from '../services/billing/unified-billing-service';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import type { SubscriptionTier, JourneyType } from '../../shared/canonical-types';

// Extend Express Request type for type safety
declare global {
  namespace Express {
    interface Request {
      featureAccess?: {
        allowed: boolean;
        feature: string;
        userTier: SubscriptionTier;
        tierFeatures: string[];
        reason?: string;
      };
    }
  }
}

/**
 * Available feature IDs that can be gated
 * These must match the features[] arrays in tier configurations
 */
export const GATED_FEATURES = {
  // Journey types
  NON_TECH_JOURNEY: 'non_tech_journey',
  BUSINESS_JOURNEY: 'business_journey',
  TECHNICAL_JOURNEY: 'technical_journey',
  ALL_JOURNEYS: 'all_journeys',

  // Analysis features
  BASIC_ANALYSIS: 'basic_analysis',
  ADVANCED_ANALYSIS: 'advanced_analysis',
  ML_MODELS: 'ml_models',
  CODE_GENERATION: 'code_generation',

  // Export features
  DATA_EXPORT: 'data_export',
  BULK_EXPORT: 'bulk_export',

  // Support features
  PRIORITY_SUPPORT: 'priority_support',
  DEDICATED_SUPPORT: 'dedicated_support',
  CONSULTATION_SERVICE: 'consultation_service',

  // Enterprise features
  UNLIMITED_EVERYTHING: 'unlimited_everything',
  CUSTOM_INTEGRATIONS: 'custom_integrations',
  SLA_GUARANTEE: 'sla_guarantee',
  WHITE_LABEL: 'white_label',
  SSO: 'sso',
  AUDIT_LOGS: 'audit_logs',
} as const;

export type GatedFeature = typeof GATED_FEATURES[keyof typeof GATED_FEATURES];

/**
 * Map journey types to required features
 */
const JOURNEY_TO_FEATURE_MAP: Record<JourneyType, string> = {
  'non-tech': GATED_FEATURES.NON_TECH_JOURNEY,
  'business': GATED_FEATURES.BUSINESS_JOURNEY,
  'technical': GATED_FEATURES.TECHNICAL_JOURNEY,
  'consultation': GATED_FEATURES.CONSULTATION_SERVICE,
  'custom': GATED_FEATURES.ALL_JOURNEYS,
};

/**
 * Get user's subscription tier from database
 */
async function getUserSubscriptionTier(userId: string): Promise<SubscriptionTier> {
  try {
    const [user] = await db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.subscriptionTier) {
      return 'none';
    }

    return user.subscriptionTier as SubscriptionTier;
  } catch (error) {
    console.error('[Feature Gate] Error fetching user tier:', error);
    return 'none';
  }
}

/**
 * Check if user has available trial credits
 */
async function hasAvailableTrialCredits(userId: string): Promise<{ hasCredits: boolean; available: number }> {
  try {
    const [user] = await db
      .select({
        trialCredits: users.trialCredits,
        trialCreditsUsed: users.trialCreditsUsed,
        trialCreditsExpireAt: users.trialCreditsExpireAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      console.log(`🔍 [Feature Gate] User ${userId} not found in database`);
      return { hasCredits: false, available: 0 };
    }

    const credits = user.trialCredits ?? 100;
    const used = user.trialCreditsUsed ?? 0;
    const available = credits - used;

    // Check if credits have expired
    if (user.trialCreditsExpireAt && new Date(user.trialCreditsExpireAt) < new Date()) {
      console.log(`🔍 [Feature Gate] User ${userId} trial credits expired at ${user.trialCreditsExpireAt}`);
      return { hasCredits: false, available: 0 };
    }

    console.log(`🔍 [Feature Gate] User ${userId} trial credits: total=${credits}, used=${used}, available=${available}`);
    return { hasCredits: available > 0, available };
  } catch (error) {
    console.error('[Feature Gate] Error checking trial credits:', error);
    return { hasCredits: false, available: 0 };
  }
}

// Features available to users with trial credits (no subscription required)
// P0-3 FIX: Allow trial users to experience core analysis features
const TRIAL_CREDIT_FEATURES = [
  GATED_FEATURES.NON_TECH_JOURNEY,
  GATED_FEATURES.BUSINESS_JOURNEY,
  GATED_FEATURES.BASIC_ANALYSIS,
  GATED_FEATURES.ADVANCED_ANALYSIS, // Allow advanced analysis with trial credits for full demo experience
  GATED_FEATURES.DATA_EXPORT,
];

/**
 * Check if a user's tier has access to a specific feature
 */
export async function checkFeatureAccess(
  userId: string,
  featureId: string
): Promise<{ allowed: boolean; tier: SubscriptionTier; tierFeatures: string[]; reason?: string; usingTrialCredits?: boolean }> {
  const billingService = getBillingService();

  // Get user's subscription tier
  const tier = await getUserSubscriptionTier(userId);

  // Get tier configuration
  const tierConfig = billingService.getTierConfig(tier);

  // P0-3 FIX: Check trial credits for users without a paid subscription
  // Users with trial credits can access basic features even without a tier
  if (tier === 'none' || tier === 'trial' || !tierConfig) {
    const trialCheck = await hasAvailableTrialCredits(userId);

    if (trialCheck.hasCredits && TRIAL_CREDIT_FEATURES.includes(featureId as any)) {
      console.log(`✅ [Feature Gate] User ${userId} granted access to ${featureId} via trial credits (${trialCheck.available} remaining)`);
      return {
        allowed: true,
        tier: tier || 'none',
        tierFeatures: TRIAL_CREDIT_FEATURES,
        usingTrialCredits: true,
      };
    }
  }

  if (!tierConfig) {
    // Check if user has trial credits as fallback
    const trialCheck = await hasAvailableTrialCredits(userId);
    if (trialCheck.hasCredits && TRIAL_CREDIT_FEATURES.includes(featureId as any)) {
      return {
        allowed: true,
        tier,
        tierFeatures: TRIAL_CREDIT_FEATURES,
        usingTrialCredits: true,
      };
    }

    return {
      allowed: false,
      tier,
      tierFeatures: [],
      reason: `No configuration found for tier: ${tier}. Subscribe or use trial credits.`,
    };
  }

  const tierFeatures = tierConfig.features || [];

  // Enterprise with 'unlimited_everything' or 'all_journeys' has access to all features
  if (
    tierFeatures.includes(GATED_FEATURES.UNLIMITED_EVERYTHING) ||
    (featureId.includes('journey') && tierFeatures.includes(GATED_FEATURES.ALL_JOURNEYS))
  ) {
    return {
      allowed: true,
      tier,
      tierFeatures,
    };
  }

  // Check if the specific feature is in the tier's features array
  const allowed = tierFeatures.includes(featureId);

  // If tier doesn't have the feature, check if trial credits can cover it
  if (!allowed) {
    const trialCheck = await hasAvailableTrialCredits(userId);
    if (trialCheck.hasCredits && TRIAL_CREDIT_FEATURES.includes(featureId as any)) {
      console.log(`✅ [Feature Gate] User ${userId} granted access to ${featureId} via trial credits fallback`);
      return {
        allowed: true,
        tier,
        tierFeatures: [...tierFeatures, ...TRIAL_CREDIT_FEATURES],
        usingTrialCredits: true,
      };
    }
  }

  return {
    allowed,
    tier,
    tierFeatures,
    reason: allowed ? undefined : `Feature '${featureId}' not available on ${tier} tier`,
  };
}

/**
 * Middleware factory to require a specific feature
 *
 * Usage:
 * ```typescript
 * router.post('/api/ml/train', requireFeature('ml_models'), handler);
 * router.post('/api/export/bulk', requireFeature('bulk_export'), handler);
 * ```
 */
export function requireFeature(featureId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const accessCheck = await checkFeatureAccess(userId, featureId);

      // Attach access info to request for downstream use
      req.featureAccess = {
        allowed: accessCheck.allowed,
        feature: featureId,
        userTier: accessCheck.tier,
        tierFeatures: accessCheck.tierFeatures,
        reason: accessCheck.reason,
      };

      if (!accessCheck.allowed) {
        console.log(`[Feature Gate] Access denied: user=${userId}, feature=${featureId}, tier=${accessCheck.tier}`);

        return res.status(403).json({
          success: false,
          error: `Feature '${featureId}' requires a higher subscription tier`,
          code: 'FEATURE_NOT_AVAILABLE',
          details: {
            feature: featureId,
            currentTier: accessCheck.tier,
            availableFeatures: accessCheck.tierFeatures,
            upgradeUrl: '/pricing',
          },
        });
      }

      next();
    } catch (error) {
      console.error('[Feature Gate] Error checking feature access:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify feature access',
        code: 'FEATURE_CHECK_FAILED',
      });
    }
  };
}

/**
 * Middleware factory to require access to a specific journey type
 *
 * Usage:
 * ```typescript
 * router.post('/api/journeys/technical/start', requireJourneyAccess('technical'), handler);
 * ```
 */
export function requireJourneyAccess(journeyType: JourneyType) {
  const featureId = JOURNEY_TO_FEATURE_MAP[journeyType];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const accessCheck = await checkFeatureAccess(userId, featureId);

      // Attach access info to request
      req.featureAccess = {
        allowed: accessCheck.allowed,
        feature: featureId,
        userTier: accessCheck.tier,
        tierFeatures: accessCheck.tierFeatures,
        reason: accessCheck.reason,
      };

      if (!accessCheck.allowed) {
        console.log(`[Feature Gate] Journey access denied: user=${userId}, journey=${journeyType}, tier=${accessCheck.tier}`);

        return res.status(403).json({
          success: false,
          error: `Journey type '${journeyType}' requires a higher subscription tier`,
          code: 'JOURNEY_NOT_AVAILABLE',
          details: {
            journeyType,
            requiredFeature: featureId,
            currentTier: accessCheck.tier,
            availableFeatures: accessCheck.tierFeatures,
            upgradeUrl: '/pricing',
          },
        });
      }

      next();
    } catch (error) {
      console.error('[Feature Gate] Error checking journey access:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify journey access',
        code: 'JOURNEY_CHECK_FAILED',
      });
    }
  };
}

/**
 * Middleware to check multiple features (all required)
 *
 * Usage:
 * ```typescript
 * router.post('/api/advanced', requireAllFeatures(['ml_models', 'code_generation']), handler);
 * ```
 */
export function requireAllFeatures(featureIds: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const billingService = getBillingService();
      const tier = await getUserSubscriptionTier(userId);
      const tierConfig = billingService.getTierConfig(tier);
      const tierFeatures = tierConfig?.features || [];

      // Check if tier has unlimited access
      if (tierFeatures.includes(GATED_FEATURES.UNLIMITED_EVERYTHING)) {
        req.featureAccess = {
          allowed: true,
          feature: featureIds.join(','),
          userTier: tier,
          tierFeatures,
        };
        return next();
      }

      // Check each required feature
      const missingFeatures = featureIds.filter(f => !tierFeatures.includes(f));

      if (missingFeatures.length > 0) {
        console.log(`[Feature Gate] Multiple features denied: user=${userId}, missing=${missingFeatures.join(',')}, tier=${tier}`);

        return res.status(403).json({
          success: false,
          error: `Features not available on your subscription tier`,
          code: 'FEATURES_NOT_AVAILABLE',
          details: {
            requiredFeatures: featureIds,
            missingFeatures,
            currentTier: tier,
            availableFeatures: tierFeatures,
            upgradeUrl: '/pricing',
          },
        });
      }

      req.featureAccess = {
        allowed: true,
        feature: featureIds.join(','),
        userTier: tier,
        tierFeatures,
      };

      next();
    } catch (error) {
      console.error('[Feature Gate] Error checking multiple features:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify feature access',
        code: 'FEATURE_CHECK_FAILED',
      });
    }
  };
}

/**
 * Middleware to check if user has ANY of the specified features
 *
 * Usage:
 * ```typescript
 * router.post('/api/export', requireAnyFeature(['data_export', 'bulk_export']), handler);
 * ```
 */
export function requireAnyFeature(featureIds: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const billingService = getBillingService();
      const tier = await getUserSubscriptionTier(userId);
      const tierConfig = billingService.getTierConfig(tier);
      const tierFeatures = tierConfig?.features || [];

      // Check if tier has unlimited access
      if (tierFeatures.includes(GATED_FEATURES.UNLIMITED_EVERYTHING)) {
        req.featureAccess = {
          allowed: true,
          feature: featureIds.join('|'),
          userTier: tier,
          tierFeatures,
        };
        return next();
      }

      // Check if any required feature is available
      const hasAnyFeature = featureIds.some(f => tierFeatures.includes(f));

      if (!hasAnyFeature) {
        // P0-4 FIX: Check if user has trial credits for any of these features
        const trialCheck = await hasAvailableTrialCredits(userId);
        const requestedInTrialFeatures = featureIds.filter(f => TRIAL_CREDIT_FEATURES.includes(f as any));
        const hasTrialFeature = trialCheck.hasCredits && requestedInTrialFeatures.length > 0;

        console.log(`🔍 [Feature Gate] Trial check: user=${userId}, tier=${tier}, hasCredits=${trialCheck.hasCredits}, available=${trialCheck.available}, requestedFeatures=[${featureIds.join(',')}], trialableFeatures=[${requestedInTrialFeatures.join(',')}]`);

        if (hasTrialFeature) {
          console.log(`✅ [Feature Gate] User ${userId} granted access via trial credits (${trialCheck.available} remaining)`);
          (req as any).featureAccess = {
            allowed: true,
            feature: featureIds.join('|'),
            userTier: tier,
            usingTrialCredits: true,
          };
          return next();
        }

        // No tier feature AND no trial credits - return 403
        console.log(`[Feature Gate] No matching features: user=${userId}, required=${featureIds.join('|')}, tier=${tier}`);

        return res.status(403).json({
          success: false,
          error: `None of the required features are available on your subscription tier`,
          code: 'FEATURES_NOT_AVAILABLE',
          details: {
            requiredFeatures: featureIds,
            currentTier: tier,
            availableFeatures: tierFeatures,
            upgradeUrl: '/pricing',
          },
        });
      }

      req.featureAccess = {
        allowed: true,
        feature: featureIds.join('|'),
        userTier: tier,
        tierFeatures,
      };

      next();
    } catch (error) {
      console.error('[Feature Gate] Error checking any features:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify feature access',
        code: 'FEATURE_CHECK_FAILED',
      });
    }
  };
}

/**
 * Utility function to check feature access without middleware (for use in route handlers)
 */
export async function hasFeatureAccess(userId: string, featureId: string): Promise<boolean> {
  const result = await checkFeatureAccess(userId, featureId);
  return result.allowed;
}

/**
 * Get all features available to a user based on their tier
 */
export async function getUserFeatures(userId: string): Promise<string[]> {
  const billingService = getBillingService();
  const tier = await getUserSubscriptionTier(userId);
  const tierConfig = billingService.getTierConfig(tier);
  return tierConfig?.features || [];
}

export default {
  requireFeature,
  requireJourneyAccess,
  requireAllFeatures,
  requireAnyFeature,
  hasFeatureAccess,
  getUserFeatures,
  checkFeatureAccess,
  GATED_FEATURES,
};
