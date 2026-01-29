/**
 * Cloud Connectors API Routes
 *
 * Sprint 4: API endpoints for cloud storage integrations
 * Supports AWS S3, Azure Blob Storage, and Google Drive
 */

import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { cloudConnectorService, CloudConnectorConfig } from '../cloud-connectors';
import { GoogleDriveService, googleDriveService } from '../services/google-drive';
import { storage } from '../services/storage';
import { z } from 'zod';

const router = Router();

// ==========================================
// SCHEMAS
// ==========================================

const AWSConfigSchema = z.object({
  provider: z.literal('aws'),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    region: z.string().min(1),
    bucket: z.string().min(1),
  }),
});

const AzureConfigSchema = z.object({
  provider: z.literal('azure'),
  credentials: z.object({
    connectionString: z.string().min(1),
    containerName: z.string().min(1),
  }),
});

const GCPConfigSchema = z.object({
  provider: z.literal('gcp'),
  credentials: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().optional(),
  }),
});

const CloudConfigSchema = z.discriminatedUnion('provider', [
  AWSConfigSchema,
  AzureConfigSchema,
  GCPConfigSchema,
]);

// ==========================================
// ENDPOINTS
// ==========================================

/**
 * GET /api/cloud-connectors/providers
 * List available cloud storage providers
 */
router.get('/providers', async (req, res) => {
  res.json({
    success: true,
    providers: [
      {
        id: 'aws',
        name: 'Amazon S3',
        description: 'Amazon Simple Storage Service',
        requiredCredentials: ['accessKeyId', 'secretAccessKey', 'region', 'bucket'],
        configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
      },
      {
        id: 'azure',
        name: 'Azure Blob Storage',
        description: 'Microsoft Azure Blob Storage',
        requiredCredentials: ['connectionString', 'containerName'],
        configured: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
      },
      {
        id: 'gcp',
        name: 'Google Drive',
        description: 'Google Drive file storage',
        requiredCredentials: ['accessToken'],
        authUrl: GoogleDriveService.getAuthUrl ? GoogleDriveService.getAuthUrl() : null,
        configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      },
    ],
  });
});

/**
 * POST /api/cloud-connectors/test
 * Test connection to a cloud storage provider
 */
router.post('/test', ensureAuthenticated, async (req, res) => {
  try {
    const config = CloudConfigSchema.parse(req.body);

    let result;
    if (config.provider === 'gcp') {
      // For Google Drive, use the specific service
      const driveService = new GoogleDriveService();
      await driveService.initializeWithToken(
        config.credentials.accessToken,
        config.credentials.refreshToken
      );
      result = await driveService.testConnection();
    } else {
      // For AWS/Azure, use the cloud connector service
      result = await cloudConnectorService.testConnection(config as CloudConnectorConfig);
    }

    res.json({
      success: result.success,
      message: result.message,
      fileCount: result.fileCount,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration',
        details: error.errors,
      });
    }
    console.error('Cloud connector test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

/**
 * POST /api/cloud-connectors/list-files
 * List files from a cloud storage provider
 */
router.post('/list-files', ensureAuthenticated, async (req, res) => {
  try {
    const config = CloudConfigSchema.parse(req.body);
    const { path } = req.query;

    let files;
    if (config.provider === 'gcp') {
      const driveService = new GoogleDriveService();
      await driveService.initializeWithToken(
        config.credentials.accessToken,
        config.credentials.refreshToken
      );
      const driveFiles = await driveService.listFiles(path as string);
      files = driveFiles.map(f => ({
        name: f.name,
        path: f.id, // Google Drive uses file IDs as paths
        size: f.size,
        lastModified: new Date(f.modifiedTime),
        contentType: f.mimeType,
      }));
    } else {
      files = await cloudConnectorService.listFiles(config as CloudConnectorConfig, path as string);
    }

    res.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration',
        details: error.errors,
      });
    }
    console.error('List files failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list files',
    });
  }
});

/**
 * POST /api/cloud-connectors/download
 * Download a file from cloud storage
 */
router.post('/download', ensureAuthenticated, async (req, res) => {
  try {
    const config = CloudConfigSchema.parse(req.body);
    const { filePath, fileName } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required',
      });
    }

    let buffer;
    let name = fileName;

    if (config.provider === 'gcp') {
      const driveService = new GoogleDriveService();
      await driveService.initializeWithToken(
        config.credentials.accessToken,
        config.credentials.refreshToken
      );
      buffer = await driveService.downloadFile(filePath);
      if (!name) {
        const metadata = await driveService.getFileMetadata(filePath);
        name = metadata.name;
      }
    } else {
      buffer = await cloudConnectorService.downloadFile(config as CloudConnectorConfig, filePath);
      name = name || filePath.split('/').pop() || 'downloaded-file';
    }

    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration',
        details: error.errors,
      });
    }
    console.error('Download failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download file',
    });
  }
});

/**
 * POST /api/cloud-connectors/import-to-project
 * Import a file from cloud storage to a project
 */
router.post('/import-to-project', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const config = CloudConfigSchema.parse(req.body);
    const { projectId, filePath, fileName } = req.body;

    if (!projectId || !filePath) {
      return res.status(400).json({
        success: false,
        error: 'projectId and filePath are required',
      });
    }

    // Verify project access
    const project = await storage.getProject(projectId);
    if (!project || (project.userId !== userId && !(req.user as any)?.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to project',
      });
    }

    // Download the file
    let buffer;
    let name = fileName;
    let mimeType = 'application/octet-stream';

    if (config.provider === 'gcp') {
      const driveService = new GoogleDriveService();
      await driveService.initializeWithToken(
        config.credentials.accessToken,
        config.credentials.refreshToken
      );
      buffer = await driveService.downloadFile(filePath);
      const metadata = await driveService.getFileMetadata(filePath);
      name = name || metadata.name;
      mimeType = metadata.mimeType;
    } else {
      buffer = await cloudConnectorService.downloadFile(config as CloudConnectorConfig, filePath);
      name = name || filePath.split('/').pop() || 'imported-file';
    }

    // Create dataset entry
    const dataset = await storage.createDataset({
      userId,
      originalFileName: name,
      mimeType,
      fileSize: buffer.length,
      storageUri: `cloud://${config.provider}/${filePath}`,
      sourceType: config.provider,
      status: 'ready',
    } as any);

    // Link dataset to project via projectDatasets junction table
    await storage.addDatasetToProject(projectId, dataset.id, 'primary');

    // Store the file data
    // This would typically save to disk or another storage
    console.log(`📥 [CloudConnectors] Imported ${name} (${buffer.length} bytes) to project ${projectId}`);

    res.json({
      success: true,
      message: `Successfully imported ${name}`,
      dataset: {
        id: dataset.id,
        name: dataset.originalFileName,
        size: buffer.length,
        source: config.provider,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration',
        details: error.errors,
      });
    }
    console.error('Import failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to import file',
    });
  }
});

// ==========================================
// GOOGLE DRIVE OAUTH ENDPOINTS
// ==========================================

/**
 * GET /api/cloud-connectors/google-drive/auth-url
 * Get Google Drive OAuth authorization URL
 */
router.get('/google-drive/auth-url', ensureAuthenticated, async (req, res) => {
  try {
    const authUrl = GoogleDriveService.getAuthUrl();
    res.json({
      success: true,
      authUrl,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate auth URL',
    });
  }
});

/**
 * POST /api/cloud-connectors/google-drive/exchange-code
 * Exchange OAuth authorization code for tokens
 */
router.post('/google-drive/exchange-code', ensureAuthenticated, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required',
      });
    }

    const tokens = await GoogleDriveService.getTokenFromCode(code);

    res.json({
      success: true,
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      },
    });
  } catch (error: any) {
    console.error('Token exchange failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to exchange authorization code',
    });
  }
});

/**
 * GET /api/cloud-connectors/google-drive/files
 * List files from Google Drive (requires token in header)
 */
router.get('/google-drive/files', ensureAuthenticated, async (req, res) => {
  try {
    const accessToken = req.headers['x-google-access-token'] as string;
    const refreshToken = req.headers['x-google-refresh-token'] as string;
    const { query } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Google Drive access token required (x-google-access-token header)',
      });
    }

    const driveService = new GoogleDriveService();
    await driveService.initializeWithToken(accessToken, refreshToken);
    const files = await driveService.listFiles(query as string);

    res.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error: any) {
    console.error('List Google Drive files failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list files',
    });
  }
});

export default router;
