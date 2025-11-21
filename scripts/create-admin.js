#!/usr/bin/env node

/**
 * Script to create a test admin account via the /api/auth/setup-admin endpoint
 * 
 * Usage:
 *   node scripts/create-admin.js --email admin@chimaridata.com --password admin123 --firstName Admin --lastName User
 * 
 * All arguments are required:
 *   --email      Admin email address (required)
 *   --password   Admin password (required)
 *   --firstName  First name (required)
 *   --lastName   Last name (required)
 */

import http from 'http';

const args = process.argv.slice(2);

function getArg(name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
}

const email = getArg('--email');
const password = getArg('--password');
const firstName = getArg('--firstName');
const lastName = getArg('--lastName');
const port = process.env.PORT || 5000;

// Validate all required arguments
if (!email || !password || !firstName || !lastName) {
  console.error('❌ Missing required arguments!');
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/create-admin.js --email <email> --password <password> --firstName <firstName> --lastName <lastName>');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/create-admin.js --email admin@chimaridata.com --password Admin123 --firstName Admin --lastName User');
  console.error('');
  console.error('Required arguments:');
  if (!email) console.error('  ❌ --email');
  if (!password) console.error('  ❌ --password');
  if (!firstName) console.error('  ❌ --firstName');
  if (!lastName) console.error('  ❌ --lastName');
  process.exit(1);
}

const data = JSON.stringify({
  email,
  password,
  firstName,
  lastName
});

const options = {
  hostname: 'localhost',
  port,
  path: '/api/auth/setup-admin',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log(`🔐 Creating admin account...`);
console.log(`   Email: ${email}`);
console.log(`   Port: ${port}`);
console.log('');

const req = http.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    // Check for 404 or HTML error responses
    if (res.statusCode === 404 || responseData.includes('<!DOCTYPE') || responseData.includes('Cannot POST')) {
      console.error('❌ Route not found (404)');
      console.error('');
      console.error('⚠️  The /api/auth/setup-admin endpoint is not available.');
      console.error('   This usually means:');
      console.error('   1. The server needs to be restarted to pick up the new route');
      console.error('   2. Make sure you\'re using the correct port (5000, not 3000)');
      console.error('');
      console.error('Try restarting the server:');
      console.error('   npm run dev:server-only');
      console.error('');
      console.error('Then run this script again.');
      process.exit(1);
    }
    
    try {
      const result = JSON.parse(responseData);
      
      if (result.success) {
        console.log('✅ Admin account created/updated successfully!');
        console.log('');
        console.log('Account Details:');
        console.log(`   User ID: ${result.user.id}`);
        console.log(`   Email: ${result.user.email}`);
        console.log(`   Name: ${result.user.firstName} ${result.user.lastName}`);
        console.log(`   Admin: ${result.user.isAdmin}`);
        console.log(`   Subscription: ${result.user.subscriptionTier}`);
        console.log('');
        console.log('🔑 Authentication Token:');
        console.log(`   ${result.token}`);
        console.log('');
        console.log('Next Steps:');
        console.log('   1. Use this token in Authorization header: Bearer <token>');
        console.log(`   2. Or login with email: ${email} and password: ${password}`);
        console.log(`   3. Navigate to http://localhost:5173/admin`);
      } else {
        console.error('❌ Failed to create admin account:');
        console.error(`   ${result.error || 'Unknown error'}`);
        if (result.details) {
          console.error(`   Details: ${result.details}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to parse response:');
      console.error(`   ${error.message}`);
      console.error(`   Response: ${responseData}`);
      
      // Check if it's a 404 error (route not found)
      if (responseData.includes('Cannot POST') || responseData.includes('Cannot') || responseData.includes('<!DOCTYPE')) {
        console.error('');
        console.error('⚠️  Route not found! This usually means:');
        console.error('   1. The server needs to be restarted to pick up the new route');
        console.error('   2. Make sure you\'re using the correct port (5000, not 3000)');
        console.error('');
        console.error('Try restarting the server:');
        console.error('   npm run dev:server-only');
      }
      
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:');
  console.error(`   ${error.message}`);
  console.error('');
  console.error('Make sure the server is running:');
  console.error('   npm run dev:server-only');
  process.exit(1);
});

req.write(data);
req.end();

