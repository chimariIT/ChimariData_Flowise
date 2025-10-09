import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';

const router = Router();

// GET /api/projects/:id/results - Optimized results endpoint with pagination
router.get('/:id/results', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 100, include = 'summary' } = req.query;
  
  try {
    const project = await getProject(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false,
        error: 'Project not found' 
      });
    }
    
    // Return lightweight results first
    const lightweightResults = {
      success: true,
      projectId: id,
      summary: {
        name: project.name,
        recordCount: project.recordCount || 0,
        dataSizeMB: Math.max(1, Math.round((project.recordCount || 0) * 0.001)),
        schema: project.schema || {},
        lastUpdated: project.updatedAt || project.createdAt
      },
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil((project.recordCount || 0) / parseInt(limit as string)),
        hasMore: (project.recordCount || 0) > parseInt(page as string) * parseInt(limit as string)
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
router.get('/:id/details', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  
  try {
    const project = await getProject(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false,
        error: 'Project not found' 
      });
    }
    
    // Simulate paginated data loading
    const startIndex = (parseInt(page as string) - 1) * parseInt(limit as string);
    const endIndex = startIndex + parseInt(limit as string);
    
    const paginatedData = {
      success: true,
      projectId: id,
      data: project.data?.slice(startIndex, endIndex) || [],
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: project.recordCount || 0,
        totalPages: Math.ceil((project.recordCount || 0) / parseInt(limit as string)),
        hasNext: endIndex < (project.recordCount || 0),
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
router.get('/:id/visualizations', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const project = await getProject(id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false,
        error: 'Project not found' 
      });
    }
    
    // Return lightweight visualization data
    const visualizations = {
      success: true,
      projectId: id,
      visualizations: project.visualizations || [],
      chartTypes: ['bar', 'line', 'pie', 'scatter', 'histogram', 'boxplot'],
      loading: false
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

// Helper function to get project (mock implementation)
async function getProject(id: string) {
  // In production, this would fetch from database
  // For now, return mock data
  return {
    id,
    name: `Project ${id}`,
    recordCount: 1000,
    data: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      value: Math.random() * 100,
      category: `Category ${i % 10}`
    })),
    schema: {
      id: 'number',
      value: 'number', 
      category: 'string'
    },
    visualizations: [
      { type: 'bar', title: 'Value Distribution', config: {} },
      { type: 'pie', title: 'Category Breakdown', config: {} }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export default router;




