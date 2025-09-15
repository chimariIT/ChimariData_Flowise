import crypto from 'crypto';
import { storage } from './storage';
import { 
  PricingEstimateRequest, 
  PricingEstimateResponse,
  CostEstimate,
  InsertCostEstimate 
} from '@shared/schema';
import { nanoid } from 'nanoid';

interface CostItem {
  description: string;
  quantity: number;
  unitPrice: number; // in cents
  total: number; // in cents
}

interface PricingCalculation {
  items: CostItem[];
  subtotal: number; // in cents
  discounts: number; // in cents
  total: number; // in cents
}

interface CacheEntry {
  estimate: CostEstimate;
  timestamp: number;
  ttlMs: number;
}

export class PricingService {
  private static instance: PricingService;
  private estimateCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly ESTIMATE_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes
  private readonly SECRET_KEY = process.env.PRICING_SECRET_KEY || 'dev-pricing-secret-key-change-in-production';

  // Base pricing in cents (divide by 100 for dollars)
  private readonly BASE_PRICES = {
    preparation: 500, // $5.00
    data_processing: 1000, // $10.00
    analysis: 1500, // $15.00
    visualization: 1200, // $12.00
    ai_insights: 2000, // $20.00
  };

  // Journey type multipliers
  private readonly JOURNEY_MULTIPLIERS = {
    guided: 1.0,
    business: 1.25,
    technical: 1.5,
  };

  // Complexity multipliers
  private readonly COMPLEXITY_MULTIPLIERS = {
    basic: 1.0,
    intermediate: 1.3,
    advanced: 1.6,
  };

  // Data size pricing per MB (in cents)
  private readonly DATA_SIZE_RATE = 10; // $0.10 per MB

  // Progressive discounts for multiple features
  private readonly MULTI_FEATURE_DISCOUNTS = {
    2: 0.10, // 10% off for 2 features
    3: 0.20, // 20% off for 3 features
    4: 0.25, // 25% off for 4 features
    5: 0.30, // 30% off for 5+ features
  };

  public static getInstance(): PricingService {
    if (!PricingService.instance) {
      PricingService.instance = new PricingService();
    }
    return PricingService.instance;
  }

  /**
   * Generate a hash of the pricing inputs for caching
   */
  private generateInputsHash(request: PricingEstimateRequest): string {
    const canonical = {
      journeyType: request.journeyType,
      features: request.features.sort(), // Sort for consistency
      dataSizeMB: request.dataSizeMB,
      complexityLevel: request.complexityLevel,
      expectedQuestions: request.expectedQuestions,
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  /**
   * Calculate pricing based on request parameters
   */
  private calculatePricing(request: PricingEstimateRequest): PricingCalculation {
    const items: CostItem[] = [];
    let subtotal = 0;

    // Journey type multiplier
    const journeyMultiplier = this.JOURNEY_MULTIPLIERS[request.journeyType];
    
    // Complexity multiplier
    const complexityMultiplier = this.COMPLEXITY_MULTIPLIERS[request.complexityLevel];

    // Feature-based pricing
    for (const feature of request.features) {
      const basePrice = this.BASE_PRICES[feature as keyof typeof this.BASE_PRICES];
      if (!basePrice) continue;

      const adjustedPrice = Math.round(basePrice * journeyMultiplier * complexityMultiplier);
      
      items.push({
        description: `${feature.replace('_', ' ').toUpperCase()} (${request.journeyType} journey, ${request.complexityLevel} complexity)`,
        quantity: 1,
        unitPrice: adjustedPrice,
        total: adjustedPrice,
      });
      
      subtotal += adjustedPrice;
    }

    // Data size pricing
    if (request.dataSizeMB > 0) {
      const dataSizeCost = Math.round(request.dataSizeMB * this.DATA_SIZE_RATE);
      items.push({
        description: `Data processing (${request.dataSizeMB} MB)`,
        quantity: request.dataSizeMB,
        unitPrice: this.DATA_SIZE_RATE,
        total: dataSizeCost,
      });
      subtotal += dataSizeCost;
    }

    // Questions complexity pricing
    if (request.expectedQuestions > 5) {
      const additionalQuestions = request.expectedQuestions - 5;
      const questionCost = additionalQuestions * 200; // $2.00 per additional question
      items.push({
        description: `Additional analysis questions (${additionalQuestions} extra)`,
        quantity: additionalQuestions,
        unitPrice: 200,
        total: questionCost,
      });
      subtotal += questionCost;
    }

    // Calculate progressive discounts
    let discounts = 0;
    const featureCount = request.features.length;
    if (featureCount >= 2) {
      const discountRate = this.MULTI_FEATURE_DISCOUNTS[Math.min(featureCount, 5) as keyof typeof this.MULTI_FEATURE_DISCOUNTS];
      discounts = Math.round(subtotal * discountRate);
    }

    const total = subtotal - discounts;

    return {
      items,
      subtotal,
      discounts,
      total,
    };
  }

  /**
   * Generate HMAC signature for cost estimate
   */
  private generateSignature(payload: object): string {
    const canonicalPayload = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.SECRET_KEY)
      .update(canonicalPayload)
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  public verifySignature(payload: object, signature: string): boolean {
    try {
      const expectedSignature = this.generateSignature(payload);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.estimateCache.entries()) {
      if (now - entry.timestamp > entry.ttlMs) {
        this.estimateCache.delete(key);
      }
    }
  }

  /**
   * Generate a signed cost estimate
   */
  public async generateEstimate(
    request: PricingEstimateRequest, 
    userId: string
  ): Promise<PricingEstimateResponse> {
    try {
      // Check cache first
      const inputsHash = this.generateInputsHash(request);
      this.cleanExpiredCache();
      
      const cached = this.estimateCache.get(inputsHash);
      if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
        const expiresInMs = cached.estimate.validUntil.getTime() - Date.now();
        return {
          success: true,
          estimateId: cached.estimate.id,
          items: cached.estimate.items as any,
          subtotal: cached.estimate.subtotal,
          discounts: cached.estimate.discounts,
          total: cached.estimate.total,
          currency: cached.estimate.currency,
          signature: cached.estimate.signature,
          validUntil: cached.estimate.validUntil,
          expiresInMs: Math.max(0, expiresInMs),
        };
      }

      // Calculate new pricing
      const calculation = this.calculatePricing(request);
      const estimateId = nanoid();
      const validUntil = new Date(Date.now() + this.ESTIMATE_VALIDITY_MS);
      const nonce = nanoid();

      // Create signable payload
      const signablePayload = {
        estimateId,
        userId,
        journeyType: request.journeyType,
        features: request.features.sort(),
        subtotal: calculation.subtotal,
        discounts: calculation.discounts,
        total: calculation.total,
        expiresAt: validUntil.toISOString(),
        nonce,
      };

      const signature = this.generateSignature(signablePayload);

      // Store in database
      const estimateData: InsertCostEstimate = {
        journeyId: request.journeyId || null,
        userId,
        estimateType: 'full_journey',
        items: calculation.items,
        subtotal: calculation.subtotal,
        discounts: calculation.discounts,
        taxes: 0, // No taxes for now
        total: calculation.total,
        currency: 'USD',
        signature,
        validUntil,
        approved: false,
      };

      const estimate = await storage.createCostEstimate(estimateData);

      // Cache the result
      this.estimateCache.set(inputsHash, {
        estimate,
        timestamp: Date.now(),
        ttlMs: this.CACHE_TTL_MS,
      });

      const expiresInMs = validUntil.getTime() - Date.now();

      return {
        success: true,
        estimateId: estimate.id,
        items: calculation.items,
        subtotal: calculation.subtotal,
        discounts: calculation.discounts,
        total: calculation.total,
        currency: 'USD',
        signature,
        validUntil,
        expiresInMs,
      };

    } catch (error) {
      console.error('Error generating pricing estimate:', error);
      return {
        success: false,
        estimateId: '',
        items: [],
        subtotal: 0,
        discounts: 0,
        total: 0,
        currency: 'USD',
        signature: '',
        validUntil: new Date(),
        expiresInMs: 0,
        error: 'Failed to generate pricing estimate',
      };
    }
  }

  /**
   * Verify a cost estimate signature and expiry
   */
  public async verifyEstimate(estimateId: string, signature: string): Promise<{
    valid: boolean;
    estimate?: CostEstimate;
    error?: string;
  }> {
    try {
      const estimate = await storage.getCostEstimate(estimateId);
      if (!estimate) {
        return { valid: false, error: 'Estimate not found' };
      }

      // Check expiry
      if (new Date() > estimate.validUntil) {
        return { valid: false, error: 'Estimate has expired' };
      }

      // Verify signature matches stored signature
      if (estimate.signature !== signature) {
        return { valid: false, error: 'Invalid signature' };
      }

      return { valid: true, estimate };

    } catch (error) {
      console.error('Error verifying estimate:', error);
      return { valid: false, error: 'Verification failed' };
    }
  }

  /**
   * Confirm an estimate and mark it as approved
   */
  public async confirmEstimate(
    estimateId: string, 
    signature: string, 
    journeyId: string
  ): Promise<{
    success: boolean;
    estimate?: CostEstimate;
    error?: string;
  }> {
    try {
      // First verify the estimate
      const verification = await this.verifyEstimate(estimateId, signature);
      if (!verification.valid || !verification.estimate) {
        return { 
          success: false, 
          error: verification.error || 'Invalid estimate' 
        };
      }

      // Mark as approved and associate with journey
      const updatedEstimate = await storage.updateCostEstimate(estimateId, {
        approved: true,
        approvedAt: new Date(),
        journeyId,
      });

      if (!updatedEstimate) {
        return { success: false, error: 'Failed to confirm estimate' };
      }

      return { success: true, estimate: updatedEstimate };

    } catch (error) {
      console.error('Error confirming estimate:', error);
      return { success: false, error: 'Confirmation failed' };
    }
  }

  /**
   * Get estimate summary for display purposes (without sensitive data)
   */
  public async getEstimateSummary(estimateId: string): Promise<{
    found: boolean;
    total?: number;
    currency?: string;
    valid?: boolean;
    error?: string;
  }> {
    try {
      const estimate = await storage.getCostEstimate(estimateId);
      if (!estimate) {
        return { found: false, error: 'Estimate not found' };
      }

      const isValid = new Date() <= estimate.validUntil;

      return {
        found: true,
        total: estimate.total,
        currency: estimate.currency,
        valid: isValid,
      };

    } catch (error) {
      console.error('Error getting estimate summary:', error);
      return { found: false, error: 'Failed to retrieve estimate' };
    }
  }

  // Legacy methods for backward compatibility
  static calculatePrice(features: string[]): {
    subtotal: number;
    discount: number;
    total: number;
    breakdown: Record<string, number>;
  } {
    const basePrices = {
      transformation: 15,
      analysis: 25,
      visualization: 20,
      ai_insights: 35,
    };

    const featureCount = features.length;
    let subtotal = 0;
    const breakdown: Record<string, number> = {};

    // Calculate subtotal
    features.forEach(feature => {
      const price = basePrices[feature as keyof typeof basePrices];
      if (typeof price === 'number' && price > 0) {
        subtotal += price;
        breakdown[feature] = price;
      }
    });

    // Calculate discount
    let discountRate = 0;
    if (featureCount === 2) {
      discountRate = 0.15;
    } else if (featureCount === 3) {
      discountRate = 0.25;
    } else if (featureCount >= 4) {
      discountRate = 0.35;
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

  static getFreeTrialLimits(): { maxFileSize: number; description: string } {
    return {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      description: "Free trial includes: data upload (max 10MB), schema detection, descriptive analysis, and basic visualizations"
    };
  }

  /**
   * Get feature descriptions for pricing display
   */
  static getFeatureDescriptions(): Record<string, { name: string; description: string; basePrice: number }> {
    return {
      transformation: {
        name: "Data Transformation",
        description: "Clean, reshape, and prepare your data for analysis. Includes missing value handling, data type conversion, and custom transformations.",
        basePrice: 15
      },
      analysis: {
        name: "Advanced Analysis",
        description: "Comprehensive statistical analysis including descriptive statistics, correlation analysis, hypothesis testing, and regression modeling.",
        basePrice: 25
      },
      visualization: {
        name: "Interactive Visualizations",
        description: "Generate professional charts, graphs, and interactive dashboards to explore and present your data insights.",
        basePrice: 20
      },
      ai_insights: {
        name: "AI-Powered Insights",
        description: "Get intelligent recommendations, automated pattern detection, and natural language explanations of your data.",
        basePrice: 35
      }
    };
  }

  /**
   * Get discount information for pricing display
   */
  static getDiscountInfo(): Record<string, { rate: number; description: string }> {
    return {
      two_features: {
        rate: 0.15,
        description: "15% off when you select 2 features"
      },
      three_features: {
        rate: 0.25,
        description: "25% off when you select 3 features"
      },
      four_plus_features: {
        rate: 0.35,
        description: "35% off when you select 4 or more features"
      }
    };
  }

  /**
   * Validate that all provided features are supported
   */
  static validateFeatures(features: string[]): { valid: boolean; invalidFeatures?: string[] } {
    if (!Array.isArray(features)) {
      return { valid: false, invalidFeatures: [] };
    }

    const validFeatures = ['transformation', 'analysis', 'visualization', 'ai_insights'];
    const invalidFeatures = features.filter(feature => 
      typeof feature !== 'string' || !validFeatures.includes(feature)
    );

    return {
      valid: invalidFeatures.length === 0,
      invalidFeatures: invalidFeatures.length > 0 ? invalidFeatures : undefined
    };
  }
}

// Export singleton instance
export const pricingService = PricingService.getInstance();