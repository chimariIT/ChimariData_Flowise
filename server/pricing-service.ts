export interface PricingFactors {
  dataSizeMB: number;
  recordCount: number;
  columnCount: number;
  questionsCount: number;
  analysisType: 'standard' | 'advanced' | 'custom';
  dataComplexity: 'simple' | 'moderate' | 'complex';
}

export interface PricingResult {
  basePrice: number;
  dataSizeMultiplier: number;
  complexityMultiplier: number;
  questionsMultiplier: number;
  analysisTypeMultiplier: number;
  finalPrice: number;
  priceInCents: number;
  breakdown: {
    basePrice: number;
    dataSizeCharge: number;
    complexityCharge: number;
    questionsCharge: number;
    analysisTypeCharge: number;
  };
}

export class PricingService {
  private static readonly BASE_PRICE = 5.00; // $5 base price
  private static readonly PRICE_PER_MB = 0.10; // $0.10 per MB
  private static readonly PRICE_PER_QUESTION = 1.00; // $1 per question beyond first 3
  
  private static readonly ANALYSIS_TYPE_MULTIPLIERS = {
    standard: 1.0,
    advanced: 1.5,
    custom: 2.0
  };
  
  private static readonly COMPLEXITY_MULTIPLIERS = {
    simple: 1.0,
    moderate: 1.3,
    complex: 1.6
  };

  static calculatePrice(factors: PricingFactors): PricingResult {
    const basePrice = this.BASE_PRICE;
    
    // Data size pricing
    const dataSizeCharge = Math.max(0, factors.dataSizeMB - 1) * this.PRICE_PER_MB; // First MB free
    
    // Questions pricing (first 3 questions free)
    const questionsCharge = Math.max(0, factors.questionsCount - 3) * this.PRICE_PER_QUESTION;
    
    // Analysis type multiplier
    const analysisTypeMultiplier = this.ANALYSIS_TYPE_MULTIPLIERS[factors.analysisType];
    const analysisTypeCharge = basePrice * (analysisTypeMultiplier - 1);
    
    // Complexity multiplier
    const complexityMultiplier = this.COMPLEXITY_MULTIPLIERS[factors.dataComplexity];
    const complexityCharge = basePrice * (complexityMultiplier - 1);
    
    // Calculate final price
    const subtotal = basePrice + dataSizeCharge + questionsCharge + analysisTypeCharge + complexityCharge;
    const finalPrice = Math.max(5.00, subtotal); // Minimum $5
    
    return {
      basePrice,
      dataSizeMultiplier: factors.dataSizeMB > 1 ? this.PRICE_PER_MB : 0,
      complexityMultiplier,
      questionsMultiplier: factors.questionsCount > 3 ? this.PRICE_PER_QUESTION : 0,
      analysisTypeMultiplier,
      finalPrice: Math.round(finalPrice * 100) / 100,
      priceInCents: Math.round(finalPrice * 100),
      breakdown: {
        basePrice,
        dataSizeCharge,
        complexityCharge,
        questionsCharge,
        analysisTypeCharge
      }
    };
  }

  static assessDataComplexity(schema: any, recordCount: number): 'simple' | 'moderate' | 'complex' {
    if (!schema || typeof schema !== 'object') return 'simple';
    
    const columnCount = Object.keys(schema).length;
    const hasComplexTypes = Object.values(schema).some(type => 
      typeof type === 'string' && ['json', 'array', 'object'].includes(type.toLowerCase())
    );
    
    // Simple: Few columns, small dataset
    if (columnCount <= 5 && recordCount <= 1000 && !hasComplexTypes) {
      return 'simple';
    }
    
    // Complex: Many columns, large dataset, or complex data types
    if (columnCount > 15 || recordCount > 10000 || hasComplexTypes) {
      return 'complex';
    }
    
    // Moderate: Everything else
    return 'moderate';
  }

  static getEstimatedPrice(dataSizeMB: number, questionsCount: number, analysisType: 'standard' | 'advanced' | 'custom' = 'standard'): string {
    const factors: PricingFactors = {
      dataSizeMB,
      recordCount: dataSizeMB * 1000, // Rough estimation
      columnCount: 10, // Average assumption
      questionsCount,
      analysisType,
      dataComplexity: 'moderate' // Conservative estimate
    };
    
    const pricing = this.calculatePrice(factors);
    return `$${pricing.finalPrice.toFixed(2)}`;
  }
}