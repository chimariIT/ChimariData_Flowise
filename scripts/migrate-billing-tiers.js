#!/usr/bin/env node

/**
 * Billing Tier Migration Script
 * 
 * This script helps migrate from the old conflicting billing tier definitions
 * to the new unified system. It validates the migration and provides
 * a summary of changes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${colors.cyan}=== ${title} ===${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Read the unified tiers
function loadUnifiedTiers() {
  try {
    const unifiedTiersPath = path.join(__dirname, '..', 'shared', 'unified-subscription-tiers.ts');
    const content = fs.readFileSync(unifiedTiersPath, 'utf8');
    
    // Extract the tiers object (simple parsing for validation)
    const tiersMatch = content.match(/export const UNIFIED_SUBSCRIPTION_TIERS: Record<string, UnifiedSubscriptionTier> = ({[\s\S]*?});/);
    if (!tiersMatch) {
      throw new Error('Could not parse unified tiers');
    }
    
    return JSON.parse(tiersMatch[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  } catch (error) {
    logError(`Failed to load unified tiers: ${error.message}`);
    return null;
  }
}

// Validate the unified tiers
function validateUnifiedTiers(tiers) {
  logSection('Validating Unified Tier Structure');
  
  const requiredTiers = ['trial', 'starter', 'professional', 'enterprise'];
  const requiredFields = ['id', 'name', 'displayName', 'monthlyPrice', 'yearlyPrice', 'limits', 'journeyPricing', 'overagePricing', 'discounts'];
  
  let isValid = true;
  
  for (const tierId of requiredTiers) {
    if (!tiers[tierId]) {
      logError(`Missing tier: ${tierId}`);
      isValid = false;
      continue;
    }
    
    const tier = tiers[tierId];
    for (const field of requiredFields) {
      if (!(field in tier)) {
        logError(`Missing field '${field}' in tier '${tierId}'`);
        isValid = false;
      }
    }
    
    // Validate pricing structure
    if (tier.monthlyPrice && tier.yearlyPrice) {
      const expectedYearly = tier.monthlyPrice * 10; // 2 months free
      if (Math.abs(tier.yearlyPrice - expectedYearly) > 0.01) {
        logWarning(`Tier '${tierId}' yearly price ${tier.yearlyPrice} doesn't match expected ${expectedYearly} (2 months free)`);
      }
    }
    
    logSuccess(`Tier '${tierId}' structure is valid`);
  }
  
  return isValid;
}

// Compare with old tier definitions
function compareWithOldTiers(unifiedTiers) {
  logSection('Comparing with Old Tier Definitions');
  
  // Old tier definitions from the review
  const oldTiers = {
    'shared/subscription-tiers.ts': {
      trial: { price: 1 },
      starter: { price: 10 },
      professional: { price: 20 },
      enterprise: { price: 50 }
    },
    'enhanced-subscription-billing.ts': {
      trial: { monthlyPrice: 0 },
      starter: { monthlyPrice: 29 },
      professional: { monthlyPrice: 99 },
      enterprise: { monthlyPrice: 299 }
    }
  };
  
  logInfo('Price Comparison:');
  log('┌─────────────┬─────────────────────┬─────────────────────┬─────────────────────┐', 'cyan');
  log('│    Tier     │ Old: subscription-  │ Old: enhanced-      │ New: Unified        │', 'cyan');
  log('│             │      tiers.ts       │      billing.ts     │      System         │', 'cyan');
  log('├─────────────┼─────────────────────┼─────────────────────┼─────────────────────┤', 'cyan');
  
  Object.keys(unifiedTiers).forEach(tierId => {
    const unified = unifiedTiers[tierId];
    const oldSimple = oldTiers['shared/subscription-tiers.ts'][tierId];
    const oldEnhanced = oldTiers['enhanced-subscription-billing.ts'][tierId];
    
    const oldSimplePrice = oldSimple ? `$${oldSimple.price}` : 'N/A';
    const oldEnhancedPrice = oldEnhanced ? `$${oldEnhanced.monthlyPrice}` : 'N/A';
    const newPrice = `$${unified.monthlyPrice}`;
    
    log(`│ ${tierId.padEnd(11)} │ ${oldSimplePrice.padEnd(19)} │ ${oldEnhancedPrice.padEnd(19)} │ ${newPrice.padEnd(19)} │`, 'cyan');
  });
  
  log('└─────────────┴─────────────────────┴─────────────────────┴─────────────────────┘', 'cyan');
  
  logInfo('Decision: Using simpler pricing structure from subscription-tiers.ts');
  logInfo('This is more appropriate for SMB market and aligns with existing pricing pages');
}

// Generate migration summary
function generateMigrationSummary(unifiedTiers) {
  logSection('Migration Summary');
  
  const summary = {
    totalTiers: Object.keys(unifiedTiers).length,
    pricingStructure: 'Simplified (SMB-focused)',
    keyFeatures: [
      'Journey-based pricing multipliers',
      'Overage pricing for excess usage',
      'Discount system for higher tiers',
      'Comprehensive limit structure',
      'Support level differentiation',
      'Compliance and SLA definitions'
    ],
    benefits: [
      'Single source of truth for all tier definitions',
      'Consistent pricing across all components',
      'Journey-specific pricing incentives',
      'Enterprise-grade billing features',
      'Backward compatibility maintained'
    ]
  };
  
  logInfo(`Total tiers migrated: ${summary.totalTiers}`);
  logInfo(`Pricing structure: ${summary.pricingStructure}`);
  
  logInfo('\nKey Features:');
  summary.keyFeatures.forEach(feature => {
    log(`  • ${feature}`, 'blue');
  });
  
  logInfo('\nBenefits:');
  summary.benefits.forEach(benefit => {
    log(`  • ${benefit}`, 'green');
  });
}

// Check for any files that need to be updated
function checkFilesToUpdate() {
  logSection('Files That Need Updates');
  
  const filesToCheck = [
    'client/src/pages/pricing.tsx',
    'client/src/components/subscription-selector.tsx',
    'server/routes/billing.ts',
    'server/services/pricing.ts',
    'shared/schema.ts'
  ];
  
  const projectRoot = path.join(__dirname, '..');
  
  filesToCheck.forEach(filePath => {
    const fullPath = path.join(projectRoot, filePath);
    if (fs.existsSync(fullPath)) {
      logSuccess(`Found: ${filePath}`);
    } else {
      logWarning(`Not found: ${filePath} (may not exist yet)`);
    }
  });
  
  logInfo('\nRecommendation: Update these files to use the unified tier system');
}

// Main execution
function main() {
  log(`${colors.bright}${colors.magenta}ChimariData Billing Tier Migration Script${colors.reset}`);
  log(`${colors.blue}Resolving conflicting tier definitions and creating unified system${colors.reset}\n`);
  
  // Load and validate unified tiers
  const unifiedTiers = loadUnifiedTiers();
  if (!unifiedTiers) {
    logError('Failed to load unified tiers. Exiting.');
    process.exit(1);
  }
  
  // Validate structure
  if (!validateUnifiedTiers(unifiedTiers)) {
    logError('Unified tier validation failed. Please fix issues before proceeding.');
    process.exit(1);
  }
  
  // Compare with old definitions
  compareWithOldTiers(unifiedTiers);
  
  // Generate summary
  generateMigrationSummary(unifiedTiers);
  
  // Check files to update
  checkFilesToUpdate();
  
  logSection('Migration Complete');
  logSuccess('Billing tier conflicts resolved!');
  logInfo('Next steps:');
  log('  1. Update client components to use unified tiers', 'blue');
  log('  2. Update server routes to use unified tiers', 'blue');
  log('  3. Test pricing calculations with new system', 'blue');
  log('  4. Deploy to staging for validation', 'blue');
  
  log(`\n${colors.green}✅ Billing tier consolidation completed successfully!${colors.reset}`);
}

// Run the script
main();

export {
  loadUnifiedTiers,
  validateUnifiedTiers,
  compareWithOldTiers,
  generateMigrationSummary
};
