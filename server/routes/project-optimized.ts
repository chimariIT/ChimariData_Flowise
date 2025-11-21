import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from './auth';
import { canAccessProject, isAdmin } from '../middleware/ownership';
import { storage } from '../services/storage';

const router = Router();

// GET /api/projects/:id/results - Optimized results endpoint with pagination
router.get('/:id/results', ensureAuthenticated, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 100, include = 'summary' } = req.query;
  const userId = (req.user as any)?.id;

  try {
    // ✅ Authorization check
    const accessCheck = await canAccessProject(userId, id, isAdmin(req));
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // ✅ Fetch real project from database
    const project = await storage.getProject(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Calculate actual record count from data array
    const dataArray = Array.isArray(project.data) ? project.data : [];
    const recordCount = dataArray.length;

    // Return lightweight results first
    const lightweightResults = {
      success: true,
      projectId: id,
      summary: {
        name: project.name || `Project ${id}`,
        recordCount,
        dataSizeMB: Math.max(1, Math.round(recordCount * 0.001)),
        schema: project.schema || {},
        lastUpdated: project.uploadedAt
      },
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(recordCount / parseInt(limit as string)),
        hasMore: recordCount > parseInt(page as string) * parseInt(limit as string)
      },
      includes: include as string,
      loadingStages: [
        'Loading project data',
        'Preparing analysis components',
        'Generating visualizations',
        'Computing statistics',
        'Finalizing results'
      ]
    };

    res.json(lightweightResults);
  } catch (error: any) {
    console.error('Error fetching optimized project results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load project results'
    });
  }
});

// GET /api/projects/:id/details - Get detailed project data with pagination
router.get('/:id/details', ensureAuthenticated, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const userId = (req.user as any)?.id;

  try {
    // ✅ Authorization check
    const accessCheck = await canAccessProject(userId, id, isAdmin(req));
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // ✅ Fetch real project from database
    const project = await storage.getProject(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get actual data array
    const dataArray = Array.isArray(project.data) ? project.data : [];
    const recordCount = dataArray.length;

    // Paginate data
    const startIndex = (parseInt(page as string) - 1) * parseInt(limit as string);
    const endIndex = startIndex + parseInt(limit as string);

    const paginatedData = {
      success: true,
      projectId: id,
      data: dataArray.slice(startIndex, endIndex),
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: recordCount,
        totalPages: Math.ceil(recordCount / parseInt(limit as string)),
        hasNext: endIndex < recordCount,
        hasPrev: parseInt(page as string) > 1
      }
    };

    res.json(paginatedData);
  } catch (error: any) {
    console.error('Error fetching project details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load project details'
    });
  }
});

// GET /api/projects/:id/visualizations - Get project visualizations
router.get('/:id/visualizations', ensureAuthenticated, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req.user as any)?.id;

  try {
    // ✅ Authorization check
    const accessCheck = await canAccessProject(userId, id, isAdmin(req));
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // ✅ Fetch real project from database
    const project = await storage.getProject(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    console.log(`✅ User ${userId} accessing visualizations for project ${id}`);

    // ✅ Normalize data for existing projects
    const normalizedSchema = project.schema || {};
    const normalizedData = Array.isArray(project.data) ? project.data : [];
    const normalizedVisualizations = Array.isArray(project.visualizations) ? project.visualizations : [];

    // ✅ Auto-generate schema if missing (for existing projects)
    if (Object.keys(normalizedSchema).length === 0 && normalizedData.length > 0) {
      console.log(`📊 Auto-generating schema for project ${id}`);
      const firstRow = normalizedData[0];
      for (const key of Object.keys(firstRow)) {
        const value = firstRow[key];
        normalizedSchema[key] = {
          type: typeof value === 'number' ? 'number' :
                typeof value === 'boolean' ? 'boolean' : 'string',
          nullable: value === null || value === undefined
        };
      }
    }

    // ✅ Return actual visualization data with real schema and data
    const visualizations = {
      success: true,
      projectId: id,
      visualizations: normalizedVisualizations,
      schema: normalizedSchema,
      data: normalizedData,
      chartTypes: ['bar', 'line', 'pie', 'scatter', 'histogram', 'boxplot', 'heatmap', 'area'],
      loading: false,
      // ✅ Add helpful metadata
      dataAvailable: normalizedData.length > 0,
      schemaAvailable: Object.keys(normalizedSchema).length > 0,
      visualizationsCreated: normalizedVisualizations.length
    };

    res.json(visualizations);
  } catch (error: any) {
    console.error('Error fetching project visualizations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load visualizations'
    });
  }
});

export default router;












