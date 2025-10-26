-- Rollback Migration: Remove consultation_proposals table
-- Date: 2025-01-14

-- Remove indexes
DROP INDEX IF EXISTS projects_consultation_proposal_idx;
DROP INDEX IF EXISTS consultation_proposals_project_id_idx;
DROP INDEX IF EXISTS consultation_proposals_assigned_admin_idx;
DROP INDEX IF EXISTS consultation_proposals_status_idx;
DROP INDEX IF EXISTS consultation_proposals_user_id_idx;

-- Remove column from projects
ALTER TABLE projects 
DROP COLUMN IF EXISTS consultation_proposal_id;

-- Remove table
DROP TABLE IF EXISTS consultation_proposals;

-- Note: We don't remove is_admin from users as it might be used elsewhere
