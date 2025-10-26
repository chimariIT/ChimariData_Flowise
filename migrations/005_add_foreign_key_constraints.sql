-- Migration: Add Foreign Key Constraints
-- Date: January 16, 2025
-- Purpose: Add referential integrity constraints to prevent orphaned records

-- ============================================================================
-- PHASE 1: Core Entity Relationships (users → projects → artifacts)
-- ============================================================================

-- Users table is the root entity - no foreign keys needed

-- User Permissions -> Users
ALTER TABLE "user_permissions"
  ADD CONSTRAINT "user_permissions_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- Projects -> Users
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- Datasets -> Users (owner)
ALTER TABLE "datasets"
  ADD CONSTRAINT "datasets_owner_id_fk"
  FOREIGN KEY ("owner_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- ============================================================================
-- PHASE 2: Project-Dataset Relationships
-- ============================================================================

-- Project Datasets Junction Table
ALTER TABLE "project_datasets"
  ADD CONSTRAINT "project_datasets_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

ALTER TABLE "project_datasets"
  ADD CONSTRAINT "project_datasets_dataset_id_fk"
  FOREIGN KEY ("dataset_id")
  REFERENCES "datasets"("id")
  ON DELETE CASCADE;

-- ============================================================================
-- PHASE 3: Project Artifacts and Workflow
-- ============================================================================

-- Project Artifacts -> Projects
ALTER TABLE "project_artifacts"
  ADD CONSTRAINT "project_artifacts_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

-- Project Artifacts -> Parent Artifact (self-referencing)
ALTER TABLE "project_artifacts"
  ADD CONSTRAINT "project_artifacts_parent_artifact_id_fk"
  FOREIGN KEY ("parent_artifact_id")
  REFERENCES "project_artifacts"("id")
  ON DELETE SET NULL;

-- Project Artifacts -> Created By User
ALTER TABLE "project_artifacts"
  ADD CONSTRAINT "project_artifacts_created_by_fk"
  FOREIGN KEY ("created_by")
  REFERENCES "users"("id")
  ON DELETE SET NULL;

-- ============================================================================
-- PHASE 4: Agent and Workflow Tracking
-- ============================================================================

-- Agent Checkpoints -> Projects
ALTER TABLE "agent_checkpoints"
  ADD CONSTRAINT "agent_checkpoints_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

-- Decision Audits -> Projects
ALTER TABLE "decision_audits"
  ADD CONSTRAINT "decision_audits_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

-- Service Workflows -> Projects
ALTER TABLE "service_workflows"
  ADD CONSTRAINT "service_workflows_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

-- Data Uploads -> Projects
ALTER TABLE "data_uploads"
  ADD CONSTRAINT "data_uploads_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

-- ============================================================================
-- PHASE 5: Streaming and Scraping Sources
-- ============================================================================

-- Streaming Sources -> Datasets
ALTER TABLE "streaming_sources"
  ADD CONSTRAINT "streaming_sources_dataset_id_fk"
  FOREIGN KEY ("dataset_id")
  REFERENCES "datasets"("id")
  ON DELETE CASCADE;

-- Stream Chunks -> Datasets
ALTER TABLE "stream_chunks"
  ADD CONSTRAINT "stream_chunks_dataset_id_fk"
  FOREIGN KEY ("dataset_id")
  REFERENCES "datasets"("id")
  ON DELETE CASCADE;

-- Stream Checkpoints -> Streaming Sources
ALTER TABLE "stream_checkpoints"
  ADD CONSTRAINT "stream_checkpoints_source_id_fk"
  FOREIGN KEY ("source_id")
  REFERENCES "streaming_sources"("id")
  ON DELETE CASCADE;

-- Scraping Jobs -> Datasets
ALTER TABLE "scraping_jobs"
  ADD CONSTRAINT "scraping_jobs_dataset_id_fk"
  FOREIGN KEY ("dataset_id")
  REFERENCES "datasets"("id")
  ON DELETE CASCADE;

-- Scraping Runs -> Scraping Jobs
ALTER TABLE "scraping_runs"
  ADD CONSTRAINT "scraping_runs_job_id_fk"
  FOREIGN KEY ("job_id")
  REFERENCES "scraping_jobs"("id")
  ON DELETE CASCADE;

-- Scraping Runs -> Project Artifacts (optional)
ALTER TABLE "scraping_runs"
  ADD CONSTRAINT "scraping_runs_artifact_id_fk"
  FOREIGN KEY ("artifact_id")
  REFERENCES "project_artifacts"("id")
  ON DELETE SET NULL;

-- ============================================================================
-- PHASE 6: Dataset Versioning
-- ============================================================================

-- Dataset Versions -> Datasets
ALTER TABLE "dataset_versions"
  ADD CONSTRAINT "dataset_versions_dataset_id_fk"
  FOREIGN KEY ("dataset_id")
  REFERENCES "datasets"("id")
  ON DELETE CASCADE;

-- ============================================================================
-- PHASE 7: Audience Profiles and Artifacts
-- ============================================================================

-- Audience Profiles -> Users
ALTER TABLE "audience_profiles"
  ADD CONSTRAINT "audience_profiles_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- Artifact Templates (no FKs - template library)

-- Data Artifacts (no FKs - template library)

-- Generated Artifacts -> Projects
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

-- Generated Artifacts -> Artifact Templates (optional)
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_template_id_fk"
  FOREIGN KEY ("template_id")
  REFERENCES "artifact_templates"("id")
  ON DELETE SET NULL;

-- Generated Artifacts -> Audience Profiles (optional)
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_audience_profile_id_fk"
  FOREIGN KEY ("audience_profile_id")
  REFERENCES "audience_profiles"("id")
  ON DELETE SET NULL;

-- ============================================================================
-- PHASE 8: Conversation and Journey Tracking
-- ============================================================================

-- Conversation States -> Projects (optional)
ALTER TABLE "conversation_states"
  ADD CONSTRAINT "conversation_states_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE SET NULL;

-- Conversation States -> Users
ALTER TABLE "conversation_states"
  ADD CONSTRAINT "conversation_states_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- Journeys -> Users
ALTER TABLE "journeys"
  ADD CONSTRAINT "journeys_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- Journeys -> Projects (optional)
ALTER TABLE "journeys"
  ADD CONSTRAINT "journeys_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE SET NULL;

-- Journey Step Progress -> Journeys
ALTER TABLE "journey_step_progress"
  ADD CONSTRAINT "journey_step_progress_journey_id_fk"
  FOREIGN KEY ("journey_id")
  REFERENCES "journeys"("id")
  ON DELETE CASCADE;

-- ============================================================================
-- PHASE 9: Pricing and Billing
-- ============================================================================

-- Cost Estimates -> Users
ALTER TABLE "cost_estimates"
  ADD CONSTRAINT "cost_estimates_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- Cost Estimates -> Journeys (optional)
ALTER TABLE "cost_estimates"
  ADD CONSTRAINT "cost_estimates_journey_id_fk"
  FOREIGN KEY ("journey_id")
  REFERENCES "journeys"("id")
  ON DELETE SET NULL;

-- Eligibility Checks -> Users
ALTER TABLE "eligibility_checks"
  ADD CONSTRAINT "eligibility_checks_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- ============================================================================
-- PHASE 10: Enterprise and Orders
-- ============================================================================

-- Enterprise Inquiries (no FKs - standalone table)

-- Guided Analysis Orders -> Users (optional)
ALTER TABLE "guided_analysis_orders"
  ADD CONSTRAINT "guided_analysis_orders_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL;

-- Guided Analysis Orders -> Projects (optional)
ALTER TABLE "guided_analysis_orders"
  ADD CONSTRAINT "guided_analysis_orders_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE SET NULL;

-- ============================================================================
-- PHASE 11: Subscriptions and Feedback
-- ============================================================================

-- Analysis Subscriptions -> Users
ALTER TABLE "analysis_subscriptions"
  ADD CONSTRAINT "analysis_subscriptions_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- Analysis Subscriptions -> Projects
ALTER TABLE "analysis_subscriptions"
  ADD CONSTRAINT "analysis_subscriptions_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE;

-- Template Feedback -> Artifact Templates
ALTER TABLE "template_feedback"
  ADD CONSTRAINT "template_feedback_template_id_fk"
  FOREIGN KEY ("template_id")
  REFERENCES "artifact_templates"("id")
  ON DELETE CASCADE;

-- Template Feedback -> Users
ALTER TABLE "template_feedback"
  ADD CONSTRAINT "template_feedback_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE;

-- ============================================================================
-- Verification: Count Foreign Keys Added
-- ============================================================================

-- This query will show all foreign keys we just added
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- Expected: ~45 foreign key constraints
