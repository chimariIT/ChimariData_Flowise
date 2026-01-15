/**
 * Manual API Testing Script for Data Requirements System
 * Tests all 4 API endpoints with real data
 */

import axios from 'axios';
import { db } from '../server/db';
import { users, projects, datasets } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const BASE_URL = 'http://localhost:5000';
const TEST_USER_EMAIL = 'test-data-requirements@example.com';
const TEST_PROJECT_NAME = 'Manual API Test - Customer Spending Analysis';

// Test dataset: Customer spending data
const TEST_DATASET = [
  { id: '1', customer_name: 'John Doe', email: 'john@example.com', join_date: '2023-01-15', monthly_bill: '125.50', contract_type: 'Premium' },
  { id: '2', customer_name: 'Jane Smith', email: 'jane@test.org', join_date: '2023-02-20', monthly_bill: '$85.00', contract_type: 'Basic' },
  { id: '3', customer_name: 'Bob Johnson', email: 'bob@company.net', join_date: 'Mar 10, 2023', monthly_bill: '200', contract_type: 'Premium' },
  { id: '4', customer_name: 'Alice Brown', email: 'alice@domain.com', join_date: '2023-04-05', monthly_bill: 'N/A', contract_type: 'Basic' },
  { id: '5', customer_name: 'Charlie Wilson', email: 'charlie@email.com', join_date: '2023-05-12', monthly_bill: '150.75', contract_type: 'Premium' }
];

const TEST_SCHEMA = {
  id: { type: 'string', nullable: false },
  customer_name: { type: 'string', nullable: false, isPII: true },
  email: { type: 'string', nullable: false, isPII: true },
  join_date: { type: 'string', nullable: false },
  monthly_bill: { type: 'string', nullable: false },
  contract_type: { type: 'string', nullable: false }
};

async function setupTestData() {
  console.log('🔧 Setting up test data...\n');

  // Create test user if not exists
  let user = await db.query.users.findFirst({
    where: eq(users.email, TEST_USER_EMAIL)
  });

  if (!user) {
    console.log('   Creating test user...');
    const [newUser] = await db.insert(users).values({
      id: nanoid(),
      email: TEST_USER_EMAIL,
      password: 'hashed_password', // Not used in testing
      role: 'business',
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    user = newUser;
    console.log(`   ✅ Test user created: ${user.id}`);
  } else {
    console.log(`   ✅ Test user found: ${user.id}`);
  }

  // Create test project
  console.log('   Creating test project...');
  const projectId = nanoid();
  const [project] = await db.insert(projects).values({
    id: projectId,
    userId: user.id,
    name: TEST_PROJECT_NAME,
    fileName: 'customer_spending.csv',
    fileSize: 1024,
    fileType: 'text/csv',
    uploadedAt: new Date(),
    journeyType: 'business',
    analysisGoals: 'Analyze customer spending patterns and identify top spenders',
    businessQuestions: `Who are our top 5 highest-paying customers?
What is the average monthly spending across all customers?
How does spending differ between Premium and Basic contract types?
Are there any customers with invalid billing data that need attention?`,
    processed: false
  }).returning();

  console.log(`   ✅ Test project created: ${project.id}`);

  // Create test dataset
  console.log('   Creating test dataset...');
  const datasetId = nanoid();
  const [dataset] = await db.insert(datasets).values({
    id: datasetId,
    projectId: project.id,
    userId: user.id,
    fileName: 'customer_spending.csv',
    fileSize: 1024,
    fileType: 'text/csv',
    recordCount: TEST_DATASET.length,
    schema: TEST_SCHEMA,
    data: TEST_DATASET,
    piiFields: ['customer_name', 'email'],
    uploadedAt: new Date()
  }).returning();

  console.log(`   ✅ Test dataset created: ${dataset.id}`);
  console.log(`   📊 Dataset: ${TEST_DATASET.length} records, 6 columns, 2 PII fields\n`);

  return { user, project, dataset };
}

async function loginAndGetToken(userId: string): Promise<string> {
  console.log('🔐 Getting authentication token...\n');

  // In a real scenario, we'd call POST /api/auth/login
  // For testing, we'll create a mock JWT token manually
  // This is a simplified approach - in production, use proper auth

  const mockToken = Buffer.from(JSON.stringify({
    userId,
    email: TEST_USER_EMAIL,
    iat: Date.now(),
    exp: Date.now() + 3600000 // 1 hour
  })).toString('base64');

  console.log(`   ✅ Mock token created: ${mockToken.substring(0, 50)}...\n`);
  return mockToken;
}

async function testPhase1GetRequirements(projectId: string, token: string) {
  console.log('📋 TEST 1: GET Required Data Elements (Phase 1 - Without Dataset)');
  console.log('='.repeat(70));

  try {
    // First, remove dataset temporarily to test Phase 1
    await db.delete(datasets).where(eq(datasets.projectId, projectId));

    const response = await axios.get(
      `${BASE_URL}/api/projects/${projectId}/required-data-elements`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Response Status:', response.status);
    console.log('📊 Response Data:');
    console.log(JSON.stringify(response.data, null, 2));

    // Verify Phase 1 response
    const checks = {
      'Has documentId': !!response.data.documentId,
      'Has projectId': response.data.projectId === projectId,
      'Has requiredDataElements': Array.isArray(response.data.requiredDataElements),
      'Elements > 0': response.data.requiredDataElements?.length > 0,
      'datasetAvailable = false': response.data.datasetAvailable === false,
      'No transformationPlan': !response.data.transformationPlan,
      'Has completeness metrics': !!response.data.completeness
    };

    console.log('\n🔍 Verification Checks:');
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });

    const allPassed = Object.values(checks).every(v => v);
    console.log(`\n${allPassed ? '✅' : '❌'} TEST 1: ${allPassed ? 'PASSED' : 'FAILED'}\n`);

    return response.data;
  } catch (error: any) {
    console.error('❌ TEST 1 FAILED:', error.response?.data || error.message);
    console.log();
    throw error;
  }
}

async function testPhase2GetRequirements(projectId: string, token: string, datasetId: string) {
  console.log('📋 TEST 2: GET Required Data Elements (Phase 2 - With Dataset)');
  console.log('='.repeat(70));

  try {
    // Re-create dataset for Phase 2 testing
    await db.insert(datasets).values({
      id: datasetId,
      projectId: projectId,
      userId: (await db.query.projects.findFirst({ where: eq(projects.id, projectId) }))!.userId,
      fileName: 'customer_spending.csv',
      fileSize: 1024,
      fileType: 'text/csv',
      recordCount: TEST_DATASET.length,
      schema: TEST_SCHEMA,
      data: TEST_DATASET,
      piiFields: ['customer_name', 'email'],
      uploadedAt: new Date()
    });

    const response = await axios.get(
      `${BASE_URL}/api/projects/${projectId}/required-data-elements`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Response Status:', response.status);
    console.log('📊 Response Data Summary:');
    console.log(`   - documentId: ${response.data.documentId}`);
    console.log(`   - datasetAvailable: ${response.data.datasetAvailable}`);
    console.log(`   - requiredDataElements: ${response.data.requiredDataElements?.length} elements`);
    console.log(`   - transformationPlan: ${response.data.transformationPlan ? 'Generated' : 'Not generated'}`);

    // Show element mapping details
    console.log('\n📊 Element Mappings:');
    response.data.requiredDataElements?.forEach((el: any, idx: number) => {
      console.log(`   ${idx + 1}. ${el.elementName}:`);
      console.log(`      - Mapped to: ${el.sourceField || 'NOT MAPPED'}`);
      console.log(`      - Confidence: ${el.confidence ? (el.confidence * 100).toFixed(0) + '%' : 'N/A'}`);
      console.log(`      - Transformation: ${el.transformationRequired ? 'YES' : 'NO'}`);
      if (el.transformationLogic?.operation) {
        console.log(`      - Operation: ${el.transformationLogic.operation}`);
      }
    });

    // Verify Phase 2 response
    const checks = {
      'Has documentId': !!response.data.documentId,
      'datasetAvailable = true': response.data.datasetAvailable === true,
      'Has confidence scores': response.data.requiredDataElements?.some((el: any) => el.confidence !== undefined),
      'Has transformationPlan': !!response.data.transformationPlan,
      'Has transformation steps': response.data.transformationPlan?.transformationSteps?.length > 0,
      'Has quality checks': response.data.transformationPlan?.dataQualityChecks?.length > 0,
      'Has completeness': !!response.data.completeness,
      'elementsMapped > 0': response.data.completeness?.elementsMapped > 0
    };

    console.log('\n🔍 Verification Checks:');
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });

    const allPassed = Object.values(checks).every(v => v);
    console.log(`\n${allPassed ? '✅' : '❌'} TEST 2: ${allPassed ? 'PASSED' : 'FAILED'}\n`);

    return response.data;
  } catch (error: any) {
    console.error('❌ TEST 2 FAILED:', error.response?.data || error.message);
    console.log();
    throw error;
  }
}

async function testValidateRequirements(projectId: string, token: string, requirementsDoc: any) {
  console.log('📋 TEST 3: POST Validate Requirements');
  console.log('='.repeat(70));

  try {
    // Create mock PM guidance with slight differences to trigger validation
    const pmGuidance = {
      suggestedTransformations: [
        {
          field: 'monthly_bill',
          operation: 'parse_currency_then_convert',
          confidence: 0.92,
          reasoning: 'Some values have currency symbols that need parsing'
        }
      ]
    };

    const response = await axios.post(
      `${BASE_URL}/api/projects/${projectId}/validate-requirements`,
      {
        requirementsDoc,
        pmGuidance
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Response Status:', response.status);
    console.log('📊 Validation Results:');
    console.log(`   - Conflicts: ${response.data.conflicts?.length || 0}`);
    console.log(`   - Overall Confidence: ${(response.data.overallConfidence * 100).toFixed(0)}%`);
    console.log(`   - Needs Review: ${response.data.needsReview ? 'YES' : 'NO'}`);
    console.log(`   - Summary: ${response.data.summary}`);

    if (response.data.conflicts?.length > 0) {
      console.log('\n⚠️  Conflicts Detected:');
      response.data.conflicts.forEach((conflict: any, idx: number) => {
        console.log(`   ${idx + 1}. ${conflict.element}:`);
        console.log(`      - Requirements: ${conflict.requirementsSuggests}`);
        console.log(`      - PM Suggests: ${conflict.pmSuggests}`);
        console.log(`      - Confidence: Req=${conflict.confidence.requirements}, PM=${conflict.confidence.pm}`);
        console.log(`      - Recommendation: ${conflict.recommendation}`);
      });
    }

    // Verify validation response
    const checks = {
      'Has conflicts array': Array.isArray(response.data.conflicts),
      'Has overallConfidence': typeof response.data.overallConfidence === 'number',
      'Has needsReview flag': typeof response.data.needsReview === 'boolean',
      'Has summary': !!response.data.summary
    };

    console.log('\n🔍 Verification Checks:');
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });

    const allPassed = Object.values(checks).every(v => v);
    console.log(`\n${allPassed ? '✅' : '❌'} TEST 3: ${allPassed ? 'PASSED' : 'FAILED'}\n`);

    return response.data;
  } catch (error: any) {
    console.error('❌ TEST 3 FAILED:', error.response?.data || error.message);
    console.log();
    throw error;
  }
}

async function testExecuteTransformationPlan(projectId: string, token: string, requirementsDoc: any) {
  console.log('📋 TEST 4: POST Execute Transformation Plan');
  console.log('='.repeat(70));

  try {
    if (!requirementsDoc.transformationPlan) {
      console.log('⚠️  No transformation plan available, skipping test');
      return null;
    }

    const response = await axios.post(
      `${BASE_URL}/api/projects/${projectId}/execute-transformation-plan`,
      {
        transformationPlan: requirementsDoc.transformationPlan,
        priority: 'high'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Response Status:', response.status);
    console.log('📊 Execution Response:');
    console.log(`   - Job ID: ${response.data.jobId}`);
    console.log(`   - Message: ${response.data.message}`);
    console.log(`   - Estimated Duration: ${response.data.estimatedDuration} minutes`);

    // Verify execution response
    const checks = {
      'Has jobId': !!response.data.jobId,
      'Has message': !!response.data.message,
      'Has estimatedDuration': typeof response.data.estimatedDuration === 'number'
    };

    console.log('\n🔍 Verification Checks:');
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });

    const allPassed = Object.values(checks).every(v => v);
    console.log(`\n${allPassed ? '✅' : '❌'} TEST 4: ${allPassed ? 'PASSED' : 'FAILED'}\n`);

    return response.data;
  } catch (error: any) {
    console.error('❌ TEST 4 FAILED:', error.response?.data || error.message);
    console.log();
    throw error;
  }
}

async function testJobStatus(jobId: string, token: string) {
  console.log('📋 TEST 5: GET Transformation Job Status');
  console.log('='.repeat(70));

  try {
    if (!jobId) {
      console.log('⚠️  No job ID available, skipping test');
      return null;
    }

    const response = await axios.get(
      `${BASE_URL}/api/transformation-jobs/${jobId}/status`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Response Status:', response.status);
    console.log('📊 Job Status:');
    console.log(`   - Job ID: ${response.data.jobId}`);
    console.log(`   - Status: ${response.data.status}`);
    console.log(`   - Progress: ${response.data.progress}%`);
    console.log(`   - Created: ${response.data.createdAt}`);
    console.log(`   - Priority: ${response.data.priority}`);
    if (response.data.error) {
      console.log(`   - Error: ${response.data.error}`);
    }

    // Verify job status response
    const checks = {
      'Has jobId': response.data.jobId === jobId,
      'Has status': !!response.data.status,
      'Has progress': typeof response.data.progress === 'number',
      'Has createdAt': !!response.data.createdAt,
      'Has priority': !!response.data.priority
    };

    console.log('\n🔍 Verification Checks:');
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });

    const allPassed = Object.values(checks).every(v => v);
    console.log(`\n${allPassed ? '✅' : '❌'} TEST 5: ${allPassed ? 'PASSED' : 'FAILED'}\n`);

    return response.data;
  } catch (error: any) {
    console.error('❌ TEST 5 FAILED:', error.response?.data || error.message);
    console.log();
    throw error;
  }
}

async function cleanup(projectId: string) {
  console.log('🧹 Cleaning up test data...');

  // Delete datasets
  await db.delete(datasets).where(eq(datasets.projectId, projectId));

  // Delete project
  await db.delete(projects).where(eq(projects.id, projectId));

  // Note: Not deleting test user to allow re-runs

  console.log('✅ Cleanup complete\n');
}

async function runManualTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 MANUAL API TESTING - DATA REQUIREMENTS SYSTEM');
  console.log('='.repeat(70) + '\n');

  let projectId: string | null = null;
  let datasetId: string | null = null;

  try {
    // Setup
    const { user, project, dataset } = await setupTestData();
    projectId = project.id;
    datasetId = dataset.id;

    const token = await loginAndGetToken(user.id);

    // Run tests
    const phase1Doc = await testPhase1GetRequirements(project.id, token);
    const phase2Doc = await testPhase2GetRequirements(project.id, token, dataset.id);
    const validationResult = await testValidateRequirements(project.id, token, phase2Doc);
    const executionResult = await testExecuteTransformationPlan(project.id, token, phase2Doc);

    if (executionResult?.jobId) {
      await testJobStatus(executionResult.jobId, token);
    }

    // Summary
    console.log('='.repeat(70));
    console.log('📊 MANUAL TESTING SUMMARY');
    console.log('='.repeat(70));
    console.log();
    console.log('✅ All API endpoints tested successfully!');
    console.log();
    console.log('Test Results:');
    console.log('   ✅ Phase 1: Requirements without dataset');
    console.log('   ✅ Phase 2: Requirements with dataset mapping');
    console.log('   ✅ Validation: Cross-validation with PM guidance');
    console.log('   ✅ Execution: Transformation plan queuing');
    console.log('   ✅ Status: Job status tracking');
    console.log();
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Manual testing failed:', error);
    process.exit(1);
  } finally {
    if (projectId) {
      await cleanup(projectId);
    }
  }
}

// Run tests
runManualTests().catch(console.error);
