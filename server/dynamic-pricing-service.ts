import { 
  DynamicPricingRequest, 
  PricingResult, 
  PricingConfig, 
  FeatureComplexity 
} from "@shared/dynamic-pricing-schema";

export class DynamicPricingService {
  private static pricingConfig: PricingConfig = {
    // File size based pricing
    fileSizePricing: {
      small: { maxSizeMB: 1, basePrice: 5 },
      medium: { maxSizeMB: 10, basePrice: 8 },
      large: { maxSizeMB: 50, basePrice: 15 },
      xlarge: { maxSizeMB: 100, basePrice: 25 },
      enterprise: { basePrice: 35, perMBMultiplier: 0.3 }
    },
    
    // Record count based pricing
    recordCountPricing: {
      small: { maxRecords: 1000, basePrice: 3 },
      medium: { maxRecords: 10000, basePrice: 6 },
      large: { maxRecords: 100000, basePrice: 12 },
      xlarge: { maxRecords: 1000000, basePrice: 20 },
      enterprise: { basePrice: 30, perThousandMultiplier: 0.01 }
    },
    
    // Complexity multipliers
    complexityMultipliers: {
      piiHandling: 1.3,
      missingDataHigh: 1.4,
      missingDataMedium: 1.2,
      outliersDetected: 1.15,
      multipleDataTypes: 1.1,
      largeColumnCount: 1.25
    },
    
    // Multi-feature discounts
    multiFeatureDiscounts: {
      twoFeatures: 0.15,
      threeFeatures: 0.25,
      allFeatures: 0.35
    },
    
    // Volume discounts
    volumeDiscounts: {
      large: { threshold: 50, discount: 0.1 },
      enterprise: { threshold: 200, discount: 0.2 }
    },
    
    // Feature-specific pricing
    featureComplexity: {
      data_transformation: {
        cleaning: { basePrice: 8, complexityMultiplier: 1.2 },
        normalization: { basePrice: 6, complexityMultiplier: 1.1 },
        outlier_removal: { basePrice: 7, complexityMultiplier: 1.15 },
        missing_data_imputation: { basePrice: 9, complexityMultiplier: 1.3 },
        data_joining: { basePrice: 12, perDatasetMultiplier: 5 },
        feature_engineering: { basePrice: 15, complexityMultiplier: 1.4 },
        pii_anonymization: { basePrice: 10, perColumnMultiplier: 2 }
      },
      
      data_visualization: {
        basicCharts: { pricePerChart: 4 },
        advancedCharts: { pricePerChart: 8 },
        interactiveFeatures: { basePrice: 12 },
        customVisualizations: { pricePerCustom: 15 }
      },
      
      data_analysis: {
        descriptive: { basePrice: 8 },
        correlation: { basePrice: 10, perVariableMultiplier: 1.5 },
        regression: { basic: 12, multiple: 18, advanced: 25 },
        anova: { basePrice: 15, perGroupMultiplier: 3 },
        ancova: { basePrice: 20, perCovariateMultiplier: 4 },
        manova: { basePrice: 25, perVariableMultiplier: 5 },
        mancova: { basePrice: 30, complexityMultiplier: 1.5 },
        clustering: { basePrice: 18, algorithmMultiplier: 1.3 },
        classification: { basePrice: 22, modelComplexityMultiplier: 1.4 },
        time_series: { basePrice: 20, lengthMultiplier: 1.2 },
        predictive_modeling: { basePrice: 35, complexityMultiplier: 1.6 }
      },
      
      ai_insights: {
        business_insights: { basePrice: 25, complexityMultiplier: 1.3 },
        predictive_analysis: { basePrice: 35, modelComplexityMultiplier: 1.5 },
        pattern_recognition: { basePrice: 30, dataVolumeMultiplier: 1.2 },
        recommendation_generation: { basePrice: 28, customizationMultiplier: 1.4 },
        automated_reporting: { basePrice: 20, reportComplexityMultiplier: 1.25 },
        comparative_analysis: { basePrice: 32, comparisonGroupsMultiplier: 1.3 },
        root_cause_analysis: { basePrice: 40, variableComplexityMultiplier: 1.4 }
      }
    }
  };

  /**
   * Calculate dynamic pricing based on file characteristics, complexity, and selected features
   */
  static calculateDynamicPricing(request: DynamicPricingRequest): PricingResult {
    const { 
      fileSizeBytes, 
      recordCount, 
      columnCount, 
      complexityFactors, 
      selectedFeatures, 
      featureRequirements 
    } = request;

    // Calculate base costs
    const baseCosts = this.calculateBaseCosts(fileSizeBytes, recordCount, columnCount, complexityFactors);
    
    // Calculate feature-specific costs
    const featureCosts = this.calculateFeatureCosts(selectedFeatures, featureRequirements, complexityFactors);
    
    // Calculate subtotal
    const subtotal = baseCosts.fileProcessing + baseCosts.dataComplexity + 
      Object.values(featureCosts).reduce((sum, cost) => sum + cost.totalFeatureCost, 0);
    
    // Calculate discounts
    const discounts = this.calculateDiscounts(selectedFeatures, subtotal, fileSizeBytes);
    
    // Calculate final total
    const finalTotal = Math.max(subtotal - discounts.totalDiscountAmount, 5); // Minimum $5
    
    // Generate breakdown for user display
    const breakdown = this.generatePricingBreakdown(baseCosts, featureCosts, discounts, selectedFeatures);
    
    // Estimate processing requirements
    const estimatedProcessing = this.estimateProcessingRequirements(
      fileSizeBytes, 
      recordCount, 
      selectedFeatures, 
      complexityFactors
    );

    return {
      baseCosts,
      featureCosts,
      discounts,
      subtotal,
      totalDiscount: discounts.totalDiscountAmount,
      finalTotal,
      breakdown,
      estimatedProcessing
    };
  }

  private static calculateBaseCosts(
    fileSizeBytes: number, 
    recordCount: number, 
    columnCount: number,
    complexityFactors: any
  ) {
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    
    // File size cost
    let fileProcessingCost = 0;
    const { fileSizePricing } = this.pricingConfig;
    
    if (fileSizeMB <= fileSizePricing.small.maxSizeMB) {
      fileProcessingCost = fileSizePricing.small.basePrice;
    } else if (fileSizeMB <= fileSizePricing.medium.maxSizeMB) {
      fileProcessingCost = fileSizePricing.medium.basePrice;
    } else if (fileSizeMB <= fileSizePricing.large.maxSizeMB) {
      fileProcessingCost = fileSizePricing.large.basePrice;
    } else if (fileSizeMB <= fileSizePricing.xlarge.maxSizeMB) {
      fileProcessingCost = fileSizePricing.xlarge.basePrice;
    } else {
      fileProcessingCost = fileSizePricing.enterprise.basePrice + 
        (fileSizeMB - fileSizePricing.xlarge.maxSizeMB) * fileSizePricing.enterprise.perMBMultiplier;
    }

    // Record count cost
    let recordCountCost = 0;
    const { recordCountPricing } = this.pricingConfig;
    
    if (recordCount <= recordCountPricing.small.maxRecords) {
      recordCountCost = recordCountPricing.small.basePrice;
    } else if (recordCount <= recordCountPricing.medium.maxRecords) {
      recordCountCost = recordCountPricing.medium.basePrice;
    } else if (recordCount <= recordCountPricing.large.maxRecords) {
      recordCountCost = recordCountPricing.large.basePrice;
    } else if (recordCount <= recordCountPricing.xlarge.maxRecords) {
      recordCountCost = recordCountPricing.xlarge.basePrice;
    } else {
      recordCountCost = recordCountPricing.enterprise.basePrice + 
        ((recordCount - recordCountPricing.xlarge.maxRecords) / 1000) * recordCountPricing.enterprise.perThousandMultiplier;
    }

    // Complexity adjustments
    let complexityMultiplier = 1.0;
    const { complexityMultipliers } = this.pricingConfig;
    
    if (complexityFactors.piiColumnsCount > 0) {
      complexityMultiplier *= complexityMultipliers.piiHandling;
    }
    
    if (complexityFactors.missingDataPercentage > 20) {
      complexityMultiplier *= complexityMultipliers.missingDataHigh;
    } else if (complexityFactors.missingDataPercentage > 5) {
      complexityMultiplier *= complexityMultipliers.missingDataMedium;
    }
    
    if (complexityFactors.outliersDetected) {
      complexityMultiplier *= complexityMultipliers.outliersDetected;
    }
    
    if (columnCount > 50) {
      complexityMultiplier *= complexityMultipliers.largeColumnCount;
    }
    
    const totalDataTypes = Object.values(complexityFactors.dataTypes || {}).reduce((sum: number, count: any) => sum + count, 0);
    if (totalDataTypes > 3) {
      complexityMultiplier *= complexityMultipliers.multipleDataTypes;
    }

    const baseFileProcessing = fileProcessingCost;
    const dataComplexityCost = recordCountCost * complexityMultiplier;

    return {
      fileProcessing: baseFileProcessing,
      dataComplexity: dataComplexityCost,
      featureBase: {}
    };
  }

  private static calculateFeatureCosts(
    selectedFeatures: string[], 
    featureRequirements: any,
    complexityFactors: any
  ) {
    const featureCosts: Record<string, any> = {};

    for (const feature of selectedFeatures) {
      let featureCost = 0;
      let complexityMultiplier = 1.0;
      let operationsCosts = 0;

      switch (feature) {
        case 'data_transformation':
          const transformConfig = featureRequirements.data_transformation;
          if (transformConfig) {
            for (const operation of transformConfig.operations || []) {
              const operationConfig = this.pricingConfig.featureComplexity.data_transformation[operation as keyof typeof this.pricingConfig.featureComplexity.data_transformation];
              if (operationConfig) {
                if ('basePrice' in operationConfig && 'complexityMultiplier' in operationConfig) {
                  operationsCosts += operationConfig.basePrice * operationConfig.complexityMultiplier;
                } else if ('basePrice' in operationConfig && 'perDatasetMultiplier' in operationConfig) {
                  operationsCosts += operationConfig.basePrice + 
                    (transformConfig.joinDatasets || 0) * operationConfig.perDatasetMultiplier;
                } else if ('basePrice' in operationConfig && 'perColumnMultiplier' in operationConfig) {
                  operationsCosts += operationConfig.basePrice + 
                    (complexityFactors.piiColumnsCount || 0) * operationConfig.perColumnMultiplier;
                }
              }
            }
            operationsCosts += (transformConfig.customTransformations || 0) * 8;
          }
          featureCost = 15; // Base transformation cost
          break;

        case 'data_visualization':
          const vizConfig = featureRequirements.data_visualization;
          if (vizConfig) {
            const basicCharts = (vizConfig.chartTypes || []).filter((t: string) => 
              ['bar', 'line', 'pie', 'histogram'].includes(t)).length;
            const advancedCharts = (vizConfig.chartTypes || []).filter((t: string) => 
              ['scatter', 'boxplot', 'heatmap', 'violin', 'advanced_interactive'].includes(t)).length;
            
            operationsCosts += basicCharts * this.pricingConfig.featureComplexity.data_visualization.basicCharts.pricePerChart;
            operationsCosts += advancedCharts * this.pricingConfig.featureComplexity.data_visualization.advancedCharts.pricePerChart;
            
            if (vizConfig.interactiveFeatures) {
              operationsCosts += this.pricingConfig.featureComplexity.data_visualization.interactiveFeatures.basePrice;
            }
            
            operationsCosts += (vizConfig.customVisualizations || 0) * 
              this.pricingConfig.featureComplexity.data_visualization.customVisualizations.pricePerCustom;
          }
          featureCost = 20; // Base visualization cost
          break;

        case 'data_analysis':
          const analysisConfig = featureRequirements.data_analysis;
          if (analysisConfig) {
            for (const analysisType of analysisConfig.analysisTypes || []) {
              const analysisPrice = this.pricingConfig.featureComplexity.data_analysis[analysisType as keyof typeof this.pricingConfig.featureComplexity.data_analysis];
              if (analysisPrice) {
                if (typeof analysisPrice === 'object' && 'basePrice' in analysisPrice) {
                  operationsCosts += analysisPrice.basePrice;
                  
                  // Apply variable-specific multipliers
                  if ('perVariableMultiplier' in analysisPrice) {
                    operationsCosts += (analysisConfig.variablesCount || 0) * analysisPrice.perVariableMultiplier;
                  }
                } else if (typeof analysisPrice === 'object' && 'basic' in analysisPrice) {
                  // Regression pricing based on complexity
                  const complexity = analysisConfig.modelComplexity || 'basic';
                  operationsCosts += analysisPrice[complexity as keyof typeof analysisPrice] || analysisPrice.basic;
                }
              }
            }
            
            // Apply model complexity multiplier
            if (analysisConfig.modelComplexity === 'advanced') {
              complexityMultiplier *= 1.5;
            } else if (analysisConfig.modelComplexity === 'intermediate') {
              complexityMultiplier *= 1.2;
            }
          }
          featureCost = 25; // Base analysis cost
          break;

        case 'ai_insights':
          const aiConfig = featureRequirements.ai_insights;
          if (aiConfig) {
            for (const insightType of aiConfig.insightTypes || []) {
              const insightPrice = this.pricingConfig.featureComplexity.ai_insights[insightType as keyof typeof this.pricingConfig.featureComplexity.ai_insights];
              if (insightPrice && 'basePrice' in insightPrice && 'complexityMultiplier' in insightPrice) {
                operationsCosts += insightPrice.basePrice * insightPrice.complexityMultiplier;
              }
            }
            
            operationsCosts += (aiConfig.customPrompts || 0) * 5;
            
            // Apply AI model complexity multiplier
            if (aiConfig.aiModelComplexity === 'premium') {
              complexityMultiplier *= 2.0;
            } else if (aiConfig.aiModelComplexity === 'advanced') {
              complexityMultiplier *= 1.5;
            }
          }
          featureCost = 35; // Base AI insights cost
          break;
      }

      const totalFeatureCost = (featureCost + operationsCosts) * complexityMultiplier;

      featureCosts[feature] = {
        basePrice: featureCost,
        complexityMultiplier,
        operationsCosts,
        totalFeatureCost
      };
    }

    return featureCosts;
  }

  private static calculateDiscounts(selectedFeatures: string[], subtotal: number, fileSizeBytes: number) {
    let multiFeatureDiscount = 0;
    let volumeDiscount = 0;
    let complexityDiscount = 0;

    // Multi-feature discount
    const featureCount = selectedFeatures.length;
    const { multiFeatureDiscounts } = this.pricingConfig;
    
    if (featureCount === 2) {
      multiFeatureDiscount = subtotal * multiFeatureDiscounts.twoFeatures;
    } else if (featureCount === 3) {
      multiFeatureDiscount = subtotal * multiFeatureDiscounts.threeFeatures;
    } else if (featureCount >= 4) {
      multiFeatureDiscount = subtotal * multiFeatureDiscounts.allFeatures;
    }

    // Volume discount based on file size
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    const { volumeDiscounts } = this.pricingConfig;
    
    if (subtotal >= volumeDiscounts.enterprise.threshold) {
      volumeDiscount = subtotal * volumeDiscounts.enterprise.discount;
    } else if (subtotal >= volumeDiscounts.large.threshold) {
      volumeDiscount = subtotal * volumeDiscounts.large.discount;
    }

    // Complexity discount for very simple datasets
    if (fileSizeMB < 1 && selectedFeatures.length === 1) {
      complexityDiscount = subtotal * 0.1; // 10% discount for simple cases
    }

    const totalDiscountAmount = multiFeatureDiscount + volumeDiscount + complexityDiscount;

    return {
      multiFeatureDiscount,
      volumeDiscount,
      complexityDiscount,
      totalDiscountAmount
    };
  }

  private static generatePricingBreakdown(baseCosts: any, featureCosts: any, discounts: any, selectedFeatures: string[]) {
    const breakdown = [];

    // File processing costs
    breakdown.push({
      category: "File Processing",
      description: "Base file upload and processing",
      cost: baseCosts.fileProcessing,
      isDiscount: false
    });

    breakdown.push({
      category: "Data Complexity", 
      description: "Record count and complexity adjustments",
      cost: baseCosts.dataComplexity,
      isDiscount: false
    });

    // Feature costs
    for (const feature of selectedFeatures) {
      const featureName = feature.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      const cost = featureCosts[feature];
      if (cost) {
        breakdown.push({
          category: featureName,
          description: `${featureName} processing and operations`,
          cost: cost.totalFeatureCost,
          isDiscount: false
        });
      }
    }

    // Discounts
    if (discounts.multiFeatureDiscount > 0) {
      breakdown.push({
        category: "Multi-Feature Discount",
        description: `${selectedFeatures.length} features selected`,
        cost: -discounts.multiFeatureDiscount,
        isDiscount: true
      });
    }

    if (discounts.volumeDiscount > 0) {
      breakdown.push({
        category: "Volume Discount",
        description: "Large dataset discount",
        cost: -discounts.volumeDiscount,
        isDiscount: true
      });
    }

    if (discounts.complexityDiscount > 0) {
      breakdown.push({
        category: "Simplicity Discount", 
        description: "Simple dataset discount",
        cost: -discounts.complexityDiscount,
        isDiscount: true
      });
    }

    return breakdown;
  }

  private static estimateProcessingRequirements(
    fileSizeBytes: number,
    recordCount: number,
    selectedFeatures: string[],
    complexityFactors: any
  ) {
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    
    // Base processing time (in minutes)
    let baseTime = Math.max(1, Math.ceil(fileSizeMB / 10)); // 1 minute per 10MB
    baseTime += Math.max(1, Math.ceil(recordCount / 50000)); // 1 minute per 50K records
    
    // Add time for each feature
    const featureTimeMultipliers = {
      'data_transformation': 2.0,
      'data_visualization': 1.5,
      'data_analysis': 3.0,
      'ai_insights': 4.0
    };
    
    let totalFeatureTime = 0;
    for (const feature of selectedFeatures) {
      totalFeatureTime += baseTime * (featureTimeMultipliers[feature as keyof typeof featureTimeMultipliers] || 1.0);
    }
    
    // Add complexity adjustments
    if (complexityFactors.piiColumnsCount > 0) {
      totalFeatureTime *= 1.3;
    }
    if (complexityFactors.missingDataPercentage > 20) {
      totalFeatureTime *= 1.4;
    }
    if (complexityFactors.outliersDetected) {
      totalFeatureTime *= 1.2;
    }
    
    const totalTime = Math.ceil(baseTime + totalFeatureTime);
    
    // Determine resource intensity
    let resourceIntensity: "low" | "medium" | "high" | "very_high" = "low";
    if (fileSizeMB > 50 || recordCount > 100000 || selectedFeatures.length > 2) {
      resourceIntensity = "high";
    } else if (fileSizeMB > 10 || recordCount > 10000 || selectedFeatures.length > 1) {
      resourceIntensity = "medium";
    }
    if (selectedFeatures.includes('ai_insights') && fileSizeMB > 25) {
      resourceIntensity = "very_high";
    }

    return {
      timeMinutes: totalTime,
      resourceIntensity,
      priorityLevel: "standard" as const
    };
  }

  /**
   * Get feature descriptions with dynamic pricing
   */
  static getFeatureDescriptions(baseCost: number = 0): Record<string, { 
    name: string; 
    description: string; 
    basePrice: number;
    priceDescription: string;
  }> {
    return {
      data_transformation: {
        name: "Data Engineering",
        description: "Clean, normalize, join datasets, handle missing data, detect outliers, and engineer features",
        basePrice: 15,
        priceDescription: "Starting at $15 + operations costs based on complexity"
      },
      data_visualization: {
        name: "Data Visualization",
        description: "Create professional charts, interactive visualizations, and custom dashboards",
        basePrice: 20,
        priceDescription: "Starting at $20 + $4-8 per chart based on complexity"
      },
      data_analysis: {
        name: "Data Analysis", 
        description: "Statistical analysis, regression, ANOVA, machine learning, and predictive modeling",
        basePrice: 25,
        priceDescription: "Starting at $25 + analysis costs based on complexity and model type"
      },
      ai_insights: {
        name: "AI Insights",
        description: "Intelligent business insights, predictive analysis, pattern recognition, and automated reporting",
        basePrice: 35,
        priceDescription: "Starting at $35 + AI processing costs based on model complexity"
      }
    };
  }

  /**
   * Calculate quick estimate for feature selection
   */
  static getQuickEstimate(
    fileSizeBytes: number,
    recordCount: number,
    columnCount: number,
    selectedFeatures: string[]
  ): { estimatedCost: number; timeEstimate: number } {
    const simplifiedRequest: DynamicPricingRequest = {
      fileSizeBytes,
      recordCount,
      columnCount,
      complexityFactors: {
        piiColumnsCount: 0,
        uniqueIdentifiersCount: 0,
        missingDataPercentage: 10,
        dataTypes: { numerical: 5, categorical: 3, datetime: 1, text: 1 },
        outliersDetected: false,
        needsNormalization: false
      },
      selectedFeatures: selectedFeatures as any,
      featureRequirements: {}
    };
    
    const pricing = this.calculateDynamicPricing(simplifiedRequest);
    return {
      estimatedCost: Math.ceil(pricing.finalTotal),
      timeEstimate: pricing.estimatedProcessing.timeMinutes
    };
  }
}