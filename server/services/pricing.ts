export interface AnalysisCost {
    baseCost: number;
    dataSizeCost: number;
    complexityCost: number;
    totalCost: number;
    currency: string;
}

export interface MLCost {
    baseCost: number;
    autoMLCost: number;
    explainabilityCost: number;
    totalCost: number;
    billingUnits: number;
    currency: string;
}

export interface LLMCost {
    baseCost: number;
    methodMultiplier: number;
    totalCost: number;
    billingUnits: number;
    currency: string;
}

// Import shared pricing constants for consistency (used as seed/fallback only)
import { PRICING_CONSTANTS, getAnalysisTypeFactor as getStaticTypeFactor, getRecordCountMultiplier as getStaticRecordMultiplier } from '../../shared/pricing-config';
import { db } from '../db';
import { analysisPricingConfig, servicePricing, subscriptionTierPricing } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// Row types from DB tables
type ServicePricingRow = typeof servicePricing.$inferSelect;
type SubscriptionTierRow = typeof subscriptionTierPricing.$inferSelect;

// PHASE 6: Admin-configurable analysis pricing
import type { AnalysisTypePricing, VolumeTierThreshold } from '../../shared/pricing-config';
import { DEFAULT_ANALYSIS_TYPE_PRICING, DEFAULT_DATA_VOLUME_TIERS } from '../../shared/pricing-config';

export interface AnalysisPricingConfig {
    baseCost: number;                        // Base cost for any analysis (legacy, $)
    dataSizeCostPer1K: number;               // Cost per 1000 records (legacy, $)
    platformFee: number;                     // Platform fee ($25 from service_pricing)
    complexityMultipliers: {
        basic: number;
        intermediate: number;
        advanced: number;
    };
    analysisTypeFactors: {                   // Legacy: type multipliers
        statistical: number;
        machine_learning: number;
        visualization: number;
        business_intelligence: number;
        time_series: number;
        correlation: number;
        regression: number;
        clustering: number;
        sentiment: number;
        default: number;
    };
    /** Tiered per-type pricing matrix (new model). When present, overrides legacy formula. */
    analysisTypePricing?: AnalysisTypePricing;
    /** Data volume tier thresholds for tiered pricing. */
    dataVolumeTiers?: Record<string, VolumeTierThreshold>;
}

// Default pricing configuration - uses shared PRICING_CONSTANTS for consistency
const DEFAULT_PRICING_CONFIG: AnalysisPricingConfig = {
    baseCost: PRICING_CONSTANTS.baseAnalysisCost,               // $5.00 (legacy fallback)
    dataSizeCostPer1K: PRICING_CONSTANTS.dataProcessingPer1K,   // $0.10 (legacy)
    platformFee: PRICING_CONSTANTS.basePlatformFee,             // $25.00 (from service_pricing)
    complexityMultipliers: {
        basic: PRICING_CONSTANTS.complexityMultipliers.basic,           // 1.0
        intermediate: PRICING_CONSTANTS.complexityMultipliers.intermediate, // 1.5
        advanced: PRICING_CONSTANTS.complexityMultipliers.advanced       // 2.5
    },
    analysisTypeFactors: {
        statistical: PRICING_CONSTANTS.analysisTypeFactors.statistical || 1.2,
        machine_learning: PRICING_CONSTANTS.analysisTypeFactors.machine_learning || 3.0,
        visualization: PRICING_CONSTANTS.analysisTypeFactors.visualization || 0.8,
        business_intelligence: PRICING_CONSTANTS.analysisTypeFactors.business_intelligence || 2.2,
        time_series: PRICING_CONSTANTS.analysisTypeFactors.time_series || 1.8,
        correlation: PRICING_CONSTANTS.analysisTypeFactors.correlation || 1.2,
        regression: PRICING_CONSTANTS.analysisTypeFactors.regression || 1.6,
        clustering: PRICING_CONSTANTS.analysisTypeFactors.clustering || 1.5,
        sentiment: PRICING_CONSTANTS.analysisTypeFactors.sentiment || 1.8,
        default: PRICING_CONSTANTS.analysisTypeFactors.default || 1.0
    },
    // Tiered pricing (new model)
    analysisTypePricing: DEFAULT_ANALYSIS_TYPE_PRICING,
    dataVolumeTiers: DEFAULT_DATA_VOLUME_TIERS,
};

export class PricingService {
    // In-memory cache of pricing config (loaded from DB, falls back to defaults)
    private static pricingConfig: AnalysisPricingConfig = { ...DEFAULT_PRICING_CONFIG };
    private static dbLoaded = false;
    // Bug #12 fix: Track when pricing was last updated so API can include a version/timestamp.
    // Frontend can compare this to detect stale cached pricing.
    private static lastUpdatedAt: string = new Date().toISOString();

    // Service pricing cache (pay-per-analysis, expert-consultation, etc.)
    private static servicePricingCache: Map<string, ServicePricingRow> = new Map();
    // Subscription tier cache
    private static subscriptionTierCache: Map<string, SubscriptionTierRow> = new Map();

    // Legacy static costFactors for backwards compatibility
    private static costFactors = {
        'statistical': 1.0,
        'machine_learning': 2.5,
        'visualization': 0.5,
        'business_intelligence': 1.5,
        'time_series': 2.0,
        'default': 1.0
    };

    /**
     * Load pricing config from DB on startup. Falls back to PRICING_CONSTANTS defaults.
     * Called once at server initialization.
     */
    static async loadFromDatabase(): Promise<void> {
        try {
            const [row] = await db.select().from(analysisPricingConfig)
                .where(eq(analysisPricingConfig.id, 'default'))
                .limit(1);

            if (row && row.config && typeof row.config === 'object') {
                const dbConfig = row.config as Partial<AnalysisPricingConfig>;
                this.pricingConfig = {
                    ...DEFAULT_PRICING_CONFIG,
                    ...dbConfig,
                    complexityMultipliers: {
                        ...DEFAULT_PRICING_CONFIG.complexityMultipliers,
                        ...(dbConfig.complexityMultipliers || {})
                    },
                    analysisTypeFactors: {
                        ...DEFAULT_PRICING_CONFIG.analysisTypeFactors,
                        ...(dbConfig.analysisTypeFactors || {})
                    },
                    // Tiered pricing: use DB values if present and non-empty, else defaults
                    // GUARD: empty objects {} are truthy but have 0 keys — fall back to defaults
                    analysisTypePricing: (dbConfig.analysisTypePricing &&
                        typeof dbConfig.analysisTypePricing === 'object' &&
                        Object.keys(dbConfig.analysisTypePricing).length > 0)
                        ? dbConfig.analysisTypePricing : DEFAULT_PRICING_CONFIG.analysisTypePricing,
                    dataVolumeTiers: (dbConfig.dataVolumeTiers &&
                        typeof dbConfig.dataVolumeTiers === 'object' &&
                        Object.keys(dbConfig.dataVolumeTiers).length > 0)
                        ? dbConfig.dataVolumeTiers : DEFAULT_PRICING_CONFIG.dataVolumeTiers,
                };
                this.syncLegacyCostFactors();
                console.log(`💲 [PricingService] Loaded pricing config from database (tieredPricing=${!!this.pricingConfig.analysisTypePricing})`);
            } else {
                // No DB row yet - seed with defaults
                await this.seedDefaults();
                console.log('💲 [PricingService] Seeded default pricing config to database');
            }
            this.dbLoaded = true;
        } catch (error) {
            console.warn('⚠️ [PricingService] Could not load from DB, using in-memory defaults:', (error as Error).message);
            this.dbLoaded = false;
        }

        // Load service pricing and subscription tiers in parallel
        await Promise.allSettled([
            this.refreshServicePricing(),
            this.refreshSubscriptionTiers()
        ]);
    }

    /**
     * Seed default pricing config to DB (first run)
     */
    private static async seedDefaults(): Promise<void> {
        try {
            await db.insert(analysisPricingConfig).values({
                id: 'default',
                config: DEFAULT_PRICING_CONFIG as any,
                updatedAt: new Date(),
                updatedBy: 'system'
            }).onConflictDoNothing();
        } catch (error) {
            console.warn('[PricingService] Seed defaults failed:', (error as Error).message);
        }
    }

    /**
     * P1-9 FIX: Refresh pricing config from database.
     * Call this after admin pricing updates to invalidate the in-memory cache.
     */
    static async refreshFromDatabase(): Promise<void> {
        console.log('🔄 [PricingService] Refreshing pricing config from database...');
        this.dbLoaded = false;
        await this.loadFromDatabase();
        this.lastUpdatedAt = new Date().toISOString();
        console.log(`✅ [PricingService] Pricing config refreshed from database (version: ${this.lastUpdatedAt})`);
    }

    /**
     * Get current pricing configuration (for admin UI)
     */
    static getPricingConfig(): AnalysisPricingConfig {
        return { ...this.pricingConfig };
    }

    /**
     * Bug #12 fix: Get the timestamp of the last pricing update.
     * Include this in API responses so the frontend can detect stale pricing.
     */
    static getLastUpdatedAt(): string {
        return this.lastUpdatedAt;
    }

    /**
     * Update pricing configuration (from admin UI) - persists to DB
     */
    static updatePricingConfig(newConfig: Partial<AnalysisPricingConfig>): AnalysisPricingConfig {
        this.pricingConfig = {
            ...this.pricingConfig,
            ...newConfig,
            complexityMultipliers: {
                ...this.pricingConfig.complexityMultipliers,
                ...(newConfig.complexityMultipliers || {})
            },
            analysisTypeFactors: {
                ...this.pricingConfig.analysisTypeFactors,
                ...(newConfig.analysisTypeFactors || {})
            },
            // Tiered pricing: merge if provided, otherwise keep current
            analysisTypePricing: newConfig.analysisTypePricing !== undefined
                ? newConfig.analysisTypePricing
                : this.pricingConfig.analysisTypePricing,
            dataVolumeTiers: newConfig.dataVolumeTiers !== undefined
                ? newConfig.dataVolumeTiers
                : this.pricingConfig.dataVolumeTiers,
        };

        this.syncLegacyCostFactors();
        const hasTiered = !!this.pricingConfig.analysisTypePricing;
        console.log(`✅ [PricingService] Updated pricing config (tieredPricing=${hasTiered}, platformFee=$${this.pricingConfig.platformFee})`);

        // Persist to DB (non-blocking)
        this.persistToDatabase().catch(err =>
            console.error('[PricingService] Failed to persist config to DB:', err.message)
        );

        return this.getPricingConfig();
    }

    /**
     * Persist current config to database
     */
    private static async persistToDatabase(): Promise<void> {
        try {
            const existing = await db.select({ id: analysisPricingConfig.id })
                .from(analysisPricingConfig)
                .where(eq(analysisPricingConfig.id, 'default'))
                .limit(1);

            if (existing.length > 0) {
                await db.update(analysisPricingConfig)
                    .set({
                        config: this.pricingConfig as any,
                        updatedAt: new Date()
                    })
                    .where(eq(analysisPricingConfig.id, 'default'));
            } else {
                await db.insert(analysisPricingConfig).values({
                    id: 'default',
                    config: this.pricingConfig as any,
                    updatedAt: new Date(),
                    updatedBy: 'admin'
                });
            }
        } catch (error) {
            throw error;
        }
    }

    private static syncLegacyCostFactors(): void {
        this.costFactors = {
            statistical: this.pricingConfig.analysisTypeFactors.statistical,
            machine_learning: this.pricingConfig.analysisTypeFactors.machine_learning,
            visualization: this.pricingConfig.analysisTypeFactors.visualization,
            business_intelligence: this.pricingConfig.analysisTypeFactors.business_intelligence,
            time_series: this.pricingConfig.analysisTypeFactors.time_series,
            default: this.pricingConfig.analysisTypeFactors.default
        };
    }

    /**
     * Reset pricing to defaults and persist
     */
    static resetPricingConfig(): AnalysisPricingConfig {
        this.pricingConfig = { ...DEFAULT_PRICING_CONFIG };
        this.syncLegacyCostFactors();

        // Persist reset to DB
        this.persistToDatabase().catch(err =>
            console.error('[PricingService] Failed to persist reset to DB:', err.message)
        );

        return this.getPricingConfig();
    }

    /**
     * Get platform fee (for cost estimate endpoint)
     */
    static getPlatformFee(): number {
        return this.pricingConfig.platformFee;
    }

    static getFreeTrialLimits() {
        return {
            maxFileSize: 1024 * 1024 * 5, // 5MB
        };
    }

    static calculateAnalysisCost(analysisType: string, recordCount: number, complexity: 'basic' | 'intermediate' | 'advanced' = 'basic'): AnalysisCost {
        // PHASE 6: Use dynamic pricing config from admin
        const config = this.pricingConfig;
        const baseCost = config.baseCost;

        // Get type factor from config (with fallback to legacy costFactors for compatibility)
        const typeFactor = (config.analysisTypeFactors as any)[analysisType]
            || this.costFactors[analysisType as keyof typeof this.costFactors]
            || config.analysisTypeFactors.default;

        // Cost based on data size (using config)
        const dataSizeCost = (recordCount / 1000) * config.dataSizeCostPer1K;

        // Cost based on complexity (using config)
        const complexityMultiplier = config.complexityMultipliers[complexity] || 1.0;
        const complexityCost = baseCost * (complexityMultiplier - 1);

        const totalCost = (baseCost + dataSizeCost) * typeFactor + complexityCost;

        return {
            baseCost,
            dataSizeCost,
            complexityCost,
            totalCost: parseFloat(totalCost.toFixed(2)),
            currency: 'USD'
        };
    }

    /**
     * Calculate ML training cost
     */
    static calculateMLCost(params: {
        toolName: string;
        datasetSize: number;
        useAutoML?: boolean;
        enableExplainability?: boolean;
        trials?: number;
        userTier: string;
    }): MLCost {
        let billingUnits = 0;
        let baseCost = 0;
        let autoMLCost = 0;
        let explainabilityCost = 0;

        // Traditional ML Pipeline
        if (params.toolName === 'comprehensive_ml_pipeline') {
            const baseUnits = Math.ceil(params.datasetSize / 10000); // 1 unit per 10K rows
            const autoMLMultiplier = params.useAutoML ? 5 : 1;
            billingUnits = baseUnits * autoMLMultiplier;

            baseCost = baseUnits * 0.10; // $0.10 per base unit
            autoMLCost = params.useAutoML ? (baseUnits * 4) * 0.10 : 0; // 4x additional cost for AutoML
            explainabilityCost = params.enableExplainability ? baseUnits * 0.05 : 0; // $0.05 per unit for explainability
        }

        // AutoML Optimizer
        else if (params.toolName === 'automl_optimizer') {
            const trials = params.trials || 50;
            billingUnits = Math.ceil(trials / 10); // 1 unit per 10 trials
            baseCost = billingUnits * 0.10;
        }

        // Library Selector
        else if (params.toolName === 'ml_library_selector') {
            billingUnits = 0.1; // Minimal cost
            baseCost = 0.01;
        }

        // Health Check
        else if (params.toolName === 'ml_health_check') {
            billingUnits = 0; // Free
            baseCost = 0;
        }

        // Apply subscription tier discount
        const tierDiscounts = {
            trial: 0,          // No discount
            starter: 0.1,      // 10% discount
            professional: 0.2, // 20% discount
            enterprise: 0.3    // 30% discount
        };

        const discount = tierDiscounts[params.userTier as keyof typeof tierDiscounts] || 0;
        const totalCost = (baseCost + autoMLCost + explainabilityCost) * (1 - discount);

        return {
            baseCost,
            autoMLCost,
            explainabilityCost,
            totalCost: parseFloat(totalCost.toFixed(2)),
            billingUnits,
            currency: 'USD'
        };
    }

    /**
     * Calculate LLM fine-tuning cost
     */
    static calculateLLMCost(params: {
        toolName: string;
        datasetSize: number;
        method?: 'full' | 'lora' | 'qlora';
        numEpochs?: number;
        userTier: string;
    }): LLMCost {
        let billingUnits = 0;
        let baseCost = 0;
        let methodMultiplier = 1;

        if (params.toolName.includes('llm')) {
            const baseCostPer1K = {
                full: 10,
                lora: 3,
                qlora: 2
            };

            const samplesInK = params.datasetSize / 1000;
            const epochs = params.numEpochs || 3;
            const methodCost = baseCostPer1K[params.method || 'qlora'];
            billingUnits = Math.ceil(methodCost * samplesInK * epochs);

            baseCost = billingUnits * 0.10; // $0.10 per billing unit
            methodMultiplier = methodCost;
        }

        // Method Recommendation
        else if (params.toolName === 'llm_method_recommendation') {
            billingUnits = 0.1; // Minimal cost
            baseCost = 0.01;
        }

        // Health Check
        else if (params.toolName === 'llm_health_check') {
            billingUnits = 0; // Free
            baseCost = 0;
        }

        // Apply subscription tier discount
        const tierDiscounts = {
            trial: 0,          // No discount
            starter: 0.1,      // 10% discount
            professional: 0.2, // 20% discount
            enterprise: 0.3    // 30% discount
        };

        const discount = tierDiscounts[params.userTier as keyof typeof tierDiscounts] || 0;
        const totalCost = baseCost * (1 - discount);

        return {
            baseCost,
            methodMultiplier,
            totalCost: parseFloat(totalCost.toFixed(2)),
            billingUnits,
            currency: 'USD'
        };
    }

    /**
     * Get ML/LLM pricing examples for different tiers
     */
    static getMLPricingExamples(): Record<string, any> {
        return {
            trial: {
                ml_training_jobs: 5,
                ml_automl_trials: 0,
                llm_fine_tuning_jobs: 0,
                example_costs: {
                    '10K rows ML training': '$0.10',
                    '100K rows ML training': '$1.00',
                    'LLM fine-tuning': 'Not available'
                }
            },
            starter: {
                ml_training_jobs: 50,
                ml_automl_trials: 0,
                llm_fine_tuning_jobs: 0,
                example_costs: {
                    '10K rows ML training': '$0.09 (10% discount)',
                    '100K rows ML training': '$0.90 (10% discount)',
                    'LLM fine-tuning': 'Not available'
                }
            },
            professional: {
                ml_training_jobs: 500,
                ml_automl_trials: 1000,
                llm_fine_tuning_jobs: 10,
                example_costs: {
                    '10K rows ML training': '$0.08 (20% discount)',
                    '100K rows ML training': '$0.80 (20% discount)',
                    'AutoML (50 trials)': '$0.40 (20% discount)',
                    'LLM QLoRA (1K samples)': '$0.48 (20% discount)',
                    'LLM LoRA (1K samples)': '$0.72 (20% discount)'
                }
            },
            enterprise: {
                ml_training_jobs: 'unlimited',
                ml_automl_trials: 'unlimited',
                llm_fine_tuning_jobs: 100,
                example_costs: {
                    '10K rows ML training': '$0.07 (30% discount)',
                    '100K rows ML training': '$0.70 (30% discount)',
                    'AutoML (50 trials)': '$0.35 (30% discount)',
                    'LLM QLoRA (1K samples)': '$0.42 (30% discount)',
                    'LLM LoRA (1K samples)': '$0.63 (30% discount)',
                    'LLM Full Fine-tuning (1K samples)': '$2.10 (30% discount)'
                }
            }
        };
    }

    // Mock createCheckoutSession removed. Use UnifiedBillingService.createCheckoutSession instead.

    // =========================================================
    // Service Pricing & Subscription Tier Cache (Phase 1)
    // =========================================================

    /**
     * Refresh service pricing cache from DB (pay-per-analysis, expert-consultation, etc.)
     */
    static async refreshServicePricing(): Promise<void> {
        try {
            const rows = await db.select().from(servicePricing);
            this.servicePricingCache.clear();
            for (const row of rows) {
                this.servicePricingCache.set(row.serviceType, row);
            }
            console.log(`💲 [PricingService] Loaded ${rows.length} service pricing rows from DB`);
        } catch (error) {
            console.warn('⚠️ [PricingService] Could not load service pricing from DB:', (error as Error).message);
        }
    }

    /**
     * Refresh subscription tier cache from DB
     */
    static async refreshSubscriptionTiers(): Promise<void> {
        try {
            const rows = await db.select().from(subscriptionTierPricing);
            this.subscriptionTierCache.clear();
            for (const row of rows) {
                this.subscriptionTierCache.set(row.id, row);
            }
            console.log(`💲 [PricingService] Loaded ${rows.length} subscription tiers from DB`);
        } catch (error) {
            console.warn('⚠️ [PricingService] Could not load subscription tiers from DB:', (error as Error).message);
        }
    }

    // --- Service Pricing Getters ---

    /**
     * Get a service price in dollars (converts from cents stored in DB).
     * Falls back to PRICING_CONSTANTS.servicePricingDefaults.
     */
    static getServicePrice(serviceType: string): number {
        const row = this.servicePricingCache.get(serviceType);
        if (row) return row.basePrice / 100;
        // Fallback
        const key = serviceType.replace(/-/g, '') as string;
        if (serviceType === 'pay-per-analysis') return PRICING_CONSTANTS.servicePricingDefaults.payPerAnalysis;
        if (serviceType === 'expert-consultation') return PRICING_CONSTANTS.servicePricingDefaults.expertConsultation;
        return 0;
    }

    /**
     * Get full service pricing row (or null)
     */
    static getServicePricing(serviceType: string): ServicePricingRow | null {
        return this.servicePricingCache.get(serviceType) || null;
    }

    /**
     * Get all cached service pricing rows
     */
    static getAllServicePricing(): ServicePricingRow[] {
        return Array.from(this.servicePricingCache.values());
    }

    // --- Subscription Tier Getters ---

    /**
     * Get a subscription tier from cache (or null)
     */
    static getSubscriptionTier(tierId: string): SubscriptionTierRow | null {
        return this.subscriptionTierCache.get(tierId) || null;
    }

    /**
     * Get all cached subscription tiers
     */
    static getAllSubscriptionTiers(): SubscriptionTierRow[] {
        return Array.from(this.subscriptionTierCache.values());
    }

    // --- Analysis Pricing Getters (from pricingConfig cache) ---

    /**
     * Get base platform fee (DB-backed with fallback)
     */
    static getBasePlatformFee(): number {
        return this.pricingConfig.platformFee;
    }

    /**
     * Get data processing cost per 1K rows (DB-backed with fallback)
     */
    static getDataProcessingPer1K(): number {
        return this.pricingConfig.dataSizeCostPer1K;
    }

    /**
     * Get base analysis cost (DB-backed with fallback)
     */
    static getBaseAnalysisCost(): number {
        return this.pricingConfig.baseCost;
    }

    /**
     * Get analysis type factor (DB-backed with fallback to shared constant)
     */
    static getAnalysisTypeFactor(analysisType: string): number {
        const normalized = (analysisType || 'default').toLowerCase().replace(/[^a-z_]/g, '_');
        return (this.pricingConfig.analysisTypeFactors as Record<string, number>)[normalized]
            || this.pricingConfig.analysisTypeFactors.default;
    }

    /**
     * Get complexity multiplier by level (DB-backed with fallback)
     */
    static getComplexityMultiplier(level: string): number {
        return (this.pricingConfig.complexityMultipliers as Record<string, number>)[level] || 1.0;
    }

    /**
     * Get number of questions included in base price
     */
    static getQuestionsIncluded(): number {
        return PRICING_CONSTANTS.questionsIncluded;
    }

    /**
     * Get charge per extra question
     */
    static getQuestionsChargePerExtra(): number {
        return PRICING_CONSTANTS.questionsChargePerExtra;
    }
}
