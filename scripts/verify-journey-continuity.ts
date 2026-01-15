/**
 * Verification Script: Journey Data Continuity
 *
 * This script verifies that:
 * 1. Joined data is stored in journeyProgress (SSOT)
 * 2. Data quality endpoint uses joined data (not individual datasets)
 * 3. RequirementsDocument persists through steps
 * 4. Mappings from verification flow to transformation
 */

// Load environment variables first
import 'dotenv/config';

import { storage } from '../server/storage';
import { db } from '../server/db';
import { projects } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface JourneyProgressShape {
  joinedData?: {
    schema?: Record<string, any>;
    preview?: any[];
    fullData?: any[];
    totalRowCount?: number;
    qualityMetrics?: any;
  };
  requirementsDocument?: {
    analysisPath?: any[];
    requiredDataElements?: any[];
    questionAnswerMapping?: any[];
  };
  requiredDataElements?: any[];
  analysisGoal?: string;
  userQuestions?: any[];
}

async function verifyJourneyContinuity() {
  console.log('🔍 === JOURNEY DATA CONTINUITY VERIFICATION ===\n');

  // Get projects with journeyProgress (not just empty ones)
  const allProjects = await db.select()
    .from(projects)
    .orderBy(projects.createdAt);

  // Filter to projects that have some journeyProgress data
  const recentProjects = allProjects.filter((p: any) => {
    const jp = p.journeyProgress;
    if (!jp) return false;
    const parsed = typeof jp === 'string' ? JSON.parse(jp) : jp;
    // Check if it has any meaningful journey data
    return parsed?.joinedData || parsed?.requirementsDocument ||
           parsed?.analysisGoal || parsed?.userQuestions?.length > 0;
  }).slice(0, 10);

  console.log(`Found ${allProjects.length} total projects, ${recentProjects.length} with journey data\n`);

  if (recentProjects.length === 0) {
    console.log('❌ No projects found in database');
    return;
  }

  for (const project of recentProjects) {
    console.log(`\n📁 Project: ${project.name} (${project.id})`);
    console.log('─'.repeat(60));

    // Parse journeyProgress
    let journeyProgress: JourneyProgressShape = {};
    try {
      const jp = (project as any).journeyProgress;
      if (typeof jp === 'string') {
        journeyProgress = JSON.parse(jp);
      } else if (jp && typeof jp === 'object') {
        journeyProgress = jp;
      }
    } catch (e) {
      console.log('  ⚠️ Could not parse journeyProgress');
      continue;
    }

    // Check 1: Joined Data
    console.log('\n  📊 [CHECK 1] Joined Data in journeyProgress:');
    const joinedData = journeyProgress?.joinedData;
    if (joinedData) {
      const hasSchema = joinedData.schema && Object.keys(joinedData.schema).length > 0;
      const hasPreview = joinedData.preview && joinedData.preview.length > 0;
      const hasFullData = joinedData.fullData && joinedData.fullData.length > 0;
      const rowCount = joinedData.totalRowCount || joinedData.preview?.length || 0;

      console.log(`     ✅ joinedData exists`);
      console.log(`     - Schema columns: ${hasSchema ? Object.keys(joinedData.schema!).length : 0}`);
      console.log(`     - Preview rows: ${joinedData.preview?.length || 0}`);
      console.log(`     - Full data rows: ${joinedData.fullData?.length || 0}`);
      console.log(`     - Total row count: ${rowCount}`);
      console.log(`     - Has quality metrics: ${!!joinedData.qualityMetrics}`);

      if (!hasSchema) {
        console.log('     ⚠️ WARNING: joinedData has no schema - data quality will fall back to first dataset');
      }
    } else {
      console.log('     ❌ joinedData NOT found - multi-dataset projects will use individual datasets');
    }

    // Check 2: Requirements Document
    console.log('\n  📋 [CHECK 2] Requirements Document:');
    const reqDoc = journeyProgress?.requirementsDocument;
    if (reqDoc) {
      console.log(`     ✅ requirementsDocument exists`);
      console.log(`     - Analysis path items: ${reqDoc.analysisPath?.length || 0}`);
      console.log(`     - Required data elements: ${reqDoc.requiredDataElements?.length || 0}`);
      console.log(`     - Question mappings: ${reqDoc.questionAnswerMapping?.length || 0}`);

      // Check for element mappings (sourceColumn populated)
      const mappedElements = (reqDoc.requiredDataElements || []).filter(
        (el: any) => el.sourceColumn && el.mappingStatus === 'mapped'
      );
      console.log(`     - Mapped elements: ${mappedElements.length}/${reqDoc.requiredDataElements?.length || 0}`);

      if (mappedElements.length > 0) {
        console.log('     ✅ Element mappings exist from Verification step');
      } else if ((reqDoc.requiredDataElements?.length || 0) > 0) {
        console.log('     ⚠️ Elements exist but none are mapped - Verification step may not have been completed');
      }
    } else {
      console.log('     ❌ requirementsDocument NOT found - Prepare step may not have been completed');
    }

    // Check 3: Flat required data elements (legacy/duplicate)
    console.log('\n  📝 [CHECK 3] Flat requiredDataElements (legacy):');
    const flatElements = journeyProgress?.requiredDataElements;
    if (flatElements && flatElements.length > 0) {
      console.log(`     ✅ Found ${flatElements.length} flat elements`);
      const flatMapped = flatElements.filter((el: any) => el.sourceColumn);
      console.log(`     - Mapped: ${flatMapped.length}/${flatElements.length}`);
    } else {
      console.log('     ⚠️ No flat requiredDataElements (may be stored only in requirementsDocument)');
    }

    // Check 4: User goals and questions
    console.log('\n  🎯 [CHECK 4] User Goals and Questions:');
    const goal = journeyProgress?.analysisGoal;
    const questions = journeyProgress?.userQuestions;
    console.log(`     - Analysis goal: ${goal ? '✅ Set' : '❌ Not set'}`);
    console.log(`     - User questions: ${questions?.length || 0}`);

    // Check 5: Get datasets for comparison
    console.log('\n  📂 [CHECK 5] Dataset Comparison:');
    const datasets = await storage.getProjectDatasets(project.id);
    console.log(`     - Individual datasets: ${datasets.length}`);

    if (datasets.length > 1 && !joinedData?.schema) {
      console.log('     ⚠️ ISSUE: Multiple datasets exist but no joined schema in journeyProgress');
      console.log('        Data quality endpoint will use first dataset only!');
    } else if (datasets.length > 1 && joinedData?.schema) {
      console.log('     ✅ Multiple datasets with joined schema - data quality will use combined data');
    }
  }

  console.log('\n\n✅ === VERIFICATION COMPLETE ===');
}

// Run verification
verifyJourneyContinuity()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
