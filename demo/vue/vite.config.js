import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var umamiServerOrigin = env.VITE_UMAMI_SERVER_ORIGIN || 'http://localhost:3000';
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
