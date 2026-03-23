import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: './src/index.ts',
    vue: './src/vue/index.ts',
    nextjs: './src/nextjs/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  external: ['react', 'react-dom', 'next', 'vue'],
});
