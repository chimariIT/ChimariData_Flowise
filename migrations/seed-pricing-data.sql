-- Seed initial pricing data
-- This will be run manually or via a migration script

-- Service Pricing
INSERT INTO "service_pricing" (
  "id",
  "service_type",
  "display_name",
  "description",
  "base_price",
  "pricing_model",
  "is_active",
  "created_at",
  "updated_at"
) VALUES 
  (
    'pay-per-analysis',
    'pay-per-analysis',
    'Pay-per-Analysis',
    'Perfect for one-time insights without monthly commitment. Upload your data, get comprehensive analysis and actionable recommendations.',
    2500, -- $25 in cents
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
    15000, -- $150 in cents
    'fixed',
    true,
    now(),
    now()
  )
ON CONFLICT (service_type) DO NOTHING;

-- Subscription Tier Pricing
INSERT INTO "subscription_tier_pricing" (
  "id",
  "name",
  "display_name",
  "description",
  "monthly_price_usd",
  "yearly_price_usd",
  "limits",
  "features",
  "journey_pricing",
  "overage_pricing",
  "discounts",
  "compliance",
  "is_active",
  "created_at",
  "updated_at"
) VALUES 
  (
    'trial',
    'Trial',
    'Trial',
    'Perfect for testing our platform with basic analytics',
    100,  -- $1 in cents
    1000, -- $10 in cents
    '{"maxFiles": 1, "maxFileSizeMB": 10, "totalDataVolumeMB": 10, "aiInsights": 1, "maxAnalysisComponents": 5, "maxVisualizations": 3}',
    '{"dataTransformation": false, "statisticalAnalysis": true, "advancedInsights": false, "piiDetection": true}',
    '{"non-tech": 1.0, "business": 1.0, "technical": 1.0, "consultation": 1.0}',
    '{"dataPerMB": 0.01, "computePerMinute": 0.05, "storagePerMB": 0.002}',
    '{"dataProcessingDiscount": 0, "agentUsageDiscount": 0}',
    '{"dataResidency": ["US"], "certifications": ["SOC2"], "sla": 99.0}',
    true,
    now(),
    now()
  ),
  (
    'starter',
    'Starter',
    'Starter',
    'Great for small teams with basic data transformation needs',
    1000,  -- $10 in cents
    10000, -- $100 in cents
    '{"maxFiles": 2, "maxFileSizeMB": 50, "totalDataVolumeMB": 100, "aiInsights": 3, "maxAnalysisComponents": 15, "maxVisualizations": 10}',
    '{"dataTransformation": true, "statisticalAnalysis": true, "advancedInsights": false, "piiDetection": true}',
    '{"non-tech": 0.8, "business": 0.9, "technical": 1.0, "consultation": 1.2}',
    '{"dataPerMB": 0.008, "computePerMinute": 0.04, "storagePerMB": 0.0015}',
    '{"dataProcessingDiscount": 10, "agentUsageDiscount": 5}',
    '{"dataResidency": ["US", "EU"], "certifications": ["SOC2", "GDPR"], "sla": 99.5}',
    true,
    now(),
    now()
  ),
  (
    'professional',
    'Professional',
    'Professional',
    'Comprehensive analytics for growing businesses',
    2000,  -- $20 in cents
    20000, -- $200 in cents
    '{"maxFiles": 5, "maxFileSizeMB": 100, "totalDataVolumeMB": 500, "aiInsights": 5, "maxAnalysisComponents": 50, "maxVisualizations": 25}',
    '{"dataTransformation": true, "statisticalAnalysis": true, "advancedInsights": true, "piiDetection": true}',
    '{"non-tech": 0.7, "business": 0.8, "technical": 0.9, "consultation": 1.1}',
    '{"dataPerMB": 0.005, "computePerMinute": 0.03, "storagePerMB": 0.001}',
    '{"dataProcessingDiscount": 20, "agentUsageDiscount": 15}',
    '{"dataResidency": ["US", "EU", "APAC"], "certifications": ["SOC2", "GDPR", "HIPAA"], "sla": 99.8}',
    true,
    now(),
    now()
  ),
  (
    'enterprise',
    'Enterprise',
    'Enterprise',
    'Full access to all features with premium support',
    5000,  -- $50 in cents
    50000, -- $500 in cents
    '{"maxFiles": 10, "maxFileSizeMB": 200, "totalDataVolumeMB": 1000, "aiInsights": 10, "maxAnalysisComponents": 100, "maxVisualizations": 50}',
    '{"dataTransformation": true, "statisticalAnalysis": true, "advancedInsights": true, "piiDetection": true}',
    '{"non-tech": 0.6, "business": 0.7, "technical": 0.8, "consultation": 1.0}',
    '{"dataPerMB": 0.002, "computePerMinute": 0.02, "storagePerMB": 0.0005}',
    '{"dataProcessingDiscount": 30, "agentUsageDiscount": 25}',
    '{"dataResidency": ["US", "EU", "APAC", "custom"], "certifications": ["SOC2", "GDPR", "HIPAA", "ISO27001"], "sla": 99.95}',
    true,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;


