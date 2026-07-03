import { describe, it, expect } from 'vitest';
import { findProfileExport } from './scaffold.js';

describe('findProfileExport', () => {
  it('finds profile in default export.profile', () => {
    const mod = {
      default: {
        profile: { name: 'test', renderClientFile: () => '' },
        source: {},
      },
    };
    const result = findProfileExport(mod as never, 'test.ts');
    expect(result.name).toBe('test');
  });

  it('finds profile in default export directly if it has name', () => {
    const mod = {
      default: { name: 'test', renderClientFile: () => '' },
    };
    const result = findProfileExport(mod as never, 'test.ts');
    expect(result.name).toBe('test');
  });

  it('finds named export with renderClientFile', () => {
    const mod = {
      shopeeProfile: { name: 'shopee', renderClientFile: () => '' },
      default: {},
    };
    const result = findProfileExport(mod as never, 'test.ts');
    expect(result.name).toBe('shopee');
  });

  it('finds named export with just name if no renderClientFile found', () => {
    const mod = {
      someVar: 42,
      myProfile: { name: 'my-platform' },
      default: {},
    };
    const result = findProfileExport(mod as never, 'test.ts');
    expect(result.name).toBe('my-platform');
  });

  it('throws when no profile is found with descriptive error', () => {
    const mod = { default: {}, someVar: 42 };
    expect(() => findProfileExport(mod as never, 'path/to/config.ts')).toThrow(
      'Could not find a PlatformProfile export in "path/to/config.ts"',
    );
  });

  it('throws with available exports listed', () => {
    const mod = { default: {}, someVar: 42, otherVar: 'hello' };
    expect(() => findProfileExport(mod as never, 'config.ts')).toThrow('someVar');
    expect(() => findProfileExport(mod as never, 'config.ts')).toThrow('otherVar');
  });
});
