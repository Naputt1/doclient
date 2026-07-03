# @doclient/core

## 0.0.3

### Patch Changes

- **breaking**: `staticModules` config type changed from `string[]` to `StaticModulesConfig` (`{ values: string[]; segment?: number }`). The `segment` field lets users pick which dot-delimited segment of `fullApiName` to match against (defaults to `-1`, the last segment). Removes the fragile `split('.')[1]` hardcode in `filterByStaticModules` and fails loudly on out-of-bounds segment indices.

## 0.0.2

### Patch Changes

- fix: include dist/ directory in published packages

## 0.0.1

### Patch Changes

- d1ed866: init
