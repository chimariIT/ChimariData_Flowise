-- Add project sessions table for secure server-side state management
CREATE TABLE IF NOT EXISTS "project_sessions" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL,
  "project_id" varchar,
  "journey_type" varchar NOT NULL,
  "current_step" varchar DEFAULT 'prepare',
  "prepare_data" jsonb,
  "data_upload_data" jsonb,
  "execute_data" jsonb,
  "pricing_data" jsonb,
  "results_data" jsonb,
  "data_hash" varchar,
  "server_validated" boolean DEFAULT false,
  "ip_address" varchar,
  "user_agent" varchar,
  "last_activity" timestamp DEFAULT now(),
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "project_sessions_user_id_idx" ON "project_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "project_sessions_project_id_idx" ON "project_sessions" ("project_id");
CREATE INDEX IF NOT EXISTS "project_sessions_journey_type_idx" ON "project_sessions" ("journey_type");
CREATE INDEX IF NOT EXISTS "project_sessions_expires_at_idx" ON "project_sessions" ("expires_at");

-- Add comment for documentation
COMMENT ON TABLE "project_sessions" IS 'Server-side session state for multi-step user journeys. Prevents client-side tampering and enables cross-device resume.';
