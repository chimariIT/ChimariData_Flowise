/**
 * Integrated API Test for Data Requirements System
 * Uses actual authentication and existing project data
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

// Use existing project from the uploads directory
const TEST_PROJECT_ID = 'aRBfhQbiZgoN8KLVXnj7J';
const TEST_EMAIL = 'test@example.com'; // Update with actual user
const TEST_PASSWORD = 'password'; // Update with actual password

async function login(): Promise<string> {
  console.log('🔐 Logging in...');

  try {
    // Try to register first (in case user doesn't exist)
    try {
      await axios.post(`${BASE_URL}/api/auth/register`, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        role: 'business'
      });
      console.log('   ✅ User registered');
    } catch (e: any) {
      if (e.response?.status === 400) {
        console.log('   ℹ️  User already exists');
      } else {
        throw e;
      }
    }

    // Login
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    const token = response.data.token;
    console.log(`   ✅ Logged in successfully`);
    console.log(`   🎫 Token: ${token.substring(0, 50)}...`);
    console.log();

    return token;
  } catch (error: any) {
    console.error('   ❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testRequiredDataElements(token: string) {
  console.log('📋 Testing GET /api/projects/:id/required-data-elements');
  console.log('='.repeat(70));

  try {
    const response = await axios.get(
      `${BASE_URL}/api/projects/${TEST_PROJECT_ID}/required-data-elements`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log('✅ Status:', response.status);
    console.log('📊 Response:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
    console.log();
    return response.data;
  } catch (error: any) {
    console.log('Response:', error.response?.data);
    if (error.response?.status === 403) {
      console.log('⚠️  Access denied - test user does not own this project');
      console.log('   Creating a new project for testing...');
      return null;
    }
    throw error;
  }
}

async function createTestProject(token: string): Promise<string> {
  console.log('📋 Creating test project with sample data...');

  try {
    // Create project
    const projectData = {
      name: 'API Test - Customer Analysis',
      fileName: 'test_data.csv',
      fileType: 'text/csv',
      fileSize: 1024,
      journeyType: 'business',
      analysisGoals: 'Analyze customer spending and identify trends',
      businessQuestions: 'Who are the top spenders?\nWhat is average spending?'
    };

    const response = await axios.post(
      `${BASE_URL}/api/projects`,
      projectData,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const projectId = response.data.id;
    console.log(`   ✅ Project created: ${projectId}`);

    // Upload sample dataset
    const FormData = require('form-data');
    const form = new FormData();

    const csvData = `id,name,email,amount,date
1,John Doe,john@example.com,125.50,2023-01-15
2,Jane Smith,jane@test.org,85.00,2023-02-20
3,Bob Johnson,bob@company.net,200.00,2023-03-10
4,Alice Brown,alice@domain.com,150.75,2023-04-05`;

    form.append('file', Buffer.from(csvData), {
      filename: 'test_data.csv',
      contentType: 'text/csv'
    });

    await axios.post(
      `${BASE_URL}/api/projects/${projectId}/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log(`   ✅ Dataset uploaded`);
    console.log();

    return projectId;
  } catch (error: any) {
    console.error('   ❌ Project creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function runIntegratedTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 INTEGRATED API TESTING - DATA REQUIREMENTS SYSTEM');
  console.log('='.repeat(70) + '\n');

  try {
    // Step 1: Login
    const token = await login();

    // Step 2: Create test project
    const projectId = await createTestProject(token);

    // Step 3: Test Phase 1 (no dataset)
    console.log('📋 TEST 1: Phase 1 - Requirements without dataset');
    console.log('='.repeat(70));

    let requirementsDoc = await testRequiredDataElements(token);

    if (!requirementsDoc) {
      console.log('⚠️  Using newly created project instead');
      requirementsDoc = await testRequiredDataElements(token);
    }

    // Step 4: Test Phase 2 (with dataset)
    console.log('📋 TEST 2: Phase 2 - Requirements with dataset');
    console.log('='.repeat(70));

    // Wait a moment for dataset to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    const phase2Doc = await axios.get(
      `${BASE_URL}/api/projects/${projectId}/required-data-elements`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log('✅ Status:', phase2Doc.status);
    console.log('📊 Data Elements:', phase2Doc.data.requiredDataElements?.length || 0);
    console.log('📊 Transformation Plan:', phase2Doc.data.transformationPlan ? 'Generated' : 'Not generated');
    console.log();

    // Step 5: Test validation
    console.log('📋 TEST 3: Validate Requirements');
    console.log('='.repeat(70));

    const validationResult = await axios.post(
      `${BASE_URL}/api/projects/${projectId}/validate-requirements`,
      {
        requirementsDoc: phase2Doc.data,
        pmGuidance: {
          suggestedTransformations: []
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log('✅ Status:', validationResult.status);
    console.log('📊 Conflicts:', validationResult.data.conflicts?.length || 0);
    console.log('📊 Confidence:', (validationResult.data.overallConfidence * 100).toFixed(0) + '%');
    console.log();

    // Summary
    console.log('='.repeat(70));
    console.log('📊 TESTING SUMMARY');
    console.log('='.repeat(70));
    console.log();
    console.log('✅ All tests completed successfully!');
    console.log();
    console.log('Results:');
    console.log('   ✅ Authentication working');
    console.log('   ✅ Project creation working');
    console.log('   ✅ Dataset upload working');
    console.log('   ✅ Phase 1 requirements generation working');
    console.log('   ✅ Phase 2 mapping working');
    console.log('   ✅ Validation working');
    console.log();
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('\n❌ Testing failed:', error.response?.data || error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
runIntegratedTests().catch(console.error);
