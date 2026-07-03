import { describe, it, expect } from 'vitest';
import {
  toPascalCase,
  toSnakeCase,
  getFileName,
  isParamRequired,
  StructGenerator,
  goClientMethod,
  renderTypesFile,
  renderErrorsFile,
  renderEnumsFile,
  renderOptionsFile,
  renderLoggerFile,
  createGoRenderer,
  defaultBuildEndpointStructs,
} from './renderer.js';
import type { IREndpoint, IRParam, IR, Config } from '@doclient/core';
import type { PlatformProfile } from './platform-profile.js';

describe('toPascalCase', () => {
  it('converts snake_case', () => expect(toPascalCase('hello_world')).toBe('HelloWorld'));
  it('converts kebab-case', () => expect(toPascalCase('hello-world')).toBe('HelloWorld'));
  it('handles mixed separators', () =>
    expect(toPascalCase('hello_world-foo')).toBe('HelloWorldFoo'));
  it('strips non-alphanumeric chars', () =>
    expect(toPascalCase('hello!@#world')).toBe('Helloworld'));
  it('handles empty string', () => expect(toPascalCase('')).toBe(''));
});

describe('toSnakeCase', () => {
  it('converts PascalCase', () => expect(toSnakeCase('HelloWorld')).toBe('hello_world'));
  it('handles acronyms', () => expect(toSnakeCase('HTMLParser')).toBe('html_parser'));
  it('handles leading capitals', () => expect(toSnakeCase('GetURL')).toBe('get_url'));
  it('legacy mode handles consecutive caps', () => {
    expect(toSnakeCase('HTMLParser', true)).toBe('h_t_m_l_parser');
  });
});

describe('getFileName', () => {
  it('returns snake_case of module name', () => {
    expect(getFileName('GetProduct')).toBe('get_product');
  });
});

describe('isParamRequired', () => {
  it('returns boolean as-is', () => {
    expect(isParamRequired(true)).toBe(true);
    expect(isParamRequired(false)).toBe(false);
  });
  it('treats empty string as required', () => {
    expect(isParamRequired('')).toBe(true);
  });
  it('parses "yes" / "true"', () => {
    expect(isParamRequired('yes')).toBe(true);
    expect(isParamRequired('true')).toBe(true);
    expect(isParamRequired('no')).toBe(false);
  });
});

describe('goClientMethod', () => {
  it('maps HTTP methods', () => {
    expect(goClientMethod('GET')).toBe('Get');
    expect(goClientMethod('POST')).toBe('Post');
    expect(goClientMethod('PUT')).toBe('Put');
    expect(goClientMethod('DELETE')).toBe('Delete');
  });
  it('passes through unknown methods', () => {
    expect(goClientMethod('PATCH')).toBe('PATCH');
  });
});

describe('StructGenerator', () => {
  const gen = () => new StructGenerator('mypkg', {}, {});

  it('generateStruct creates a struct from params', () => {
    const g = gen();
    const params: IRParam[] = [
      {
        name: 'item_id',
        type: 'int',
        shopeeType: 'int',
        description: 'Item ID',
        required: true,
        children: [],
      },
      {
        name: 'name',
        type: 'string',
        shopeeType: 'string',
        description: 'Name',
        required: false,
        children: [],
      },
    ];
    const s = g.generateStruct(['Product', 'Get', 'Request'], params, false, true, 'product');
    expect(s).not.toBeNull();
    expect(s!.name).toBe('GetRequest');
    expect(s!.fields).toHaveLength(2);
    expect(s!.fields[0].name).toBe('ItemId');
    expect(s!.fields[0].type).toBe('int64');
    expect(s!.fields[0].jsonTag).toBe('item_id');
    expect(s!.fields[1].name).toBe('Name');
    expect(s!.fields[1].type).toBe('*string');
    expect(s!.fields[1].jsonTag).toBe('name,omitempty');
  });

  it('generateStruct returns null when fields are empty', () => {
    const g = gen();
    const s = g.generateStruct(['Test'], [], false, false, 'test');
    expect(s).toBeNull();
  });

  it('mapType maps int/int32/int64/timestamp to int64', () => {
    const g = gen();
    const toType = (shopeeType: string) =>
      g.mapType(
        { name: 'f', type: shopeeType, shopeeType, description: '', required: true, children: [] },
        [],
        false,
        'f',
      );
    expect(toType('int')).toBe('int64');
    expect(toType('int32')).toBe('int64');
    expect(toType('int64')).toBe('int64');
    expect(toType('timestamp')).toBe('int64');
    expect(toType('float')).toBe('float64');
    expect(toType('double')).toBe('float64');
    expect(toType('boolean')).toBe('bool');
    expect(toType('string')).toBe('string');
    expect(toType('unknown_type')).toBe('interface{}');
  });

  it('mapType handles list types', () => {
    const g = gen();
    const toType = (shopeeType: string) =>
      g.mapType(
        { name: 'f', type: shopeeType, shopeeType, description: '', required: true, children: [] },
        [],
        false,
        'f',
      );
    expect(toType('int[]')).toBe('[]int64');
    expect(toType('string[]')).toBe('[]string');
    expect(toType('object[]')).toBe('[]interface{}');
  });

  it('mapType uses typeOverrides', () => {
    const g = new StructGenerator('mypkg', { category_id: 'CategoryID' }, {});
    const result = g.mapType(
      {
        name: 'category_id',
        type: 'int',
        shopeeType: 'int',
        description: '',
        required: true,
        children: [],
      },
      [],
      false,
      'f',
    );
    expect(result).toBe('CategoryID');
  });

  it('mapType uses structTypeOverrides', () => {
    const g = new StructGenerator('mypkg', {}, { Product: { category_id: 'CategoryID' } });
    const result = g.mapType(
      {
        name: 'category_id',
        type: 'int',
        shopeeType: 'int',
        description: '',
        required: true,
        children: [],
      },
      ['Product'],
      false,
      'f',
    );
    expect(result).toBe('CategoryID');
  });

  it('mapType wraps override in slice if original type is list', () => {
    const g = new StructGenerator('mypkg', { ids: 'CustomID' }, {});
    const result = g.mapType(
      {
        name: 'ids',
        type: 'int[]',
        shopeeType: 'int[]',
        description: '',
        required: true,
        children: [],
      },
      [],
      false,
      'f',
    );
    expect(result).toBe('[]CustomID');
  });

  it('mapType wraps structTypeOverride in slice if original type is list', () => {
    const g = new StructGenerator('mypkg', {}, { OuterStruct: { ids: 'CustomID' } });
    const result = g.mapType(
      {
        name: 'ids',
        type: 'int[]',
        shopeeType: 'int[]',
        description: '',
        required: true,
        children: [],
      },
      ['OuterStruct'],
      false,
      'f',
    );
    expect(result).toBe('[]CustomID');
  });

  it('mapType creates sub-structs for object with children', () => {
    const g = gen();
    const children: IRParam[] = [
      {
        name: 'sub_name',
        type: 'string',
        shopeeType: 'string',
        description: '',
        required: true,
        children: [],
      },
    ];
    const result = g.mapType(
      {
        name: 'address',
        type: 'object',
        shopeeType: 'object',
        description: '',
        required: true,
        children,
      },
      [],
      false,
      'f',
    );
    expect(result).toBe('*Address');
    expect(g.allStructs.has('Address')).toBe(true);
  });

  it('mapType strips List suffix from object field names', () => {
    const g = gen();
    const children: IRParam[] = [
      {
        name: 'sub_name',
        type: 'string',
        shopeeType: 'string',
        description: '',
        required: true,
        children: [],
      },
    ];
    const result = g.mapType(
      {
        name: 'item_list',
        type: 'object',
        shopeeType: 'object',
        description: '',
        required: true,
        children,
      },
      ['Order'],
      false,
      'f',
    );
    expect(result).toBe('*Item');
  });

  it('pickName uses existing struct signature for dedup', () => {
    const g = gen();
    const p1: IRParam[] = [
      { name: 'id', type: 'int', shopeeType: 'int', description: '', required: true, children: [] },
    ];
    const p2: IRParam[] = [
      { name: 'id', type: 'int', shopeeType: 'int', description: '', required: true, children: [] },
    ];
    const s1 = g.generateStruct(['A', 'Req'], p1, false, true, 'a');
    const s2 = g.generateStruct(['B', 'Req'], p2, false, true, 'b');
    expect(s1!.name).toBe(s2!.name);
  });

  it('pickName falls through to fullName when all candidates are reserved', () => {
    const g = gen();
    // chain with a single reserved name like 'Option'
    const s = g.generateStruct(
      ['Option'],
      [
        {
          name: 'id',
          type: 'int',
          shopeeType: 'int',
          description: '',
          required: true,
          children: [],
        },
      ],
      false,
      false,
      'f',
    );
    // Since 'Option' is reserved, pickName should still return 'Option' as fallback
    expect(s).not.toBeNull();
  });

  it('isReserved returns true for "Option"', () => {
    const g = gen();
    expect(g.isReserved('Option')).toBe(true);
    expect(g.isReserved('Other')).toBe(false);
  });

  it('getStructsForFile filters by fileName', () => {
    const g = gen();
    g.generateStruct(
      ['FileA'],
      [
        {
          name: 'id',
          type: 'int',
          shopeeType: 'int',
          description: '',
          required: true,
          children: [],
        },
      ],
      false,
      false,
      'file_a',
    );
    g.generateStruct(
      ['FileB'],
      [
        {
          name: 'name',
          type: 'string',
          shopeeType: 'string',
          description: '',
          required: true,
          children: [],
        },
      ],
      false,
      false,
      'file_b',
    );
    expect(g.getStructsForFile('file_a')).toHaveLength(1);
    expect(g.getStructsForFile('file_b')).toHaveLength(1);
  });

  it('getAllStructs returns all structs', () => {
    const g = gen();
    g.generateStruct(
      ['A'],
      [
        {
          name: 'id',
          type: 'int',
          shopeeType: 'int',
          description: '',
          required: true,
          children: [],
        },
      ],
      false,
      false,
      'a',
    );
    g.generateStruct(
      ['B'],
      [
        {
          name: 'name',
          type: 'string',
          shopeeType: 'string',
          description: '',
          required: true,
          children: [],
        },
      ],
      false,
      false,
      'b',
    );
    expect(g.getAllStructs()).toHaveLength(2);
  });

  it('generateResponseDataWith returns null if field not found', () => {
    const g = gen();
    const result = g.generateResponseDataWith('nonexistent', ['M', 'E'], [], 'f');
    expect(result).toBeNull();
  });

  it('getNameForChain returns chained name', () => {
    const g = gen();
    expect(g.getNameForChain('A', 'B', 'C')).toBe('ABC');
  });

  it('resolveTypeName finds existing struct', () => {
    const g = gen();
    g.allStructs.set('ExistingStruct', { name: 'ExistingStruct', fields: [], fileName: 'f' });
    expect(g.resolveTypeName('module', 'ExistingStruct')).toBe('ExistingStruct');
  });

  it('resolveTypeName returns joined name when no match found', () => {
    const g = gen();
    expect(g.resolveTypeName('module', 'NewStruct')).toBe('NewStruct');
  });

  it('paramToField maps a param to a GoField', () => {
    const g = gen();
    const p: IRParam = {
      name: 'my_field',
      type: 'string',
      shopeeType: 'string',
      description: 'A field',
      required: true,
      children: [],
    };
    const field = g.paramToField(p, [], false, 'f');
    expect(field).not.toBeNull();
    expect(field!.name).toBe('MyField');
    expect(field!.type).toBe('string');
    expect(field!.jsonTag).toBe('my_field');
  });

  it('paramToField maps unknown type to interface{}', () => {
    const g = gen();
    const field = g.paramToField(
      { name: '', type: '', shopeeType: '', description: '', required: true, children: [] },
      [],
      false,
      'f',
    );
    expect(field!.type).toBe('interface{}');
  });
});

describe('renderTypesFile', () => {
  it('returns empty string for empty structs', () => {
    expect(renderTypesFile([], 'pkg')).toBe('');
  });

  it('renders sorted structs', () => {
    const structs = [
      {
        name: 'ZStruct',
        fields: [
          { name: 'Name', type: 'string', jsonTag: 'name', urlTag: '', comment: 'Name field' },
        ],
        fileName: 'z',
      },
      {
        name: 'AStruct',
        fields: [{ name: 'ID', type: 'int64', jsonTag: 'id', urlTag: '', comment: 'ID field' }],
        fileName: 'a',
      },
    ];
    const result = renderTypesFile(structs, 'pkg');
    expect(result).toContain('package pkg');
    expect(result.indexOf('AStruct')).toBeLessThan(result.indexOf('ZStruct'));
    expect(result).toContain('`json:"name"`');
  });
});

describe('renderErrorsFile', () => {
  it('returns empty string for empty errors', () => {
    expect(renderErrorsFile([], 'pkg')).toBe('');
  });

  it('renders sorted error constants', () => {
    const result = renderErrorsFile(
      [
        { code: 'error_not_found', description: 'Not found' },
        { code: 'error_bad_request', description: 'Bad request' },
      ],
      'pkg',
    );
    expect(result).toContain('package pkg');
    expect(result).toContain('ErrErrorBadRequest');
    expect(result).toContain('ErrErrorNotFound');
  });
});

describe('renderEnumsFile', () => {
  it('returns empty string for empty constants', () => {
    expect(renderEnumsFile([], 'pkg')).toBe('');
  });

  it('renders string-based enums', () => {
    const result = renderEnumsFile(
      [
        {
          typeName: 'Status',
          baseType: 'string',
          values: [
            { name: 'StatusActive', value: 'ACTIVE' },
            { name: 'StatusInactive', value: 'INACTIVE' },
          ],
        },
      ],
      'pkg',
    );
    expect(result).toContain('type Status string');
    expect(result).toContain('StatusActive Status = "ACTIVE"');
  });

  it('renders int-based enums', () => {
    const result = renderEnumsFile(
      [
        {
          typeName: 'Flag',
          baseType: 'int',
          values: [
            { name: 'FlagOn', value: '1' },
            { name: 'FlagOff', value: '0' },
          ],
        },
      ],
      'pkg',
    );
    expect(result).toContain('type Flag int');
    expect(result).toContain('FlagOn Flag = 1');
  });
});

describe('renderOptionsFile', () => {
  it('renders valid Go options code', () => {
    const result = renderOptionsFile('mypkg');
    expect(result).toContain('package mypkg');
    expect(result).toContain('type Option[T any] func(*Client[T])');
    expect(result).toContain('WithHTTPClient');
    expect(result).toContain('WithRetry');
    expect(result).toContain('WithLogger');
    expect(result).toContain('WithProxy');
    expect(result).toContain('WithRefreshToken');
    expect(result).toContain('WithOnTokenRefresh');
    expect(result).toContain('WithMeta');
    expect(result).toContain('WithHTTPClientDefault');
    expect(result).toContain('WithRetryDefault');
  });
});

describe('renderLoggerFile', () => {
  it('renders valid Go logger code', () => {
    const result = renderLoggerFile('mypkg');
    expect(result).toContain('package mypkg');
    expect(result).toContain('type LeveledLoggerInterface interface');
    expect(result).toContain('type LeveledLogger struct');
    expect(result).toContain('func NewLeveledLogger');
    expect(result).toContain('func (l *LeveledLogger) Debugf');
    expect(result).toContain('func (l *LeveledLogger) Infof');
    expect(result).toContain('func (l *LeveledLogger) Warnf');
    expect(result).toContain('func (l *LeveledLogger) Errorf');
  });
});

describe('createGoRenderer', () => {
  function makeMockProfile(): PlatformProfile {
    return {
      name: 'mock',
      responseDataFieldName: 'response',
      commonFields: [],
      commonRequestFields: [],
      baseResponseFields: [],
      extraMethodParams: () => ', sid uint64, tok string',
      extraMethodArgs: () => 'sid, tok',
      uploadMethodExtraParams: () => ', tok string',
      uploadMethodExtraArgs: () => 'tok',
      renderClientFile: (pkg, svc, init) => `package ${pkg}\n${svc}\n${init}`,
      renderAuthFile: () => 'package pkg\nauth code',
      renderResponseFile: () => 'package pkg\nresponse code',
      renderTestSetupFile: () => 'package pkg\nsetup code',
      renderGoMod: (mod, _pkg) => `module ${mod}\n`,
      renderServiceFile: (_mod, _file, _eps, _sg, _pkg) => `package pkg\nfile for ${_mod}`,
      renderTestFile: (_mod, _eps, _sg, _pkg) => `package pkg\ntest for ${_mod}`,
    };
  }

  it('creates a renderer with the correct name', () => {
    const r = createGoRenderer(makeMockProfile());
    expect(r.name).toBe('go-mock');
  });

  it('render returns expected output structure', async () => {
    const r = createGoRenderer(makeMockProfile(), { package: 'mockgo' });
    const ir: IR = {
      name: 'test',
      modules: [
        {
          name: 'Product',
          moduleId: 1,
          endpoints: [
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
              requestParams: [
                {
                  name: 'id',
                  type: 'int',
                  shopeeType: 'int',
                  description: '',
                  required: true,
                  children: [],
                },
              ],
              responseParams: [
                {
                  name: 'response',
                  type: 'object',
                  shopeeType: 'object',
                  description: '',
                  required: true,
                  children: [
                    {
                      name: 'name',
                      type: 'string',
                      shopeeType: 'string',
                      description: '',
                      required: true,
                      children: [],
                    },
                  ],
                },
              ],
              errors: [],
            },
          ],
        },
      ],
      constants: [],
      errors: [{ code: 'err1', description: 'Error 1' }],
      fixtures: [],
    };
    const config: Config = {
      name: 'test',
      source: { name: 's', execute: async () => ir },
      output: r,
    };
    const files = await r.render(ir, config);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('mockgo.go');
    expect(paths).toContain('response.go');
    expect(paths).toContain('options.go');
    expect(paths).toContain('logger.go');
    expect(paths).toContain('auth.go');
    expect(paths).toContain('setup_test.go');
    expect(paths).toContain('product.gen.go');
    expect(paths).toContain('product.type.gen.go');
    expect(paths).toContain('product_test.go');
    expect(paths).toContain('errors.gen.go');
  });

  it('render includes enums file when constants are present', async () => {
    const r = createGoRenderer(makeMockProfile(), { package: 'mockgo' });
    const ir: IR = {
      name: 'test',
      modules: [],
      constants: [
        { typeName: 'Status', baseType: 'string', values: [{ name: 'Active', value: 'active' }] },
      ],
      errors: [],
      fixtures: [],
    };
    const config: Config = {
      name: 'test',
      source: { name: 's', execute: async () => ir },
      output: r,
    };
    const files = await r.render(ir, config);
    expect(files.some((f) => f.path === 'common.type.gen.go')).toBe(true);
  });

  it('render skips enums file when constants are empty', async () => {
    const r = createGoRenderer(makeMockProfile(), { package: 'mockgo' });
    const ir: IR = {
      name: 'test',
      modules: [],
      constants: [],
      errors: [],
      fixtures: [],
    };
    const config: Config = {
      name: 'test',
      source: { name: 's', execute: async () => ir },
      output: r,
    };
    const files = await r.render(ir, config);
    expect(files.some((f) => f.path === 'common.type.gen.go')).toBe(false);
  });

  it('render includes go.mod when module option is provided', async () => {
    const r = createGoRenderer(makeMockProfile(), {
      package: 'mockgo',
      module: 'github.com/test/mockgo',
    });
    const ir: IR = {
      name: 'test',
      modules: [],
      constants: [],
      errors: [],
      fixtures: [],
    };
    const config: Config = {
      name: 'test',
      source: { name: 's', execute: async () => ir },
      output: r,
    };
    const files = await r.render(ir, config);
    expect(files.some((f) => f.path === 'go.mod')).toBe(true);
  });

  it('render includes fixtures in output', async () => {
    const r = createGoRenderer(makeMockProfile(), { package: 'mockgo' });
    const ir: IR = {
      name: 'test',
      modules: [],
      constants: [],
      errors: [],
      fixtures: [{ filename: 'test_fixture.json', content: '{"key": "value"}' }],
    };
    const config: Config = {
      name: 'test',
      source: { name: 's', execute: async () => ir },
      output: r,
    };
    const files = await r.render(ir, config);
    expect(files.some((f) => f.path === 'fixtures/test_fixture.json')).toBe(true);
  });
});

describe('defaultBuildEndpointStructs', () => {
  function makeProfile(overrides?: Partial<PlatformProfile>): PlatformProfile {
    return {
      name: 'test',
      responseDataFieldName: 'response',
      commonFields: [],
      commonRequestFields: [],
      baseResponseFields: [],
      extraMethodParams: () => '',
      extraMethodArgs: () => '',
      uploadMethodExtraParams: () => '',
      uploadMethodExtraArgs: () => '',
      renderClientFile: () => '',
      renderAuthFile: () => '',
      renderResponseFile: () => '',
      renderTestSetupFile: () => '',
      renderGoMod: () => '',
      renderServiceFile: () => '',
      renderTestFile: () => '',
      ...overrides,
    };
  }

  it('builds request and response structs for an endpoint', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
      commonRequestFields: ['shop_id'],
      commonFields: ['code'],
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetItem',
      method: 'GET',
      path: '/item/get',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'item.get',
      requestParams: [
        {
          name: 'item_id',
          type: 'int',
          shopeeType: 'int',
          description: 'Item ID',
          required: true,
          children: [],
        },
        {
          name: 'shop_id',
          type: 'int',
          shopeeType: 'int',
          description: 'Shop ID',
          required: true,
          children: [],
        },
      ],
      responseParams: [
        {
          name: 'data',
          type: 'object',
          shopeeType: 'object',
          description: '',
          required: true,
          children: [
            {
              name: 'name',
              type: 'string',
              shopeeType: 'string',
              description: 'Name',
              required: true,
              children: [],
            },
          ],
        },
        {
          name: 'code',
          type: 'string',
          shopeeType: 'string',
          description: 'Code',
          required: true,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);

    expect(sg.allStructs.has('GetItemRequest')).toBe(true);
    expect(sg.allStructs.has('GetItemResponse')).toBe(true);
    expect(sg.allStructs.has('GetItemResponseData')).toBe(true);

    const req = sg.allStructs.get('GetItemRequest')!;
    expect(req.fields.find((f) => f.name === 'ItemId')).toBeDefined();
    expect(req.fields.find((f) => f.name === 'ShopId')).toBeUndefined();

    const resp = sg.allStructs.get('GetItemResponse')!;
    expect(resp.fields.find((f) => f.name === 'Response')).toBeDefined();
  });

  it('includes extra response fields not in commonFields', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
      commonFields: ['code'],
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetItem',
      method: 'GET',
      path: '/item/get',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'item.get',
      requestParams: [],
      responseParams: [
        {
          name: 'data',
          type: 'object',
          shopeeType: 'object',
          description: '',
          required: true,
          children: [
            {
              name: 'name',
              type: 'string',
              shopeeType: 'string',
              description: '',
              required: true,
              children: [],
            },
          ],
        },
        {
          name: 'code',
          type: 'string',
          shopeeType: 'string',
          description: '',
          required: true,
          children: [],
        },
        {
          name: 'extra_field',
          type: 'string',
          shopeeType: 'string',
          description: 'Extra',
          required: false,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);
    const resp = sg.allStructs.get('GetItemResponse')!;
    const extra = resp.fields.find((f) => f.name === 'ExtraField');
    expect(extra).toBeDefined();
    expect(extra!.jsonTag).toContain('omitempty');
  });

  it('handles scalar integer response type', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetScalar',
      method: 'GET',
      path: '/scalar',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'scalar.get',
      requestParams: [],
      responseParams: [
        {
          name: 'data',
          type: 'integer',
          shopeeType: 'int',
          description: '',
          required: true,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);
    const resp = sg.allStructs.get('GetScalarResponse')!;
    expect(resp.fields.find((f) => f.name === 'Response')!.type).toBe('int64');
  });

  it('handles scalar boolean response type', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetBool',
      method: 'GET',
      path: '/bool',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'bool.get',
      requestParams: [],
      responseParams: [
        {
          name: 'data',
          type: 'boolean',
          shopeeType: 'boolean',
          description: '',
          required: true,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);
    const resp = sg.allStructs.get('GetBoolResponse')!;
    expect(resp.fields.find((f) => f.name === 'Response')!.type).toBe('bool');
  });

  it('handles scalar string response type', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetStr',
      method: 'GET',
      path: '/str',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'str.get',
      requestParams: [],
      responseParams: [
        {
          name: 'data',
          type: 'string',
          shopeeType: 'string',
          description: '',
          required: true,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);
    const resp = sg.allStructs.get('GetStrResponse')!;
    expect(resp.fields.find((f) => f.name === 'Response')!.type).toBe('string');
  });

  it('handles object[] response type', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetList',
      method: 'GET',
      path: '/list',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'list.get',
      requestParams: [],
      responseParams: [
        {
          name: 'data',
          type: 'object[]',
          shopeeType: 'object[]',
          description: '',
          required: true,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);
    const resp = sg.allStructs.get('GetListResponse')!;
    expect(resp.fields.find((f) => f.name === 'Response')!.type).toBe('[]interface{}');
  });

  it('handles scalar float response type', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetNum',
      method: 'GET',
      path: '/num',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'num.get',
      requestParams: [],
      responseParams: [
        {
          name: 'data',
          type: 'number',
          shopeeType: 'float',
          description: '',
          required: true,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);
    const resp = sg.allStructs.get('GetNumResponse')!;
    expect(resp.fields.find((f) => f.name === 'Response')!.type).toBe('float64');
  });

  it('handles unknown scalar type as interface{}', () => {
    const profile = makeProfile({
      responseDataFieldName: 'data',
    });
    const build = defaultBuildEndpointStructs(profile);
    const sg = new StructGenerator('pkg', {}, {});

    const ep: IREndpoint = {
      name: 'GetUnknown',
      method: 'GET',
      path: '/unknown',
      fullPath: '',
      description: '',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'unknown.get',
      requestParams: [],
      responseParams: [
        {
          name: 'data',
          type: 'custom_type',
          shopeeType: 'string',
          description: '',
          required: true,
          children: [],
        },
      ],
      errors: [],
    };

    build(sg, 'Item', ep);
    const resp = sg.allStructs.get('GetUnknownResponse')!;
    expect(resp.fields.find((f) => f.name === 'Response')!.type).toBe('interface{}');
  });
});
