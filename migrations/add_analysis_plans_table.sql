-- Migration: Add analysis_plans table for Plan Step feature
-- Created: 2025-11-03
-- Description: Creates the analysis_plans table with proper constraints, indexes, and triggers

-- Create the analysis_plans table
CREATE TABLE IF NOT EXISTS analysis_plans (
  -- Primary identification
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR NOT NULL,
  created_by VARCHAR(50) NOT NULL DEFAULT 'pm_agent',
  version INTEGER NOT NULL DEFAULT 1,

  -- Plan content (JSONB columns)
  executive_summary TEXT NOT NULL,
  data_assessment JSONB NOT NULL,
  analysis_steps JSONB NOT NULL,
  visualizations JSONB DEFAULT '[]'::jsonb,
  business_context JSONB,
  ml_models JSONB DEFAULT '[]'::jsonb,

  -- Estimates and metadata
  estimated_cost JSONB NOT NULL,
  estimated_duration VARCHAR(50) NOT NULL,
  complexity VARCHAR(20) NOT NULL,
  risks JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  agent_contributions JSONB NOT NULL,

  -- Approval workflow
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMP,
  approved_by VARCHAR,
  rejection_reason TEXT,
  modifications_requested TEXT,

  -- Execution tracking
  executed_at TIMESTAMP,
  execution_completed_at TIMESTAMP,
  actual_cost JSONB,
  actual_duration VARCHAR(50),

  -- Audit metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Foreign key constraints
  CONSTRAINT analysis_plans_project_id_fk
    FOREIGN KEY (project_id)
    REFERENCES projects(id)
    ON DELETE CASCADE,

  CONSTRAINT analysis_plans_approved_by_fk
    FOREIGN KEY (approved_by)
    REFERENCES users(id)
    ON DELETE SET NULL,

  -- Check constraints for data integrity
  CONSTRAINT analysis_plans_status_check
    CHECK (status IN (
      'pending', 'ready', 'approved', 'rejected',
      'modified', 'executing', 'completed', 'cancelled'
    )),

  CONSTRAINT analysis_plans_complexity_check
    CHECK (complexity IN ('low', 'medium', 'high', 'very_high'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS analysis_plans_project_version_idx
  ON analysis_plans(project_id, version);

CREATE INDEX IF NOT EXISTS analysis_plans_status_idx
  ON analysis_plans(status);

CREATE INDEX IF NOT EXISTS analysis_plans_project_status_idx
  ON analysis_plans(project_id, status);

CREATE INDEX IF NOT EXISTS analysis_plans_created_at_idx
  ON analysis_plans(created_at);

-- Create trigger for automatic updated_at timestamp
CREATE OR REPLACE FUNCTION update_analysis_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER analysis_plans_updated_at_trigger
  BEFORE UPDATE ON analysis_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_analysis_plans_updated_at();

-- Update projects table status enum to include plan-related states
-- Note: This assumes the projects table exists with a status column
DO $$
BEGIN
  -- Check if we need to update the projects status column type
  -- This is a no-op if the column already supports the new values
  -- For Drizzle ORM, the enum extension happens via schema.ts

  -- Add comment to projects table for documentation
  COMMENT ON TABLE projects IS 'Project management table with support for Plan Step workflow';
END $$;

-- Add helpful comments
COMMENT ON TABLE analysis_plans IS 'Analysis plans generated during the Plan Step workflow, combining inputs from Data Engineer, Data Scientist, and Business Agent';
COMMENT ON COLUMN analysis_plans.data_assessment IS 'Comprehensive data quality and infrastructure assessment from Data Engineer';
COMMENT ON COLUMN analysis_plans.analysis_steps IS 'Array of analysis tasks to be performed, specified by Data Scientist';
COMMENT ON COLUMN analysis_plans.visualizations IS 'Chart and dashboard specifications for presenting results';
COMMENT ON COLUMN analysis_plans.ml_models IS 'Machine learning model configurations if ML analysis is required';
COMMENT ON COLUMN analysis_plans.business_context IS 'Industry-specific insights and compliance requirements from Business Agent';
COMMENT ON COLUMN analysis_plans.agent_contributions IS 'Tracks what each agent contributed to the plan with confidence scores';
COMMENT ON COLUMN analysis_plans.status IS 'Workflow status: pending (creating) -> ready (awaiting approval) -> approved (executing) -> completed';

-- Verification query (commented out for production)
-- SELECT COUNT(*) as total_plans,
--        status,
--        COUNT(*) FILTER (WHERE status = 'approved') as approved_plans
-- FROM analysis_plans
-- GROUP BY status;
