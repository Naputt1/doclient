<div align="center">

# doclient

**API documentation scraper + typed SDK generator**

Scrape API docs from any source — generate a fully-typed Go client library.

[![CI](https://github.com/naputt1/doclient/actions/workflows/ci.yml/badge.svg)](https://github.com/naputt1/doclient/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@doclient/cli)](https://www.npmjs.com/package/@doclient/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Overview

doclient is a **pluggable pipeline** that converts API documentation into a production-ready SDK:

1. **Source Adapter** scrapes endpoint definitions, types, enums, and errors from an API docs site
2. **Intermediate Representation (IR)** normalizes the data into a structured format
3. **Renderer** generates a fully-typed HTTP client in the target language

The included `@doclient/renderer-go` produces a complete Go SDK with:

- Type-safe request/response structs
- HMAC-SHA256 signature support
- Automatic access-token refresh
- Rate-limit handling with retry logic
- Multipart upload support
- Test scaffolding (`httpmock`-based unit tests)

> **Current target:** [Shopee Open Platform](https://open.shopee.com) → Go SDK  
> **Extensible:** Write your own source adapter or renderer for any API or language.

---

## Packages

| Package                 | Description                                                   | npm                                                                                                               |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@doclient/core`        | Core types, IR, pipeline orchestration, caching               | [![npm](https://img.shields.io/npm/v/@doclient/core)](https://www.npmjs.com/package/@doclient/core)               |
| `@doclient/cli`         | CLI entry point — loads config, runs pipeline, formats output | [![npm](https://img.shields.io/npm/v/@doclient/cli)](https://www.npmjs.com/package/@doclient/cli)                 |
| `@doclient/renderer-go` | Go code renderer — generates complete SDK from IR             | [![npm](https://img.shields.io/npm/v/@doclient/renderer-go)](https://www.npmjs.com/package/@doclient/renderer-go) |

---

## Quick Start

```bash
# Install the CLI
pnpm add -g @doclient/cli

# Or via npm
npm install -g @doclient/cli
```

Create a `doclient.config.ts`:

```ts
import { defineConfig } from '@doclient/cli';
import { createGoRenderer } from '@doclient/renderer-go';

export default defineConfig({
  source: mySourceAdapter, // implement { name, execute(config) => IR }
  renderer: createGoRenderer(),
  outputDir: './output',
  module: 'github.com/user/api',
  // Optional: type overrides, enum definitions, API ignores, etc.
});
```

Run:

```bash
doclient
```

---

## CLI Usage

```
doclient [options]

Options:
  -c, --config <path>   Config file path (default: doclient.config.ts)
  --out-dir <path>      Override output directory
  --cache               Cache API responses in .doclient-cache
  -h, --help            Show help
```

---

## Configuration

The config file supports:

| Option               | Type                     | Description                             |
| -------------------- | ------------------------ | --------------------------------------- |
| `source`             | `SourceAdapter`          | Fetches and normalizes API docs into IR |
| `renderer`           | `Renderer`               | Generates SDK code from IR              |
| `outputDir`          | `string`                 | Output directory                        |
| `module`             | `string`                 | Go module path                          |
| `typeMappings`       | `Record<string, string>` | Override param type → Go type           |
| `structTypeMappings` | `Record<string, string>` | Override struct type references         |
| `enumDefs`           | `EnumDef[]`              | Define enums with allowed values        |
| `ignoreApis`         | `string[]`               | Skip specific API endpoints             |
| `ignoreModules`      | `string[]`               | Skip entire modules                     |
| `staticModules`      | `ModuleDef[]`            | Inject static API definitions           |

See [`examples/shopee-go/shopee-go.config.ts`](examples/shopee-go/shopee-go.config.ts) for a complete example.

---

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│  Source      │────▶│  IR         │────▶│  Renderer   │
│  Adapter     │     │(normalized) │     │  (Go code)  │
└──────────────┘     └─────────────┘     └─────────────┘
       │                                          │
  open.shopee.com                            goshopee/
  (or any API docs)                     client, types, tests
```

The pipeline is fully extensible — write a `SourceAdapter` to scrape any API documentation, or write a `Renderer` to target any language.

---

## Development

```bash
# Clone and install
git clone https://github.com/naputt1/doclient.git
cd doclient
pnpm install

# Build all packages
pnpm build

# Type-check
pnpm typecheck

# Lint and format
pnpm lint
pnpm format

# Run tests
pnpm test

# Generate the Shopee Go SDK (example)
pnpm generate
```

### Project Structure

```
doclient/
├── packages/
│   ├── cli/           # CLI tool
│   ├── core/          # Core types and pipeline
│   └── renderer-go/   # Go code renderer
├── examples/
│   └── shopee-go/     # Shopee Open Platform example
├── output/            # Generated Go SDK
└── ...
```

---

## License

[MIT](LICENSE)
