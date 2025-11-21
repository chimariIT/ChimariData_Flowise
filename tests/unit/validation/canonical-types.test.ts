/**
 * Unit Tests for Canonical Type Definitions
 *
 * These tests ensure type safety and validation logic consistency
 * across the entire platform.
 */

import { describe, test, expect } from 'vitest';
import {
  // Enums
  UserRoleEnum,
  JourneyTypeEnum,
  SubscriptionTierEnum,
  SubscriptionStatusEnum,
  FeatureComplexityEnum,
  ProjectStatusEnum,
  AgentTypeEnum,
  PIIDecisionEnum,

  // Types
  UserRole,
  JourneyType,
  SubscriptionTier,
  FeatureComplexity,

  // Helper functions
  canAccessJourney,
  canAccessJourneyForTier,
  getAllowedJourneysForRole,
  getAllowedJourneysForTier,
  validateJourneyAccess,
  determineFeatureComplexity,
  getTierPriority,
  isHigherTier,

  // Type guards
  isUserRole,
  isJourneyType,
  isSubscriptionTier,
  isFeatureComplexity,

  // Constants
  DEFAULTS,
  journeyToRoleMapping,
  tierToJourneyMapping
} from '../../../shared/canonical-types';

// ==========================================
// ENUM VALIDATION TESTS
// ==========================================

describe('UserRoleEnum', () => {
  test('parses valid user roles', () => {
    expect(UserRoleEnum.parse('non-tech')).toBe('non-tech');
    expect(UserRoleEnum.parse('business')).toBe('business');
    expect(UserRoleEnum.parse('technical')).toBe('technical');
    expect(UserRoleEnum.parse('consultation')).toBe('consultation');
    expect(UserRoleEnum.parse('custom')).toBe('custom');
  });

  test('rejects invalid user roles', () => {
    expect(() => UserRoleEnum.parse('invalid')).toThrow();
    expect(() => UserRoleEnum.parse('admin')).toThrow();
    expect(() => UserRoleEnum.parse('user')).toThrow();
    expect(() => UserRoleEnum.parse('')).toThrow();
    expect(() => UserRoleEnum.parse(null)).toThrow();
  });

  test('safeParse returns success status', () => {
    expect(UserRoleEnum.safeParse('non-tech').success).toBe(true);
    expect(UserRoleEnum.safeParse('invalid').success).toBe(false);
    expect(UserRoleEnum.safeParse('custom').success).toBe(true);
  });
});

describe('JourneyTypeEnum', () => {
  test('parses valid journey types', () => {
    expect(JourneyTypeEnum.parse('ai_guided')).toBe('ai_guided');
    expect(JourneyTypeEnum.parse('template_based')).toBe('template_based');
    expect(JourneyTypeEnum.parse('self_service')).toBe('self_service');
    expect(JourneyTypeEnum.parse('consultation')).toBe('consultation');
    expect(JourneyTypeEnum.parse('custom')).toBe('custom');
  });

  test('rejects invalid journey types', () => {
    // Old/deprecated journey type names
    expect(() => JourneyTypeEnum.parse('guided')).toThrow();
    expect(() => JourneyTypeEnum.parse('business')).toThrow();
    expect(() => JourneyTypeEnum.parse('technical')).toThrow();
    expect(() => JourneyTypeEnum.parse('nontech')).toThrow();
  });

  test('covers all expected journey types', () => {
    const values = JourneyTypeEnum.options;
    expect(values).toHaveLength(5);
    expect(values).toContain('ai_guided');
    expect(values).toContain('template_based');
    expect(values).toContain('self_service');
    expect(values).toContain('consultation');
    expect(values).toContain('custom');
  });
});

describe('SubscriptionTierEnum', () => {
  test('parses valid subscription tiers', () => {
    expect(SubscriptionTierEnum.parse('none')).toBe('none');
    expect(SubscriptionTierEnum.parse('trial')).toBe('trial');
    expect(SubscriptionTierEnum.parse('starter')).toBe('starter');
    expect(SubscriptionTierEnum.parse('professional')).toBe('professional');
    expect(SubscriptionTierEnum.parse('enterprise')).toBe('enterprise');
  });

  test('rejects invalid subscription tiers', () => {
    // Old/inconsistent tier names
    expect(() => SubscriptionTierEnum.parse('starter-nontech')).toThrow();
    expect(() => SubscriptionTierEnum.parse('professional-business')).toThrow();
    expect(() => SubscriptionTierEnum.parse('free')).toThrow();
    expect(() => SubscriptionTierEnum.parse('premium')).toThrow();
  });
});

describe('FeatureComplexityEnum', () => {
  test('parses valid complexity levels', () => {
    expect(FeatureComplexityEnum.parse('small')).toBe('small');
    expect(FeatureComplexityEnum.parse('medium')).toBe('medium');
    expect(FeatureComplexityEnum.parse('large')).toBe('large');
    expect(FeatureComplexityEnum.parse('extra_large')).toBe('extra_large');
  });

  test('rejects invalid complexity levels', () => {
    expect(() => FeatureComplexityEnum.parse('xs')).toThrow();
    expect(() => FeatureComplexityEnum.parse('xl')).toThrow();
    expect(() => FeatureComplexityEnum.parse('tiny')).toThrow();
  });
});

// ==========================================
// MAPPING VALIDATION TESTS
// ==========================================

describe('Journey to Role Mapping', () => {
  test('all journey types have role mappings', () => {
    const journeyTypes = JourneyTypeEnum.options;
    journeyTypes.forEach(journey => {
      expect(journeyToRoleMapping[journey]).toBeDefined();
      expect(Array.isArray(journeyToRoleMapping[journey])).toBe(true);
      expect(journeyToRoleMapping[journey].length).toBeGreaterThan(0);
    });
  });

  test('all roles in mapping are valid', () => {
    Object.values(journeyToRoleMapping).forEach(roles => {
      roles.forEach(role => {
        expect(UserRoleEnum.safeParse(role).success).toBe(true);
      });
    });
  });

  test('ai_guided journey maps to non-tech role only', () => {
    expect(journeyToRoleMapping.ai_guided).toEqual(['non-tech']);
  });

  test('template_based journey maps to business role only', () => {
    expect(journeyToRoleMapping.template_based).toEqual(['business']);
  });

  test('self_service journey maps to technical role only', () => {
    expect(journeyToRoleMapping.self_service).toEqual(['technical']);
  });

  test('consultation journey maps to multiple roles', () => {
    expect(journeyToRoleMapping.consultation).toContain('technical');
    expect(journeyToRoleMapping.consultation).toContain('business');
    expect(journeyToRoleMapping.consultation).toContain('consultation');
  });

  test('custom journey maps to hybrid-capable roles', () => {
    expect(journeyToRoleMapping.custom).toContain('technical');
    expect(journeyToRoleMapping.custom).toContain('business');
    expect(journeyToRoleMapping.custom).toContain('consultation');
    expect(journeyToRoleMapping.custom).toContain('custom');
  });
});

describe('Tier to Journey Mapping', () => {
  test('all subscription tiers have journey mappings', () => {
    const tiers = SubscriptionTierEnum.options;
    tiers.forEach(tier => {
      expect(tierToJourneyMapping[tier]).toBeDefined();
      expect(Array.isArray(tierToJourneyMapping[tier])).toBe(true);
    });
  });

  test('all journeys in mapping are valid', () => {
    Object.values(tierToJourneyMapping).forEach(journeys => {
      journeys.forEach(journey => {
        expect(JourneyTypeEnum.safeParse(journey).success).toBe(true);
      });
    });
  });

  test('none tier has no journeys', () => {
    expect(tierToJourneyMapping.none).toHaveLength(0);
  });

  test('trial tier has limited journeys', () => {
    expect(tierToJourneyMapping.trial).toContain('ai_guided');
    expect(tierToJourneyMapping.trial).toHaveLength(1);
  });

  test('starter tier has more journeys than trial', () => {
    expect(tierToJourneyMapping.starter.length).toBeGreaterThan(tierToJourneyMapping.trial.length);
    expect(tierToJourneyMapping.starter).toContain('ai_guided');
    expect(tierToJourneyMapping.starter).toContain('template_based');
  });

  test('professional tier has even more journeys', () => {
    expect(tierToJourneyMapping.professional.length).toBeGreaterThan(tierToJourneyMapping.starter.length);
    expect(tierToJourneyMapping.professional).toContain('self_service');
  });

  test('enterprise tier has all journeys', () => {
    const allJourneys = JourneyTypeEnum.options;
    expect(tierToJourneyMapping.enterprise).toHaveLength(allJourneys.length);
    allJourneys.forEach(journey => {
      expect(tierToJourneyMapping.enterprise).toContain(journey);
    });
  });

  test('higher tiers include all journeys from lower tiers', () => {
    const trialJourneys = tierToJourneyMapping.trial;
    const starterJourneys = tierToJourneyMapping.starter;
    const proJourneys = tierToJourneyMapping.professional;

    trialJourneys.forEach(journey => {
      expect(starterJourneys).toContain(journey);
      expect(proJourneys).toContain(journey);
    });

    starterJourneys.forEach(journey => {
      expect(proJourneys).toContain(journey);
    });
  });
});

// ==========================================
// HELPER FUNCTION TESTS
// ==========================================

describe('canAccessJourney', () => {
  test('returns true when role can access journey', () => {
    expect(canAccessJourney('non-tech', 'ai_guided')).toBe(true);
    expect(canAccessJourney('business', 'template_based')).toBe(true);
    expect(canAccessJourney('technical', 'self_service')).toBe(true);
    expect(canAccessJourney('technical', 'consultation')).toBe(true);
    expect(canAccessJourney('business', 'consultation')).toBe(true);
    expect(canAccessJourney('custom', 'custom')).toBe(true);
  });

  test('returns false when role cannot access journey', () => {
    expect(canAccessJourney('non-tech', 'self_service')).toBe(false);
    expect(canAccessJourney('business', 'ai_guided')).toBe(false);
    expect(canAccessJourney('non-tech', 'consultation')).toBe(false);
    expect(canAccessJourney('non-tech', 'custom')).toBe(false);
  });
});

describe('canAccessJourneyForTier', () => {
  test('returns true when tier can access journey', () => {
    expect(canAccessJourneyForTier('trial', 'ai_guided')).toBe(true);
    expect(canAccessJourneyForTier('starter', 'template_based')).toBe(true);
    expect(canAccessJourneyForTier('professional', 'self_service')).toBe(true);
    expect(canAccessJourneyForTier('enterprise', 'consultation')).toBe(true);
    expect(canAccessJourneyForTier('enterprise', 'custom')).toBe(true);
  });

  test('returns false when tier cannot access journey', () => {
    expect(canAccessJourneyForTier('none', 'ai_guided')).toBe(false);
    expect(canAccessJourneyForTier('trial', 'consultation')).toBe(false);
    expect(canAccessJourneyForTier('starter', 'self_service')).toBe(false);
    expect(canAccessJourneyForTier('professional', 'custom')).toBe(false);
  });
});

describe('getAllowedJourneysForRole', () => {
  test('returns correct journeys for non-tech role', () => {
    const journeys = getAllowedJourneysForRole('non-tech');
    expect(journeys).toContain('ai_guided');
    expect(journeys).not.toContain('template_based');
    expect(journeys).not.toContain('self_service');
  });

  test('returns correct journeys for business role', () => {
    const journeys = getAllowedJourneysForRole('business');
    expect(journeys).toContain('template_based');
    expect(journeys).toContain('consultation');
    expect(journeys).toContain('custom');
    expect(journeys).not.toContain('ai_guided');
  });

  test('returns correct journeys for technical role', () => {
    const journeys = getAllowedJourneysForRole('technical');
    expect(journeys).toContain('self_service');
    expect(journeys).toContain('consultation');
    expect(journeys).toContain('custom');
  });

  test('consultation role has access to consultation journey', () => {
    const journeys = getAllowedJourneysForRole('consultation');
    expect(journeys).toContain('consultation');
    expect(journeys).toContain('custom');
  });

  test('custom role has access to custom journey', () => {
    const journeys = getAllowedJourneysForRole('custom');
    expect(journeys).toContain('custom');
    expect(journeys).toContain('consultation');
  });
});

describe('getAllowedJourneysForTier', () => {
  test('returns empty array for none tier', () => {
    const journeys = getAllowedJourneysForTier('none');
    expect(journeys).toHaveLength(0);
  });

  test('returns correct journeys for trial tier', () => {
    const journeys = getAllowedJourneysForTier('trial');
    expect(journeys).toContain('ai_guided');
    expect(journeys.length).toBe(1);
  });

  test('returns increasing journeys for higher tiers', () => {
    const starter = getAllowedJourneysForTier('starter');
    const professional = getAllowedJourneysForTier('professional');
    const enterprise = getAllowedJourneysForTier('enterprise');

    expect(professional.length).toBeGreaterThan(starter.length);
    expect(enterprise.length).toBeGreaterThan(professional.length);
  });

  test('enterprise tier includes custom journey only at top tier', () => {
    const professional = getAllowedJourneysForTier('professional');
    const enterprise = getAllowedJourneysForTier('enterprise');

    expect(professional).not.toContain('custom');
    expect(enterprise).toContain('custom');
  });
});

describe('validateJourneyAccess', () => {
  test('allows valid role and tier combination', () => {
    const result = validateJourneyAccess('non-tech', 'trial', 'ai_guided');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('blocks when role cannot access journey', () => {
    const result = validateJourneyAccess('non-tech', 'professional', 'self_service');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Role');
    expect(result.reason).toContain('cannot access');
  });

  test('blocks when tier cannot access journey', () => {
    const result = validateJourneyAccess('technical', 'starter', 'self_service');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Subscription tier');
    expect(result.reason).toContain('Upgrade');
  });

  test('provides helpful error messages', () => {
    const result1 = validateJourneyAccess('non-tech', 'enterprise', 'consultation');
    expect(result1.reason).toContain('non-tech');
    expect(result1.reason).toContain('consultation');

    const result2 = validateJourneyAccess('technical', 'trial', 'self_service');
    expect(result2.reason).toContain('trial');
    expect(result2.reason).toContain('self_service');
  });

  test('allows hybrid journeys only for eligible tier and role combinations', () => {
    const denied = validateJourneyAccess('business', 'professional', 'custom');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('Subscription tier');

    const approved = validateJourneyAccess('custom', 'enterprise', 'custom');
    expect(approved.allowed).toBe(true);
  });
});

describe('determineFeatureComplexity', () => {
  test('returns small for small datasets with simple operations', () => {
    expect(determineFeatureComplexity(500, 'simple')).toBe('small');
    expect(determineFeatureComplexity(999, 'simple')).toBe('small');
  });

  test('returns medium for medium datasets', () => {
    expect(determineFeatureComplexity(1000, 'simple')).toBe('medium');
    expect(determineFeatureComplexity(5000, 'standard')).toBe('medium');
    expect(determineFeatureComplexity(9999, 'advanced')).toBe('medium');
  });

  test('returns large for large datasets', () => {
    expect(determineFeatureComplexity(10000, 'simple')).toBe('large');
    expect(determineFeatureComplexity(50000, 'standard')).toBe('large');
    expect(determineFeatureComplexity(99999, 'advanced')).toBe('large');
  });

  test('returns extra_large for very large datasets', () => {
    expect(determineFeatureComplexity(100000, 'simple')).toBe('extra_large');
    expect(determineFeatureComplexity(500000, 'standard')).toBe('extra_large');
    expect(determineFeatureComplexity(1000000, 'advanced')).toBe('extra_large');
  });

  test('considers operation type', () => {
    // Small dataset with simple operation = small
    expect(determineFeatureComplexity(500, 'simple')).toBe('small');
    expect(determineFeatureComplexity(500, 'standard')).toBe('small');

    // Small dataset with complex operation = medium (operation complexity matters)
    expect(determineFeatureComplexity(500, 'advanced')).toBe('medium');
    expect(determineFeatureComplexity(500, 'enterprise')).toBe('medium');

    // Medium dataset with enterprise operation = large (both dimensions compound)
    expect(determineFeatureComplexity(5000, 'enterprise')).toBe('large');
    expect(determineFeatureComplexity(5000, 'advanced')).toBe('medium');

    // Large dataset with enterprise operation = extra_large
    expect(determineFeatureComplexity(50000, 'enterprise')).toBe('extra_large');
    expect(determineFeatureComplexity(50000, 'simple')).toBe('large');
  });
});

describe('getTierPriority', () => {
  test('returns correct priority for each tier', () => {
    expect(getTierPriority('none')).toBe(0);
    expect(getTierPriority('trial')).toBe(1);
    expect(getTierPriority('starter')).toBe(2);
    expect(getTierPriority('professional')).toBe(3);
    expect(getTierPriority('enterprise')).toBe(4);
  });

  test('priority increases with tier level', () => {
    const tiers: SubscriptionTier[] = ['none', 'trial', 'starter', 'professional', 'enterprise'];
    for (let i = 1; i < tiers.length; i++) {
      expect(getTierPriority(tiers[i])).toBeGreaterThan(getTierPriority(tiers[i - 1]));
    }
  });
});

describe('isHigherTier', () => {
  test('returns true when tier1 is higher than tier2', () => {
    expect(isHigherTier('professional', 'starter')).toBe(true);
    expect(isHigherTier('enterprise', 'professional')).toBe(true);
    expect(isHigherTier('starter', 'none')).toBe(true);
  });

  test('returns false when tier1 is lower than tier2', () => {
    expect(isHigherTier('starter', 'professional')).toBe(false);
    expect(isHigherTier('trial', 'enterprise')).toBe(false);
    expect(isHigherTier('none', 'trial')).toBe(false);
  });

  test('returns false when tiers are equal', () => {
    expect(isHigherTier('professional', 'professional')).toBe(false);
    expect(isHigherTier('starter', 'starter')).toBe(false);
  });
});

// ==========================================
// TYPE GUARD TESTS
// ==========================================

describe('Type Guards', () => {
  describe('isUserRole', () => {
    test('returns true for valid user roles', () => {
      expect(isUserRole('non-tech')).toBe(true);
      expect(isUserRole('business')).toBe(true);
      expect(isUserRole('technical')).toBe(true);
      expect(isUserRole('consultation')).toBe(true);
      expect(isUserRole('custom')).toBe(true);
    });

    test('returns false for invalid values', () => {
      expect(isUserRole('invalid')).toBe(false);
      expect(isUserRole('admin')).toBe(false);
      expect(isUserRole('')).toBe(false);
      expect(isUserRole(null)).toBe(false);
      expect(isUserRole(undefined)).toBe(false);
      expect(isUserRole(123)).toBe(false);
    });
  });

  describe('isJourneyType', () => {
    test('returns true for valid journey types', () => {
      expect(isJourneyType('ai_guided')).toBe(true);
      expect(isJourneyType('template_based')).toBe(true);
      expect(isJourneyType('self_service')).toBe(true);
      expect(isJourneyType('consultation')).toBe(true);
      expect(isJourneyType('custom')).toBe(true);
    });

    test('returns false for old/deprecated journey names', () => {
      expect(isJourneyType('guided')).toBe(false);
      expect(isJourneyType('business')).toBe(false);
      expect(isJourneyType('technical')).toBe(false);
    });
  });

  describe('isSubscriptionTier', () => {
    test('returns true for valid tiers', () => {
      expect(isSubscriptionTier('none')).toBe(true);
      expect(isSubscriptionTier('trial')).toBe(true);
      expect(isSubscriptionTier('starter')).toBe(true);
      expect(isSubscriptionTier('professional')).toBe(true);
      expect(isSubscriptionTier('enterprise')).toBe(true);
    });

    test('returns false for old tier names', () => {
      expect(isSubscriptionTier('starter-nontech')).toBe(false);
      expect(isSubscriptionTier('professional-business')).toBe(false);
      expect(isSubscriptionTier('free')).toBe(false);
    });
  });

  describe('isFeatureComplexity', () => {
    test('returns true for valid complexities', () => {
      expect(isFeatureComplexity('small')).toBe(true);
      expect(isFeatureComplexity('medium')).toBe(true);
      expect(isFeatureComplexity('large')).toBe(true);
      expect(isFeatureComplexity('extra_large')).toBe(true);
    });

    test('returns false for invalid values', () => {
      expect(isFeatureComplexity('xs')).toBe(false);
      expect(isFeatureComplexity('xl')).toBe(false);
      expect(isFeatureComplexity('huge')).toBe(false);
    });
  });
});

// ==========================================
// DEFAULTS TESTS
// ==========================================

describe('DEFAULTS', () => {
  test('has sensible default values', () => {
    expect(DEFAULTS.USER_ROLE).toBe('non-tech');
    expect(DEFAULTS.SUBSCRIPTION_TIER).toBe('none');
    expect(DEFAULTS.SUBSCRIPTION_STATUS).toBe('inactive');
    expect(DEFAULTS.JOURNEY_TYPE).toBe('ai_guided');
    expect(DEFAULTS.PROJECT_STATUS).toBe('draft');
    expect(DEFAULTS.TECHNICAL_LEVEL).toBe('beginner');
    expect(DEFAULTS.DATA_SOURCE).toBe('upload');
    expect(DEFAULTS.RETENTION_POLICY).toBe('90_days');
  });

  test('all default values are valid enum values', () => {
    expect(UserRoleEnum.safeParse(DEFAULTS.USER_ROLE).success).toBe(true);
    expect(SubscriptionTierEnum.safeParse(DEFAULTS.SUBSCRIPTION_TIER).success).toBe(true);
    expect(SubscriptionStatusEnum.safeParse(DEFAULTS.SUBSCRIPTION_STATUS).success).toBe(true);
    expect(JourneyTypeEnum.safeParse(DEFAULTS.JOURNEY_TYPE).success).toBe(true);
    expect(ProjectStatusEnum.safeParse(DEFAULTS.PROJECT_STATUS).success).toBe(true);
  });

  test('defaults are consistent with business logic', () => {
    // Default role should be able to access default journey
    expect(canAccessJourney(DEFAULTS.USER_ROLE, DEFAULTS.JOURNEY_TYPE)).toBe(true);
  });
});

// ==========================================
// INTEGRATION TESTS
// ==========================================

describe('Integration - User Journey Selection', () => {
  test('new non-tech user with trial can start ai_guided journey', () => {
    const role: UserRole = 'non-tech';
    const tier: SubscriptionTier = 'trial';
    const journey: JourneyType = 'ai_guided';

    const validation = validateJourneyAccess(role, tier, journey);
    expect(validation.allowed).toBe(true);
  });

  test('business user with starter can use template_based journey', () => {
    const role: UserRole = 'business';
    const tier: SubscriptionTier = 'starter';
    const journey: JourneyType = 'template_based';

    const validation = validateJourneyAccess(role, tier, journey);
    expect(validation.allowed).toBe(true);
  });

  test('technical user needs professional tier for self_service', () => {
    const role: UserRole = 'technical';
    const journey: JourneyType = 'self_service';

    // Should fail with starter
    const starterValidation = validateJourneyAccess(role, 'starter', journey);
    expect(starterValidation.allowed).toBe(false);
    expect(starterValidation.reason).toContain('Upgrade');

    // Should succeed with professional
    const proValidation = validateJourneyAccess(role, 'professional', journey);
    expect(proValidation.allowed).toBe(true);
  });

  test('consultation journey requires high tier', () => {
    const journey: JourneyType = 'consultation';

    expect(canAccessJourneyForTier('trial', journey)).toBe(false);
    expect(canAccessJourneyForTier('starter', journey)).toBe(false);
    expect(canAccessJourneyForTier('professional', journey)).toBe(false);
    expect(canAccessJourneyForTier('enterprise', journey)).toBe(true);
  });

  test('custom journey requires enterprise tier and hybrid-capable role', () => {
    const journey: JourneyType = 'custom';

    expect(canAccessJourney('business', journey)).toBe(true);
    expect(canAccessJourneyForTier('professional', journey)).toBe(false);
    expect(canAccessJourneyForTier('enterprise', journey)).toBe(true);
  });
});

describe('Integration - Feature Complexity Billing', () => {
  test('starter user uploading small dataset', () => {
    const recordCount = 500;
    const operation = 'simple';

    const complexity = determineFeatureComplexity(recordCount, operation);
    expect(complexity).toBe('small');

    // Starter tier should handle small complexity
    // (This would integrate with billing service)
  });

  test('professional user with large dataset triggers spark processing', () => {
    const recordCount = 150000;
    const operation = 'advanced';

    const complexity = determineFeatureComplexity(recordCount, operation);
    expect(complexity).toBe('extra_large');

    // Would trigger Spark delegation in actual system
  });
});

describe('Performance - Enum Validation Speed', () => {
  test('validates 10,000 journey types quickly', () => {
    const start = Date.now();

    for (let i = 0; i < 10000; i++) {
      JourneyTypeEnum.safeParse('ai_guided');
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200); // Should complete in <200ms on typical dev machines
  });

  test('validates 10,000 subscription tiers quickly', () => {
    const start = Date.now();

    for (let i = 0; i < 10000; i++) {
      SubscriptionTierEnum.safeParse('professional');
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200);
  });

  test('journey access validation is fast', () => {
    const start = Date.now();

    for (let i = 0; i < 10000; i++) {
      validateJourneyAccess('technical', 'professional', 'self_service');
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(400); // <400ms for 10k validations
  });
});
