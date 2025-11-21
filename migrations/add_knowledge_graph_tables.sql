-- Migration: Add knowledge graph tables for Business Agent knowledge base
-- Created: 2025-11-03
-- Description: Creates knowledge_nodes and knowledge_edges tables with supporting indexes and triggers

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id VARCHAR PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  label VARCHAR(200) NOT NULL,
  summary TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_nodes_type_label_unique UNIQUE (type, label)
);

CREATE INDEX IF NOT EXISTS knowledge_nodes_type_label_idx
  ON knowledge_nodes(type, label);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id VARCHAR PRIMARY KEY,
  source_id VARCHAR NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_id VARCHAR NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relationship VARCHAR(100) NOT NULL,
  weight DOUBLE PRECISION DEFAULT 1,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_edges_source_target_idx
  ON knowledge_edges(source_id, target_id);

CREATE INDEX IF NOT EXISTS knowledge_edges_relationship_idx
  ON knowledge_edges(relationship);

-- Trigger functions to keep updated_at current
CREATE OR REPLACE FUNCTION update_knowledge_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_knowledge_edges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER knowledge_nodes_updated_at_trigger
  BEFORE UPDATE ON knowledge_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_nodes_updated_at();

CREATE TRIGGER knowledge_edges_updated_at_trigger
  BEFORE UPDATE ON knowledge_edges
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_edges_updated_at();

COMMENT ON TABLE knowledge_nodes IS 'Knowledge graph nodes representing industries, templates, KPIs, regulations, and related business concepts.';
COMMENT ON TABLE knowledge_edges IS 'Knowledge graph edges describing relationships between business concepts (e.g., industry-to-metric, industry-to-regulation).';
