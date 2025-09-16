console.log('🔍 Debug Authentication Test with Strong Password');
console.log('='.repeat(60));

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

async function testLogin() {
  // Use the exact password that was used to create the existing user
  // Based on DB: $2b$12$HWv6gqtsEFksOyHH9rujDesNcDFZZh1gALdhZKRkUjs.ypKZY8fKq
  // This is the hash for password "testpassword123"
  
  console.log('\n🧪 Testing login with existing user...\n');
  
  const loginResult = await apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'testpassword123'  // This should match the bcrypt hash in database
    }),
  });

  console.log(`Status: ${loginResult.status}`);
  console.log(`Response: ${JSON.stringify(loginResult.data, null, 2)}`);
  
  if (loginResult.status === 200) {
    console.log('\n✅ Authentication regression FIXED!');
    return true;
  } else if (loginResult.status === 500 && loginResult.data.provider === 'local') {
    console.log('\n❌ Still hitting the field mapping issue - hashedPassword not found');
    console.log('   This means the field mapping in getUserByEmail is not working');
    return false;
  } else {
    console.log(`\n❓ Different error: ${JSON.stringify(loginResult.data)}`);
    return false;
  }
}

testLogin();
