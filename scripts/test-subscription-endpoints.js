#!/usr/bin/env node

/**
 * Test script for Claude's Subscription Management Endpoints
 * 
 * Usage:
 *   node scripts/test-subscription-endpoints.js --userId USER_ID --token AUTH_TOKEN
 * 
 * Or set environment variables:
 *   ADMIN_TOKEN=your_token
 *   TEST_USER_ID=user_id
 */

import http from 'http';

const args = process.argv.slice(2);

const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return defaultValue || process.env[name.toUpperCase()];
};

const userId = getArg('userId') || getArg('user-id') || process.env.TEST_USER_ID;
const token = getArg('token') || process.env.ADMIN_TOKEN;
const port = process.env.PORT || 5000;
const host = process.env.HOST || 'localhost';

if (!userId) {
  console.error('❌ Error: userId is required');
  console.error('Usage: node scripts/test-subscription-endpoints.js --userId USER_ID --token TOKEN');
  process.exit(1);
}

if (!token) {
  console.error('❌ Error: Admin auth token is required');
  console.error('Usage: node scripts/test-subscription-endpoints.js --userId USER_ID --token TOKEN');
  process.exit(1);
}

const makeRequest = (method, path, data) => {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : undefined;
    
    const options = {
      hostname: host,
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: result });
        } catch (error) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
};

async function testEndpoints() {
  console.log('🧪 Testing Subscription Management Endpoints\n');
  console.log(`User ID: ${userId}`);
  console.log(`Server: ${host}:${port}\n`);

  // Test 1: Change Subscription Tier
  console.log('1️⃣  Testing PUT /api/admin/users/:userId/subscription');
  try {
    const result1 = await makeRequest('PUT', `/api/admin/users/${userId}/subscription`, {
      newTier: 'professional',
      reason: 'Test subscription tier change',
      bypassStripe: true
    });
    
    if (result1.status === 200 && result1.data.success) {
      console.log('   ✅ Success:', result1.data.message);
      console.log(`   New tier: ${result1.data.user?.subscriptionTier}`);
    } else {
      console.log('   ❌ Failed:', result1.data.error || result1.data);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  // Test 2: Issue Credits
  console.log('2️⃣  Testing POST /api/admin/users/:userId/credits');
  try {
    const result2 = await makeRequest('POST', `/api/admin/users/${userId}/credits`, {
      amount: 50,
      reason: 'Test credit issuance',
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
    });
    
    if (result2.status === 200 && result2.data.success) {
      console.log('   ✅ Success:', result2.data.message);
      console.log(`   Credits: ${result2.data.credits?.previous} → ${result2.data.credits?.current}`);
    } else {
      console.log('   ❌ Failed:', result2.data.error || result2.data);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  // Test 3: Extend Trial
  console.log('3️⃣  Testing PUT /api/admin/users/:userId/trial-extension');
  try {
    // First, set user to trial tier
    await makeRequest('PUT', `/api/admin/users/${userId}/subscription`, {
      newTier: 'trial',
      reason: 'Setting to trial for extension test',
      bypassStripe: true
    });
    
    const result3 = await makeRequest('PUT', `/api/admin/users/${userId}/trial-extension`, {
      extensionDays: 7,
      reason: 'Test trial extension'
    });
    
    if (result3.status === 200 && result3.data.success) {
      console.log('   ✅ Success:', result3.data.message);
      console.log(`   New expiration: ${result3.data.trial?.newExpiration}`);
    } else {
      console.log('   ❌ Failed:', result3.data.error || result3.data);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  // Test 4: Refund (if Stripe customer exists)
  console.log('4️⃣  Testing POST /api/admin/users/:userId/refund');
  try {
    const result4 = await makeRequest('POST', `/api/admin/users/${userId}/refund`, {
      amount: 10,
      reason: 'Test refund',
      stripeRefund: false // Use manual refund for testing
    });
    
    if (result4.status === 200 && result4.data.success) {
      console.log('   ✅ Success:', result4.data.message);
      console.log(`   Credits issued: ${result4.data.credits?.added}`);
    } else {
      console.log('   ⚠️  Note:', result4.data.error || 'Refund may require Stripe customer ID');
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  console.log('✅ Testing complete!\n');
  console.log('Note: Some endpoints may require Stripe setup for full functionality.');
}

testEndpoints().catch(console.error);




