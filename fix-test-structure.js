#!/usr/bin/env node

import fs from 'fs';

// Read the test file
let testContent = fs.readFileSync('dynamic-pricing-e2e-test.cjs', 'utf8');

// Fix test expectations to match API response structure
const fixes = [
  // Fix analysis data access
  {
    search: /analysisResponse\.data\.recordCount/g,
    replace: 'analysisResponse.data.data.recordCount'
  },
  {
    search: /analysisResponse\.data\.columnCount/g,
    replace: 'analysisResponse.data.data.columnCount'
  },
  {
    search: /analysisResponse\.data\.piiDetected/g,
    replace: 'analysisResponse.data.data.piiDetected'
  },
  
  // Fix pricing response access
  {
    search: /pricingResponse\.data\.pricing\.totalCost/g,
    replace: 'pricingResponse.data.pricing.finalTotal'
  },
  {
    search: /pricingResponse\.data\.pricing\.multiFeatureDiscount/g,
    replace: 'pricingResponse.data.pricing.discounts.multiFeatureDiscount'
  },
  {
    search: /pricingResponse\.data\.totalCost/g,
    replace: 'pricingResponse.data.pricing.finalTotal'
  },
  
  // Fix workflow state access
  {
    search: /workflowResponse\.data\.currentStep/g,
    replace: 'workflowResponse.data.currentStep'
  },
  
  // Fix empty features test - check nested structure
  {
    search: /emptyResponse\.data\.totalCost === 0/g,
    replace: 'emptyResponse.data.pricing.totalCost === 0'
  }
];

// Apply all fixes
fixes.forEach(fix => {
  testContent = testContent.replace(fix.search, fix.replace);
});

// Write the updated test file
fs.writeFileSync('dynamic-pricing-e2e-test.cjs', testContent);

console.log('Test structure fixes applied successfully!');