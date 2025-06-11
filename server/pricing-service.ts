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
    
    // Calculate individual charges
    const dataSizeCharge = factors.dataSizeMB * this.PRICE_PER_MB;
    const recordCountCharge = Math.max(0, factors.recordCount - 1000) / 1000 * this.PRICE_PER_1K_RECORDS;
    const featureCountCharge = Math.max(0, factors.featureCount - 10) * this.PRICE_PER_FEATURE;
    const questionsCharge = Math.max(0, factors.questionsCount - 3) * this.PRICE_PER_QUESTION;
    const analysisArtifactsCharge = factors.analysisArtifacts * this.PRICE_PER_ARTIFACT;
    
    // Apply complexity multipliers
    const complexityMultiplier = this.COMPLEXITY_MULTIPLIERS[factors.dataComplexity];
    const questionComplexityMultiplier = this.QUESTION_COMPLEXITY_MULTIPLIERS[factors.questionComplexity];
    const analysisTypeMultiplier = this.ANALYSIS_TYPE_MULTIPLIERS[factors.analysisType];
    
    // Calculate subtotal before multipliers
    const subtotal = basePrice + dataSizeCharge + recordCountCharge + featureCountCharge + 
                    questionsCharge + analysisArtifactsCharge;
    
    // Apply all multipliers to get final price
    const finalPrice = subtotal * complexityMultiplier * questionComplexityMultiplier * analysisTypeMultiplier;
    
    return {
      basePrice,
      dataSizeMultiplier: dataSizeCharge,
      recordCountMultiplier: recordCountCharge,
      featureCountMultiplier: featureCountCharge,
      complexityMultiplier,
      questionsMultiplier: questionsCharge,
      questionComplexityMultiplier,
      analysisTypeMultiplier,
      analysisArtifactsMultiplier: analysisArtifactsCharge,
      finalPrice: Math.round(finalPrice * 100) / 100,
      priceInCents: Math.round(finalPrice * 100),
      breakdown: {
        basePrice,
        dataSizeCharge,
        recordCountCharge,
        featureCountCharge,
        complexityCharge: subtotal * (complexityMultiplier - 1),
        questionsCharge,
        questionComplexityCharge: subtotal * complexityMultiplier * (questionComplexityMultiplier - 1),
        analysisTypeCharge: subtotal * complexityMultiplier * questionComplexityMultiplier * (analysisTypeMultiplier - 1),
        analysisArtifactsCharge
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
    const estimatedRecords = Math.max(100, dataSizeMB * 1000);
    const estimatedFeatures = Math.max(5, Math.min(20, Math.floor(estimatedRecords / 100)));
    
    const factors: PricingFactors = {
      dataSizeMB,
      recordCount: estimatedRecords,
      columnCount: estimatedFeatures + 2,
      featureCount: estimatedFeatures,
      questionsCount,
      questionComplexity: this.assessQuestionComplexity([]),
      analysisType,
      analysisArtifacts: this.estimateAnalysisArtifacts(analysisType, estimatedRecords, estimatedFeatures),
      dataComplexity: 'moderate'
    };
    
    const pricing = this.calculatePrice(factors);
    return `$${pricing.finalPrice.toFixed(2)}`;
  }

  static assessQuestionComplexity(questions: string[]): 'simple' | 'moderate' | 'complex' {
    if (!questions || questions.length === 0) return 'simple';
    
    const complexPatterns = [
      /correlation|relationship|predict|forecast|model|algorithm/i,
      /optimization|maximize|minimize|efficiency/i,
      /segmentation|clustering|classification|categorization/i,
      /anomaly|outlier|unusual|abnormal/i,
      /time.?series|temporal|seasonal|trend/i,
      /multi.?variate|interaction|causation/i
    ];
    
    const moderatePatterns = [
      /compare|contrast|difference|versus/i,
      /distribution|pattern|behavior/i,
      /impact|effect|influence|factor/i,
      /performance|metric|kpi|indicator/i
    ];
    
    let complexScore = 0;
    let moderateScore = 0;
    
    questions.forEach(question => {
      if (complexPatterns.some(pattern => pattern.test(question))) {
        complexScore++;
      } else if (moderatePatterns.some(pattern => pattern.test(question))) {
        moderateScore++;
      }
    });
    
    if (complexScore > 0 || questions.length > 5) return 'complex';
    if (moderateScore > 0 || questions.length > 2) return 'moderate';
    return 'simple';
  }

  static estimateAnalysisArtifacts(analysisType: string, recordCount: number, featureCount: number): number {
    let baseArtifacts = 2; // Basic summary + data quality report
    
    if (analysisType === 'advanced') baseArtifacts += 2;
    if (analysisType === 'custom') baseArtifacts += 4;
    
    // Add artifacts based on data complexity
    if (recordCount > 10000) baseArtifacts += 1;
    if (featureCount > 20) baseArtifacts += 1;
    
    return Math.min(baseArtifacts, 8); // Cap at 8 artifacts
  }
}