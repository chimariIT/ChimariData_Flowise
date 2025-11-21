// server/services/agent-templates.ts
import { AgentDefinition } from './agent-registry';

/**
 * Pre-configured agent templates for common use cases
 * These templates make it easy to create specialized agents with predefined capabilities
 */

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'analysis' | 'data_processing' | 'business' | 'support' | 'orchestration' | 'ml' | 'custom';
  definition: Partial<AgentDefinition>;
  useCases: string[];
  requiredTools: string[];
  estimatedSetupTime: number; // in minutes
}

export const agentTemplates: AgentTemplate[] = [
  {
    id: 'customer_churn_predictor',
    name: 'Customer Churn Prediction Agent',
    description: 'Specialized agent for predicting customer churn using ML models and historical data',
    category: 'ml',
    definition: {
      type: 'ml_specialist',
      capabilities: [
        {
          name: 'churn_prediction',
          description: 'Predict customer churn probability using historical behavior patterns',
          inputTypes: ['customer_data', 'transaction_history', 'engagement_metrics'],
          outputTypes: ['churn_probability', 'risk_factors', 'retention_recommendations'],
          complexity: 'high',
          estimatedDuration: 900,
          requiredResources: ['ml_pipeline', 'statistical_analyzer'],
          tags: ['churn', 'retention', 'ml', 'prediction']
        },
        {
          name: 'customer_segmentation',
          description: 'Segment customers based on churn risk',
          inputTypes: ['customer_data'],
          outputTypes: ['customer_segments', 'segment_profiles'],
          complexity: 'medium',
          estimatedDuration: 600,
          requiredResources: ['ml_pipeline'],
          tags: ['segmentation', 'clustering']
        }
      ],
      priority: 4,
      maxConcurrentTasks: 3
    },
    useCases: [
      'Predict customer churn for subscription services',
      'Identify at-risk customers for targeted retention',
      'Analyze factors contributing to customer attrition',
      'Generate automated retention campaigns'
    ],
    requiredTools: ['ml_pipeline', 'statistical_analyzer', 'data_transformer'],
    estimatedSetupTime: 15
  },

  {
    id: 'financial_fraud_detector',
    name: 'Financial Fraud Detection Agent',
    description: 'Real-time fraud detection and anomaly identification for financial transactions',
    category: 'analysis',
    definition: {
      type: 'security_specialist',
      capabilities: [
        {
          name: 'fraud_detection',
          description: 'Detect fraudulent transactions using anomaly detection algorithms',
          inputTypes: ['transaction_data', 'user_behavior', 'historical_patterns'],
          outputTypes: ['fraud_score', 'flagged_transactions', 'risk_report'],
          complexity: 'high',
          estimatedDuration: 300,
          requiredResources: ['statistical_analyzer', 'ml_pipeline'],
          tags: ['fraud', 'security', 'anomaly_detection']
        },
        {
          name: 'risk_scoring',
          description: 'Calculate risk scores for transactions and users',
          inputTypes: ['transaction_data'],
          outputTypes: ['risk_score', 'risk_factors'],
          complexity: 'medium',
          estimatedDuration: 180,
          requiredResources: ['statistical_analyzer'],
          tags: ['risk', 'scoring']
        }
      ],
      priority: 5,
      maxConcurrentTasks: 10
    },
    useCases: [
      'Real-time credit card fraud detection',
      'Identify suspicious account activity',
      'Monitor unusual transaction patterns',
      'Automated risk assessment for transactions'
    ],
    requiredTools: ['statistical_analyzer', 'ml_pipeline', 'decision_auditor'],
    estimatedSetupTime: 20
  },

  {
    id: 'sales_forecaster',
    name: 'Sales Forecasting Agent',
    description: 'Predict future sales trends and generate revenue forecasts using time series analysis',
    category: 'business',
    definition: {
      type: 'forecasting_specialist',
      capabilities: [
        {
          name: 'sales_forecasting',
          description: 'Generate accurate sales forecasts using time series models',
          inputTypes: ['sales_history', 'seasonal_data', 'market_indicators'],
          outputTypes: ['forecast', 'confidence_intervals', 'trend_analysis'],
          complexity: 'high',
          estimatedDuration: 600,
          requiredResources: ['statistical_analyzer', 'visualization_engine'],
          tags: ['forecasting', 'time_series', 'sales']
        },
        {
          name: 'trend_analysis',
          description: 'Identify sales trends and seasonal patterns',
          inputTypes: ['sales_data'],
          outputTypes: ['trends', 'seasonality', 'patterns'],
          complexity: 'medium',
          estimatedDuration: 300,
          requiredResources: ['statistical_analyzer'],
          tags: ['trends', 'seasonality']
        }
      ],
      priority: 3,
      maxConcurrentTasks: 5
    },
    useCases: [
      'Monthly and quarterly sales forecasting',
      'Demand planning and inventory optimization',
      'Revenue projection for business planning',
      'Seasonal trend identification'
    ],
    requiredTools: ['statistical_analyzer', 'visualization_engine', 'business_templates'],
    estimatedSetupTime: 10
  },

  {
    id: 'customer_support_bot',
    name: 'Intelligent Customer Support Agent',
    description: 'AI-powered customer support with automated ticket routing and response generation',
    category: 'support',
    definition: {
      type: 'support_specialist',
      capabilities: [
        {
          name: 'ticket_classification',
          description: 'Automatically classify and route support tickets',
          inputTypes: ['support_ticket', 'customer_message'],
          outputTypes: ['ticket_category', 'priority_level', 'routing_decision'],
          complexity: 'medium',
          estimatedDuration: 60,
          requiredResources: [],
          tags: ['support', 'classification', 'routing']
        },
        {
          name: 'response_generation',
          description: 'Generate appropriate responses to customer inquiries',
          inputTypes: ['customer_inquiry', 'knowledge_base'],
          outputTypes: ['response_text', 'suggested_actions'],
          complexity: 'medium',
          estimatedDuration: 30,
          requiredResources: [],
          tags: ['support', 'response', 'ai']
        }
      ],
      priority: 5,
      maxConcurrentTasks: 20
    },
    useCases: [
      'Automated customer inquiry handling',
      'Intelligent ticket routing to specialists',
      'Generate draft responses for support agents',
      '24/7 initial customer support coverage'
    ],
    requiredTools: ['decision_auditor'],
    estimatedSetupTime: 5
  },

  {
    id: 'inventory_optimizer',
    name: 'Inventory Optimization Agent',
    description: 'Optimize inventory levels using demand forecasting and supply chain analytics',
    category: 'business',
    definition: {
      type: 'optimization_specialist',
      capabilities: [
        {
          name: 'demand_forecasting',
          description: 'Forecast product demand to optimize inventory',
          inputTypes: ['sales_history', 'inventory_data', 'market_trends'],
          outputTypes: ['demand_forecast', 'reorder_points', 'stock_recommendations'],
          complexity: 'high',
          estimatedDuration: 900,
          requiredResources: ['statistical_analyzer', 'ml_pipeline'],
          tags: ['inventory', 'demand', 'forecasting']
        },
        {
          name: 'stock_optimization',
          description: 'Calculate optimal stock levels to minimize costs',
          inputTypes: ['inventory_levels', 'demand_data', 'cost_structure'],
          outputTypes: ['optimal_levels', 'cost_savings', 'action_plan'],
          complexity: 'high',
          estimatedDuration: 600,
          requiredResources: ['statistical_analyzer'],
          tags: ['optimization', 'inventory', 'cost']
        }
      ],
      priority: 3,
      maxConcurrentTasks: 5
    },
    useCases: [
      'Optimize warehouse inventory levels',
      'Reduce carrying costs and stockouts',
      'Automated reorder point calculation',
      'Supply chain efficiency improvement'
    ],
    requiredTools: ['statistical_analyzer', 'ml_pipeline', 'business_templates'],
    estimatedSetupTime: 15
  },

  {
    id: 'sentiment_analyzer',
    name: 'Social Media Sentiment Analysis Agent',
    description: 'Analyze customer sentiment from social media, reviews, and feedback',
    category: 'analysis',
    definition: {
      type: 'sentiment_specialist',
      capabilities: [
        {
          name: 'sentiment_analysis',
          description: 'Analyze sentiment in customer feedback and social media',
          inputTypes: ['text_data', 'reviews', 'social_media_posts'],
          outputTypes: ['sentiment_scores', 'emotion_analysis', 'key_themes'],
          complexity: 'medium',
          estimatedDuration: 300,
          requiredResources: ['statistical_analyzer'],
          tags: ['sentiment', 'nlp', 'analysis']
        },
        {
          name: 'trend_detection',
          description: 'Identify trending topics and sentiment shifts',
          inputTypes: ['text_data', 'timestamps'],
          outputTypes: ['trending_topics', 'sentiment_trends'],
          complexity: 'medium',
          estimatedDuration: 400,
          requiredResources: ['statistical_analyzer', 'visualization_engine'],
          tags: ['trends', 'sentiment', 'topics']
        }
      ],
      priority: 3,
      maxConcurrentTasks: 8
    },
    useCases: [
      'Monitor brand sentiment on social media',
      'Analyze product review sentiment',
      'Track customer satisfaction trends',
      'Early warning for PR issues'
    ],
    requiredTools: ['statistical_analyzer', 'visualization_engine'],
    estimatedSetupTime: 10
  },

  {
    id: 'data_quality_monitor',
    name: 'Data Quality Monitoring Agent',
    description: 'Continuous data quality monitoring with automated validation and alerting',
    category: 'data_processing',
    definition: {
      type: 'quality_specialist',
      capabilities: [
        {
          name: 'quality_validation',
          description: 'Validate data quality against defined rules',
          inputTypes: ['dataset', 'quality_rules'],
          outputTypes: ['quality_report', 'issues_detected', 'data_health_score'],
          complexity: 'medium',
          estimatedDuration: 300,
          requiredResources: ['schema_generator', 'data_transformer'],
          tags: ['quality', 'validation', 'monitoring']
        },
        {
          name: 'anomaly_detection',
          description: 'Detect data anomalies and outliers',
          inputTypes: ['dataset'],
          outputTypes: ['anomalies', 'outliers', 'recommendations'],
          complexity: 'medium',
          estimatedDuration: 400,
          requiredResources: ['statistical_analyzer'],
          tags: ['anomalies', 'outliers', 'detection']
        }
      ],
      priority: 4,
      maxConcurrentTasks: 10
    },
    useCases: [
      'Automated data pipeline quality checks',
      'Real-time data validation',
      'Anomaly detection in data feeds',
      'Data health monitoring and alerting'
    ],
    requiredTools: ['schema_generator', 'data_transformer', 'statistical_analyzer'],
    estimatedSetupTime: 12
  },

  {
    id: 'ab_test_analyzer',
    name: 'A/B Test Analysis Agent',
    description: 'Statistical analysis of A/B tests with automated insights and recommendations',
    category: 'analysis',
    definition: {
      type: 'experimentation_specialist',
      capabilities: [
        {
          name: 'ab_test_analysis',
          description: 'Analyze A/B test results with statistical rigor',
          inputTypes: ['test_data', 'control_group', 'treatment_group'],
          outputTypes: ['statistical_significance', 'effect_size', 'confidence_intervals', 'recommendations'],
          complexity: 'high',
          estimatedDuration: 450,
          requiredResources: ['statistical_analyzer', 'visualization_engine'],
          tags: ['ab_testing', 'experimentation', 'statistics']
        },
        {
          name: 'sample_size_calculation',
          description: 'Calculate required sample size for tests',
          inputTypes: ['expected_effect', 'power', 'significance_level'],
          outputTypes: ['sample_size', 'duration_estimate'],
          complexity: 'medium',
          estimatedDuration: 120,
          requiredResources: ['statistical_analyzer'],
          tags: ['sample_size', 'planning']
        }
      ],
      priority: 3,
      maxConcurrentTasks: 6
    },
    useCases: [
      'Analyze website A/B test results',
      'Marketing campaign effectiveness testing',
      'Product feature experimentation',
      'Conversion optimization analysis'
    ],
    requiredTools: ['statistical_analyzer', 'visualization_engine', 'business_templates'],
    estimatedSetupTime: 8
  }
];

/**
 * Get agent template by ID
 */
export function getAgentTemplate(templateId: string): AgentTemplate | undefined {
  return agentTemplates.find(t => t.id === templateId);
}

/**
 * Get all agent templates by category
 */
export function getTemplatesByCategory(category: string): AgentTemplate[] {
  return agentTemplates.filter(t => t.category === category);
}

/**
 * Search agent templates
 */
export function searchAgentTemplates(query: string): AgentTemplate[] {
  const lowerQuery = query.toLowerCase();
  return agentTemplates.filter(t =>
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.useCases.some(uc => uc.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Create agent from template
 */
export function createAgentFromTemplate(
  templateId: string,
  customizations: Partial<AgentDefinition> = {}
): AgentDefinition {
  const template = getAgentTemplate(templateId);
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  // Merge template definition with customizations
  const agentDefinition: AgentDefinition = {
    id: `agent_${templateId}_${Date.now()}`,
    name: template.name,
    description: template.description,
    type: template.definition.type || 'specialist',
    version: '1.0.0',
    status: 'inactive',
    capabilities: template.definition.capabilities || [],
    priority: template.definition.priority || 3,
    maxConcurrentTasks: template.definition.maxConcurrentTasks || 5,
    currentTasks: 0,
    metrics: {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      lastActivity: new Date()
    },
    health: {
      status: 'active',
      lastCheck: new Date(),
      responseTime: 0,
      errorRate: 0,
      resourceUsage: {
        cpu: 0,
        memory: 0,
        storage: 0
      }
    },
    config: {
      ...template.definition.config,
      requiredTools: template.requiredTools
    },
    ...customizations
  };

  return agentDefinition;
}

/**
 * Get template recommendations based on use case
 */
export function getTemplateRecommendations(useCase: string): AgentTemplate[] {
  const lowerUseCase = useCase.toLowerCase();
  return agentTemplates.filter(t =>
    t.useCases.some(uc => uc.toLowerCase().includes(lowerUseCase))
  ).slice(0, 5); // Top 5 recommendations
}
