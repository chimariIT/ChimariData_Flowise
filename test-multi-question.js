/**
 * Multi-Question Processing Test
 * Tests that the system can handle multiple questions and provide individual answers
 */

import fs from 'fs';
import FormData from 'form-data';

class MultiQuestionTester {
  constructor() {
    this.results = [];
    this.serverUrl = 'http://localhost:5000';
  }

  async runTest() {
    console.log('\n🔄 Testing Multi-Question Processing...\n');

    try {
      await this.testMultipleQuestions();
      await this.generateReport();
    } catch (error) {
      console.error('Test suite error:', error);
    }
  }

  async testMultipleQuestions() {
    try {
      // Test with the marketing campaign dataset
      const testFile = './attached_assets/marketing_campaign_dataset_1751312868286.csv';
      
      if (!fs.existsSync(testFile)) {
        this.addResult('File Check', 'FAIL', 'Test file not found');
        return;
      }

      // Create form data with multiple questions
      const form = new FormData();
      form.append('file', fs.createReadStream(testFile));
      form.append('questions', JSON.stringify([
        'How many campaigns are in this dataset?',
        'Where do customers live?',
        'What is the performance rate?'
      ]));
      form.append('piiHandled', 'false');
      form.append('anonymizationApplied', 'false');

      const response = await fetch(`${this.serverUrl}/api/upload-trial`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
      });

      if (response.ok) {
        const result = await response.json();
        
        // Check if response contains multiple question answers
        if (result.questionResponse) {
          console.log('📋 Question Response Received:');
          console.log(result.questionResponse);
          console.log('\n');
          
          // Check if multiple questions were processed
          if (result.questionResponse.includes(' | ')) {
            const questionAnswers = result.questionResponse.split(' | ');
            console.log(`✅ Multiple questions processed: ${questionAnswers.length} answers found`);
            
            questionAnswers.forEach((qa, index) => {
              console.log(`  Q${index + 1}: ${qa.substring(0, 100)}...`);
            });
            
            this.addResult('Multi-Question Processing', 'PASS', `Successfully processed ${questionAnswers.length} questions`);
          } else {
            this.addResult('Multi-Question Processing', 'WARN', 'Single question response format detected');
          }
          
          // Check for specific question types
          const response = result.questionResponse.toLowerCase();
          
          if (response.includes('campaign')) {
            this.addResult('Campaign Analysis', 'PASS', 'Campaign counting logic triggered');
          }
          
          if (response.includes('location') || response.includes('live') || response.includes('city')) {
            this.addResult('Location Analysis', 'PASS', 'Location analysis logic triggered');
          }
          
          if (response.includes('performance') || response.includes('rate')) {
            this.addResult('Performance Analysis', 'PASS', 'Performance metrics logic triggered');
          }
          
        } else {
          this.addResult('Question Response', 'FAIL', 'No questionResponse field in result');
        }
        
        this.addResult('API Endpoint', 'PASS', 'Trial upload successful');
      } else {
        const error = await response.text();
        this.addResult('API Endpoint', 'FAIL', `HTTP ${response.status}: ${error}`);
      }
      
    } catch (error) {
      this.addResult('Multi-Question Test', 'FAIL', error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message, timestamp: new Date().toISOString() });
    const emoji = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`${emoji} ${testName}: ${message}`);
  }

  async generateReport() {
    console.log('\n📊 Multi-Question Test Results Summary\n');
    
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      warned: this.results.filter(r => r.status === 'WARN').length,
      failed: this.results.filter(r => r.status === 'FAIL').length
    };
    
    console.log(`Total Tests: ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`⚠️ Warnings: ${summary.warned}`);
    console.log(`❌ Failed: ${summary.failed}`);
    
    const reportData = {
      summary,
      timestamp: new Date().toISOString(),
      results: this.results
    };
    
    fs.writeFileSync('./multi-question-test-results.json', JSON.stringify(reportData, null, 2));
    console.log('\n📁 Report saved to multi-question-test-results.json');
  }
}

// Run the test
const tester = new MultiQuestionTester();
tester.runTest().catch(console.error);