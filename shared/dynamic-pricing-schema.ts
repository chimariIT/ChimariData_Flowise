import { z } from "zod";

// Dynamic pricing calculation schema
export const dynamicPricingSchema = z.object({
  // File characteristics
  fileSizeBytes: z.number(),
  recordCount: z.number(),
  columnCount: z.number(),
  
  // Data complexity factors
  complexityFactors: z.object({
    piiColumnsCount: z.number().default(0),
    uniqueIdentifiersCount: z.number().default(0),
    missingDataPercentage: z.number().default(0),
    dataTypes: z.object({
      numerical: z.number().default(0),
      categorical: z.number().default(0),
      datetime: z.number().default(0),
      text: z.number().default(0)
    }).default({}),
    outliersDetected: z.boolean().default(false),
    needsNormalization: z.boolean().default(false)
  }).default({}),
  
  // Selected features and their requirements
  selectedFeatures: z.array(z.enum([
    "data_transformation",
    "data_visualization", 
    "data_analysis",
    "ai_insights"
  ])),
  
  // Feature-specific requirements
  featureRequirements: z.object({
    data_transformation: z.object({
      operations: z.array(z.enum([
        "cleaning",
        "normalization",
        "outlier_removal",
        "missing_data_imputation",
        "data_joining",
        "feature_engineering",
        "pii_anonymization"
      ])).default([]),
      joinDatasets: z.number().default(0),
      customTransformations: z.number().default(0)
    }).optional(),
    
    data_visualization: z.object({
      chartTypes: z.array(z.enum([
        "bar",
        "line", 
        "scatter",
        "pie",
        "histogram",
        "boxplot",
        "heatmap",
        "violin",
        "advanced_interactive"
      ])).default([]),
      customVisualizations: z.number().default(0),
      interactiveFeatures: z.boolean().default(false)
    }).optional(),
    
    data_analysis: z.object({
      analysisTypes: z.array(z.enum([
        "descriptive",
        "correlation",
        "regression",
        "anova",
        "ancova", 
        "manova",
        "mancova",
        "clustering",
        "classification",
        "time_series",
        "predictive_modeling"
      ])).default([]),
      variablesCount: z.number().default(0),
      modelComplexity: z.enum(["basic", "intermediate", "advanced"]).default("basic")
    }).optional(),
    
    ai_insights: z.object({
      insightTypes: z.array(z.enum([
        "business_insights",
        "predictive_analysis",
        "pattern_recognition",
        "recommendation_generation",
        "automated_reporting",
        "comparative_analysis",
        "root_cause_analysis"
      ])).default([]),
      customPrompts: z.number().default(0),
      aiModelComplexity: z.enum(["standard", "advanced", "premium"]).default("standard")
    }).optional()
  }).default({})
});

export type DynamicPricingRequest = z.infer<typeof dynamicPricingSchema>;

// Pricing calculation result
export const pricingResultSchema = z.object({
  // Base costs
  baseCosts: z.object({
    fileProcessing: z.number(),
    dataComplexity: z.number(),
    featureBase: z.record(z.number())
  }),
  
  // Feature-specific costs
  featureCosts: z.record(z.object({
    basePrice: z.number(),
    complexityMultiplier: z.number(),
    operationsCosts: z.number(),
    totalFeatureCost: z.number()
  })),
  
  // Discounts and adjustments
  discounts: z.object({
    multiFeatureDiscount: z.number(),
    volumeDiscount: z.number(),
    complexityDiscount: z.number(), // For very simple datasets
    totalDiscountAmount: z.number()
  }),
  
  // Final pricing
  subtotal: z.number(),
  totalDiscount: z.number(),
  finalTotal: z.number(),
  
  // Pricing breakdown for user display
  breakdown: z.array(z.object({
    category: z.string(),
    description: z.string(),
    cost: z.number(),
    isDiscount: z.boolean().default(false)
  })),
  
  // Estimated processing time and resources
  estimatedProcessing: z.object({
    timeMinutes: z.number(),
    resourceIntensity: z.enum(["low", "medium", "high", "very_high"]),
    priorityLevel: z.enum(["standard", "expedited", "premium"]).default("standard")
  })
});

export type PricingResult = z.infer<typeof pricingResultSchema>;

// Feature complexity definitions
export const featureComplexitySchema = z.object({
  data_transformation: z.object({
    cleaning: z.object({ basePrice: z.number(), complexityMultiplier: z.number() }),
    normalization: z.object({ basePrice: z.number(), complexityMultiplier: z.number() }),
    outlier_removal: z.object({ basePrice: z.number(), complexityMultiplier: z.number() }),
    missing_data_imputation: z.object({ basePrice: z.number(), complexityMultiplier: z.number() }),
    data_joining: z.object({ basePrice: z.number(), perDatasetMultiplier: z.number() }),
    feature_engineering: z.object({ basePrice: z.number(), complexityMultiplier: z.number() }),
    pii_anonymization: z.object({ basePrice: z.number(), perColumnMultiplier: z.number() })
  }),
  
  data_visualization: z.object({
    basicCharts: z.object({ pricePerChart: z.number() }),
    advancedCharts: z.object({ pricePerChart: z.number() }),
    interactiveFeatures: z.object({ basePrice: z.number() }),
    customVisualizations: z.object({ pricePerCustom: z.number() })
  }),
  
  data_analysis: z.object({
    descriptive: z.object({ basePrice: z.number() }),
    correlation: z.object({ basePrice: z.number(), perVariableMultiplier: z.number() }),
    regression: z.object({ 
      basic: z.number(), 
      multiple: z.number(), 
      advanced: z.number() 
    }),
    anova: z.object({ basePrice: z.number(), perGroupMultiplier: z.number() }),
    ancova: z.object({ basePrice: z.number(), perCovariateMultiplier: z.number() }),
    manova: z.object({ basePrice: z.number(), perVariableMultiplier: z.number() }),
    mancova: z.object({ basePrice: z.number(), complexityMultiplier: z.number() }),
    clustering: z.object({ basePrice: z.number(), algorithmMultiplier: z.number() }),
    classification: z.object({ basePrice: z.number(), modelComplexityMultiplier: z.number() }),
    time_series: z.object({ basePrice: z.number(), lengthMultiplier: z.number() }),
    predictive_modeling: z.object({ basePrice: z.number(), complexityMultiplier: z.number() })
  }),
  
  ai_insights: z.object({
    business_insights: z.object({ basePrice: z.number(), complexityMultiplier: z.number() }),
    predictive_analysis: z.object({ basePrice: z.number(), modelComplexityMultiplier: z.number() }),
    pattern_recognition: z.object({ basePrice: z.number(), dataVolumeMultiplier: z.number() }),
    recommendation_generation: z.object({ basePrice: z.number(), customizationMultiplier: z.number() }),
    automated_reporting: z.object({ basePrice: z.number(), reportComplexityMultiplier: z.number() }),
    comparative_analysis: z.object({ basePrice: z.number(), comparisonGroupsMultiplier: z.number() }),
    root_cause_analysis: z.object({ basePrice: z.number(), variableComplexityMultiplier: z.number() })
  })
});

export type FeatureComplexity = z.infer<typeof featureComplexitySchema>;

// Pricing configuration schema
export const pricingConfigSchema = z.object({
  // Base pricing factors
  fileSizePricing: z.object({
    small: z.object({ maxSizeMB: z.number(), basePrice: z.number() }),      // < 1MB
    medium: z.object({ maxSizeMB: z.number(), basePrice: z.number() }),     // 1-10MB
    large: z.object({ maxSizeMB: z.number(), basePrice: z.number() }),      // 10-50MB
    xlarge: z.object({ maxSizeMB: z.number(), basePrice: z.number() }),     // 50-100MB
    enterprise: z.object({ basePrice: z.number(), perMBMultiplier: z.number() }) // > 100MB
  }),
  
  recordCountPricing: z.object({
    small: z.object({ maxRecords: z.number(), basePrice: z.number() }),     // < 1K
    medium: z.object({ maxRecords: z.number(), basePrice: z.number() }),    // 1K-10K
    large: z.object({ maxRecords: z.number(), basePrice: z.number() }),     // 10K-100K
    xlarge: z.object({ maxRecords: z.number(), basePrice: z.number() }),    // 100K-1M
    enterprise: z.object({ basePrice: z.number(), perThousandMultiplier: z.number() }) // > 1M
  }),
  
  complexityMultipliers: z.object({
    piiHandling: z.number(),
    missingDataHigh: z.number(),        // > 20% missing
    missingDataMedium: z.number(),      // 5-20% missing
    outliersDetected: z.number(),
    multipleDataTypes: z.number(),
    largeColumnCount: z.number()        // > 50 columns
  }),
  
  // Multi-feature discounts
  multiFeatureDiscounts: z.object({
    twoFeatures: z.number(),
    threeFeatures: z.number(),
    allFeatures: z.number()
  }),
  
  // Volume discounts based on data size
  volumeDiscounts: z.object({
    large: z.object({ threshold: z.number(), discount: z.number() }),
    enterprise: z.object({ threshold: z.number(), discount: z.number() })
  }),
  
  // Feature complexity pricing
  featureComplexity: featureComplexitySchema
});

export type PricingConfig = z.infer<typeof pricingConfigSchema>;

// User workflow step schema - tracks where user is in guided process
export const workflowStepSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  currentStep: z.enum([
    "file_upload",
    "data_preview", 
    "pii_handling",
    "feature_selection",
    "requirements_gathering",
    "pricing_review",
    "payment",
    "processing",
    "results"
  ]),
  stepData: z.record(z.any()).optional(),
  estimatedCost: z.number().optional(),
  selectedFeatures: z.array(z.string()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type WorkflowStep = z.infer<typeof workflowStepSchema>;