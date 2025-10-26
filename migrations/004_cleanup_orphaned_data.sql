-- Pre-Migration Cleanup: Find and Handle Orphaned Data
-- Date: January 16, 2025
-- Purpose: Clean up orphaned records before adding foreign key constraints
-- IMPORTANT: Review the output before running the DELETE statements

-- ============================================================================
-- STEP 1: FIND ORPHANED DATA (READ-ONLY QUERIES)
-- ============================================================================

-- Find orphaned user permissions (user_id not in users)
SELECT 'user_permissions' as table_name, COUNT(*) as orphaned_count
FROM user_permissions up
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = up.user_id);

-- Find orphaned projects (user_id not in users)
SELECT 'projects (by user_id)' as table_name, COUNT(*) as orphaned_count
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id);

-- Find orphaned datasets (owner_id not in users)
SELECT 'datasets' as table_name, COUNT(*) as orphaned_count
FROM datasets d
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.owner_id);

-- Find orphaned project_datasets (project_id not in projects)
SELECT 'project_datasets (by project_id)' as table_name, COUNT(*) as orphaned_count
FROM project_datasets pd
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = pd.project_id);

-- Find orphaned project_datasets (dataset_id not in datasets)
SELECT 'project_datasets (by dataset_id)' as table_name, COUNT(*) as orphaned_count
FROM project_datasets pd
WHERE NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = pd.dataset_id);

-- Find orphaned project_artifacts (project_id not in projects)
SELECT 'project_artifacts' as table_name, COUNT(*) as orphaned_count
FROM project_artifacts pa
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = pa.project_id);

-- Find orphaned agent_checkpoints (project_id not in projects)
SELECT 'agent_checkpoints' as table_name, COUNT(*) as orphaned_count
FROM agent_checkpoints ac
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = ac.project_id);

-- Find orphaned decision_audits (project_id not in projects)
SELECT 'decision_audits' as table_name, COUNT(*) as orphaned_count
FROM decision_audits da
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = da.project_id);

-- Find orphaned streaming_sources (dataset_id not in datasets)
SELECT 'streaming_sources' as table_name, COUNT(*) as orphaned_count
FROM streaming_sources ss
WHERE NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = ss.dataset_id);

-- Find orphaned scraping_jobs (dataset_id not in datasets)
SELECT 'scraping_jobs' as table_name, COUNT(*) as orphaned_count
FROM scraping_jobs sj
WHERE NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = sj.dataset_id);

-- Find orphaned journeys (user_id not in users)
SELECT 'journeys' as table_name, COUNT(*) as orphaned_count
FROM journeys j
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = j.user_id);

-- Find orphaned conversation_states (user_id not in users)
SELECT 'conversation_states' as table_name, COUNT(*) as orphaned_count
FROM conversation_states cs
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = cs.user_id);

-- ============================================================================
-- STEP 2: DETAILED ORPHAN REPORTS (For Manual Review)
-- ============================================================================

-- Orphaned Projects Details
SELECT
    p.id,
    p.user_id,
    p.name,
    p.created_at,
    'Missing user: ' || p.user_id as issue
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id)
ORDER BY p.created_at DESC
LIMIT 20;

-- Orphaned Datasets Details
SELECT
    d.id,
    d.owner_id,
    d.original_file_name,
    d.created_at,
    'Missing owner: ' || d.owner_id as issue
FROM datasets d
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.owner_id)
ORDER BY d.created_at DESC
LIMIT 20;

-- Orphaned Project Artifacts Details
SELECT
    pa.id,
    pa.project_id,
    pa.type,
    pa.created_at,
    'Missing project: ' || pa.project_id as issue
FROM project_artifacts pa
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = pa.project_id)
ORDER BY pa.created_at DESC
LIMIT 20;

-- ============================================================================
-- STEP 3: CLEANUP OPTIONS
-- ============================================================================

-- OPTION A: Delete all orphaned records (DESTRUCTIVE)
-- CAUTION: Review the counts from STEP 1 before uncommenting these

-- Delete orphaned user_permissions
-- DELETE FROM user_permissions
-- WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_permissions.user_id);

-- Delete orphaned projects
-- DELETE FROM projects
-- WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = projects.user_id);

-- Delete orphaned datasets
-- DELETE FROM datasets
-- WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = datasets.owner_id);

-- Delete orphaned project_datasets
-- DELETE FROM project_datasets
-- WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = project_datasets.project_id)
--    OR NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = project_datasets.dataset_id);

-- Delete orphaned project_artifacts
-- DELETE FROM project_artifacts
-- WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = project_artifacts.project_id);

-- Delete orphaned agent_checkpoints
-- DELETE FROM agent_checkpoints
-- WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = agent_checkpoints.project_id);

-- Delete orphaned decision_audits
-- DELETE FROM decision_audits
-- WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = decision_audits.project_id);

-- Delete orphaned streaming_sources
-- DELETE FROM streaming_sources
-- WHERE NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = streaming_sources.dataset_id);

-- Delete orphaned scraping_jobs
-- DELETE FROM scraping_jobs
-- WHERE NOT EXISTS (SELECT 1 FROM datasets d WHERE d.id = scraping_jobs.dataset_id);

-- Delete orphaned journeys
-- DELETE FROM journeys
-- WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = journeys.user_id);

-- Delete orphaned conversation_states
-- DELETE FROM conversation_states
-- WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = conversation_states.user_id);

-- ============================================================================
-- OPTION B: Create a system user and reassign orphaned records (SAFER)
-- ============================================================================

-- Uncomment and modify these if you want to preserve orphaned data

-- Create a system user to own orphaned records
-- INSERT INTO users (id, email, first_name, last_name, provider, subscription_tier)
-- VALUES ('system-user-id', 'system@chimaridata.com', 'System', 'User', 'email', 'enterprise')
-- ON CONFLICT (id) DO NOTHING;

-- Reassign orphaned projects to system user
-- UPDATE projects
-- SET user_id = 'system-user-id'
-- WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = projects.user_id);

-- Reassign orphaned datasets to system user
-- UPDATE datasets
-- SET owner_id = 'system-user-id'
-- WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = datasets.owner_id);

-- ============================================================================
-- STEP 4: VERIFY CLEANUP
-- ============================================================================

-- Run these after cleanup to verify no orphans remain
SELECT
    'user_permissions' as table_name,
    COUNT(*) as remaining_orphans
FROM user_permissions up
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = up.user_id)
UNION ALL
SELECT
    'projects',
    COUNT(*)
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id)
UNION ALL
SELECT
    'datasets',
    COUNT(*)
FROM datasets d
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.owner_id)
UNION ALL
SELECT
    'project_artifacts',
    COUNT(*)
FROM project_artifacts pa
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = pa.project_id);

-- Expected: All counts should be 0 after cleanup
