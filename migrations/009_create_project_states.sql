CREATE TABLE IF NOT EXISTS project_states (
    project_id VARCHAR PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_states_updated_at_idx ON project_states(updated_at);
