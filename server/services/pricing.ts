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

export class PricingService {
    private static costFactors = {
        'statistical': 1.0,
        'machine_learning': 2.5,
        'visualization': 0.5,
        'business_intelligence': 1.5,
        'time_series': 2.0,
        'default': 1.0
    };

    static getFreeTrialLimits() {
        return {
            maxFileSize: 1024 * 1024 * 5, // 5MB
        };
    }

    static calculateAnalysisCost(analysisType: string, recordCount: number, complexity: 'basic' | 'intermediate' | 'advanced' = 'basic'): AnalysisCost {
        const baseCost = 10.00; // Base cost for any analysis
        
        const typeFactor = this.costFactors[analysisType as keyof typeof this.costFactors] || this.costFactors['default'];
        
        // Cost based on data size
        const dataSizeCost = (recordCount / 1000) * 0.05; // $0.05 per 1000 records

        // Cost based on complexity
        let complexityMultiplier = 1.0;
        if (complexity === 'intermediate') {
            complexityMultiplier = 1.5;
        } else if (complexity === 'advanced') {
            complexityMultiplier = 2.5;
        }
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

    static async createCheckoutSession(projectId: string, amount: number, currency: string): Promise<{ sessionId: string, url: string }> {
        // This is a mock implementation. In a real application, you would integrate
        // with a payment provider like Stripe, Braintree, or Adyen.
        console.log(`Creating checkout session for project ${projectId} with amount ${amount} ${currency}`);
        
        const sessionId = `sess_${projectId}_${Date.now()}`;
        const checkoutUrl = `/checkout/success?session_id=${sessionId}`;

        // Simulate an asynchronous operation
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            sessionId,
            url: checkoutUrl
        };
    }
}
