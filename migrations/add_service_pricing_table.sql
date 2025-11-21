-- Add service pricing table for one-time services (pay-per-analysis, consultation, etc.)
CREATE TABLE IF NOT EXISTS "service_pricing" (
	"id" varchar PRIMARY KEY NOT NULL,
	"service_type" varchar NOT NULL UNIQUE,
	"display_name" varchar NOT NULL,
	"description" text,
	"base_price" integer NOT NULL,
	"pricing_model" varchar NOT NULL DEFAULT 'fixed',
	"pricing_config" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"stripe_product_id" varchar,
	"stripe_price_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE INDEX "service_pricing_type_idx" ON "service_pricing"("service_type");
CREATE INDEX "service_pricing_active_idx" ON "service_pricing"("is_active");

-- Insert default service pricing
INSERT INTO "service_pricing" (
	"id",
	"service_type",
	"display_name",
	"description",
	"base_price",
	"pricing_model",
	"is_active"
) VALUES 
	('pay-per-analysis', 'pay-per-analysis', 'Pay-per-Analysis', 'One-time analysis without monthly commitment', 2500, 'fixed', true),
	('expert-consultation', 'expert-consultation', 'Expert Consultation', '1-hour session with data science experts', 15000, 'fixed', true)
ON CONFLICT (service_type) DO NOTHING;


