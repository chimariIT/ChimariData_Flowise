/**
 * ML/LLM Usage Tracking Service
 * 
 * Tracks usage of ML and LLM fine-tuning tools for billing and quota management
 */

import { db } from '../db';
import { eq, and, gte, lte } from 'drizzle-orm';
import { mlUsageLog } from '../../shared/schema';

export interface MLUsageEvent {
  userId: string;
  projectId?: string;
  toolName: string;
  modelType?: 'traditional_ml' | 'llm';
  libraryUsed?: string;  // 'sklearn', 'lightgbm', 'lora', 'qlora', etc.
  datasetSize: number;  // Number of rows/samples
  executionTimeMs: number;
  billingUnits: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface MLUsageSummary {
  total_billing_units: number;
  total_jobs: number;
  successful_jobs: number;
  failed_jobs: number;
  by_tool: Record<string, { count: number; billing_units: number }>;
  by_library: Record<string, { count: number; billing_units: number }>;
  by_model_type: Record<string, { count: number; billing_units: number }>;
}

export class MLLLMUsageTracker {
  /**
   * Log ML/LLM usage event
   */
  async logUsage(event: MLUsageEvent): Promise<void> {
    try {
      console.log('ML/LLM Usage Event:', {
        userId: event.userId,
        toolName: event.toolName,
        modelType: event.modelType,
        libraryUsed: event.libraryUsed,
        datasetSize: event.datasetSize,
        billingUnits: event.billingUnits,
        success: event.success,
        timestamp: new Date().toISOString()
      });

      await db.insert(mlUsageLog).values({
        userId: event.userId,
        projectId: event.projectId,
        toolName: event.toolName,
        modelType: event.modelType,
        libraryUsed: event.libraryUsed,
        datasetSize: event.datasetSize,
        executionTimeMs: event.executionTimeMs,
        billingUnits: event.billingUnits,
        success: event.success,
        error: event.error,
        metadata: event.metadata,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to log ML/LLM usage:', error);
      // Don't throw - usage tracking shouldn't break the main functionality
    }
  }

  /**
   * Get user's ML/LLM usage for billing period
   */
  async getUserUsage(userId: string, startDate: Date, endDate: Date): Promise<MLUsageSummary> {
    try {
      const usage = await db.select()
        .from(mlUsageLog)
        .where(
          and(
            eq(mlUsageLog.userId, userId),
            gte(mlUsageLog.timestamp, startDate),
            lte(mlUsageLog.timestamp, endDate)
          )
        );

      return {
        total_billing_units: usage.reduce((sum, u) => sum + u.billingUnits, 0),
        total_jobs: usage.length,
        successful_jobs: usage.filter(u => u.success).length,
        failed_jobs: usage.filter(u => !u.success).length,
        by_tool: this.groupByTool(usage),
        by_library: this.groupByLibrary(usage),
        by_model_type: this.groupByModelType(usage)
      };
    } catch (error) {
      console.error('Failed to get user ML/LLM usage:', error);
      return {
        total_billing_units: 0,
        total_jobs: 0,
        successful_jobs: 0,
        failed_jobs: 0,
        by_tool: {},
        by_library: {},
        by_model_type: {}
      };
    }
  }

  /**
   * Get user's current month ML/LLM usage
   */
  async getCurrentMonthUsage(userId: string): Promise<MLUsageSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.getUserUsage(userId, startOfMonth, now);
  }

  /**
   * Check if user has exceeded ML training job quota
   */
  async checkMLTrainingQuota(userId: string, userTier: string): Promise<{
    allowed: boolean;
    reason?: string;
    currentJobs: number;
    maxJobs: number;
  }> {
    const usage = await this.getCurrentMonthUsage(userId);
    const currentJobs = usage.by_tool.comprehensive_ml_pipeline?.count || 0;
    
    // Get tier limits (we'll import this from unified subscription tiers)
    const tierLimits = this.getTierLimits(userTier);
    const maxJobs = tierLimits.mlTrainingJobs;
    
    if (maxJobs !== -1 && currentJobs >= maxJobs) {
      return {
        allowed: false,
        reason: `ML training job limit reached. Your ${userTier} plan allows ${maxJobs} ML training job(s) per month.`,
        currentJobs,
        maxJobs
      };
    }
    
    return {
      allowed: true,
      currentJobs,
      maxJobs
    };
  }

  /**
   * Check if user has exceeded AutoML trial quota
   */
  async checkAutoMLQuota(userId: string, userTier: string): Promise<{
    allowed: boolean;
    reason?: string;
    currentTrials: number;
    maxTrials: number;
  }> {
    const usage = await this.getCurrentMonthUsage(userId);
    const currentTrials = usage.by_tool.automl_optimizer?.count || 0;
    
    const tierLimits = this.getTierLimits(userTier);
    const maxTrials = tierLimits.mlAutoMLTrials;
    
    if (maxTrials !== -1 && currentTrials >= maxTrials) {
      return {
        allowed: false,
        reason: `AutoML trial limit reached. Your ${userTier} plan allows ${maxTrials} AutoML trial(s) per month.`,
        currentTrials,
        maxTrials
      };
    }
    
    return {
      allowed: true,
      currentTrials,
      maxTrials
    };
  }

  /**
   * Check if user has exceeded LLM fine-tuning job quota
   */
  async checkLLMFineTuningQuota(userId: string, userTier: string): Promise<{
    allowed: boolean;
    reason?: string;
    currentJobs: number;
    maxJobs: number;
  }> {
    const usage = await this.getCurrentMonthUsage(userId);
    const llmJobs = (usage.by_tool.llm_fine_tuning?.count || 0) + 
                    (usage.by_tool.lora_fine_tuning?.count || 0);
    
    const tierLimits = this.getTierLimits(userTier);
    const maxJobs = tierLimits.llmFineTuningJobs;
    
    if (maxJobs !== -1 && llmJobs >= maxJobs) {
      return {
        allowed: false,
        reason: `LLM fine-tuning job limit reached. Your ${userTier} plan allows ${maxJobs} LLM fine-tuning job(s) per month.`,
        currentJobs: llmJobs,
        maxJobs
      };
    }
    
    return {
      allowed: true,
      currentJobs: llmJobs,
      maxJobs
    };
  }

  /**
   * Calculate billing units for ML training
   */
  calculateMLBillingUnits(toolName: string, datasetSize: number, useAutoML?: boolean, trials?: number): number {
    let billingUnits = 0;

    if (toolName === 'comprehensive_ml_pipeline') {
      const baseUnits = Math.ceil(datasetSize / 10000); // 1 unit per 10K rows
      const autoMLMultiplier = useAutoML ? 5 : 1;
      billingUnits = baseUnits * autoMLMultiplier;
    } else if (toolName === 'automl_optimizer') {
      const trialCount = trials || 50;
      billingUnits = Math.ceil(trialCount / 10); // 1 unit per 10 trials
    } else if (toolName === 'ml_library_selector') {
      billingUnits = 0.1; // Minimal cost for recommendation
    } else if (toolName === 'ml_health_check') {
      billingUnits = 0; // Free
    }

    return billingUnits;
  }

  /**
   * Calculate billing units for LLM fine-tuning
   */
  calculateLLMBillingUnits(toolName: string, datasetSize: number, method?: 'full' | 'lora' | 'qlora', numEpochs?: number): number {
    let billingUnits = 0;

    if (toolName.includes('llm')) {
      const baseCostPer1K = {
        full: 10,
        lora: 3,
        qlora: 2
      };
      
      const samplesInK = datasetSize / 1000;
      const epochs = numEpochs || 3;
      const methodCost = baseCostPer1K[method || 'qlora'];
      billingUnits = Math.ceil(methodCost * samplesInK * epochs);
    } else if (toolName === 'llm_method_recommendation') {
      billingUnits = 0.1; // Minimal cost for recommendation
    } else if (toolName === 'llm_health_check') {
      billingUnits = 0; // Free
    }

    return billingUnits;
  }

  /**
   * Private helper methods
   */
  private groupByTool(usage: any[]): Record<string, { count: number; billing_units: number }> {
    const grouped: Record<string, { count: number; billing_units: number }> = {};
    usage.forEach(u => {
      if (!grouped[u.toolName]) {
        grouped[u.toolName] = { count: 0, billing_units: 0 };
      }
      grouped[u.toolName].count++;
      grouped[u.toolName].billing_units += u.billingUnits;
    });
    return grouped;
  }

  private groupByLibrary(usage: any[]): Record<string, { count: number; billing_units: number }> {
    const grouped: Record<string, { count: number; billing_units: number }> = {};
    usage.forEach(u => {
      const lib = u.libraryUsed || 'unknown';
      if (!grouped[lib]) {
        grouped[lib] = { count: 0, billing_units: 0 };
      }
      grouped[lib].count++;
      grouped[lib].billing_units += u.billingUnits;
    });
    return grouped;
  }

  private groupByModelType(usage: any[]): Record<string, { count: number; billing_units: number }> {
    const grouped: Record<string, { count: number; billing_units: number }> = {};
    usage.forEach(u => {
      const type = u.modelType || 'unknown';
      if (!grouped[type]) {
        grouped[type] = { count: 0, billing_units: 0 };
      }
      grouped[type].count++;
      grouped[type].billing_units += u.billingUnits;
    });
    return grouped;
  }

  private getTierLimits(tier: string): any {
    // TODO: Import from unified subscription tiers
    const configs = {
      trial: { mlTrainingJobs: 5, mlAutoMLTrials: 0, llmFineTuningJobs: 0 },
      starter: { mlTrainingJobs: 50, mlAutoMLTrials: 0, llmFineTuningJobs: 0 },
      professional: { mlTrainingJobs: 500, mlAutoMLTrials: 1000, llmFineTuningJobs: 10 },
      enterprise: { mlTrainingJobs: -1, mlAutoMLTrials: -1, llmFineTuningJobs: 100 }
    };
    return configs[tier as keyof typeof configs] || configs.trial;
  }
}

// Export singleton instance
export const mlLLMUsageTracker = new MLLLMUsageTracker();
