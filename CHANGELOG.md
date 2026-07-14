# Changelog

## 0.0.3 (2026-07-14)

### Added
- `ptr.go` generation — generic `Ptr[T any](v T) *T` helper function
- CHANGELOG.md

### Fixed
- Missing `.d.ts` files in npm package (tsup `dts: true` now properly included in publish)
- Shopee `NewfileUploadRequest` missing `merchant_id` in signature

### Changed
- Refactored `createGoRenderer` to profile-based architecture
  - New: `createGoRenderer(profile, options?)`
  - Old: `createGoRenderer(options)`
  - See `examples/shopee-go/profile.ts` for migration guide
- Client retry logic: `doGetHeaders` now respects retry count properly
- `defineProfile`, `loadTemplate`, `PlatformProfile` exported from `@doclient/renderer-go`
- Split API name handling — `segment` option in `staticModules`

## 0.0.2 (2026-06-13)

### Added
- Go module generation with `go.mod`
- HTTP/2 support with concurrent-safe client
- Context timeout for all API routes
- File upload support (multipart)
- Fixture caching with `.doclient-cache/`
- TypeScript config via `defineConfig()`

### Fixed
- Various type mapping edge cases

## 0.0.1 (2026-05-24)

### Added
- Initial release
- Go struct generation with type overrides
- Per-service interface + implementation files
- Request/response type files
- Error constants generation
- Enum type definitions
- Test file generation with `httpmock`
- Shopee source adapter
