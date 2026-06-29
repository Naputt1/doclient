import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: ['@doclient/core'],
});
