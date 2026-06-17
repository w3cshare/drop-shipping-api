import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxy = env.VITE_API_BASE_URL || 'http://localhost:3000';

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
        },
        '/auth': {
          target: apiProxy,
          changeOrigin: true,
        },
        '/user': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: '../dist-webapp',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            shopify: ['@shopify/app-bridge', '@shopify/app-bridge-utils'],
          },
        },
      },
    },
  };
});
