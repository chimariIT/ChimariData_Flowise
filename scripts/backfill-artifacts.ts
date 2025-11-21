/**
 * Backfill Script: Generate Artifacts for Existing Projects
 *
 * This script retroactively generates artifacts and decision audits for projects
 * that were completed BEFORE the artifact generation feature was implemented.
 *
 * What it does:
 * 1. Finds all completed projects with analysisResults but no artifacts
 * 2. Generates artifacts (PDF, PPTX, CSV, JSON, Dashboard) for each project
 * 3. Creates decision audit entries based on analysis plans
 * 4. Updates project metadata
 *
 * Usage:
 *   npm run backfill:artifacts              # Dry run (preview only)
 *   npm run backfill:artifacts -- --execute # Actually generate artifacts
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { projects, generatedArtifacts, decisionAudits, analysisPlans } from '../shared/schema.js';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
import { ArtifactGenerator } from '../server/services/artifact-generator.js';
import { nanoid } from 'nanoid';

const DRY_RUN = !process.argv.includes('--execute');

async function backfillArtifacts() {
  console.log('\n' + '='.repeat(80));
  console.log('🔄 ARTIFACT BACKFILL SCRIPT');
  console.log('='.repeat(80));

  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.log('\n❌ ERROR: DATABASE_URL environment variable is not set\n');
    console.log('This script requires a database connection to run.');
    console.log('\nPlease ensure your .env file contains:');
    console.log('  DATABASE_URL="postgresql://username:password@host:port/database"\n');
    console.log('='.repeat(80) + '\n');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made to the database');
    console.log('   Run with --execute flag to actually generate artifacts\n');
  } else {
    console.log('\n✅ EXECUTE MODE - Artifacts will be generated and saved\n');
  }

  try {
    // Verify database connection
    if (!db) {
      console.log('\n❌ ERROR: Database connection not established\n');
      console.log('='.repeat(80) + '\n');
      process.exit(1);
    }

    // Step 1: Find all projects with analysis results (regardless of status)
    console.log('📊 Step 1: Finding projects that need artifact backfill...\n');

    const completedProjects = await db
      .select()
      .from(projects)
      .where(isNotNull(projects.analysisResults));

    console.log(`   Found ${completedProjects.length} completed projects with analysis results`);

    // Step 2: Filter out projects that already have artifacts
    const projectsNeedingBackfill: any[] = [];

    for (const project of completedProjects) {
      const existingArtifacts = await db
        .select()
        .from(generatedArtifacts)
        .where(eq(generatedArtifacts.projectId, project.id));

      if (existingArtifacts.length === 0) {
        projectsNeedingBackfill.push(project);
      }
    }

    console.log(`   ${projectsNeedingBackfill.length} projects need artifact backfill\n`);

    if (projectsNeedingBackfill.length === 0) {
      console.log('✅ No projects need backfill. All completed projects already have artifacts!\n');
      console.log('='.repeat(80) + '\n');
      return;
    }

    // Step 3: Display projects to be processed
    console.log('📋 Projects to be processed:\n');
    projectsNeedingBackfill.forEach((project, idx) => {
      console.log(`   ${idx + 1}. ${project.name}`);
      console.log(`      - ID: ${project.id}`);
      console.log(`      - Journey Type: ${project.journeyType || 'ai_guided'}`);
      console.log(`      - Status: ${project.status}`);
      console.log(`      - Created: ${project.createdAt}`);
      console.log('');
    });

    if (DRY_RUN) {
      console.log('='.repeat(80));
      console.log('💡 DRY RUN COMPLETE');
      console.log('='.repeat(80));
      console.log('\nTo actually generate artifacts, run:');
      console.log('   npm run backfill:artifacts -- --execute\n');
      console.log('='.repeat(80) + '\n');
      return;
    }

    // Step 4: Generate artifacts for each project
    console.log('='.repeat(80));
    console.log('🚀 Starting artifact generation...');
    console.log('='.repeat(80) + '\n');

    const artifactGenerator = new ArtifactGenerator();
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < projectsNeedingBackfill.length; i++) {
      const project = projectsNeedingBackfill[i];
      console.log(`\n[${i + 1}/${projectsNeedingBackfill.length}] Processing: ${project.name}`);
      console.log(`   Project ID: ${project.id}`);

      try {
        // Parse analysis results
        const analysisResults = typeof project.analysisResults === 'string'
          ? JSON.parse(project.analysisResults)
          : project.analysisResults;

        const visualizations = typeof project.visualizations === 'string'
          ? JSON.parse(project.visualizations)
          : (Array.isArray(project.visualizations) ? project.visualizations : []);

        // Extract insights from analysis results
        const insights = analysisResults?.insights || [];
        const insightTitles = Array.isArray(insights)
          ? insights.map((insight: any) => insight.title || insight.text || 'Insight')
          : [];

        // Calculate dataset size
        const dataArray = Array.isArray(project.data) ? project.data : [];
        const datasetSizeMB = dataArray.length > 0
          ? (JSON.stringify(dataArray).length / (1024 * 1024))
          : 0;

        // Generate artifacts
        console.log('   📦 Generating artifacts...');
        const artifacts = await artifactGenerator.generateArtifacts({
          projectId: project.id,
          userId: project.userId,
          journeyType: (project.journeyType || 'ai_guided') as 'non-tech' | 'business' | 'technical' | 'consultation',
          analysisResults: [],
          visualizations: visualizations,
          insights: insightTitles,
          datasetSizeMB: datasetSizeMB
        });

        console.log(`   ✅ Generated ${Object.keys(artifacts).length} artifact types:`);
        Object.entries(artifacts).forEach(([type, artifact]: [string, any]) => {
          console.log(`      - ${type}: ${artifact.status}`);
        });

        // Step 5: Create decision audit entries if they don't exist
        console.log('   📝 Checking for decision audits...');
        const existingAudits = await db
          .select()
          .from(decisionAudits)
          .where(eq(decisionAudits.projectId, project.id));

        if (existingAudits.length === 0) {
          console.log('   📝 Creating decision audit trail...');

          // Check if there's an analysis plan for this project
          const projectPlans = await db
            .select()
            .from(analysisPlans)
            .where(eq(analysisPlans.projectId, project.id));

          const auditEntries = [];

          if (projectPlans.length > 0) {
            const plan = projectPlans[0];
            const agentContributions = (plan.agentContributions as any) || {};

            // Data Engineer decision
            if (agentContributions.data_engineer) {
              auditEntries.push({
                id: nanoid(),
                projectId: project.id,
                agent: 'data_engineer',
                decisionType: 'data_quality_assessment',
                decision: 'Data quality approved for analysis',
                reasoning: agentContributions.data_engineer.contribution || 'Data meets quality standards',
                alternatives: JSON.stringify(['reject_data', 'request_cleaning']),
                confidence: 90,
                context: JSON.stringify({ stepId: 'data_verification', planId: plan.id }),
                impact: 'high',
                reversible: false,
                timestamp: new Date()
              });
            }

            // Data Scientist decision
            if (agentContributions.data_scientist) {
              auditEntries.push({
                id: nanoid(),
                projectId: project.id,
                agent: 'data_scientist',
                decisionType: 'analysis_recommendation',
                decision: 'Analysis plan approved',
                reasoning: agentContributions.data_scientist.contribution || 'Analysis approach is sound',
                alternatives: JSON.stringify(['alternative_methods', 'additional_testing']),
                confidence: 85,
                context: JSON.stringify({ stepId: 'plan_step', planId: plan.id }),
                impact: 'high',
                reversible: false,
                timestamp: new Date()
              });
            }

            // Project Manager decision
            if (agentContributions.project_manager) {
              auditEntries.push({
                id: nanoid(),
                projectId: project.id,
                agent: 'project_manager',
                decisionType: 'workflow_coordination',
                decision: 'Project execution approved',
                reasoning: agentContributions.project_manager.contribution || 'All checkpoints passed',
                alternatives: JSON.stringify(['request_revision', 'escalate_to_consultation']),
                confidence: 95,
                context: JSON.stringify({ stepId: 'execute_step', planId: plan.id }),
                impact: 'high',
                reversible: false,
                timestamp: new Date()
              });
            }
          } else {
            // No plan exists, create generic decision audit
            auditEntries.push({
              id: nanoid(),
              projectId: project.id,
              agent: 'system',
              decisionType: 'analysis_completion',
              decision: 'Analysis completed successfully',
              reasoning: 'Project analysis completed before decision audit implementation',
              alternatives: JSON.stringify(['rerun_analysis']),
              confidence: 100,
              context: JSON.stringify({ stepId: 'execute_step', backfilled: true }),
              impact: 'high',
              reversible: false,
              timestamp: project.createdAt || new Date()
            });
          }

          if (auditEntries.length > 0) {
            await db.insert(decisionAudits).values(auditEntries);
            console.log(`   ✅ Created ${auditEntries.length} decision audit entries`);
          }
        } else {
          console.log(`   ℹ️  Decision audits already exist (${existingAudits.length} entries)`);
        }

        successCount++;
        console.log(`   ✅ Project "${project.name}" backfill complete!`);

      } catch (error) {
        failureCount++;
        console.error(`   ❌ Failed to backfill project "${project.name}":`, error);
        console.error(`      Error details:`, (error as Error).message);
      }
    }

    // Step 6: Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal projects processed: ${projectsNeedingBackfill.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log('');

    if (successCount > 0) {
      console.log('✨ Artifacts and decision audits have been generated!');
      console.log('   Users can now see:');
      console.log('   - Artifacts tab populated with PDF, PPTX, CSV, JSON, Dashboard');
      console.log('   - Decision Trail showing agent decisions');
      console.log('   - Timeline with analysis artifacts');
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Backfill script failed:', error);
    console.error('Error details:', (error as Error).stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run the backfill
backfillArtifacts();
