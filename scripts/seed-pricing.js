/**
 * Simple Node.js script to seed pricing data
 * Run with: node scripts/seed-pricing.js
 */

import pkg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

async function seedPricingData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  console.log('🌱 Seeding pricing data...');

  try {
    // Seed service pricing
    console.log('📊 Seeding service pricing...');
    await pool.query(`
      INSERT INTO service_pricing (
        id,
        service_type,
        display_name,
        description,
        base_price,
        pricing_model,
        is_active,
        created_at,
        updated_at
      ) VALUES 
        (
          'pay-per-analysis',
          'pay-per-analysis',
          'Pay-per-Analysis',
          'Perfect for one-time insights without monthly commitment. Upload your data, get comprehensive analysis and actionable recommendations.',
          2500,
          'fixed',
          true,
          now(),
          now()
        ),
        (
          'expert-consultation',
          'expert-consultation',
          'Expert Consultation',
          '1-hour session with our data science experts. Get strategic guidance, data interpretation, and implementation roadmaps.',
          15000,
          'fixed',
          true,
          now(),
          now()
        )
      ON CONFLICT (service_type) DO NOTHING;
    `);
    console.log('✅ Seeded service pricing');

    // Seed subscription tier pricing
    console.log('📊 Seeding subscription tier pricing...');
    await pool.query(`
      INSERT INTO subscription_tier_pricing (
        id, name, display_name, description, monthly_price_usd, yearly_price_usd,
        limits, features, journey_pricing, overage_pricing, discounts, compliance,
        is_active, created_at, updated_at
      ) VALUES 
        (
          'trial',
          'Trial',
          'Trial',
          'Perfect for testing our platform with basic analytics',
          100,
          1000,
          '{"maxFiles": 1, "maxFileSizeMB": 10, "totalDataVolumeMB": 10, "aiInsights": 1, "maxAnalysisComponents": 5, "maxVisualizations": 3}'::jsonb,
          '{"dataTransformation": false, "statisticalAnalysis": true, "advancedInsights": false, "piiDetection": true}'::jsonb,
          '{"non-tech": 1.0, "business": 1.0, "technical": 1.0, "consultation": 1.0}'::jsonb,
          '{"dataPerMB": 0.01, "computePerMinute": 0.05, "storagePerMB": 0.002}'::jsonb,
          '{"dataProcessingDiscount": 0, "agentUsageDiscount": 0}'::jsonb,
          '{"dataResidency": ["US"], "certifications": ["SOC2"], "sla": 99.0}'::jsonb,
          true,
          now(),
          now()
        ),
        (
          'starter',
          'Starter',
          'Starter',
          'Great for small teams with basic data transformation needs',
          1000,
          10000,
          '{"maxFiles": 2, "maxFileSizeMB": 50, "totalDataVolumeMB": 100, "aiInsights": 3, "maxAnalysisComponents": 15, "maxVisualizations": 10}'::jsonb,
          '{"dataTransformation": true, "statisticalAnalysis": true, "advancedInsights": false, "piiDetection": true}'::jsonb,
          '{"non-tech": 0.8, "business": 0.9, "technical": 1.0, "consultation": 1.2}'::jsonb,
          '{"dataPerMB": 0.008, "computePerMinute": 0.04, "storagePerMB": 0.0015}'::jsonb,
          '{"dataProcessingDiscount": 10, "agentUsageDiscount": 5}'::jsonb,
          '{"dataResidency": ["US", "EU"], "certifications": ["SOC2", "GDPR"], "sla": 99.5}'::jsonb,
          true,
          now(),
          now()
        ),
        (
          'professional',
          'Professional',
          'Professional',
          'Comprehensive analytics for growing businesses',
          2000,
          20000,
          '{"maxFiles": 5, "maxFileSizeMB": 100, "totalDataVolumeMB": 500, "aiInsights": 5, "maxAnalysisComponents": 50, "maxVisualizations": 25}'::jsonb,
          '{"dataTransformation": true, "statisticalAnalysis": true, "advancedInsights": true, "piiDetection": true}'::jsonb,
          '{"non-tech": 0.7, "business": 0.8, "technical": 0.9, "consultation": 1.1}'::jsonb,
          '{"dataPerMB": 0.005, "computePerMinute": 0.03, "storagePerMB": 0.001}'::jsonb,
          '{"dataProcessingDiscount": 20, "agentUsageDiscount": 15}'::jsonb,
          '{"dataResidency": ["US", "EU", "APAC"], "certifications": ["SOC2", "GDPR", "HIPAA"], "sla": 99.8}'::jsonb,
          true,
          now(),
          now()
        ),
        (
          'enterprise',
          'Enterprise',
          'Enterprise',
          'Full access to all features with premium support',
          5000,
          50000,
          '{"maxFiles": 10, "maxFileSizeMB": 200, "totalDataVolumeMB": 1000, "aiInsights": 10, "maxAnalysisComponents": 100, "maxVisualizations": 50}'::jsonb,
          '{"dataTransformation": true, "statisticalAnalysis": true, "advancedInsights": true, "piiDetection": true}'::jsonb,
          '{"non-tech": 0.6, "business": 0.7, "technical": 0.8, "consultation": 1.0}'::jsonb,
          '{"dataPerMB": 0.002, "computePerMinute": 0.02, "storagePerMB": 0.0005}'::jsonb,
          '{"dataProcessingDiscount": 30, "agentUsageDiscount": 25}'::jsonb,
          '{"dataResidency": ["US", "EU", "APAC", "custom"], "certifications": ["SOC2", "GDPR", "HIPAA", "ISO27001"], "sla": 99.95}'::jsonb,
          true,
          now(),
          now()
        )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ Seeded subscription tier pricing');

    console.log('✅ All pricing data seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding pricing data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
seedPricingData()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

