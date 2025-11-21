const tests = [
  {
    name: "Array of questions",
    data: { analysisGoal: "Customer behavior", businessQuestions: ["Q1", "Q2"], journeyType: "business" }
  },
  {
    name: "Empty questions array",
    data: { analysisGoal: "Sales trends", businessQuestions: [], journeyType: "technical" }
  },
  {
    name: "Single string question",
    data: { analysisGoal: "Employee retention", businessQuestions: "Why do people leave?", journeyType: "ai_guided" }
  },
  {
    name: "No questions field",
    data: { analysisGoal: "Revenue analysis", journeyType: "business" }
  },
  {
    name: "Complex ML goal",
    data: {
      analysisGoal: "Build predictive model using machine learning",
      businessQuestions: ["What features predict success?", "How accurate?"],
      journeyType: "technical"
    }
  },
  {
    name: "Missing goal (should fail)",
    data: { businessQuestions: ["Some question"], journeyType: "business" },
    shouldFail: true
  },
  {
    name: "Legacy 'goal' field",
    data: { goal: "Test legacy field", businessQuestions: ["Does it work?"], journeyType: "business" }
  }
];

async function runTests() {
  console.log("🧪 Running PM Agent Clarification Tests\n");
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const response = await fetch("http://localhost:5000/api/project-manager/clarify-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(test.data)
      });

      const data = await response.json();

      if (test.shouldFail) {
        if (!response.ok || !data.success) {
          console.log(`✅ ${test.name}: PASSED (Expected failure)`);
          passed++;
        } else {
          console.log(`❌ ${test.name}: FAILED (Should have failed)`);
          failed++;
        }
      } else {
        if (response.ok && data.success && data.clarification) {
          console.log(`✅ ${test.name}: PASSED`);
          const reqCount = data.clarification.dataRequirements ? data.clarification.dataRequirements.length : 0;
          console.log(`   Complexity: ${data.clarification.estimatedComplexity}, Requirements: ${reqCount}`);
          passed++;
        } else {
          console.log(`❌ ${test.name}: FAILED`);
          console.log(`   Error: ${data.error || "Unknown"}`);
          failed++;
        }
      }
    } catch (error) {
      console.log(`❌ ${test.name}: EXCEPTION - ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED!");
    process.exit(0);
  } else {
    console.log("\n⚠️  SOME TESTS FAILED");
    process.exit(1);
  }
}

runTests();
