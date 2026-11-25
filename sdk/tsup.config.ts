import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: './src/index.ts',
      core: './src/core/index.ts',
      vue: './src/vue/index.ts',
      nextjs: './src/nextjs/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    skipNodeModulesBundle: true,
    external: ['react', 'react-dom', 'next', 'vue'],
  },
  {
    entry: {
      browser: './src/core/browser.ts',
    },
    format: ['iife'],
    platform: 'browser',
    minify: true,
    dts: false,
    sourcemap: false,
    clean: false,
    noExternal: [/.*/],
  },
]);
