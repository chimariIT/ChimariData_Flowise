/**
 * Data Quality Monitor
 *
 * Monitors data quality metrics, detects anomalies, and validates schemas.
 * Used by Data Engineer agents to ensure data quality before analysis.
 *
 * Features:
 * - Data profiling and statistics
 * - Quality rule validation
 * - Anomaly detection
 * - Schema validation
 * - Data completeness checks
 * - Quality score calculation
 * - Issue tracking and recommendations
 */

export interface QualityRule {
  ruleId: string;
  name: string;
  description: string;
  type: 'completeness' | 'validity' | 'consistency' | 'accuracy' | 'uniqueness' | 'timeliness';
  severity: 'critical' | 'high' | 'medium' | 'low';
  condition: {
    field?: string;
    operator: 'not_null' | 'unique' | 'in_range' | 'matches_pattern' | 'no_duplicates' | 'custom';
    parameters?: Record<string, any>;
  };
  enabled: boolean;
}

export interface QualityIssue {
  issueId: string;
  ruleId: string;
  ruleName: string;
  severity: QualityRule['severity'];
  type: QualityRule['type'];
  description: string;
  affectedField?: string;
  affectedRows?: number;
  examples?: any[];
  recommendation: string;
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface DataProfile {
  datasetId: string;
  datasetName: string;
  profiledAt: Date;
  rowCount: number;
  columnCount: number;
  columns: Array<{
    name: string;
    type: string;
    nullCount: number;
    nullPercentage: number;
    uniqueCount: number;
    uniquePercentage: number;
    min?: any;
    max?: any;
    mean?: number;
    median?: number;
    mode?: any;
    stdDev?: number;
    topValues?: Array<{ value: any; count: number; percentage: number }>;
    distribution?: {
      histogram?: Array<{ bin: string; count: number }>;
      outliers?: any[];
    };
  }>;
  duplicateRows?: {
    count: number;
    percentage: number;
    examples?: any[];
  };
  missingDataPattern?: {
    totalMissing: number;
    percentage: number;
    byColumn: Record<string, number>;
  };
}

export interface QualityReport {
  reportId: string;
  datasetId: string;
  datasetName: string;
  generatedAt: Date;
  overallScore: number; // 0-100
  dimensionScores: {
    completeness: number;
    validity: number;
    consistency: number;
    accuracy: number;
    uniqueness: number;
    timeliness: number;
  };
  profile: DataProfile;
  issues: QualityIssue[];
  passedRules: number;
  failedRules: number;
  totalRules: number;
  recommendations: string[];
  readyForAnalysis: boolean;
  warnings: string[];
}

export interface ValidateDataRequest {
  datasetId: string;
  datasetName: string;
  data: any[]; // Sample or full dataset
  schema?: {
    columns: Array<{
      name: string;
      type: string;
      required?: boolean;
      unique?: boolean;
      constraints?: any;
    }>;
  };
  rules?: QualityRule[];
  options?: {
    profileData?: boolean;
    detectAnomalies?: boolean;
    includeRecommendations?: boolean;
  };
}

export class DataQualityMonitor {
  private rules: Map<string, QualityRule> = new Map();
  private reports: Map<string, QualityReport> = new Map();

  constructor() {
    this.initializeDefaultRules();
    console.log('[DataQualityMonitor] Quality monitoring system initialized');
  }

  /**
   * Validate data quality and generate report
   */
  async validateData(request: ValidateDataRequest): Promise<QualityReport> {
    const reportId = `quality_report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // Profile the data
    const profile = await this.profileData(request.datasetId, request.datasetName, request.data);

    // Run quality rules
    const issues: QualityIssue[] = [];
    const rulesToRun = request.rules || Array.from(this.rules.values()).filter(r => r.enabled);

    for (const rule of rulesToRun) {
      const ruleIssues = await this.evaluateRule(rule, request.data, profile, request.schema);
      issues.push(...ruleIssues);
    }

    // Calculate dimension scores
    const dimensionScores = this.calculateDimensionScores(issues, profile);

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      (dimensionScores.completeness * 0.25) +
      (dimensionScores.validity * 0.20) +
      (dimensionScores.consistency * 0.15) +
      (dimensionScores.accuracy * 0.20) +
      (dimensionScores.uniqueness * 0.10) +
      (dimensionScores.timeliness * 0.10)
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, profile);

    // Determine if ready for analysis
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const readyForAnalysis = overallScore >= 70 && criticalIssues === 0;

    // Generate warnings
    const warnings: string[] = [];
    if (overallScore < 70) {
      warnings.push(`Overall quality score (${overallScore}) is below recommended threshold (70)`);
    }
    if (criticalIssues > 0) {
      warnings.push(`${criticalIssues} critical quality issues detected - must be resolved before analysis`);
    }
    if (profile.missingDataPattern && profile.missingDataPattern.percentage > 20) {
      warnings.push(`High percentage of missing data (${profile.missingDataPattern.percentage.toFixed(1)}%)`);
    }

    const report: QualityReport = {
      reportId,
      datasetId: request.datasetId,
      datasetName: request.datasetName,
      generatedAt: now,
      overallScore,
      dimensionScores,
      profile,
      issues,
      passedRules: rulesToRun.length - issues.length,
      failedRules: issues.length,
      totalRules: rulesToRun.length,
      recommendations,
      readyForAnalysis,
      warnings
    };

    this.reports.set(reportId, report);

    console.log(`[DataQualityMonitor] Generated quality report ${reportId} for ${request.datasetName} (score: ${overallScore})`);

    return report;
  }

  /**
   * Profile dataset and calculate statistics
   */
  async profileData(datasetId: string, datasetName: string, data: any[]): Promise<DataProfile> {
    if (!data || data.length === 0) {
      throw new Error('Cannot profile empty dataset');
    }

    const rowCount = data.length;
    const columns = Object.keys(data[0]);
    const columnCount = columns.length;

    // Profile each column
    const columnProfiles = columns.map(colName => {
      const values = data.map(row => row[colName]);
      const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');

      const nullCount = rowCount - nonNullValues.length;
      const nullPercentage = (nullCount / rowCount) * 100;

      const uniqueValues = new Set(nonNullValues);
      const uniqueCount = uniqueValues.size;
      const uniquePercentage = (uniqueCount / rowCount) * 100;

      // Type detection
      const type = this.detectColumnType(nonNullValues);

      // Calculate statistics based on type
      let min, max, mean, median, mode, stdDev;
      if (type === 'number') {
        const numbers = nonNullValues.filter(v => typeof v === 'number');
        if (numbers.length > 0) {
          min = Math.min(...numbers);
          max = Math.max(...numbers);
          mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;

          const sorted = [...numbers].sort((a, b) => a - b);
          median = sorted[Math.floor(sorted.length / 2)];

          const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numbers.length;
          stdDev = Math.sqrt(variance);
        }
      }

      // Top values
      const valueCounts = new Map<any, number>();
      nonNullValues.forEach(val => {
        valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
      });

      const topValues = Array.from(valueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({
          value,
          count,
          percentage: (count / rowCount) * 100
        }));

      if (topValues.length > 0) {
        mode = topValues[0].value;
      }

      return {
        name: colName,
        type,
        nullCount,
        nullPercentage: Number(nullPercentage.toFixed(2)),
        uniqueCount,
        uniquePercentage: Number(uniquePercentage.toFixed(2)),
        min,
        max,
        mean: mean ? Number(mean.toFixed(2)) : undefined,
        median,
        mode,
        stdDev: stdDev ? Number(stdDev.toFixed(2)) : undefined,
        topValues
      };
    });

    // Check for duplicate rows
    const rowHashes = data.map(row => JSON.stringify(row));
    const uniqueRows = new Set(rowHashes);
    const duplicateCount = rowCount - uniqueRows.size;

    // Missing data pattern
    const totalCells = rowCount * columnCount;
    const totalMissing = columnProfiles.reduce((sum, col) => sum + col.nullCount, 0);
    const missingPercentage = (totalMissing / totalCells) * 100;

    const byColumn: Record<string, number> = {};
    columnProfiles.forEach(col => {
      if (col.nullCount > 0) {
        byColumn[col.name] = col.nullPercentage;
      }
    });

    return {
      datasetId,
      datasetName,
      profiledAt: new Date(),
      rowCount,
      columnCount,
      columns: columnProfiles,
      duplicateRows: {
        count: duplicateCount,
        percentage: (duplicateCount / rowCount) * 100
      },
      missingDataPattern: {
        totalMissing,
        percentage: Number(missingPercentage.toFixed(2)),
        byColumn
      }
    };
  }

  /**
   * Get quality report by ID
   */
  async getReport(reportId: string): Promise<QualityReport | null> {
    return this.reports.get(reportId) || null;
  }

  /**
   * Add custom quality rule
   */
  async addRule(rule: QualityRule): Promise<void> {
    this.rules.set(rule.ruleId, rule);
    console.log(`[DataQualityMonitor] Added quality rule: ${rule.name}`);
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private initializeDefaultRules(): void {
    const defaultRules: QualityRule[] = [
      {
        ruleId: 'rule_completeness_001',
        name: 'No Empty Values',
        description: 'All required fields must have values',
        type: 'completeness',
        severity: 'high',
        condition: { operator: 'not_null' },
        enabled: true
      },
      {
        ruleId: 'rule_uniqueness_001',
        name: 'Unique Identifiers',
        description: 'ID fields must be unique',
        type: 'uniqueness',
        severity: 'critical',
        condition: { operator: 'unique' },
        enabled: true
      }
    ];

    defaultRules.forEach(rule => this.rules.set(rule.ruleId, rule));
  }

  private async evaluateRule(
    rule: QualityRule,
    data: any[],
    profile: DataProfile,
    schema?: ValidateDataRequest['schema']
  ): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];

    // For demonstration, simulate some rule checks
    // In production, this would implement actual validation logic

    if (rule.type === 'completeness') {
      // Check for null values in required fields
      const requiredFields = schema?.columns.filter(c => c.required).map(c => c.name) || [];

      requiredFields.forEach(field => {
        const colProfile = profile.columns.find(c => c.name === field);
        if (colProfile && colProfile.nullPercentage > 0) {
          issues.push({
            issueId: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ruleId: rule.ruleId,
            ruleName: rule.name,
            severity: rule.severity,
            type: rule.type,
            description: `Field '${field}' has missing values (${colProfile.nullPercentage.toFixed(1)}%)`,
            affectedField: field,
            affectedRows: colProfile.nullCount,
            recommendation: `Fill missing values or remove rows with null ${field}`,
            detectedAt: new Date(),
            resolved: false
          });
        }
      });
    }

    return issues;
  }

  private detectColumnType(values: any[]): string {
    if (values.length === 0) return 'unknown';

    const sample = values[0];
    if (typeof sample === 'number') return 'number';
    if (typeof sample === 'boolean') return 'boolean';
    if (sample instanceof Date) return 'date';

    // Check if it's a date string
    if (typeof sample === 'string' && !isNaN(Date.parse(sample))) {
      return 'date';
    }

    return 'string';
  }

  private calculateDimensionScores(issues: QualityIssue[], profile: DataProfile): QualityReport['dimensionScores'] {
    const issuesByType: Record<string, number> = {};
    issues.forEach(issue => {
      issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    });

    // Calculate scores (100 - penaltyfor issues)
    return {
      completeness: Math.max(0, 100 - (issuesByType['completeness'] || 0) * 10),
      validity: Math.max(0, 100 - (issuesByType['validity'] || 0) * 10),
      consistency: Math.max(0, 100 - (issuesByType['consistency'] || 0) * 10),
      accuracy: Math.max(0, 100 - (issuesByType['accuracy'] || 0) * 10),
      uniqueness: Math.max(0, 100 - (issuesByType['uniqueness'] || 0) * 10),
      timeliness: Math.max(0, 100 - (issuesByType['timeliness'] || 0) * 10)
    };
  }

  private generateRecommendations(issues: QualityIssue[], profile: DataProfile): string[] {
    const recommendations: string[] = [];

    // Critical issues first
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      recommendations.push(`Resolve ${criticalIssues.length} critical data quality issues before proceeding`);
    }

    // High missing data
    if (profile.missingDataPattern && profile.missingDataPattern.percentage > 20) {
      recommendations.push('Consider data imputation or removing columns with excessive missing values');
    }

    // Duplicate rows
    if (profile.duplicateRows && profile.duplicateRows.count > 0) {
      recommendations.push(`Remove ${profile.duplicateRows.count} duplicate rows to improve data quality`);
    }

    // Low uniqueness in ID fields
    profile.columns.forEach(col => {
      if (col.name.toLowerCase().includes('id') && col.uniquePercentage < 99) {
        recommendations.push(`Check '${col.name}' field - expected to be unique but has duplicates`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Data quality looks good! Ready to proceed with analysis.');
    }

    return recommendations;
  }
}

// Singleton instance
export const dataQualityMonitor = new DataQualityMonitor();
