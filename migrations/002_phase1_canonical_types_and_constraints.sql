-- Migration: Phase 1 - Canonical Types and Database Constraints
-- Date: 2025-10-07
-- Description: Add enum check constraints, foreign keys, and performance indexes
--              Implements canonical type enforcement from shared/canonical-types.ts

-- ==========================================
-- STEP 1: Add Check Constraints to Users Table
-- ==========================================

-- Subscription tier check (canonical values)
ALTER TABLE users ADD CONSTRAINT subscription_tier_check
  CHECK (subscription_tier IN ('none', 'trial', 'starter', 'professional', 'enterprise'));

-- Subscription status check (canonical values)
ALTER TABLE users ADD CONSTRAINT subscription_status_check
  CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'cancelled', 'expired'));

-- User role check (canonical values)
ALTER TABLE users ADD CONSTRAINT user_role_check
  CHECK (user_role IN ('non-tech', 'business', 'technical', 'consultation'));

-- Technical level check (canonical values)
ALTER TABLE users ADD CONSTRAINT technical_level_check
  CHECK (technical_level IN ('beginner', 'intermediate', 'advanced', 'expert'));

-- Preferred journey check (canonical values, nullable)
ALTER TABLE users ADD CONSTRAINT preferred_journey_check
  CHECK (preferred_journey IS NULL OR preferred_journey IN ('ai_guided', 'template_based', 'self_service', 'consultation'));

-- Usage metrics must be non-negative
ALTER TABLE users ADD CONSTRAINT usage_non_negative
  CHECK (monthly_uploads >= 0 AND monthly_data_volume >= 0 AND monthly_ai_insights >= 0);

-- ==========================================
-- STEP 2: Add NOT NULL Constraints to Users Table
-- ==========================================

-- Make subscription fields NOT NULL with defaults
ALTER TABLE users ALTER COLUMN subscription_tier SET NOT NULL;
ALTER TABLE users ALTER COLUMN subscription_tier SET DEFAULT 'none';

ALTER TABLE users ALTER COLUMN subscription_status SET NOT NULL;
ALTER TABLE users ALTER COLUMN subscription_status SET DEFAULT 'inactive';

ALTER TABLE users ALTER COLUMN is_paid SET NOT NULL;
ALTER TABLE users ALTER COLUMN is_paid SET DEFAULT false;

ALTER TABLE users ALTER COLUMN is_admin SET NOT NULL;
ALTER TABLE users ALTER COLUMN is_admin SET DEFAULT false;

-- Make user role fields NOT NULL with defaults
ALTER TABLE users ALTER COLUMN user_role SET NOT NULL;
ALTER TABLE users ALTER COLUMN user_role SET DEFAULT 'non-tech';

ALTER TABLE users ALTER COLUMN technical_level SET NOT NULL;
ALTER TABLE users ALTER COLUMN technical_level SET DEFAULT 'beginner';

ALTER TABLE users ALTER COLUMN onboarding_completed SET NOT NULL;
ALTER TABLE users ALTER COLUMN onboarding_completed SET DEFAULT false;

-- Make usage tracking fields NOT NULL with defaults
ALTER TABLE users ALTER COLUMN monthly_uploads SET NOT NULL;
ALTER TABLE users ALTER COLUMN monthly_uploads SET DEFAULT 0;

ALTER TABLE users ALTER COLUMN monthly_data_volume SET NOT NULL;
ALTER TABLE users ALTER COLUMN monthly_data_volume SET DEFAULT 0;

ALTER TABLE users ALTER COLUMN monthly_ai_insights SET NOT NULL;
ALTER TABLE users ALTER COLUMN monthly_ai_insights SET DEFAULT 0;

ALTER TABLE users ALTER COLUMN monthly_analysis_components SET NOT NULL;
ALTER TABLE users ALTER COLUMN monthly_analysis_components SET DEFAULT 0;

ALTER TABLE users ALTER COLUMN monthly_visualizations SET NOT NULL;
ALTER TABLE users ALTER COLUMN monthly_visualizations SET DEFAULT 0;

ALTER TABLE users ALTER COLUMN usage_reset_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN usage_reset_at SET DEFAULT NOW();

-- Make JSON fields NOT NULL with defaults
ALTER TABLE users ALTER COLUMN feature_consumption SET NOT NULL;
ALTER TABLE users ALTER COLUMN feature_consumption SET DEFAULT '{}'::jsonb;

ALTER TABLE users ALTER COLUMN subscription_balances SET NOT NULL;
ALTER TABLE users ALTER COLUMN subscription_balances SET DEFAULT '{}'::jsonb;

ALTER TABLE users ALTER COLUMN monthly_feature_usage SET NOT NULL;
ALTER TABLE users ALTER COLUMN monthly_feature_usage SET DEFAULT '{}'::jsonb;

-- Make timestamps NOT NULL
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT NOW();

-- ==========================================
-- STEP 3: Add Performance Indexes to Users Table
-- ==========================================

-- Composite index for user role and subscription status queries
CREATE INDEX IF NOT EXISTS user_role_status_idx ON users(user_role, subscription_status);

-- Composite index for subscription tier and status queries
CREATE INDEX IF NOT EXISTS subscription_tier_status_idx ON users(subscription_tier, subscription_status);

-- Composite index for email and provider lookups
CREATE INDEX IF NOT EXISTS email_provider_idx ON users(email, provider);

-- ==========================================
-- STEP 4: Update Projects Table
-- ==========================================

-- Update project status default from 'active' to 'draft'
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE projects ALTER COLUMN status SET NOT NULL;

-- Make journey_type required
ALTER TABLE projects ALTER COLUMN journey_type SET NOT NULL;

-- Make timestamps NOT NULL
ALTER TABLE projects ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE projects ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE projects ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE projects ALTER COLUMN updated_at SET DEFAULT NOW();

-- Add foreign key constraint with cascade delete
-- Note: This may fail if there are orphaned records. Clean those up first if needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'projects_owner_id_fk'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_owner_id_fk
      FOREIGN KEY (owner_id)
      REFERENCES users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Add check constraints for project status (canonical values)
ALTER TABLE projects ADD CONSTRAINT project_status_check
  CHECK (status IN ('draft', 'uploading', 'processing', 'pii_review', 'ready', 'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled'));

-- Add check constraint for journey type (canonical values)
ALTER TABLE projects ADD CONSTRAINT project_journey_type_check
  CHECK (journey_type IN ('ai_guided', 'template_based', 'self_service', 'consultation'));

-- ==========================================
-- STEP 5: Add Performance Indexes to Projects Table
-- ==========================================

-- Index for owner lookups (foreign key)
CREATE INDEX IF NOT EXISTS project_owner_id_idx ON projects(owner_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS project_status_idx ON projects(status);

-- Index for journey type filtering
CREATE INDEX IF NOT EXISTS project_journey_type_idx ON projects(journey_type);

-- Composite index for owner + status queries
CREATE INDEX IF NOT EXISTS project_owner_status_idx ON projects(owner_id, status);

-- Composite index for owner + journey queries
CREATE INDEX IF NOT EXISTS project_owner_journey_idx ON projects(owner_id, journey_type);

-- ==========================================
-- STEP 6: Add Comments for Documentation
-- ==========================================

COMMENT ON CONSTRAINT subscription_tier_check ON users IS 'Enforces canonical SubscriptionTierEnum values from shared/canonical-types.ts';
COMMENT ON CONSTRAINT subscription_status_check ON users IS 'Enforces canonical SubscriptionStatusEnum values from shared/canonical-types.ts';
COMMENT ON CONSTRAINT user_role_check ON users IS 'Enforces canonical UserRoleEnum values from shared/canonical-types.ts';
COMMENT ON CONSTRAINT technical_level_check ON users IS 'Enforces canonical TechnicalLevelEnum values from shared/canonical-types.ts';
COMMENT ON CONSTRAINT preferred_journey_check ON users IS 'Enforces canonical JourneyTypeEnum values from shared/canonical-types.ts';
COMMENT ON CONSTRAINT project_status_check ON projects IS 'Enforces canonical ProjectStatusEnum values from shared/canonical-types.ts';
COMMENT ON CONSTRAINT project_journey_type_check ON projects IS 'Enforces canonical JourneyTypeEnum values from shared/canonical-types.ts';

-- ==========================================
-- STEP 7: Data Validation and Cleanup
-- ==========================================

-- Clean up any invalid enum values (update to canonical defaults)
UPDATE users SET subscription_tier = 'none' WHERE subscription_tier IS NULL OR subscription_tier NOT IN ('none', 'trial', 'starter', 'professional', 'enterprise');
UPDATE users SET subscription_status = 'inactive' WHERE subscription_status IS NULL OR subscription_status NOT IN ('inactive', 'active', 'past_due', 'cancelled', 'expired');
UPDATE users SET user_role = 'non-tech' WHERE user_role IS NULL OR user_role NOT IN ('non-tech', 'business', 'technical', 'consultation');
UPDATE users SET technical_level = 'beginner' WHERE technical_level IS NULL OR technical_level NOT IN ('beginner', 'intermediate', 'advanced', 'expert');

-- Clean up project status values
UPDATE projects SET status = 'draft' WHERE status IS NULL OR status NOT IN ('draft', 'uploading', 'processing', 'pii_review', 'ready', 'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled');

-- Set default journey type for projects missing it
UPDATE projects SET journey_type = 'ai_guided' WHERE journey_type IS NULL OR journey_type NOT IN ('ai_guided', 'template_based', 'self_service', 'consultation');

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

-- Verify all users have valid enum values
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count FROM users
  WHERE subscription_tier NOT IN ('none', 'trial', 'starter', 'professional', 'enterprise')
     OR user_role NOT IN ('non-tech', 'business', 'technical', 'consultation');

  IF invalid_count > 0 THEN
    RAISE WARNING 'Found % users with invalid enum values after migration', invalid_count;
  ELSE
    RAISE NOTICE 'All users have valid canonical enum values';
  END IF;
END $$;

-- Verify all projects have valid enum values
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count FROM projects
  WHERE status NOT IN ('draft', 'uploading', 'processing', 'pii_review', 'ready', 'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled')
     OR journey_type NOT IN ('ai_guided', 'template_based', 'self_service', 'consultation');

  IF invalid_count > 0 THEN
    RAISE WARNING 'Found % projects with invalid enum values after migration', invalid_count;
  ELSE
    RAISE NOTICE 'All projects have valid canonical enum values';
  END IF;
END $$;

-- Print summary
DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Phase 1 Migration Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Added check constraints for canonical enums';
  RAISE NOTICE 'Added foreign key constraints';
  RAISE NOTICE 'Added composite indexes for performance';
  RAISE NOTICE 'Set NOT NULL constraints with defaults';
  RAISE NOTICE 'Cleaned up invalid data';
  RAISE NOTICE '==========================================';
END $$;
