/**
 * Quick Script: Check All Projects in Database
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { projects, generatedArtifacts } from '../shared/schema.js';

async function checkAllProjects() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 CHECKING ALL PROJECTS IN DATABASE');
  console.log('='.repeat(80) + '\n');

  try {
    if (!db) {
      console.log('❌ Database not connected\n');
      process.exit(1);
    }

    // Get all projects
    const allProjects = await db.select().from(projects);

    console.log(`Total projects in database: ${allProjects.length}\n`);

    if (allProjects.length === 0) {
      console.log('⚠️  No projects found in database.\n');
      console.log('='.repeat(80) + '\n');
      process.exit(0);
    }

    // Group by status
    const byStatus: Record<string, number> = {};
    const withAnalysisResults: any[] = [];
    const withoutArtifacts: any[] = [];

    for (const project of allProjects) {
      const status = (project as any).status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;

      if ((project as any).analysisResults) {
        withAnalysisResults.push(project);
      }

      // Check for artifacts
      const artifacts = await db
        .select()
        .from(generatedArtifacts)
        .where((fields) => fields.projectId === project.id);

      if (artifacts.length === 0) {
        withoutArtifacts.push(project);
      }
    }

    console.log('📊 Projects by Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    console.log(`\n📈 Projects with analysisResults: ${withAnalysisResults.length}`);
    console.log(`📦 Projects without artifacts: ${withoutArtifacts.length}\n`);

    if (withoutArtifacts.length > 0) {
      console.log('Projects that could need backfill:\n');
      for (const project of withoutArtifacts.slice(0, 10)) {
        const p = project as any;
        console.log(`   - ${p.name || 'Untitled'}`);
        console.log(`     ID: ${p.id}`);
        console.log(`     Status: ${p.status || 'unknown'}`);
        console.log(`     Has analysisResults: ${p.analysisResults ? 'YES' : 'NO'}`);
        console.log(`     Created: ${p.createdAt}\n`);
      }

      if (withoutArtifacts.length > 10) {
        console.log(`   ... and ${withoutArtifacts.length - 10} more\n`);
      }
    }

    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

checkAllProjects();
