-- Journey Type Migration: Cleanup - Remove Old Values from Constraints
-- Issue #33: Journey Type Routing Fix
-- 
-- This migration removes old journey type values from CHECK constraints
-- MUST be run AFTER the data migration script completes successfully
--
-- Final journey type values:
-- - non-tech
-- - business
-- - technical
-- - consultation
-- - custom

-- Step 1: Drop temporary constraints
ALTER TABLE projects DROP CONSTRAINT IF EXISTS project_journey_type_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS preferred_journey_check;

-- Step 2: Add final constraints with only new values
ALTER TABLE projects ADD CONSTRAINT project_journey_type_check 
  CHECK (journey_type IN ('non-tech', 'business', 'technical', 'consultation', 'custom'));

ALTER TABLE users ADD CONSTRAINT preferred_journey_check 
  CHECK (preferred_journey IS NULL OR preferred_journey IN ('non-tech', 'business', 'technical', 'consultation', 'custom'));
