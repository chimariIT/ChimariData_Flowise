// Data Transformation Service
// Handles applying transformations to dataset in memory

export class DataTransformationService {
  static async applyTransformations(data: any[], transformations: any[]): Promise<any[]> {
    let transformedData = [...data];

    for (const transformation of transformations) {
      try {
        switch (transformation.type) {
          case 'filter':
            transformedData = this.applyFilter(transformedData, transformation.config);
            break;
          case 'select':
            transformedData = this.applySelect(transformedData, transformation.config);
            break;
          case 'rename':
            transformedData = this.applyRename(transformedData, transformation.config);
            break;
          case 'convert':
            transformedData = this.applyConvert(transformedData, transformation.config);
            break;
          case 'clean':
            transformedData = this.applyClean(transformedData, transformation.config);
            break;
          case 'aggregate':
            transformedData = this.applyAggregate(transformedData, transformation.config);
            break;
          case 'sort':
            transformedData = this.applySort(transformedData, transformation.config);
            break;
        }
      } catch (error) {
        console.error(`Error applying transformation ${transformation.type}:`, error);
        // Continue with other transformations even if one fails
      }
    }

    return transformedData;
  }

  private static applyFilter(data: any[], config: any): any[] {
    const { field, operator, value } = config;
    if (!field || !operator || value === undefined) return data;

    return data.filter(row => {
      const fieldValue = row[field];
      
      switch (operator) {
        case 'equals':
          return fieldValue == value;
        case 'not_equals':
          return fieldValue != value;
        case 'contains':
          return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
        case 'greater_than':
          return Number(fieldValue) > Number(value);
        case 'less_than':
          return Number(fieldValue) < Number(value);
        default:
          return true;
      }
    });
  }

  private static applySelect(data: any[], config: any): any[] {
    const { fields } = config;
    if (!fields || fields.length === 0) return data;

    return data.map(row => {
      const newRow: any = {};
      fields.forEach((field: string) => {
        if (row.hasOwnProperty(field)) {
          newRow[field] = row[field];
        }
      });
      return newRow;
    });
  }

  private static applyRename(data: any[], config: any): any[] {
    const { mappings } = config;
    if (!mappings || Object.keys(mappings).length === 0) return data;

    return data.map(row => {
      const newRow: any = {};
      Object.keys(row).forEach(key => {
        const newKey = mappings[key] || key;
        newRow[newKey] = row[key];
      });
      return newRow;
    });
  }

  private static applyConvert(data: any[], config: any): any[] {
    const { field, newType } = config;
    if (!field || !newType) return data;

    return data.map(row => {
      const newRow = { ...row };
      
      try {
        switch (newType) {
          case 'number':
            newRow[field] = Number(row[field]);
            break;
          case 'text':
            newRow[field] = String(row[field]);
            break;
          case 'date':
            newRow[field] = new Date(row[field]).toISOString();
            break;
        }
      } catch (error) {
        // Keep original value if conversion fails
      }
      
      return newRow;
    });
  }

  private static applyClean(data: any[], config: any): any[] {
    const { removeNulls, trimWhitespace } = config;

    return data.map(row => {
      const newRow: any = {};
      
      Object.keys(row).forEach(key => {
        let value = row[key];
        
        // Remove nulls/empty values
        if (removeNulls && (value === null || value === undefined || value === '')) {
          return; // Skip this field
        }
        
        // Trim whitespace
        if (trimWhitespace && typeof value === 'string') {
          value = value.trim();
        }
        
        newRow[key] = value;
      });
      
      return newRow;
    }).filter(row => Object.keys(row).length > 0); // Remove completely empty rows
  }

  private static applyAggregate(data: any[], config: any): any[] {
    const { groupBy, aggregations } = config;
    console.log('Applying aggregation with config:', { groupBy, aggregations, dataLength: data.length });
    
    if (!groupBy || groupBy.length === 0 || !aggregations || aggregations.length === 0) {
      console.log('Invalid aggregation config, returning original data');
      return data;
    }

    // Group data by specified fields
    const groups: { [key: string]: any[] } = {};
    
    data.forEach(row => {
      const groupKey = groupBy.map((field: string) => row[field]).join('|');
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(row);
    });

    console.log(`Created ${Object.keys(groups).length} groups from ${data.length} rows`);

    // Apply aggregations
    const result = Object.keys(groups).map(groupKey => {
      const group = groups[groupKey];
      const resultRow: any = {};
      
      // Add group by fields
      groupBy.forEach((field: string, index: number) => {
        resultRow[field] = groupKey.split('|')[index];
      });
      
      // Apply aggregations
      aggregations.forEach((agg: any) => {
        const { field, operation, alias } = agg;
        const values = group.map(row => Number(row[field])).filter(v => !isNaN(v));
        
        // Use alias if provided, otherwise use field_operation format
        const resultFieldName = alias || `${field}_${operation}`;
        
        switch (operation) {
          case 'sum':
            resultRow[resultFieldName] = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            resultRow[resultFieldName] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            break;
          case 'count':
            resultRow[resultFieldName] = group.length;
            break;
          case 'min':
            resultRow[resultFieldName] = Math.min(...values);
            break;
          case 'max':
            resultRow[resultFieldName] = Math.max(...values);
            break;
        }
      });
      
      return resultRow;
    });

    console.log('Aggregation result:', { resultCount: result.length, sampleRow: result[0] });
    return result;
  }

  private static applySort(data: any[], config: any): any[] {
    const { field, direction } = config;
    if (!field) return data;

    return [...data].sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];
      
      let comparison = 0;
      
      if (aValue < bValue) {
        comparison = -1;
      } else if (aValue > bValue) {
        comparison = 1;
      }
      
      return direction === 'desc' ? -comparison : comparison;
    });
  }
}