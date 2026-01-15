-- Migration: Add analysisGoals and businessQuestions columns to projects table
-- Date: December 4, 2025
-- Purpose: Store user input from prepare step for data requirements generation

-- Add analysisGoals column
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS analysis_goals TEXT;

-- Add businessQuestions column
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS business_questions TEXT;

-- Add comment for documentation
COMMENT ON COLUMN projects.analysis_goals IS 'What the user wants to achieve from their analysis (from prepare step)';
COMMENT ON COLUMN projects.business_questions IS 'Specific business questions to answer (from prepare step)';
