import * as expressModule from 'express';
import type _express from 'express';
const express: typeof _express = (expressModule as any).default || expressModule;
import { EnhancedWorkflowService } from '../enhanced-workflow-service';
import { EnhancedMCPService } from '../enhanced-mcp-service';
import { db } from '../db';
import { projects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import * as multerModule from 'multer';
import type _multer from 'multer';
const multer: typeof _multer = (multerModule as any).default || multerModule;
import { BusinessTemplates } from '../services/business-templates';
import WebSocket from 'ws';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype) ||
        file.originalname.toLowerCase().match(/\.(csv|json|xlsx|xls|txt)$/)) {
      cb(null, true);
    } else {
      // Multer expects null for error and false to reject
      cb(null, false);
    }
  }
});

/**
 * Initialize enhanced analysis workflow
 */
router.post('/workflow/initialize', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, workflowType, configuration } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!projectId || !workflowType) {
      return res.status(400).json({ error: 'Missing required fields: projectId, workflowType' });
    }

    const workflowId = await EnhancedWorkflowService.initializeWorkflow(
      projectId,
      userId,
      workflowType,
      configuration || {}
    );

    res.json({
      success: true,
      workflowId,
      message: 'Enhanced analysis workflow initialized',
      supportedTypes: ['full_analysis', 'statistical_only', 'ml_only', 'visualization_only']
    });

  } catch (error: any) {
    console.error('Failed to initialize enhanced workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Execute workflow with file uploads
 */
router.post('/workflow/execute', upload.array('files', 10), async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, workflowType, configuration } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!projectId) {
      return res.status(400).json({ error: 'Missing projectId' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prepare configuration
    const config = {
      workflowType: workflowType || 'full_analysis',
      userId,
      ...(typeof configuration === 'string' ? JSON.parse(configuration) : configuration || {})
    };

    // Execute workflow
    const result = await EnhancedWorkflowService.executeWorkflow(
      projectId,
      files.map(file => ({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype
      })),
      config
    );

    res.json({
      success: true,
      ...result,
      message: 'Enhanced analysis workflow executed successfully'
    });

  } catch (error: any) {
    console.error('Failed to execute enhanced workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Execute workflow with provided data
 */
router.post('/workflow/execute-data', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, data, configuration } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!projectId || !data) {
      return res.status(400).json({ error: 'Missing required fields: projectId, data' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prepare configuration
    const config = {
      workflowType: configuration?.workflowType || 'full_analysis',
      userId,
      ...configuration
    };

    // Execute workflow
    const result = await EnhancedWorkflowService.executeWorkflowWithData(
      projectId,
      data,
      config
    );

    res.json({
      success: true,
      ...result,
      message: 'Enhanced analysis workflow executed successfully with provided data'
    });

  } catch (error: any) {
    console.error('Failed to execute enhanced workflow with data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get workflow status and progress
 */
router.get('/workflow/status/:projectId', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const status = await EnhancedWorkflowService.getWorkflowStatus(projectId);

    res.json(status);

  } catch (error: any) {
    console.error('Failed to get workflow status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Pause workflow execution
 */
router.post('/workflow/pause/:projectId', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await EnhancedWorkflowService.pauseWorkflow(projectId);

    res.json({
      success: true,
      message: 'Workflow paused successfully'
    });

  } catch (error: any) {
    console.error('Failed to pause workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Resume workflow execution
 */
router.post('/workflow/resume/:projectId', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await EnhancedWorkflowService.resumeWorkflow(projectId);

    res.json({
      success: true,
      message: 'Workflow resumed successfully'
    });

  } catch (error: any) {
    console.error('Failed to resume workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel workflow execution
 */
router.post('/workflow/cancel/:projectId', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await EnhancedWorkflowService.cancelWorkflow(projectId);

    res.json({
      success: true,
      message: 'Workflow cancelled successfully'
    });

  } catch (error: any) {
    console.error('Failed to cancel workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get available analysis capabilities
 */
router.get('/capabilities', async (req, res) => {
  try {
    const capabilities = {
      workflowTypes: [
        {
          id: 'full_analysis',
          name: 'Full Analysis',
          description: 'Complete analysis including statistical tests, ML, and visualizations',
          components: ['file_processing', 'schema_generation', 'data_preparation', 'statistical_analysis', 'ml_analysis', 'visualization', 'insights']
        },
        {
          id: 'statistical_only',
          name: 'Statistical Analysis Only',
          description: 'Focus on statistical tests and hypothesis testing',
          components: ['file_processing', 'schema_generation', 'data_preparation', 'statistical_analysis', 'insights']
        },
        {
          id: 'ml_only',
          name: 'Machine Learning Only',
          description: 'Focus on ML model training and predictions',
          components: ['file_processing', 'schema_generation', 'data_preparation', 'ml_analysis', 'insights']
        },
        {
          id: 'visualization_only',
          name: 'Visualization Only',
          description: 'Focus on data visualization and exploration',
          components: ['file_processing', 'schema_generation', 'data_preparation', 'visualization', 'insights']
        }
      ],
      supportedFileTypes: [
        { extension: 'csv', mimeType: 'text/csv', description: 'Comma-separated values' },
        { extension: 'json', mimeType: 'application/json', description: 'JSON data format' },
        { extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', description: 'Excel spreadsheet' },
        { extension: 'xls', mimeType: 'application/vnd.ms-excel', description: 'Legacy Excel format' },
        { extension: 'txt', mimeType: 'text/plain', description: 'Text file' }
      ],
      analysisTypes: {
        statistical: ['descriptive', 'anova', 'ancova', 'manova', 'mancova', 'regression'],
        machineLearning: ['regression', 'classification', 'clustering', 'timeseries', 'anomaly', 'association'],
        visualization: ['histogram', 'scatter', 'correlation', 'boxplot', 'heatmap', 'line_chart', 'bar_chart', 'pie_chart']
      },
      agents: EnhancedMCPService.getAvailableRoles().map(role => ({
        name: role.name,
        description: role.description,
        capabilities: role.capabilities,
        permissions: role.permissions
      })),
      resources: EnhancedMCPService.getAllResources().map(resource => ({
        name: resource.name,
        type: resource.type,
        permissions: resource.permissions
      })),
      businessTemplates: BusinessTemplates.list()
    };

    res.json(capabilities);

  } catch (error: any) {
    console.error('Failed to get capabilities:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Execute specific analysis component
 */
router.post('/component/execute', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, component, data, configuration } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!projectId || !component || !data) {
      return res.status(400).json({ error: 'Missing required fields: projectId, component, data' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.ownerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Execute specific component
  const result = await executeSpecificComponent(component, data, configuration, userId);

    res.json({
      success: true,
      component,
      result,
      message: `${component} executed successfully`
    });

  } catch (error: any) {
    console.error('Failed to execute component:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get real-time workflow updates via WebSocket
 */
router.get('/workflow/subscribe/:projectId', (req, res) => {
  const { projectId } = req.params;

  // This would typically be handled by a WebSocket upgrade
  // For now, we'll return instructions for WebSocket connection
  res.json({
    message: 'Use WebSocket connection for real-time updates',
    websocketUrl: `/ws/workflow/${projectId}`,
    events: [
      'step_started',
      'step_completed',
      'step_failed',
      'workflow_completed',
      'workflow_failed',
      'progress_update'
    ]
  });
});

// Helper method for executing specific components
async function executeSpecificComponent(component: string, data: any[], configuration: any, userId: string): Promise<any> {
  // This would route to specific analysis components
  switch (component) {
    case 'schema_generation':
      // Execute schema generation only
      return { schema: 'generated', columns: Object.keys(data[0] || {}).length };

    case 'data_transformation':
      // Execute data transformation only
      return { transformedRecords: data.length, transformations: configuration.transformations || [] };

    case 'statistical_analysis':
      // Execute statistical analysis only
      return { analysisType: configuration.analysisType || 'descriptive', results: 'completed' };

    case 'ml_analysis':
      // Execute ML analysis only
      return { modelType: configuration.modelType || 'classification', accuracy: 0.85 };

    case 'visualization':
      // Execute visualization only
      return { charts: configuration.chartTypes || ['histogram'], count: 3 };

    default:
      throw new Error(`Unknown component: ${component}`);
  }
}

export default router;