-- Rollback Migration: Phase 1 - Canonical Types and Database Constraints
-- Date: 2025-10-07
-- Description: Rollback all changes from 002_phase1_canonical_types_and_constraints.sql

-- ==========================================
-- ROLLBACK STEP 7: Remove Indexes from Projects
-- ==========================================

DROP INDEX IF EXISTS project_owner_journey_idx;
DROP INDEX IF EXISTS project_owner_status_idx;
DROP INDEX IF EXISTS project_journey_type_idx;
DROP INDEX IF EXISTS project_status_idx;
DROP INDEX IF EXISTS project_owner_id_idx;

-- ==========================================
-- ROLLBACK STEP 6: Remove Check Constraints from Projects
-- ==========================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS project_journey_type_check;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS project_status_check;

-- ==========================================
-- ROLLBACK STEP 5: Remove Foreign Key from Projects
-- ==========================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_owner_id_fk;

-- ==========================================
-- ROLLBACK STEP 4: Revert Projects Table NOT NULL Constraints
-- ==========================================

ALTER TABLE projects ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE projects ALTER COLUMN updated_at DROP NOT NULL;

ALTER TABLE projects ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE projects ALTER COLUMN created_at DROP NOT NULL;

ALTER TABLE projects ALTER COLUMN journey_type DROP NOT NULL;

ALTER TABLE projects ALTER COLUMN status DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'active';

-- ==========================================
-- ROLLBACK STEP 3: Remove Indexes from Users
-- ==========================================

DROP INDEX IF EXISTS email_provider_idx;
DROP INDEX IF EXISTS subscription_tier_status_idx;
DROP INDEX IF EXISTS user_role_status_idx;

-- ==========================================
-- ROLLBACK STEP 2: Revert Users Table NOT NULL Constraints
-- ==========================================

ALTER TABLE users ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE users ALTER COLUMN updated_at DROP NOT NULL;

ALTER TABLE users ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE users ALTER COLUMN created_at DROP NOT NULL;

ALTER TABLE users ALTER COLUMN monthly_feature_usage DROP DEFAULT;
ALTER TABLE users ALTER COLUMN monthly_feature_usage DROP NOT NULL;

ALTER TABLE users ALTER COLUMN subscription_balances DROP DEFAULT;
ALTER TABLE users ALTER COLUMN subscription_balances DROP NOT NULL;

ALTER TABLE users ALTER COLUMN feature_consumption DROP DEFAULT;
ALTER TABLE users ALTER COLUMN feature_consumption DROP NOT NULL;

ALTER TABLE users ALTER COLUMN usage_reset_at DROP DEFAULT;
ALTER TABLE users ALTER COLUMN usage_reset_at DROP NOT NULL;

ALTER TABLE users ALTER COLUMN monthly_visualizations DROP DEFAULT;
ALTER TABLE users ALTER COLUMN monthly_visualizations DROP NOT NULL;

ALTER TABLE users ALTER COLUMN monthly_analysis_components DROP DEFAULT;
ALTER TABLE users ALTER COLUMN monthly_analysis_components DROP NOT NULL;

ALTER TABLE users ALTER COLUMN monthly_ai_insights DROP DEFAULT;
ALTER TABLE users ALTER COLUMN monthly_ai_insights DROP NOT NULL;

ALTER TABLE users ALTER COLUMN monthly_data_volume DROP DEFAULT;
ALTER TABLE users ALTER COLUMN monthly_data_volume DROP NOT NULL;

ALTER TABLE users ALTER COLUMN monthly_uploads DROP DEFAULT;
ALTER TABLE users ALTER COLUMN monthly_uploads DROP NOT NULL;

ALTER TABLE users ALTER COLUMN onboarding_completed DROP DEFAULT;
ALTER TABLE users ALTER COLUMN onboarding_completed DROP NOT NULL;

ALTER TABLE users ALTER COLUMN technical_level DROP DEFAULT;
ALTER TABLE users ALTER COLUMN technical_level DROP NOT NULL;

ALTER TABLE users ALTER COLUMN user_role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN user_role DROP NOT NULL;

ALTER TABLE users ALTER COLUMN is_admin DROP DEFAULT;
ALTER TABLE users ALTER COLUMN is_admin DROP NOT NULL;

ALTER TABLE users ALTER COLUMN is_paid DROP DEFAULT;
ALTER TABLE users ALTER COLUMN is_paid DROP NOT NULL;

ALTER TABLE users ALTER COLUMN subscription_status DROP DEFAULT;
ALTER TABLE users ALTER COLUMN subscription_status DROP NOT NULL;

ALTER TABLE users ALTER COLUMN subscription_tier DROP DEFAULT;
ALTER TABLE users ALTER COLUMN subscription_tier DROP NOT NULL;

-- ==========================================
-- ROLLBACK STEP 1: Remove Check Constraints from Users
-- ==========================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS usage_non_negative;
ALTER TABLE users DROP CONSTRAINT IF EXISTS preferred_journey_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS technical_level_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS subscription_status_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS subscription_tier_check;

-- ==========================================
-- ROLLBACK COMPLETE
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Phase 1 Rollback Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Removed all check constraints';
  RAISE NOTICE 'Removed foreign key constraints';
  RAISE NOTICE 'Removed composite indexes';
  RAISE NOTICE 'Reverted NOT NULL constraints';
  RAISE NOTICE '==========================================';
END $$;
