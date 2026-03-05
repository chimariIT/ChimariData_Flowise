export interface JoinConfig {
  joinWithProjects: string[];
  joinType: 'inner' | 'left' | 'right' | 'outer';
  joinKeys: { [projectId: string]: string | string[] };
  mergeStrategy: 'merge' | 'concat';
}

export interface JoinResult {
  success: boolean;
  project: any;
  recordCount: number;
  joinedFields: string[];
  error?: string;
}

export class DatasetJoiner {
  /**
   * Get a safe dataset name for column prefixing during joins.
   * Prevents "undefined_" prefix when project.name is undefined.
   */
  private static getSafeDatasetName(project: any, index: number): string {
    const rawName = project.originalFileName || project.name || project.fileName;
    if (rawName && rawName !== 'undefined' && String(rawName).trim()) {
      // Remove file extension and sanitize for use in column names
      return String(rawName)
        .replace(/\.[^.]+$/, '')  // Remove extension
        .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace special chars
        .substring(0, 50);  // Limit length
    }
    return `Dataset${index + 1}`;
  }

  static async joinDatasets(
    baseProject: any,
    joinProjects: any[],
    config: JoinConfig
  ): Promise<JoinResult> {
    try {
      console.log(`${config.mergeStrategy === 'merge' ? 'Merging' : 'Concatenating'} ${joinProjects.length} datasets with base project ${baseProject.id}`);
      
      const baseData = baseProject.data || [];
      let resultData: any[] = [];
      let joinedFields: string[] = [];
      
      if (config.mergeStrategy === 'concat') {
        // Concatenation strategy - stack datasets vertically
        resultData = [...baseData];
        joinedFields = Object.keys(baseProject.schema || {});
        
        // Get all unique fields across all projects
        const allFields = new Set(joinedFields);
        
        for (const joinProject of joinProjects) {
          const projectFields = Object.keys(joinProject.schema || {});
          projectFields.forEach(field => allFields.add(field));
        }
        
        joinedFields = Array.from(allFields);
        
        // Add data from each project, filling missing columns with null
        for (const joinProject of joinProjects) {
          const projectData = joinProject.data || [];
          const alignedData = projectData.map((row: any) => {
            const alignedRow: any = {};
            joinedFields.forEach(field => {
              alignedRow[field] = row[field] || null;
            });
            return alignedRow;
          });
          resultData = [...resultData, ...alignedData];
        }
        
        // Align base data to have all fields
        resultData = resultData.map(row => {
          const alignedRow: any = {};
          joinedFields.forEach(field => {
            alignedRow[field] = row[field] || null;
          });
          return alignedRow;
        });
        
      } else {
        // Merge strategy - join on keys
        const baseJoinKey = config.joinKeys[baseProject.id] || Object.keys(baseProject.schema || {})[0];
        resultData = [...baseData];
        joinedFields = Object.keys(baseProject.schema || {});
        
        // Process each project to join
        for (let jpIdx = 0; jpIdx < joinProjects.length; jpIdx++) {
          const joinProject = joinProjects[jpIdx];
          const joinKey = config.joinKeys[joinProject.id];
          const joinData = joinProject.data || [];

          // Get safe name for column prefixing (prevents "undefined_" prefix)
          const safeName = this.getSafeDatasetName(joinProject, jpIdx + 1);
          console.log(`✅ [DatasetJoiner] Using safe name: ${safeName} for join (original: ${joinProject.name})`);

          if (!joinKey) {
            throw new Error(`No join key specified for project ${safeName}`);
          }

          // Get fields from join project (exclude the join key to avoid duplication)
          const projectFields = Object.keys(joinProject.schema || {}).filter(field => field !== joinKey);

          // Build set of current left-side columns for conflict detection
          const currentLeftColumns = new Set(joinedFields);
          const dsIndex = jpIdx + 2; // Base is 1, secondary datasets start at 2

          // Only suffix fields that conflict with existing columns
          const outputFields = projectFields.map(field =>
            currentLeftColumns.has(field) ? `${field}_${dsIndex}` : field
          );
          joinedFields = [...joinedFields, ...outputFields];

          // Perform the join operation with conflict-based naming
          resultData = this.performJoin(resultData, joinData, baseJoinKey, joinKey, config.joinType, safeName, currentLeftColumns, dsIndex);
        }
      }
      
      // Create new schema for joined dataset
      const newSchema: any = {};
      
      // Add base project schema
      Object.entries(baseProject.schema || {}).forEach(([field, info]) => {
        newSchema[field] = info;
      });
      
      // Add joined project schemas — only suffix conflicting column names
      const baseSchemaFields = new Set(Object.keys(baseProject.schema || {}));
      for (let jpIdx = 0; jpIdx < joinProjects.length; jpIdx++) {
        const joinProject = joinProjects[jpIdx];
        const dsIndex = jpIdx + 2;
        const joinKey = config.joinKeys[joinProject.id];
        const joinKeys = Array.isArray(joinKey) ? joinKey : joinKey ? [joinKey] : [];
        Object.entries(joinProject.schema || {}).forEach(([field, info]) => {
          if (!joinKeys.includes(field)) {
            const outCol = baseSchemaFields.has(field) ? `${field}_${dsIndex}` : field;
            newSchema[outCol] = {
              ...(info as object),
              description: `${field} from dataset ${dsIndex}`
            };
          }
        });
      }
      
      // Create joined project data
      const joinedProject = {
        ...baseProject,
        name: `${baseProject.name}_joined_${Date.now()}`,
        data: resultData,
        schema: newSchema,
        recordCount: resultData.length,
        joinedFiles: config.joinWithProjects,
        joinMetadata: {
          mergeStrategy: config.mergeStrategy,
          joinType: config.joinType,
          joinKeys: config.joinKeys,
          originalProjects: [baseProject.id, ...config.joinWithProjects],
          joinedAt: new Date(),
          originalRecordCounts: {
            [baseProject.id]: baseData.length,
            ...Object.fromEntries(joinProjects.map(p => [p.id, (p.data || []).length]))
          }
        }
      };
      
      return {
        success: true,
        project: joinedProject,
        recordCount: resultData.length,
        joinedFields: joinedFields
      };
      
    } catch (error) {
      console.error('Dataset join failed:', error);
      return {
        success: false,
        project: null,
        recordCount: 0,
        joinedFields: [],
        error: error instanceof Error ? error.message : 'Unknown join error'
      };
    }
  }
  
  /**
   * Get the output column name for a right-side field during join.
   * Only adds a suffix when the field conflicts with an existing left-side column.
   */
  private static getJoinedColumnName(field: string, leftColumns: Set<string>, datasetIndex: number): string {
    if (leftColumns.has(field)) {
      return `${field}_${datasetIndex}`;
    }
    return field;
  }

  private static performJoin(
    leftData: any[],
    rightData: any[],
    leftKey: string | string[],
    rightKey: string | string[],
    joinType: 'inner' | 'left' | 'right' | 'outer',
    rightPrefix: string,
    leftColumns?: Set<string>,
    datasetIndex?: number
  ): any[] {
    const result: any[] = [];

    // ENHANCED: Find actual column names (case-insensitive matching)
    const leftCols = leftData.length > 0 ? Object.keys(leftData[0]) : [];
    const rightCols = rightData.length > 0 ? Object.keys(rightData[0]) : [];

    const leftKeys = Array.isArray(leftKey) ? leftKey : [leftKey];
    const rightKeys = Array.isArray(rightKey) ? rightKey : [rightKey];
    const actualLeftKeys = leftKeys.map((key) => leftCols.find(c => c.toLowerCase() === key.toLowerCase()) || key);
    const actualRightKeys = rightKeys.map((key) => rightCols.find(c => c.toLowerCase() === key.toLowerCase()) || key);

    console.log(`🔗 [DatasetJoiner] Join keys: left="${actualLeftKeys.join(', ')}" (from ${leftKeys.join(', ')}), right="${actualRightKeys.join(', ')}" (from ${rightKeys.join(', ')})`);
    console.log(`🔗 [DatasetJoiner] Left columns: ${leftCols.join(', ')}`);
    console.log(`🔗 [DatasetJoiner] Right columns: ${rightCols.join(', ')}`);

    // Create lookup map for right data - use NORMALIZED key values for matching
    const buildCompositeKey = (row: any, keys: string[]): string | null => {
      const parts = keys.map((key) => {
        const value = row?.[key];
        if (value === null || value === undefined) {
          return '';
        }
        return String(value).toLowerCase().trim();
      });
      if (parts.every((part) => part.length === 0)) {
        return null;
      }
      return parts.join('||');
    };

    const rightMap = new Map();
    rightData.forEach(row => {
      const keyValue = buildCompositeKey(row, actualRightKeys);
      if (keyValue && !rightMap.has(keyValue)) {
        rightMap.set(keyValue, []);
      }
      if (keyValue) {
        rightMap.get(keyValue).push(row);
      }
    });

    console.log(`🔗 [DatasetJoiner] Built right lookup with ${rightMap.size} unique keys from ${rightData.length} rows`);
    
    // Track which right rows were matched
    const matchedRightKeys = new Set();
    let matchCount = 0;
    let unmatchedCount = 0;

    // Process left data - use NORMALIZED key values for lookup
    leftData.forEach(leftRow => {
      const leftKeyValue = buildCompositeKey(leftRow, actualLeftKeys);
      const rightMatches = leftKeyValue ? rightMap.get(leftKeyValue) || [] : [];

      if (rightMatches.length > 0) {
        matchCount++;
        // Inner and Left joins: include matched rows
        rightMatches.forEach((rightRow: any) => {
          matchedRightKeys.add(leftKeyValue);
          const joinedRow = { ...leftRow };

          // Add right row data — only suffix conflicting column names
          Object.entries(rightRow).forEach(([field, value]) => {
            if (!actualRightKeys.some((key) => key.toLowerCase() === field.toLowerCase())) {
              const outCol = leftColumns && datasetIndex
                ? this.getJoinedColumnName(field, leftColumns, datasetIndex)
                : `${rightPrefix}_${field}`;
              joinedRow[outCol] = value;
            }
          });

          result.push(joinedRow);
        });
      } else {
        unmatchedCount++;
        if (joinType === 'left' || joinType === 'outer') {
          // Left and Outer joins: include unmatched left rows
          const joinedRow = { ...leftRow };

          // Add null values for right fields
          rightData[0] && Object.keys(rightData[0]).forEach(field => {
            if (!actualRightKeys.some((key) => key.toLowerCase() === field.toLowerCase())) {
              const outCol = leftColumns && datasetIndex
                ? this.getJoinedColumnName(field, leftColumns, datasetIndex)
                : `${rightPrefix}_${field}`;
              joinedRow[outCol] = null;
            }
          });

          result.push(joinedRow);
        }
      }
    });

    console.log(`🔗 [DatasetJoiner] Join stats: ${matchCount} matched, ${unmatchedCount} unmatched, ${result.length} result rows`);
    
    // For right and outer joins: add unmatched right rows
    if (joinType === 'right' || joinType === 'outer') {
      rightData.forEach(rightRow => {
        const rightKeyValue = buildCompositeKey(rightRow, actualRightKeys);
        if (rightKeyValue && !matchedRightKeys.has(rightKeyValue)) {
          const joinedRow: any = {};

          // Add null values for left fields
          leftData[0] && Object.keys(leftData[0]).forEach(field => {
            joinedRow[field] = null;
          });

          // Add right row data — only suffix conflicting column names
          Object.entries(rightRow).forEach(([field, value]) => {
            if (!actualRightKeys.some((key) => key.toLowerCase() === field.toLowerCase())) {
              const outCol = leftColumns && datasetIndex
                ? this.getJoinedColumnName(field, leftColumns, datasetIndex)
                : `${rightPrefix}_${field}`;
              joinedRow[outCol] = value;
            } else {
              joinedRow[actualLeftKeys[0]] = value; // Use the first join key for placement
            }
          });

          result.push(joinedRow);
        }
      });
    }
    
    return result;
  }
  
  static validateJoinRequest(config: JoinConfig, baseProject: any, joinProjects: any[]): string | null {
    if (!config.joinWithProjects || config.joinWithProjects.length === 0) {
      return 'At least one dataset must be selected for joining';
    }

    // For merge strategy, validate join keys exist
    if (config.mergeStrategy === 'merge') {
      for (const projectId of config.joinWithProjects) {
        const joinKey = config.joinKeys[projectId];
        if (!joinKey || (Array.isArray(joinKey) && joinKey.length === 0)) {
          return `Join key not specified for project ${projectId}`;
        }
        
        const project = joinProjects.find(p => p.id === projectId);
        if (!project) {
          return `Project ${projectId} not found`;
        }
        
        if (!project.schema) {
          return `Join key not found in project ${project.name}`;
        }
        const joinKeys = Array.isArray(joinKey) ? joinKey : [joinKey];
        for (const key of joinKeys) {
          if (!project.schema[key]) {
            return `Join key '${key}' not found in project ${project.name}`;
          }
        }
      }
      
      // Validate base project join key
      if (!config.joinKeys[baseProject.id]) {
        return 'Join key not specified for base project';
      }
    }
    
    // Validate base project has data
    if (!baseProject.data || baseProject.data.length === 0) {
      return 'Base project has no data to join with';
    }
    
    // Validate join projects have data
    for (const project of joinProjects) {
      if (!project.data || project.data.length === 0) {
        return `Project ${project.name} has no data to join`;
      }
    }
    
    return null; // Valid
  }
}