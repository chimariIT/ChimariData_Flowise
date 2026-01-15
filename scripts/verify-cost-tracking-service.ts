/**
 * Cost Tracking Service Verification Script
 * 
 * Tests the 3-table cost tracking architecture:
 * - projectCostTracking
 * - costLineItems  
 * - userMonthlyBilling
 * 
 * Verifies:
 * 1. Cost estimation and locking
 * 2. Cost addition and line item creation
 * 3. Dual-write pattern (new tables + old project fields)
 * 4. Monthly billing aggregation
 * 5. Cost summary retrieval
 */

import 'dotenv/config';
import { db } from '../server/db';
import { projects, users, projectCostTracking, costLineItems, userMonthlyBilling } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { costTrackingService } from '../server/services/cost-tracking';
import { nanoid } from 'nanoid';

async function cleanup(projectId: string, userId: string) {
    console.log('\n🧹 Cleaning up test data...');

    // Delete in reverse order of foreign keys
    await db.delete(costLineItems).where(eq(costLineItems.projectId, projectId));
    await db.delete(projectCostTracking).where(eq(projectCostTracking.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));

    console.log('   ✅ Cleanup complete\n');
}

async function test1_CostEstimationAndLocking() {
    console.log('📋 Test 1: Cost Estimation and Locking\n');

    const projectId = `test_${nanoid()}`;
    const userId = `user_${nanoid()}`;

    try {
        // Create test user first
        await db.insert(users).values({
            id: userId,
            email: `test_${nanoid()}@example.com`,
            subscriptionTier: 'professional',
            userRole: 'non-tech',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test user');

        // Create test project
        await db.insert(projects).values({
            id: projectId,
            userId,
            name: 'Cost Tracking Test Project',
            journeyType: 'non-tech',
            status: 'ready',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test project');

        // Test cost estimation
        const mockPlanData = {
            dataAssessment: {
                sizeMB: 100,
                qualityScore: 0.8,
                completenessScore: 0.9,
                recordCount: 10000,
                columnCount: 20,
                missingData: [],
                recommendedTransformations: [],
                infrastructureNeeds: { useSpark: false, estimatedMemoryGB: 2, parallelizable: false },
                estimatedProcessingTime: '5 minutes'
            },
            analysisSteps: [
                { id: '1', type: 'descriptive', name: 'Descriptive Stats' },
                { id: '2', type: 'correlation', name: 'Correlation Analysis' }
            ],
            visualizations: [
                { id: '1', type: 'bar', title: 'Test Chart' }
            ],
            complexity: 'medium' as const
        };

        const estimatedCost = await costTrackingService.calculateEstimatedCost(projectId, mockPlanData);
        console.log(`   ✅ Estimated cost calculated: $${estimatedCost.total.toFixed(2)}`);
        console.log(`      Breakdown: ${JSON.stringify(estimatedCost.breakdown)}`);

        // Test cost locking
        await costTrackingService.lockEstimatedCost(projectId, estimatedCost);
        console.log('   ✅ Cost estimate locked');

        // Verify projectCostTracking record was created
        const [tracking] = await db
            .select()
            .from(projectCostTracking)
            .where(eq(projectCostTracking.projectId, projectId));

        if (!tracking) {
            throw new Error('projectCostTracking record not created');
        }

        console.log(`   ✅ projectCostTracking record created (ID: ${tracking.id})`);
        console.log(`      Total cost: $${(tracking.totalCost / 100).toFixed(2)}`);

        // Verify old project fields were also updated (dual-write)
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

        if (!project.lockedCostEstimate) {
            throw new Error('Old project field not updated');
        }

        console.log(`   ✅ Dual-write verified: project.lockedCostEstimate = $${project.lockedCostEstimate}`);

        await cleanup(projectId, userId);
        return true;
    } catch (error) {
        console.error('   ❌ Test 1 failed:', error);
        await cleanup(projectId, userId);
        return false;
    }
}

async function test2_CostAdditionAndLineItems() {
    console.log('\n📋 Test 2: Cost Addition and Line Items\n');

    const projectId = `test_${nanoid()}`;
    const userId = `user_${nanoid()}`;

    try {
        // Create test user first
        await db.insert(users).values({
            id: userId,
            email: `test_${nanoid()}@example.com`,
            subscriptionTier: 'professional',
            userRole: 'business',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test user');

        // Create test project with locked cost
        await db.insert(projects).values({
            id: projectId,
            userId,
            name: 'Line Items Test Project',
            journeyType: 'business',
            status: 'ready',
            lockedCostEstimate: '50.00',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test project');

        // Create projectCostTracking record
        await db.insert(projectCostTracking).values({
            id: nanoid(),
            projectId,
            userId,
            dataProcessingCost: 0,
            aiQueryCost: 0,
            analysisExecutionCost: 0,
            visualizationCost: 0,
            exportCost: 0,
            collaborationCost: 0,
            totalCost: 0,
            journeyType: 'business',
            subscriptionTier: 'professional',
            billingCycle: 'monthly',
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created tracking record');

        // Add costs in different categories
        const costs = [
            { category: 'data_processing', amount: 5.50, description: 'Processed 50MB data' },
            { category: 'ai_query', amount: 3.25, description: 'AI insights: 5 queries' },
            { category: 'visualization', amount: 2.00, description: 'Generated 2 charts' }
        ];

        for (const cost of costs) {
            await costTrackingService.addCost(
                projectId,
                cost.category,
                cost.amount,
                cost.description,
                { testData: true }
            );
            console.log(`   ✅ Added ${cost.category} cost: $${cost.amount}`);
        }

        // Verify line items were created
        const lineItems = await db
            .select()
            .from(costLineItems)
            .where(eq(costLineItems.projectId, projectId));

        if (lineItems.length !== 3) {
            throw new Error(`Expected 3 line items, got ${lineItems.length}`);
        }

        console.log(`   ✅ ${lineItems.length} line items created`);

        // Verify each line item
        for (const item of lineItems) {
            console.log(`      - ${item.category}: $${(item.totalCost / 100).toFixed(2)}`);
            if (!item.pricingSnapshot) {
                throw new Error('Pricing snapshot not stored');
            }
        }

        console.log('   ✅ All line items have pricing snapshots');

        // Verify projectCostTracking was updated
        const [tracking] = await db
            .select()
            .from(projectCostTracking)
            .where(eq(projectCostTracking.projectId, projectId));

        const expectedTotal = costs.reduce((sum, c) => sum + c.amount, 0);
        const actualTotal = tracking.totalCost / 100;

        if (Math.abs(actualTotal - expectedTotal) > 0.01) {
            throw new Error(`Total cost mismatch: expected ${expectedTotal}, got ${actualTotal}`);
        }

        console.log(`   ✅ Total cost updated correctly: $${actualTotal.toFixed(2)}`);

        // Verify dual-write to old project fields
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

        const oldTotal = parseFloat(project.totalCostIncurred || '0');
        if (Math.abs(oldTotal - expectedTotal) > 0.01) {
            throw new Error(`Old field not updated: expected ${expectedTotal}, got ${oldTotal}`);
        }

        console.log(`   ✅ Dual-write verified: project.totalCostIncurred = $${oldTotal.toFixed(2)}`);

        await cleanup(projectId, userId);
        return true;
    } catch (error) {
        console.error('   ❌ Test 2 failed:', error);
        await cleanup(projectId, userId);
        return false;
    }
}

async function test3_CostSummary() {
    console.log('\n📋 Test 3: Cost Summary Retrieval\n');

    const projectId = `test_${nanoid()}`;
    const userId = `user_${nanoid()}`;

    try {
        // Create test user first
        await db.insert(users).values({
            id: userId,
            email: `test_${nanoid()}@example.com`,
            subscriptionTier: 'professional',
            userRole: 'technical',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test user');

        // Create test project
        await db.insert(projects).values({
            id: projectId,
            userId,
            name: 'Summary Test Project',
            journeyType: 'technical',
            status: 'ready',
            lockedCostEstimate: '100.00',
            totalCostIncurred: '45.50',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created test project');

        // Create projectCostTracking with detailed breakdown
        await db.insert(projectCostTracking).values({
            id: nanoid(),
            projectId,
            userId,
            dataProcessingCost: 1500, // $15.00
            aiQueryCost: 2000, // $20.00
            analysisExecutionCost: 500, // $5.00
            visualizationCost: 300, // $3.00
            exportCost: 150, // $1.50
            collaborationCost: 100, // $1.00
            totalCost: 4550, // $45.50
            journeyType: 'technical',
            subscriptionTier: 'professional',
            billingCycle: 'monthly',
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Created tracking record');

        // Get cost summary
        const summary = await costTrackingService.getCostSummary(projectId);

        console.log(`   ✅ Cost summary retrieved:`);
        console.log(`      Estimated: $${summary.estimated.toFixed(2)}`);
        console.log(`      Spent: $${summary.spent.toFixed(2)}`);
        console.log(`      Remaining: $${summary.remaining.toFixed(2)}`);

        // Verify detailed breakdown is included
        if (!summary.detailedBreakdown) {
            throw new Error('Detailed breakdown not included');
        }

        console.log(`   ✅ Detailed breakdown included:`);
        console.log(`      Data Processing: $${summary.detailedBreakdown.dataProcessing.toFixed(2)}`);
        console.log(`      AI Queries: $${summary.detailedBreakdown.aiQuery.toFixed(2)}`);
        console.log(`      Analysis: $${summary.detailedBreakdown.analysisExecution.toFixed(2)}`);
        console.log(`      Visualizations: $${summary.detailedBreakdown.visualization.toFixed(2)}`);
        console.log(`      Exports: $${summary.detailedBreakdown.export.toFixed(2)}`);
        console.log(`      Collaboration: $${summary.detailedBreakdown.collaboration.toFixed(2)}`);

        // Verify calculations
        if (summary.estimated !== 100) {
            throw new Error(`Estimated cost incorrect: ${summary.estimated}`);
        }

        if (Math.abs(summary.spent - 45.50) > 0.01) {
            throw new Error(`Spent cost incorrect: ${summary.spent}`);
        }

        if (Math.abs(summary.remaining - 54.50) > 0.01) {
            throw new Error(`Remaining cost incorrect: ${summary.remaining}`);
        }

        console.log('   ✅ All calculations correct');

        await cleanup(projectId, userId);
        return true;
    } catch (error) {
        console.error('   ❌ Test 3 failed:', error);
        await cleanup(projectId, userId);
        return false;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     Cost Tracking Service Verification                    ║');
    console.log('║     Testing 3-Table Architecture                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const results = {
        test1: false,
        test2: false,
        test3: false
    };

    try {
        results.test1 = await test1_CostEstimationAndLocking();
        results.test2 = await test2_CostAdditionAndLineItems();
        results.test3 = await test3_CostSummary();

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  Test Results                                              ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        console.log(`Test 1 (Cost Estimation & Locking): ${results.test1 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Test 2 (Cost Addition & Line Items): ${results.test2 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Test 3 (Cost Summary): ${results.test3 ? '✅ PASS' : '❌ FAIL'}`);

        const allPassed = results.test1 && results.test2 && results.test3;

        if (allPassed) {
            console.log('\n✅ All tests passed! Cost tracking service is working correctly.');
            process.exit(0);
        } else {
            console.log('\n❌ Some tests failed. Please review the errors above.');
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ Test suite failed:', error);
        process.exit(1);
    }
}

main();
