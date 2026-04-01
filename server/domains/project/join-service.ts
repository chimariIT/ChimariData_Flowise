/**
 * Join Service
 *
 * Domain: Multi-Dataset Joins
 * Responsibilities: Auto-detect join keys, execute joins, retrieve joined data
 */

import { storage } from '../../services/storage';
import { ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../shared/utils/error-handling';

export interface JoinKeyMapping {
  sourceDataset: string;
  sourceColumn: string;
  targetDataset: string;
  targetColumn: string;
  confidence: number;
}

export interface JoinConfig {
  foreignKeys: JoinKeyMapping[];
  joinType?: 'left' | 'inner' | 'right' | 'full';
  mergeStrategy?: 'merge' | 'overwrite' | 'keep';
}

export interface JoinResult {
  success: boolean;
  joinedData?: any[];
  preview?: any[];
  schema?: Record<string, any>;
  rowCount?: number;
  joinInsights?: any;
}

export class JoinService {
  /**
   * Auto-detect join keys for multiple datasets
   */
  async autoDetectJoinKeys(projectId: string, userId: string): Promise<{ foreignKeys: JoinKeyMapping[] }> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Get datasets
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets || datasets.length < 2) {
      return { foreignKeys: [] };
    }

    const datasetObjects = datasets.map(({ dataset }) => ({
      ...dataset,
      id: dataset.id,
      name: (dataset as any)?.originalFileName || dataset.name,
      schema: dataset.schema || {},
      data: Array.isArray(dataset.data) ? dataset.data :
        Array.isArray(dataset.preview) ? dataset.preview :
        (dataset as any)?.sampleData || [],
    }));

    return this.detectJoinKeys(datasetObjects);
  }

  /**
   * Execute multi-dataset join
   */
  async executeJoin(projectId: string, userId: string, config: JoinConfig): Promise<JoinResult> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Get datasets
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets || datasets.length < 2) {
      throw new ValidationError('At least 2 datasets required for join');
    }

    // Extract dataset data
    const datasetObjects = datasets.map(({ dataset }) => ({
      id: dataset.id,
      name: (dataset as any)?.originalFileName || dataset.name,
      schema: dataset.schema || {},
      data: Array.isArray(dataset.data) ? dataset.data :
        Array.isArray(dataset.preview) ? dataset.preview :
        (dataset as any)?.sampleData || [],
    }));

    // Perform join
    const joinedData = this.performJoin(datasetObjects, config);

    // Update journey progress with joined data
    const currentJourneyProgress = (project as any)?.journeyProgress || {};
    await storage.updateProject(projectId, {
      journeyProgress: {
        ...currentJourneyProgress,
        joinedData: {
          fullData: joinedData,
          preview: joinedData.slice(0, 100),
          schema: this.deriveSchema(joinedData),
          rowCount: joinedData.length,
          joinConfig: config,
        },
        hasJoinedDataset: true,
      },
    } as any);

    return {
      success: true,
      joinedData,
      preview: joinedData.slice(0, 100),
      schema: this.deriveSchema(joinedData),
      rowCount: joinedData.length,
      joinInsights: {
        datasetsJoined: datasetObjects.length,
        keysUsed: config.foreignKeys.length,
        joinType: config.joinType || 'left',
      },
    };
  }

  /**
   * Get joined data for project
   */
  async getJoinedData(projectId: string, userId: string): Promise<JoinResult> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Get joined data from journey progress
    const journeyProgress = (project as any)?.journeyProgress || {};
    const joinedData = journeyProgress.joinedData?.fullData || [];

    return {
      success: true,
      joinedData: joinedData.slice(0, 100), // Preview only
      preview: joinedData.slice(0, 100),
      schema: journeyProgress.joinedData?.schema || this.deriveSchema(joinedData),
      rowCount: joinedData.length,
      joinInsights: journeyProgress.joinedData?.joinConfig,
    };
  }

  /**
   * Detect join keys between datasets
   */
  private detectJoinKeys(datasets: any[]): { foreignKeys: JoinKeyMapping[] } {
    const foreignKeys: JoinKeyMapping[] = [];

    if (datasets.length < 2) {
      return { foreignKeys };
    }

    const primaryDataset = datasets[0];
    const primarySchema = primaryDataset.schema || {};
    const primaryCols = Object.keys(primarySchema);
    const primaryName = primaryDataset.name || 'Primary';
    const primaryData = Array.isArray(primaryDataset.data) ? primaryDataset.data : [];

    // Join key patterns with priority scores
    const joinKeyPatterns = [
      { pattern: /^employee_?id$/i, score: 100 },
      { pattern: /^emp_?id$/i, score: 95 },
      { pattern: /^user_?id$/i, score: 90 },
      { pattern: /^customer_?id$/i, score: 90 },
      { pattern: /^department_?id$/i, score: 85 },
      { pattern: /^dept_?id$/i, score: 85 },
      { pattern: /^department$/i, score: 80 },
      { pattern: /^dept$/i, score: 80 },
      { pattern: /^id$/i, score: 75 },
      { pattern: /_id$/i, score: 70 },
      { pattern: /^.*_key$/i, score: 65 },
      { pattern: /^.*_code$/i, score: 60 },
      { pattern: /^name$/i, score: 50 },
      { pattern: /^employee_?name$/i, score: 55 },
      { pattern: /^full_?name$/i, score: 55 },
    ];

    for (let i = 1; i < datasets.length; i++) {
      const secondaryDataset = datasets[i];
      const secondarySchema = secondaryDataset.schema || {};
      const secondaryCols = Object.keys(secondarySchema);
      const secondaryName = secondaryDataset.name || `Secondary_${i}`;
      const secondaryData = Array.isArray(secondaryDataset.data) ? secondaryDataset.data : [];

      interface MatchCandidate {
        sourceColumn: string;
        targetColumn: string;
        patternScore: number;
        mergePotential: number;
      }
      const matchCandidates: MatchCandidate[] = [];

      for (const pCol of primaryCols) {
        const pColLower = pCol.toLowerCase();

        for (const sCol of secondaryCols) {
          const sColLower = sCol.toLowerCase();

          // Direct match
          const directMatch = pColLower === sColLower;

          // Pattern match
          let patternScore = 0;
          for (const { pattern, score } of joinKeyPatterns) {
            if (pattern.test(pCol) && pattern.test(sCol)) {
              patternScore = Math.max(patternScore, score);
            }
          }

          // Partial match (same suffix)
          const partialMatch =
            (pColLower.endsWith('_id') && sColLower.endsWith('_id')) ||
            (pColLower.endsWith('_key') && sColLower.endsWith('_key')) ||
            (pColLower.endsWith('_code') && sColLower.endsWith('_code'));

          if (directMatch || patternScore > 0 || partialMatch) {
            // Calculate merge potential
            const primaryValues = new Set<string>(
              primaryData.slice(0, 500).map((row: any) =>
                String(row[pCol] ?? '').toLowerCase().trim()
              ).filter((v: string) => v !== '')
            );
            const secondaryValues = new Set<string>(
              secondaryData.slice(0, 500).map((row: any) =>
                String(row[sCol] ?? '').toLowerCase().trim()
              ).filter((v: string) => v !== '')
            );

            let matchCount = 0;
            primaryValues.forEach((v) => {
              if (secondaryValues.has(v)) matchCount++;
            });

            const mergePotential =
              Math.min(primaryValues.size, secondaryValues.size) > 0
                ? (matchCount / Math.min(primaryValues.size, secondaryValues.size)) * 100
                : 0;

            matchCandidates.push({
              sourceColumn: pCol,
              targetColumn: sCol,
              patternScore: directMatch ? 110 : patternScore || (partialMatch ? 40 : 0),
              mergePotential,
            });
          }
        }
      }

      // Select best match
      if (matchCandidates.length > 0) {
        matchCandidates.sort((a, b) => {
          const scoreA = a.mergePotential * 0.6 + a.patternScore * 0.4;
          const scoreB = b.mergePotential * 0.6 + b.patternScore * 0.4;
          return scoreB - scoreA;
        });

        const bestMatch = matchCandidates[0];
        const confidence = Math.min(
          100,
          (bestMatch.mergePotential * 0.6 + bestMatch.patternScore * 0.4) / 100
        );

        console.log(
          `✅ [Join] Best match: ${primaryName}.${bestMatch.sourceColumn} ↔ ${secondaryName}.${bestMatch.targetColumn} (${(confidence * 100).toFixed(1)}%)`
        );

        foreignKeys.push({
          sourceDataset: primaryDataset.id,
          sourceColumn: bestMatch.sourceColumn,
          targetDataset: secondaryDataset.id,
          targetColumn: bestMatch.targetColumn,
          confidence,
        });
      } else {
        console.log(`⚠️ [Join] No matching join key found for ${secondaryName}`);
      }
    }

    return { foreignKeys };
  }

  /**
   * Perform join on datasets
   */
  private performJoin(datasets: any[], config: JoinConfig): any[] {
    if (datasets.length < 2 || !config.foreignKeys || config.foreignKeys.length === 0) {
      return datasets[0]?.data || [];
    }

    const firstDataset = datasets[0];
    let workingData = Array.isArray(firstDataset.data)
      ? [...firstDataset.data]
      : (firstDataset.preview || []);

    const joinType = config.joinType || 'left';

    for (let i = 1; i < datasets.length; i++) {
      const rightDataset = datasets[i];
      const rightData = Array.isArray(rightDataset.data) ? rightDataset.data : [];

      // Find join key for this dataset pair
      const keyMapping = config.foreignKeys.find(
        (fk: any) =>
          (fk.sourceDataset === firstDataset.id && fk.targetDataset === rightDataset.id) ||
          (fk.sourceDataset === rightDataset.id && fk.targetDataset === firstDataset.id)
      );

      if (keyMapping && rightData.length > 0) {
        const leftKey =
          keyMapping.sourceDataset === firstDataset.id
            ? keyMapping.sourceColumn
            : keyMapping.targetColumn;
        const rightKey =
          keyMapping.sourceDataset === firstDataset.id
            ? keyMapping.targetColumn
            : keyMapping.sourceColumn;

        console.log(`🔗 [Join] Joining on ${leftKey} = ${rightKey}`);

        // Create lookup map for right dataset
        const rightLookup = new Map<string, any>();
        for (const row of rightData) {
          const key = String(row[rightKey] ?? '').toLowerCase();
          if (key) rightLookup.set(key, row);
        }

        // Perform join based on joinType
        workingData = workingData.map((leftRow) => {
          const leftKeyValue = String(leftRow[leftKey] ?? '').toLowerCase();
          const rightRow = rightLookup.get(leftKeyValue);

          if (rightRow) {
            // Merge rows, prefixing right columns if they clash
            const merged = { ...leftRow };
            for (const [col, val] of Object.entries(rightRow)) {
              if (col !== rightKey) {
                const newCol = col in merged ? `${rightDataset.name || 'ds' + i}_${col}` : col;
                merged[newCol] = val;
              }
            }
            return merged;
          }

          // For LEFT join, return left row even if no match
          return leftRow;
        });

        // For INNER join, filter out non-matches
        if (joinType === 'inner') {
          workingData = workingData.filter((row) => {
            const leftKeyValue = String(row[leftKey] ?? '').toLowerCase();
            return rightLookup.has(leftKeyValue);
          });
        }

        console.log(`🔗 [Join] Join completed. Rows: ${workingData.length}`);
      }
    }

    return workingData;
  }

  /**
   * Derive schema from data
   */
  private deriveSchema(data: any[]): Record<string, any> {
    if (data.length === 0) {
      return {};
    }

    const schema: Record<string, any> = {};
    const columns = Object.keys(data[0]);

    for (const col of columns) {
      const sample = data.slice(0, 10).map((r) => r[col]).filter((v) => v != null);
      const isNumeric = sample.every((v) => !isNaN(Number(v)));
      schema[col] = { type: isNumeric ? 'number' : 'string' };
    }

    return schema;
  }
}

// Singleton instance
export const joinService = new JoinService();
