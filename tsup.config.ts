import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['packages/core/src/index.ts'],
    outDir: 'packages/core/dist',
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    entry: ['packages/renderer-go/src/index.ts'],
    outDir: 'packages/renderer-go/dist',
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    external: ['@doclient/core'],
  },
  {
    entry: ['packages/cli/src/cli.ts'],
    outDir: 'packages/cli/dist',
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    external: ['@doclient/core', '@doclient/renderer-go', 'tsx'],
  },
])
