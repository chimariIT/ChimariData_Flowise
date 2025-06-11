export interface PricingFactors {
  dataSizeMB: number;
  recordCount: number;
  columnCount: number;
  featureCount: number;
  questionsCount: number;
  questionComplexity: 'simple' | 'moderate' | 'complex';
  analysisType: 'standard' | 'advanced' | 'custom';
  analysisArtifacts: number;
  dataComplexity: 'simple' | 'moderate' | 'complex';
}

export interface PricingResult {
  basePrice: number;
  dataSizeMultiplier: number;
  recordCountMultiplier: number;
  featureCountMultiplier: number;
  complexityMultiplier: number;
  questionsMultiplier: number;
  questionComplexityMultiplier: number;
  analysisTypeMultiplier: number;
  analysisArtifactsMultiplier: number;
  finalPrice: number;
  priceInCents: number;
  breakdown: {
    basePrice: number;
    dataSizeCharge: number;
    recordCountCharge: number;
    featureCountCharge: number;
    complexityCharge: number;
    questionsCharge: number;
    questionComplexityCharge: number;
    analysisTypeCharge: number;
    analysisArtifactsCharge: number;
  };
}

export class PricingService {
  private static readonly BASE_PRICE = 5.00; // $5 base price
  private static readonly PRICE_PER_MB = 0.10; // $0.10 per MB
  private static readonly PRICE_PER_1K_RECORDS = 0.05; // $0.05 per 1K records
  private static readonly PRICE_PER_FEATURE = 0.25; // $0.25 per feature beyond 10
  private static readonly PRICE_PER_QUESTION = 1.00; // $1 per question beyond first 3
  private static readonly PRICE_PER_ARTIFACT = 0.50; // $0.50 per analysis artifact
  
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

  private static readonly QUESTION_COMPLEXITY_MULTIPLIERS = {
    simple: 1.0,
    moderate: 1.2,
    complex: 1.5
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