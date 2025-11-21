/**
 * Check Project Status Script
 * Diagnose why artifacts/visualizations aren't showing for a specific project
 */

const { db } = require('../server/db');
const { projects, analysisPlans, decisionAudits, generatedArtifacts } = require('../shared/schema');
const { eq } = require('drizzle-orm');

const projectId = 'GEGNwrxzHN8t5zOZsue7d';

async function checkProject() {
  console.log('\n' + '='.repeat(80));
  console.log(`🔍 Diagnosing Project: ${projectId}`);
  console.log('='.repeat(80) + '\n');

  try {
    // 1. Check if project exists
    console.log('📦 1. Checking if project exists...');
    const projectRecords = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!projectRecords || projectRecords.length === 0) {
      console.log('❌ Project NOT FOUND in database!');
      console.log('   This project ID does not exist.\n');
      process.exit(1);
    }

    const project = projectRecords[0];
    console.log('✅ Project found!');
    console.log(`   Name: ${project.name}`);
    console.log(`   Status: ${project.status}`);
    console.log(`   Journey Type: ${project.journeyType}`);
    console.log(`   User ID: ${project.userId}`);
    console.log(`   Created: ${project.createdAt}`);
    console.log(`   Updated: ${project.updatedAt}`);

    // 2. Check analysis results
    console.log('\n📊 2. Checking analysis results...');
    if (project.analysisResults) {
      const results = typeof project.analysisResults === 'string'
        ? JSON.parse(project.analysisResults)
        : project.analysisResults;
      console.log('✅ Analysis results exist!');
      console.log(`   Keys: ${Object.keys(results).join(', ')}`);
      if (results.insights) {
        console.log(`   Insights count: ${Array.isArray(results.insights) ? results.insights.length : 'N/A'}`);
      }
      if (results.recommendations) {
        console.log(`   Recommendations count: ${Array.isArray(results.recommendations) ? results.recommendations.length : 'N/A'}`);
      }
    } else {
      console.log('❌ No analysis results found!');
      console.log('   This project has not completed analysis execution.');
    }

    // 3. Check for analysis plan
    console.log('\n📋 3. Checking for analysis plan...');
    const plans = await db
      .select()
      .from(analysisPlans)
      .where(eq(analysisPlans.projectId, projectId));

    if (plans && plans.length > 0) {
      console.log(`✅ Found ${plans.length} analysis plan(s)`);
      plans.forEach((plan, idx) => {
        console.log(`\n   Plan ${idx + 1}:`);
        console.log(`   - ID: ${plan.id}`);
        console.log(`   - Status: ${plan.status}`);
        console.log(`   - Version: ${plan.version}`);
        console.log(`   - Created: ${plan.createdAt}`);
        console.log(`   - Approved: ${plan.approvedAt || 'Not approved'}`);
      });
    } else {
      console.log('❌ No analysis plans found!');
      console.log('   User has not created an analysis plan for this project.');
    }

    // 4. Check for decision audits
    console.log('\n📝 4. Checking for decision audits...');
    const audits = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.projectId, projectId));

    if (audits && audits.length > 0) {
      console.log(`✅ Found ${audits.length} decision audit(s)`);
      audits.forEach((audit, idx) => {
        console.log(`\n   Audit ${idx + 1}:`);
        console.log(`   - Agent: ${audit.agent}`);
        console.log(`   - Decision Type: ${audit.decisionType}`);
        console.log(`   - Decision: ${audit.decision}`);
        console.log(`   - Timestamp: ${audit.timestamp}`);
      });
    } else {
      console.log('❌ No decision audits found!');
      console.log('   ⚠️  This is why Decision Trail is empty!');
    }

    // 5. Check for generated artifacts
    console.log('\n📦 5. Checking for generated artifacts...');
    const artifacts = await db
      .select()
      .from(generatedArtifacts)
      .where(eq(generatedArtifacts.projectId, projectId));

    if (artifacts && artifacts.length > 0) {
      console.log(`✅ Found ${artifacts.length} artifact(s)`);
      artifacts.forEach((artifact, idx) => {
        console.log(`\n   Artifact ${idx + 1}:`);
        console.log(`   - Type: ${artifact.type}`);
        console.log(`   - Status: ${artifact.status}`);
        console.log(`   - Created: ${artifact.createdAt}`);
        if (artifact.fileRefs) {
          const refs = typeof artifact.fileRefs === 'string'
            ? JSON.parse(artifact.fileRefs)
            : artifact.fileRefs;
          console.log(`   - Files: ${refs.length} file(s)`);
        }
      });
    } else {
      console.log('❌ No generated artifacts found!');
      console.log('   ⚠️  This is why Artifacts tab is empty!');
    }

    // 6. Check data structure
    console.log('\n💾 6. Checking data structure...');
    const dataArray = project.data;
    if (dataArray) {
      const parsedData = typeof dataArray === 'string' ? JSON.parse(dataArray) : dataArray;
      console.log(`✅ Data exists: ${Array.isArray(parsedData) ? parsedData.length : 0} rows`);

      if (project.schema) {
        const schema = typeof project.schema === 'string' ? JSON.parse(project.schema) : project.schema;
        console.log(`✅ Schema exists: ${Object.keys(schema).length} columns`);
      } else {
        console.log('⚠️  No schema defined - visualizations may need auto-generation');
      }
    } else {
      console.log('❌ No data found!');
    }

    // 7. Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 DIAGNOSIS SUMMARY');
    console.log('='.repeat(80));
    console.log('\nProject Status:', project.status);
    console.log('Analysis Completed:', project.analysisResults ? 'YES ✅' : 'NO ❌');
    console.log('Analysis Plan Created:', plans.length > 0 ? 'YES ✅' : 'NO ❌');
    console.log('Decision Audits Exist:', audits.length > 0 ? `YES ✅ (${audits.length})` : 'NO ❌');
    console.log('Artifacts Generated:', artifacts.length > 0 ? `YES ✅ (${artifacts.length})` : 'NO ❌');

    console.log('\n🔧 RECOMMENDED ACTIONS:');

    if (project.status === 'completed' && !artifacts.length) {
      console.log('1. ⚠️  This is a COMPLETED project without artifacts');
      console.log('   → Run backfill script to generate artifacts');
      console.log('   → Command: npm run backfill:artifacts');
    }

    if (plans.length > 0 && audits.length === 0) {
      console.log('2. ⚠️  Analysis plan exists but no decision audits');
      console.log('   → This project was completed before decision audit fix');
      console.log('   → Run backfill script to create decision audits');
    }

    if (!project.analysisResults) {
      console.log('3. ⚠️  No analysis results found');
      console.log('   → User needs to complete the analysis execution step');
      console.log('   → Navigate to Execute step and run analysis');
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error checking project:', error);
    process.exit(1);
  }

  process.exit(0);
}

checkProject();
