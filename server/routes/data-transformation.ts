import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { storage } from '../services/storage';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// Configure transformed files directory
const TRANSFORMED_FILES_DIR = path.join(process.env.UPLOAD_DIR || './uploads', 'transformed');

// POST /api/transform-data/:projectId
router.post('/transform-data/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const { transformations } = req.body as { transformations: Array<{ type: string; config: any }>; };

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Load dataset rows
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets || datasets.length === 0) {
      return res.status(400).json({ success: false, error: 'No datasets available for this project' });
    }
    const dataset = (datasets[0] as any).dataset || datasets[0];
    let rows: any[] = Array.isArray(dataset.data) ? dataset.data : (dataset.preview || []);

    // Apply simple, safe transformations
    for (const step of (transformations || [])) {
      const { type, config } = step || {};
      switch (type) {
        case 'filter': {
          const { field, operator, value } = config || {};
          if (field) {
            rows = rows.filter((r) => {
              const v = r[field];
              switch (operator) {
                case 'equals': return v == value;
                case 'not_equals': return v != value;
                case 'gt': return Number(v) > Number(value);
                case 'gte': return Number(v) >= Number(value);
                case 'lt': return Number(v) < Number(value);
                case 'lte': return Number(v) <= Number(value);
                case 'contains': return String(v ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
                default: return true;
              }
            });
          }
          break;
        }
        case 'select': {
          const { columns } = config || {};
          if (Array.isArray(columns) && columns.length) {
            rows = rows.map((r) => Object.fromEntries(columns.map((c: string) => [c, r[c]])));
          }
          break;
        }
        case 'rename': {
          const { from, to } = config || {};
          if (from && to) {
            rows = rows.map((r) => {
              if (from in r) {
                const { [from]: val, ...rest } = r;
                return { ...rest, [to]: val };
              }
              return r;
            });
          }
          break;
        }
        case 'clean': {
          // Trim strings, convert empty strings to null
          rows = rows.map((r) => {
            const out: any = {};
            for (const [k, v] of Object.entries(r)) {
              if (typeof v === 'string') {
                const t = v.trim();
                out[k] = t === '' ? null : t;
              } else {
                out[k] = v;
              }
            }
            return out;
          });
          break;
        }
        case 'sort': {
          const { field, direction } = config || {};
          if (field) {
            rows = [...rows].sort((a, b) => {
              const av = a[field];
              const bv = b[field];
              if (av == null && bv == null) return 0;
              if (av == null) return 1;
              if (bv == null) return -1;
              if (av < bv) return direction === 'desc' ? 1 : -1;
              if (av > bv) return direction === 'desc' ? -1 : 1;
              return 0;
            });
          }
          break;
        }
        default:
          // Ignore unknown types gracefully
          break;
      }
    }

    // Persist transformed sample on project for preview
    await storage.updateProject(projectId, { transformedData: rows.slice(0, 500) } as any);

    // ✅ Export transformed data to disk
    try {
        const timestamp = Date.now();
        const projectName = project.name || 'project';
        const sanitizedProjectName = projectName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const transformedFileName = `${userId}_${timestamp}_transformed_${sanitizedProjectName}.json`;
        const transformedFilePath = path.join(TRANSFORMED_FILES_DIR, transformedFileName);

        // Ensure directory exists
        await fs.mkdir(TRANSFORMED_FILES_DIR, { recursive: true });

        // Write transformed data to file
        await fs.writeFile(
            transformedFilePath,
            JSON.stringify(rows, null, 2),
            'utf-8'
        );

        console.log(`✅ Transformed data saved: ${transformedFilePath}`);

        // Update project metadata with transformed file path
        const currentMetadata = (project as any)?.metadata || {};
        await storage.updateProject(projectId, {
            metadata: {
                ...currentMetadata,
                transformedFilePath: transformedFilePath,
                transformedAt: new Date().toISOString(),
                transformationCount: transformations.length
            }
        } as any);

        return res.json({
            success: true,
            transformedData: rows.slice(0, 100),
            downloadUrl: `/api/projects/${projectId}/export?format=csv`,
            transformedFilePath: transformedFilePath
        });
    } catch (fileError: any) {
        console.error('Failed to save transformed file:', fileError);
        // Still return success but log the error
        return res.json({
            success: true,
            transformedData: rows.slice(0, 100),
            downloadUrl: `/api/projects/${projectId}/export?format=csv`,
            warning: 'Transformed data saved to database but file export failed'
        });
    }
  } catch (error: any) {
    console.error('Transform data error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to transform data' });
  }
});

export default router;






