-- migrations/012_normalized_schema_no_pgvector.sql
-- Normalized schema WITHOUT pgvector (embeddings stored as JSONB arrays)
-- Run this if pgvector extension is not available

-- ============================================
-- CLEANUP: Drop partially created tables from failed migration
-- ============================================
DROP TABLE IF EXISTS answer_insights CASCADE;
DROP TABLE IF EXISTS evidence_chain CASCADE;
DROP TABLE IF EXISTS question_answers CASCADE;
DROP TABLE IF EXISTS insights CASCADE;
DROP TABLE IF EXISTS visualization_artifacts CASCADE;
DROP TABLE IF EXISTS ml_model_artifacts CASCADE;
DROP TABLE IF EXISTS ds_analysis_results CASCADE;
DROP TABLE IF EXISTS de_pii_detections CASCADE;
DROP TABLE IF EXISTS de_schema_issues CASCADE;
DROP TABLE IF EXISTS de_quality_reports CASCADE;
DROP TABLE IF EXISTS agent_executions CASCADE;
DROP TABLE IF EXISTS project_questions CASCADE;
DROP TABLE IF EXISTS ba_compliance_notes CASCADE;
DROP TABLE IF EXISTS ba_recommendations CASCADE;
DROP TABLE IF EXISTS ba_validation_results CASCADE;
DROP TABLE IF EXISTS agent_workflows CASCADE;
DROP VIEW IF EXISTS v_agent_execution_summary CASCADE;
DROP VIEW IF EXISTS v_question_status CASCADE;
DROP VIEW IF EXISTS v_project_analysis_summary CASCADE;

-- ============================================
-- QUESTIONS TABLE (normalized, embedding as JSONB)
-- ============================================
CREATE TABLE IF NOT EXISTS project_questions (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) >= 5 AND char_length(text) <= 1000),
  embedding JSONB,  -- Store as JSON array instead of vector type
  complexity VARCHAR(10) CHECK (complexity IN ('low', 'medium', 'high')),
  recommended_analyses TEXT[] DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_question_per_project UNIQUE (project_id, text)
);

CREATE INDEX IF NOT EXISTS idx_questions_project ON project_questions(project_id);

-- ============================================
-- AGENT EXECUTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS agent_executions (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type VARCHAR(30) NOT NULL CHECK (agent_type IN (
    'project_manager', 'data_engineer', 'data_scientist',
    'business_agent', 'template_research', 'customer_support'
  )),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'success', 'partial', 'failed', 'cancelled'
  )),

  -- Timestamps
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  execution_time_ms INTEGER,

  -- Resource tracking
  tokens_used INTEGER,
  model_used VARCHAR(100),

  -- Error handling
  error_message TEXT,
  error_code VARCHAR(50),

  -- References to prior executions
  depends_on_ids VARCHAR(50)[] DEFAULT '{}',

  -- Workflow reference
  workflow_id VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_executions_project ON agent_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_executions_project_agent ON agent_executions(project_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_executions_status ON agent_executions(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON agent_executions(workflow_id) WHERE workflow_id IS NOT NULL;

-- ============================================
-- DATA ENGINEER OUTPUTS
-- ============================================
CREATE TABLE IF NOT EXISTS de_quality_reports (
  id VARCHAR(50) PRIMARY KEY,
  execution_id VARCHAR(50) NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  dataset_id VARCHAR(50) NOT NULL,

  -- Quality metrics (queryable columns)
  quality_score NUMERIC(5,2) NOT NULL CHECK (quality_score >= 0 AND quality_score <= 100),
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  column_count INTEGER NOT NULL CHECK (column_count > 0),
  missing_value_percent NUMERIC(5,2) CHECK (missing_value_percent >= 0 AND missing_value_percent <= 100),
  duplicate_row_percent NUMERIC(5,2),
  completeness_score NUMERIC(5,2),
  consistency_score NUMERIC(5,2),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT one_report_per_execution_dataset UNIQUE (execution_id, dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_de_reports_execution ON de_quality_reports(execution_id);
CREATE INDEX IF NOT EXISTS idx_de_reports_quality ON de_quality_reports(quality_score);

CREATE TABLE IF NOT EXISTS de_schema_issues (
  id VARCHAR(50) PRIMARY KEY,
  report_id VARCHAR(50) NOT NULL REFERENCES de_quality_reports(id) ON DELETE CASCADE,
  column_name VARCHAR(255) NOT NULL,
  issue_type VARCHAR(50) NOT NULL,
  issue_description TEXT NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  suggested_fix TEXT
);

CREATE INDEX IF NOT EXISTS idx_schema_issues_report ON de_schema_issues(report_id);
CREATE INDEX IF NOT EXISTS idx_schema_issues_severity ON de_schema_issues(severity);

CREATE TABLE IF NOT EXISTS de_pii_detections (
  id VARCHAR(50) PRIMARY KEY,
  report_id VARCHAR(50) NOT NULL REFERENCES de_quality_reports(id) ON DELETE CASCADE,
  column_name VARCHAR(255) NOT NULL,
  pii_type VARCHAR(50) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  sample_count INTEGER,
  handling_recommendation VARCHAR(50) CHECK (handling_recommendation IN ('mask', 'remove', 'encrypt', 'review'))
);

CREATE INDEX IF NOT EXISTS idx_pii_report ON de_pii_detections(report_id);
CREATE INDEX IF NOT EXISTS idx_pii_type ON de_pii_detections(pii_type);

-- ============================================
-- DATA SCIENTIST OUTPUTS (normalized)
-- ============================================
CREATE TABLE IF NOT EXISTS ds_analysis_results (
  id VARCHAR(50) PRIMARY KEY,
  execution_id VARCHAR(50) NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  question_id VARCHAR(50) REFERENCES project_questions(id) ON DELETE SET NULL,

  -- Analysis metadata
  analysis_type VARCHAR(30) NOT NULL CHECK (analysis_type IN (
    'descriptive', 'correlation', 'regression', 'classification',
    'clustering', 'time_series', 'hypothesis_test', 'anomaly_detection',
    'feature_importance', 'dimensionality_reduction', 'survival_analysis'
  )),

  -- Statistical results (normalized columns!)
  p_value NUMERIC(10,8),
  coefficient NUMERIC(15,8),
  r_squared NUMERIC(5,4),
  confidence_interval_low NUMERIC(15,8),
  confidence_interval_high NUMERIC(15,8),
  effect_size NUMERIC(10,6),
  sample_size INTEGER,
  degrees_of_freedom INTEGER,
  test_statistic NUMERIC(15,8),
  test_name VARCHAR(100),

  -- Model metrics
  accuracy NUMERIC(5,4),
  precision_score NUMERIC(5,4),
  recall_score NUMERIC(5,4),
  f1_score NUMERIC(5,4),
  auc_roc NUMERIC(5,4),
  rmse NUMERIC(15,8),
  mae NUMERIC(15,8),

  -- Quality
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),

  -- Variable data
  additional_metrics JSONB DEFAULT '{}',

  -- Python script info
  script_used VARCHAR(255),
  script_version VARCHAR(50),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_execution ON ds_analysis_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_analysis_question ON ds_analysis_results(question_id);
CREATE INDEX IF NOT EXISTS idx_analysis_type ON ds_analysis_results(analysis_type);
CREATE INDEX IF NOT EXISTS idx_analysis_confidence ON ds_analysis_results(confidence);
CREATE INDEX IF NOT EXISTS idx_analysis_pvalue ON ds_analysis_results(p_value) WHERE p_value IS NOT NULL;

-- ============================================
-- INSIGHTS TABLE (embedding as JSONB)
-- ============================================
CREATE TABLE IF NOT EXISTS insights (
  id VARCHAR(50) PRIMARY KEY,
  analysis_result_id VARCHAR(50) NOT NULL REFERENCES ds_analysis_results(id) ON DELETE CASCADE,

  -- The insight text
  finding TEXT NOT NULL,
  embedding JSONB,  -- Store as JSON array

  -- Quality
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  impact VARCHAR(10) CHECK (impact IN ('low', 'medium', 'high')),

  -- Categorization
  category VARCHAR(50),
  tags TEXT[],

  -- Business translation
  business_implication TEXT,
  recommended_action TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_result ON insights(analysis_result_id);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON insights(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_insights_category ON insights(category);

-- ============================================
-- ML MODEL ARTIFACTS
-- ============================================
CREATE TABLE IF NOT EXISTS ml_model_artifacts (
  id VARCHAR(50) PRIMARY KEY,
  execution_id VARCHAR(50) NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,

  -- Model info
  model_type VARCHAR(50) NOT NULL,
  model_name VARCHAR(255) NOT NULL,
  framework VARCHAR(50),

  -- Storage
  artifact_path TEXT,
  artifact_size_bytes BIGINT,

  -- Performance metrics
  training_accuracy NUMERIC(5,4),
  validation_accuracy NUMERIC(5,4),
  test_accuracy NUMERIC(5,4),
  cross_validation_mean NUMERIC(5,4),
  cross_validation_std NUMERIC(5,4),

  -- Features
  feature_names TEXT[],
  feature_importance JSONB,
  hyperparameters JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_artifacts_execution ON ml_model_artifacts(execution_id);
CREATE INDEX IF NOT EXISTS idx_ml_artifacts_type ON ml_model_artifacts(model_type);

-- ============================================
-- VISUALIZATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS visualization_artifacts (
  id VARCHAR(50) PRIMARY KEY,
  execution_id VARCHAR(50) REFERENCES agent_executions(id) ON DELETE CASCADE,
  analysis_result_id VARCHAR(50) REFERENCES ds_analysis_results(id) ON DELETE SET NULL,

  -- Visualization info
  viz_type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  description TEXT,

  -- Storage
  file_path TEXT,
  thumbnail_path TEXT,
  format VARCHAR(20),

  -- Config
  config JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viz_execution ON visualization_artifacts(execution_id);
CREATE INDEX IF NOT EXISTS idx_viz_analysis ON visualization_artifacts(analysis_result_id);

-- ============================================
-- QUESTION ANSWERS (embedding as JSONB)
-- ============================================
CREATE TABLE IF NOT EXISTS question_answers (
  id VARCHAR(50) PRIMARY KEY,
  question_id VARCHAR(50) NOT NULL REFERENCES project_questions(id) ON DELETE CASCADE,

  -- Answer content
  answer_text TEXT NOT NULL,
  embedding JSONB,  -- Store as JSON array

  -- Quality
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),

  -- Formatted versions
  executive_summary TEXT,
  technical_details TEXT,
  supporting_data TEXT,

  -- Generation metadata
  generated_by VARCHAR(20) NOT NULL CHECK (generated_by IN ('ai', 'template', 'manual', 'hybrid')),
  model_used VARCHAR(100),
  tokens_used INTEGER,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT one_answer_per_question UNIQUE (question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_question ON question_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_confidence ON question_answers(confidence);

-- ============================================
-- EVIDENCE CHAIN
-- ============================================
CREATE TABLE IF NOT EXISTS evidence_chain (
  id VARCHAR(50) PRIMARY KEY,
  answer_id VARCHAR(50) NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),

  -- Source reference
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN (
    'dataset', 'transformation', 'analysis', 'insight', 'model', 'visualization'
  )),
  source_id VARCHAR(50) NOT NULL,

  -- What happened
  transformation_description TEXT,
  output_summary TEXT NOT NULL,

  -- Confidence
  step_confidence INTEGER CHECK (step_confidence >= 0 AND step_confidence <= 100),

  CONSTRAINT unique_step_per_answer UNIQUE (answer_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_evidence_answer ON evidence_chain(answer_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence_chain(source_type, source_id);

-- Link insights to answers
CREATE TABLE IF NOT EXISTS answer_insights (
  answer_id VARCHAR(50) NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,
  insight_id VARCHAR(50) NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  relevance_score NUMERIC(5,4),
  PRIMARY KEY (answer_id, insight_id)
);

CREATE INDEX IF NOT EXISTS idx_answer_insights_answer ON answer_insights(answer_id);
CREATE INDEX IF NOT EXISTS idx_answer_insights_insight ON answer_insights(insight_id);

-- ============================================
-- BUSINESS AGENT OUTPUTS
-- ============================================
CREATE TABLE IF NOT EXISTS ba_validation_results (
  id VARCHAR(50) PRIMARY KEY,
  execution_id VARCHAR(50) NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,

  validation_passed BOOLEAN NOT NULL,
  industry_context VARCHAR(100),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ba_recommendations (
  id VARCHAR(50) PRIMARY KEY,
  validation_result_id VARCHAR(50) NOT NULL REFERENCES ba_validation_results(id) ON DELETE CASCADE,

  recommendation_text TEXT NOT NULL,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  category VARCHAR(100),
  rationale TEXT,
  estimated_impact TEXT
);

CREATE INDEX IF NOT EXISTS idx_ba_recommendations_priority ON ba_recommendations(priority);

CREATE TABLE IF NOT EXISTS ba_compliance_notes (
  id VARCHAR(50) PRIMARY KEY,
  validation_result_id VARCHAR(50) NOT NULL REFERENCES ba_validation_results(id) ON DELETE CASCADE,

  note_text TEXT NOT NULL,
  compliance_area VARCHAR(100),
  severity VARCHAR(10) CHECK (severity IN ('info', 'warning', 'violation'))
);

-- ============================================
-- WORKFLOW TRACKING (U2A2A2U)
-- ============================================
CREATE TABLE IF NOT EXISTS agent_workflows (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'waiting_user', 'success', 'failed', 'cancelled'
  )),

  -- Current phase
  current_phase VARCHAR(30) CHECK (current_phase IN (
    'data_engineer', 'data_scientist', 'business_agent',
    'synthesis', 'checkpoint', 'execution', 'results'
  )),

  -- User input
  goals TEXT[],
  audience VARCHAR(20),

  -- Timestamps
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Error handling
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_workflows_project ON agent_workflows(project_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON agent_workflows(status);

-- ============================================
-- VIEWS
-- ============================================

-- View: Agent execution summary
CREATE OR REPLACE VIEW v_agent_execution_summary AS
SELECT
  ae.project_id,
  ae.agent_type,
  COUNT(*) as total_executions,
  COUNT(CASE WHEN ae.status = 'success' THEN 1 END) as success_count,
  COUNT(CASE WHEN ae.status = 'failed' THEN 1 END) as failure_count,
  AVG(ae.execution_time_ms)::integer as avg_execution_time_ms,
  SUM(ae.tokens_used) as total_tokens_used
FROM agent_executions ae
GROUP BY ae.project_id, ae.agent_type;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE project_questions IS 'User questions - embedding stored as JSONB (pgvector not available)';
COMMENT ON TABLE agent_executions IS 'Tracks all agent executions with proper status lifecycle';
COMMENT ON TABLE de_quality_reports IS 'Data Engineer quality metrics - normalized columns';
COMMENT ON TABLE ds_analysis_results IS 'Statistical results with queryable columns for p-values, coefficients';
COMMENT ON TABLE insights IS 'Analysis insights - embedding stored as JSONB';
COMMENT ON TABLE question_answers IS 'Final answers with evidence chain';
COMMENT ON TABLE evidence_chain IS 'Traceable path from data to answer';
COMMENT ON TABLE agent_workflows IS 'U2A2A2U workflow state tracking';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Normalized schema created successfully (without pgvector)';
  RAISE NOTICE 'Note: Semantic search will use JSONB arrays instead of native vector operations';
END
$$;
