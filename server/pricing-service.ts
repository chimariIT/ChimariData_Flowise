export interface PricingTier {
  name: string;
  price: number;
  priceLabel: string;
  features: string[];
  limits: {
    analysesPerMonth: number;
    maxDataSizeMB: number;
    maxRecords: number;
    aiQueries: number;
    supportLevel: string;
    customModels: boolean;
    apiAccess: boolean;
    teamCollaboration: boolean;
  };
  recommended?: boolean;
}

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
  tier?: 'free' | 'professional' | 'enterprise';
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
  // Three-tier pricing structure
  private static readonly PRICING_TIERS: PricingTier[] = [
    {
      name: "Free Trial",
      price: 0,
      priceLabel: "Free",
      features: [
        "1 file upload (no sign-in required)",
        "1 simple data summarization",
        "1 AI question",
        "Basic visualizations",
        "Community support"
      ],
      limits: {
        analysesPerMonth: 1,
        maxDataSizeMB: 10,
        maxRecords: 1000,
        aiQueries: 1,
        supportLevel: "community",
        customModels: false,
        apiAccess: false,
        teamCollaboration: false
      }
    },
    {
      name: "Starter",
      price: 5,
      priceLabel: "$5/month",
      features: [
        "Single file uploads up to 10MB",
        "5 simple analyses per month",
        "Basic visualizations",
        "Email support",
        "Export capabilities"
      ],
      limits: {
        analysesPerMonth: 5,
        maxDataSizeMB: 10,
        maxRecords: 10000,
        aiQueries: 0,
        supportLevel: "email",
        customModels: false,
        apiAccess: false,
        teamCollaboration: false
      }
    },
    {
      name: "Basic",
      price: 15,
      priceLabel: "$15/month",
      features: [
        "File uploads up to 15MB",
        "10 simple analyses per month",
        "5 AI queries",
        "Advanced visualizations",
        "Priority email support"
      ],
      limits: {
        analysesPerMonth: 10,
        maxDataSizeMB: 15,
        maxRecords: 25000,
        aiQueries: 5,
        supportLevel: "email",
        customModels: false,
        apiAccess: false,
        teamCollaboration: false
      },
      recommended: true
    },
    {
      name: "Professional",
      price: 20,
      priceLabel: "$20/month",
      features: [
        "Up to 10 files, 40MB each",
        "10 simple to medium analyses",
        "10 AI queries",
        "Advanced visualizations",
        "Custom dashboards",
        "Priority support"
      ],
      limits: {
        analysesPerMonth: 10,
        maxDataSizeMB: 40,
        maxRecords: 100000,
        aiQueries: 10,
        supportLevel: "email",
        customModels: true,
        apiAccess: false,
        teamCollaboration: false
      }
    },
    {
      name: "Premium",
      price: 50,
      priceLabel: "$50/month",
      features: [
        "Unlimited data uploads",
        "Complex analysis capabilities",
        "50 AI queries per month",
        "Premium AI models",
        "Advanced visualizations",
        "API access",
        "Priority support"
      ],
      limits: {
        analysesPerMonth: -1, // unlimited
        maxDataSizeMB: -1, // unlimited
        maxRecords: -1, // unlimited
        aiQueries: 50,
        supportLevel: "email",
        customModels: true,
        apiAccess: true,
        teamCollaboration: false
      }
    },
    {
      name: "Enterprise",
      price: -1, // contact for quote
      priceLabel: "Contact Us",
      features: [
        "Everything in Premium",
        "Custom AI model training",
        "24/7 phone & email support",
        "Team collaboration tools",
        "Dedicated account manager",
        "SLA guarantee",
        "Custom integrations"
      ],
      limits: {
        analysesPerMonth: -1, // unlimited
        maxDataSizeMB: -1, // unlimited
        maxRecords: -1, // unlimited
        aiQueries: -1, // unlimited
        supportLevel: "phone",
        customModels: true,
        apiAccess: true,
        teamCollaboration: true
      }
    }
  ];

  private static readonly BASE_PRICE = 5.00; // $5 base price for pay-per-use
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

  // New methods for three-tier pricing system
  static getPricingTiers(): PricingTier[] {
    return this.PRICING_TIERS;
  }

  static getTierByName(tierName: 'free' | 'professional' | 'enterprise'): PricingTier | null {
    return this.PRICING_TIERS.find(tier => tier.name.toLowerCase() === tierName) || null;
  }

  static validateUserLimits(
    userTier: 'free' | 'professional' | 'enterprise',
    request: {
      dataSizeMB: number;
      recordCount: number;
      currentMonthAnalyses?: number;
    }
  ): { valid: boolean; errors: string[]; upgradeSuggestion?: string } {
    const tier = this.getTierByName(userTier);
    if (!tier) {
      return { valid: false, errors: ['Invalid tier'] };
    }

    const errors: string[] = [];

    // Check data size limits
    if (tier.limits.maxDataSizeMB !== -1 && request.dataSizeMB > tier.limits.maxDataSizeMB) {
      errors.push(`Data size ${request.dataSizeMB}MB exceeds ${tier.name} limit of ${tier.limits.maxDataSizeMB}MB`);
    }

    // Check record count limits
    if (tier.limits.maxRecords !== -1 && request.recordCount > tier.limits.maxRecords) {
      errors.push(`Record count ${request.recordCount} exceeds ${tier.name} limit of ${tier.limits.maxRecords.toLocaleString()}`);
    }

    // Check monthly analysis limits
    if (tier.limits.analysesPerMonth !== -1 && request.currentMonthAnalyses && 
        request.currentMonthAnalyses >= tier.limits.analysesPerMonth) {
      errors.push(`Monthly analysis limit of ${tier.limits.analysesPerMonth} reached`);
    }

    const valid = errors.length === 0;
    let upgradeSuggestion: string | undefined;

    if (!valid) {
      if (userTier === 'free') {
        upgradeSuggestion = 'professional';
      } else if (userTier === 'professional') {
        upgradeSuggestion = 'enterprise';
      }
    }

    return { valid, errors, upgradeSuggestion };
  }

  static getRecommendedTier(dataSizeMB: number, recordCount: number, analysesPerMonth: number): PricingTier {
    // If data requirements exceed free tier limits
    if (dataSizeMB > 10 || recordCount > 5000 || analysesPerMonth > 3) {
      // If data requirements exceed professional tier limits
      if (dataSizeMB > 500 || recordCount > 100000 || analysesPerMonth > 50) {
        return this.PRICING_TIERS[2]; // Enterprise
      }
      return this.PRICING_TIERS[1]; // Professional
    }
    return this.PRICING_TIERS[0]; // Free
  }

  static calculateOverageCharges(
    userTier: 'free' | 'professional' | 'enterprise',
    usage: {
      dataSizeMB: number;
      recordCount: number;
      analysesThisMonth: number;
    }
  ): { overageCharges: number; breakdown: string[] } {
    const tier = this.getTierByName(userTier);
    if (!tier) return { overageCharges: 0, breakdown: [] };

    let overageCharges = 0;
    const breakdown: string[] = [];

    // Data size overage (only for tiers with limits)
    if (tier.limits.maxDataSizeMB !== -1 && usage.dataSizeMB > tier.limits.maxDataSizeMB) {
      const excessMB = usage.dataSizeMB - tier.limits.maxDataSizeMB;
      const charge = excessMB * 0.50; // $0.50 per MB overage
      overageCharges += charge;
      breakdown.push(`Data overage: ${excessMB}MB × $0.50 = $${charge.toFixed(2)}`);
    }

    // Analysis overage (only for free tier)
    if (userTier === 'free' && usage.analysesThisMonth > tier.limits.analysesPerMonth) {
      const excessAnalyses = usage.analysesThisMonth - tier.limits.analysesPerMonth;
      const charge = excessAnalyses * 5.00; // $5 per analysis overage
      overageCharges += charge;
      breakdown.push(`Analysis overage: ${excessAnalyses} × $5.00 = $${charge.toFixed(2)}`);
    }

    return { overageCharges, breakdown };
  }
}