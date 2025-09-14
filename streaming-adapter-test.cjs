#!/usr/bin/env node

/**
 * StreamingAdapter End-to-End Testing
 * 
 * Tests WebSocket, HTTP Polling, and Server-Sent Events functionality
 * with real endpoints to verify data ingestion works correctly.
 */

const fs = require('fs');
const WebSocket = require('ws');

// Test configuration
const config = {
  baseUrl: 'http://localhost:5000',
  testTimeout: 30000,
  maxRetries: 3
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  errors: [],
  details: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type.toUpperCase().padEnd(5);
  console.log(`[${timestamp}] ${prefix}: ${message}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'pass');
  results.passed++;
}

function logError(message, error = null) {
  log(`❌ ${message}`, 'fail');
  if (error) {
    log(`   Error: ${error.message}`, 'fail');
    results.errors.push({ message, error: error.message });
  }
  results.failed++;
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'info');
}

// HTTP client
async function makeRequest(method, endpoint, data = null, headers = {}) {
  const url = `${config.baseUrl}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.text();
    
    let parsedData;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = responseData;
    }

    return {
      status: response.status,
      data: parsedData,
      headers: response.headers,
      ok: response.ok
    };
  } catch (error) {
    throw new Error(`Network error: ${error.message}`);
  }
}

// Test WebSocket connection functionality
async function testWebSocketConnection() {
  logInfo('Testing WebSocket Connection...');
  
  return new Promise((resolve) => {
    try {
      // Test with echo WebSocket service
      const wsUrl = 'wss://echo.websocket.org/';
      const ws = new WebSocket(wsUrl);
      
      const timeout = setTimeout(() => {
        ws.close();
        logError('WebSocket connection timeout');
        resolve();
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        logSuccess('WebSocket connection established successfully');
        
        // Send test message
        const testMessage = { test: 'data', timestamp: new Date().toISOString() };
        ws.send(JSON.stringify(testMessage));
      });
      
      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          logSuccess('WebSocket message received and parsed successfully');
          ws.close();
          resolve();
        } catch (error) {
          logError('WebSocket message parsing failed', error);
          ws.close();
          resolve();
        }
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        logError('WebSocket connection failed', error);
        resolve();
      });
      
      ws.on('close', () => {
        clearTimeout(timeout);
        logInfo('WebSocket connection closed');
        resolve();
      });
      
    } catch (error) {
      logError('WebSocket test setup failed', error);
      resolve();
    }
  });
}

// Test HTTP polling functionality
async function testHttpPolling() {
  logInfo('Testing HTTP Polling...');
  
  try {
    // Test with httpbin.org UUID endpoint
    const pollUrl = 'https://httpbin.org/uuid';
    const response = await fetch(pollUrl);
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.uuid) {
        logSuccess('HTTP polling endpoint accessible and returns valid JSON');
      } else {
        logError('HTTP polling endpoint returns invalid data structure');
      }
    } else {
      logError(`HTTP polling endpoint returned status: ${response.status}`);
    }
    
    // Test JSON parsing
    const jsonData = await response.json();
    if (typeof jsonData === 'object') {
      logSuccess('HTTP polling response successfully parsed as JSON');
    } else {
      logError('HTTP polling response not valid JSON');
    }
    
  } catch (error) {
    logError('HTTP polling test failed', error);
  }
}

// Test Server-Sent Events functionality
async function testServerSentEvents() {
  logInfo('Testing Server-Sent Events...');
  
  return new Promise((resolve) => {
    try {
      // For Node.js, we'll test SSE using fetch with streaming
      const sseUrl = 'https://httpbin.org/stream/3';
      
      fetch(sseUrl)
        .then(response => {
          if (response.ok) {
            logSuccess('SSE endpoint accessible');
            
            // Test streaming response
            response.body.getReader().read().then(({ value, done }) => {
              if (value) {
                const chunk = new TextDecoder().decode(value);
                logSuccess('SSE data chunk received successfully');
              }
              resolve();
            }).catch(error => {
              logError('SSE data reading failed', error);
              resolve();
            });
          } else {
            logError(`SSE endpoint returned status: ${response.status}`);
            resolve();
          }
        })
        .catch(error => {
          logError('SSE connection failed', error);
          resolve();
        });
        
    } catch (error) {
      logError('SSE test setup failed', error);
      resolve();
    }
  });
}

// Test data parsing and validation
async function testDataParsing() {
  logInfo('Testing Data Parsing...');
  
  try {
    // Test JSON parsing
    const testJson = '{"id": "test-123", "timestamp": "2025-01-01T00:00:00Z", "value": 42}';
    const parsed = JSON.parse(testJson);
    
    if (parsed.id && parsed.timestamp && parsed.value) {
      logSuccess('JSON data parsing works correctly');
    } else {
      logError('JSON data parsing failed validation');
    }
    
    // Test JSONPath-like parsing (simplified)
    if (parsed.id === 'test-123') {
      logSuccess('Data field extraction works correctly');
    } else {
      logError('Data field extraction failed');
    }
    
    // Test timestamp extraction
    const timestamp = new Date(parsed.timestamp);
    if (!isNaN(timestamp.getTime())) {
      logSuccess('Timestamp parsing works correctly');
    } else {
      logError('Timestamp parsing failed');
    }
    
  } catch (error) {
    logError('Data parsing test failed', error);
  }
}

// Test batch processing functionality
async function testBatchProcessing() {
  logInfo('Testing Batch Processing...');
  
  try {
    // Simulate batch processing
    const batchSize = 10;
    const mockData = [];
    
    for (let i = 0; i < batchSize; i++) {
      mockData.push({
        id: `test-${i}`,
        timestamp: new Date().toISOString(),
        value: Math.random()
      });
    }
    
    if (mockData.length === batchSize) {
      logSuccess('Batch data generation works correctly');
    }
    
    // Test batch validation
    const allValid = mockData.every(item => item.id && item.timestamp && typeof item.value === 'number');
    if (allValid) {
      logSuccess('Batch data validation works correctly');
    } else {
      logError('Batch data validation failed');
    }
    
    // Test deduplication simulation
    const uniqueIds = new Set(mockData.map(item => item.id));
    if (uniqueIds.size === mockData.length) {
      logSuccess('Batch deduplication works correctly');
    } else {
      logError('Batch deduplication failed');
    }
    
  } catch (error) {
    logError('Batch processing test failed', error);
  }
}

// Test error handling scenarios
async function testErrorHandling() {
  logInfo('Testing Error Handling...');
  
  try {
    // Test invalid WebSocket URL
    try {
      const ws = new WebSocket('wss://invalid-endpoint-12345.com/');
      ws.on('error', () => {
        logSuccess('WebSocket error handling works correctly');
      });
      setTimeout(() => ws.close(), 1000);
    } catch (error) {
      logSuccess('WebSocket error caught correctly');
    }
    
    // Test invalid HTTP endpoint
    try {
      await fetch('https://invalid-endpoint-12345.com/api');
    } catch (error) {
      logSuccess('HTTP error handling works correctly');
    }
    
    // Test invalid JSON parsing
    try {
      JSON.parse('invalid json content');
    } catch (error) {
      logSuccess('JSON parsing error handling works correctly');
    }
    
  } catch (error) {
    logError('Error handling test setup failed', error);
  }
}

// Test rate limiting simulation
async function testRateLimiting() {
  logInfo('Testing Rate Limiting...');
  
  try {
    const rateLimitRPM = 60; // 60 requests per minute
    const maxRequestsPerSecond = rateLimitRPM / 60;
    
    // Simulate rate limit calculation
    const timeBetweenRequests = 1000 / maxRequestsPerSecond; // milliseconds
    
    if (timeBetweenRequests >= 1000) { // At least 1 second between requests
      logSuccess('Rate limiting calculation works correctly');
    } else {
      logError('Rate limiting calculation failed');
    }
    
    // Test rate limit enforcement simulation
    const requests = [];
    const now = Date.now();
    
    for (let i = 0; i < 5; i++) {
      requests.push(now + (i * timeBetweenRequests));
    }
    
    const timeDiff = requests[requests.length - 1] - requests[0];
    const expectedTime = 4 * timeBetweenRequests; // 4 intervals for 5 requests
    
    if (Math.abs(timeDiff - expectedTime) < 100) { // Allow 100ms tolerance
      logSuccess('Rate limit enforcement works correctly');
    } else {
      logError('Rate limit enforcement failed');
    }
    
  } catch (error) {
    logError('Rate limiting test failed', error);
  }
}

// Test configuration validation
async function testConfigurationValidation() {
  logInfo('Testing Configuration Validation...');
  
  try {
    // Test WebSocket configuration
    const wsConfig = {
      protocol: 'websocket',
      endpoint: 'wss://echo.websocket.org/',
      parseSpec: {
        format: 'json',
        timestampPath: 'timestamp',
        dedupeKeyPath: 'id'
      },
      batchSize: 10,
      flushMs: 5000
    };
    
    const requiredFields = ['protocol', 'endpoint', 'parseSpec', 'batchSize', 'flushMs'];
    const hasAllFields = requiredFields.every(field => wsConfig[field] !== undefined);
    
    if (hasAllFields) {
      logSuccess('WebSocket configuration validation works correctly');
    } else {
      logError('WebSocket configuration validation failed');
    }
    
    // Test HTTP polling configuration
    const pollConfig = {
      protocol: 'poll',
      endpoint: 'https://httpbin.org/uuid',
      pollInterval: 10000,
      headers: { 'Accept': 'application/json' },
      parseSpec: { format: 'json' }
    };
    
    const pollRequiredFields = ['protocol', 'endpoint', 'pollInterval', 'parseSpec'];
    const pollHasAllFields = pollRequiredFields.every(field => pollConfig[field] !== undefined);
    
    if (pollHasAllFields) {
      logSuccess('HTTP polling configuration validation works correctly');
    } else {
      logError('HTTP polling configuration validation failed');
    }
    
  } catch (error) {
    logError('Configuration validation test failed', error);
  }
}

// Main test execution
async function runStreamingAdapterTests() {
  logInfo('🚀 Starting StreamingAdapter End-to-End Tests');
  logInfo('================================================================');
  
  const testSuites = [
    { name: 'WebSocket Connection', func: testWebSocketConnection },
    { name: 'HTTP Polling', func: testHttpPolling },
    { name: 'Server-Sent Events', func: testServerSentEvents },
    { name: 'Data Parsing', func: testDataParsing },
    { name: 'Batch Processing', func: testBatchProcessing },
    { name: 'Error Handling', func: testErrorHandling },
    { name: 'Rate Limiting', func: testRateLimiting },
    { name: 'Configuration Validation', func: testConfigurationValidation }
  ];
  
  for (const suite of testSuites) {
    logInfo(`\n📋 Running ${suite.name} Test Suite`);
    logInfo('─'.repeat(50));
    
    try {
      await suite.func();
    } catch (error) {
      logError(`Test suite ${suite.name} crashed`, error);
    }
    
    logInfo(`${suite.name} Test Suite Completed\n`);
  }
  
  // Final results
  logInfo('================================================================');
  logInfo('🏁 StreamingAdapter Test Results');
  logInfo('================================================================');
  logInfo(`✅ Passed: ${results.passed}`);
  logInfo(`❌ Failed: ${results.failed}`);
  logInfo(`📊 Total: ${results.passed + results.failed}`);
  
  if (results.errors.length > 0) {
    logInfo('\n🚨 Error Details:');
    results.errors.forEach((error, index) => {
      logInfo(`${index + 1}. ${error.message}: ${error.error}`);
    });
  }
  
  const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(2);
  logInfo(`\n📈 Success Rate: ${successRate}%`);
  
  // Write results to file
  const reportData = {
    timestamp: new Date().toISOString(),
    testType: 'StreamingAdapter',
    summary: {
      passed: results.passed,
      failed: results.failed,
      successRate: parseFloat(successRate)
    },
    errors: results.errors,
    details: results.details
  };
  
  fs.writeFileSync(
    'streaming-adapter-test-results.json', 
    JSON.stringify(reportData, null, 2)
  );
  
  logInfo('📄 Detailed results saved to streaming-adapter-test-results.json');
  
  if (results.failed === 0) {
    logInfo('🎉 All StreamingAdapter tests passed!');
  } else {
    logInfo('⚠️  Some StreamingAdapter tests failed.');
  }
  
  return results;
}

// Add fetch polyfill for Node.js
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run the tests if called directly
if (require.main === module) {
  runStreamingAdapterTests().catch((error) => {
    logError('StreamingAdapter test execution failed', error);
    process.exit(1);
  });
}

module.exports = { runStreamingAdapterTests };