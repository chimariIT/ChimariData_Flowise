// Quick API test script - Run with: node scripts/test-admin-endpoints.js
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';
const FRONTEND_BASE = 'http://localhost:5173';

// You'll need to replace this with a real admin token
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token-here';

async function testEndpoint(name, method, path, body = null) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   ${method} ${path}`);
  
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`   ✅ Success:`, JSON.stringify(data, null, 2).substring(0, 200));
      return { success: true, data };
    } else {
      console.log(`   ❌ Failed:`, data.error || data.message);
      return { success: false, error: data };
    }
  } catch (error: any) {
    console.log(`   ❌ Error:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting Admin Platform Feature Tests\n');
  console.log('⚠️  Make sure servers are running: npm run dev');
  console.log('⚠️  Set ADMIN_TOKEN environment variable or update script\n');
  
  // Test 1: Get customers
  await testEndpoint('Get Customers', 'GET', '/api/admin/customers');
  
  // Test 2: List projects
  const projectsResult = await testEndpoint('List Projects', 'GET', '/api/admin/projects');
  
  // Test 3: Get specific project (if we have one)
  if (projectsResult.success && projectsResult.data?.projects?.length > 0) {
    const projectId = projectsResult.data.projects[0].id;
    await testEndpoint('Get Project', 'GET', `/api/admin/projects/${projectId}`);
    
    // Test 4: Update project
    await testEndpoint('Update Project', 'PUT', `/api/admin/projects/${projectId}`, {
      name: 'Updated Test Project',
      description: 'Updated via test script'
    });
    
    // Test 5: Archive project
    await testEndpoint('Archive Project', 'POST', `/api/admin/projects/${projectId}/archive`, {
      reason: 'Testing archive functionality'
    });
  }
  
  // Test 6: List stuck projects
  await testEndpoint('List Stuck Projects', 'GET', '/api/admin/projects/stuck');
  
  console.log('\n✅ Tests completed!');
  console.log('\n📸 Next steps:');
  console.log('   1. Open browser to http://localhost:5173/admin');
  console.log('   2. Test consultant mode customer selection');
  console.log('   3. Verify projects are created with correct userId');
  console.log('   4. Check audit logs in database');
}

runTests().catch(console.error);





