import { describe, it, expect } from 'vitest';
import { renderClientFile } from './client.js';

describe('renderClientFile', () => {
  it('substitutes package name', () => {
    const result = renderClientFile({
      packageName: 'goshopee',
      servicesSection: '',
      servicesInitSection: '',
    });
    expect(result).toContain('package goshopee');
  });

  it('substitutes services section', () => {
    const result = renderClientFile({
      packageName: 'pkg',
      servicesSection: '\tProduct ProductService',
      servicesInitSection: '',
    });
    expect(result).toContain('\tProduct ProductService');
  });

  it('substitutes services init section', () => {
    const result = renderClientFile({
      packageName: 'pkg',
      servicesSection: '',
      servicesInitSection: '\tc.Product = &ProductServiceOp[T]{client: c}',
    });
    expect(result).toContain('c.Product = &ProductServiceOp[T]{client: c}');
  });

  it('includes client struct with service fields', () => {
    const result = renderClientFile({
      packageName: 'pkg',
      servicesSection: '\tAuth AuthService\n\tProduct ProductService',
      servicesInitSection: '',
    });
    expect(result).toContain('Auth AuthService');
    expect(result).toContain('Product ProductService');
  });
});
