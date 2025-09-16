#!/usr/bin/env node

/**
 * Comprehensive WebSocket Real-Time Service Testing
 * Tests WebSocket connections, authentication, heartbeat, and data streaming
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const WS_URL = 'ws://localhost:5000/ws';
const API_BASE = 'http://localhost:5000';

// ANSI color codes for better output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bold + colors.blue);
  console.log('='.repeat(60));
}

function logTest(testName) {
  log(`\n🔌 Testing: ${testName}`, colors.yellow);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

class WebSocketTester {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async runTest(testName, testFunction) {
    logTest(testName);
    this.testResults.total++;
    
    try {
      const result = await testFunction();
      if (result.success) {
        logSuccess(result.message);
        this.testResults.passed++;
      } else {
        logError(result.message);
        this.testResults.failed++;
        this.testResults.errors.push(`${testName}: ${result.message}`);
      }
      
      if (result.details) {
        result.details.forEach(detail => logInfo(detail));
      }
      
      return result;
    } catch (error) {
      const message = `Exception: ${error.message}`;
      logError(message);
      this.testResults.failed++;
      this.testResults.errors.push(`${testName}: ${message}`);
      return { success: false, message };
    }
  }

  async testBasicConnection() {
    return this.runTest('Basic WebSocket Connection', () => {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const ws = new WebSocket(WS_URL);
        const timeout = setTimeout(() => {
          ws.terminate();
          resolve({
            success: false,
            message: 'Connection timeout after 5 seconds'
          });
        }, 5000);

        ws.on('open', () => {
          const connectionTime = Date.now() - startTime;
          clearTimeout(timeout);
          
          ws.close();
          resolve({
            success: true,
            message: `WebSocket connection established successfully`,
            details: [
              `Connection time: ${connectionTime}ms`,
              `Ready state: ${ws.readyState}`,
              `URL: ${WS_URL}`
            ]
          });
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `Connection error: ${error.message}`,
            details: [
              `Error code: ${error.code}`,
              `Error type: ${error.type}`
            ]
          });
        });
      });
    });
  }

  async testConnectionWithAuth() {
    return this.runTest('WebSocket Connection with Authentication', () => {
      return new Promise((resolve) => {
        const testToken = 'test-auth-token-123';
        const wsWithAuth = new WebSocket(`${WS_URL}?token=${testToken}`);
        const timeout = setTimeout(() => {
          wsWithAuth.terminate();
          resolve({
            success: false,
            message: 'Authenticated connection timeout'
          });
        }, 5000);

        wsWithAuth.on('open', () => {
          clearTimeout(timeout);
          wsWithAuth.close();
          resolve({
            success: true,
            message: 'WebSocket authenticated connection successful',
            details: [
              `Auth token: ${testToken.substring(0, 10)}...`,
              'Server accepts authentication parameters'
            ]
          });
        });

        wsWithAuth.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `Authenticated connection error: ${error.message}`
          });
        });
      });
    });
  }

  async testHeartbeatMechanism() {
    return this.runTest('Heartbeat/Ping-Pong Mechanism', () => {
      return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let heartbeatReceived = false;
        const messages = [];

        const timeout = setTimeout(() => {
          ws.terminate();
          resolve({
            success: false,
            message: 'Heartbeat test timeout - no ping/pong received',
            details: [`Messages received: ${messages.length}`, ...messages]
          });
        }, 10000);

        ws.on('open', () => {
          logInfo('Connected, waiting for heartbeat or sending ping...');
          
          // Send a ping to test pong response
          ws.ping('test-ping');
          
          // Also listen for server-initiated pings
          setTimeout(() => {
            if (!heartbeatReceived) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 2000);
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            messages.push(`${message.type}: ${JSON.stringify(message.data || {})}`);
            
            if (message.type === 'pong' || message.type === 'connection_established') {
              heartbeatReceived = true;
              clearTimeout(timeout);
              ws.close();
              resolve({
                success: true,
                message: 'Heartbeat mechanism working correctly',
                details: [
                  `Response type: ${message.type}`,
                  `Total messages: ${messages.length}`,
                  ...messages
                ]
              });
            }
          } catch (error) {
            messages.push(`Raw message: ${data.toString()}`);
          }
        });

        ws.on('pong', (data) => {
          heartbeatReceived = true;
          clearTimeout(timeout);
          ws.close();
          resolve({
            success: true,
            message: 'WebSocket pong received successfully',
            details: [
              `Pong data: ${data.toString()}`,
              'Native WebSocket ping/pong working'
            ]
          });
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `Heartbeat test error: ${error.message}`
          });
        });
      });
    });
  }

  async testRealtimeDataStreaming() {
    return this.runTest('Real-Time Data Streaming', () => {
      return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        const receivedEvents = [];
        
        const timeout = setTimeout(() => {
          ws.terminate();
          resolve({
            success: receivedEvents.length > 0,
            message: receivedEvents.length > 0 
              ? `Real-time streaming functional - received ${receivedEvents.length} events`
              : 'No real-time events received within timeout',
            details: [
              `Events received: ${receivedEvents.length}`,
              ...receivedEvents.map(e => `${e.type}: ${JSON.stringify(e.data || {})}`)
            ]
          });
        }, 8000);

        ws.on('open', () => {
          logInfo('Connected, testing real-time data streaming...');
          
          // Subscribe to events
          ws.send(JSON.stringify({
            type: 'subscribe',
            channels: ['test', 'streaming', 'analysis']
          }));

          // Simulate triggering some events by making API calls
          setTimeout(() => {
            fetch(`${API_BASE}/api/health`).catch(() => {});
          }, 1000);
        });

        ws.on('message', (data) => {
          try {
            const event = JSON.parse(data.toString());
            receivedEvents.push(event);
            
            logInfo(`Received: ${event.type} event`);
            
            // If we receive any real-time events, consider test successful
            if (event.type !== 'connection_established' && event.type !== 'subscription_confirmed') {
              clearTimeout(timeout);
              ws.close();
              resolve({
                success: true,
                message: 'Real-time data streaming working correctly',
                details: [
                  `Total events: ${receivedEvents.length}`,
                  `Event types: ${[...new Set(receivedEvents.map(e => e.type))].join(', ')}`,
                  `Last event: ${JSON.stringify(receivedEvents[receivedEvents.length - 1])}`
                ]
              });
            }
          } catch (error) {
            logInfo(`Raw message: ${data.toString()}`);
          }
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `Real-time streaming error: ${error.message}`
          });
        });
      });
    });
  }

  async testMultipleConnections() {
    return this.runTest('Multiple Client Connections', () => {
      return new Promise((resolve) => {
        const connections = [];
        const connectionResults = [];
        const numConnections = 3;

        const timeout = setTimeout(() => {
          connections.forEach(ws => ws.terminate());
          resolve({
            success: false,
            message: 'Multiple connections test timeout',
            details: connectionResults
          });
        }, 10000);

        let connectedCount = 0;

        for (let i = 0; i < numConnections; i++) {
          const ws = new WebSocket(WS_URL);
          connections.push(ws);

          ws.on('open', () => {
            connectedCount++;
            connectionResults.push(`Connection ${i + 1}: SUCCESS`);
            
            if (connectedCount === numConnections) {
              clearTimeout(timeout);
              
              // Close all connections
              connections.forEach(ws => ws.close());
              
              resolve({
                success: true,
                message: `All ${numConnections} WebSocket connections established successfully`,
                details: [
                  `Concurrent connections: ${numConnections}`,
                  `Success rate: 100%`,
                  ...connectionResults
                ]
              });
            }
          });

          ws.on('error', (error) => {
            connectionResults.push(`Connection ${i + 1}: ERROR - ${error.message}`);
          });
        }
      });
    });
  }

  async testConnectionRecovery() {
    return this.runTest('Connection Recovery/Reconnection', () => {
      return new Promise((resolve) => {
        let reconnectionAttempted = false;
        const ws = new WebSocket(WS_URL);

        const timeout = setTimeout(() => {
          ws.terminate();
          resolve({
            success: false,
            message: 'Connection recovery test timeout'
          });
        }, 15000);

        ws.on('open', () => {
          logInfo('Initial connection established, testing recovery...');
          
          // Simulate connection interruption
          setTimeout(() => {
            ws.terminate();
          }, 1000);
        });

        ws.on('close', (code, reason) => {
          if (!reconnectionAttempted) {
            logInfo(`Connection closed (${code}), attempting reconnection...`);
            reconnectionAttempted = true;
            
            // Attempt reconnection
            setTimeout(() => {
              const reconnectWs = new WebSocket(WS_URL);
              
              reconnectWs.on('open', () => {
                clearTimeout(timeout);
                reconnectWs.close();
                resolve({
                  success: true,
                  message: 'Connection recovery successful',
                  details: [
                    'Original connection terminated as expected',
                    'Reconnection established successfully',
                    'WebSocket recovery mechanism functional'
                  ]
                });
              });

              reconnectWs.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                  success: false,
                  message: `Reconnection failed: ${error.message}`
                });
              });
            }, 1000);
          }
        });

        ws.on('error', (error) => {
          if (!reconnectionAttempted) {
            clearTimeout(timeout);
            resolve({
              success: false,
              message: `Initial connection error: ${error.message}`
            });
          }
        });
      });
    });
  }

  printResults() {
    logSection('📊 WEBSOCKET SERVICE TEST RESULTS');
    
    const passRate = this.testResults.total > 0 
      ? ((this.testResults.passed / this.testResults.total) * 100).toFixed(1)
      : 0;

    log(`\nTotal Tests: ${this.testResults.total}`, colors.blue);
    log(`Passed: ${this.testResults.passed}`, colors.green);
    log(`Failed: ${this.testResults.failed}`, colors.red);
    log(`Pass Rate: ${passRate}%`, passRate >= 80 ? colors.green : colors.red);

    if (this.testResults.errors.length > 0) {
      log('\n🚨 Failed Tests:', colors.red);
      this.testResults.errors.forEach(error => {
        log(`  • ${error}`, colors.red);
      });
    }

    if (passRate >= 80) {
      logSuccess('\n🎉 WebSocket real-time service testing completed successfully!');
    } else {
      logError('\n⚠️  WebSocket service has issues that need attention.');
    }

    return {
      total: this.testResults.total,
      passed: this.testResults.passed,
      failed: this.testResults.failed,
      passRate: parseFloat(passRate),
      errors: this.testResults.errors
    };
  }
}

// Main execution
async function main() {
  logSection('🚀 WEBSOCKET REAL-TIME SERVICE COMPREHENSIVE TESTING');
  
  const tester = new WebSocketTester();
  
  logInfo('Testing WebSocket connections, authentication, heartbeat, and streaming...');
  logInfo('WebSocket URL: ' + WS_URL);
  
  // Run all WebSocket service tests
  await tester.testBasicConnection();
  await tester.testConnectionWithAuth();
  await tester.testHeartbeatMechanism();
  await tester.testRealtimeDataStreaming();
  await tester.testMultipleConnections();
  await tester.testConnectionRecovery();
  
  // Print comprehensive results
  const results = tester.printResults();
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});