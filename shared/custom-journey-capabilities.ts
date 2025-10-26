/**
 * Custom Journey Capabilities Catalog - UPDATED FOR UNIFIED BILLING
 *
 * All capabilities now integrate with unified-billing-service.ts
 * NO separate pricing - follows subscription quota model
 */

import { z } from 'zod';

// Capability categories
export const CapabilityCategoryEnum = z.enum([
  'data_preparation',
  'statistical_analysis',
  'machine_learning',
  'llm_fine_tuning',
  'visualization',
  'business_intelligence',
  'big_data'
]);

export type CapabilityCategory = z.infer<typeof CapabilityCategoryEnum>;

// Individual capability definition
export const CapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: CapabilityCategoryEnum,
  icon: z.string(),

  // Requirements
  requiredCapabilities: z.array(z.string()).optional(), // Dependencies
  minSubscriptionTier: z.enum(['trial', 'starter', 'professional', 'enterprise']).optional(),

  // Technical details
  toolNames: z.array(z.string()), // Associated MCP tools (used by unified billing)
  featureIds: z.array(z.string()).optional(), // Feature IDs for billing service
  estimatedDuration: z.string(), // e.g., "5-10 minutes"

  // Complexity level for billing (used by unified-billing-service)
  complexity: z.enum(['basic', 'intermediate', 'advanced']).default('intermediate'),

  // User-friendly info
  useCases: z.array(z.string()),
  exampleOutput: z.string(),
  technicalLevel: z.enum(['beginner', 'intermediate', 'advanced']),
});

export type Capability = z.infer<typeof CapabilitySchema>;

// Custom journey configuration
export const CustomJourneyConfigSchema = z.object({
  selectedCapabilities: z.array(z.string()), // Array of capability IDs
  datasetSizeMB: z.number().optional(),
  recordCount: z.number().optional(),
  estimatedDuration: z.number().optional(), // minutes (calculated)

  // Billing will be handled by unified-billing-service based on actual tool usage
  // No upfront cost calculation - follows subscription quota model
});

export type CustomJourneyConfig = z.infer<typeof CustomJourneyConfigSchema>;

// ==========================================
// CAPABILITY CATALOG
// ==========================================

export const CAPABILITIES: Capability[] = [
  // ========================================
  // DATA PREPARATION
  // ========================================
  {
    id: 'data_upload',
    name: 'Data Upload & Validation',
    description: 'Upload CSV, Excel, or JSON files with automatic schema detection and validation',
    category: 'data_preparation',
    icon: 'Upload',
    toolNames: ['file_processor'],
    featureIds: ['data_upload'],
    complexity: 'basic',
    estimatedDuration: '1-2 minutes',
    useCases: [
      'Import data from spreadsheets',
      'Validate data quality',
      'Detect column types automatically'
    ],
    exampleOutput: 'Dataset with 10,000 rows, 15 columns successfully uploaded',
    technicalLevel: 'beginner'
  },
  {
    id: 'data_cleaning',
    name: 'Data Cleaning & Transformation',
    description: 'Handle missing values, remove duplicates, normalize data, and engineer features',
    category: 'data_preparation',
    icon: 'Sparkles',
    toolNames: ['data_transformer', 'spark_data_processor'],
    featureIds: ['data_transformation'],
    complexity: 'intermediate',
    estimatedDuration: '3-5 minutes',
    requiredCapabilities: ['data_upload'],
    useCases: [
      'Fill missing values with mean/median/mode',
      'Remove duplicate rows',
      'Normalize numerical columns',
      'Create derived features'
    ],
    exampleOutput: 'Cleaned dataset: 98% data quality score, 5 missing values filled, 23 duplicates removed',
    technicalLevel: 'beginner'
  },
  {
    id: 'data_joining',
    name: 'Multi-Dataset Joining',
    description: 'Merge multiple datasets based on common keys with intelligent join suggestions',
    category: 'data_preparation',
    icon: 'GitMerge',
    toolNames: ['data_transformer'],
    featureIds: ['data_transformation'],
    complexity: 'intermediate',
    estimatedDuration: '2-4 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'starter',
    useCases: [
      'Combine customer and transaction data',
      'Merge demographic and behavioral data',
      'Link product and sales information'
    ],
    exampleOutput: '2 datasets joined: customers.csv (10K rows) + orders.csv (50K rows) = 48K matched records',
    technicalLevel: 'intermediate'
  },

  // ========================================
  // STATISTICAL ANALYSIS
  // ========================================
  {
    id: 'descriptive_statistics',
    name: 'Descriptive Statistics',
    description: 'Calculate mean, median, mode, standard deviation, and distribution analysis',
    category: 'statistical_analysis',
    icon: 'BarChart3',
    toolNames: ['statistical_analyzer', 'pandas_analyzer'],
    featureIds: ['statistical_analysis'],
    complexity: 'basic',
    estimatedDuration: '2-3 minutes',
    requiredCapabilities: ['data_upload'],
    useCases: [
      'Summarize customer demographics',
      'Analyze sales distribution',
      'Understand data spread and outliers'
    ],
    exampleOutput: 'Mean: $45.23, Median: $39.99, Std Dev: $12.45, 5% outliers detected',
    technicalLevel: 'beginner'
  },
  {
    id: 'hypothesis_testing',
    name: 'Hypothesis Testing (ANOVA, T-Test)',
    description: 'Test statistical hypotheses with ANOVA, ANCOVA, MANOVA, t-tests, and chi-square',
    category: 'statistical_analysis',
    icon: 'TestTube',
    toolNames: ['statistical_analyzer', 'statsmodels_analyzer'],
    featureIds: ['statistical_analysis', 'hypothesis_testing'],
    complexity: 'advanced',
    estimatedDuration: '5-8 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'professional',
    useCases: [
      'Compare conversion rates across groups',
      'Test marketing campaign effectiveness',
      'Analyze A/B test results'
    ],
    exampleOutput: 'ANOVA: F-statistic=15.32, p-value=0.0001 (statistically significant difference)',
    technicalLevel: 'intermediate'
  },
  {
    id: 'regression_analysis',
    name: 'Regression Analysis',
    description: 'Linear, logistic, and polynomial regression to predict outcomes and identify relationships',
    category: 'statistical_analysis',
    icon: 'TrendingUp',
    toolNames: ['statistical_analyzer', 'statsmodels_analyzer'],
    featureIds: ['statistical_analysis', 'regression'],
    complexity: 'advanced',
    estimatedDuration: '6-10 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'professional',
    useCases: [
      'Predict sales based on marketing spend',
      'Identify factors affecting customer churn',
      'Forecast revenue trends'
    ],
    exampleOutput: 'R²=0.85, Coefficients: marketing_spend (+0.45), seasonality (+0.23)',
    technicalLevel: 'advanced'
  },
  {
    id: 'correlation_analysis',
    name: 'Correlation & Causation Analysis',
    description: 'Discover relationships between variables with correlation matrices and causal inference',
    category: 'statistical_analysis',
    icon: 'Network',
    toolNames: ['statistical_analyzer', 'scipy_analyzer'],
    featureIds: ['statistical_analysis'],
    complexity: 'intermediate',
    estimatedDuration: '3-5 minutes',
    requiredCapabilities: ['data_upload'],
    useCases: [
      'Find correlated customer behaviors',
      'Identify leading indicators',
      'Understand variable dependencies'
    ],
    exampleOutput: 'Strong correlations found: purchase_frequency ↔ customer_satisfaction (r=0.78)',
    technicalLevel: 'intermediate'
  },

  // ========================================
  // MACHINE LEARNING
  // ========================================
  {
    id: 'classification',
    name: 'Classification Models',
    description: 'Predict categories with Random Forest, XGBoost, SVM, and Neural Networks',
    category: 'machine_learning',
    icon: 'Brain',
    toolNames: ['comprehensive_ml_pipeline', 'automl_optimizer'],
    featureIds: ['ml_training', 'ml_classification'],
    complexity: 'advanced',
    estimatedDuration: '10-15 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'professional',
    useCases: [
      'Predict customer churn (yes/no)',
      'Classify email spam',
      'Identify fraud transactions'
    ],
    exampleOutput: 'Model: XGBoost, Accuracy: 92.5%, Precision: 89%, Recall: 94%',
    technicalLevel: 'advanced'
  },
  {
    id: 'regression_ml',
    name: 'Regression Models (ML)',
    description: 'Predict continuous values using advanced ML algorithms',
    category: 'machine_learning',
    icon: 'LineChart',
    toolNames: ['comprehensive_ml_pipeline'],
    featureIds: ['ml_training', 'ml_regression'],
    complexity: 'advanced',
    estimatedDuration: '10-15 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'professional',
    useCases: [
      'Predict house prices',
      'Forecast sales revenue',
      'Estimate customer lifetime value'
    ],
    exampleOutput: 'Model: Gradient Boosting, RMSE: $1,234, MAE: $987, R²: 0.88',
    technicalLevel: 'advanced'
  },
  {
    id: 'clustering',
    name: 'Clustering & Segmentation',
    description: 'Discover natural groupings with K-Means, DBSCAN, and Hierarchical Clustering',
    category: 'machine_learning',
    icon: 'Users',
    toolNames: ['comprehensive_ml_pipeline'],
    featureIds: ['ml_training', 'ml_clustering'],
    complexity: 'intermediate',
    estimatedDuration: '8-12 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'starter',
    useCases: [
      'Segment customers by behavior',
      'Group products by attributes',
      'Identify market segments'
    ],
    exampleOutput: '4 clusters identified: High-value (15%), Medium (45%), Low (30%), Inactive (10%)',
    technicalLevel: 'intermediate'
  },
  {
    id: 'automl',
    name: 'AutoML Optimization',
    description: 'Automatically find the best model and hyperparameters using Bayesian optimization',
    category: 'machine_learning',
    icon: 'Zap',
    toolNames: ['automl_optimizer'],
    featureIds: ['ml_training', 'automl'],
    complexity: 'advanced',
    estimatedDuration: '20-30 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'professional',
    useCases: [
      'Find optimal model without manual tuning',
      'Maximize prediction accuracy',
      'Save ML engineering time'
    ],
    exampleOutput: 'Best model: LightGBM (100 trials), Accuracy: 94.2%, Optimized hyperparameters found',
    technicalLevel: 'intermediate'
  },

  // ========================================
  // LLM FINE-TUNING
  // ========================================
  {
    id: 'llm_fine_tuning',
    name: 'LLM Fine-Tuning',
    description: 'Fine-tune large language models with LoRA, QLoRA, or full fine-tuning',
    category: 'llm_fine_tuning',
    icon: 'Cpu',
    toolNames: ['llm_fine_tuning', 'lora_fine_tuning'],
    featureIds: ['llm_training', 'llm_fine_tuning'],
    complexity: 'advanced',
    estimatedDuration: '30-60 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'enterprise',
    useCases: [
      'Customize GPT for your domain',
      'Train chatbots on company data',
      'Adapt LLMs to specific tasks'
    ],
    exampleOutput: 'Fine-tuned model: GPT-3.5 with LoRA, Perplexity: 2.34, Training loss: 0.45',
    technicalLevel: 'advanced'
  },

  // ========================================
  // VISUALIZATION
  // ========================================
  {
    id: 'basic_charts',
    name: 'Basic Charts',
    description: 'Create bar charts, line charts, pie charts, and scatter plots',
    category: 'visualization',
    icon: 'PieChart',
    toolNames: ['visualization_engine', 'matplotlib_generator'],
    featureIds: ['visualization'],
    complexity: 'basic',
    estimatedDuration: '2-3 minutes',
    requiredCapabilities: ['data_upload'],
    useCases: [
      'Visualize sales trends',
      'Show category distributions',
      'Plot correlations'
    ],
    exampleOutput: '5 charts generated: line (sales), bar (categories), scatter (correlation)',
    technicalLevel: 'beginner'
  },
  {
    id: 'advanced_visualizations',
    name: 'Advanced Visualizations',
    description: 'Interactive dashboards, 3D plots, heatmaps, and animated charts',
    category: 'visualization',
    icon: 'Layers',
    toolNames: ['enhanced_visualization_engine', 'plotly_generator', 'd3_generator'],
    featureIds: ['visualization', 'interactive_dashboards'],
    complexity: 'intermediate',
    estimatedDuration: '5-8 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'starter',
    useCases: [
      'Build interactive dashboards',
      'Create 3D scatter plots',
      'Generate correlation heatmaps'
    ],
    exampleOutput: 'Interactive dashboard with 8 charts, filters, and drill-down capabilities',
    technicalLevel: 'intermediate'
  },

  // ========================================
  // BUSINESS INTELLIGENCE
  // ========================================
  {
    id: 'business_metrics',
    name: 'Business Metrics Dashboard',
    description: 'KPIs, ROI analysis, growth metrics, and executive summaries',
    category: 'business_intelligence',
    icon: 'Briefcase',
    toolNames: ['business_templates'],
    featureIds: ['business_intelligence', 'kpi_dashboard'],
    complexity: 'intermediate',
    estimatedDuration: '6-10 minutes',
    requiredCapabilities: ['data_upload', 'descriptive_statistics'],
    minSubscriptionTier: 'starter',
    useCases: [
      'Track monthly revenue growth',
      'Calculate customer acquisition cost',
      'Monitor churn rate'
    ],
    exampleOutput: 'KPI Dashboard: Revenue +15% MoM, CAC $45, Churn 3.2%, LTV $1,234',
    technicalLevel: 'beginner'
  },

  // ========================================
  // BIG DATA
  // ========================================
  {
    id: 'spark_processing',
    name: 'Big Data Processing (Spark)',
    description: 'Process datasets >1GB using Apache Spark distributed computing',
    category: 'big_data',
    icon: 'Database',
    toolNames: ['spark_data_processor', 'spark_ml_pipeline', 'spark_statistical_analyzer'],
    featureIds: ['big_data_processing', 'spark'],
    complexity: 'advanced',
    estimatedDuration: '15-30 minutes',
    requiredCapabilities: ['data_upload'],
    minSubscriptionTier: 'professional',
    useCases: [
      'Process millions of records',
      'Distributed ML training',
      'Real-time data streaming'
    ],
    exampleOutput: 'Processed 5M records in 12 minutes using 4-node Spark cluster',
    technicalLevel: 'advanced'
  }
];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get capabilities by category
 */
export function getCapabilitiesByCategory(category: CapabilityCategory): Capability[] {
  return CAPABILITIES.filter(cap => cap.category === category);
}

/**
 * Get capability by ID
 */
export function getCapabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find(cap => cap.id === id);
}

/**
 * Get all categories with capability counts
 */
export function getCategorySummary() {
  const categories: Record<CapabilityCategory, number> = {
    data_preparation: 0,
    statistical_analysis: 0,
    machine_learning: 0,
    llm_fine_tuning: 0,
    visualization: 0,
    business_intelligence: 0,
    big_data: 0
  };

  CAPABILITIES.forEach(cap => {
    categories[cap.category] = (categories[cap.category] || 0) + 1;
  });

  return categories;
}

/**
 * Get tool executions for selected capabilities
 * Returns tool names and feature IDs for unified billing service to track
 */
export function getCustomJourneyToolExecutions(
  selectedCapabilityIds: string[]
): {
  capabilities: Array<{
    id: string;
    name: string;
    toolNames: string[];
    featureIds: string[];
    complexity: 'basic' | 'intermediate' | 'advanced';
  }>;
  estimatedDuration: number;
} {
  const capabilities = selectedCapabilityIds
    .map(id => getCapabilityById(id))
    .filter((cap): cap is Capability => cap !== undefined);

  const capabilityTools = capabilities.map(cap => ({
    id: cap.id,
    name: cap.name,
    toolNames: cap.toolNames,
    featureIds: cap.featureIds || [],
    complexity: cap.complexity
  }));

  // Estimate duration (sum of max durations)
  const totalMinutes = capabilities.reduce((sum, cap) => {
    const durationMatch = cap.estimatedDuration.match(/(\d+)-(\d+)/);
    if (durationMatch) {
      return sum + parseInt(durationMatch[2]); // Use max duration
    }
    return sum + 5; // Default 5 minutes
  }, 0);

  return {
    capabilities: capabilityTools,
    estimatedDuration: totalMinutes
  };
}

/**
 * Get usage summary for unified billing service
 * This is what gets passed to trackJourneyUsage()
 */
export function getCustomJourneyUsageSummary(
  selectedCapabilityIds: string[],
  datasetInfo: { recordCount: number; sizeGB: number }
): {
  journeyType: 'custom';
  capabilities: string[];
  toolExecutions: Array<{ toolName: string; complexity: string }>;
  featureIds: string[];
  dataVolume: number;
  recordCount: number;
} {
  const { capabilities } = getCustomJourneyToolExecutions(selectedCapabilityIds);

  // Flatten all tool names
  const toolExecutions = capabilities.flatMap(cap =>
    cap.toolNames.map(toolName => ({
      toolName,
      complexity: cap.complexity
    }))
  );

  // Flatten all feature IDs
  const featureIds = [...new Set(capabilities.flatMap(cap => cap.featureIds))];

  return {
    journeyType: 'custom',
    capabilities: selectedCapabilityIds,
    toolExecutions,
    featureIds,
    dataVolume: datasetInfo.sizeGB,
    recordCount: datasetInfo.recordCount
  };
}

/**
 * Validate capability dependencies
 */
export function validateCapabilityDependencies(selectedIds: string[]): {
  valid: boolean;
  missingDependencies: Array<{ capabilityId: string; requiredCapability: string }>;
} {
  const missingDependencies: Array<{ capabilityId: string; requiredCapability: string }> = [];

  selectedIds.forEach(id => {
    const capability = getCapabilityById(id);
    if (capability?.requiredCapabilities) {
      capability.requiredCapabilities.forEach(requiredId => {
        if (!selectedIds.includes(requiredId)) {
          missingDependencies.push({
            capabilityId: id,
            requiredCapability: requiredId
          });
        }
      });
    }
  });

  return {
    valid: missingDependencies.length === 0,
    missingDependencies
  };
}
