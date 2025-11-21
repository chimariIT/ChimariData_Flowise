// Feature Management System
// Comprehensive feature definitions with complexity levels and billing integration

export type FeatureComplexity = 'small' | 'medium' | 'large' | 'extra_large';

export interface FeatureDefinition {
  id: string;
  name: string;
  category: FeatureCategory;
  description: string;
  enabled: boolean;
  complexities: {
    [key in FeatureComplexity]: FeatureComplexityConfig;
  };
  dependencies?: string[]; // Other features this depends on
  tags: string[];
}

export interface FeatureComplexityConfig {
  complexity: FeatureComplexity;
  displayName: string;
  description: string;
  calculationUnits: number; // Base units for billing calculation
  sizeMultiplier: number; // Size impact on storage/processing
  processingCost: number; // Base cost in cents
  timeEstimate: number; // Estimated processing time in minutes
  resourceRequirements: {
    cpu: number; // CPU usage multiplier
    memory: number; // Memory usage in MB
    storage: number; // Storage impact in MB
  };
  limits: {
    maxCount?: number; // Maximum instances allowed per tier
    maxSize?: number; // Maximum size per instance
    maxConcurrent?: number; // Maximum concurrent executions
    maxWidgets?: number; // Maximum widgets supported for UI-centric features
  };
}

export type FeatureCategory = 
  | 'data_ingestion'
  | 'data_transformation'
  | 'statistical_analysis'
  | 'machine_learning'
  | 'ai_insights'
  | 'visualization'
  | 'artifacts'
  | 'exports'
  | 'dashboards'
  | 'collaboration'
  | 'security';

// Comprehensive feature definitions
export const FEATURE_DEFINITIONS: Record<string, FeatureDefinition> = {
  // Data Ingestion Features
  file_upload: {
    id: 'file_upload',
    name: 'File Upload',
    category: 'data_ingestion',
    description: 'Upload and process data files in various formats',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Upload',
        description: 'Upload files up to 10MB with basic validation',
        calculationUnits: 1,
        sizeMultiplier: 1.0,
        processingCost: 5, // 5 cents
        timeEstimate: 1,
        resourceRequirements: {
          cpu: 0.5,
          memory: 50,
          storage: 10
        },
        limits: {
          maxSize: 10, // MB
          maxConcurrent: 3
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Upload',
        description: 'Upload files up to 100MB with schema detection',
        calculationUnits: 5,
        sizeMultiplier: 2.0,
        processingCost: 25, // 25 cents
        timeEstimate: 3,
        resourceRequirements: {
          cpu: 1.0,
          memory: 200,
          storage: 100
        },
        limits: {
          maxSize: 100, // MB
          maxConcurrent: 5
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Upload',
        description: 'Upload files up to 1GB with full processing',
        calculationUnits: 15,
        sizeMultiplier: 5.0,
        processingCost: 75, // 75 cents
        timeEstimate: 10,
        resourceRequirements: {
          cpu: 2.0,
          memory: 500,
          storage: 1000
        },
        limits: {
          maxSize: 1000, // MB
          maxConcurrent: 2
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Upload',
        description: 'Upload files up to 10GB with enterprise processing',
        calculationUnits: 50,
        sizeMultiplier: 10.0,
        processingCost: 250, // $2.50
        timeEstimate: 30,
        resourceRequirements: {
          cpu: 4.0,
          memory: 1000,
          storage: 10000
        },
        limits: {
          maxSize: 10000, // MB
          maxConcurrent: 1
        }
      }
    },
    tags: ['core', 'data_ingestion', 'file_processing']
  },

  data_validation: {
    id: 'data_validation',
    name: 'Data Validation',
    category: 'data_ingestion',
    description: 'Validate and clean incoming data',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Validation',
        description: 'Basic data type and format validation',
        calculationUnits: 2,
        sizeMultiplier: 1.2,
        processingCost: 10,
        timeEstimate: 2,
        resourceRequirements: {
          cpu: 0.8,
          memory: 100,
          storage: 5
        },
        limits: {
          maxCount: 100
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Validation',
        description: 'Comprehensive validation with schema checking',
        calculationUnits: 8,
        sizeMultiplier: 2.5,
        processingCost: 40,
        timeEstimate: 5,
        resourceRequirements: {
          cpu: 1.5,
          memory: 300,
          storage: 20
        },
        limits: {
          maxCount: 50
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Validation',
        description: 'Advanced validation with custom rules',
        calculationUnits: 25,
        sizeMultiplier: 4.0,
        processingCost: 100,
        timeEstimate: 15,
        resourceRequirements: {
          cpu: 2.5,
          memory: 600,
          storage: 50
        },
        limits: {
          maxCount: 20
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Validation',
        description: 'Enterprise-grade validation with ML-based checks',
        calculationUnits: 75,
        sizeMultiplier: 8.0,
        processingCost: 300,
        timeEstimate: 45,
        resourceRequirements: {
          cpu: 4.0,
          memory: 1200,
          storage: 100
        },
        limits: {
          maxCount: 5
        }
      }
    },
    dependencies: ['file_upload'],
    tags: ['data_quality', 'validation', 'pii_detection']
  },

  // Data Transformation Features
  data_transformation: {
    id: 'data_transformation',
    name: 'Data Transformation',
    category: 'data_transformation',
    description: 'Transform and manipulate data structures',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Transform',
        description: 'Simple column operations and basic transformations',
        calculationUnits: 3,
        sizeMultiplier: 1.5,
        processingCost: 15,
        timeEstimate: 3,
        resourceRequirements: {
          cpu: 1.0,
          memory: 150,
          storage: 10
        },
        limits: {
          maxCount: 50
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Transform',
        description: 'Complex joins, aggregations, and data reshaping',
        calculationUnits: 12,
        sizeMultiplier: 3.0,
        processingCost: 60,
        timeEstimate: 8,
        resourceRequirements: {
          cpu: 2.0,
          memory: 400,
          storage: 50
        },
        limits: {
          maxCount: 25
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Transform',
        description: 'Multi-step pipelines with complex logic',
        calculationUnits: 35,
        sizeMultiplier: 6.0,
        processingCost: 175,
        timeEstimate: 20,
        resourceRequirements: {
          cpu: 3.0,
          memory: 800,
          storage: 100
        },
        limits: {
          maxCount: 10
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Transform',
        description: 'Enterprise data pipelines with ML integration',
        calculationUnits: 100,
        sizeMultiplier: 12.0,
        processingCost: 500,
        timeEstimate: 60,
        resourceRequirements: {
          cpu: 5.0,
          memory: 1600,
          storage: 500
        },
        limits: {
          maxCount: 3
        }
      }
    },
    dependencies: ['data_validation'],
    tags: ['etl', 'data_pipeline', 'transformation']
  },

  // Statistical Analysis Features
  statistical_analysis: {
    id: 'statistical_analysis',
    name: 'Statistical Analysis',
    category: 'statistical_analysis',
    description: 'Comprehensive statistical analysis and hypothesis testing',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Descriptive Stats',
        description: 'Basic descriptive statistics and summary metrics',
        calculationUnits: 4,
        sizeMultiplier: 1.3,
        processingCost: 20,
        timeEstimate: 2,
        resourceRequirements: {
          cpu: 1.2,
          memory: 200,
          storage: 5
        },
        limits: {
          maxCount: 100
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Inferential Stats',
        description: 'Hypothesis testing and confidence intervals',
        calculationUnits: 15,
        sizeMultiplier: 2.8,
        processingCost: 75,
        timeEstimate: 8,
        resourceRequirements: {
          cpu: 2.5,
          memory: 500,
          storage: 20
        },
        limits: {
          maxCount: 30
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Stats',
        description: 'Multivariate analysis and complex statistical models',
        calculationUnits: 45,
        sizeMultiplier: 5.5,
        processingCost: 225,
        timeEstimate: 25,
        resourceRequirements: {
          cpu: 4.0,
          memory: 1000,
          storage: 100
        },
        limits: {
          maxCount: 10
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Research Stats',
        description: 'Research-grade statistical analysis with custom models',
        calculationUnits: 125,
        sizeMultiplier: 10.0,
        processingCost: 625,
        timeEstimate: 90,
        resourceRequirements: {
          cpu: 6.0,
          memory: 2000,
          storage: 500
        },
        limits: {
          maxCount: 3
        }
      }
    },
    dependencies: ['data_transformation'],
    tags: ['statistics', 'hypothesis_testing', 'research']
  },

  // Machine Learning Features
  machine_learning: {
    id: 'machine_learning',
    name: 'Machine Learning',
    category: 'machine_learning',
    description: 'Advanced ML algorithms and model training',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic ML',
        description: 'Simple classification and regression models',
        calculationUnits: 20,
        sizeMultiplier: 3.0,
        processingCost: 100,
        timeEstimate: 15,
        resourceRequirements: {
          cpu: 2.0,
          memory: 500,
          storage: 50
        },
        limits: {
          maxCount: 20
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard ML',
        description: 'Ensemble methods and cross-validation',
        calculationUnits: 60,
        sizeMultiplier: 6.0,
        processingCost: 300,
        timeEstimate: 45,
        resourceRequirements: {
          cpu: 4.0,
          memory: 1000,
          storage: 200
        },
        limits: {
          maxCount: 10
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced ML',
        description: 'Deep learning and complex model architectures',
        calculationUnits: 150,
        sizeMultiplier: 12.0,
        processingCost: 750,
        timeEstimate: 120,
        resourceRequirements: {
          cpu: 8.0,
          memory: 2000,
          storage: 1000
        },
        limits: {
          maxCount: 5
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise ML',
        description: 'Large-scale ML with distributed training',
        calculationUnits: 400,
        sizeMultiplier: 25.0,
        processingCost: 2000,
        timeEstimate: 360,
        resourceRequirements: {
          cpu: 16.0,
          memory: 4000,
          storage: 5000
        },
        limits: {
          maxCount: 1
        }
      }
    },
    dependencies: ['statistical_analysis'],
    tags: ['ml', 'ai', 'predictive_analytics', 'deep_learning']
  },

  // AI Insights Features
  ai_insights: {
    id: 'ai_insights',
    name: 'AI Insights',
    category: 'ai_insights',
    description: 'AI-powered data insights and recommendations',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Insights',
        description: 'Simple AI-generated insights and summaries',
        calculationUnits: 8,
        sizeMultiplier: 2.0,
        processingCost: 40,
        timeEstimate: 5,
        resourceRequirements: {
          cpu: 1.5,
          memory: 300,
          storage: 10
        },
        limits: {
          maxCount: 50
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Insights',
        description: 'Contextual insights with data interpretation',
        calculationUnits: 25,
        sizeMultiplier: 4.0,
        processingCost: 125,
        timeEstimate: 15,
        resourceRequirements: {
          cpu: 3.0,
          memory: 600,
          storage: 50
        },
        limits: {
          maxCount: 20
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Insights',
        description: 'Complex AI analysis with recommendations',
        calculationUnits: 75,
        sizeMultiplier: 8.0,
        processingCost: 375,
        timeEstimate: 45,
        resourceRequirements: {
          cpu: 5.0,
          memory: 1200,
          storage: 200
        },
        limits: {
          maxCount: 8
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Insights',
        description: 'Enterprise AI with custom model integration',
        calculationUnits: 200,
        sizeMultiplier: 15.0,
        processingCost: 1000,
        timeEstimate: 120,
        resourceRequirements: {
          cpu: 8.0,
          memory: 2400,
          storage: 1000
        },
        limits: {
          maxCount: 2
        }
      }
    },
    dependencies: ['machine_learning'],
    tags: ['ai', 'insights', 'recommendations', 'nlp']
  },

  // Visualization Features
  visualization: {
    id: 'visualization',
    name: 'Visualization',
    category: 'visualization',
    description: 'Create interactive charts and visualizations',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Charts',
        description: 'Simple bar, line, and pie charts',
        calculationUnits: 2,
        sizeMultiplier: 1.0,
        processingCost: 10,
        timeEstimate: 1,
        resourceRequirements: {
          cpu: 0.5,
          memory: 100,
          storage: 5
        },
        limits: {
          maxCount: 100
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Charts',
        description: 'Interactive charts with filtering and drill-down',
        calculationUnits: 8,
        sizeMultiplier: 2.5,
        processingCost: 40,
        timeEstimate: 5,
        resourceRequirements: {
          cpu: 1.5,
          memory: 300,
          storage: 20
        },
        limits: {
          maxCount: 50
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Visualizations',
        description: 'Complex dashboards and multi-dimensional charts',
        calculationUnits: 25,
        sizeMultiplier: 5.0,
        processingCost: 125,
        timeEstimate: 15,
        resourceRequirements: {
          cpu: 3.0,
          memory: 600,
          storage: 100
        },
        limits: {
          maxCount: 20
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Dashboards',
        description: 'Real-time enterprise dashboards with custom widgets',
        calculationUnits: 75,
        sizeMultiplier: 10.0,
        processingCost: 375,
        timeEstimate: 45,
        resourceRequirements: {
          cpu: 5.0,
          memory: 1200,
          storage: 500
        },
        limits: {
          maxCount: 5
        }
      }
    },
    dependencies: ['statistical_analysis'],
    tags: ['charts', 'dashboards', 'interactive', 'real_time']
  },

  // Artifacts Features
  artifacts: {
    id: 'artifacts',
    name: 'Artifacts',
    category: 'artifacts',
    description: 'Generate and manage analysis artifacts',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Reports',
        description: 'Simple PDF reports and data exports',
        calculationUnits: 5,
        sizeMultiplier: 1.5,
        processingCost: 25,
        timeEstimate: 3,
        resourceRequirements: {
          cpu: 1.0,
          memory: 200,
          storage: 20
        },
        limits: {
          maxCount: 50
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Artifacts',
        description: 'Comprehensive reports with charts and insights',
        calculationUnits: 15,
        sizeMultiplier: 3.0,
        processingCost: 75,
        timeEstimate: 10,
        resourceRequirements: {
          cpu: 2.0,
          memory: 400,
          storage: 100
        },
        limits: {
          maxCount: 25
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Artifacts',
        description: 'Interactive reports with embedded visualizations',
        calculationUnits: 45,
        sizeMultiplier: 6.0,
        processingCost: 225,
        timeEstimate: 30,
        resourceRequirements: {
          cpu: 4.0,
          memory: 800,
          storage: 500
        },
        limits: {
          maxCount: 10
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Artifacts',
        description: 'Enterprise-grade reports with custom branding',
        calculationUnits: 125,
        sizeMultiplier: 12.0,
        processingCost: 625,
        timeEstimate: 90,
        resourceRequirements: {
          cpu: 6.0,
          memory: 1600,
          storage: 2000
        },
        limits: {
          maxCount: 3
        }
      }
    },
    dependencies: ['visualization', 'ai_insights'],
    tags: ['reports', 'exports', 'documentation', 'branding']
  },

  // Export Features
  exports: {
    id: 'exports',
    name: 'Data Exports',
    category: 'exports',
    description: 'Export data in various formats',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Export',
        description: 'Export data in CSV and Excel formats',
        calculationUnits: 1,
        sizeMultiplier: 1.0,
        processingCost: 5,
        timeEstimate: 1,
        resourceRequirements: {
          cpu: 0.5,
          memory: 100,
          storage: 10
        },
        limits: {
          maxCount: 100,
          maxSize: 100 // MB
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Export',
        description: 'Export with formatting and multiple formats',
        calculationUnits: 4,
        sizeMultiplier: 2.0,
        processingCost: 20,
        timeEstimate: 3,
        resourceRequirements: {
          cpu: 1.0,
          memory: 200,
          storage: 50
        },
        limits: {
          maxCount: 50,
          maxSize: 500 // MB
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Export',
        description: 'Bulk exports with custom transformations',
        calculationUnits: 12,
        sizeMultiplier: 4.0,
        processingCost: 60,
        timeEstimate: 10,
        resourceRequirements: {
          cpu: 2.0,
          memory: 400,
          storage: 200
        },
        limits: {
          maxCount: 20,
          maxSize: 2000 // MB
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Export',
        description: 'Large-scale exports with API integration',
        calculationUnits: 35,
        sizeMultiplier: 8.0,
        processingCost: 175,
        timeEstimate: 30,
        resourceRequirements: {
          cpu: 4.0,
          memory: 800,
          storage: 1000
        },
        limits: {
          maxCount: 5,
          maxSize: 10000 // MB
        }
      }
    },
    tags: ['data_export', 'formats', 'bulk_export', 'api']
  },

  // Dashboard Features
  dashboards: {
    id: 'dashboards',
    name: 'Dashboards',
    category: 'dashboards',
    description: 'Create and manage interactive dashboards',
    enabled: true,
    complexities: {
      small: {
        complexity: 'small',
        displayName: 'Basic Dashboard',
        description: 'Simple dashboard with basic widgets',
        calculationUnits: 10,
        sizeMultiplier: 2.0,
        processingCost: 50,
        timeEstimate: 5,
        resourceRequirements: {
          cpu: 1.5,
          memory: 300,
          storage: 50
        },
        limits: {
          maxCount: 20,
          maxWidgets: 10
        }
      },
      medium: {
        complexity: 'medium',
        displayName: 'Standard Dashboard',
        description: 'Interactive dashboard with multiple data sources',
        calculationUnits: 30,
        sizeMultiplier: 4.0,
        processingCost: 150,
        timeEstimate: 15,
        resourceRequirements: {
          cpu: 3.0,
          memory: 600,
          storage: 200
        },
        limits: {
          maxCount: 10,
          maxWidgets: 25
        }
      },
      large: {
        complexity: 'large',
        displayName: 'Advanced Dashboard',
        description: 'Complex dashboard with real-time data and alerts',
        calculationUnits: 75,
        sizeMultiplier: 8.0,
        processingCost: 375,
        timeEstimate: 45,
        resourceRequirements: {
          cpu: 5.0,
          memory: 1200,
          storage: 1000
        },
        limits: {
          maxCount: 5,
          maxWidgets: 50
        }
      },
      extra_large: {
        complexity: 'extra_large',
        displayName: 'Enterprise Dashboard',
        description: 'Enterprise dashboard with custom integrations',
        calculationUnits: 200,
        sizeMultiplier: 15.0,
        processingCost: 1000,
        timeEstimate: 120,
        resourceRequirements: {
          cpu: 8.0,
          memory: 2400,
          storage: 5000
        },
        limits: {
          maxCount: 2,
          maxWidgets: 100
        }
      }
    },
    dependencies: ['visualization', 'ai_insights'],
    tags: ['dashboard', 'real_time', 'widgets', 'alerts']
  }
};

// Helper functions for feature management
export function getFeatureDefinition(featureId: string): FeatureDefinition | undefined {
  return FEATURE_DEFINITIONS[featureId];
}

export function getFeaturesByCategory(category: FeatureCategory): FeatureDefinition[] {
  return Object.values(FEATURE_DEFINITIONS).filter(feature => feature.category === category);
}

export function getComplexityConfig(featureId: string, complexity: FeatureComplexity): FeatureComplexityConfig | undefined {
  const feature = getFeatureDefinition(featureId);
  return feature?.complexities[complexity];
}

export function calculateFeatureCost(featureId: string, complexity: FeatureComplexity, quantity: number = 1): number {
  const config = getComplexityConfig(featureId, complexity);
  if (!config) return 0;
  return config.processingCost * quantity;
}

export function calculateFeatureResourceUsage(featureId: string, complexity: FeatureComplexity, quantity: number = 1) {
  const config = getComplexityConfig(featureId, complexity);
  if (!config) return { cpu: 0, memory: 0, storage: 0 };
  
  return {
    cpu: config.resourceRequirements.cpu * quantity,
    memory: config.resourceRequirements.memory * quantity,
    storage: config.resourceRequirements.storage * quantity
  };
}

export function getFeatureCategories(): FeatureCategory[] {
  return [
    'data_ingestion',
    'data_transformation', 
    'statistical_analysis',
    'machine_learning',
    'ai_insights',
    'visualization',
    'artifacts',
    'exports',
    'dashboards',
    'collaboration',
    'security'
  ];
}

export function getFeatureComplexityLevels(): FeatureComplexity[] {
  return ['small', 'medium', 'large', 'extra_large'];
}
