-- Migration: Add agent_results table for U2A2A2U workflow
-- This table stores outputs from each agent so subsequent agents can build on prior work

-- Create agent_results table
CREATE TABLE IF NOT EXISTS agent_results (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type VARCHAR(50) NOT NULL,
  task_type VARCHAR(100) NOT NULL,

  -- Input context (what the agent received)
  input JSONB NOT NULL DEFAULT '{}',

  -- Output (what the agent produced)
  output JSONB NOT NULL DEFAULT '{}',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed')),

  -- Metrics
  execution_time_ms INTEGER,
  tokens_used INTEGER,
  model_used VARCHAR(100),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),

  -- References to prior agent results this was built on
  depends_on_results VARCHAR(50)[] DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Error tracking
  error_message TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_results_project ON agent_results(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_results_project_agent ON agent_results(project_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_results_project_status ON agent_results(project_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_results_created ON agent_results(created_at DESC);

-- Comments
COMMENT ON TABLE agent_results IS 'Stores outputs from each agent in U2A2A2U workflow for context sharing';
COMMENT ON COLUMN agent_results.depends_on_results IS 'Array of agent_result IDs that this result was built upon';
COMMENT ON COLUMN agent_results.input IS 'Input context including user goals, questions, and prior agent outputs';
COMMENT ON COLUMN agent_results.output IS 'Agent output including results, recommendations, and warnings';
