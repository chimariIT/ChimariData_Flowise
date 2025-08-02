export interface JoinConfig {
  joinWithProjects: string[];
  joinType: 'inner' | 'left' | 'right' | 'outer';
  joinKeys: { [projectId: string]: string };
}

export interface JoinResult {
  success: boolean;
  project: any;
  recordCount: number;
  joinedFields: string[];
  error?: string;
}

export class DatasetJoiner {
  static async joinDatasets(
    baseProject: any,
    joinProjects: any[],
    config: JoinConfig
  ): Promise<JoinResult> {
    try {
      console.log(`Joining ${joinProjects.length} datasets with base project ${baseProject.id}`);
      
      const baseData = baseProject.data || [];
      const baseJoinKey = config.joinKeys[baseProject.id] || Object.keys(baseProject.schema || {})[0];
      
      let resultData = [...baseData];
      let joinedFields = Object.keys(baseProject.schema || {});
      
      // Process each project to join
      for (const joinProject of joinProjects) {
        const joinKey = config.joinKeys[joinProject.id];
        const joinData = joinProject.data || [];
        
        if (!joinKey) {
          throw new Error(`No join key specified for project ${joinProject.name}`);
        }
        
        // Get fields from join project (exclude the join key to avoid duplication)
        const projectFields = Object.keys(joinProject.schema || {}).filter(field => field !== joinKey);
        
        // Add prefix to field names to avoid conflicts
        const prefixedFields = projectFields.map(field => `${joinProject.name}_${field}`);
        joinedFields = [...joinedFields, ...prefixedFields];
        
        // Perform the join operation
        resultData = this.performJoin(resultData, joinData, baseJoinKey, joinKey, config.joinType, joinProject.name);
      }
      
      // Create new schema for joined dataset
      const newSchema: any = {};
      
      // Add base project schema
      Object.entries(baseProject.schema || {}).forEach(([field, info]) => {
        newSchema[field] = info;
      });
      
      // Add joined project schemas with prefixes
      for (const joinProject of joinProjects) {
        Object.entries(joinProject.schema || {}).forEach(([field, info]) => {
          if (field !== config.joinKeys[joinProject.id]) {
            newSchema[`${joinProject.name}_${field}`] = {
              ...info,
              description: `${field} from ${joinProject.name}`
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
  
  private static performJoin(
    leftData: any[],
    rightData: any[],
    leftKey: string,
    rightKey: string,
    joinType: 'inner' | 'left' | 'right' | 'outer',
    rightPrefix: string
  ): any[] {
    const result: any[] = [];
    
    // Create lookup map for right data
    const rightMap = new Map();
    rightData.forEach(row => {
      const keyValue = row[rightKey];
      if (!rightMap.has(keyValue)) {
        rightMap.set(keyValue, []);
      }
      rightMap.get(keyValue).push(row);
    });
    
    // Track which right rows were matched
    const matchedRightKeys = new Set();
    
    // Process left data
    leftData.forEach(leftRow => {
      const leftKeyValue = leftRow[leftKey];
      const rightMatches = rightMap.get(leftKeyValue) || [];
      
      if (rightMatches.length > 0) {
        // Inner and Left joins: include matched rows
        rightMatches.forEach(rightRow => {
          matchedRightKeys.add(leftKeyValue);
          const joinedRow = { ...leftRow };
          
          // Add right row data with prefix
          Object.entries(rightRow).forEach(([field, value]) => {
            if (field !== rightKey) {
              joinedRow[`${rightPrefix}_${field}`] = value;
            }
          });
          
          result.push(joinedRow);
        });
      } else if (joinType === 'left' || joinType === 'outer') {
        // Left and Outer joins: include unmatched left rows
        const joinedRow = { ...leftRow };
        
        // Add null values for right fields
        rightData[0] && Object.keys(rightData[0]).forEach(field => {
          if (field !== rightKey) {
            joinedRow[`${rightPrefix}_${field}`] = null;
          }
        });
        
        result.push(joinedRow);
      }
    });
    
    // For right and outer joins: add unmatched right rows
    if (joinType === 'right' || joinType === 'outer') {
      rightData.forEach(rightRow => {
        const rightKeyValue = rightRow[rightKey];
        if (!matchedRightKeys.has(rightKeyValue)) {
          const joinedRow: any = {};
          
          // Add null values for left fields
          leftData[0] && Object.keys(leftData[0]).forEach(field => {
            joinedRow[field] = null;
          });
          
          // Add right row data with prefix
          Object.entries(rightRow).forEach(([field, value]) => {
            if (field !== rightKey) {
              joinedRow[`${rightPrefix}_${field}`] = value;
            } else {
              joinedRow[leftKey] = value; // Use the join key
            }
          });
          
          result.push(joinedRow);
        }
      });
    }
    
    return result;
  }
  
  static validateJoinRequest(config: JoinConfig, baseProject: any, joinProjects: any[]): string | null {
    // Validate join keys exist
    for (const projectId of config.joinWithProjects) {
      const joinKey = config.joinKeys[projectId];
      if (!joinKey) {
        return `Join key not specified for project ${projectId}`;
      }
      
      const project = joinProjects.find(p => p.id === projectId);
      if (!project) {
        return `Project ${projectId} not found`;
      }
      
      if (!project.schema || !project.schema[joinKey]) {
        return `Join key '${joinKey}' not found in project ${project.name}`;
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