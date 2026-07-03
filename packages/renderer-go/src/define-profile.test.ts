import { describe, it, expect } from 'vitest';
import { defineProfile } from './define-profile.js';
import type { ProfileConfig } from './define-profile.js';
import type { PlatformProfile } from './platform-profile.js';

describe('defineProfile', () => {
  function minConfig(): ProfileConfig {
    return {
      name: 'test',
      responseDataFieldName: 'data',
      commonFields: ['code', 'msg'],
      commonRequestFields: ['partner_id'],
      baseResponseFields: [
        { name: 'Code', type: 'string', jsonTag: 'code', urlTag: '', comment: '' },
      ],
      renderClientFile: (pkg) => `package ${pkg}`,
    };
  }

  it('fills defaults for all methods', () => {
    const p = defineProfile(minConfig());
    expect(p.name).toBe('test');
    expect(p.responseDataFieldName).toBe('data');
    expect(p.commonFields).toEqual(['code', 'msg']);
    expect(p.commonRequestFields).toEqual(['partner_id']);
    expect(p.baseResponseFields).toHaveLength(1);
  });

  it('defaults extraMethodParams and extraMethodArgs to empty strings', () => {
    const p = defineProfile(minConfig());
    expect(p.extraMethodParams()).toBe('');
    expect(p.extraMethodArgs()).toBe('');
    expect(p.uploadMethodExtraParams()).toBe('');
    expect(p.uploadMethodExtraArgs()).toBe('');
  });

  it('sets extraMethodParams and extraMethodArgs from config', () => {
    const p = defineProfile({
      ...minConfig(),
      extraMethodParams: ', sid uint64, tok string',
      extraMethodArgs: 'sid, tok',
    });
    expect(p.extraMethodParams()).toBe(', sid uint64, tok string');
    expect(p.extraMethodArgs()).toBe('sid, tok');
    expect(p.uploadMethodExtraParams()).toBe(', sid uint64, tok string');
    expect(p.uploadMethodExtraArgs()).toBe('sid, tok');
  });

  it('allows separate upload method params/args', () => {
    const p = defineProfile({
      ...minConfig(),
      extraMethodParams: ', sid uint64, tok string',
      extraMethodArgs: 'sid, tok',
      uploadMethodExtraParams: ', tok string',
      uploadMethodExtraArgs: 'tok',
    });
    expect(p.extraMethodParams()).toBe(', sid uint64, tok string');
    expect(p.uploadMethodExtraParams()).toBe(', tok string');
    expect(p.extraMethodArgs()).toBe('sid, tok');
    expect(p.uploadMethodExtraArgs()).toBe('tok');
  });

  it('default renderAuthFile returns empty string', () => {
    const p = defineProfile(minConfig());
    expect(p.renderAuthFile('pkg')).toBe('');
  });

  it('renderAuthFile is overridable', () => {
    const p = defineProfile({
      ...minConfig(),
      renderAuthFile: (pkg) => `package ${pkg}\n// auth`,
    });
    expect(p.renderAuthFile('mypkg')).toContain('// auth');
  });

  it('applies overrides', () => {
    const p = defineProfile({
      ...minConfig(),
      overrides: {
        responseDataFieldName: 'overridden',
      } as Partial<PlatformProfile>,
    });
    expect(p.responseDataFieldName).toBe('overridden');
  });

  it('provides renderGoMod with dependencies', () => {
    const p = defineProfile({ ...minConfig(), dependencies: ['github.com/foo/bar v1.0.0'] });
    const result = p.renderGoMod('github.com/test/mod', 'pkg');
    expect(result).toContain('github.com/foo/bar v1.0.0');
  });

  it('creates renderServiceFile and renderTestFile via defaults', () => {
    const p = defineProfile(minConfig());
    expect(typeof p.renderServiceFile).toBe('function');
    expect(typeof p.renderTestFile).toBe('function');
  });

  it('default testSetupFile returns empty string', () => {
    const p = defineProfile(minConfig());
    expect(p.renderTestSetupFile('pkg')).toBe('');
  });

  it('uses testSetup config when provided', () => {
    const p = defineProfile({
      ...minConfig(),
      testSetup: {
        appLiteral: 'App{PartnerID: 123}',
      },
    });
    const result = p.renderTestSetupFile('pkg');
    expect(result).toContain('setup()');
    expect(result).toContain('App{PartnerID: 123}');
  });
});
