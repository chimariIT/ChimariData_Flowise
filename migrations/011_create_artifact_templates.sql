-- Create artifact_templates table for database-backed journey templates
-- This supports both system templates (migrated from code) and user-created custom templates

CREATE TABLE IF NOT EXISTS "artifact_templates" (
    "id" varchar(255) PRIMARY KEY NOT NULL,
    "name" varchar(255) NOT NULL,
    "title" varchar(255) NOT NULL,
    "summary" text NOT NULL,
    "description" text,
    "journey_type" varchar(50) NOT NULL, -- 'non-tech', 'business', 'technical', 'consultation', 'custom'
    "industry" varchar(100) DEFAULT 'general' NOT NULL,
    "persona" varchar(100), -- Target user persona
    "primary_agent" varchar(100), -- Lead agent for this template
    "default_confidence" numeric(3,2) DEFAULT 0.8,
    "expected_artifacts" jsonb DEFAULT '[]'::jsonb, -- Array of expected output artifacts
    "communication_style" varchar(50) DEFAULT 'professional', -- 'executive', 'technical', 'conversational'
    "steps" jsonb DEFAULT '[]'::jsonb NOT NULL, -- Full journey step definitions
    "metadata" jsonb DEFAULT '{}'::jsonb, -- Additional template metadata
    "is_system" boolean DEFAULT false, -- System templates vs user-created
    "is_active" boolean DEFAULT true,
    "created_by" varchar(255), -- User ID for custom templates
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS "artifact_templates_journey_type_idx" ON "artifact_templates" ("journey_type");
CREATE INDEX IF NOT EXISTS "artifact_templates_industry_idx" ON "artifact_templates" ("industry");
CREATE INDEX IF NOT EXISTS "artifact_templates_is_system_idx" ON "artifact_templates" ("is_system");
CREATE INDEX IF NOT EXISTS "artifact_templates_is_active_idx" ON "artifact_templates" ("is_active");
CREATE INDEX IF NOT EXISTS "artifact_templates_created_by_idx" ON "artifact_templates" ("created_by");

-- Create a view for active system templates (most common query)
CREATE OR REPLACE VIEW system_templates AS
SELECT * FROM artifact_templates
WHERE is_system = true AND is_active = true;

-- Create a view for user custom templates
CREATE OR REPLACE VIEW custom_templates AS
SELECT * FROM artifact_templates
WHERE is_system = false AND is_active = true;
