CREATE TABLE "enterprise_inquiries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"company_name" varchar NOT NULL,
	"contact_email" varchar NOT NULL,
	"contact_name" varchar NOT NULL,
	"phone" varchar,
	"message" text,
	"submitted_at" timestamp DEFAULT now(),
	"status" varchar DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE "guided_analysis_orders" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"project_id" varchar,
	"analysis_config" jsonb,
	"order_data" jsonb,
	"status" varchar DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" varchar NOT NULL,
	"uploaded_at" timestamp DEFAULT now(),
	"description" text,
	"is_trial" boolean DEFAULT false,
	"schema" jsonb,
	"record_count" integer,
	"data" jsonb,
	"processed" boolean DEFAULT false,
	"pii_analysis" jsonb,
	"unique_identifiers" jsonb,
	"data_source" varchar DEFAULT 'upload',
	"source_metadata" jsonb,
	"transformations" jsonb,
	"joined_files" jsonb,
	"outlier_analysis" jsonb,
	"missing_data_analysis" jsonb,
	"normality_tests" jsonb,
	"analysis_results" jsonb,
	"step_by_step_analysis" jsonb,
	"visualizations" jsonb,
	"ai_insights" jsonb,
	"ai_role" varchar,
	"ai_actions" jsonb,
	"mcp_resources" jsonb,
	"purchased_features" jsonb,
	"is_paid" boolean DEFAULT false,
	"selected_features" jsonb,
	"payment_intent_id" varchar,
	"upgraded_at" timestamp,
	"user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"username" varchar,
	"provider" varchar DEFAULT 'replit',
	"email_verified" boolean DEFAULT false,
	"email_verification_token" varchar,
	"email_verification_expires" timestamp,
	"provider_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");