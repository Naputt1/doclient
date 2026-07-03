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
import { profile } from './my-platform-profile';

export default defineConfig({
  source: mySourceAdapter, // implement { name, execute(config) => IR }
  profile,
  packageName: 'gomypkg',
  module: 'github.com/user/api',
  outputDir: './output',
  // Optional: type overrides, enum definitions, API ignores, etc.
});
```

Generate scaffolding for a new platform:

```bash
doclient scaffold
```

This creates `templates/client.go`, `templates/auth.go`, `go_lsp_stubs.go` (for Go LSP), and runs `go mod tidy`.

Run the pipeline:

```bash
doclient
```

---

## CLI Usage

```
doclient [options]
doclient scaffold --profile <path> [options]

Options:
  -c, --config <path>   Config file path (default: doclient.config.ts)
  --out-dir <path>      Override output directory
  --cache               Cache API responses in .doclient-cache
  -h, --help            Show help

Scaffold:
  doclient scaffold
    Generate LSP stubs and template boilerplate for a platform profile.
    --profile, -p  Path to profile file (default: doclient.config.ts)
    --dir, -d      Output directory (default: templates/ next to profile)
    --module, -m   Go module path (generates go.mod + go mod tidy)
```

---

## Configuration

The config file supports:

| Option               | Type                     | Description                             |
| -------------------- | ------------------------ | --------------------------------------- |
| `source`             | `SourceAdapter`          | Fetches and normalizes API docs into IR |
| `output`             | `Renderer`               | Renderer instance (mutually exclusive with `profile`) |
| `profile`            | `ProfileConfig`          | Platform profile config (mutually exclusive with `output`) |
| `packageName`        | `string`                 | Go package name (used with `profile`)   |
| `module`             | `string`                 | Go module path (used with `profile`)    |
| `outputDir`          | `string`                 | Output directory                        |
| `typeMappings`       | `Record<string, string>` | Override param type → Go type           |
| `structTypeMappings` | `Record<string, string>` | Override struct type references         |
| `enumDefs`           | `EnumDef[]`              | Define enums with allowed values        |
| `ignoreApis`         | `string[]`               | Skip specific API endpoints             |
| `ignoreModules`      | `string[]`               | Skip entire modules                     |
| `staticModules`      | `ModuleDef[]`            | Inject static API definitions           |

See [`examples/shopee-go/shopee-go.config.ts`](examples/shopee-go/shopee-go.config.ts) for a complete example.

---

## Platform Profiles

Platform-specific behavior is defined through a **profile** — a declarative config object created with `defineProfile()`:

```ts
import { defineProfile, loadTemplate } from '@doclient/renderer-go';

const clientTpl = loadTemplate('./templates/client.go');
const authTpl = loadTemplate('./templates/auth.go');

export const profile = defineProfile({
  name: 'my-platform',
  responseDataFieldName: 'data',
  commonFields: ['code', 'msg', 'request_id'],
  baseResponseFields: [/* ... */],

  // Platform templates live in .go files (Go LSP works on them)
  renderClientFile: (pkg, services, init) =>
    clientTpl.render({ PACKAGE_NAME: pkg, SERVICES_SECTION: services, SERVICES_INIT_SECTION: init }),
  renderAuthFile: (pkg) => authTpl.render({ PACKAGE_NAME: pkg }),
});
```

### Go Template Markers

Template `.go` files use two marker styles, both syntactically valid Go:

| Marker | Syntax | Example | Replacement |
|--------|--------|---------|-------------|
| **Inline** | `__UPPERCASE_NAME__` | `package __PACKAGE_NAME__` | Replaced inline with the value |
| **Comment line** | `// @UPPERCASE_NAME` | `// @SERVICES_SECTION` | Entire comment line replaced with the value (for multi-line insertions) |

### Service Styles

| Style | Description |
|-------|-------------|
| `direct` (default) | Extra auth params passed to every client method (e.g. Shopee: `sid, tok`). Simple call pattern. |
| `wrapper` | Response wrapper pattern — raw response parsed first, then data extracted and unmarshalled into the target type (e.g. Lazada). |

### LSP Support

Template directories include `go_lsp_stubs.go` (generated by `lspStubsText()`) which declares stubs for renderer-generated types (`BaseResponse`, `LeveledLogger`, `Option[T]`, etc.). The Go LSP resolves all type references without showing "undefined" errors.

---

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│  Source      │────▶│  IR         │────▶│  Renderer   │
│  Adapter     │     │(normalized) │     │  (Go code)  │
└──────────────┘     └─────────────┘     └─────────────┘
       │               │                       │
  open.shopee.com  Profile defines     goshopee/
  (or any API)    platform behavior    client, types, tests
                        │
              doclient scaffold
              generates templates, 
              stubs, and go.mod
```

The pipeline is fully extensible — write a `SourceAdapter` to scrape any API documentation, write a `PlatformProfile` to customize SDK generation, or write a `Renderer` to target any language.

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
