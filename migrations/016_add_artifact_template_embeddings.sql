-- Migration: Add pgvector embeddings and audience fields to artifact_templates
-- Date: 2026-01-09
-- Notes:
--  - Adds pgvector embedding column + HNSW index for template semantic search
--  - Aligns artifact_templates columns/defaults with application schema

-- Ensure pgvector extension is available
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        CREATE EXTENSION vector;
    END IF;
END $$;

-- Align existing columns (types, defaults, nullability)
-- Normalize existing nulls before tightening constraints
UPDATE artifact_templates SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE artifact_templates SET steps = '[]'::jsonb WHERE steps IS NULL;
UPDATE artifact_templates SET expected_artifacts = '[]'::jsonb WHERE expected_artifacts IS NULL;
UPDATE artifact_templates SET summary = '' WHERE summary IS NULL;
UPDATE artifact_templates SET journey_type = 'business' WHERE journey_type IS NULL;
UPDATE artifact_templates SET industry = COALESCE(industry, 'general');
UPDATE artifact_templates SET communication_style = COALESCE(communication_style, 'professional');
UPDATE artifact_templates SET target_role = COALESCE(target_role, 'executive');
UPDATE artifact_templates SET target_seniority = COALESCE(target_seniority, 'senior');
UPDATE artifact_templates SET target_maturity = COALESCE(target_maturity, 'intermediate');
UPDATE artifact_templates SET artifact_types = COALESCE(artifact_types, '[]'::jsonb);
UPDATE artifact_templates SET visualization_types = COALESCE(visualization_types, '[]'::jsonb);
UPDATE artifact_templates SET narrative_style = COALESCE(narrative_style, 'executive');
UPDATE artifact_templates SET content_depth = COALESCE(content_depth, 'standard');
UPDATE artifact_templates SET interactivity_level = COALESCE(interactivity_level, 'medium');
UPDATE artifact_templates SET use_cases = COALESCE(use_cases, '[]'::jsonb);
UPDATE artifact_templates SET delivery_format = COALESCE(delivery_format, '[]'::jsonb);

ALTER TABLE artifact_templates
    ALTER COLUMN summary SET NOT NULL,
    ALTER COLUMN journey_type SET NOT NULL,
    ALTER COLUMN industry SET DEFAULT 'general',
    ALTER COLUMN default_confidence TYPE numeric(5,2) USING default_confidence::numeric,
    ALTER COLUMN default_confidence SET DEFAULT 0.8,
    ALTER COLUMN expected_artifacts SET DEFAULT '[]'::jsonb,
    ALTER COLUMN expected_artifacts SET NOT NULL,
    ALTER COLUMN communication_style SET DEFAULT 'professional',
    ALTER COLUMN steps SET DEFAULT '[]'::jsonb,
    ALTER COLUMN steps SET NOT NULL,
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
    ALTER COLUMN metadata SET NOT NULL,
    ALTER COLUMN is_system SET DEFAULT false,
    ALTER COLUMN is_active SET DEFAULT true;

-- Add new audience/configuration columns if missing
ALTER TABLE artifact_templates
    ADD COLUMN IF NOT EXISTS target_role varchar(100) NOT NULL DEFAULT 'executive',
    ADD COLUMN IF NOT EXISTS target_seniority varchar(100) NOT NULL DEFAULT 'senior',
    ADD COLUMN IF NOT EXISTS target_maturity varchar(100) NOT NULL DEFAULT 'intermediate',
    ADD COLUMN IF NOT EXISTS artifact_types jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS visualization_types jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS narrative_style varchar(100) NOT NULL DEFAULT 'executive',
    ADD COLUMN IF NOT EXISTS content_depth varchar(100) NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS interactivity_level varchar(100) NOT NULL DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS use_cases jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS delivery_format jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS priority integer DEFAULT 100,
    ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create HNSW index for template embeddings
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'at_embedding_hnsw_idx'
        ) THEN
            CREATE INDEX at_embedding_hnsw_idx
            ON artifact_templates
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 128);
        END IF;
    END IF;
END $$;
