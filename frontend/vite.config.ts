import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_BACKEND_TARGET || 'http://127.0.0.1:8000';
  const port = Number(env.VITE_PORT || 5173);

  return {
    plugins: [react()],
    cacheDir: './.vite_cache',
    server: {
      port,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true
        }
      }
    },
    test: {
      environment: 'jsdom'
    }
  };
});
