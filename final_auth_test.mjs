console.log('🎯 Final Comprehensive Authentication Test');
console.log('='.repeat(50));

const API_BASE = 'http://localhost:5000';

async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 'ERROR', data: { error: error.message } };
  }
}

async function testAuthenticationFlow() {
  console.log('\n🧪 Testing Complete Authentication Flow...\n');

  // Test 1: Registration (should fail since user exists)
  console.log('1️⃣  Registration Test...');
  const registerResult = await apiCall('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'testpassword123',
      firstName: 'Test',
      lastName: 'User'
    }),
  });
  
  console.log(`   Status: ${registerResult.status}`);
  if (registerResult.status === 400 && registerResult.data.error?.includes('already exists')) {
    console.log('   ✅ User already exists (expected)');
  } else if (registerResult.status === 201) {
    console.log('   ✅ Registration successful');
  } else {
    console.log(`   ❌ Unexpected registration response: ${JSON.stringify(registerResult.data)}`);
  }

  // Test 2: Login Flow
  console.log('\n2️⃣  Login Test...');
  const loginResult = await apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'testpassword123'
    }),
  });

  console.log(`   Status: ${loginResult.status}`);
  console.log(`   Response: ${JSON.stringify(loginResult.data)}`);
  
  if (loginResult.status === 200) {
    console.log('   ✅ Login successful!');
    
    // Test 3: Protected Route Access
    console.log('\n3️⃣  Protected Route Test...');
    const protectedResult = await apiCall('/api/projects', {
      method: 'GET',
      headers: {
        'Cookie': loginResult.data.sessionCookie || ''
      }
    });
    
    console.log(`   Status: ${protectedResult.status}`);
    if (protectedResult.status === 200) {
      console.log('   ✅ Protected route access successful!');
      console.log('\n🎉 ALL AUTHENTICATION TESTS PASSED! 🎉');
      console.log('\n✅ Authentication regression is FIXED!');
      return true;
    } else {
      console.log(`   ❌ Protected route failed: ${JSON.stringify(protectedResult.data)}`);
    }
  } else {
    console.log(`   ❌ Login failed: ${JSON.stringify(loginResult.data)}`);
  }

  return false;
}

// Run the test
testAuthenticationFlow().then(success => {
  if (!success) {
    console.log('\n❌ Authentication regression NOT fully fixed yet');
    process.exit(1);
  }
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
