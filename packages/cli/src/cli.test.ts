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


});
