/**
 * Test PM Agent Clarification Endpoint
 * Run with: node test-pm-clarification.js
 */

async function testPMClarification() {
  console.log('🧪 Testing PM Agent Clarification Endpoint\n');

  const testData = {
    analysisGoal: "Understand customer purchasing behavior",
    businessQuestions: [
      "Who are our most valuable customers?",
      "What factors drive repeat purchases?"
    ],
    journeyType: "business",
    sessionId: "test-session-123"
  };

  console.log('Test Request:', JSON.stringify(testData, null, 2));
  console.log('\nSending request to: http://localhost:5000/api/project-manager/clarify-goal\n');

  try {
    const response = await fetch('http://localhost:5000/api/project-manager/clarify-goal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    console.log('Response Status:', response.status, response.statusText);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));

    const data = await response.json();

    if (response.ok) {
      console.log('\n✅ SUCCESS!\n');
      console.log('Response Data:', JSON.stringify(data, null, 2));

      if (data.clarification) {
        console.log('\n📋 Clarification Summary:');
        console.log('  - Summary:', data.clarification.summary);
        console.log('  - Suggested Focus:', data.clarification.suggestedFocus);
        console.log('  - Data Requirements:', data.clarification.dataRequirements);
        console.log('  - Estimated Complexity:', data.clarification.estimatedComplexity);
      }
    } else {
      console.log('\n❌ FAILED!\n');
      console.log('Error Response:', JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('\n❌ REQUEST FAILED!\n');
    console.error('Error:', error.message);
    console.error('Details:', error);

    console.log('\n💡 Possible Issues:');
    console.log('  1. Server not running on port 5000');
    console.log('  2. CORS issues');
    console.log('  3. Network connectivity');
    console.log('\nTry running: npm run dev');
  }
}

testPMClarification();
