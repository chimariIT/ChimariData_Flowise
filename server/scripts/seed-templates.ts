// Seed artifact_templates table with system templates
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

// Load environment
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

console.log('✅ Environment loaded');

// Import database after environment is set
const { db } = await import('../db.ts');
const { sql } = await import('drizzle-orm');

if (!db) {
  console.error('❌ Database connection failed');
  process.exit(1);
}

console.log('✅ Database connected');

// Template definitions organized by industry
const templates = {
  finance: [
    {
      id: 'customer_segmentation',
      name: 'Customer Segmentation',
      title: 'Customer Segmentation Analysis',
      summary: 'Segment customers into distinct groups for targeted marketing and service strategies.',
      industry: 'finance',
      persona: 'business analyst',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['segmentation_report', 'customer_profiles', 'targeting_recommendations', 'dashboard', 'powerpoint_deck']
    },
    {
      id: 'fraud_detection',
      name: 'Fraud Detection',
      title: 'Fraud Detection & Prevention',
      summary: 'Identify fraudulent transactions and suspicious patterns to minimize financial loss.',
      industry: 'finance',
      persona: 'risk analyst',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['fraud_model', 'anomaly_report', 'risk_dashboard', 'alert_rules', 'pdf_report']
    },
    {
      id: 'credit_risk_assessment',
      name: 'Credit Risk Assessment',
      title: 'Credit Risk Evaluation',
      summary: 'Assess creditworthiness and default probability for lending decisions.',
      industry: 'finance',
      persona: 'credit analyst',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['risk_model', 'credit_scores', 'default_predictions', 'portfolio_analysis', 'rest_api_export']
    },
    {
      id: 'portfolio_optimization',
      name: 'Portfolio Optimization',
      title: 'Investment Portfolio Optimization',
      summary: 'Optimize asset allocation to maximize returns while minimizing risk.',
      industry: 'finance',
      persona: 'portfolio manager',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['optimal_allocation', 'risk_return_analysis', 'rebalancing_recommendations', 'performance_dashboard']
    },
    {
      id: 'financial_forecasting',
      name: 'Financial Forecasting',
      title: 'Financial Performance Forecasting',
      summary: 'Predict future financial outcomes including revenue, expenses, and cash flow.',
      industry: 'finance',
      persona: 'financial analyst',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['forecast_models', 'scenario_analysis', 'financial_projections', 'variance_report', 'powerpoint_deck']
    },
    {
      id: 'anti_money_laundering_detection',
      name: 'AML Detection',
      title: 'Anti-Money Laundering Detection',
      summary: 'Identify suspicious money laundering activities and ensure regulatory compliance.',
      industry: 'finance',
      persona: 'compliance officer',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['suspicious_activity_report', 'transaction_monitoring_rules', 'compliance_dashboard', 'audit_trail']
    },
    {
      id: 'business_financial_risk_watch',
      name: 'Financial Risk Watch',
      title: 'Real-time Financial Risk Monitoring',
      summary: 'Monitor and alert on financial risks across the organization in real-time.',
      industry: 'finance',
      persona: 'risk manager',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['risk_dashboard', 'alert_system', 'risk_metrics', 'trend_analysis', 'rest_api_export']
    }
  ],

  hr: [
    {
      id: 'employee_attrition_prediction',
      name: 'Employee Attrition Prediction',
      title: 'Employee Turnover Risk Analysis',
      summary: 'Predict which employees are at risk of leaving and identify retention strategies.',
      industry: 'hr',
      persona: 'hr manager',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['attrition_model', 'risk_scores', 'retention_recommendations', 'dashboard', 'powerpoint_deck']
    },
    {
      id: 'compensation_equity_analysis',
      name: 'Compensation Equity Analysis',
      title: 'Pay Equity & Fairness Assessment',
      summary: 'Analyze compensation data to ensure fair and equitable pay across demographics.',
      industry: 'hr',
      persona: 'compensation analyst',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['equity_report', 'pay_gap_analysis', 'adjustment_recommendations', 'compliance_documentation']
    },
    {
      id: 'survey_response_analysis',
      name: 'Survey Response Analysis',
      title: 'Employee Survey Insights',
      summary: 'Analyze survey responses to understand employee sentiment, preferences, and satisfaction.',
      industry: 'hr',
      persona: 'hr analyst',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['sentiment_report', 'preference_summary', 'satisfaction_dashboard', 'action_items', 'powerpoint_deck']
    },
    {
      id: 'engagement_satisfaction_analysis',
      name: 'Engagement & Satisfaction Analysis',
      title: 'Employee Engagement Measurement',
      summary: 'Measure and improve employee engagement and job satisfaction levels.',
      industry: 'hr',
      persona: 'hr business partner',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['engagement_scores', 'satisfaction_metrics', 'improvement_plan', 'trend_dashboard']
    },
    {
      id: 'workforce_planning_optimization',
      name: 'Workforce Planning Optimization',
      title: 'Strategic Workforce Planning',
      summary: 'Optimize staffing levels and resource allocation to meet business objectives.',
      industry: 'hr',
      persona: 'workforce planner',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['staffing_model', 'demand_forecast', 'hiring_plan', 'budget_projections', 'rest_api_export']
    },
    {
      id: 'recruitment_effectiveness_analysis',
      name: 'Recruitment Effectiveness',
      title: 'Recruitment Strategy Evaluation',
      summary: 'Evaluate the effectiveness of recruitment strategies and improve hiring outcomes.',
      industry: 'hr',
      persona: 'talent acquisition',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['recruitment_metrics', 'channel_effectiveness', 'quality_of_hire_analysis', 'optimization_recommendations']
    },
    {
      id: 'performance_management_analytics',
      name: 'Performance Management Analytics',
      title: 'Employee Performance Analysis',
      summary: 'Analyze performance management data to improve employee development and outcomes.',
      industry: 'hr',
      persona: 'hr manager',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['performance_trends', 'calibration_analysis', 'development_recommendations', 'dashboard']
    }
  ],

  retail: [
    {
      id: 'business_retail_growth_playbook',
      name: 'Retail Growth Playbook',
      title: 'Retail Business Growth Strategy',
      summary: 'Comprehensive playbook for driving retail growth through data-driven insights.',
      industry: 'retail',
      persona: 'retail operations',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['growth_strategy', 'market_analysis', 'execution_plan', 'kpi_dashboard', 'powerpoint_deck']
    }
  ],

  marketing: [
    {
      id: 'customer_lifetime_value',
      name: 'Customer Lifetime Value (CLV)',
      title: 'Customer Lifetime Value Analysis',
      summary: 'Calculate and predict customer lifetime value to optimize marketing spend and retention.',
      industry: 'marketing',
      persona: 'marketing analyst',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['clv_model', 'segment_value', 'retention_strategies', 'roi_analysis', 'dashboard']
    },
    {
      id: 'campaign_performance_analytics',
      name: 'Campaign Performance Analytics',
      title: 'Marketing Campaign Effectiveness',
      summary: 'Measure and optimize marketing campaign performance across channels.',
      industry: 'marketing',
      persona: 'campaign manager',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['campaign_metrics', 'channel_attribution', 'optimization_recommendations', 'dashboard', 'powerpoint_deck']
    },
    {
      id: 'churn_prediction_prevention',
      name: 'Churn Prediction & Prevention',
      title: 'Customer Churn Analysis',
      summary: 'Predict customer churn and develop targeted retention campaigns.',
      industry: 'marketing',
      persona: 'retention specialist',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['churn_model', 'risk_segments', 'retention_campaigns', 'win_back_strategies', 'rest_api_export']
    },
    {
      id: 'market_basket_analysis',
      name: 'Market Basket Analysis',
      title: 'Product Affinity & Cross-sell',
      summary: 'Discover product purchase patterns to drive cross-selling and bundling strategies.',
      industry: 'marketing',
      persona: 'merchandising analyst',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['affinity_rules', 'bundle_recommendations', 'cross_sell_opportunities', 'dashboard']
    },
    {
      id: 'marketing_mix_modeling',
      name: 'Marketing Mix Modeling (MMM)',
      title: 'Marketing Budget Optimization',
      summary: 'Optimize marketing budget allocation across channels for maximum ROI.',
      industry: 'marketing',
      persona: 'marketing director',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['mmm_model', 'budget_recommendations', 'scenario_analysis', 'roi_projections', 'powerpoint_deck']
    },
    {
      id: 'content_performance_analytics',
      name: 'Content Performance Analytics',
      title: 'Content Marketing Effectiveness',
      summary: 'Analyze content performance to guide content strategy and creation.',
      industry: 'marketing',
      persona: 'content strategist',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['content_metrics', 'engagement_analysis', 'content_recommendations', 'performance_dashboard']
    },
    {
      id: 'social_media_sentiment_analysis',
      name: 'Social Media Sentiment Analysis',
      title: 'Brand Sentiment Monitoring',
      summary: 'Monitor and analyze brand sentiment across social media platforms.',
      industry: 'marketing',
      persona: 'social media manager',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['sentiment_dashboard', 'trend_analysis', 'influencer_insights', 'crisis_alerts', 'pdf_report']
    }
  ],

  sales: [
    {
      id: 'sales_forecasting',
      name: 'Sales Forecasting',
      title: 'Revenue & Sales Prediction',
      summary: 'Forecast future sales revenue to inform business planning and resource allocation.',
      industry: 'sales',
      persona: 'sales operations',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['forecast_model', 'pipeline_analysis', 'quota_attainment_predictions', 'dashboard', 'rest_api_export']
    },
    {
      id: 'lead_scoring_prioritization',
      name: 'Lead Scoring & Prioritization',
      title: 'Intelligent Lead Scoring',
      summary: 'Score and prioritize leads based on conversion probability to optimize sales effort.',
      industry: 'sales',
      persona: 'sales manager',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['scoring_model', 'lead_rankings', 'conversion_insights', 'dashboard']
    },
    {
      id: 'territory_optimization',
      name: 'Sales Territory Optimization',
      title: 'Territory Design & Balancing',
      summary: 'Optimize sales territory design for balanced workload and maximum coverage.',
      industry: 'sales',
      persona: 'sales operations',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['territory_map', 'workload_analysis', 'rebalancing_recommendations', 'dashboard']
    },
    {
      id: 'pipeline_health_analysis',
      name: 'Pipeline Health Analysis',
      title: 'Sales Pipeline Diagnostics',
      summary: 'Analyze sales pipeline health to identify bottlenecks and improve conversion rates.',
      industry: 'sales',
      persona: 'sales manager',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['pipeline_metrics', 'conversion_analysis', 'bottleneck_identification', 'action_plan', 'powerpoint_deck']
    },
    {
      id: 'win_loss_analysis',
      name: 'Win/Loss Analysis',
      title: 'Deal Outcome Analysis',
      summary: 'Analyze won and lost deals to understand success factors and improve win rates.',
      industry: 'sales',
      persona: 'sales enablement',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['win_loss_report', 'competitive_insights', 'success_patterns', 'improvement_recommendations']
    },
    {
      id: 'sales_performance_benchmarking',
      name: 'Sales Performance Benchmarking',
      title: 'Rep Performance Analysis',
      summary: 'Benchmark sales rep performance to identify top performers and coaching opportunities.',
      industry: 'sales',
      persona: 'sales manager',
      primaryAgent: 'business_agent',
      expectedArtifacts: ['performance_rankings', 'best_practice_analysis', 'coaching_recommendations', 'dashboard']
    },
    {
      id: 'quota_capacity_planning',
      name: 'Quota & Capacity Planning',
      title: 'Sales Quota Optimization',
      summary: 'Set realistic quotas and plan capacity based on historical performance and market conditions.',
      industry: 'sales',
      persona: 'sales operations',
      primaryAgent: 'data_scientist',
      expectedArtifacts: ['quota_model', 'capacity_analysis', 'hiring_recommendations', 'scenario_planning', 'rest_api_export']
    }
  ]
};

// Default step structure for templates
function createDefaultSteps(templateId: string, industry: string) {
  return [
    {
      id: 'industry_context',
      name: 'Industry Context Setup',
      summary: `Gather ${industry} domain context and business objectives`,
      agentHandoff: 'PM collects user requirements',
      tools: ['clarification_tool', 'context_builder']
    },
    {
      id: 'data_upload',
      name: 'Data Upload & Validation',
      summary: 'Upload and validate data files',
      agentHandoff: 'PM → Data Engineer for validation',
      tools: ['file_processor', 'schema_generator', 'data_quality_monitor']
    },
    {
      id: 'analysis_plan',
      name: 'Analysis Plan Generation',
      summary: 'Generate multi-agent analysis plan with cost estimation',
      agentHandoff: 'Data Engineer + Data Scientist collaborate',
      tools: ['analysis_planner', 'cost_estimator']
    },
    {
      id: 'data_preparation',
      name: 'Data Transformation',
      summary: 'Clean, transform, and prepare data for analysis',
      agentHandoff: 'Data Engineer executes transformations',
      tools: ['data_transformer', 'feature_engineer']
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      summary: 'Run approved analysis plan and generate artifacts',
      agentHandoff: 'Data Scientist executes analysis',
      tools: ['statistical_analyzer', 'ml_pipeline', 'visualization_engine']
    },
    {
      id: 'results_review',
      name: 'Results Review',
      summary: 'Review and approve generated insights and artifacts',
      agentHandoff: 'PM presents results for user approval',
      tools: ['artifact_presenter']
    },
    {
      id: 'delivery',
      name: 'Final Deliverables',
      summary: 'Package and deliver final artifacts',
      agentHandoff: 'PM finalizes deliverables',
      tools: ['artifact_packager', 'export_tools']
    }
  ];
}

async function seedTemplates() {
  console.log('\n🌱 Seeding artifact_templates table...\n');

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const [industry, industryTemplates] of Object.entries(templates)) {
    console.log(`\n📁 Processing ${industry.toUpperCase()} templates (${industryTemplates.length}):\n`);

    for (const template of industryTemplates) {
      try {
        // Check if template already exists
        const existing = await db.execute(sql.raw(`
          SELECT id FROM artifact_templates WHERE id = '${template.id}';
        `));

        if (existing.rows.length > 0) {
          console.log(`   ⏭️  Skipped: ${template.name} (already exists)`);
          totalSkipped++;
          continue;
        }

        // Insert template
        const steps = createDefaultSteps(template.id, industry);
        const journeyType = industry === 'finance' || industry === 'marketing' || industry === 'sales' || industry === 'retail' ? 'business' : 'business';

        // Match the actual database schema (includes all NOT NULL columns)
        await db.execute(sql.raw(`
          INSERT INTO artifact_templates (
            id, name, title, summary, journey_type, industry, persona,
            primary_agent, default_confidence, expected_artifacts,
            communication_style, steps, is_system, is_active, created_by,
            created_at, updated_at,
            target_role, target_seniority, target_maturity,
            artifact_types, narrative_style, content_depth
          ) VALUES (
            '${template.id}',
            '${template.name.replace(/'/g, "''")}',
            '${template.title.replace(/'/g, "''")}',
            '${template.summary.replace(/'/g, "''")}',
            '${journeyType}',
            '${industry}',
            '${template.persona || 'business analyst'}',
            '${template.primaryAgent}',
            ${template.expectedArtifacts ? 85 : 80},
            '${JSON.stringify(template.expectedArtifacts)}'::jsonb,
            'professional',
            '${JSON.stringify(steps)}'::jsonb,
            true,
            true,
            'system',
            now(),
            now(),
            '${template.persona || 'analyst'}',
            'senior',
            'intermediate',
            '${JSON.stringify(template.expectedArtifacts || [])}'::jsonb,
            'professional',
            'standard'
          );
        `));

        console.log(`   ✅ Inserted: ${template.name}`);
        totalInserted++;
      } catch (error: any) {
        console.error(`   ❌ Failed to insert ${template.name}:`, error.message);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Seeding Summary:');
  console.log(`   ✅ Inserted: ${totalInserted}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log(`   📈 Total templates: ${totalInserted + totalSkipped}`);
  console.log('='.repeat(60) + '\n');

  // Verify templates by industry
  const verification = await db.execute(sql.raw(`
    SELECT industry, COUNT(*) as count
    FROM artifact_templates
    WHERE is_system = true
    GROUP BY industry
    ORDER BY industry;
  `));

  console.log('📈 Templates by Industry:');
  for (const row of verification.rows) {
    console.log(`   ${row.industry}: ${row.count}`);
  }
}

async function main() {
  try {
    await seedTemplates();
    console.log('\n✅ Template seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during seeding:', error);
    process.exit(1);
  }
}

main();
