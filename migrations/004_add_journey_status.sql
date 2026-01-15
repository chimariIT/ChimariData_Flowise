-- Migration: Add journeyStatus column to projects table
-- Date: December 5, 2025
-- Purpose: Enable proper journey resume logic and state tracking

-- Add journeyStatus column if it doesn't exist
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS "journeyStatus" VARCHAR(50) DEFAULT 'active';

-- Add CHECK constraint for journeyStatus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_journey_status_check'
  ) THEN
    ALTER TABLE projects
    ADD CONSTRAINT project_journey_status_check
    CHECK ("journeyStatus" IN ('active', 'paused', 'cancelled', 'completed'));
  END IF;
END $$;

-- Set default status for existing projects based on current status
UPDATE projects
SET "journeyStatus" = CASE
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'active'
END
WHERE "journeyStatus" IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS projects_journey_status_idx ON projects("journeyStatus");

-- Verification query (comment out for production)
-- SELECT "journeyStatus", COUNT(*) as count
-- FROM projects
-- GROUP BY "journeyStatus";
