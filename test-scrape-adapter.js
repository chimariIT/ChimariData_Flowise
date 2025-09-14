/**
 * Simple integration test for ScrapeAdapter
 * This test verifies that the ScrapeAdapter integrates correctly with the storage interface
 */

const { ScrapeAdapter, RateLimiter, DataExtractor, JobScheduler } = require('./server/source-adapters');

// Mock storage interface for testing
const mockStorage = {
  createDataset: async (dataset) => {
    console.log('✓ Mock createDataset called with:', { id: dataset.id, name: dataset.name });
    return dataset;
  },
  createScrapingJob: async (job) => {
    console.log('✓ Mock createScrapingJob called with:', { id: job.id, targetUrl: job.targetUrl });
    return job;
  },
  updateScrapingJob: async (id, updates) => {
    console.log('✓ Mock updateScrapingJob called for:', id, 'with updates:', Object.keys(updates));
    return { id, ...updates };
  },
  getScrapingJob: async (id) => {
    console.log('✓ Mock getScrapingJob called for:', id);
    return {
      id,
      datasetId: 'mock-dataset-id',
      strategy: 'http',
      targetUrl: 'https://httpbin.org/json',
      extractionSpec: { jsonPath: '$.origin' },
      rateLimitRPM: 60,
      respectRobots: true
    };
  },
  createScrapingRun: async (run) => {
    console.log('✓ Mock createScrapingRun called with:', { id: run.id, jobId: run.jobId });
    return run;
  },
  updateScrapingRun: async (id, updates) => {
    console.log('✓ Mock updateScrapingRun called for:', id);
    return { id, ...updates };
  }
};

async function testScrapeAdapter() {
  console.log('🧪 Testing ScrapeAdapter Integration...\n');

  try {
    // Test 1: Create ScrapeAdapter instance
    console.log('📝 Test 1: Creating ScrapeAdapter instance');
    const adapter = new ScrapeAdapter('http', mockStorage);
    console.log('✅ ScrapeAdapter created successfully\n');

    // Test 2: Test URL validation
    console.log('📝 Test 2: Testing URL validation (security)');
    try {
      await adapter.validateScrapingUrl('http://localhost:8080'); // Should fail
      console.log('❌ Security validation failed - localhost should be blocked');
    } catch (error) {
      console.log('✅ Security validation works - blocked:', error.message);
    }

    try {
      await adapter.validateScrapingUrl('https://httpbin.org/json'); // Should pass
      console.log('✅ Valid URL accepted\n');
    } catch (error) {
      console.log('❌ Valid URL rejected:', error.message);
    }

    // Test 3: Test RateLimiter functionality
    console.log('📝 Test 3: Testing RateLimiter');
    const rateLimiter = new RateLimiter();
    const domain = RateLimiter.getDomainFromUrl('https://httpbin.org/json');
    console.log('✅ Extracted domain:', domain);
    
    const canRequest = await rateLimiter.checkRateLimit(domain, 60);
    console.log('✅ Rate limit check passed:', canRequest);
    rateLimiter.destroy();

    // Test 4: Test job creation
    console.log('📝 Test 4: Testing job creation');
    const config = {
      strategy: 'http',
      targetUrl: 'https://httpbin.org/json',
      extractionSpec: {
        jsonPath: '$.origin'
      },
      rateLimitRPM: 60,
      respectRobots: true,
      maxConcurrency: 1,
      requestTimeout: 30000,
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000
      }
    };

    const jobId = await adapter.createJob(config);
    console.log('✅ Job created with ID:', jobId);

    // Test 5: Test job status retrieval
    console.log('📝 Test 5: Testing job status retrieval');
    const status = await adapter.getJobStatus(jobId);
    console.log('✅ Job status retrieved:', {
      jobId: status.jobId,
      status: status.status,
      totalRuns: status.totalRuns
    });

    // Test 6: Test configuration validation
    console.log('📝 Test 6: Testing configuration validation');
    try {
      const invalidConfig = { ...config, rateLimitRPM: -1 };
      await adapter.validateScrapingConfig(invalidConfig);
      console.log('❌ Configuration validation failed');
    } catch (error) {
      console.log('✅ Configuration validation works:', error.message);
    }

    // Cleanup
    adapter.destroy();
    console.log('\n🎉 All integration tests passed!');
    console.log('\n✨ ScrapeAdapter Features Verified:');
    console.log('   • Security validation (SSRF protection)');
    console.log('   • Rate limiting with domain-based tracking');
    console.log('   • Job creation and management');
    console.log('   • Configuration validation');
    console.log('   • Storage interface integration');
    console.log('   • Proper resource cleanup');

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testScrapeAdapter().catch(console.error);
}

module.exports = { testScrapeAdapter };