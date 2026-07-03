import { describe, it, expect } from 'vitest';
import { defineConfig, parseArg } from './cli.js';
import type { Renderer } from '@doclient/core';

describe('parseArg', () => {
  it('extracts value after --flag', () => {
    expect(parseArg(['--config', 'myconfig.ts'], 'config', 'c')).toBe('myconfig.ts');
  });

  it('extracts value after short flag', () => {
    expect(parseArg(['-p', 'myprofile.ts'], 'profile', 'p')).toBe('myprofile.ts');
  });

  it('returns undefined when flag not found', () => {
    expect(parseArg(['--foo', 'bar'], 'baz', 'z')).toBeUndefined();
  });
});

describe('defineConfig', () => {
  const mockRenderer: Renderer = {
    name: 'mock',
    render: async () => [],
  };

  const mockSource = {
    name: 'source',
    execute: async () => ({ name: '', modules: [], constants: [], errors: [], fixtures: [] }),
  };

  it('returns config when output is provided directly', () => {
    const cfg = defineConfig({ name: 'test', source: mockSource, output: mockRenderer });
    expect(cfg.name).toBe('test');
    expect(cfg.output).toBe(mockRenderer);
  });

  it('throws when neither profile nor output is provided', () => {
    expect(() => defineConfig({ name: 'test', source: mockSource })).toThrow(
      'Config must have a profile or output',
    );
  });

  it('throws when both profile and output are provided', () => {
    expect(() =>
      defineConfig({
        name: 'test',
        source: mockSource,
        output: mockRenderer,
        profile: {
          name: 'p',
          responseDataFieldName: 'resp',
          commonFields: [],
          commonRequestFields: [],
          baseResponseFields: [],
          renderClientFile: () => '',
        },
      }),
    ).toThrow('Provide either profile or output, not both');
  });

  it('accepts a PlatformProfile directly as profile', () => {
    const platformProfile = {
      name: 'test',
      responseDataFieldName: 'resp',
      commonFields: [],
      commonRequestFields: [],
      baseResponseFields: [],
      extraMethodParams: () => '',
      extraMethodArgs: () => '',
      uploadMethodExtraParams: () => '',
      uploadMethodExtraArgs: () => '',
      renderClientFile: (pkg: string) => `package ${pkg}`,
      renderAuthFile: () => '',
      renderResponseFile: () => '',
      renderTestSetupFile: () => '',
      renderGoMod: () => '',
      renderServiceFile: () => '',
      renderTestFile: () => '',
    };
    const cfg = defineConfig({ name: 'test', source: mockSource, profile: platformProfile });
    expect(cfg.output).toBeDefined();
    expect(cfg.output!.name).toBe('go-test');
  });

  it('accepts a ProfileConfig and converts via defineProfile', () => {
    const profileConfig = {
      name: 'test',
      responseDataFieldName: 'data',
      commonFields: [],
      commonRequestFields: [],
      baseResponseFields: [],
      renderClientFile: (pkg: string) => `package ${pkg}`,
    };
    const cfg = defineConfig({ name: 'test', source: mockSource, profile: profileConfig as never });
    expect(cfg.output).toBeDefined();
    expect(cfg.output!.name).toBe('go-test');
  });
});
