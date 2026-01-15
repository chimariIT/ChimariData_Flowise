-- Migration: Add Semantic Search with pgvector
-- Created: 2026-01-08
-- Description: Enable semantic search for business definitions and questions using vector embeddings
--
-- This migration:
-- 1. Enables the pgvector extension (required for vector types)
-- 2. Adds embedding column to business_definitions table
-- 3. Creates HNSW index for fast approximate nearest neighbor search
-- 4. Restores embedding column to project_questions (if missing)

-- ============================================
-- STEP 1: Enable pgvector extension
-- ============================================
-- pgvector provides vector similarity search capabilities
-- Must be installed on PostgreSQL server (CREATE EXTENSION requires superuser or extension create privilege)

DO $$
BEGIN
    -- Check if extension exists
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        BEGIN
            CREATE EXTENSION vector;
            RAISE NOTICE 'Created pgvector extension';
        EXCEPTION
            WHEN insufficient_privilege THEN
                RAISE WARNING 'Cannot create pgvector extension - insufficient privileges. Ask database admin to run: CREATE EXTENSION vector;';
            WHEN OTHERS THEN
                RAISE WARNING 'pgvector extension not available: %. Semantic search will be disabled.', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pgvector extension already exists';
    END IF;
END $$;

-- ============================================
-- STEP 2: Add embedding column to business_definitions
-- ============================================
-- Uses 1536 dimensions to match OpenAI text-embedding-ada-002
-- Also compatible with Gemini embeddings (768 padded to 1536)

DO $$
BEGIN
    -- Check if vector type is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        -- Add embedding column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'business_definitions' AND column_name = 'embedding'
        ) THEN
            ALTER TABLE business_definitions
            ADD COLUMN embedding vector(1536);
            RAISE NOTICE 'Added embedding column to business_definitions';
        ELSE
            RAISE NOTICE 'embedding column already exists in business_definitions';
        END IF;

        -- Create HNSW index for fast approximate nearest neighbor search
        -- HNSW (Hierarchical Navigable Small World) is better than IVFFlat for our scale
        -- m=16: number of bi-directional links created for each element (higher = more accurate, more memory)
        -- ef_construction=128: size of dynamic candidate list for construction (higher = better quality)
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE indexname = 'bd_embedding_hnsw_idx'
        ) THEN
            CREATE INDEX bd_embedding_hnsw_idx
            ON business_definitions
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 128);
            RAISE NOTICE 'Created HNSW index on business_definitions.embedding';
        ELSE
            RAISE NOTICE 'HNSW index already exists';
        END IF;
    ELSE
        RAISE WARNING 'pgvector extension not available - skipping embedding column for business_definitions';
    END IF;
END $$;

-- ============================================
-- STEP 3: Ensure project_questions has embedding column
-- ============================================
-- The embedding column may already exist in DB (358 items) but was removed from schema
-- This ensures it exists for semantic question matching

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        -- Add embedding column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'project_questions' AND column_name = 'embedding'
        ) THEN
            ALTER TABLE project_questions
            ADD COLUMN embedding vector(1536);
            RAISE NOTICE 'Added embedding column to project_questions';
        ELSE
            RAISE NOTICE 'embedding column already exists in project_questions (likely has existing data)';
        END IF;

        -- Create HNSW index if not exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE indexname = 'pq_embedding_hnsw_idx'
        ) THEN
            CREATE INDEX pq_embedding_hnsw_idx
            ON project_questions
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 128);
            RAISE NOTICE 'Created HNSW index on project_questions.embedding';
        ELSE
            RAISE NOTICE 'HNSW index already exists for project_questions';
        END IF;
    ELSE
        RAISE WARNING 'pgvector extension not available - skipping embedding column for project_questions';
    END IF;
END $$;

-- ============================================
-- STEP 4: Add embedding column to analysis_patterns (if table exists)
-- ============================================
-- For recommending analysis patterns based on user goals/questions

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
       AND EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'analysis_patterns') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'analysis_patterns' AND column_name = 'embedding'
        ) THEN
            ALTER TABLE analysis_patterns
            ADD COLUMN embedding vector(1536);
            RAISE NOTICE 'Added embedding column to analysis_patterns';

            CREATE INDEX ap_embedding_hnsw_idx
            ON analysis_patterns
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 128);
            RAISE NOTICE 'Created HNSW index on analysis_patterns.embedding';
        ELSE
            RAISE NOTICE 'embedding column already exists in analysis_patterns';
        END IF;
    END IF;
END $$;

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify the migration worked:
-- SELECT
--     table_name,
--     column_name,
--     data_type
-- FROM information_schema.columns
-- WHERE column_name = 'embedding'
-- ORDER BY table_name;
