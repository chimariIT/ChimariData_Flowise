import { Router } from 'express';
import { storage } from '../services/storage';
import { DataTransformer } from '../services';

const router = Router();


// Data transformation endpoints
router.post("/data-join", async (req, res) => {
    try {
      const { config } = req.body;
      // Placeholder: joinData not implemented in stub; return passthrough
      const result = { joined: true, config };
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

router.post("/outlier-detection", async (req, res) => {
    try {
      const { projectId, config } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const projectData: any[] = project.data || [];
      const result = await DataTransformer.detectOutliers(projectData, config);
      await storage.updateProject(projectId, {
        outlierAnalysis: {
          method: config.method,
          threshold: config.threshold,
          outliers: result.outliers
        }
      });
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

router.post("/missing-data-analysis", async (req, res) => {
    try {
      const { projectId, config } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const projectData: any[] = project.data || [];
      const result = await DataTransformer.analyzeMissingData(projectData, config);
      await storage.updateProject(projectId, {
        missingDataAnalysis: {
          patterns: (result as any).patterns,
          recommendations: (result as any).recommendations
        }
      });
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

router.post("/normality-test", async (req, res) => {
    try {
      const { projectId, config } = req.body;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const projectData: any[] = project.data || [];
  const result = await DataTransformer.testNormality(projectData, config);
      await storage.updateProject(projectId, {
        normalityTests: result.tests || result.normalityTest
      });
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
});

export default router;

// Infer relationships (PK/FK) from uploaded schema-like structures
router.post('/infer-relationships', async (req, res) => {
  try {
    const { tables } = req.body || {};
    if (!tables || typeof tables !== 'object') {
      return res.status(400).json({ error: 'Expected a "tables" object with table definitions' });
    }

    const suggestions: Record<string, any> = {};

    // Collect candidate PKs and column indexes
    const pkCandidates: Record<string, string> = {};
    const allColumns: Record<string, string[]> = {};
    for (const [table, def] of Object.entries<any>(tables)) {
      const cols = Object.keys(def.columns || {});
      allColumns[table] = cols;

      const explicitPk = def.primaryKey;
      if (explicitPk) {
        pkCandidates[table] = explicitPk;
      } else {
        const guess = cols.find(c => /^(id|\w+_id)$/.test(c));
        if (guess) pkCandidates[table] = guess;
      }
    }

    // Infer FKs by *_id and matching referenced table
    for (const [table, cols] of Object.entries(allColumns)) {
      const foreignKeys: Array<{ column: string; references: string }> = [];
      cols.forEach(col => {
        const m = col.match(/^(.*)_id$/);
        if (m) {
          const refBase = m[1];
          // Prefer exact table name; fallback plural/singular
          const refTable = Object.keys(allColumns).find(t => t === refBase || t === `${refBase}s` || t === refBase.replace(/s$/, ''));
          if (refTable && pkCandidates[refTable]) {
            foreignKeys.push({ column: col, references: `${refTable}.${pkCandidates[refTable]}` });
          }
        }
      });

      suggestions[table] = {
        primaryKey: pkCandidates[table] || null,
        foreignKeys
      };
    }

    return res.json({ success: true, suggestions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
