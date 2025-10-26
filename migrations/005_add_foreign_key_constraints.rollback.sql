-- Rollback Migration: Remove Foreign Key Constraints
-- Date: January 16, 2025
-- Purpose: Rollback foreign key constraints if needed

-- ============================================================================
-- PHASE 11: Subscriptions and Feedback
-- ============================================================================

ALTER TABLE "template_feedback" DROP CONSTRAINT IF EXISTS "template_feedback_user_id_fk";
ALTER TABLE "template_feedback" DROP CONSTRAINT IF EXISTS "template_feedback_template_id_fk";
ALTER TABLE "analysis_subscriptions" DROP CONSTRAINT IF EXISTS "analysis_subscriptions_project_id_fk";
ALTER TABLE "analysis_subscriptions" DROP CONSTRAINT IF EXISTS "analysis_subscriptions_user_id_fk";

-- ============================================================================
-- PHASE 10: Enterprise and Orders
-- ============================================================================

ALTER TABLE "guided_analysis_orders" DROP CONSTRAINT IF EXISTS "guided_analysis_orders_project_id_fk";
ALTER TABLE "guided_analysis_orders" DROP CONSTRAINT IF EXISTS "guided_analysis_orders_user_id_fk";

-- ============================================================================
-- PHASE 9: Pricing and Billing
-- ============================================================================

ALTER TABLE "eligibility_checks" DROP CONSTRAINT IF EXISTS "eligibility_checks_user_id_fk";
ALTER TABLE "cost_estimates" DROP CONSTRAINT IF EXISTS "cost_estimates_journey_id_fk";
ALTER TABLE "cost_estimates" DROP CONSTRAINT IF EXISTS "cost_estimates_user_id_fk";

-- ============================================================================
-- PHASE 8: Conversation and Journey Tracking
-- ============================================================================

ALTER TABLE "journey_step_progress" DROP CONSTRAINT IF EXISTS "journey_step_progress_journey_id_fk";
ALTER TABLE "journeys" DROP CONSTRAINT IF EXISTS "journeys_project_id_fk";
ALTER TABLE "journeys" DROP CONSTRAINT IF EXISTS "journeys_user_id_fk";
ALTER TABLE "conversation_states" DROP CONSTRAINT IF EXISTS "conversation_states_user_id_fk";
ALTER TABLE "conversation_states" DROP CONSTRAINT IF EXISTS "conversation_states_project_id_fk";

-- ============================================================================
-- PHASE 7: Audience Profiles and Artifacts
-- ============================================================================

ALTER TABLE "generated_artifacts" DROP CONSTRAINT IF EXISTS "generated_artifacts_audience_profile_id_fk";
ALTER TABLE "generated_artifacts" DROP CONSTRAINT IF EXISTS "generated_artifacts_template_id_fk";
ALTER TABLE "generated_artifacts" DROP CONSTRAINT IF EXISTS "generated_artifacts_project_id_fk";
ALTER TABLE "audience_profiles" DROP CONSTRAINT IF EXISTS "audience_profiles_user_id_fk";

-- ============================================================================
-- PHASE 6: Dataset Versioning
-- ============================================================================

ALTER TABLE "dataset_versions" DROP CONSTRAINT IF EXISTS "dataset_versions_dataset_id_fk";

-- ============================================================================
-- PHASE 5: Streaming and Scraping Sources
-- ============================================================================

ALTER TABLE "scraping_runs" DROP CONSTRAINT IF EXISTS "scraping_runs_artifact_id_fk";
ALTER TABLE "scraping_runs" DROP CONSTRAINT IF EXISTS "scraping_runs_job_id_fk";
ALTER TABLE "scraping_jobs" DROP CONSTRAINT IF EXISTS "scraping_jobs_dataset_id_fk";
ALTER TABLE "stream_checkpoints" DROP CONSTRAINT IF EXISTS "stream_checkpoints_source_id_fk";
ALTER TABLE "stream_chunks" DROP CONSTRAINT IF EXISTS "stream_chunks_dataset_id_fk";
ALTER TABLE "streaming_sources" DROP CONSTRAINT IF EXISTS "streaming_sources_dataset_id_fk";

-- ============================================================================
-- PHASE 4: Agent and Workflow Tracking
-- ============================================================================

ALTER TABLE "data_uploads" DROP CONSTRAINT IF EXISTS "data_uploads_project_id_fk";
ALTER TABLE "service_workflows" DROP CONSTRAINT IF EXISTS "service_workflows_project_id_fk";
ALTER TABLE "decision_audits" DROP CONSTRAINT IF EXISTS "decision_audits_project_id_fk";
ALTER TABLE "agent_checkpoints" DROP CONSTRAINT IF EXISTS "agent_checkpoints_project_id_fk";

-- ============================================================================
-- PHASE 3: Project Artifacts and Workflow
-- ============================================================================

ALTER TABLE "project_artifacts" DROP CONSTRAINT IF EXISTS "project_artifacts_created_by_fk";
ALTER TABLE "project_artifacts" DROP CONSTRAINT IF EXISTS "project_artifacts_parent_artifact_id_fk";
ALTER TABLE "project_artifacts" DROP CONSTRAINT IF EXISTS "project_artifacts_project_id_fk";

-- ============================================================================
-- PHASE 2: Project-Dataset Relationships
-- ============================================================================

ALTER TABLE "project_datasets" DROP CONSTRAINT IF EXISTS "project_datasets_dataset_id_fk";
ALTER TABLE "project_datasets" DROP CONSTRAINT IF EXISTS "project_datasets_project_id_fk";

-- ============================================================================
-- PHASE 1: Core Entity Relationships
-- ============================================================================

ALTER TABLE "datasets" DROP CONSTRAINT IF EXISTS "datasets_owner_id_fk";
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_user_id_fk";
ALTER TABLE "user_permissions" DROP CONSTRAINT IF EXISTS "user_permissions_user_id_fk";

-- ============================================================================
-- Verification: Confirm All FKs Removed
-- ============================================================================

SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- Expected: 0 foreign key constraints (if rolled back completely)
