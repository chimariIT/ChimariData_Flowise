-- Journey Type Migration: Update Database Constraints
-- Issue #33: Journey Type Routing Fix
-- 
-- This migration updates CHECK constraints to allow new journey type values
-- MUST be run BEFORE the data migration script
--
-- New journey type values:
-- - non-tech (formerly ai_guided)
-- - business (formerly template_based)
-- - technical (formerly self_service)
-- - consultation (unchanged)
-- - custom (unchanged)

-- Step 1: Drop old constraints
ALTER TABLE projects DROP CONSTRAINT IF EXISTS project_journey_type_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS preferred_journey_check;

-- Step 2: Add new constraints with updated values
ALTER TABLE projects ADD CONSTRAINT project_journey_type_check 
  CHECK (journey_type IN ('non-tech', 'business', 'technical', 'consultation', 'custom', 'ai_guided', 'template_based', 'self_service'));

ALTER TABLE users ADD CONSTRAINT preferred_journey_check 
  CHECK (preferred_journey IS NULL OR preferred_journey IN ('non-tech', 'business', 'technical', 'consultation', 'custom', 'ai_guided', 'template_based', 'self_service'));

-- Note: We include BOTH old and new values temporarily to allow migration
-- After data migration completes, run the cleanup migration to remove old values
