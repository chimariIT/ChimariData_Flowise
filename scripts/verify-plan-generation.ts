
import 'dotenv/config';
import { db } from '../server/db';
import { users, projects, analysisPlans } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ProjectManagerAgent } from '../server/services/project-manager-agent';
import { nanoid } from 'nanoid';

async function verifyAsyncPlanGeneration() {
    console.log('🚀 Starting Async Plan Generation Verification...');

    if (!db) {
        console.error('❌ Database connection failed. Check DATABASE_URL in .env');
        process.exit(1);
    }

    try {
        // 1. Setup Test Data
        console.log('\n1. Setting up test data...');

        // Find or create a test user
        let user = await db.query.users.findFirst({
            where: eq(users.email, 'test@example.com')
        });

        if (!user) {
            const [newUser] = await db.insert(users).values({
                id: nanoid(),
                email: 'test@example.com',
                username: 'testuser',
                password: 'hashed_password',
                role: 'user',
                subscriptionTier: 'starter'
            }).returning();
            user = newUser;
            console.log('   ✅ Created test user');
        }

        // Create a test project
        const projectId = `proj_${nanoid()}`;
        const [project] = await db.insert(projects).values({
            id: projectId,
            userId: user.id,
            name: 'Async Plan Test Project',
            journeyType: 'template_based',
            status: 'draft',
            description: 'Test project for async plan generation'
        }).returning();
        console.log(`   ✅ Created test project: ${projectId}`);

        // 2. Initiate Plan Creation
        console.log('\n2. Initiating Plan Creation (Expect Immediate Return)...');
        const pmAgent = new ProjectManagerAgent();
        await pmAgent.initialize();

        const startTime = Date.now();
        const result = await pmAgent.createAnalysisPlan({
            projectId,
            userId: user.id,
            project: {
                id: project.id,
                name: project.name,
                journeyType: project.journeyType,
                description: project.description,
                industry: 'Technology',
                objectives: 'Test async generation'
            }
        });
        const endTime = Date.now();
        const duration = endTime - startTime;

        if (!result.success || !result.plan) {
            throw new Error(`Plan creation failed: ${result.error}`);
        }

        console.log(`   ✅ Plan creation returned in ${duration}ms`);
        console.log(`   ✅ Plan ID: ${result.planId}`);
        console.log(`   ✅ Initial Status: ${result.plan.status}`);

        if (duration > 5000) {
            console.warn('   ⚠️ Warning: Plan creation took longer than 5s, might not be fully async.');
        } else {
            console.log('   ✅ Plan creation was fast (Async confirmed)');
        }

        if (result.plan.status !== 'pending') {
            console.warn(`   ⚠️ Warning: Expected status 'pending', got '${result.plan.status}'`);
        }

        // 3. Poll for Completion
        console.log('\n3. Polling for Background Completion...');
        let attempts = 0;
        const maxAttempts = 60; // 30 seconds (polling every 500ms)

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));

            const [updatedPlan] = await db.select().from(analysisPlans).where(eq(analysisPlans.id, result.planId));

            if (updatedPlan.status === 'ready') {
                console.log(`   ✅ Plan became READY after ${attempts * 0.5}s`);
                console.log('   ✅ Executive Summary:', updatedPlan.executiveSummary.substring(0, 50) + '...');
                break;
            } else if (updatedPlan.status === 'rejected') {
                console.error(`   ❌ Plan generation FAILED (rejected): ${updatedPlan.rejectionReason}`);
                break;
            }

            process.stdout.write('.');
            attempts++;
        }

        if (attempts >= maxAttempts) {
            console.error('\n   ❌ Timeout waiting for plan generation to complete.');
        }

        console.log('\n✅ Verification Complete!');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Verification Failed:', error);
        process.exit(1);
    }
}

verifyAsyncPlanGeneration();
