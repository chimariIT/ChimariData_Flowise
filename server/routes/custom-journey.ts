/**
 * Custom Journey API Routes
 *
 * Handles "Build Your Own" journey capability selection and execution
 * Integrates with unified-billing-service for subscription-based billing
 */

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import {
  CAPABILITIES,
  getCapabilitiesByCategory,
  getCapabilityById,
  getCustomJourneyToolExecutions,
  getCustomJourneyUsageSummary,
  validateCapabilityDependencies,
  type CapabilityCategory
} from '../../shared/custom-journey-capabilities';
import { getBillingService } from '../services/billing/unified-billing-service';
import { db } from '../db';
import { projects, datasets } from '../../shared/schema';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/custom-journey/capabilities
 * Get all available capabilities filtered by user's subscription tier
 */
router.get('/capabilities', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user;
    const userTier = user?.subscriptionTier || 'trial';

    // Filter capabilities based on subscription tier
    const tierHierarchy = {
      trial: 0,
      starter: 1,
      professional: 2,
      enterprise: 3
    };

    const userTierLevel = tierHierarchy[userTier as keyof typeof tierHierarchy] || 0;

    const accessibleCapabilities = CAPABILITIES.filter(cap => {
      if (!cap.minSubscriptionTier) return true; // No tier requirement
      const requiredLevel = tierHierarchy[cap.minSubscriptionTier];
      return userTierLevel >= requiredLevel;
    });

    // Group by category
    const categorized = accessibleCapabilities.reduce((acc, cap) => {
      if (!acc[cap.category]) {
        acc[cap.category] = [];
      }
      acc[cap.category].push(cap);
      return acc;
    }, {} as Record<CapabilityCategory, typeof CAPABILITIES>);

    res.json({
      success: true,
      userTier,
      totalCapabilities: accessibleCapabilities.length,
      categories: categorized,
      capabilities: accessibleCapabilities
    });
  } catch (error: any) {
    console.error('Error fetching capabilities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch capabilities',
      message: error.message
    });
  }
});

/**
 * POST /api/custom-journey/validate
 * Validate selected capabilities (dependencies, subscription tier, quota)
 */
router.post('/validate', ensureAuthenticated, async (req, res) => {
  try {
    const { selectedCapabilityIds, datasetInfo } = req.body;
    const user = req.user;

    if (!selectedCapabilityIds || !Array.isArray(selectedCapabilityIds)) {
      return res.status(400).json({
        success: false,
        error: 'selectedCapabilityIds must be an array'
      });
    }

    // 1. Validate dependencies
    const dependencyValidation = validateCapabilityDependencies(selectedCapabilityIds);

    if (!dependencyValidation.valid) {
      return res.json({
        success: false,
        valid: false,
        error: 'Missing required capabilities',
        missingDependencies: dependencyValidation.missingDependencies
      });
    }

    // 2. Get tool executions and estimated duration
    const toolExecution = getCustomJourneyToolExecutions(selectedCapabilityIds);

    // 3. Check subscription eligibility with unified billing service
    const billingService = getBillingService();
    const usageSummary = getCustomJourneyUsageSummary(selectedCapabilityIds, {
      recordCount: datasetInfo?.recordCount || 1000,
      sizeGB: datasetInfo?.sizeGB || 0.001
    });

    // Determine highest complexity
    const complexityLevels = { basic: 1, intermediate: 2, advanced: 3 };
    const maxComplexity = Math.max(...toolExecution.capabilities.map(c =>
      complexityLevels[c.complexity]
    ));
    const complexityLabel = maxComplexity === 3 ? 'advanced' :
                            maxComplexity === 2 ? 'intermediate' : 'basic';

    const eligibility = await billingService.checkEligibility(user!.id, {
      journeyType: 'custom',
      dataVolume: usageSummary.dataVolume,
      complexity: complexityLabel
    });

    res.json({
      success: true,
      valid: dependencyValidation.valid && eligibility.canProceed,
      selectedCapabilities: toolExecution.capabilities,
      estimatedDuration: toolExecution.estimatedDuration,
      toolExecutions: usageSummary.toolExecutions.length,
      eligibility: {
        canProceed: eligibility.canProceed,
        reason: eligibility.reason,
        quotaRemaining: eligibility.quotaRemaining,
        upgradeRequired: eligibility.upgradeRequired
      },
      usageEstimate: {
        toolExecutions: usageSummary.toolExecutions.length,
        features: usageSummary.featureIds,
        dataVolume: usageSummary.dataVolume,
        complexity: complexityLabel
      }
    });
  } catch (error: any) {
    console.error('Error validating capabilities:', error);
    res.status(500).json({
      success: false,
      error: 'Validation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/custom-journey/create
 * Create a new project with custom journey configuration
 */
router.post('/create', ensureAuthenticated, async (req, res) => {
  try {
    const { selectedCapabilityIds, name, description, datasetId } = req.body;
    const user = req.user;

    if (!selectedCapabilityIds || !Array.isArray(selectedCapabilityIds) || selectedCapabilityIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Must select at least one capability'
      });
    }

    // Validate capabilities
    const dependencyValidation = validateCapabilityDependencies(selectedCapabilityIds);
    if (!dependencyValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required capabilities',
        missingDependencies: dependencyValidation.missingDependencies
      });
    }

    // Get dataset info if provided
    let datasetInfo = { recordCount: 1000, sizeGB: 0.001 };
    if (datasetId) {
      const dataset = await db.query.datasets.findFirst({
        where: eq(datasets.id, datasetId)
      });

      if (dataset) {
        datasetInfo = {
          recordCount: dataset.recordCount || 1000,
          sizeGB: (dataset.sizeBytes || 1048576) / (1024 * 1024 * 1024)
        };
      }
    }

    // Check eligibility
    const billingService = getBillingService();
    const usageSummary = getCustomJourneyUsageSummary(selectedCapabilityIds, datasetInfo);

    const toolExecution = getCustomJourneyToolExecutions(selectedCapabilityIds);
    const complexityLevels = { basic: 1, intermediate: 2, advanced: 3 };
    const maxComplexity = Math.max(...toolExecution.capabilities.map(c =>
      complexityLevels[c.complexity]
    ));
    const complexityLabel = maxComplexity === 3 ? 'advanced' :
                            maxComplexity === 2 ? 'intermediate' : 'basic';

    const eligibility = await billingService.checkEligibility(user!.id, {
      journeyType: 'custom',
      dataVolume: usageSummary.dataVolume,
      complexity: complexityLabel
    });

    if (!eligibility.canProceed) {
      return res.status(403).json({
        success: false,
        error: eligibility.reason,
        quotaRemaining: eligibility.quotaRemaining,
        upgradeRequired: eligibility.upgradeRequired
      });
    }

    // Create project
    const projectId = nanoid();
    const projectName = name || 'Custom Journey Project';
    const projectDescription = description || `Custom analysis with: ${selectedCapabilityIds.join(', ')}`;

    await db.insert(projects).values({
      id: projectId,
      userId: user!.id,
      ownerId: user!.id,
      name: projectName,
      description: projectDescription,
      journeyType: 'custom',
      status: 'draft',
      // Store custom journey config in analysis results for now
      analysisResults: {
        customJourneyConfig: {
          selectedCapabilities: selectedCapabilityIds,
          datasetId,
          estimatedDuration: toolExecution.estimatedDuration,
          usageSummary
        }
      }
    });

    // Link dataset if provided
    if (datasetId) {
      const { projectDatasets } = await import('../../shared/schema');
      await db.insert(projectDatasets).values({
        projectId,
        datasetId
      });
    }

    res.json({
      success: true,
      project: {
        id: projectId,
        name: projectName,
        description: projectDescription,
        journeyType: 'custom',
        customConfig: {
          selectedCapabilities: selectedCapabilityIds,
          estimatedDuration: toolExecution.estimatedDuration,
          toolExecutions: usageSummary.toolExecutions.length
        }
      }
    });
  } catch (error: any) {
    console.error('Error creating custom journey project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project',
      message: error.message
    });
  }
});

/**
 * GET /api/custom-journey/project/:projectId
 * Get custom journey project configuration
 */
router.get('/project/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const user = req.user;

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    if (project.userId !== user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (project.journeyType !== 'custom') {
      return res.status(400).json({
        success: false,
        error: 'Not a custom journey project'
      });
    }

    const customConfig = (project.analysisResults as any)?.customJourneyConfig;

    res.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        journeyType: project.journeyType,
        customConfig
      }
    });
  } catch (error: any) {
    console.error('Error fetching custom journey project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project',
      message: error.message
    });
  }
});

/**
 * GET /api/custom-journey/capability/:capabilityId
 * Get detailed information about a specific capability
 */
router.get('/capability/:capabilityId', ensureAuthenticated, async (req, res) => {
  try {
    const { capabilityId } = req.params;
    const capability = getCapabilityById(capabilityId);

    if (!capability) {
      return res.status(404).json({
        success: false,
        error: 'Capability not found'
      });
    }

    res.json({
      success: true,
      capability
    });
  } catch (error: any) {
    console.error('Error fetching capability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch capability',
      message: error.message
    });
  }
});

export default router;
