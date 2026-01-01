import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

const resolvePort = (value: string | undefined) => {
  const parsed = Number(value);
  const port = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  return Number.isFinite(port) && port > 0 ? port : null;
};

const backendPort =
  resolvePort(process.env.BACKEND_PORT) ?? resolvePort(process.env.E2E_API_PORT) ?? 4000;

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test' || process.env.VITEST;
  const isAnalyze = mode === 'analyze';

  return {
    base: process.env.VITE_CDN_URL || '/',
    plugins: [
      react(),
      isAnalyze &&
        visualizer({
          open: true,
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true,
        }),
      !isTest &&
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
          manifest: {
            name: 'BaZi Master',
            short_name: 'BaZi',
            description:
              'Ancient Wisdom, Modern Insight. Professional BaZi, I-Ching, and Tarot Readings.',
            theme_color: '#0f172a',
            background_color: '#0f172a',
            display: 'standalone',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
              },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365, // < 1 year
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'gstatic-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365, // < 1 year
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /\/api\/.*\/history.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-history-cache',
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 * 24, // 24 hours
                  },
                  networkTimeoutSeconds: 5,
                },
              },
              {
                urlPattern: /\/api\/ai\/providers/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'api-ai-providers-cache',
                },
              },
            ],
          },
        }),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
      testTimeout: 10000,
      hookTimeout: 10000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // React and core libraries
            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')
            ) {
              return 'react-vendor';
            }

            // i18n libraries
            if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
              return 'i18n-vendor';
            }

            // Page components - split by route
            if (id.includes('/src/pages/')) {
              const pageName = id.split('/src/pages/')[1].split('.')[0].toLowerCase();
              return 'page-' + pageName;
            }

            // Large utility libraries
            if (id.includes('node_modules/date-fns') || id.includes('node_modules/lodash')) {
              return 'utils-vendor';
            }
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    server: isTest
      ? {
          middlewareMode: true,
          hmr: false,
          ws: false,
          watch: null,
        }
      : {
          port: 3000,
          host: '127.0.0.1',
          hmr: true,
          proxy: {
            '/api': {
              target: 'http://127.0.0.1:' + backendPort,
              changeOrigin: true,
            },
            '/ws': {
              target: 'http://127.0.0.1:' + backendPort,
              changeOrigin: true,
              ws: true,
            },
          },
        },
  };
});
