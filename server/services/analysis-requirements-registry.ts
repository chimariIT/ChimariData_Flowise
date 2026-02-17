/**
 * Analysis Data Requirements Registry
 *
 * Defines standardized data preparation requirements for each analysis type.
 * Used by:
 * - Data Scientist Agent: to specify what data preparation is needed
 * - Data Engineer Agent: to validate and prepare data appropriately
 * - Analysis Execution: to verify data meets requirements before running
 *
 * This creates the critical link: User Questions → Analysis Types → Data Requirements → Transformations
 */

export type AnalysisTypeKey =
  | 'descriptive_statistics'
  | 'comparative_analysis'
  | 'correlation_analysis'
  | 'regression_analysis'
  | 'clustering_analysis'
  | 'classification_analysis'
  | 'time_series_analysis'
  | 'text_analysis'
  | 'segmentation_analysis'
  | 'trend_analysis'
  | 'group_analysis'
  | 'statistical_aggregation';

export interface DataPreparationSpec {
  /** Analysis type identifier */
  analysisType: AnalysisTypeKey;

  /** Human-readable name */
  displayName: string;

  /** Description of what this analysis does */
  description: string;

  /** Column type requirements */
  columnRequirements: {
    /** Required column types (numeric, categorical, datetime, text) */
    requiredTypes: ('numeric' | 'categorical' | 'datetime' | 'text')[];
    /** Minimum number of columns of each type */
    minNumericColumns?: number;
    minCategoricalColumns?: number;
    minDatetimeColumns?: number;
    /** Whether a target/dependent variable is needed */
    needsTargetVariable?: boolean;
    /** Whether feature columns are needed */
    needsFeatureColumns?: boolean;
  };

  /** Data quality thresholds */
  qualityRequirements: {
    /** Maximum allowed null percentage (0-1) */
    maxNullPercent: number;
    /** Minimum required rows */
    minRows: number;
    /** Whether duplicates must be handled */
    handleDuplicates: boolean;
    /** Minimum data quality score (0-100) */
    minQualityScore?: number;
  };

  /** Required transformations */
  transformationRequirements: {
    /** Whether outliers must be handled */
    needsOutlierHandling: boolean;
    /** Whether data should be normalized/standardized */
    needsNormalization: boolean;
    /** Whether categorical columns need encoding */
    needsCategoricalEncoding: boolean;
    /** Whether temporal sorting is required */
    needsTemporalSorting: boolean;
    /** Whether missing values need interpolation */
    needsInterpolation: boolean;
    /** Whether text needs to be processed */
    needsTextProcessing: boolean;
    /** Whether grouping/aggregation is needed */
    needsGrouping: boolean;
  };

  /** Validation checks to run before execution */
  validationChecks: string[];

  /** Python script that handles this analysis */
  pythonScript?: string;

  /** Expected artifacts from this analysis */
  expectedArtifacts: string[];
}

/**
 * Registry of analysis types and their data preparation requirements
 */
export const AnalysisDataRequirements: Record<AnalysisTypeKey, DataPreparationSpec> = {
  descriptive_statistics: {
    analysisType: 'descriptive_statistics',
    displayName: 'Descriptive Statistics',
    description: 'Calculate mean, median, mode, standard deviation, and distribution summaries',
    columnRequirements: {
      requiredTypes: ['numeric'],
      minNumericColumns: 1,
    },
    qualityRequirements: {
      maxNullPercent: 0.20, // More tolerant - can calculate with some nulls
      minRows: 10,
      handleDuplicates: false,
    },
    transformationRequirements: {
      needsOutlierHandling: false, // Report outliers, don't remove
      needsNormalization: false,
      needsCategoricalEncoding: false,
      needsTemporalSorting: false,
      needsInterpolation: false,
      needsTextProcessing: false,
      needsGrouping: false,
    },
    validationChecks: [
      'has_numeric_columns',
      'minimum_row_count',
    ],
    pythonScript: 'descriptive_stats.py',
    expectedArtifacts: ['summary_statistics', 'distribution_charts', 'outlier_report'],
  },

  comparative_analysis: {
    analysisType: 'comparative_analysis',
    displayName: 'Comparative Analysis',
    description: 'Compare metrics across different groups, categories, or time periods',
    columnRequirements: {
      requiredTypes: ['numeric', 'categorical'],
      minNumericColumns: 1,
      minCategoricalColumns: 1,
    },
    qualityRequirements: {
      maxNullPercent: 0.10,
      minRows: 20,
      handleDuplicates: false,
    },
    transformationRequirements: {
      needsOutlierHandling: true,
      needsNormalization: false,
      needsCategoricalEncoding: false, // Keep categories for grouping
      needsTemporalSorting: false,
      needsInterpolation: false,
      needsTextProcessing: false,
      needsGrouping: true, // Group by category for comparison
    },
    validationChecks: [
      'has_numeric_columns',
      'has_categorical_columns',
      'minimum_row_count',
      'groups_have_sufficient_samples',
    ],
    pythonScript: 'comparative_analysis.py',
    expectedArtifacts: ['comparison_table', 'statistical_tests', 'comparison_charts'],
  },

  correlation_analysis: {
    analysisType: 'correlation_analysis',
    displayName: 'Correlation Analysis',
    description: 'Identify relationships between numeric variables using correlation coefficients',
    columnRequirements: {
      requiredTypes: ['numeric'],
      minNumericColumns: 2, // Need at least 2 columns to correlate
    },
    qualityRequirements: {
      maxNullPercent: 0.05, // Strict - correlations need complete data
      minRows: 30, // Statistical significance
      handleDuplicates: true,
    },
    transformationRequirements: {
      needsOutlierHandling: true, // Outliers distort correlation
      needsNormalization: false, // Correlation doesn't require normalization
      needsCategoricalEncoding: false, // Only numeric used
      needsTemporalSorting: false,
      needsInterpolation: false,
      needsTextProcessing: false,
      needsGrouping: false,
    },
    validationChecks: [
      'has_numeric_columns',
      'minimum_numeric_columns',
      'minimum_row_count',
      'outliers_handled',
      'null_threshold_met',
    ],
    pythonScript: 'correlation_analysis.py',
    expectedArtifacts: ['correlation_matrix', 'correlation_heatmap', 'significant_correlations'],
  },

  regression_analysis: {
    analysisType: 'regression_analysis',
    displayName: 'Regression Analysis',
    description: 'Build predictive models to understand relationships between variables',
    columnRequirements: {
      requiredTypes: ['numeric', 'categorical'],
      minNumericColumns: 2,
      needsTargetVariable: true,
      needsFeatureColumns: true,
    },
    qualityRequirements: {
      maxNullPercent: 0.01, // Very strict - ML models need clean data
      minRows: 50, // Enough for train/test split
      handleDuplicates: true,
      minQualityScore: 80,
    },
    transformationRequirements: {
      needsOutlierHandling: true,
      needsNormalization: true, // Features should be on same scale
      needsCategoricalEncoding: true, // Categorical → numeric
      needsTemporalSorting: false,
      needsInterpolation: true, // Fill missing values
      needsTextProcessing: false,
      needsGrouping: false,
    },
    validationChecks: [
      'has_target_variable',
      'has_feature_columns',
      'minimum_row_count',
      'no_high_cardinality_categorical',
      'features_normalized',
      'categorical_encoded',
      'null_threshold_met',
    ],
    pythonScript: 'regression_analysis.py',
    expectedArtifacts: ['model_coefficients', 'feature_importance', 'predictions', 'residual_plots'],
  },

  clustering_analysis: {
    analysisType: 'clustering_analysis',
    displayName: 'Clustering Analysis',
    description: 'Group similar data points together to identify natural segments',
    columnRequirements: {
      requiredTypes: ['numeric'],
      minNumericColumns: 2, // Need multiple dimensions
    },
    qualityRequirements: {
      maxNullPercent: 0, // ML clustering cannot handle nulls
      minRows: 100, // Enough for meaningful clusters
      handleDuplicates: true,
      minQualityScore: 85,
    },
    transformationRequirements: {
      needsOutlierHandling: true, // Outliers distort clusters
      needsNormalization: true, // Critical - features must be on same scale
      needsCategoricalEncoding: true, // All must be numeric
      needsTemporalSorting: false,
      needsInterpolation: true, // No nulls allowed
      needsTextProcessing: false,
      needsGrouping: false,
    },
    validationChecks: [
      'all_numeric_or_encoded',
      'no_null_values',
      'features_normalized',
      'minimum_row_count',
      'outliers_handled',
    ],
    pythonScript: 'clustering_analysis.py',
    expectedArtifacts: ['cluster_assignments', 'cluster_centers', 'cluster_profiles', 'elbow_plot'],
  },

  classification_analysis: {
    analysisType: 'classification_analysis',
    displayName: 'Classification Analysis',
    description: 'Predict categorical outcomes using machine learning models',
    columnRequirements: {
      requiredTypes: ['numeric', 'categorical'],
      minNumericColumns: 1,
      minCategoricalColumns: 1,
      needsTargetVariable: true,
      needsFeatureColumns: true,
    },
    qualityRequirements: {
      maxNullPercent: 0.01,
      minRows: 100, // Need enough samples per class
      handleDuplicates: true,
      minQualityScore: 80,
    },
    transformationRequirements: {
      needsOutlierHandling: true,
      needsNormalization: true,
      needsCategoricalEncoding: true,
      needsTemporalSorting: false,
      needsInterpolation: true,
      needsTextProcessing: false,
      needsGrouping: false,
    },
    validationChecks: [
      'has_target_variable',
      'target_is_categorical',
      'balanced_classes',
      'has_feature_columns',
      'minimum_samples_per_class',
      'categorical_encoded',
    ],
    pythonScript: 'classification_analysis.py',
    expectedArtifacts: ['confusion_matrix', 'classification_report', 'feature_importance', 'roc_curve'],
  },

  time_series_analysis: {
    analysisType: 'time_series_analysis',
    displayName: 'Time Series Analysis',
    description: 'Analyze trends, seasonality, and forecast future values',
    columnRequirements: {
      requiredTypes: ['datetime', 'numeric'],
      minNumericColumns: 1,
      minDatetimeColumns: 1,
    },
    qualityRequirements: {
      maxNullPercent: 0.02, // Need continuous series
      minRows: 24, // At least 2 cycles for seasonality
      handleDuplicates: true,
    },
    transformationRequirements: {
      needsOutlierHandling: true,
      needsNormalization: false,
      needsCategoricalEncoding: false,
      needsTemporalSorting: true, // Critical - must be sorted by time
      needsInterpolation: true, // Fill gaps in time series
      needsTextProcessing: false,
      needsGrouping: false,
    },
    validationChecks: [
      'has_datetime_column',
      'has_numeric_column',
      'data_sorted_by_time',
      'no_large_time_gaps',
      'minimum_time_periods',
    ],
    pythonScript: 'time_series_analysis.py',
    expectedArtifacts: ['trend_decomposition', 'seasonality_charts', 'forecast', 'acf_plot'],
  },

  text_analysis: {
    analysisType: 'text_analysis',
    displayName: 'Text Analysis',
    description: 'Extract insights from text data using NLP techniques',
    columnRequirements: {
      requiredTypes: ['text'],
    },
    qualityRequirements: {
      maxNullPercent: 0.10,
      minRows: 50, // Need enough text samples
      handleDuplicates: false, // Duplicate text might be valid
    },
    transformationRequirements: {
      needsOutlierHandling: false,
      needsNormalization: false,
      needsCategoricalEncoding: false,
      needsTemporalSorting: false,
      needsInterpolation: false,
      needsTextProcessing: true, // Tokenization, cleaning, etc.
      needsGrouping: false,
    },
    validationChecks: [
      'has_text_column',
      'minimum_text_length',
      'minimum_row_count',
    ],
    pythonScript: 'text_analysis.py',
    expectedArtifacts: ['word_cloud', 'sentiment_scores', 'topic_model', 'key_phrases'],
  },

  segmentation_analysis: {
    analysisType: 'segmentation_analysis',
    displayName: 'Segmentation Analysis',
    description: 'Divide data into meaningful segments based on characteristics',
    columnRequirements: {
      requiredTypes: ['numeric', 'categorical'],
      minNumericColumns: 1,
      minCategoricalColumns: 1,
    },
    qualityRequirements: {
      maxNullPercent: 0.05,
      minRows: 100,
      handleDuplicates: true,
    },
    transformationRequirements: {
      needsOutlierHandling: true,
      needsNormalization: true,
      needsCategoricalEncoding: true,
      needsTemporalSorting: false,
      needsInterpolation: true,
      needsTextProcessing: false,
      needsGrouping: true,
    },
    validationChecks: [
      'has_numeric_columns',
      'has_categorical_columns',
      'minimum_row_count',
      'features_normalized',
    ],
    pythonScript: 'segmentation_analysis.py',
    expectedArtifacts: ['segment_profiles', 'segment_distribution', 'segment_comparison'],
  },

  trend_analysis: {
    analysisType: 'trend_analysis',
    displayName: 'Trend Analysis',
    description: 'Identify patterns and trends over time or across categories',
    columnRequirements: {
      requiredTypes: ['numeric'],
      minNumericColumns: 1,
    },
    qualityRequirements: {
      maxNullPercent: 0.10,
      minRows: 20,
      handleDuplicates: false,
    },
    transformationRequirements: {
      needsOutlierHandling: false, // Trends include outliers
      needsNormalization: false,
      needsCategoricalEncoding: false,
      needsTemporalSorting: true, // Usually time-based
      needsInterpolation: false,
      needsTextProcessing: false,
      needsGrouping: true, // Often grouped trends
    },
    validationChecks: [
      'has_numeric_columns',
      'minimum_row_count',
    ],
    pythonScript: 'trend_analysis.py',
    expectedArtifacts: ['trend_line', 'growth_rate', 'trend_chart'],
  },

  group_analysis: {
    analysisType: 'group_analysis',
    displayName: 'Group Analysis',
    description: 'Analyze differences between groups or categories',
    columnRequirements: {
      requiredTypes: ['numeric', 'categorical'],
      minNumericColumns: 1,
      minCategoricalColumns: 1,
    },
    qualityRequirements: {
      maxNullPercent: 0.10,
      minRows: 30, // Need samples per group
      handleDuplicates: false,
    },
    transformationRequirements: {
      needsOutlierHandling: true,
      needsNormalization: false,
      needsCategoricalEncoding: false, // Keep categories for grouping
      needsTemporalSorting: false,
      needsInterpolation: false,
      needsTextProcessing: false,
      needsGrouping: true,
    },
    validationChecks: [
      'has_numeric_columns',
      'has_categorical_columns',
      'minimum_row_count',
      'groups_have_sufficient_samples',
    ],
    pythonScript: 'group_analysis.py',
    expectedArtifacts: ['group_statistics', 'anova_results', 'group_comparison_charts'],
  },

  statistical_aggregation: {
    analysisType: 'statistical_aggregation',
    displayName: 'Statistical Aggregation',
    description: 'Aggregate data by categories to calculate summary statistics',
    columnRequirements: {
      requiredTypes: ['numeric', 'categorical'],
      minNumericColumns: 1,
    },
    qualityRequirements: {
      maxNullPercent: 0.15,
      minRows: 10,
      handleDuplicates: false,
    },
    transformationRequirements: {
      needsOutlierHandling: false,
      needsNormalization: false,
      needsCategoricalEncoding: false,
      needsTemporalSorting: false,
      needsInterpolation: false,
      needsTextProcessing: false,
      needsGrouping: true,
    },
    validationChecks: [
      'has_numeric_columns',
      'minimum_row_count',
    ],
    pythonScript: 'aggregation_analysis.py',
    expectedArtifacts: ['aggregation_table', 'summary_by_group'],
  },
};

/**
 * Get data preparation requirements for a specific analysis type
 */
export function getAnalysisRequirements(analysisType: string): DataPreparationSpec | null {
  // Normalize the analysis type name
  const normalized = analysisType
    .toLowerCase()
    .replace(/[- ]/g, '_')
    .replace(/analysis$/, '_analysis')
    .replace(/__+/g, '_');

  // Try direct match first
  if (normalized in AnalysisDataRequirements) {
    return AnalysisDataRequirements[normalized as AnalysisTypeKey];
  }

  // Try partial matching
  for (const [key, spec] of Object.entries(AnalysisDataRequirements)) {
    if (normalized.includes(key.replace('_analysis', '')) ||
        key.includes(normalized.replace('_analysis', ''))) {
      return spec;
    }
  }

  console.warn(`[AnalysisRegistry] Unknown analysis type: ${analysisType}, returning descriptive_statistics as fallback`);
  return AnalysisDataRequirements.descriptive_statistics;
}

/**
 * Get requirements for multiple analysis types
 */
export function getAnalysisRequirementsForTypes(analysisTypes: string[]): DataPreparationSpec[] {
  return analysisTypes
    .map(type => getAnalysisRequirements(type))
    .filter((spec): spec is DataPreparationSpec => spec !== null);
}

/**
 * Merge requirements from multiple analysis types into combined requirements
 */
export function getMergedRequirements(analysisTypes: string[]): {
  requiredColumnTypes: Set<string>;
  maxNullPercent: number;
  minRows: number;
  transformations: {
    needsOutlierHandling: boolean;
    needsNormalization: boolean;
    needsCategoricalEncoding: boolean;
    needsTemporalSorting: boolean;
    needsInterpolation: boolean;
    needsTextProcessing: boolean;
    needsGrouping: boolean;
  };
  validationChecks: Set<string>;
} {
  const specs = getAnalysisRequirementsForTypes(analysisTypes);

  const requiredColumnTypes = new Set<string>();
  let maxNullPercent = 1.0; // Start permissive
  let minRows = 0;
  const transformations = {
    needsOutlierHandling: false,
    needsNormalization: false,
    needsCategoricalEncoding: false,
    needsTemporalSorting: false,
    needsInterpolation: false,
    needsTextProcessing: false,
    needsGrouping: false,
  };
  const validationChecks = new Set<string>();

  for (const spec of specs) {
    // Column types - union of all required types
    spec.columnRequirements.requiredTypes.forEach(t => requiredColumnTypes.add(t));

    // Quality - use strictest (lowest) null threshold and highest min rows
    maxNullPercent = Math.min(maxNullPercent, spec.qualityRequirements.maxNullPercent);
    minRows = Math.max(minRows, spec.qualityRequirements.minRows);

    // Transformations - OR (if any analysis needs it)
    transformations.needsOutlierHandling = transformations.needsOutlierHandling || spec.transformationRequirements.needsOutlierHandling;
    transformations.needsNormalization = transformations.needsNormalization || spec.transformationRequirements.needsNormalization;
    transformations.needsCategoricalEncoding = transformations.needsCategoricalEncoding || spec.transformationRequirements.needsCategoricalEncoding;
    transformations.needsTemporalSorting = transformations.needsTemporalSorting || spec.transformationRequirements.needsTemporalSorting;
    transformations.needsInterpolation = transformations.needsInterpolation || spec.transformationRequirements.needsInterpolation;
    transformations.needsTextProcessing = transformations.needsTextProcessing || spec.transformationRequirements.needsTextProcessing;
    transformations.needsGrouping = transformations.needsGrouping || spec.transformationRequirements.needsGrouping;

    // Validation checks - union
    spec.validationChecks.forEach(check => validationChecks.add(check));
  }

  return {
    requiredColumnTypes,
    maxNullPercent,
    minRows,
    transformations,
    validationChecks,
  };
}

/**
 * Validate that data meets requirements for an analysis type
 */
export interface DataValidationResult {
  isValid: boolean;
  analysisType: string;
  passedChecks: string[];
  failedChecks: { check: string; reason: string }[];
  warnings: string[];
  recommendedTransformations: string[];
}

export function validateDataForAnalysis(
  analysisType: string,
  dataStats: {
    rowCount: number;
    nullPercents: Record<string, number>;
    columnTypes: Record<string, 'numeric' | 'categorical' | 'datetime' | 'text'>;
    hasOutliers?: boolean;
    isNormalized?: boolean;
    isSortedByTime?: boolean;
  }
): DataValidationResult {
  const spec = getAnalysisRequirements(analysisType);
  if (!spec) {
    return {
      isValid: false,
      analysisType,
      passedChecks: [],
      failedChecks: [{ check: 'valid_analysis_type', reason: `Unknown analysis type: ${analysisType}` }],
      warnings: [],
      recommendedTransformations: [],
    };
  }

  const passedChecks: string[] = [];
  const failedChecks: { check: string; reason: string }[] = [];
  const warnings: string[] = [];
  const recommendedTransformations: string[] = [];

  // Check row count
  if (dataStats.rowCount >= spec.qualityRequirements.minRows) {
    passedChecks.push('minimum_row_count');
  } else {
    failedChecks.push({
      check: 'minimum_row_count',
      reason: `Need at least ${spec.qualityRequirements.minRows} rows, have ${dataStats.rowCount}`,
    });
  }

  // Check column types
  const existingTypes = new Set(Object.values(dataStats.columnTypes));
  for (const requiredType of spec.columnRequirements.requiredTypes) {
    if (existingTypes.has(requiredType)) {
      passedChecks.push(`has_${requiredType}_columns`);
    } else {
      failedChecks.push({
        check: `has_${requiredType}_columns`,
        reason: `Requires ${requiredType} columns but none found`,
      });
    }
  }

  // Check null percentages (handle empty nullPercents gracefully)
  const nullValues = Object.values(dataStats.nullPercents);
  const maxNull = nullValues.length > 0 ? Math.max(...nullValues) : 0;
  if (maxNull <= spec.qualityRequirements.maxNullPercent) {
    passedChecks.push('null_threshold_met');
  } else {
    failedChecks.push({
      check: 'null_threshold_met',
      reason: `Max null percentage is ${(maxNull * 100).toFixed(1)}%, required below ${(spec.qualityRequirements.maxNullPercent * 100).toFixed(1)}%`,
    });
    recommendedTransformations.push('handle_missing_values');
  }

  // Check transformations
  if (spec.transformationRequirements.needsOutlierHandling && dataStats.hasOutliers) {
    warnings.push('Data has outliers that should be handled');
    recommendedTransformations.push('handle_outliers');
  }

  if (spec.transformationRequirements.needsNormalization && !dataStats.isNormalized) {
    warnings.push('Data should be normalized for this analysis');
    recommendedTransformations.push('normalize_features');
  }

  if (spec.transformationRequirements.needsTemporalSorting && !dataStats.isSortedByTime) {
    failedChecks.push({
      check: 'data_sorted_by_time',
      reason: 'Time series analysis requires data to be sorted by time',
    });
    recommendedTransformations.push('sort_by_datetime');
  }

  if (spec.transformationRequirements.needsCategoricalEncoding) {
    const hasCategorical = Object.values(dataStats.columnTypes).includes('categorical');
    if (hasCategorical) {
      recommendedTransformations.push('encode_categorical_columns');
    }
  }

  return {
    isValid: failedChecks.length === 0,
    analysisType,
    passedChecks,
    failedChecks,
    warnings,
    recommendedTransformations,
  };
}

/**
 * Generate transformation recommendations for preparing data for analyses
 */
export function generateTransformationRecommendations(
  analysisTypes: string[],
  dataStats: {
    rowCount: number;
    nullPercents: Record<string, number>;
    columnTypes: Record<string, 'numeric' | 'categorical' | 'datetime' | 'text'>;
    hasOutliers?: boolean;
  }
): {
  analysisType: string;
  displayName: string;
  transformations: {
    name: string;
    reason: string;
    priority: 'required' | 'recommended' | 'optional';
  }[];
}[] {
  const results: {
    analysisType: string;
    displayName: string;
    transformations: {
      name: string;
      reason: string;
      priority: 'required' | 'recommended' | 'optional';
    }[];
  }[] = [];

  for (const analysisType of analysisTypes) {
    const spec = getAnalysisRequirements(analysisType);
    if (!spec) continue;

    const transformations: { name: string; reason: string; priority: 'required' | 'recommended' | 'optional' }[] = [];

    // Check null handling
    const maxNull = Math.max(...Object.values(dataStats.nullPercents), 0);
    if (maxNull > spec.qualityRequirements.maxNullPercent) {
      transformations.push({
        name: 'handle_missing_values',
        reason: `${spec.displayName} requires <${(spec.qualityRequirements.maxNullPercent * 100).toFixed(0)}% nulls, current max is ${(maxNull * 100).toFixed(1)}%`,
        priority: 'required',
      });
    }

    // Check outliers
    if (spec.transformationRequirements.needsOutlierHandling && dataStats.hasOutliers) {
      transformations.push({
        name: 'handle_outliers',
        reason: `${spec.displayName} is sensitive to outliers which distort results`,
        priority: 'required',
      });
    }

    // Check normalization
    if (spec.transformationRequirements.needsNormalization) {
      transformations.push({
        name: 'normalize_features',
        reason: `${spec.displayName} requires normalized features for accurate results`,
        priority: 'required',
      });
    }

    // Check categorical encoding
    const hasCategorical = Object.values(dataStats.columnTypes).includes('categorical');
    if (spec.transformationRequirements.needsCategoricalEncoding && hasCategorical) {
      transformations.push({
        name: 'encode_categorical',
        reason: `${spec.displayName} requires numeric-only data; categorical columns need encoding`,
        priority: 'required',
      });
    }

    // Check temporal sorting
    const hasDatetime = Object.values(dataStats.columnTypes).includes('datetime');
    if (spec.transformationRequirements.needsTemporalSorting && hasDatetime) {
      transformations.push({
        name: 'sort_by_datetime',
        reason: `${spec.displayName} requires data sorted chronologically`,
        priority: 'required',
      });
    }

    // Check interpolation
    if (spec.transformationRequirements.needsInterpolation && maxNull > 0) {
      transformations.push({
        name: 'interpolate_missing',
        reason: `${spec.displayName} works best with interpolated rather than dropped missing values`,
        priority: 'recommended',
      });
    }

    // Check row count
    if (dataStats.rowCount < spec.qualityRequirements.minRows) {
      transformations.push({
        name: 'increase_sample_size',
        reason: `${spec.displayName} requires at least ${spec.qualityRequirements.minRows} rows for reliable results`,
        priority: 'required',
      });
    }

    results.push({
      analysisType: spec.analysisType,
      displayName: spec.displayName,
      transformations,
    });
  }

  return results;
}

// Phase-relevance mapping: which orchestrator phases are relevant per analysis type
const PHASE_MAP: Record<string, string[]> = {
  descriptive: ['quality', 'eda', 'statistical'],
  descriptive_statistics: ['quality', 'eda', 'statistical'],
  statistical_aggregation: ['quality', 'eda', 'statistical'],
  correlation: ['quality', 'eda', 'statistical'],
  correlation_analysis: ['quality', 'eda', 'statistical'],
  comparative: ['quality', 'eda', 'statistical'],
  comparative_analysis: ['quality', 'eda', 'statistical'],
  group_analysis: ['quality', 'eda', 'statistical'],
  regression: ['quality', 'ml'],
  regression_analysis: ['quality', 'ml'],
  classification: ['quality', 'ml'],
  classification_analysis: ['quality', 'ml'],
  predictive: ['quality', 'ml'],
  predictive_modeling: ['quality', 'ml'],
  clustering: ['quality', 'ml'],
  clustering_analysis: ['quality', 'ml'],
  segmentation: ['quality', 'ml'],
  segmentation_analysis: ['quality', 'ml'],
  time_series: ['quality', 'ml'],
  time_series_analysis: ['quality', 'ml'],
  trend: ['quality', 'eda', 'ml'],
  trend_analysis: ['quality', 'eda', 'ml'],
  text_analysis: ['quality', 'ml'],
  text: ['quality', 'ml'],
};

/**
 * Get which orchestrator phases are relevant for a given analysis type.
 * Used to skip irrelevant phases (e.g., no correlation for text analysis).
 */
export function getRelevantPhases(analysisType: string): string[] {
  const normalized = analysisType.toLowerCase().replace(/[-\s]/g, '_');
  return PHASE_MAP[normalized] || ['quality', 'eda', 'statistical', 'ml'];
}

// Export singleton for convenient access
export const analysisRegistry = {
  getRequirements: getAnalysisRequirements,
  getRequirementsForTypes: getAnalysisRequirementsForTypes,
  getMergedRequirements,
  validateDataForAnalysis,
  generateTransformationRecommendations,
  getRelevantPhases,
  allAnalysisTypes: Object.keys(AnalysisDataRequirements) as AnalysisTypeKey[],
};

export default analysisRegistry;
