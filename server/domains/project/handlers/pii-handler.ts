/**
 * PII Handler
 *
 * HTTP route handlers for PII analysis and filtering
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { piiService } from '../pii-service';

const router = Router();

/**
 * Get PII analysis results
 */
router.get('/:id/pii-analysis', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const result = await piiService.analyzePII(projectId, userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('PII analysis error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to analyze PII',
    });
  }
});

/**
 * Get excluded columns from PII decision
 */
router.get('/:id/pii/excluded-columns', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const excludedColumns = await piiService.getExcludedColumns(projectId, userId);

    res.json({
      success: true,
      excludedColumns,
    });
  } catch (error: any) {
    console.error('Get excluded columns error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get excluded columns',
    });
  }
});

/**
 * Update PII decision
 */
router.post('/:id/pii/decision', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const { excludeAllPII, excludedColumns, keepColumns } = req.body;

    if (excludeAllPII === undefined && !excludedColumns && !keepColumns) {
      return res.status(400).json({
        success: false,
        error: 'At least one decision parameter is required',
      });
    }

    await piiService.updatePIIDecision(projectId, userId, {
      excludeAllPII,
      excludedColumns: excludedColumns || [],
      keepColumns: keepColumns || [],
    });

    res.json({
      success: true,
      message: 'PII decision updated',
    });
  } catch (error: any) {
    console.error('Update PII decision error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to update PII decision',
    });
  }
});

/**
 * Apply PII exclusions to data
 */
router.post('/:id/pii/apply-exclusions', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const { excludedColumns } = req.body;

    if (!excludedColumns || !Array.isArray(excludedColumns)) {
      return res.status(400).json({
        success: false,
        error: 'Excluded columns array is required',
      });
    }

    const result = await piiService.applyPIIExclusions(projectId, userId, excludedColumns);

    res.json({
      success: true,
      message: 'PII exclusions applied',
      ...result,
    });
  } catch (error: any) {
    console.error('Apply PII exclusions error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ValidationError ? 400 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to apply PII exclusions',
    });
  }
});

export default router;
