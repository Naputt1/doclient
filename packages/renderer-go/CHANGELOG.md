# @doclient/renderer-go

## 0.0.2

### Patch Changes

- feat: declarative `defineProfile()` API with `ProfileConfig` — platform profiles are now 20-40 lines of config
- feat: Go-native template files with marker syntax (`__PACKAGE_NAME__` inline, `// @SERVICES_SECTION` comment markers) — syntactically valid Go for LSP support
- feat: `loadTemplate()` with auto-resolving relative paths via V8 stack API (no `import.meta.url` boilerplate)
- feat: `lspStubsText()` — generates `go_lsp_stubs.go` with stubs for renderer-generated types to eliminate LSP "undefined" errors
- feat: `initGoModule()` — writes `go.mod` with profile dependencies and runs `go mod tidy`
- feat: scaffold templates (`scaffoldClientText()`, `scaffoldAuthText()`) — generic client/auth Go templates as starting points
- feat: service styles — `direct` (extra params passed to client methods) and `wrapper` (response wrapper pattern)
- feat: DTS generation (`tsup dts: true`) — declaration files for proper TypeScript resolution
- feat: `lsp-stubs.go` source file — canonical Go stub source, validated by `gofmt`, copied to `dist/` at build time
- fix: `ProfileConfig.renderClientFile` parameter types infer properly (no implicit `any`)
- chore: bundle size 61KB → 36KB (removed built-in Shopee/Lazada templates)
- fix: include dist/ directory in published packages
- Updated dependencies
  - @doclient/core@0.0.2

## 0.0.1

### Patch Changes

- d1ed866: init
- Updated dependencies [d1ed866]
  - @doclient/core@0.0.1
