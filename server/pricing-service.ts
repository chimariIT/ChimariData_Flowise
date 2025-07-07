import { PricingTier } from "@shared/schema";

export class PricingService {
  private static basePrices: PricingTier = {
    transformation: 15,
    analysis: 25,
    visualization: 20,
    ai_insights: 35,
    twoFeatures: 0.15,
    threeFeatures: 0.25,
    allFeatures: 0.35
  };

  static calculatePrice(features: string[]): {
    subtotal: number;
    discount: number;
    total: number;
    breakdown: Record<string, number>;
  } {
    const featureCount = features.length;
    let subtotal = 0;
    const breakdown: Record<string, number> = {};

    // Calculate subtotal
    features.forEach(feature => {
      const price = this.basePrices[feature as keyof PricingTier] as number;
      if (typeof price === 'number' && price > 0) {
        subtotal += price;
        breakdown[feature] = price;
      }
    });

    // Calculate discount
    let discountRate = 0;
    if (featureCount === 2) {
      discountRate = this.basePrices.twoFeatures;
    } else if (featureCount === 3) {
      discountRate = this.basePrices.threeFeatures;
    } else if (featureCount >= 4) {
      discountRate = this.basePrices.allFeatures;
    }

    const discount = subtotal * discountRate;
    const total = subtotal - discount;

    return {
      subtotal,
      discount,
      total,
      breakdown
    };
  }

  static getFeatureDescriptions(): Record<string, { name: string; description: string; price: number }> {
    return {
      transformation: {
        name: "Data Transformation",
        description: "Clean, filter, and reshape your data with advanced Python processing",
        price: this.basePrices.transformation
      },
      analysis: {
        name: "Statistical Analysis",
        description: "Comprehensive statistical analysis with correlation, regression, and more",
        price: this.basePrices.analysis
      },
      visualization: {
        name: "Data Visualizations",
        description: "Professional charts, graphs, and interactive visualizations",
        price: this.basePrices.visualization
      },
      ai_insights: {
        name: "AI Insights",
        description: "Intelligent data interpretation with Chimaridata AI technology",
        price: this.basePrices.ai_insights
      }
    };
  }

  static getDiscountInfo(): { tiers: Array<{ features: number; discount: number; description: string }> } {
    return {
      tiers: [
        {
          features: 1,
          discount: 0,
          description: "Single feature - full price"
        },
        {
          features: 2,
          discount: this.basePrices.twoFeatures,
          description: `Two features - ${(this.basePrices.twoFeatures * 100).toFixed(0)}% discount`
        },
        {
          features: 3,
          discount: this.basePrices.threeFeatures,
          description: `Three features - ${(this.basePrices.threeFeatures * 100).toFixed(0)}% discount`
        },
        {
          features: 4,
          discount: this.basePrices.allFeatures,
          description: `All features - ${(this.basePrices.allFeatures * 100).toFixed(0)}% discount`
        }
      ]
    };
  }

  static validateFeatures(features: string[]): { valid: boolean; invalidFeatures: string[] } {
    const validFeatures = ["transformation", "analysis", "visualization", "ai_insights"];
    const invalidFeatures = features.filter(f => !validFeatures.includes(f));
    
    return {
      valid: invalidFeatures.length === 0,
      invalidFeatures
    };
  }

  static getFreeTrialLimits(): { maxFileSize: number; description: string } {
    return {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      description: "Free trial includes: data upload (max 10MB), schema detection, descriptive analysis, and basic visualizations"
    };
  }
}