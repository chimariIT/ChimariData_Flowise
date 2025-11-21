-- Migration: Add journey state tracking fields to projects table
-- Purpose: Enable resumable multi-step workflows by storing step completion status
-- Date: November 3, 2025

-- Add journey state tracking columns
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS step_completion_status JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_accessed_step VARCHAR,
ADD COLUMN IF NOT EXISTS journey_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS journey_completed_at TIMESTAMP;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS projects_last_accessed_step_idx ON projects(last_accessed_step);
CREATE INDEX IF NOT EXISTS projects_journey_started_at_idx ON projects(journey_started_at);

-- Add comments for documentation
COMMENT ON COLUMN projects.step_completion_status IS 'JSONB object tracking which journey steps are completed: {"prepare": true, "data": true, "execute": false, ...}';
COMMENT ON COLUMN projects.last_accessed_step IS 'The last journey step the user accessed (e.g., "prepare", "data", "execute")';
COMMENT ON COLUMN projects.journey_started_at IS 'Timestamp when the user first started this journey';
COMMENT ON COLUMN projects.journey_completed_at IS 'Timestamp when the user completed all journey steps';

-- Initialize existing projects with empty step completion status (if NULL)
UPDATE projects
SET step_completion_status = '{}'::jsonb
WHERE step_completion_status IS NULL;
