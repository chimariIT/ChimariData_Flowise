-- Migration: Add generated_by column to insights table
-- Date: 2026-03-05
-- Description: Enables transformation-to-insight lineage tracking in evidence chain
--
-- Add generated_by column to insights table
ALTER TABLE insights
ADD COLUMN IF NOT EXISTS generated_by VARCHAR(100);

-- Add index on generated_by for querying by component
CREATE INDEX IF NOT EXISTS insights_generated_by_idx ON insights(generated_by);

-- Add comments for documentation
COMMENT ON COLUMN insights.generated_by IS 'Component that generated the insight (e.g., data-science-orchestrator, analysis-execution, artifact-generator)';
COMMENT ON INDEX insights_generated_by_idx IS 'Index for querying insights by generating component';
