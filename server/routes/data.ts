import { Router } from 'express';
import type { DataProject } from '@shared/schema';
import { storage } from '../services/storage';

const router = Router();

type DataRow = Record<string, any>;

interface NumericSummary {
  column: string;
  inspected: number;
  mean: number | null;
  stdDev: number | null;
  skewness: number | null;
  kurtosis: number | null;
  excessKurtosis: number | null;
  normalityScore: number | null;
  interpretation: string;
  isApproximatelyNormal: boolean;
}

interface OutlierDetail {
  column: string;
  method: 'iqr' | 'zscore';
  inspected: number;
  totalOutliers: number;
  bounds?: {
    lower: number;
    upper: number;
  };
  zScoreThreshold?: number;
  samples: Array<{
    index: number;
    value: number;
    rowPreview: Partial<DataRow>;
  }>;
}

const MAX_ROW_PREVIEW_FIELDS = 8;
const MAX_OUTLIER_SAMPLES = 25;

const buildRowPreview = (row: DataRow): Partial<DataRow> => {
  const entries = Object.entries(row || {}).slice(0, MAX_ROW_PREVIEW_FIELDS);
  return entries.reduce<Partial<DataRow>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
};

const toNumeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const quantile = (sortedValues: number[], q: number): number => {
  if (sortedValues.length === 0) {
    return NaN;
  }
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sortedValues[base] + (sortedValues[base + 1] - sortedValues[base]) * rest || sortedValues[base];
};

const calculateSkewness = (values: number[], mean: number, stdDev: number): number | null => {
  if (values.length === 0 || stdDev === 0) {
    return null;
  }
  const n = values.length;
  const sum = values.reduce((acc, val) => acc + Math.pow(val - mean, 3), 0);
  return (sum / n) / Math.pow(stdDev, 3);
};

const calculateKurtosis = (values: number[], mean: number, stdDev: number): number | null => {
  if (values.length === 0 || stdDev === 0) {
    return null;
  }
  const n = values.length;
  const sum = values.reduce((acc, val) => acc + Math.pow(val - mean, 4), 0);
  return (sum / n) / Math.pow(stdDev, 4);
};

const calculateMean = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((acc, val) => acc + val, 0) / values.length;
};

const calculateStdDev = (values: number[], mean: number | null): number | null => {
  if (values.length === 0 || mean === null) {
    return null;
  }
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
};

const detectOutliers = (
  data: DataRow[],
  column: string,
  method: 'iqr' | 'zscore',
  threshold: number
): OutlierDetail | null => {
  const numericEntries = data
    .map((row, index) => ({
      index,
      value: toNumeric(row[column]),
      row
    }))
    .filter(entry => entry.value !== null) as Array<{ index: number; value: number; row: DataRow }>;

  if (numericEntries.length === 0) {
    return null;
  }

  const values = numericEntries.map(entry => entry.value);
  const sorted = [...values].sort((a, b) => a - b);

  let bounds: { lower: number; upper: number } | undefined;
  let zScoreThreshold: number | undefined;
  let outlierEntries: typeof numericEntries = [];

  if (method === 'iqr') {
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - threshold * iqr;
    const upper = q3 + threshold * iqr;
    bounds = { lower, upper };
    outlierEntries = numericEntries.filter(entry => entry.value < lower || entry.value > upper);
  } else {
    const mean = calculateMean(values);
    const stdDev = calculateStdDev(values, mean);
    if (mean !== null && stdDev !== null && stdDev !== 0) {
      zScoreThreshold = threshold;
      outlierEntries = numericEntries.filter(entry => Math.abs((entry.value - mean) / stdDev) > threshold);
    }
  }

  return {
    column,
    method,
    inspected: numericEntries.length,
    totalOutliers: outlierEntries.length,
    bounds,
    zScoreThreshold,
    samples: outlierEntries.slice(0, MAX_OUTLIER_SAMPLES).map(entry => ({
      index: entry.index,
      value: entry.value,
      rowPreview: buildRowPreview(entry.row)
    }))
  };
};

const summarizeMissingData = (profile: any) => {
  const pattern = profile?.missingDataPattern || { totalMissing: 0, percentage: 0, byColumn: {} };
  const sortedColumns = Object.entries(pattern.byColumn || {})
    .map(([column, pct]) => ({ column, percentage: Number(pct) }))
    .sort((a, b) => b.percentage - a.percentage);

  const recommendations: string[] = [];
  sortedColumns.forEach(({ column, percentage }) => {
    if (percentage >= 40) {
      recommendations.push(`Column '${column}' has ${percentage.toFixed(1)}% missing values. Consider removing or sourcing additional data.`);
    } else if (percentage >= 20) {
      recommendations.push(`Column '${column}' has ${percentage.toFixed(1)}% missing values. Imputation or targeted data collection recommended.`);
    } else if (percentage > 0) {
      recommendations.push(`Column '${column}' has ${percentage.toFixed(1)}% missing values. Apply light imputation before modeling.`);
    }
  });

  if (pattern.percentage === 0) {
    recommendations.push('No missing values detected across the dataset.');
  }

  return {
    overview: {
      totalMissing: pattern.totalMissing,
      percentage: Number(pattern.percentage || 0),
      columnCount: profile?.columnCount || 0,
      rowCount: profile?.rowCount || 0
    },
    columns: sortedColumns,
    recommendations
  };
};

const computeNormalitySummaries = (data: DataRow[], columns: string[]): NumericSummary[] => {
  return columns.map(column => {
    const numericValues = data
      .map(row => toNumeric(row[column]))
      .filter((value): value is number => value !== null);

    if (numericValues.length < 8) {
      return {
        column,
        inspected: numericValues.length,
        mean: null,
        stdDev: null,
        skewness: null,
        kurtosis: null,
        excessKurtosis: null,
        normalityScore: null,
        interpretation: 'Insufficient data to assess normality (need at least 8 numeric values).',
        isApproximatelyNormal: false
      };
    }

    const mean = calculateMean(numericValues);
    const stdDev = calculateStdDev(numericValues, mean);

    const skewness = mean !== null && stdDev !== null ? calculateSkewness(numericValues, mean, stdDev) : null;
    const kurtosis = mean !== null && stdDev !== null ? calculateKurtosis(numericValues, mean, stdDev) : null;
    const excessKurtosis = kurtosis !== null ? kurtosis - 3 : null;

    let normalityScore: number | null = null;
    let interpretation = 'Unable to compute normality score due to insufficient statistics.';
    let isApproximatelyNormal = false;

    if (skewness !== null && excessKurtosis !== null) {
      normalityScore = Math.max(
        0,
        Math.min(100, 100 - (Math.abs(skewness) * 20 + Math.abs(excessKurtosis) * 10))
      );

      if (normalityScore >= 80) {
        interpretation = 'Distribution appears approximately normal (within typical skewness/kurtosis thresholds).';
        isApproximatelyNormal = true;
      } else if (normalityScore >= 60) {
        interpretation = 'Distribution is moderately close to normal. Consider transformations if strict normality is required.';
        isApproximatelyNormal = false;
      } else {
        interpretation = 'Distribution deviates from normality. Apply transformations or use non-parametric methods.';
        isApproximatelyNormal = false;
      }
    }

    return {
      column,
      inspected: numericValues.length,
      mean,
      stdDev,
      skewness,
      kurtosis,
      excessKurtosis,
      normalityScore,
      interpretation,
      isApproximatelyNormal
    };
  });
};

const resolveNumericColumns = (data: DataRow[], requestedColumns?: string[]): string[] => {
  if (!data || data.length === 0) {
    return [];
  }

  if (requestedColumns && Array.isArray(requestedColumns) && requestedColumns.length > 0) {
    return requestedColumns;
  }

  const candidateColumns = Object.keys(data[0]);
  return candidateColumns.filter(column =>
    data.some(row => {
      const numeric = toNumeric(row[column]);
      return numeric !== null;
    })
  );
};

// Data transformation endpoints
router.post('/data-join', async (req, res) => {
  try {
    const { config } = req.body;
    const result = { joined: true, config };
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/outlier-detection', async (req, res) => {
  try {
    const { projectId, config } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData: DataRow[] = Array.isArray(project.data) ? project.data : [];
    if (projectData.length === 0) {
      return res.status(400).json({ error: 'Project dataset is empty. Upload data before requesting outlier detection.' });
    }

    const { executeTool } = require('../services/mcp-tool-registry');

    const toolResult = await executeTool(
      'data_quality_monitor',
      'data_engineer_agent',
      {
        operation: 'profile',
        datasetId: projectId,
        datasetName: project.name || projectId,
        data: projectData
      },
      { userId: project.userId, projectId }
    );

    if (toolResult.status !== 'success') {
      throw new Error(toolResult.error || 'Data quality profiling failed');
    }

    const profile = toolResult.result?.data?.profile || toolResult.result?.data;

    const method: 'iqr' | 'zscore' = config?.method === 'zscore' ? 'zscore' : 'iqr';
    const threshold = typeof config?.threshold === 'number' ? config.threshold : method === 'iqr' ? 1.5 : 3;
    const columns = resolveNumericColumns(projectData, config?.columns);

    const analyses = columns
      .map(column => detectOutliers(projectData, column, method, threshold))
      .filter((detail): detail is OutlierDetail => detail !== null);

    const outlierAnalysisUpdate = {
      method,
      threshold,
      columns: analyses,
      profile,
      executionId: toolResult.executionId,
      generatedAt: new Date().toISOString()
    } as DataProject['outlierAnalysis'];

    await storage.updateProject(projectId, {
      outlierAnalysis: outlierAnalysisUpdate
    });

    res.json({
      success: true,
      result: {
        method,
        threshold,
        analyses,
        profile,
        execution: {
          id: toolResult.executionId,
          billing: toolResult.billing
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/missing-data-analysis', async (req, res) => {
  try {
    const { projectId, config } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData: DataRow[] = Array.isArray(project.data) ? project.data : [];
    if (projectData.length === 0) {
      return res.status(400).json({ error: 'Project dataset is empty. Upload data before requesting missing data analysis.' });
    }

    const { executeTool } = require('../services/mcp-tool-registry');

    const toolResult = await executeTool(
      'data_quality_monitor',
      'data_engineer_agent',
      {
        operation: 'profile',
        datasetId: projectId,
        datasetName: project.name || projectId,
        data: projectData
      },
      { userId: project.userId, projectId }
    );

    if (toolResult.status !== 'success') {
      throw new Error(toolResult.error || 'Data quality profiling failed');
    }

    const profile = toolResult.result?.data?.profile || toolResult.result?.data;
    const summary = summarizeMissingData(profile);

    const missingDataUpdate = {
      summary,
      profile,
      recommendations: summary.recommendations,
      patterns: profile?.missingDataPattern,
      executionId: toolResult.executionId,
      generatedAt: new Date().toISOString()
    } as DataProject['missingDataAnalysis'];

    await storage.updateProject(projectId, {
      missingDataAnalysis: missingDataUpdate
    });

    res.json({
      success: true,
      result: {
        profile,
        summary,
        execution: {
          id: toolResult.executionId,
          billing: toolResult.billing
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/normality-test', async (req, res) => {
  try {
    const { projectId, config } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData: DataRow[] = Array.isArray(project.data) ? project.data : [];
    if (projectData.length === 0) {
      return res.status(400).json({ error: 'Project dataset is empty. Upload data before requesting normality tests.' });
    }

    const columns = resolveNumericColumns(projectData, config?.columns);
    if (columns.length === 0) {
      return res.status(400).json({ error: 'No numeric columns available for normality testing.' });
    }

    const { executeTool } = require('../services/mcp-tool-registry');

    const toolResult = await executeTool(
      'statistical_analyzer',
      'technical_ai_agent',
      {
        analysisType: 'descriptive',
        data: projectData,
        config: {
          targetVariable: config?.targetVariable,
          features: columns,
          includeDistributions: true,
          includeCorrelations: false
        },
        question: 'Assess distribution normality for numeric features'
      },
      { userId: project.userId, projectId }
    );

    if (toolResult.status !== 'success') {
      throw new Error(toolResult.error || 'Statistical analysis failed');
    }

    const normalitySummaries = computeNormalitySummaries(projectData, columns);

    const normalityUpdate = {
      generatedAt: new Date().toISOString(),
      columns: normalitySummaries,
      descriptiveStatistics: toolResult.result?.data,
      executionId: toolResult.executionId
    } as DataProject['normalityTests'];

    await storage.updateProject(projectId, {
      normalityTests: normalityUpdate
    });

    res.json({
      success: true,
      result: {
        summaries: normalitySummaries,
        descriptiveStatistics: toolResult.result?.data,
        execution: {
          id: toolResult.executionId,
          billing: toolResult.billing
        }
      }
    });
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
