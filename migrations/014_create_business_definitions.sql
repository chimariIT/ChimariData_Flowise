-- Migration: Create business_definitions table
-- Created: 2026-01-08
-- Description: Business Definition Registry for data element mapping

-- Check if table exists before creating
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'business_definitions') THEN
        CREATE TABLE business_definitions (
            id VARCHAR PRIMARY KEY,

            -- Ownership (can be global or project-specific)
            project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
            user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,

            -- Definition identity
            concept_name VARCHAR(200) NOT NULL,
            display_name VARCHAR(200),
            industry VARCHAR(100) DEFAULT 'general',
            domain VARCHAR(100),

            -- Business definition (what it means)
            business_description TEXT NOT NULL,
            business_context TEXT,

            -- Calculation specification (how to compute it)
            calculation_type VARCHAR(50) NOT NULL,
            formula TEXT,
            pseudo_code TEXT,
            component_fields JSONB DEFAULT '[]',
            aggregation_method VARCHAR(50),

            -- Data type expectations
            expected_data_type VARCHAR(50) DEFAULT 'numeric',
            value_range JSONB,
            unit VARCHAR(50),

            -- Matching patterns (for automatic field detection)
            match_patterns JSONB DEFAULT '[]',
            synonyms JSONB DEFAULT '[]',

            -- Source tracking
            source_type VARCHAR(50) DEFAULT 'manual',
            source_reference TEXT,
            source_agent_id VARCHAR(50),

            -- Quality metrics
            confidence DOUBLE PRECISION DEFAULT 0.8,
            usage_count INTEGER DEFAULT 0,
            success_rate DOUBLE PRECISION,
            last_used_at TIMESTAMP,

            -- Status
            status VARCHAR(50) DEFAULT 'active',

            -- Timestamps
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );

        -- Create indexes
        CREATE INDEX bd_concept_name_idx ON business_definitions(concept_name);
        CREATE INDEX bd_industry_idx ON business_definitions(industry);
        CREATE INDEX bd_domain_idx ON business_definitions(domain);
        CREATE INDEX bd_project_id_idx ON business_definitions(project_id);
        CREATE INDEX bd_calculation_type_idx ON business_definitions(calculation_type);
        CREATE INDEX bd_status_idx ON business_definitions(status);
        CREATE INDEX bd_industry_concept_idx ON business_definitions(industry, concept_name);

        RAISE NOTICE 'Created business_definitions table with indexes';
    ELSE
        RAISE NOTICE 'business_definitions table already exists, skipping creation';
    END IF;
END $$;
