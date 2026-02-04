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
      '/api': {
        target: 'http://localhost:5000',  // Must match PORT in .env
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
      '/ws': {
        target: 'ws://localhost:5000',  // Must match PORT in .env
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
