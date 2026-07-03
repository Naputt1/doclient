import { describe, it, expect } from 'vitest';
import {
  toPascalCase,
  getModuleDisplayName,
  filterByStaticModules,
  runPipeline,
} from './pipeline.js';
import type { IR, Config } from './types.js';

describe('toPascalCase', () => {
  it('converts snake_case', () => {
    expect(toPascalCase('hello_world')).toBe('HelloWorld');
  });

  it('converts kebab-case', () => {
    expect(toPascalCase('hello-world')).toBe('HelloWorld');
  });

  it('converts dotted.name', () => {
    expect(toPascalCase('hello.world')).toBe('HelloWorld');
  });

  it('converts space separated', () => {
    expect(toPascalCase('hello world')).toBe('HelloWorld');
  });

  it('handles mixed separators', () => {
    expect(toPascalCase('hello_world-foo.bar baz')).toBe('HelloWorldFooBarBaz');
  });

  it('strips non-alphanumeric characters', () => {
    expect(toPascalCase('hello!@#world')).toBe('Helloworld');
  });

  it('handles empty string', () => {
    expect(toPascalCase('')).toBe('');
  });

  it('handles single word', () => {
    expect(toPascalCase('hello')).toBe('Hello');
  });

  it('handles strings with numbers', () => {
    expect(toPascalCase('get_2fa_code')).toBe('Get2faCode');
  });
});

describe('getModuleDisplayName', () => {
  it('strips (CB seller only) suffix', () => {
    expect(getModuleDisplayName('Product (CB seller only)')).toBe('Product');
  });

  it('collapses multiple spaces', () => {
    expect(getModuleDisplayName('Shop   Listing')).toBe('Shop Listing');
  });

  it('trims leading/trailing whitespace', () => {
    expect(getModuleDisplayName('  Media  ')).toBe('Media');
  });

  it('returns the same string when no transformation needed', () => {
    expect(getModuleDisplayName('Order')).toBe('Order');
  });
});

describe('filterByStaticModules', () => {
  it('removes endpoints matching by last segment (default)', () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
            {
              name: 'Get',
              method: 'GET',
              path: '/product/get',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.get',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };
    filterByStaticModules(ir, { values: ['add'] });
    expect(ir.modules[0].endpoints.length).toBe(1);
    expect(ir.modules[0].endpoints[0].name).toBe('Get');
  });

  it('removes endpoints matching by explicit segment index', () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'get.product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
            {
              name: 'Get',
              method: 'GET',
              path: '/product/get',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'get.product.get',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
            {
              name: 'List',
              method: 'GET',
              path: '/order/list',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'get.order.list',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };
    filterByStaticModules(ir, { values: ['product'], segment: 1 });
    expect(ir.modules[0].endpoints.length).toBe(1);
    expect(ir.modules[0].endpoints[0].name).toBe('List');
  });

  it('removes endpoints matching by first segment', () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'v2.product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
            {
              name: 'Get',
              method: 'GET',
              path: '/product/get',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'v3.product.get',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };
    filterByStaticModules(ir, { values: ['v2'], segment: 0 });
    expect(ir.modules[0].endpoints.length).toBe(1);
    expect(ir.modules[0].endpoints[0].name).toBe('Get');
  });

  it('does nothing when staticModules is undefined', () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };
    filterByStaticModules(ir, undefined);
    expect(ir.modules[0].endpoints.length).toBe(1);
  });

  it('does nothing when values array is empty', () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };
    filterByStaticModules(ir, { values: [] });
    expect(ir.modules[0].endpoints.length).toBe(1);
  });

  it('throws on out-of-bounds segment index', () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };
    expect(() => filterByStaticModules(ir, { values: ['product'], segment: 5 })).toThrow();
  });

  it('does nothing when ignoreAPIs is empty array', async () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };
    const config: Config = {
      name: 'test',
      source: { name: 'mock', execute: async () => ir },
      output: { name: 'mock', render: async () => [{ path: 'out.go', content: '' }] },
      mappings: { ignoreAPIs: [] },
    };
    const files = await runPipeline(config);
    expect(files).toHaveLength(1);
  });
});

describe('runPipeline', () => {
  it('executes source, applies filters, and renders', async () => {
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
            {
              name: 'Add',
              method: 'POST',
              path: '/product/add',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.add',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
            {
              name: 'Get',
              method: 'GET',
              path: '/product/get',
              fullPath: '',
              description: '',
              docUrl: '',
              apiType: 'Shop',
              isUpload: false,
              fullApiName: 'product.get',
              requestParams: [],
              responseParams: [],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [],
      fixtures: [],
    };

    const config: Config = {
      name: 'test',
      source: {
        name: 'mock',
        execute: async () => ir,
      },
      output: {
        name: 'mock',
        render: async (_ir, _cfg) => [{ path: 'out.go', content: 'package test' }],
      },
      mappings: {
        ignoreAPIs: ['product.add'],
      },
    };

    const files = await runPipeline(config);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('out.go');
  });
});
