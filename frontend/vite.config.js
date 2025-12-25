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
