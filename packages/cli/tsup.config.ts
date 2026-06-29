import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: ['@doclient/core', '@doclient/renderer-go', 'tsx'],
});
