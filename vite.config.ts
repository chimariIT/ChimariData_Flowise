/**
 * Vite Configuration for ChimariData Frontend
 *
 * BACKEND ARCHITECTURE:
 * - Primary: Python FastAPI Backend on port 8000 (chimaridata-python-backend)
 * - Legacy: Node.js Express Backend on port 5000 (for rollback only)
 *
 * PROXY CONFIGURATION:
 * - All /api/* requests → http://localhost:8000 (Python backend)
 * - All /ws/* requests → ws://localhost:8000 (Python WebSocket)
 *
 * To switch back to Node.js backend:
 * 1. Change proxy targets to 'http://localhost:5000'
 * 2. Set VITE_USE_PYTHON_BACKEND=false in .env.development
 * 3. Run `npm run dev` to start both Node.js backend and frontend
 *
 * For Python-only mode:
 * 1. Start Python backend separately (see PYTHON_BACKEND_STARTUP.md)
 * 2. Run `npm run dev:frontend` (client only, no Node.js server)
 *
 * @see PYTHON_BACKEND_STARTUP.md for complete startup instructions
 * @see verify-python-backend.md for connection verification
 */

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
  envDir: path.resolve(import.meta.dirname),
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
            if (id.includes('@radix-ui')) {
              return 'radix-ui';
            }
            if (id.includes('zod')) {
              return 'validation';
            }
            if (id.includes('date-fns') || id.includes('lodash')) {
              return 'utilities';
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
      // ========================================================================
      // API Proxy - Routes all /api/* requests to Python FastAPI backend
      // ========================================================================
      // Python Backend (Primary): http://localhost:8000
      // - Swagger API Docs: http://localhost:8000/docs
      // - Health Check: http://localhost:8000/health
      //
      // To switch to Node.js backend (Legacy):
      // 1. Change target to 'http://localhost:5000'
      // 2. Set VITE_USE_PYTHON_BACKEND=false in .env.development
      // ========================================================================
      '/api': {
        target: 'http://localhost:8000',  // Python FastAPI Backend (Primary)
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Explicitly preserve all headers, especially Authorization
            if (req.headers.authorization) {
              proxyReq.setHeader('Authorization', req.headers.authorization);
            }
            const forwardedAuthHeader = req.headers['x-forwarded-authorization'];
            if (typeof forwardedAuthHeader === 'string') {
              proxyReq.setHeader('X-Forwarded-Authorization', forwardedAuthHeader);
            } else if (Array.isArray(forwardedAuthHeader) && forwardedAuthHeader.length > 0) {
              proxyReq.setHeader('X-Forwarded-Authorization', forwardedAuthHeader[0]);
            }
            // Preserve other important headers
            if (req.headers['content-type']) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
            }
            if (req.headers['x-customer-context']) {
              proxyReq.setHeader('X-Customer-Context', req.headers['x-customer-context']);
            }
          });
        },
      },
      // ========================================================================
      // WebSocket Proxy - Routes all /ws/* connections to Python backend
      // ========================================================================
      // Python Backend WebSocket: ws://localhost:8000/ws
      //
      // To switch to Node.js backend (Legacy):
      // 1. Change target to 'ws://localhost:5000'
      // 2. Ensure Node.js backend is running with WebSocket enabled
      // ========================================================================
      '/ws': {
        target: 'ws://localhost:8000',  // Python Backend WebSocket (Primary)
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Suppress transient WebSocket connection errors
            if (err.message?.includes('ECONNREFUSED')) {
              console.log('[vite] WebSocket reconnecting...');
            } else {
              console.error('[vite] WebSocket proxy error:', err.message);
            }
          });
        },
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
