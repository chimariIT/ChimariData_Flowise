/**
 * Data Elements Handler
 *
 * HTTP route handlers for data elements and requirements
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { dataElementsService } from '../data-elements-service';

const router = Router();

/**
 * Get required data elements document
 */
router.get('/:id/required-data-elements', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const result = await dataElementsService.getRequiredDataElements({ projectId, userId });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Get required data elements error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get required data elements',
    });
  }
});

/**
 * Generate data requirements document
 */
router.post('/:id/generate-data-requirements', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const { userGoals, userQuestions, structuredQuestions, industry } = req.body;

    if (!userGoals || !Array.isArray(userGoals) || userGoals.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'User goals are required',
      });
    }

    const result = await dataElementsService.generateRequirements(
      projectId,
      userId,
      {
        userGoals,
        userQuestions,
        structuredQuestions,
        industry,
      }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Generate data requirements error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to generate data requirements',
    });
  }
});

/**
 * Map data elements to columns
 */
router.post('/:id/map-data-elements', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const { columnMappings } = req.body;

    if (!columnMappings || !Array.isArray(columnMappings)) {
      return res.status(400).json({
        success: false,
        error: 'Column mappings are required',
      });
    }

    const result = await dataElementsService.updateElementMappings(
      projectId,
      userId,
      columnMappings
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Map data elements error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to map data elements',
    });
  }
});

/**
 * Enrich data elements with business definitions
 */
router.post('/:id/enrich-data-elements', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const { elements } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({
        success: false,
        error: 'Elements array is required',
      });
    }

    const result = await dataElementsService.enrichDataElements({
      projectId,
      userId,
      elements,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Enrich data elements error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to enrich data elements',
    });
  }
});

/**
 * Validate element mappings
 */
router.post('/:id/validate-mapping', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const { mapping } = req.body;

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Mapping object is required',
      });
    }

    const result = await dataElementsService.validateMapping({
      projectId,
      userId,
      mapping,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Validate mapping error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to validate mapping',
    });
  }
});

/**
 * PM supervised mapping
 */
router.post('/:id/pm-supervised-mapping', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const { context } = req.body;

    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Context object is required',
      });
    }

    const result = await dataElementsService.pmSupervisedMapping({
      projectId,
      userId,
      context,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('PM supervised mapping error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to perform PM supervised mapping',
    });
  }
});

/**
 * Get business definitions for a concept
 */
router.get('/:id/business-definitions/:conceptName', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId, conceptName } = req.params;
    const userId = (req.user as any)?.id;

    const result = await dataElementsService.getBusinessDefinitions(
      projectId,
      userId,
      conceptName
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Get business definitions error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get business definitions',
    });
  }
});

export default router;
