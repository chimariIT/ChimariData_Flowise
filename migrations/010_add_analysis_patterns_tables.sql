CREATE TABLE IF NOT EXISTS "analysis_patterns" (
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "description" text,
    "industry" varchar DEFAULT 'general' NOT NULL,
    "goal" varchar NOT NULL,
    "question_summary" text,
    "data_schema_signature" varchar,
    "data_schema" jsonb DEFAULT '{}'::jsonb,
    "tool_sequence" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "required_signals" jsonb DEFAULT '[]'::jsonb,
    "fallback_narratives" jsonb DEFAULT '[]'::jsonb,
    "applicable_journeys" jsonb DEFAULT '[]'::jsonb,
    "confidence" integer DEFAULT 0,
    "status" varchar DEFAULT 'pending_review',
    "version" integer DEFAULT 1,
    "requested_by" varchar,
    "discovered_at" timestamp,
    "approved_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "analysis_patterns_industry_idx" ON "analysis_patterns" ("industry");
CREATE INDEX IF NOT EXISTS "analysis_patterns_goal_idx" ON "analysis_patterns" ("goal");
CREATE INDEX IF NOT EXISTS "analysis_patterns_status_idx" ON "analysis_patterns" ("status");
CREATE INDEX IF NOT EXISTS "analysis_patterns_schema_signature_idx" ON "analysis_patterns" ("data_schema_signature");

CREATE TABLE IF NOT EXISTS "analysis_pattern_sources" (
    "id" varchar PRIMARY KEY NOT NULL,
    "pattern_id" varchar NOT NULL,
    "source_type" varchar DEFAULT 'web' NOT NULL,
    "source_url" text,
    "title" varchar,
    "synopsis" text,
    "confidence" integer DEFAULT 0,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "retrieved_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "analysis_pattern_sources_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "analysis_patterns"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "analysis_pattern_sources_pattern_idx" ON "analysis_pattern_sources" ("pattern_id");
CREATE INDEX IF NOT EXISTS "analysis_pattern_sources_source_type_idx" ON "analysis_pattern_sources" ("source_type");

CREATE TABLE IF NOT EXISTS "template_patterns" (
    "id" varchar PRIMARY KEY NOT NULL,
    "template_id" varchar NOT NULL,
    "pattern_id" varchar NOT NULL,
    "relevance_score" integer DEFAULT 0,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "template_patterns_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "artifact_templates"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "template_patterns_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "analysis_patterns"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "template_patterns_template_pattern_unique" UNIQUE ("template_id", "pattern_id")
);

CREATE INDEX IF NOT EXISTS "template_patterns_template_idx" ON "template_patterns" ("template_id");
CREATE INDEX IF NOT EXISTS "template_patterns_pattern_idx" ON "template_patterns" ("pattern_id");
