-- Migration: Add user roles and permissions system
-- Description: Adds user role fields to users table and creates user permissions table

-- Add user role and journey preference columns to users table
ALTER TABLE users
ADD COLUMN user_role VARCHAR(50) DEFAULT 'non-tech',
ADD COLUMN technical_level VARCHAR(20) DEFAULT 'beginner',
ADD COLUMN industry VARCHAR(100),
ADD COLUMN preferred_journey VARCHAR(50),
ADD COLUMN journey_completions JSONB,
ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;

-- Create user permissions table
CREATE TABLE user_permissions (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Journey access permissions
  can_access_non_tech_journey BOOLEAN DEFAULT true,
  can_access_business_journey BOOLEAN DEFAULT false,
  can_access_technical_journey BOOLEAN DEFAULT false,
  can_request_consultation BOOLEAN DEFAULT true,

  -- Feature permissions
  can_access_advanced_analytics BOOLEAN DEFAULT false,
  can_use_custom_ai_keys BOOLEAN DEFAULT false,
  can_generate_code BOOLEAN DEFAULT false,
  can_access_raw_data BOOLEAN DEFAULT false,
  can_export_results BOOLEAN DEFAULT true,

  -- Resource limits
  max_concurrent_projects INTEGER DEFAULT 1,
  max_dataset_size_mb INTEGER DEFAULT 5,
  max_ai_queries_per_month INTEGER DEFAULT 10,
  max_visualizations_per_project INTEGER DEFAULT 3,

  -- AI service permissions
  allowed_ai_providers JSONB DEFAULT '["gemini"]',
  can_use_advanced_models BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for performance
CREATE INDEX user_permission_idx ON user_permissions(user_id);

-- Update existing users to have default non-tech role
UPDATE users
SET
  user_role = 'non-tech',
  technical_level = 'beginner',
  onboarding_completed = false
WHERE user_role IS NULL;

-- Add comments for documentation
COMMENT ON TABLE user_permissions IS 'Stores role-based permissions and limits for users';
COMMENT ON COLUMN users.user_role IS 'User role: non-tech, business, technical, consultation';
COMMENT ON COLUMN users.technical_level IS 'Technical experience level: beginner, intermediate, advanced, expert';
COMMENT ON COLUMN users.industry IS 'User industry for tailored templates and insights';
COMMENT ON COLUMN users.preferred_journey IS 'Last selected or preferred journey type';
COMMENT ON COLUMN users.journey_completions IS 'JSON object tracking completed journeys and their results';
COMMENT ON COLUMN users.onboarding_completed IS 'Whether user has completed the role selection onboarding';