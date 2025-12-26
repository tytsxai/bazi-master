import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvePort = (value) => {
  const parsed = Number(value);
  const port = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  return Number.isFinite(port) && port > 0 ? port : null;
};

const backendPort =
  resolvePort(process.env.BACKEND_PORT) ?? resolvePort(process.env.E2E_API_PORT) ?? 4000;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React and core libraries
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) {
            return 'react-vendor';
          }

          // i18n libraries
          if (id.includes('node_modules/i18next') ||
              id.includes('node_modules/react-i18next')) {
            return 'i18n-vendor';
          }

          // Page components - split by route
          if (id.includes('/src/pages/')) {
            const pageName = id.split('/src/pages/')[1].split('.')[0].toLowerCase();
            return `page-${pageName}`;
          }

          // Large utility libraries
          if (id.includes('node_modules/date-fns') ||
              id.includes('node_modules/lodash')) {
            return 'utils-vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 3000,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
