import { describe, it, expect } from 'vitest';
import { defineConfig, defineRenderer } from './types.js';

describe('defineConfig', () => {
  it('throws if name is missing', () => {
    expect(() =>
      defineConfig({
        name: '',
        source: {
          name: 's',
          execute: async () => ({ name: '', modules: [], constants: [], errors: [], fixtures: [] }),
        },
        output: { name: 'o', render: async () => [] },
      }),
    ).toThrow('Config must have a name');
  });

  it('throws if source is missing', () => {
    expect(() =>
      defineConfig({
        name: 'n',
        source: undefined as never,
        output: { name: 'o', render: async () => [] },
      }),
    ).toThrow('Config must have a source');
  });

  it('throws if output is missing', () => {
    expect(() =>
      defineConfig({
        name: 'n',
        source: {
          name: 's',
          execute: async () => ({ name: '', modules: [], constants: [], errors: [], fixtures: [] }),
        },
        output: undefined as never,
      }),
    ).toThrow('Config must have an output');
  });

  it('returns the config when valid', () => {
    const cfg = defineConfig({
      name: 'test',
      source: {
        name: 's',
        execute: async () => ({ name: '', modules: [], constants: [], errors: [], fixtures: [] }),
      },
      output: { name: 'o', render: async () => [] },
    });
    expect(cfg.name).toBe('test');
  });
});

describe('defineRenderer', () => {
  it('returns the renderer as-is', () => {
    const r = { name: 'r', render: async () => [] };
    expect(defineRenderer(r)).toBe(r);
  });
});
