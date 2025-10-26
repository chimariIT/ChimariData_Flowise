-- Migration: Add analysisResults and userId to projects table
-- Date: 2025-01-14
-- Description: Fixes analysis results storage and user ID consistency

-- Add userId column (same as ownerId for backward compatibility)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS user_id VARCHAR;

-- Copy ownerId to userId for existing records
UPDATE projects 
SET user_id = owner_id 
WHERE user_id IS NULL;

-- Make userId not null after copying data
ALTER TABLE projects 
ALTER COLUMN user_id SET NOT NULL;

-- Add analysisResults column for storing analysis execution results
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS analysis_results JSONB;

-- Add index on userId for faster queries
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);

-- Add index on analysisResults to speed up result queries
CREATE INDEX IF NOT EXISTS projects_analysis_results_idx ON projects USING GIN (analysis_results);

-- Add comment
COMMENT ON COLUMN projects.analysis_results IS 'Stores results from analysis-execution service including insights, recommendations, and visualizations';
COMMENT ON COLUMN projects.user_id IS 'Reference to users.id - consistent with analysis service expectations';
