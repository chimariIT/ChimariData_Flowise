/**
 * Test PII Bypass Logic - Before and After Comparison
 * This test demonstrates the complete flow when all PII is marked as "Not PII"
 */

class PIIBypassTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
  }

  async testPIIBypassFlow() {
    console.log('\n=== Testing PII Bypass Flow ===');
    
    try {
      // Step 1: Create test data with PII that should be bypassed
      const testData = this.createTestData();
      
      // Step 2: Upload file and get PII analysis
      const uploadResult = await this.uploadFile(testData);
      console.log('Upload result:', uploadResult);
      
      if (uploadResult.piiDetected) {
        console.log('PII detected:', uploadResult.piiAnalysis.detectedPII);
        
        // Step 3: Test the bypass logic by marking all PII as "Not PII"
        const bypassResult = await this.testBypassLogic(uploadResult);
        console.log('Bypass result:', bypassResult);
        
        // Step 4: Verify the result
        this.verifyBypassResult(bypassResult);
      } else {
        console.log('No PII detected - test needs data with PII');
      }
      
    } catch (error) {
      console.error('Test failed:', error);
    }
  }

  createTestData() {
    // Create CSV data with obvious PII that should be detected
    const csvData = [
      'Name,Email,Campaign_ID,Engagement_Score,Language',
      'John Smith,john@example.com,CAMP_001,85,English',
      'Jane Doe,jane@example.com,CAMP_002,92,Spanish',
      'Bob Johnson,bob@example.com,CAMP_003,78,French'
    ].join('\n');
    
    return new Blob([csvData], { type: 'text/csv' });
  }

  async uploadFile(fileData) {
    const formData = new FormData();
    formData.append('file', fileData, 'test_pii_data.csv');
    formData.append('name', 'PII Bypass Test');
    formData.append('description', 'Testing PII bypass functionality');
    formData.append('questions', JSON.stringify(['What is the engagement score distribution?']));

    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    return result;
  }

  async testBypassLogic(uploadResult) {
    // Simulate the bypass scenario where all PII is marked as "Not PII"
    const { tempFileId, piiAnalysis } = uploadResult;
    
    // Create the bypass request - all detected PII columns are marked as overridden
    const bypassRequest = {
      tempFileId: tempFileId,
      decision: 'include',
      anonymizationConfig: {
        overriddenColumns: piiAnalysis.detectedPII, // Mark all PII as "Not PII"
        bypassPII: true
      },
      projectData: {
        name: 'PII Bypass Test Project',
        description: 'Project created with all PII marked as Not PII',
        questions: ['What is the engagement score distribution?']
      }
    };

    console.log('Sending bypass request:', bypassRequest);

    const response = await fetch(`${this.baseUrl}/api/pii-decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bypassRequest)
    });

    const result = await response.json();
    console.log('Backend response:', result);
    return result;
  }

  verifyBypassResult(result) {
    console.log('\n=== Verification Results ===');
    
    if (result.success) {
      console.log('✅ SUCCESS: Bypass logic worked correctly');
      console.log('✅ Project ID returned:', result.projectId);
      console.log('✅ Should navigate to project page');
    } else {
      console.log('❌ FAILED: Bypass logic did not work');
      console.log('❌ Error:', result.error);
      console.log('❌ Would redirect to dashboard (home page)');
    }
  }
}

// Run the test
const tester = new PIIBypassTester();
tester.testPIIBypassFlow();