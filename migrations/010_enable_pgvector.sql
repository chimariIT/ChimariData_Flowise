-- migrations/010_enable_pgvector.sql
-- Enable pgvector extension for semantic search capabilities
-- PREREQUISITE: PostgreSQL 11+ with pgvector extension installed

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation (will show row if successful)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not installed. Please install it first.';
  END IF;
END
$$;
