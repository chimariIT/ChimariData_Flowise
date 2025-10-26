-- Add consultation pricing configuration table
CREATE TABLE IF NOT EXISTS "consultation_pricing" (
  "id" varchar PRIMARY KEY NOT NULL,
  "consultation_type" varchar NOT NULL UNIQUE,
  "display_name" varchar NOT NULL,
  "description" text,
  "base_price" integer NOT NULL,
  "expert_level" varchar DEFAULT 'senior',
  "duration_hours" integer DEFAULT 1,
  "features" jsonb,
  "is_active" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "created_by" varchar,
  "updated_by" varchar
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "consultation_pricing_type_idx" ON "consultation_pricing" ("consultation_type");
CREATE INDEX IF NOT EXISTS "consultation_pricing_active_idx" ON "consultation_pricing" ("is_active");

-- Insert default consultation pricing tiers
INSERT INTO "consultation_pricing" ("id", "consultation_type", "display_name", "description", "base_price", "expert_level", "duration_hours", "features", "is_active", "sort_order", "created_at", "updated_at")
VALUES
  (
    'cp_default_standard',
    'standard',
    'Standard Consultation',
    'One-on-one consultation with a senior data expert for strategic guidance',
    29900,
    'senior',
    1,
    '["1-hour video consultation", "Senior expert guidance", "Analysis review and recommendations", "Follow-up email summary", "7-day Q&A support"]'::jsonb,
    true,
    1,
    now(),
    now()
  ),
  (
    'cp_default_premium',
    'premium',
    'Premium Consultation',
    'Extended consultation with principal-level expert and custom analysis',
    59900,
    'principal',
    2,
    '["2-hour video consultation", "Principal expert guidance", "Custom analysis deep-dive", "Detailed recommendations report", "30-day Q&A support", "Code review and optimization"]'::jsonb,
    true,
    2,
    now(),
    now()
  ),
  (
    'cp_default_enterprise',
    'enterprise',
    'Enterprise Consultation',
    'Comprehensive consultation package with team collaboration and ongoing support',
    149900,
    'principal',
    4,
    '["4-hour consultation (split sessions)", "Principal expert + team collaboration", "Full analysis audit and optimization", "Implementation roadmap", "90-day ongoing support", "Custom model development", "Team training session"]'::jsonb,
    true,
    3,
    now(),
    now()
  )
ON CONFLICT ("consultation_type") DO NOTHING;
