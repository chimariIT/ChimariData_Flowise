/**
 * Debug Trial Upload - Step by step testing
 */

import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

class TrialUploadDebugger {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testCsvContent = `name,age,email,salary
John Doe,25,john@example.com,50000
Jane Smith,30,jane@example.com,65000
Bob Johnson,35,bob@example.com,70000`;
  }

  async debugCompleteFlow() {
    console.log('🔍 Debugging Complete Trial Upload Flow...\n');
    
    try {
      // Step 1: Test trial upload
      console.log('Step 1: Testing trial upload...');
      const uploadResult = await this.testTrialUpload();
      
      if (uploadResult.success && uploadResult.requiresPIIDecision) {
        console.log('✅ Trial upload successful, PII detected');
        console.log('📋 PII Details:', uploadResult.piiResult.detectedPII);
        
        // Step 2: Test PII decision
        console.log('\nStep 2: Testing PII decision...');
        const piiResult = await this.testPIIDecision(uploadResult.tempFileId);
        
        if (piiResult.success && piiResult.trialResults) {
          console.log('✅ PII decision successful');
          console.log('📊 Results structure:', Object.keys(piiResult.trialResults));
          
          // Check if results have expected structure
          this.validateTrialResults(piiResult.trialResults);
        } else {
          console.error('❌ PII decision failed:', piiResult.error);
        }
      } else {
        console.error('❌ Trial upload failed:', uploadResult.error);
      }
      
    } catch (error) {
      console.error('❌ Debug failed:', error.message);
    }
  }

  async testTrialUpload() {
    const formData = new FormData();
    formData.append('file', Buffer.from(this.testCsvContent), {
      filename: 'debug-test.csv',
      contentType: 'text/csv'
    });

    const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
      method: 'POST',
      body: formData
    });

    return await response.json();
  }

  async testPIIDecision(tempFileId) {
    const response = await fetch(`${this.baseUrl}/api/trial-pii-decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tempFileId: tempFileId,
        decision: 'include'
      })
    });

    return await response.json();
  }

  validateTrialResults(results) {
    console.log('\n🔍 Validating Trial Results Structure:');
    
    // Check schema
    if (results.schema) {
      console.log('✅ Schema present with', Object.keys(results.schema).length, 'columns');
    } else {
      console.log('❌ Schema missing');
    }

    // Check descriptive analysis
    if (results.descriptiveAnalysis) {
      console.log('✅ Descriptive analysis present');
      console.log('   - Keys:', Object.keys(results.descriptiveAnalysis));
    } else {
      console.log('❌ Descriptive analysis missing');
    }

    // Check visualizations
    if (results.basicVisualizations && Array.isArray(results.basicVisualizations)) {
      console.log('✅ Basic visualizations present:', results.basicVisualizations.length, 'charts');
    } else {
      console.log('❌ Basic visualizations missing or invalid');
    }

    // Check PII analysis
    if (results.piiAnalysis) {
      console.log('✅ PII analysis present');
    } else {
      console.log('❌ PII analysis missing');
    }
  }
}

// Run debug
const trialDebugger = new TrialUploadDebugger();
trialDebugger.debugCompleteFlow().catch(console.error);