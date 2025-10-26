-- Migration: 008_performance_indexes_minimal
-- Purpose: Add critical performance indexes for existing tables
-- Safe version that only creates indexes on verified columns

-- =====================================================
-- SESSION MANAGEMENT INDEXES (NEW TABLE)
-- =====================================================

-- Session lookup by user and journey type (CRITICAL)
CREATE INDEX IF NOT EXISTS idx_project_sessions_user_journey
  ON project_sessions(user_id, journey_type);

-- Session expiration for cleanup
CREATE INDEX IF NOT EXISTS idx_project_sessions_expires
  ON project_sessions(expires_at);

-- Server validation status
CREATE INDEX IF NOT EXISTS idx_project_sessions_validated
  ON project_sessions(server_validated);

-- =====================================================
-- CONSULTATION PRICING INDEXES (NEW TABLE)
-- =====================================================

-- Active pricing tiers
CREATE INDEX IF NOT EXISTS idx_consultation_pricing_active
  ON consultation_pricing(is_active);

-- Consultation type lookup
CREATE INDEX IF NOT EXISTS idx_consultation_pricing_type
  ON consultation_pricing(consultation_type);

-- Sort order for display
CREATE INDEX IF NOT EXISTS idx_consultation_pricing_sort
  ON consultation_pricing(sort_order);

-- =====================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- =====================================================

ANALYZE project_sessions;
ANALYZE consultation_pricing;

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT 'Indexes created successfully' AS status,
       COUNT(*) AS index_count
FROM pg_indexes
WHERE indexname LIKE 'idx_project_sessions%'
   OR indexname LIKE 'idx_consultation_pricing%';
