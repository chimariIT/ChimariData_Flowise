import type { Request, Response, NextFunction } from 'express';
import { UsageTrackingService } from '../services/usage-tracking.js';
import { RolePermissionService } from '../services/role-permission.js';

// Extend Express Request type to include usage tracking data
declare global {
  namespace Express {
    interface Request {
      usageCheck?: {
        allowed: boolean;
        currentUsage: number;
        limit: number;
        remainingUsage: number;
        percentageUsed: number;
        shouldPromptUpgrade: boolean;
        recommendedTier?: string;
      };
      userLimits?: {
        maxAiQueries: number;
        maxDataUploads: number;
        maxDataVolumeMB: number;
        maxProjects: number;
        maxVisualizations: number;
        canGenerateCode: boolean;
        consultationMinutesIncluded: number;
      };
    }
  }
}

export interface SubscriptionValidationOptions {
  usageType?: 'aiQueries' | 'dataUploads' | 'dataVolume' | 'projects';
  additionalUsage?: number;
  trackUsage?: boolean;
  gracePeriod?: boolean; // Allow some overage for user experience
  upgradePromptThreshold?: number; // Percentage at which to prompt upgrade (default 80%)
}

/**
 * Middleware to validate subscription limits before allowing access to features
 */
export const validateSubscriptionLimits = (options: SubscriptionValidationOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get user limits and attach to request
      req.userLimits = await UsageTrackingService.getUserLimits(userId);

      // If no usage type specified, just attach limits and continue
      if (!options.usageType) {
        return next();
      }

      // Check specific usage limit
      const usageCheck = await UsageTrackingService.checkUsageLimit(
        userId,
        options.usageType,
        options.additionalUsage || 1
      );

      // Attach usage check results to request
      req.usageCheck = usageCheck;

      // Determine if we should block the request
      const shouldBlock = !usageCheck.allowed && !options.gracePeriod;

      if (shouldBlock) {
        return res.status(429).json({
          error: "Usage limit exceeded",
          usageType: options.usageType,
          currentUsage: usageCheck.currentUsage,
          limit: usageCheck.limit,
          percentageUsed: usageCheck.percentageUsed,
          shouldUpgrade: usageCheck.shouldPromptUpgrade,
          recommendedTier: usageCheck.recommendedTier,
          upgradeUrl: "/pricing"
        });
      }

      // If tracking is enabled and usage is allowed, track it
      if (options.trackUsage && usageCheck.allowed) {
        switch (options.usageType) {
          case 'aiQueries':
            // Don't track here as it should be tracked in the specific AI service
            break;
          case 'dataUploads':
            // File size tracking should be handled in upload endpoint
            break;
          default:
            // Other usage types can be tracked here if needed
            break;
        }
      }

      next();
    } catch (error) {
      console.error("Subscription validation error:", error);
      res.status(500).json({ error: "Failed to validate subscription" });
    }
  };
};

/**
 * Middleware to check if user can access specific features
 */
export const requireFeatureAccess = (feature: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      let hasAccess = false;

      // Check feature-specific access
      switch (feature) {
        case 'codeGeneration':
          hasAccess = await RolePermissionService.hasPermission(userId, 'canGenerateCode');
          break;
        case 'advancedAnalytics':
          hasAccess = await RolePermissionService.hasPermission(userId, 'canAccessAdvancedAnalytics');
          break;
        case 'customAiKeys':
          hasAccess = await RolePermissionService.hasPermission(userId, 'canUseCustomAiKeys');
          break;
        case 'rawDataAccess':
          hasAccess = await RolePermissionService.hasPermission(userId, 'canAccessRawData');
          break;
        case 'exportResults':
          hasAccess = await RolePermissionService.hasPermission(userId, 'canExportResults');
          break;
        default:
          hasAccess = true; // Unknown features default to allowed
          break;
      }

      if (!hasAccess) {
        return res.status(403).json({
          error: `Feature '${feature}' not available with your current subscription`,
          feature,
          upgradeUrl: "/pricing"
        });
      }

      next();
    } catch (error) {
      console.error("Feature access check error:", error);
      res.status(500).json({ error: "Failed to check feature access" });
    }
  };
};

/**
 * Middleware to track AI query usage
 */
export const trackAiUsage = (queryType: 'simple' | 'advanced' | 'code_generation' = 'simple') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const usageResult = await UsageTrackingService.trackAiQuery(userId, queryType);

      if (!usageResult.allowed) {
        return res.status(429).json({
          error: "AI query limit exceeded",
          currentUsage: usageResult.currentUsage,
          limit: usageResult.limit,
          percentageUsed: usageResult.percentageUsed,
          shouldUpgrade: usageResult.shouldPromptUpgrade,
          recommendedTier: usageResult.recommendedTier,
          upgradeUrl: "/pricing"
        });
      }

      // Add usage info to response headers for frontend
      res.set({
        'X-AI-Usage-Current': usageResult.currentUsage.toString(),
        'X-AI-Usage-Limit': usageResult.limit.toString(),
        'X-AI-Usage-Remaining': usageResult.remainingUsage.toString(),
        'X-AI-Usage-Percentage': usageResult.percentageUsed.toFixed(2)
      });

      // Attach usage info to request for potential use in route handlers
      req.usageCheck = usageResult;

      next();
    } catch (error) {
      console.error("AI usage tracking error:", error);
      res.status(500).json({ error: "Failed to track AI usage" });
    }
  };
};

/**
 * Middleware to validate file upload size
 */
export const validateFileUploadSize = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if file size is provided in the request
      const fileSize = req.body?.fileSize || req.headers['content-length'];
      const fileSizeMB = fileSize ? parseFloat(fileSize) / (1024 * 1024) : 0;

      if (fileSizeMB > 0) {
        const usageResult = await UsageTrackingService.checkUsageLimit(
          userId,
          'dataVolume',
          fileSizeMB
        );

        if (!usageResult.allowed) {
          return res.status(413).json({
            error: "File size exceeds your plan limits",
            fileSizeMB: fileSizeMB.toFixed(2),
            currentUsage: usageResult.currentUsage,
            limit: usageResult.limit,
            upgradeUrl: "/pricing"
          });
        }

        // Add file size info to request
        req.usageCheck = usageResult;
      }

      next();
    } catch (error) {
      console.error("File upload validation error:", error);
      res.status(500).json({ error: "Failed to validate file upload" });
    }
  };
};

/**
 * Middleware to provide usage information in API responses
 */
export const attachUsageInfo = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next();
      }

      // Get current usage and limits
      const [currentUsage, userLimits] = await Promise.all([
        UsageTrackingService.getCurrentUsage(userId),
        UsageTrackingService.getUserLimits(userId)
      ]);

      // Check if user should be prompted to upgrade
      const upgradePrompt = await UsageTrackingService.shouldPromptUpgrade(userId);

      // Add usage info to response
      const originalJson = res.json.bind(res);
      res.json = function(data: any) {
        const responseData = {
          ...data,
          usage: {
            current: currentUsage,
            limits: userLimits,
            upgradePrompt: upgradePrompt.shouldPrompt ? {
              reason: upgradePrompt.reason,
              recommendedTier: upgradePrompt.recommendedTier,
              urgency: upgradePrompt.urgency
            } : null
          }
        };
        return originalJson(responseData);
      };

      next();
    } catch (error) {
      console.error("Error attaching usage info:", error);
      next(); // Continue without usage info rather than failing
    }
  };
};

/**
 * Middleware to handle subscription upgrade notifications
 */
export const handleUpgradeNotifications = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next();
      }

      const upgradePrompt = await UsageTrackingService.shouldPromptUpgrade(userId);

      if (upgradePrompt.shouldPrompt && upgradePrompt.urgency === 'high') {
        // Add upgrade notification to response headers
        res.set({
          'X-Upgrade-Required': 'true',
          'X-Upgrade-Reason': upgradePrompt.reason,
          'X-Upgrade-Tier': upgradePrompt.recommendedTier,
          'X-Upgrade-Urgency': upgradePrompt.urgency
        });
      }

      next();
    } catch (error) {
      console.error("Error handling upgrade notifications:", error);
      next();
    }
  };
};