-- Migration: Create consultation_proposals table
-- Date: 2025-01-14
-- Description: Adds proposal-based workflow for consultation journey

-- Create consultation proposals table
CREATE TABLE IF NOT EXISTS consultation_proposals (
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL,
  
  -- Submission fields
  goal TEXT NOT NULL,
  business_questions JSONB,
  has_data BOOLEAN DEFAULT FALSE,
  data_description TEXT,
  
  -- Proposal fields
  estimated_cost INTEGER,
  estimated_timeline TEXT,
  scope_of_work TEXT,
  deliverables JSONB,
  methodology TEXT,
  
  -- Status workflow
  status VARCHAR NOT NULL DEFAULT 'draft',
  
  -- Payment tracking
  deposit_paid BOOLEAN DEFAULT FALSE,
  deposit_amount INTEGER,
  deposit_payment_intent_id VARCHAR,
  final_cost INTEGER,
  final_bill_approved_by_admin BOOLEAN DEFAULT FALSE,
  final_bill_approved_at TIMESTAMP,
  final_payment_intent_id VARCHAR,
  final_paid BOOLEAN DEFAULT FALSE,
  final_paid_at TIMESTAMP,
  
  -- Admin assignment
  assigned_admin_id VARCHAR,
  assigned_at TIMESTAMP,
  admin_notes TEXT,
  
  -- Timestamps
  submitted_at TIMESTAMP,
  proposed_at TIMESTAMP,
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  completed_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS consultation_proposals_user_id_idx 
  ON consultation_proposals(user_id);

CREATE INDEX IF NOT EXISTS consultation_proposals_status_idx 
  ON consultation_proposals(status);

CREATE INDEX IF NOT EXISTS consultation_proposals_assigned_admin_idx 
  ON consultation_proposals(assigned_admin_id);

CREATE INDEX IF NOT EXISTS consultation_proposals_project_id_idx 
  ON consultation_proposals(project_id);

-- Add consultation_proposal_id to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS consultation_proposal_id VARCHAR 
REFERENCES consultation_proposals(id);

CREATE INDEX IF NOT EXISTS projects_consultation_proposal_idx 
  ON projects(consultation_proposal_id);

-- Add is_admin flag to users table if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add comments
COMMENT ON TABLE consultation_proposals IS 'Stores consultation journey proposals with deposit and final billing workflow';
COMMENT ON COLUMN consultation_proposals.status IS 'Workflow: draft → proposed → accepted/rejected → in_progress → completed → delivered';
COMMENT ON COLUMN consultation_proposals.deposit_amount IS 'Always 10% of estimated_cost';
COMMENT ON COLUMN projects.consultation_proposal_id IS 'Links project to consultation proposal for proposal-based workflows';
