import { db } from '../db';
import {
  projects,
  users,
  projectCostTracking,
  costLineItems,
  userMonthlyBilling,
  type CostLineItem,
  type ProjectCostTracking
} from '@shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import type { CostBreakdown } from '@shared/schema';
import { getPricingDataService } from './pricing-data-service';
import { nanoid } from 'nanoid';

/**
 * Enhanced Cost Tracking Service (3-Table Architecture)
 *
 * Architecture:
 * - projectCostTracking: Aggregated costs per project
 * - costLineItems: Detailed transaction log with pricing snapshots
 * - userMonthlyBilling: Monthly billing summaries
 *
 * Dual-Write Pattern:
 * - Writes to both new tables AND old project fields for backward compatibility
 * - Allows gradual migration and rollback capability
 */
export class CostTrackingService {
    private static instance: CostTrackingService;

    private constructor() { }

    static getInstance(): CostTrackingService {
        if (!CostTrackingService.instance) {
            CostTrackingService.instance = new CostTrackingService();
        }
        return CostTrackingService.instance;
    }

    /**
     * Calculate estimated cost for an analysis plan based on current admin pricing
     */
    async calculateEstimatedCost(projectId: string, planData: any): Promise<CostBreakdown> {
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, project.userId));

        if (!user) {
            throw new Error(`User for project ${projectId} not found`);
        }

        const pricingService = getPricingDataService();
        const tierId = user.subscriptionTier || 'trial';

        // 1. Calculate Base Journey Cost
        const baseCost = await pricingService.calculateJourneyCost(tierId, project.journeyType);

        // 2. Calculate Data Volume Cost
        const dataSizeMB = planData.dataAssessment?.sizeMB || 0;
        const dataCost = await pricingService.calculateOverageCost(tierId, 'dataPerMB', Math.max(0, dataSizeMB));

        // 3. Calculate AI Insights Cost
        const complexity = planData.complexity || 'medium';
        const estimatedQueries = complexity === 'high' ? 20 : complexity === 'medium' ? 10 : 5;
        const aiCost = await pricingService.calculateOverageCost(tierId, 'aiQueryCost', estimatedQueries);

        // 4. Calculate Visualization Cost
        const estimatedVisualizations = planData.visualizations?.length || 5;
        const vizCost = await pricingService.calculateOverageCost(tierId, 'visualizationCost', estimatedVisualizations);

        // 5. Calculate Analysis Component Cost
        const estimatedComponents = planData.analysisSteps?.length || 3;
        const analysisCost = await pricingService.calculateOverageCost(tierId, 'statistical_analysis', estimatedComponents);

        const total = baseCost + dataCost + aiCost + vizCost + analysisCost;

        return {
            total: parseFloat(total.toFixed(2)),
            breakdown: {
                base_journey: parseFloat(baseCost.toFixed(2)),
                data_processing: parseFloat(dataCost.toFixed(2)),
                ai_insights: parseFloat(aiCost.toFixed(2)),
                visualizations: parseFloat(vizCost.toFixed(2)),
                analysis_components: parseFloat(analysisCost.toFixed(2))
            }
        };
    }

    /**
     * Lock estimated cost when plan is approved
     * Creates projectCostTracking record for the project
     */
    async lockEstimatedCost(
        projectId: string,
        estimatedCost: CostBreakdown
    ): Promise<void> {
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, project.userId));

        if (!user) {
            throw new Error(`User for project ${projectId} not found`);
        }

        // Dual-write: Update old project fields (backward compatibility)
        // CRITICAL FIX: Also save to journeyProgress.lockedCostEstimate (SSOT)
        const existingProgress = (project as any).journeyProgress || {};
        const updatedProgress = {
            ...existingProgress,
            lockedCostEstimate: estimatedCost.total,
            costBreakdown: estimatedCost,
            costLockedAt: new Date().toISOString()
        };

        await db
            .update(projects)
            .set({
                lockedCostEstimate: estimatedCost.total.toString(),
                costBreakdown: estimatedCost,
                journeyProgress: updatedProgress,
                updatedAt: new Date()
            } as any)
            .where(eq(projects.id, projectId));

        console.log(`💰 [Cost Tracking] Saved locked cost to both project.lockedCostEstimate AND journeyProgress.lockedCostEstimate: $${estimatedCost.total}`);

        // NEW: Create projectCostTracking record
        const now = new Date();
        const periodStart = now;
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await db.insert(projectCostTracking).values({
            id: nanoid(),
            projectId,
            userId: project.userId,
            dataProcessingCost: Math.round((estimatedCost.breakdown.data_processing || 0) * 100), // Convert to cents
            aiQueryCost: Math.round((estimatedCost.breakdown.ai_insights || 0) * 100),
            analysisExecutionCost: Math.round((estimatedCost.breakdown.analysis_components || 0) * 100),
            visualizationCost: Math.round((estimatedCost.breakdown.visualizations || 0) * 100),
            exportCost: 0,
            collaborationCost: 0,
            totalCost: Math.round(estimatedCost.total * 100), // Convert to cents
            journeyType: project.journeyType,
            subscriptionTier: user.subscriptionTier || 'trial',
            billingCycle: 'monthly',
            periodStart,
            periodEnd,
            createdAt: now,
            updatedAt: now
        }).onConflictDoNothing(); // In case it already exists

        console.log(`✅ Locked cost estimate for project ${projectId}: $${estimatedCost.total}`);
    }

    /**
     * Add actual cost to project total
     * Records detailed line item AND updates aggregated tracking
     */
    async addCost(
        projectId: string,
        category: string,
        amount: number,
        description: string,
        metadata: Record<string, any> = {}
    ): Promise<void> {
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, project.userId));

        if (!user) {
            throw new Error(`User for project ${projectId} not found`);
        }

        // Get current pricing snapshot for audit trail
        const pricingService = getPricingDataService();
        const tierId = user.subscriptionTier || 'trial';
        const tierPricing = await pricingService.getTierPricing(tierId);

        const amountInCents = Math.round(amount * 100);

        // 1. Create detailed line item
        await db.insert(costLineItems).values({
            id: nanoid(),
            projectId,
            userId: project.userId,
            category,
            description,
            unitCost: amountInCents,
            quantity: 1,
            totalCost: amountInCents,
            pricingTierId: tierId,
            pricingRuleId: category,
            pricingSnapshot: tierPricing, // Store full pricing config
            metadata,
            incurredAt: new Date()
        });

        // 2. Update aggregated project cost tracking
        const [tracking] = await db
            .select()
            .from(projectCostTracking)
            .where(eq(projectCostTracking.projectId, projectId))
            .limit(1);

        if (tracking) {
            // Map category to specific cost field
            const categoryFieldMap: Record<string, string> = {
                'data_processing': 'dataProcessingCost',
                'ai_insights': 'aiQueryCost',
                'ai_query': 'aiQueryCost',
                'analysis_execution': 'analysisExecutionCost',
                'analysis_components': 'analysisExecutionCost',
                'visualizations': 'visualizationCost',
                'visualization': 'visualizationCost',
                'export': 'exportCost',
                'collaboration': 'collaborationCost'
            };

            const field = categoryFieldMap[category] || 'analysisExecutionCost';

            await db
                .update(projectCostTracking)
                .set({
                    [field]: sql`${projectCostTracking[field as keyof typeof projectCostTracking]} + ${amountInCents}`,
                    totalCost: sql`${projectCostTracking.totalCost} + ${amountInCents}`,
                    updatedAt: new Date()
                })
                .where(eq(projectCostTracking.id, tracking.id));
        }

        // 3. Dual-write: Update old project fields (backward compatibility)
        const currentTotal = parseFloat(project.totalCostIncurred || '0');
        const newTotal = currentTotal + amount;

        const currentBreakdown = (project.costBreakdown as CostBreakdown) || {
            total: 0,
            breakdown: {}
        };

        const updatedBreakdown: CostBreakdown = {
            total: newTotal,
            breakdown: {
                ...currentBreakdown.breakdown,
                [category]: (currentBreakdown.breakdown[category] || 0) + amount
            }
        };

        await db
            .update(projects)
            .set({
                totalCostIncurred: newTotal.toString(),
                costBreakdown: updatedBreakdown,
                updatedAt: new Date()
            })
            .where(eq(projects.id, projectId));

        console.log(`✅ Added $${amount} to project ${projectId} for ${category}: ${description}`);
    }

    /**
     * Calculate and track execution cost based on actual results
     *
     * ✅ FIX: Use locked cost estimate if available (user already paid)
     * Only recalculate for logging/auditing, don't override the paid amount
     */
    async trackExecutionCost(projectId: string, results: any): Promise<void> {
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

        if (!project) return;

        // ✅ FIX: Check for locked cost estimate first (SSOT: journeyProgress.lockedCostEstimate)
        const journeyProgress = (project as any).journeyProgress || {};
        const lockedCost = journeyProgress.lockedCostEstimate
            || parseFloat((project as any).lockedCostEstimate || '0');

        if (lockedCost > 0) {
            // User already paid the locked amount - don't recalculate
            // Just update the totalCostIncurred to match the locked amount
            console.log(`✅ [Cost Tracking] Using locked cost for project ${projectId}: $${lockedCost.toFixed(2)}`);

            await db
                .update(projects)
                .set({
                    totalCostIncurred: lockedCost.toString(),
                    updatedAt: new Date()
                })
                .where(eq(projects.id, projectId));

            return;
        }

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, project.userId));

        if (!user) return;

        const pricingService = getPricingDataService();
        const tierId = user.subscriptionTier || 'trial';

        // Calculate actual costs based on results (only if no locked cost)
        console.log(`⚠️ [Cost Tracking] No locked cost found, calculating from execution results`);
        const costs: Array<{ category: string; amount: number; description: string }> = [];

        // 1. Data Processing Cost
        if (results.dataSize) {
            const sizeMB = results.dataSize / (1024 * 1024);
            const cost = await pricingService.calculateOverageCost(tierId, 'dataPerMB', sizeMB);
            if (cost > 0) {
                costs.push({
                    category: 'data_processing',
                    amount: cost,
                    description: `Data processing: ${sizeMB.toFixed(2)} MB`
                });
            }
        }

        // 2. AI Insights Cost
        if (results.insights?.length) {
            const cost = await pricingService.calculateOverageCost(tierId, 'aiQueryCost', results.insights.length);
            if (cost > 0) {
                costs.push({
                    category: 'ai_query',
                    amount: cost,
                    description: `AI insights: ${results.insights.length} queries`
                });
            }
        }

        // 3. Visualization Cost
        if (results.visualizations?.length) {
            const cost = await pricingService.calculateOverageCost(tierId, 'visualizationCost', results.visualizations.length);
            if (cost > 0) {
                costs.push({
                    category: 'visualization',
                    amount: cost,
                    description: `Visualizations: ${results.visualizations.length} charts`
                });
            }
        }

        // Record each cost as a separate line item
        for (const { category, amount, description } of costs) {
            await this.addCost(
                projectId,
                category,
                parseFloat(amount.toFixed(2)),
                description,
                {
                    executionResults: {
                        dataSize: results.dataSize,
                        insightsCount: results.insights?.length || 0,
                        visualizationsCount: results.visualizations?.length || 0
                    }
                }
            );
        }
    }

    /**
     * Get cost summary for project
     * Reads from new projectCostTracking table with fallback to old fields
     */
    async getCostSummary(projectId: string): Promise<{
        estimated: number;
        spent: number;
        remaining: number;
        breakdown: Record<string, number>;
        detailedBreakdown?: {
            dataProcessing: number;
            aiQuery: number;
            analysisExecution: number;
            visualization: number;
            export: number;
            collaboration: number;
        };
    }> {
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        // Try to get from new table first
        const [tracking] = await db
            .select()
            .from(projectCostTracking)
            .where(eq(projectCostTracking.projectId, projectId))
            .limit(1);

        let spent = 0;
        let detailedBreakdown;

        if (tracking) {
            // Use new table data (convert from cents to dollars)
            spent = tracking.totalCost / 100;
            detailedBreakdown = {
                dataProcessing: tracking.dataProcessingCost / 100,
                aiQuery: tracking.aiQueryCost / 100,
                analysisExecution: tracking.analysisExecutionCost / 100,
                visualization: tracking.visualizationCost / 100,
                export: tracking.exportCost / 100,
                collaboration: tracking.collaborationCost / 100
            };
        } else {
            // Fallback to old project fields
            spent = parseFloat(project.totalCostIncurred || '0');
        }

        const estimated = parseFloat(project.lockedCostEstimate || '0');
        const remaining = Math.max(0, estimated - spent);

        const costBreakdown = (project.costBreakdown as CostBreakdown) || {
            total: 0,
            breakdown: {}
        };

        return {
            estimated,
            spent,
            remaining,
            breakdown: costBreakdown.breakdown,
            detailedBreakdown
        };
    }

    /**
     * Get detailed line items for a project
     */
    async getProjectLineItems(
        projectId: string,
        options?: {
            category?: string;
            startDate?: Date;
            endDate?: Date;
            limit?: number;
        }
    ): Promise<CostLineItem[]> {
        const conditions = [eq(costLineItems.projectId, projectId)];

        if (options?.category) {
            conditions.push(eq(costLineItems.category, options.category));
        }

        if (options?.startDate) {
            conditions.push(gte(costLineItems.incurredAt, options.startDate));
        }

        if (options?.endDate) {
            conditions.push(lte(costLineItems.incurredAt, options.endDate));
        }

        let query = db
            .select()
            .from(costLineItems)
            .where(and(...conditions))
            .orderBy(sql`${costLineItems.incurredAt} DESC`);

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        return await query;
    }

    /**
     * Get or create monthly billing record for a user
     */
    async getOrCreateMonthlyBilling(
        userId: string,
        billingMonth: string // Format: YYYY-MM
    ): Promise<typeof userMonthlyBilling.$inferSelect> {
        const [existing] = await db
            .select()
            .from(userMonthlyBilling)
            .where(
                and(
                    eq(userMonthlyBilling.userId, userId),
                    eq(userMonthlyBilling.billingMonth, billingMonth)
                )
            )
            .limit(1);

        if (existing) {
            return existing;
        }

        // Create new monthly billing record
        const [year, month] = billingMonth.split('-').map(Number);
        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0, 23, 59, 59);

        const [newRecord] = await db
            .insert(userMonthlyBilling)
            .values({
                id: nanoid(),
                userId,
                billingMonth,
                periodStart,
                periodEnd,
                subscriptionCost: 0,
                usageCost: 0,
                overageCost: 0,
                totalCost: 0,
                categoryBreakdown: {},
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
            })
            .returning();

        return newRecord;
    }

    /**
     * Calculate and update monthly billing summary
     * Aggregates all costs for the month
     */
    async calculateMonthlyBilling(
        userId: string,
        billingMonth: string
    ): Promise<void> {
        const monthlyBilling = await this.getOrCreateMonthlyBilling(userId, billingMonth);

        // Get all projects for this user in this billing period
        const userProjects = await db
            .select()
            .from(projectCostTracking)
            .where(
                and(
                    eq(projectCostTracking.userId, userId),
                    gte(projectCostTracking.periodStart, monthlyBilling.periodStart),
                    lte(projectCostTracking.periodStart, monthlyBilling.periodEnd)
                )
            );

        // Aggregate costs
        let totalUsageCost = 0;
        const categoryBreakdown: Record<string, number> = {};

        for (const project of userProjects) {
            totalUsageCost += project.totalCost;

            // Build category breakdown
            categoryBreakdown.dataProcessing = (categoryBreakdown.dataProcessing || 0) + project.dataProcessingCost;
            categoryBreakdown.aiQuery = (categoryBreakdown.aiQuery || 0) + project.aiQueryCost;
            categoryBreakdown.analysisExecution = (categoryBreakdown.analysisExecution || 0) + project.analysisExecutionCost;
            categoryBreakdown.visualization = (categoryBreakdown.visualization || 0) + project.visualizationCost;
            categoryBreakdown.export = (categoryBreakdown.export || 0) + project.exportCost;
            categoryBreakdown.collaboration = (categoryBreakdown.collaboration || 0) + project.collaborationCost;
        }

        // Get user's subscription cost
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        const pricingService = getPricingDataService();
        const tierPricing = user ? await pricingService.getTierPricing(user.subscriptionTier || 'trial') : null;
        const subscriptionCost = tierPricing?.basePrice ? Math.round(tierPricing.basePrice * 100) : 0;

        const totalCost = subscriptionCost + totalUsageCost;

        // Update monthly billing record
        await db
            .update(userMonthlyBilling)
            .set({
                subscriptionCost,
                usageCost: totalUsageCost,
                overageCost: totalUsageCost, // For now, all usage is overage
                totalCost,
                categoryBreakdown,
                updatedAt: new Date()
            })
            .where(eq(userMonthlyBilling.id, monthlyBilling.id));

        console.log(`✅ Updated monthly billing for user ${userId} (${billingMonth}): $${(totalCost / 100).toFixed(2)}`);
    }
}

export const costTrackingService = CostTrackingService.getInstance();
