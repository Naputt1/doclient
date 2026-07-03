import { describe, it, expect } from 'vitest';
import { scaffoldClientText, scaffoldAuthText } from './scaffold-templates.js';

describe('scaffoldClientText', () => {
  it('returns Go source with markers intact', () => {
    const result = scaffoldClientText();
    expect(result).toContain('package __PACKAGE_NAME__');
    expect(result).toContain('// @SERVICES_SECTION');
    expect(result).toContain('// @SERVICES_INIT_SECTION');
    expect(result).toContain('type Client[T any] struct');
  });
});

describe('scaffoldAuthText', () => {
  it('returns Go source with package marker', () => {
    const result = scaffoldAuthText();
    expect(result).toContain('package __PACKAGE_NAME__');
  });

  it('contains auth interface and struct', () => {
    const result = scaffoldAuthText();
    expect(result).toContain('type AuthService interface');
    expect(result).toContain('type AuthServiceOp[T any] struct');
    expect(result).toContain('NewAuthServiceOp');
  });
});
