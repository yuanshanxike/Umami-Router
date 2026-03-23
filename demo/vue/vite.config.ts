import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const umamiServerOrigin = env.VITE_UMAMI_SERVER_ORIGIN || 'http://localhost:3000';

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@umami_router/sdk/vue': resolve(__dirname, '../../sdk/src/vue/index.ts'),
      },
    },
    server: {
      port: 3001,
      proxy: {
        '/trpc': {
          target: umamiServerOrigin,
          changeOrigin: true,
        },
        '/umami': {
          target: umamiServerOrigin,
          changeOrigin: true,
        },
      },
    },
  };
});
