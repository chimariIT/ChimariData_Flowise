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

// Import shared pricing constants for consistency
import { PRICING_CONSTANTS } from '../../shared/pricing-config';

// PHASE 6: Admin-configurable analysis pricing
export interface AnalysisPricingConfig {
    baseCost: number;                        // Base cost for any analysis ($)
    dataSizeCostPer1K: number;               // Cost per 1000 records ($)
    platformFee: number;                     // Platform fee ($)
    complexityMultipliers: {
        basic: number;
        intermediate: number;
        advanced: number;
    };
    analysisTypeFactors: {
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
}

// Default pricing configuration - uses shared PRICING_CONSTANTS for consistency
// FIX: Previously had inflated values ($5 platform fee, $10 base cost)
// Now aligned with PRICING_CONSTANTS ($0.50 platform fee, $1.00 base cost)
const DEFAULT_PRICING_CONFIG: AnalysisPricingConfig = {
    baseCost: PRICING_CONSTANTS.baseAnalysisCost,               // $1.00 (was $10.00)
    dataSizeCostPer1K: PRICING_CONSTANTS.dataProcessingPer1K,   // $0.10 (was $0.05)
    platformFee: PRICING_CONSTANTS.basePlatformFee,             // $0.50 (was $5.00)
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
    }
};

export class PricingService {
    // Dynamic pricing config - can be updated by admin
    private static pricingConfig: AnalysisPricingConfig = { ...DEFAULT_PRICING_CONFIG };

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
     * Get current pricing configuration (for admin UI)
     */
    static getPricingConfig(): AnalysisPricingConfig {
        return { ...this.pricingConfig };
    }

    /**
     * Update pricing configuration (from admin UI)
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
            }
        };

        // Also update legacy costFactors for backward compatibility
        this.costFactors = {
            statistical: this.pricingConfig.analysisTypeFactors.statistical,
            machine_learning: this.pricingConfig.analysisTypeFactors.machine_learning,
            visualization: this.pricingConfig.analysisTypeFactors.visualization,
            business_intelligence: this.pricingConfig.analysisTypeFactors.business_intelligence,
            time_series: this.pricingConfig.analysisTypeFactors.time_series,
            default: this.pricingConfig.analysisTypeFactors.default
        };

        console.log(`✅ [PricingService] Updated pricing config:`, this.pricingConfig);
        return this.getPricingConfig();
    }

    /**
     * Reset pricing to defaults
     */
    static resetPricingConfig(): AnalysisPricingConfig {
        this.pricingConfig = { ...DEFAULT_PRICING_CONFIG };
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
}
