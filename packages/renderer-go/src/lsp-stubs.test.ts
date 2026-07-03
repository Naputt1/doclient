import { describe, it, expect } from 'vitest';
import { lspStubsText } from './lsp-stubs.js';

describe('lspStubsText', () => {
  it('returns Go source with package placeholder', () => {
    const result = lspStubsText();
    expect(result).toContain('package __PACKAGE_NAME__');
  });

  it('returns Go source with common types', () => {
    const result = lspStubsText();
    expect(result).toContain('type BaseResponse struct');
    expect(result).toContain('type LeveledLoggerInterface interface');
  });

  it('accepts service style parameter', () => {
    const result = lspStubsText('direct');
    expect(result).toContain('package __PACKAGE_NAME__');
  });
});
