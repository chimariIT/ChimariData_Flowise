import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
  },
  projects: [
    {
      test: {
        name: 'client',
        environment: 'jsdom',
        setupFiles: ['vitest.setup.ts'],
        globals: true,
        include: [
          'client/src/__tests__/**/*.test.ts',
          'client/src/__tests__/**/*.test.tsx',
        ],
      },
    },
    {
      test: {
        name: 'server',
        environment: 'node',
        globals: true,
        include: [
          'tests/**/*.test.ts',
        ],
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
  },
});
