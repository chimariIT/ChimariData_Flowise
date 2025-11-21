-- Pricing Configuration Tables
-- These tables store admin-configurable pricing for features, subscriptions, and services

-- Component pricing: Base pricing for individual analysis components
CREATE TABLE IF NOT EXISTS "pricing_components" (
  "id" varchar PRIMARY KEY NOT NULL,
  "name" varchar NOT NULL UNIQUE,
  "display_name" varchar NOT NULL,
  "description" text,
  "category" varchar NOT NULL, -- 'analysis', 'visualization', 'ml', 'preprocessing', 'export'
  "base_price_usd" decimal(10,2) NOT NULL DEFAULT 0.00,
  "pricing_model" varchar NOT NULL DEFAULT 'per_item', -- 'per_item', 'per_mb', 'per_1000_records', 'tiered'
  "pricing_config" jsonb DEFAULT '{}', -- Model-specific configuration
  "active" boolean DEFAULT true,
  "stripe_product_id" varchar,
  "stripe_price_id" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX "pricing_components_category_idx" ON "pricing_components"("category");
CREATE INDEX "pricing_components_active_idx" ON "pricing_components"("active");

-- Subscription tier pricing configuration
CREATE TABLE IF NOT EXISTS "pricing_subscription_tiers" (
  "id" varchar PRIMARY KEY NOT NULL, -- 'trial', 'starter', 'professional', 'enterprise'
  "name" varchar NOT NULL,
  "display_name" varchar NOT NULL,
  "description" text,
  "monthly_price_usd" decimal(10,2) NOT NULL,
  "yearly_price_usd" decimal(10,2) NOT NULL,
  "stripe_product_id" varchar,
  "stripe_monthly_price_id" varchar,
  "stripe_yearly_price_id" varchar,
  "limits" jsonb NOT NULL DEFAULT '{}', -- Feature limits
  "features" jsonb NOT NULL DEFAULT '{}', -- Feature flags
  "journey_pricing" jsonb DEFAULT '{}', -- Journey type multipliers
  "overage_pricing" jsonb DEFAULT '{}', -- Overage charges
  "discounts" jsonb DEFAULT '{}', -- Discount configuration
  "compliance" jsonb DEFAULT '{}', -- Compliance features
  "active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX "pricing_subscription_tiers_active_idx" ON "pricing_subscription_tiers"("active");

-- Service pricing: One-time services (pay-per-analysis, consultation, etc.)
CREATE TABLE IF NOT EXISTS "pricing_services" (
  "id" varchar PRIMARY KEY NOT NULL, -- 'pay-per-analysis', 'expert-consultation', etc.
  "name" varchar NOT NULL,
  "display_name" varchar NOT NULL,
  "description" text,
  "base_price_usd" decimal(10,2) NOT NULL,
  "pricing_model" varchar NOT NULL DEFAULT 'fixed', -- 'fixed', 'calculated'
  "pricing_formula" jsonb DEFAULT '{}', -- Calculation formula for dynamic pricing
  "stripe_product_id" varchar,
  "stripe_price_id" varchar,
  "active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX "pricing_services_active_idx" ON "pricing_services"("active");

-- Pricing rules: Complex pricing rules based on data size, complexity, features
CREATE TABLE IF NOT EXISTS "pricing_rules" (
  "id" varchar PRIMARY KEY NOT NULL,
  "name" varchar NOT NULL,
  "rule_type" varchar NOT NULL, -- 'size_multiplier', 'complexity_multiplier', 'feature_addon'
  "condition" jsonb NOT NULL, -- Matching conditions
  "calculation" jsonb NOT NULL, -- Calculation parameters
  "priority" integer DEFAULT 0, -- Higher priority rules applied first
  "active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX "pricing_rules_rule_type_idx" ON "pricing_rules"("rule_type");
CREATE INDEX "pricing_rules_active_idx" ON "pricing_rules"("active");
CREATE INDEX "pricing_rules_priority_idx" ON "pricing_rules"("priority");


