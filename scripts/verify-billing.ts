
import 'dotenv/config';
import { db } from '../server/db';
import { users, projects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { CostTrackingService } from '../server/services/cost-tracking';
import { UnifiedBillingService } from '../server/services/billing/unified-billing-service';
import { nanoid } from 'nanoid';

async function verifyBilling() {
    console.log('🚀 Starting Billing Integration Verification...');

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
                password: 'hashed_password', // Mock password
                role: 'user',
                subscriptionTier: 'starter'
            }).returning();
            user = newUser;
            console.log('   ✅ Created test user');
        } else {
            console.log('   ℹ️ Using existing test user');
        }

        // Create a test project
        const projectId = `proj_${nanoid()}`;
        const [project] = await db.insert(projects).values({
            id: projectId,
            userId: user.id,
            name: 'Billing Test Project',
            journeyType: 'template_based', // Corrected to match DB constraint
            status: 'draft' // Corrected to match DB constraint
        }).returning();
        console.log(`   ✅ Created test project: ${projectId}`);

        // 2. Verify Cost Tracking
        console.log('\n2. Verifying Cost Tracking Service...');
        const costService = CostTrackingService.getInstance();

        // 2a. Calculate Estimate
        const planData = {
            dataAssessment: { sizeMB: 15 },
            complexity: 'medium',
            visualizations: ['bar', 'line', 'scatter'],
            analysisSteps: ['step1', 'step2']
        };

        console.log('   Testing calculateEstimatedCost...');
        const estimate = await costService.calculateEstimatedCost(projectId, planData);
        console.log('   ✅ Estimated Cost:', estimate);

        // 2b. Lock Estimate
        console.log('   Testing lockEstimatedCost...');
        await costService.lockEstimatedCost(projectId, estimate);

        const [projectAfterLock] = await db.select().from(projects).where(eq(projects.id, projectId));
        if (projectAfterLock.lockedCostEstimate === estimate.total.toString()) {
            console.log('   ✅ Cost locked successfully in DB');
        } else {
            console.error('   ❌ Failed to lock cost in DB');
        }

        // 2c. Track Execution Cost
        console.log('   Testing trackExecutionCost...');
        const executionResults = {
            dataSize: 15 * 1024 * 1024, // 15MB
            insights: [{ title: 'Insight 1' }, { title: 'Insight 2' }],
            visualizations: ['viz1', 'viz2']
        };

        await costService.trackExecutionCost(projectId, executionResults);

        const [projectAfterExec] = await db.select().from(projects).where(eq(projects.id, projectId));
        console.log('   ✅ Total Cost Incurred:', projectAfterExec.totalCostIncurred);
        console.log('   ✅ Cost Breakdown:', JSON.stringify(projectAfterExec.costBreakdown, null, 2));

        // 3. Verify Payment Intent
        console.log('\n3. Verifying Payment Intent (UnifiedBillingService)...');

        if (!process.env.STRIPE_SECRET_KEY) {
            console.warn('   ⚠️ STRIPE_SECRET_KEY not found. Skipping actual Stripe call.');
        } else {
            try {
                const billingService = new UnifiedBillingService({
                    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
                    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock'
                });

                console.log('   Testing createCheckoutSession...');
                const session = await billingService.createCheckoutSession(
                    projectId,
                    user.id,
                    50.00,
                    'USD'
                );
                console.log('   ✅ Checkout Session Created:', session.url);
            } catch (error: any) {
                console.error('   ❌ Stripe Call Failed (Expected if key is invalid/test):', error.message);
            }
        }

        console.log('\n✅ Verification Complete!');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Verification Failed:', error);
        process.exit(1);
    }
}

verifyBilling();
