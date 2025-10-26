-- Rollback Migration: Remove analysisResults and userId from projects table
-- Date: 2025-01-14
-- Description: Rollback for analysis results storage fix

-- Remove indexes
DROP INDEX IF EXISTS projects_analysis_results_idx;
DROP INDEX IF EXISTS projects_user_id_idx;

-- Remove columns
ALTER TABLE projects 
DROP COLUMN IF EXISTS analysis_results;

ALTER TABLE projects 
DROP COLUMN IF EXISTS user_id;
