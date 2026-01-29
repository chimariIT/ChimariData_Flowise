import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const baseEnv = join(root, '.env');
const testEnv = join(root, '.env.test');

if (existsSync(baseEnv)) {
  loadEnv({ path: baseEnv });
}

if (existsSync(testEnv)) {
  loadEnv({ path: testEnv, override: true });
}

// Ensure backend integration tests keep agent coordination responsive without
// relying on mocks. Real broker/task-queue paths stay active, but we cap their
// round-trip wait so Vitest hooks don't stall for the 30s production default.
if (!process.env.AGENT_RESPONSE_TIMEOUT_MS) {
  process.env.AGENT_RESPONSE_TIMEOUT_MS = '500';
}

// Initialize database connection now that .env is loaded.
// server/db.ts defers initialization in test mode so that DATABASE_URL
// is available from dotenv before the pool is created.
import { initializeDb } from './server/db';
initializeDb();

