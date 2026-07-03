import { describe, it, expect } from 'vitest';
import { renderLazadaClientFile } from './client-lazada.js';

describe('renderLazadaClientFile', () => {
  it('substitutes package name', () => {
    const result = renderLazadaClientFile({
      packageName: 'lazadago',
      servicesSection: '',
      servicesInitSection: '',
    });
    expect(result).toContain('package lazadago');
  });

  it('substitutes services section', () => {
    const result = renderLazadaClientFile({
      packageName: 'pkg',
      servicesSection: '\tProduct ProductService',
      servicesInitSection: '',
    });
    expect(result).toContain('\tProduct ProductService');
  });

  it('substitutes services init section', () => {
    const result = renderLazadaClientFile({
      packageName: 'pkg',
      servicesSection: '',
      servicesInitSection: '\tc.Product = &ProductServiceOp[T]{client: c}',
    });
    expect(result).toContain('c.Product = &ProductServiceOp[T]{client: c}');
  });
});
