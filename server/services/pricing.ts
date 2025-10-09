export interface AnalysisCost {
    baseCost: number;
    dataSizeCost: number;
    complexityCost: number;
    totalCost: number;
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
