import { defineConfig } from 'vitest/config';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';

// Load .env into the main process env. With pool: 'forks', child processes
// inherit process.env, ensuring DATABASE_URL is available when server/db.ts
// is first imported.
const envPath = path.resolve(__dirname, '.env');
const testEnvPath = path.resolve(__dirname, '.env.test');
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
}
if (existsSync(testEnvPath)) {
  loadEnv({ path: testEnvPath, override: true });
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    pool: 'forks',
    setupFiles: ['vitest.backend.setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'server/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/client/**',
    ],
    testTimeout: 20000, // 20 seconds for integration tests
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@server': path.resolve(__dirname, 'server'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
  },
});
