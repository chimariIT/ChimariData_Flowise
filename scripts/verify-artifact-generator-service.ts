/**
 * Verify Artifact Generator Service
 * 
 * Tests the ArtifactGenerator service in isolation.
 */

import 'dotenv/config';
import { ArtifactGenerator, ArtifactConfig } from '../server/services/artifact-generator';
import { db } from '../server/db';
import { projects, users, projectArtifacts, generatedArtifacts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';

async function cleanup(projectId: string, userId: string) {
    console.log('\n🧹 Cleaning up test data...');

    await db.delete(generatedArtifacts).where(eq(generatedArtifacts.projectId, projectId));
    await db.delete(projectArtifacts).where(eq(projectArtifacts.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));

    // Clean up files
    const artifactDir = path.join(process.cwd(), 'uploads', 'artifacts', projectId);
    if (fs.existsSync(artifactDir)) {
        fs.rmSync(artifactDir, { recursive: true, force: true });
        console.log(`   ✅ Deleted artifact directory: ${artifactDir}`);
    }

    console.log('   ✅ Cleanup complete\n');
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     Artifact Generator Verification                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const projectId = `test_art_${nanoid()}`;
    const userId = `user_art_${nanoid()}`;

    try {
        // Create test user
        await db.insert(users).values({
            id: userId,
            email: `test_art_${nanoid()}@example.com`,
            subscriptionTier: 'professional',
            userRole: 'business',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test user');

        // Create test project
        await db.insert(projects).values({
            id: projectId,
            userId,
            name: 'Artifact Test Project',
            journeyType: 'business',
            status: 'ready',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test project');

        // Config for artifact generation
        const config: ArtifactConfig = {
            projectId,
            projectName: 'Artifact Test Project',
            userId,
            journeyType: 'business',
            analysisResults: [{ some: 'data', result: 42 }],
            visualizations: [{ type: 'bar', title: 'Test Chart' }],
            insights: ['Insight 1: Test insight', 'Insight 2: Another insight'],
            datasetSizeMB: 5.5
        };

        // Run generator
        console.log('   🎨 Running ArtifactGenerator...');
        const generator = new ArtifactGenerator();
        const result = await generator.generateArtifacts(config);

        console.log('   ✅ Artifact generation complete');
        console.log(`      Total Size: ${result.totalSizeMB.toFixed(2)} MB`);
        console.log(`      Total Cost: $${(result.totalCost / 100).toFixed(2)}`);

        // Verify files exist
        const artifactDir = path.join(process.cwd(), 'uploads', 'artifacts', projectId);
        if (!fs.existsSync(artifactDir)) {
            throw new Error('Artifact directory not created');
        }

        const files = fs.readdirSync(artifactDir);
        console.log(`   ✅ Artifact directory created with ${files.length} files:`);
        files.forEach(f => console.log(`      - ${f}`));

        if (!files.some(f => f.endsWith('.pdf'))) throw new Error('PDF not generated');
        if (!files.some(f => f.endsWith('.csv'))) throw new Error('CSV not generated');
        if (!files.some(f => f.endsWith('.json'))) throw new Error('JSON not generated');

        // Verify DB records
        const artifacts = await db
            .select()
            .from(projectArtifacts)
            .where(eq(projectArtifacts.projectId, projectId));

        if (artifacts.length === 0) {
            throw new Error('No projectArtifacts record created');
        }
        console.log(`   ✅ projectArtifacts record created (ID: ${artifacts[0].id})`);

        const genArtifacts = await db
            .select()
            .from(generatedArtifacts)
            .where(eq(generatedArtifacts.projectId, projectId));

        if (genArtifacts.length === 0) {
            throw new Error('No generatedArtifacts records created');
        }
        console.log(`   ✅ ${genArtifacts.length} generatedArtifacts records created`);

        await cleanup(projectId, userId);
        console.log('\n✅ Test passed! ArtifactGenerator is working correctly.');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        await cleanup(projectId, userId);
        process.exit(1);
    }
}

main();
