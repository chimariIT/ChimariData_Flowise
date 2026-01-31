/**
 * Artifacts API Routes
 *
 * Handles artifact retrieval and download for generated project artifacts
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { projectArtifacts, projects } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

/**
 * POST /api/projects/:projectId/artifacts
 * 
 * Create a new artifact for a project
 */
router.post('/projects/:projectId/artifacts',
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { type, status, fileRefs, metrics, output, params } = req.body;
      const userId = (req.user as any)?.id;
      const isAdmin = (req.user as any)?.isAdmin || false;

      // Verify project access
      const accessCheck = await canAccessProject(userId, projectId, isAdmin);
      if (!accessCheck.allowed) {
        return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
          success: false,
          error: accessCheck.reason
        });
      }

      // Create artifact
      const [newArtifact] = await db
        .insert(projectArtifacts)
        .values({
          projectId,
          type: type || 'dashboard',
          status: status || 'created',
          fileRefs: fileRefs ? JSON.stringify(fileRefs) : null,
          metrics: metrics ? JSON.stringify(metrics) : null,
          output: output ? JSON.stringify(output) : null,
          params: params ? JSON.stringify(params) : null,
        } as any)
        .returning();

      console.log(`✅ Created artifact ${newArtifact.id} for project ${projectId}`);

      return res.json({
        success: true,
        artifact: newArtifact
      });

    } catch (error) {
      console.error('❌ Error creating artifact:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create artifact'
      });
    }
  }
);

/**
 * GET /api/projects/:projectId/artifacts
 *
 * Get all artifacts for a project
 */
router.get('/projects/:projectId/artifacts',
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const userId = (req.user as any)?.id;
      const isAdmin = (req.user as any)?.isAdmin || false;

      // Verify project access
      const accessCheck = await canAccessProject(userId, projectId, isAdmin);
      if (!accessCheck.allowed) {
        return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
          success: false,
          error: accessCheck.reason
        });
      }

      // Get all artifacts for this project
      const artifacts = await db
        .select()
        .from(projectArtifacts)
        .where(eq(projectArtifacts.projectId, projectId))
        .orderBy(desc(projectArtifacts.createdAt));

      console.log(`✅ Retrieved ${artifacts.length} artifacts for project ${projectId}`);

      return res.json({
        success: true,
        artifacts: artifacts.map((artifact: typeof projectArtifacts.$inferSelect) => {
          const parseField = (value: any, fallback: any) => {
            if (!value) return fallback;
            if (typeof value === 'string') {
              try {
                return JSON.parse(value);
              } catch {
                return fallback;
              }
            }
            return value;
          };

          return {
            id: artifact.id,
            type: artifact.type,
            status: artifact.status,
            fileRefs: parseField(artifact.fileRefs, []),
            metrics: parseField(artifact.metrics, {}),
            output: parseField(artifact.output, {}),
            params: parseField(artifact.params, {}),
            createdAt: artifact.createdAt,
            updatedAt: artifact.updatedAt
          };
        })
      });

    } catch (error) {
      console.error('❌ Error fetching artifacts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch artifacts'
      });
    }
  }
);

/**
 * GET /api/projects/:projectId/artifacts/status
 *
 * P2-1: Lightweight endpoint for polling artifact generation status
 * Returns only counts and generation status without full artifact data
 */
router.get('/projects/:projectId/artifacts/status',
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const userId = (req.user as any)?.id;
      const isAdmin = (req.user as any)?.isAdmin || false;

      // Verify project access
      const accessCheck = await canAccessProject(userId, projectId, isAdmin);
      if (!accessCheck.allowed) {
        return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
          success: false,
          error: accessCheck.reason
        });
      }

      // Get artifact counts by status
      const artifacts = await db
        .select({
          id: projectArtifacts.id,
          type: projectArtifacts.type,
          status: projectArtifacts.status,
          createdAt: projectArtifacts.createdAt
        })
        .from(projectArtifacts)
        .where(eq(projectArtifacts.projectId, projectId));

      const total = artifacts.length;
      const completed = artifacts.filter((a: { status: string | null }) => a.status === 'completed' || a.status === 'ready').length;
      const pending = artifacts.filter((a: { status: string | null }) => a.status === 'pending' || a.status === 'generating').length;
      const failed = artifacts.filter((a: { status: string | null }) => a.status === 'failed' || a.status === 'error').length;

      // Check if files exist on disk
      const artifactDir = path.join(process.cwd(), 'uploads', 'artifacts', projectId);
      const filesOnDisk = fs.existsSync(artifactDir) ? fs.readdirSync(artifactDir).length : 0;

      // Determine overall generation status
      let generationStatus: 'not_started' | 'in_progress' | 'completed' | 'partial' | 'failed';
      if (total === 0 && filesOnDisk === 0) {
        generationStatus = 'not_started';
      } else if (pending > 0) {
        generationStatus = 'in_progress';
      } else if (failed > 0 && completed === 0) {
        generationStatus = 'failed';
      } else if (completed === total && total > 0) {
        generationStatus = 'completed';
      } else {
        generationStatus = 'partial';
      }

      // If no DB artifacts but files exist, check file system
      const hasFilesButNoDBRecords = total === 0 && filesOnDisk > 0;

      return res.json({
        success: true,
        status: generationStatus,
        counts: {
          total,
          completed,
          pending,
          failed,
          filesOnDisk
        },
        hasFilesButNoDBRecords,
        ready: generationStatus === 'completed' || (hasFilesButNoDBRecords && filesOnDisk > 0),
        artifactTypes: artifacts.map((a: { type: string | null; status: string | null }) => ({ type: a.type, status: a.status }))
      });

    } catch (error) {
      console.error('❌ Error checking artifact status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check artifact status'
      });
    }
  }
);

/**
 * GET /api/artifacts/:projectId/:filename
 *
 * Download an artifact file
 */
router.get('/artifacts/:projectId/:filename',
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { projectId, filename } = req.params;
      const userId = (req.user as any)?.id;

      // Security: Prevent directory traversal using path.resolve() validation
      const uploadsBaseDir = path.resolve(process.cwd(), 'uploads', 'artifacts');
      const filePath = path.resolve(uploadsBaseDir, projectId, filename);

      if (!filePath.startsWith(uploadsBaseDir + path.sep)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: invalid path'
        });
      }

      // Verify project ownership
      const isAdmin = (req.user as any)?.isAdmin || false;
      const accessCheck = await canAccessProject(userId, projectId, isAdmin);
      if (!accessCheck.allowed) {
        return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
          success: false,
          error: accessCheck.reason
        });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found on disk'
        });
      }

      // Set appropriate content type
      const ext = path.extname(filename).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      console.log(`📥 Serving artifact file: ${filename}`);

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('❌ Error downloading artifact:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to download artifact'
      });
    }
  }
);

export default router;
