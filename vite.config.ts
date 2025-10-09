import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react';
            }
            if (id.includes('wouter') || id.includes('@tanstack/react-query')) {
              return 'routing';
            }
            if (id.includes('recharts') || id.includes('plotly')) {
              return 'charts';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            if (id.includes('zod')) {
              return 'validation';
            }
            return 'vendor';
          }
          
          // App chunks by feature
          if (id.includes('/pages/')) {
            if (id.includes('auth') || id.includes('login')) {
              return 'auth-pages';
            }
            if (id.includes('project') || id.includes('dashboard')) {
              return 'workspace-pages';
            }
            if (id.includes('pricing') || id.includes('checkout') || id.includes('pay-per')) {
              return 'commerce-pages';
            }
            if (id.includes('analysis') || id.includes('results') || id.includes('visualization')) {
              return 'analysis-pages';
            }
            return 'misc-pages';
          }
          
          if (id.includes('/components/')) {
            if (id.includes('ui/')) {
              return 'ui-components';
            }
            if (id.includes('analysis') || id.includes('chart') || id.includes('visualization')) {
              return 'analysis-components';
            }
            if (id.includes('workflow') || id.includes('wizard') || id.includes('journey')) {
              return 'workflow-components';
            }
            return 'app-components';
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
