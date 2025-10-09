// server/services/data-transformation-tools.ts
import { ToolHandler, ExecutionContext, ToolExecutionResult, ValidationResult, ToolHandlerStatus, ToolMetadata, ToolCategory } from './tool-registry';
import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs/promises';

// Data Transformation Tool Interfaces
export interface DataTransformationConfig {
  sourceFormat: string;
  targetFormat: string;
  transformations: TransformationStep[];
  validationRules: ValidationRule[];
  outputOptions: OutputOptions;
}

export interface TransformationStep {
  id: string;
  type: TransformationType;
  name: string;
  description: string;
  configuration: Record<string, any>;
  order: number;
  conditions?: TransformationCondition[];
}

export interface TransformationCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'regex';
  value: any;
}

export interface ValidationRule {
  id: string;
  type: 'data_type' | 'range' | 'format' | 'custom' | 'business_rule';
  field: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  action: 'block' | 'warn' | 'fix' | 'log';
}

export interface OutputOptions {
  format: string;
  compression?: string;
  encoding?: string;
  headers?: boolean;
  delimiter?: string;
  quoteChar?: string;
  escapeChar?: string;
}

export type TransformationType = 
  | 'filter_rows'
  | 'filter_columns'
  | 'map_values'
  | 'aggregate'
  | 'join'
  | 'pivot'
  | 'unpivot'
  | 'sort'
  | 'group_by'
  | 'deduplicate'
  | 'normalize'
  | 'denormalize'
  | 'split_column'
  | 'merge_columns'
  | 'calculate_field'
  | 'format_data'
  | 'custom_function';

// CSV to JSON Converter Tool
export class CSVToJSONConverter implements ToolHandler {
  async execute(input: any, context: ExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { filePath, options = {} } = input;
      const { delimiter = ',', headers = true, encoding = 'utf8' } = options;

      // Read CSV file
      const csvContent = await fs.readFile(filePath, encoding);
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      // Parse CSV
      const result = this.parseCSV(lines, delimiter, headers);
      
      // Generate output file path
      const outputPath = filePath.replace(path.extname(filePath), '.json');
      
      // Write JSON file
      await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

      const duration = Date.now() - startTime;
      
      return {
        executionId: context.executionId,
        toolId: 'csv_to_json_converter',
        status: 'success',
        result: {
          outputPath,
          recordCount: result.length,
          columns: headers ? Object.keys(result[0] || {}) : [],
          preview: result.slice(0, 5)
        },
        metrics: {
          duration,
          resourcesUsed: {
            cpu: 15.2,
            memory: Math.max(100, csvContent.length / 1024), // KB
            storage: csvContent.length / 1024 // KB
          },
          cost: this.calculateCost(result.length, duration)
        },
        artifacts: [{
          type: 'converted_file',
          data: outputPath,
          metadata: { 
            originalFormat: 'csv',
            targetFormat: 'json',
            recordCount: result.length
          }
        }],
        nextSuggestedTools: ['json_validator', 'data_quality_checker', 'schema_generator']
      };

    } catch (error: any) {
      return {
        executionId: context.executionId,
        toolId: 'csv_to_json_converter',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 5, memory: 50, storage: 0 },
          cost: 0
        }
      };
    }
  }

  private parseCSV(lines: string[], delimiter: string, headers: boolean): any[] {
    const result: any[] = [];
    
    let headerRow: string[] = [];
    let dataStartIndex = 0;

    if (headers && lines.length > 0) {
      headerRow = this.parseLine(lines[0], delimiter);
      dataStartIndex = 1;
    }

    for (let i = dataStartIndex; i < lines.length; i++) {
      const values = this.parseLine(lines[i], delimiter);
      
      if (headers) {
        const record: Record<string, any> = {};
        headerRow.forEach((header, index) => {
          record[header] = this.parseValue(values[index] || '');
        });
        result.push(record);
      } else {
        result.push(values.map(value => this.parseValue(value)));
      }
    }

    return result;
  }

  private parseLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  private parseValue(value: string): any {
    value = value.trim();
    
    // Remove quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    
    // Try to parse as number
    if (!isNaN(Number(value)) && value !== '') {
      return Number(value);
    }
    
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Return as string
    return value;
  }

  private calculateCost(records: number, duration: number): number {
    // Base cost: $0.001 per 1000 records + $0.0001 per second
    return (records / 1000) * 0.001 + (duration / 1000) * 0.0001;
  }

  async validate(input: any): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!input.filePath) {
      errors.push({ field: 'filePath', message: 'File path is required', code: 'MISSING_FILE_PATH' });
    }

    if (input.options?.delimiter && input.options.delimiter.length !== 1) {
      errors.push({ field: 'delimiter', message: 'Delimiter must be a single character', code: 'INVALID_DELIMITER' });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async getStatus(): Promise<ToolHandlerStatus> {
    return {
      status: 'active',
      currentExecutions: 0,
      queuedExecutions: 0,
      lastActivity: new Date(),
      healthScore: 100,
      resourceUsage: {
        cpu: 2.1,
        memory: 45.0,
        storage: 10.5
      }
    };
  }

  async configure(config: Record<string, any>): Promise<void> {
    console.log('CSV to JSON Converter configured:', config);
  }

  async shutdown(): Promise<void> {
    console.log('CSV to JSON Converter shutting down...');
  }
}

// Data Quality Checker Tool
export class DataQualityChecker implements ToolHandler {
  async execute(input: any, context: ExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { data, rules = [], options = {} } = input;
      
      const qualityReport = await this.analyzeDataQuality(data, rules, options);
      
      const duration = Date.now() - startTime;
      
      return {
        executionId: context.executionId,
        toolId: 'data_quality_checker',
        status: 'success',
        result: qualityReport,
        metrics: {
          duration,
          resourcesUsed: {
            cpu: 25.5,
            memory: Array.isArray(data) ? data.length * 0.1 : 100,
            storage: 5.2
          },
          cost: this.calculateQualityCost(data, duration)
        },
        artifacts: [{
          type: 'quality_report',
          data: qualityReport,
          metadata: { 
            totalIssues: qualityReport.issues.length,
            qualityScore: qualityReport.overallScore
          }
        }],
        nextSuggestedTools: ['data_cleaner', 'data_standardizer', 'outlier_detector']
      };

    } catch (error: any) {
      return {
        executionId: context.executionId,
        toolId: 'data_quality_checker',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 5, memory: 50, storage: 0 },
          cost: 0
        }
      };
    }
  }

  private async analyzeDataQuality(data: any[], rules: ValidationRule[], options: any): Promise<any> {
    const issues: any[] = [];
    const fieldAnalysis: Record<string, any> = {};
    
    if (!Array.isArray(data) || data.length === 0) {
      return {
        overallScore: 0,
        issues: [{ type: 'critical', message: 'No data to analyze' }],
        fieldAnalysis: {},
        recommendations: ['Ensure data is provided as a non-empty array']
      };
    }

    // Analyze each field
    const firstRecord = data[0];
    if (typeof firstRecord === 'object' && firstRecord !== null) {
      for (const field of Object.keys(firstRecord)) {
        fieldAnalysis[field] = this.analyzeField(data, field);
      }
    }

    // Check for common data quality issues
    issues.push(...this.checkCompleteness(data, fieldAnalysis));
    issues.push(...this.checkConsistency(data, fieldAnalysis));
    issues.push(...this.checkAccuracy(data, fieldAnalysis));
    issues.push(...this.checkValidity(data, rules));

    // Calculate overall quality score
    const totalChecks = Object.keys(fieldAnalysis).length * 4; // 4 checks per field
    const issueCount = issues.filter(i => i.severity === 'error').length;
    const overallScore = Math.max(0, Math.min(100, ((totalChecks - issueCount) / totalChecks) * 100));

    return {
      overallScore: Math.round(overallScore),
      recordCount: data.length,
      fieldCount: Object.keys(fieldAnalysis).length,
      issues,
      fieldAnalysis,
      recommendations: this.generateRecommendations(issues, fieldAnalysis)
    };
  }

  private analyzeField(data: any[], fieldName: string): any {
    const values = data.map(record => record[fieldName]).filter(val => val !== null && val !== undefined);
    const nonEmptyValues = values.filter(val => val !== '');
    
    const analysis = {
      totalValues: data.length,
      nonNullValues: values.length,
      nonEmptyValues: nonEmptyValues.length,
      completeness: (nonEmptyValues.length / data.length) * 100,
      dataTypes: {},
      uniqueValues: new Set(nonEmptyValues).size,
      uniqueness: (new Set(nonEmptyValues).size / Math.max(1, nonEmptyValues.length)) * 100
    };

    // Analyze data types
    const dataTypes: Record<string, number> = {};
    nonEmptyValues.forEach(value => {
      const type = this.getDataType(value);
      dataTypes[type] = (dataTypes[type] || 0) + 1;
    });
    analysis.dataTypes = dataTypes;

    return analysis;
  }

  private getDataType(value: any): string {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
      if (/^[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(value)) return 'email';
      if (/^\+?[\d\s()-]+$/.test(value)) return 'phone';
      if (/^https?:\/\//.test(value)) return 'url';
      return 'string';
    }
    return 'unknown';
  }

  private checkCompleteness(data: any[], fieldAnalysis: Record<string, any>): any[] {
    const issues: any[] = [];
    
    for (const [field, analysis] of Object.entries(fieldAnalysis)) {
      if (analysis.completeness < 90) {
        issues.push({
          type: 'completeness',
          severity: analysis.completeness < 50 ? 'error' : 'warning',
          field,
          message: `Field '${field}' is ${analysis.completeness.toFixed(1)}% complete`,
          affectedRecords: analysis.totalValues - analysis.nonEmptyValues
        });
      }
    }
    
    return issues;
  }

  private checkConsistency(data: any[], fieldAnalysis: Record<string, any>): any[] {
    const issues: any[] = [];
    
    for (const [field, analysis] of Object.entries(fieldAnalysis)) {
      const dataTypes = Object.keys(analysis.dataTypes);
      if (dataTypes.length > 1) {
        issues.push({
          type: 'consistency',
          severity: 'warning',
          field,
          message: `Field '${field}' has mixed data types: ${dataTypes.join(', ')}`,
          details: analysis.dataTypes
        });
      }
    }
    
    return issues;
  }

  private checkAccuracy(data: any[], fieldAnalysis: Record<string, any>): any[] {
    const issues: any[] = [];
    
    // Check for potential outliers (simplified)
    for (const [field, analysis] of Object.entries(fieldAnalysis)) {
      if (analysis.dataTypes.number && analysis.nonEmptyValues > 10) {
        const values = data.map(r => r[field]).filter(v => typeof v === 'number');
        const outliers = this.detectOutliers(values);
        
        if (outliers.length > 0) {
          issues.push({
            type: 'accuracy',
            severity: 'info',
            field,
            message: `Field '${field}' has ${outliers.length} potential outliers`,
            outliers: outliers.slice(0, 5) // Show first 5
          });
        }
      }
    }
    
    return issues;
  }

  private checkValidity(data: any[], rules: ValidationRule[]): any[] {
    const issues: any[] = [];
    
    rules.forEach(rule => {
      const violations = this.applyValidationRule(data, rule);
      if (violations.length > 0) {
        issues.push({
          type: 'validity',
          severity: rule.severity,
          field: rule.field,
          message: `Validation rule '${rule.rule}' failed for ${violations.length} records`,
          violations: violations.slice(0, 10) // Show first 10
        });
      }
    });
    
    return issues;
  }

  private detectOutliers(values: number[]): number[] {
    if (values.length < 4) return [];
    
    values.sort((a, b) => a - b);
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return values.filter(value => value < lowerBound || value > upperBound);
  }

  private applyValidationRule(data: any[], rule: ValidationRule): any[] {
    // Simplified validation rule application
    const violations: any[] = [];
    
    data.forEach((record, index) => {
      const value = record[rule.field];
      let isValid = true;
      
      switch (rule.type) {
        case 'data_type':
          isValid = typeof value === rule.rule;
          break;
        case 'format':
          if (typeof value === 'string') {
            isValid = new RegExp(rule.rule).test(value);
          }
          break;
        case 'range':
          if (typeof value === 'number') {
            const [min, max] = rule.rule.split('-').map(Number);
            isValid = value >= min && value <= max;
          }
          break;
      }
      
      if (!isValid) {
        violations.push({ recordIndex: index, value, rule: rule.rule });
      }
    });
    
    return violations;
  }

  private generateRecommendations(issues: any[], fieldAnalysis: Record<string, any>): string[] {
    const recommendations: string[] = [];
    
    const completenessIssues = issues.filter(i => i.type === 'completeness');
    if (completenessIssues.length > 0) {
      recommendations.push('Consider data imputation or collection improvement for incomplete fields');
    }
    
    const consistencyIssues = issues.filter(i => i.type === 'consistency');
    if (consistencyIssues.length > 0) {
      recommendations.push('Standardize data types and formats across all records');
    }
    
    const validityIssues = issues.filter(i => i.type === 'validity');
    if (validityIssues.length > 0) {
      recommendations.push('Review and correct data that violates business rules');
    }
    
    return recommendations;
  }

  private calculateQualityCost(data: any, duration: number): number {
    const recordCount = Array.isArray(data) ? data.length : 0;
    return (recordCount / 10000) * 0.01 + (duration / 1000) * 0.0001;
  }

  async validate(input: any): Promise<ValidationResult> {
    const errors: any[] = [];
    
    if (!input.data) {
      errors.push({ field: 'data', message: 'Data is required', code: 'MISSING_DATA' });
    }
    
    if (input.data && !Array.isArray(input.data)) {
      errors.push({ field: 'data', message: 'Data must be an array', code: 'INVALID_DATA_TYPE' });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  async getStatus(): Promise<ToolHandlerStatus> {
    return {
      status: 'active',
      currentExecutions: 0,
      queuedExecutions: 0,
      lastActivity: new Date(),
      healthScore: 100,
      resourceUsage: {
        cpu: 8.3,
        memory: 128.0,
        storage: 15.2
      }
    };
  }

  async configure(config: Record<string, any>): Promise<void> {
    console.log('Data Quality Checker configured:', config);
  }

  async shutdown(): Promise<void> {
    console.log('Data Quality Checker shutting down...');
  }
}

// Schema Generator Tool
export class SchemaGenerator implements ToolHandler {
  async execute(input: any, context: ExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { data, options = {} } = input;
      const { schemaType = 'json_schema', includeExamples = true, strictMode = false } = options;
      
      const schema = await this.generateSchema(data, schemaType, includeExamples, strictMode);
      
      const duration = Date.now() - startTime;
      
      return {
        executionId: context.executionId,
        toolId: 'schema_generator',
        status: 'success',
        result: {
          schema,
          schemaType,
          statistics: this.generateStatistics(data),
          metadata: {
            generatedAt: new Date(),
            recordCount: Array.isArray(data) ? data.length : 1,
            schemaComplexity: this.calculateComplexity(schema)
          }
        },
        metrics: {
          duration,
          resourcesUsed: {
            cpu: 12.8,
            memory: Array.isArray(data) ? data.length * 0.05 : 50,
            storage: 8.1
          },
          cost: this.calculateSchemaCost(data, duration)
        },
        artifacts: [{
          type: 'schema_definition',
          data: schema,
          metadata: { 
            schemaType,
            complexity: this.calculateComplexity(schema)
          }
        }],
        nextSuggestedTools: ['schema_validator', 'data_converter', 'api_generator']
      };

    } catch (error: any) {
      return {
        executionId: context.executionId,
        toolId: 'schema_generator',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: { cpu: 5, memory: 50, storage: 0 },
          cost: 0
        }
      };
    }
  }

  private async generateSchema(data: any, schemaType: string, includeExamples: boolean, strictMode: boolean): Promise<any> {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Data must be a non-empty array');
    }

    const sampleSize = Math.min(data.length, strictMode ? data.length : 1000);
    const sample = data.slice(0, sampleSize);

    switch (schemaType) {
      case 'json_schema':
        return this.generateJSONSchema(sample, includeExamples, strictMode);
      case 'avro':
        return this.generateAvroSchema(sample);
      case 'parquet':
        return this.generateParquetSchema(sample);
      case 'sql_ddl':
        return this.generateSQLDDL(sample);
      default:
        throw new Error(`Unsupported schema type: ${schemaType}`);
    }
  }

  private generateJSONSchema(data: any[], includeExamples: boolean, strictMode: boolean): any {
    const schema: any = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'array',
      items: {
        type: 'object',
        properties: {},
        required: []
      }
    };

    if (data.length === 0) return schema;

    const firstRecord = data[0];
    const fieldAnalysis: Record<string, any> = {};

    // Analyze each field across all records
    for (const field of Object.keys(firstRecord)) {
      fieldAnalysis[field] = this.analyzeFieldForSchema(data, field, strictMode);
    }

    // Build schema properties
    for (const [field, analysis] of Object.entries(fieldAnalysis)) {
      const fieldSchema: any = {
        type: analysis.type,
        description: `${field} field`
      };

      // Add format information
      if (analysis.format) {
        fieldSchema.format = analysis.format;
      }

      // Add constraints
      if (analysis.constraints) {
        Object.assign(fieldSchema, analysis.constraints);
      }

      // Add examples
      if (includeExamples && analysis.examples) {
        fieldSchema.examples = analysis.examples;
      }

      // Add enum for categorical data
      if (analysis.isEnum) {
        fieldSchema.enum = analysis.enumValues;
      }

      schema.items.properties[field] = fieldSchema;

      // Add to required if field is present in most records
      if (analysis.completeness > 90 || strictMode) {
        schema.items.required.push(field);
      }
    }

    return schema;
  }

  private generateAvroSchema(data: any[]): any {
    const schema: any = {
      type: 'record',
      name: 'GeneratedRecord',
      fields: []
    };

    if (data.length === 0) return schema;

    const firstRecord = data[0];
    
    for (const field of Object.keys(firstRecord)) {
      const analysis = this.analyzeFieldForSchema(data, field, false);
      
      const fieldSchema: any = {
        name: field,
        type: this.mapToAvroType(analysis.type),
        doc: `${field} field`
      };

      if (analysis.completeness < 100) {
        fieldSchema.type = ['null', fieldSchema.type];
        fieldSchema.default = null;
      }

      schema.fields.push(fieldSchema);
    }

    return schema;
  }

  private generateParquetSchema(data: any[]): any {
    const schema: any = {
      type: 'record',
      name: 'ParquetSchema',
      fields: []
    };

    if (data.length === 0) return schema;

    const firstRecord = data[0];
    
    for (const field of Object.keys(firstRecord)) {
      const analysis = this.analyzeFieldForSchema(data, field, false);
      
      schema.fields.push({
        name: field,
        type: this.mapToParquetType(analysis.type),
        repetition: analysis.completeness > 90 ? 'REQUIRED' : 'OPTIONAL'
      });
    }

    return schema;
  }

  private generateSQLDDL(data: any[]): string {
    const tableName = 'generated_table';
    let ddl = `CREATE TABLE ${tableName} (\n`;

    if (data.length === 0) {
      return ddl + ');';
    }

    const firstRecord = data[0];
    const columns: string[] = [];
    
    for (const field of Object.keys(firstRecord)) {
      const analysis = this.analyzeFieldForSchema(data, field, false);
      const sqlType = this.mapToSQLType(analysis.type, analysis.constraints);
      const nullable = analysis.completeness < 100 ? '' : ' NOT NULL';
      
      columns.push(`  ${field} ${sqlType}${nullable}`);
    }

    ddl += columns.join(',\n');
    ddl += '\n);';

    return ddl;
  }

  private analyzeFieldForSchema(data: any[], fieldName: string, strictMode: boolean): any {
    const values = data.map(record => record[fieldName]);
    const nonNullValues = values.filter(val => val !== null && val !== undefined && val !== '');
    
    const analysis: any = {
      completeness: (nonNullValues.length / data.length) * 100,
      examples: nonNullValues.slice(0, 3),
      uniqueCount: new Set(nonNullValues).size
    };

    // Determine primary type
    const typeCounts: Record<string, number> = {};
    nonNullValues.forEach(value => {
      const type = this.getDetailedDataType(value);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const primaryType = Object.keys(typeCounts).reduce((a, b) => 
      typeCounts[a] > typeCounts[b] ? a : b
    ) || 'string';

    analysis.type = this.mapToJSONSchemaType(primaryType);
    analysis.format = this.getFormatFromType(primaryType);

    // Add constraints
    if (primaryType === 'number' || primaryType === 'integer') {
      const numericValues = nonNullValues.filter(v => typeof v === 'number');
      if (numericValues.length > 0) {
        analysis.constraints = {
          minimum: Math.min(...numericValues),
          maximum: Math.max(...numericValues)
        };
      }
    }

    if (primaryType === 'string') {
      const stringValues = nonNullValues.filter(v => typeof v === 'string');
      if (stringValues.length > 0) {
        const lengths = stringValues.map(s => s.length);
        analysis.constraints = {
          minLength: Math.min(...lengths),
          maxLength: Math.max(...lengths)
        };
      }
    }

    // Check if field could be an enum
    const uniquenessRatio = analysis.uniqueCount / Math.max(1, nonNullValues.length);
    if (uniquenessRatio < 0.1 && analysis.uniqueCount <= 20) {
      analysis.isEnum = true;
      analysis.enumValues = Array.from(new Set(nonNullValues));
    }

    return analysis;
  }

  private getDetailedDataType(value: any): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'datetime';
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
      if (/^[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(value)) return 'email';
      if (/^https?:\/\//.test(value)) return 'uri';
      return 'string';
    }
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  private mapToJSONSchemaType(detailedType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'integer',
      'number': 'number',
      'boolean': 'boolean',
      'string': 'string',
      'date': 'string',
      'datetime': 'string',
      'email': 'string',
      'uri': 'string',
      'array': 'array',
      'object': 'object'
    };
    return typeMap[detailedType] || 'string';
  }

  private getFormatFromType(detailedType: string): string | undefined {
    const formatMap: Record<string, string> = {
      'date': 'date',
      'datetime': 'date-time',
      'email': 'email',
      'uri': 'uri'
    };
    return formatMap[detailedType];
  }

  private mapToAvroType(jsonSchemaType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'long',
      'number': 'double',
      'boolean': 'boolean',
      'string': 'string',
      'array': 'array',
      'object': 'record'
    };
    return typeMap[jsonSchemaType] || 'string';
  }

  private mapToParquetType(jsonSchemaType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'INT64',
      'number': 'DOUBLE',
      'boolean': 'BOOLEAN',
      'string': 'BYTE_ARRAY',
      'array': 'LIST',
      'object': 'GROUP'
    };
    return typeMap[jsonSchemaType] || 'BYTE_ARRAY';
  }

  private mapToSQLType(jsonSchemaType: string, constraints?: any): string {
    switch (jsonSchemaType) {
      case 'integer':
        return 'BIGINT';
      case 'number':
        return 'DECIMAL(18,6)';
      case 'boolean':
        return 'BOOLEAN';
      case 'string':
        if (constraints?.maxLength) {
          return constraints.maxLength <= 255 ? `VARCHAR(${constraints.maxLength})` : 'TEXT';
        }
        return 'TEXT';
      case 'array':
        return 'JSON';
      case 'object':
        return 'JSON';
      default:
        return 'TEXT';
    }
  }

  private generateStatistics(data: any[]): any {
    if (!Array.isArray(data)) return {};
    
    return {
      recordCount: data.length,
      fieldCount: data.length > 0 ? Object.keys(data[0]).length : 0,
      estimatedSize: JSON.stringify(data).length,
      complexity: this.calculateDataComplexity(data)
    };
  }

  private calculateComplexity(schema: any): number {
    if (!schema || !schema.items || !schema.items.properties) return 1;
    
    const fieldCount = Object.keys(schema.items.properties).length;
    const requiredCount = schema.items.required ? schema.items.required.length : 0;
    const hasConstraints = Object.values(schema.items.properties).some((prop: any) => 
      prop.minimum !== undefined || prop.maximum !== undefined || prop.enum !== undefined
    );
    
    return Math.min(10, fieldCount / 5 + requiredCount / 10 + (hasConstraints ? 2 : 0));
  }

  private calculateDataComplexity(data: any[]): number {
    if (data.length === 0) return 1;
    
    const firstRecord = data[0];
    const fieldCount = Object.keys(firstRecord).length;
    const nestedFields = Object.values(firstRecord).filter(val => 
      typeof val === 'object' && val !== null
    ).length;
    
    return Math.min(10, fieldCount / 10 + nestedFields * 2);
  }

  private calculateSchemaCost(data: any, duration: number): number {
    const recordCount = Array.isArray(data) ? data.length : 1;
    return (recordCount / 5000) * 0.005 + (duration / 1000) * 0.0001;
  }

  async validate(input: any): Promise<ValidationResult> {
    const errors: any[] = [];
    
    if (!input.data) {
      errors.push({ field: 'data', message: 'Data is required', code: 'MISSING_DATA' });
    }
    
    if (input.data && !Array.isArray(input.data)) {
      errors.push({ field: 'data', message: 'Data must be an array', code: 'INVALID_DATA_TYPE' });
    }
    
    const validSchemaTypes = ['json_schema', 'avro', 'parquet', 'sql_ddl'];
    if (input.options?.schemaType && !validSchemaTypes.includes(input.options.schemaType)) {
      errors.push({ 
        field: 'schemaType', 
        message: `Schema type must be one of: ${validSchemaTypes.join(', ')}`, 
        code: 'INVALID_SCHEMA_TYPE' 
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  async getStatus(): Promise<ToolHandlerStatus> {
    return {
      status: 'active',
      currentExecutions: 0,
      queuedExecutions: 0,
      lastActivity: new Date(),
      healthScore: 100,
      resourceUsage: {
        cpu: 5.7,
        memory: 89.3,
        storage: 12.6
      }
    };
  }

  async configure(config: Record<string, any>): Promise<void> {
    console.log('Schema Generator configured:', config);
  }

  async shutdown(): Promise<void> {
    console.log('Schema Generator shutting down...');
  }
}

// Export tool metadata for registration
export const dataTransformationToolsMetadata: ToolMetadata[] = [
  {
    id: 'csv_to_json_converter',
    name: 'CSV to JSON Converter',
    description: 'Convert CSV files to JSON format with configurable parsing options',
    category: 'data_transformation' as ToolCategory,
    version: '1.0.0',
    author: 'ChimariData Team',
    tags: ['csv', 'json', 'conversion', 'file_processing'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        options: {
          type: 'object',
          properties: {
            delimiter: { type: 'string' },
            headers: { type: 'boolean' },
            encoding: { type: 'string' }
          }
        }
      },
      required: ['filePath']
    },
    outputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string' },
        recordCount: { type: 'number' },
        columns: { type: 'array' },
        preview: { type: 'array' }
      }
    },
    configuration: {
      runtime: 'nodejs',
      timeout: 300000, // 5 minutes
      memory: 512,
      cpu: 1,
      storage: 1024,
      environment: {},
      secrets: [],
      networkAccess: false,
      fileSystemAccess: true,
      databaseAccess: false
    },
    capabilities: [
      {
        name: 'csv_conversion',
        description: 'Convert CSV files to JSON format',
        inputTypes: ['csv'],
        outputTypes: ['json'],
        complexity: 'low',
        estimatedDuration: 60,
        requiredResources: ['compute', 'storage'],
        scalability: 'single'
      }
    ],
    dependencies: [],
    pricing: {
      model: 'usage_based',
      costPerExecution: 0.001,
      freeTier: {
        executions: 1000,
        dataLimitMB: 10,
        timeoutMinutes: 5
      }
    },
    permissions: {
      userTypes: ['non_tech', 'business', 'technical', 'consultation'],
      subscriptionTiers: ['trial', 'starter', 'professional', 'enterprise'],
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 500,
        requestsPerDay: 2000
      },
      dataAccessLevel: 'read'
    },
    healthCheck: {
      interval: 60000,
      timeout: 5000,
      retryAttempts: 3
    },
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      averageResourceUsage: {
        cpu: 0,
        memory: 0,
        storage: 0
      },
      userSatisfactionScore: 5.0,
      uptime: 100,
      errorRate: 0
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active'
  },
  {
    id: 'data_quality_checker',
    name: 'Data Quality Checker',
    description: 'Comprehensive data quality analysis with completeness, consistency, accuracy, and validity checks',
    category: 'data_validation' as ToolCategory,
    version: '1.0.0',
    author: 'ChimariData Team',
    tags: ['data_quality', 'validation', 'analysis', 'reporting'],
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array' },
        rules: { type: 'array' },
        options: { type: 'object' }
      },
      required: ['data']
    },
    outputSchema: {
      type: 'object',
      properties: {
        overallScore: { type: 'number' },
        issues: { type: 'array' },
        fieldAnalysis: { type: 'object' },
        recommendations: { type: 'array' }
      }
    },
    configuration: {
      runtime: 'nodejs',
      timeout: 600000, // 10 minutes
      memory: 1024,
      cpu: 2,
      storage: 512,
      environment: {},
      secrets: [],
      networkAccess: false,
      fileSystemAccess: false,
      databaseAccess: false
    },
    capabilities: [
      {
        name: 'quality_analysis',
        description: 'Analyze data quality across multiple dimensions',
        inputTypes: ['json', 'array', 'csv'],
        outputTypes: ['quality_report', 'recommendations'],
        complexity: 'medium',
        estimatedDuration: 180,
        requiredResources: ['compute'],
        scalability: 'parallel'
      }
    ],
    dependencies: [],
    pricing: {
      model: 'usage_based',
      costPerExecution: 0.01,
      freeTier: {
        executions: 100,
        dataLimitMB: 50,
        timeoutMinutes: 10
      }
    },
    permissions: {
      userTypes: ['business', 'technical', 'consultation'],
      subscriptionTiers: ['starter', 'professional', 'enterprise'],
      rateLimits: {
        requestsPerMinute: 30,
        requestsPerHour: 200,
        requestsPerDay: 1000
      },
      dataAccessLevel: 'read'
    },
    healthCheck: {
      interval: 60000,
      timeout: 10000,
      retryAttempts: 3
    },
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      averageResourceUsage: {
        cpu: 0,
        memory: 0,
        storage: 0
      },
      userSatisfactionScore: 5.0,
      uptime: 100,
      errorRate: 0
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active'
  },
  {
    id: 'schema_generator',
    name: 'Schema Generator',
    description: 'Generate schemas in multiple formats (JSON Schema, Avro, Parquet, SQL DDL) from data samples',
    category: 'data_transformation' as ToolCategory,
    version: '1.0.0',
    author: 'ChimariData Team',
    tags: ['schema', 'generation', 'json_schema', 'avro', 'parquet', 'sql'],
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array' },
        options: {
          type: 'object',
          properties: {
            schemaType: { type: 'string' },
            includeExamples: { type: 'boolean' },
            strictMode: { type: 'boolean' }
          }
        }
      },
      required: ['data']
    },
    outputSchema: {
      type: 'object',
      properties: {
        schema: { type: 'object' },
        schemaType: { type: 'string' },
        statistics: { type: 'object' },
        metadata: { type: 'object' }
      }
    },
    configuration: {
      runtime: 'nodejs',
      timeout: 300000, // 5 minutes
      memory: 512,
      cpu: 1,
      storage: 256,
      environment: {},
      secrets: [],
      networkAccess: false,
      fileSystemAccess: false,
      databaseAccess: false
    },
    capabilities: [
      {
        name: 'schema_generation',
        description: 'Generate schemas from data samples in multiple formats',
        inputTypes: ['json', 'array', 'object'],
        outputTypes: ['json_schema', 'avro_schema', 'parquet_schema', 'sql_ddl'],
        complexity: 'medium',
        estimatedDuration: 120,
        requiredResources: ['compute'],
        scalability: 'single'
      }
    ],
    dependencies: [],
    pricing: {
      model: 'usage_based',
      costPerExecution: 0.005,
      freeTier: {
        executions: 200,
        dataLimitMB: 25,
        timeoutMinutes: 5
      }
    },
    permissions: {
      userTypes: ['technical', 'consultation'],
      subscriptionTiers: ['professional', 'enterprise'],
      rateLimits: {
        requestsPerMinute: 40,
        requestsPerHour: 300,
        requestsPerDay: 1500
      },
      dataAccessLevel: 'read'
    },
    healthCheck: {
      interval: 60000,
      timeout: 5000,
      retryAttempts: 3
    },
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      averageResourceUsage: {
        cpu: 0,
        memory: 0,
        storage: 0
      },
      userSatisfactionScore: 5.0,
      uptime: 100,
      errorRate: 0
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active'
  }
];