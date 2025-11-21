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

      // Security: Prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\') ||
          projectId.includes('..') || projectId.includes('/') || projectId.includes('\\')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename or projectId'
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

      // Serve the file
      const filePath = path.join(process.cwd(), 'uploads', 'artifacts', projectId, filename);

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
