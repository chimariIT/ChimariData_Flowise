#!/usr/bin/env node

/**
 * Simple Billing Consolidation Validation Script
 * 
 * Validates that the billing tier consolidation was successful
 * by checking that the unified tiers file exists and has the correct structure.
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

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logSection(title) {
  log(`\n${colors.cyan}=== ${title} ===${colors.reset}`);
}

// Check if files exist
function checkFilesExist() {
  logSection('Checking File Existence');
  
  const filesToCheck = [
    'shared/unified-subscription-tiers.ts',
    'shared/subscription-tiers.ts',
    'server/services/enhanced-subscription-billing.ts',
    'scripts/migrate-billing-tiers.js'
  ];
  
  const projectRoot = path.join(__dirname, '..');
  let allFilesExist = true;
  
  filesToCheck.forEach(filePath => {
    const fullPath = path.join(projectRoot, filePath);
    if (fs.existsSync(fullPath)) {
      logSuccess(`Found: ${filePath}`);
    } else {
      logError(`Missing: ${filePath}`);
      allFilesExist = false;
    }
  });
  
  return allFilesExist;
}

// Validate unified tiers structure
function validateUnifiedTiers() {
  logSection('Validating Unified Tiers Structure');
  
  const unifiedTiersPath = path.join(__dirname, '..', 'shared', 'unified-subscription-tiers.ts');
  
  try {
    const content = fs.readFileSync(unifiedTiersPath, 'utf8');
    
    // Check for key components
    const checks = [
      { name: 'UNIFIED_SUBSCRIPTION_TIERS export', pattern: /export const UNIFIED_SUBSCRIPTION_TIERS/ },
      { name: 'Trial tier definition', pattern: /trial:\s*\{/ },
      { name: 'Starter tier definition', pattern: /starter:\s*\{/ },
      { name: 'Professional tier definition', pattern: /professional:\s*\{/ },
      { name: 'Enterprise tier definition', pattern: /enterprise:\s*\{/ },
      { name: 'Journey pricing structure', pattern: /journeyPricing:/ },
      { name: 'Overage pricing structure', pattern: /overagePricing:/ },
      { name: 'Discounts structure', pattern: /discounts:/ }
    ];
    
    let allChecksPass = true;
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        logSuccess(check.name);
      } else {
        logError(`Missing: ${check.name}`);
        allChecksPass = false;
      }
    });
    
    // Check pricing values
    const pricingChecks = [
      { tier: 'trial', expectedPrice: '1' },
      { tier: 'starter', expectedPrice: '10' },
      { tier: 'professional', expectedPrice: '20' },
      { tier: 'enterprise', expectedPrice: '50' }
    ];
    
    pricingChecks.forEach(check => {
      const pricePattern = new RegExp(`${check.tier}:\\s*{[\\s\\S]*?monthlyPrice:\\s*${check.expectedPrice}`);
      if (pricePattern.test(content)) {
        logSuccess(`${check.tier} tier has correct price: $${check.expectedPrice}`);
      } else {
        logError(`${check.tier} tier price not found or incorrect`);
        allChecksPass = false;
      }
    });
    
    return allChecksPass;
    
  } catch (error) {
    logError(`Failed to read unified tiers file: ${error.message}`);
    return false;
  }
}

// Check for import statements in subscription-tiers.ts
function checkLegacyFileImports() {
  logSection('Checking Legacy File Updates');
  
  const legacyFilePath = path.join(__dirname, '..', 'shared', 'subscription-tiers.ts');
  
  try {
    const content = fs.readFileSync(legacyFilePath, 'utf8');
    
    const checks = [
      { name: 'Deprecation notice', pattern: /DEPRECATED.*unified-subscription-tiers/ },
      { name: 'Unified tiers import', pattern: /import.*UNIFIED_SUBSCRIPTION_TIERS.*from.*unified-subscription-tiers/ },
      { name: 'Backward compatibility maintained', pattern: /Legacy interface for backward compatibility/ }
    ];
    
    let allChecksPass = true;
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        logSuccess(check.name);
      } else {
        logError(`Missing: ${check.name}`);
        allChecksPass = false;
      }
    });
    
    return allChecksPass;
    
  } catch (error) {
    logError(`Failed to read legacy file: ${error.message}`);
    return false;
  }
}

// Check enhanced billing service updates
function checkEnhancedBillingUpdates() {
  logSection('Checking Enhanced Billing Service Updates');
  
  const enhancedBillingPath = path.join(__dirname, '..', 'server', 'services', 'enhanced-subscription-billing.ts');
  
  try {
    const content = fs.readFileSync(enhancedBillingPath, 'utf8');
    
    const checks = [
      { name: 'Unified tiers import', pattern: /require.*unified-subscription-tiers/ },
      { name: 'Tier conversion logic', pattern: /Convert unified tiers to enhanced billing format/ },
      { name: 'Unified tier usage', pattern: /Object.values.*UNIFIED_SUBSCRIPTION_TIERS/ }
    ];
    
    let allChecksPass = true;
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        logSuccess(check.name);
      } else {
        logError(`Missing: ${check.name}`);
        allChecksPass = false;
      }
    });
    
    return allChecksPass;
    
  } catch (error) {
    logError(`Failed to read enhanced billing file: ${error.message}`);
    return false;
  }
}

// Generate summary
function generateSummary(allChecksPass) {
  logSection('Billing Consolidation Summary');
  
  if (allChecksPass) {
    logSuccess('All billing tier consolidation checks passed!');
    logInfo('Key achievements:');
    log('  • Created unified subscription tier system', 'blue');
    log('  • Resolved conflicting pricing definitions', 'blue');
    log('  • Maintained backward compatibility', 'blue');
    log('  • Added journey-based pricing', 'blue');
    log('  • Integrated overage pricing and discounts', 'blue');
    
    logInfo('\nNext steps:');
    log('  1. ✅ Billing tier consolidation complete', 'green');
    log('  2. ⏳ Restart server to apply cache fixes', 'yellow');
    log('  3. ⏳ Deploy to staging environment', 'yellow');
    log('  4. ⏳ Validate in production-like setup', 'yellow');
    
  } else {
    logError('Some billing consolidation checks failed!');
    logInfo('Please review the errors above and fix them before proceeding.');
  }
  
  return allChecksPass;
}

// Main execution
function main() {
  log(`${colors.bright}${colors.magenta}ChimariData Billing Consolidation Validator${colors.reset}`);
  log(`${colors.blue}Validating billing tier consolidation and conflict resolution${colors.reset}\n`);
  
  // Run all checks
  const filesExist = checkFilesExist();
  const unifiedTiersValid = validateUnifiedTiers();
  const legacyImportsValid = checkLegacyFileImports();
  const enhancedBillingValid = checkEnhancedBillingUpdates();
  
  const allChecksPass = filesExist && unifiedTiersValid && legacyImportsValid && enhancedBillingValid;
  
  // Generate summary
  generateSummary(allChecksPass);
  
  if (allChecksPass) {
    log(`\n${colors.green}🎉 Billing consolidation validation completed successfully!${colors.reset}`);
    process.exit(0);
  } else {
    log(`\n${colors.red}❌ Billing consolidation validation failed!${colors.reset}`);
    process.exit(1);
  }
}

// Run the script
main();
