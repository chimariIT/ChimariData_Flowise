import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../shared/schema';

// Create SQLite database and schema
const sqlite = new Database('dev.db');
const db = drizzle(sqlite, { schema });

// Create tables manually
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT,
    first_name TEXT,
    last_name TEXT,
    profile_image_url TEXT,
    provider TEXT NOT NULL DEFAULT 'email',
    provider_id TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_verification_token TEXT,
    email_verification_expires INTEGER,
    password_reset_token TEXT,
    password_reset_expires INTEGER,
    subscription_tier TEXT DEFAULT 'none',
    subscription_status TEXT DEFAULT 'active',
    technical_level TEXT DEFAULT 'beginner',
    preferred_journey TEXT,
    monthly_uploads INTEGER NOT NULL DEFAULT 0,
    monthly_data_volume INTEGER NOT NULL DEFAULT 0,
    monthly_ai_insights INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    journey_type TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    file_size INTEGER,
    record_count INTEGER,
    schema_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    dataset_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content_json TEXT,
    file_path TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS agent_checkpoints (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    checkpoint_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    title TEXT NOT NULL,
    description TEXT,
    artifacts_json TEXT,
    user_response TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

console.log('✅ SQLite database schema created successfully');

export { db };
