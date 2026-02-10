// IMPORTANT: Load environment variables FIRST before any imports
import * as dotenvModule from 'dotenv';
const dotenv = (dotenvModule as any).default || dotenvModule;
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

// Load environment BEFORE any database imports
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('❌ Failed to load .env file:', result.error);
  process.exit(1);
}

// Verify DATABASE_URL is loaded
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables.');
  console.error('   .env path:', envPath);
  process.exit(1);
}

console.log('✅ Environment loaded successfully');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

// Map template IDs to their expected pattern IDs
const templatePatternMap: Record<string, string> = {
  customer_segmentation: 'customer_segmentation',
  fraud_detection: 'fraud_detection',
  credit_risk_assessment: 'credit_risk_assessment',
  portfolio_optimization: 'portfolio_optimization',
  financial_forecasting: 'financial_forecasting',
  anti_money_laundering_detection: 'anti_money_laundering_detection',
  employee_attrition_prediction: 'employee_attrition_prediction',
  compensation_equity_analysis: 'compensation_equity_analysis',
  survey_response_analysis: 'survey_analysis',
  engagement_satisfaction_analysis: 'engagement_analysis',
  workforce_planning_optimization: 'workforce_planning_optimization',
  recruitment_effectiveness_analysis: 'recruitment_effectiveness_analysis',
  performance_management_analytics: 'performance_management_analytics',
  business_retail_growth_playbook: 'retail_growth_playbook',
  business_financial_risk_watch: 'financial_risk_watch',
};

// Minimal pattern metadata for creation
const defaultPatternMeta: Record<string, Partial<{ name: string; goal: string; industry: string; description: string }>> = {
  customer_segmentation: { name: 'Customer Segmentation', goal: 'Segment customers', industry: 'general', description: 'Identify distinct customer groups for targeted strategies.' },
  fraud_detection: { name: 'Fraud Detection', goal: 'Detect fraud', industry: 'finance', description: 'Identify fraudulent transactions or behaviors.' },
  credit_risk_assessment: { name: 'Credit Risk Assessment', goal: 'Assess credit risk', industry: 'finance', description: 'Evaluate risk of default for credit applicants.' },
  portfolio_optimization: { name: 'Portfolio Optimization', goal: 'Optimize portfolio', industry: 'finance', description: 'Maximize returns and minimize risk in investment portfolios.' },
  financial_forecasting: { name: 'Financial Forecasting', goal: 'Forecast financials', industry: 'finance', description: 'Predict future financial outcomes.' },
  anti_money_laundering_detection: { name: 'AML Detection', goal: 'Detect money laundering', industry: 'finance', description: 'Identify suspicious money laundering activities.' },
  employee_attrition_prediction: { name: 'Attrition Prediction', goal: 'Predict attrition', industry: 'hr', description: 'Forecast employee turnover risk.' },
  compensation_equity_analysis: { name: 'Compensation Equity Analysis', goal: 'Analyze compensation equity', industry: 'hr', description: 'Assess fairness in employee compensation.' },
  survey_response_analysis: { name: 'Survey Analysis', goal: 'Analyze survey responses', industry: 'hr', description: 'Extract insights from employee survey data.' },
  engagement_satisfaction_analysis: { name: 'Engagement Analysis', goal: 'Analyze engagement', industry: 'hr', description: 'Measure and improve employee engagement.' },
  workforce_planning_optimization: { name: 'Workforce Planning Optimization', goal: 'Optimize workforce planning', industry: 'hr', description: 'Optimize staffing and resource allocation.' },
  recruitment_effectiveness_analysis: { name: 'Recruitment Effectiveness Analysis', goal: 'Analyze recruitment effectiveness', industry: 'hr', description: 'Evaluate success of recruitment strategies.' },
  performance_management_analytics: { name: 'Performance Management Analytics', goal: 'Analyze performance management', industry: 'hr', description: 'Assess and improve employee performance management.' },
  retail_growth_playbook: { name: 'Retail Growth Playbook', goal: 'Optimize retail growth', industry: 'retail', description: 'Strategic playbook for retail business growth.' },
  financial_risk_watch: { name: 'Financial Risk Watch', goal: 'Monitor financial risk', industry: 'finance', description: 'Real-time monitoring of financial risks.' },
};

async function main() {
  // Import database-dependent modules AFTER environment is loaded
  const { AnalysisPatternRegistry } = await import('../services/analysis-pattern-registry.ts');
  const { defaultJourneyTemplateCatalog } = await import('../../shared/journey-templates.ts');
  const { db } = await import('../db.ts');

  // Verify database connection after import
  if (!db) {
    console.error('❌ Database connection not available even though DATABASE_URL is set.');
    console.error('   Check database connection configuration in server/db.ts');
    process.exit(1);
  }

  console.log('✅ Database connection established');

  async function ensurePatternExists(patternId: string) {
    const patterns = await AnalysisPatternRegistry.getPatternsForContext({ limit: 100, includePending: true });
    const exists = patterns.some(p => p.id === patternId);
    if (!exists) {
      const meta = defaultPatternMeta[patternId] || { name: patternId, goal: 'general', industry: 'general', description: '' };
      await AnalysisPatternRegistry.recordPattern({
        id: patternId,
        name: meta.name,
        goal: meta.goal,
        industry: meta.industry,
        description: meta.description,
        status: 'ready',
      });
      console.log(`✅ Created missing pattern: ${patternId}`);
    } else {
      console.log(`   Pattern already exists: ${patternId}`);
    }
  }

  async function linkAllTemplates() {
    console.log('\n🔗 Starting template-pattern linking process...\n');

    let successCount = 0;
    let failureCount = 0;
    let skipCount = 0;

    for (const template of defaultJourneyTemplateCatalog.business) {
      const patternId = templatePatternMap[template.id];
      if (!patternId) {
        console.warn(`⚠️  No pattern mapping for template: ${template.id}`);
        skipCount++;
        continue;
      }

      try {
        console.log(`\n📋 Processing template: ${template.id}`);
        await ensurePatternExists(patternId);
        await AnalysisPatternRegistry.linkPatternToTemplate({
          templateId: template.id,
          patternId,
          relevanceScore: 100,
        });
        console.log(`✅ Linked template ${template.id} → pattern ${patternId}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to link template ${template.id} to pattern ${patternId}:`, err);
        failureCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Linking Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   ⚠️  Skipped: ${skipCount}`);
    console.log('='.repeat(60) + '\n');
  }

  await linkAllTemplates();
  console.log('✅ All template-pattern links processed successfully.');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error during linking process:', error);
    process.exit(1);
  });
