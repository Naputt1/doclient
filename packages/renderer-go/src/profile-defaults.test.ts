import { describe, it, expect } from 'vitest';
import {
  renderResponseFile,
  renderGoMod,
  testSetupFile,
  defaultRenderServiceFile,
  defaultRenderTestFile,
} from './profile-defaults.js';
import type { IREndpoint } from '@doclient/core';
import { StructGenerator } from './renderer.js';

describe('renderResponseFile', () => {
  it('renders BaseResponse with fields', () => {
    const fn = renderResponseFile([
      { name: 'Code', type: 'string', jsonTag: 'code', urlTag: '', comment: '' },
      { name: 'Msg', type: 'string', jsonTag: 'msg', urlTag: '', comment: '' },
    ]);
    const result = fn('mypkg');
    expect(result).toContain('package mypkg');
    expect(result).toContain('type BaseResponse struct');
    expect(result).toContain('Code string `json:"code"`');
    expect(result).toContain('Msg string `json:"msg"`');
  });
});

describe('renderGoMod', () => {
  it('renders module without dependencies', () => {
    const fn = renderGoMod([]);
    const result = fn('github.com/test/mymod', 'mypkg');
    expect(result).toContain('module github.com/test/mymod');
    expect(result).toContain('go 1.22');
  });

  it('renders module with dependencies', () => {
    const fn = renderGoMod(['github.com/foo/bar v1.0.0', 'github.com/baz/qux v2.0.0']);
    const result = fn('github.com/test/mymod', 'mypkg');
    expect(result).toContain('require (');
    expect(result).toContain('github.com/foo/bar v1.0.0');
    expect(result).toContain('github.com/baz/qux v2.0.0');
  });
});

describe('testSetupFile', () => {
  it('renders setup_test.go with app vars and extra setup', () => {
    const fn = testSetupFile({
      appVars: '\tshopID uint64 = 123\n',
      appLiteral: 'App{PartnerID: 456}',
      extraSetup: '\tclient.Region = "SG"\n',
    });
    const result = fn('mypkg');
    expect(result).toContain('package mypkg');
    expect(result).toContain('shopID uint64 = 123');
    expect(result).toContain('App{PartnerID: 456}');
    expect(result).toContain('client.Region = "SG"');
    expect(result).toContain('func setup()');
    expect(result).toContain('func teardown()');
    expect(result).toContain('func loadFixtureSafe');
  });
});

describe('defaultRenderServiceFile', () => {
  const makeEndpoints = (): IREndpoint[] => [
    {
      name: 'GetItem',
      method: 'GET',
      path: '/item/get',
      fullPath: '',
      description: 'Get an item',
      docUrl: '',
      apiType: 'Shop',
      isUpload: false,
      fullApiName: 'item.get',
      requestParams: [],
      responseParams: [],
      errors: [],
    },
  ];

  const makeGen = () => {
    const g = new StructGenerator('pkg', {}, {});
    g.chainToName.set('Item.GetItem.Response', 'ItemGetItemResponse');
    return g;
  };

  it('direct style generates interface and implementation', () => {
    const fn = defaultRenderServiceFile('direct', ', sid uint64, tok string', 'sid, tok');
    const result = fn('Item', 'item', makeEndpoints(), makeGen(), 'mypkg');
    expect(result).toContain('package mypkg');
    expect(result).toContain('type ItemService interface');
    expect(result).toContain('type ItemServiceOp[T any] struct');
    expect(result).toContain('func (s *ItemServiceOp[T]) GetItem');
    expect(result).toContain('sid, tok');
  });

  it('wrapper style generates different impl', () => {
    const fn = defaultRenderServiceFile('wrapper', ', sid uint64, tok string', 'sid, tok');
    const result = fn('Item', 'item', makeEndpoints(), makeGen(), 'mypkg');
    expect(result).toContain('package mypkg');
    expect(result).toContain('type ItemService interface');
    expect(result).toContain('func (s *ItemServiceOp[T]) GetItem');
    expect(result).toContain('var params map[string]string');
    expect(result).toContain('s.client.Get(ctx, path, params)');
  });

  it('wrapper style generates paramsFromStruct for GET with request', () => {
    const eps: IREndpoint[] = [
      {
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
        ],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.generateStruct(['Item', 'GetItem', 'Request'], eps[0].requestParams, true, true, 'item');
    gen.generateStruct(
      ['Item', 'GetItem', 'Response'],
      [
        {
          name: 'Response',
          type: 'string',
          shopeeType: 'string',
          description: '',
          required: true,
          children: [],
        },
      ],
      false,
      false,
      'item',
    );
    const fn = defaultRenderServiceFile('wrapper', '', '');
    const result = fn('Item', 'item', eps, gen, 'mypkg');
    expect(result).toContain('params := paramsFromStruct(opt)');
  });

  it('wrapper style generates paramsFromStruct for POST with request', () => {
    const eps: IREndpoint[] = [
      {
        name: 'CreateItem',
        method: 'POST',
        path: '/item/create',
        fullPath: '',
        description: '',
        docUrl: '',
        apiType: 'Shop',
        isUpload: false,
        fullApiName: 'item.create',
        requestParams: [
          {
            name: 'name',
            type: 'string',
            shopeeType: 'string',
            description: '',
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
                name: 'id',
                type: 'int',
                shopeeType: 'int',
                description: '',
                required: true,
                children: [],
              },
            ],
          },
        ],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.generateStruct(
      ['Item', 'CreateItem', 'Request'],
      eps[0].requestParams,
      false,
      true,
      'item',
    );
    gen.generateStruct(
      ['Item', 'CreateItem', 'Response'],
      eps[0].responseParams,
      false,
      false,
      'item',
    );
    const fn = defaultRenderServiceFile('wrapper', '', '');
    const result = fn('Item', 'item', eps, gen, 'mypkg');
    expect(result).toContain('params := paramsFromStruct(req)');
  });

  it('wrapper style decodes response data when hasResponseField', () => {
    const eps: IREndpoint[] = [
      {
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
        ],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.generateStruct(
      ['Item', 'GetItem', 'Response'],
      [
        {
          name: 'Response',
          type: 'string',
          shopeeType: 'string',
          description: '',
          required: true,
          children: [],
        },
      ],
      false,
      false,
      'item',
    );
    const fn = defaultRenderServiceFile('wrapper', '', '');
    const result = fn('Item', 'item', eps, gen, 'mypkg');
    expect(result).toContain('json.Unmarshal(wrapper.Data, &resp.Response)');
  });

  it('direct style generates POST method call', () => {
    const eps: IREndpoint[] = [
      {
        name: 'CreateItem',
        method: 'POST',
        path: '/item/create',
        fullPath: '',
        description: '',
        docUrl: '',
        apiType: 'Shop',
        isUpload: false,
        fullApiName: 'item.create',
        requestParams: [],
        responseParams: [],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.chainToName.set('Item.CreateItem.Response', 'ItemCreateItemResponse');
    const fn = defaultRenderServiceFile('direct', '', '');
    const result = fn('Item', 'item', eps, gen, 'mypkg');
    expect(result).toContain('s.client.Post');
  });

  it('generates upload methods for upload endpoints', () => {
    const eps: IREndpoint[] = [
      {
        name: 'UploadImage',
        method: 'POST',
        path: '/image/upload',
        fullPath: '',
        description: '',
        docUrl: '',
        apiType: 'Shop',
        isUpload: true,
        fullApiName: 'image.upload',
        requestParams: [],
        responseParams: [],
        errors: [],
      },
    ];
    const fn = defaultRenderServiceFile('direct', ', sid uint64, tok string', 'sid, tok');
    const gen = makeGen();
    gen.chainToName.set('Item.UploadImage.Response', 'ItemUploadImageResponse');
    const result = fn('Item', 'item', eps, gen, 'mypkg');
    expect(result).toContain('UploadFromReader');
    expect(result).toContain('s.client.Upload');
  });

  it('wrapper style generates upload endpoint code', () => {
    const eps: IREndpoint[] = [
      {
        name: 'UploadImage',
        method: 'POST',
        path: '/image/upload',
        fullPath: '',
        description: '',
        docUrl: '',
        apiType: 'Shop',
        isUpload: true,
        fullApiName: 'image.upload',
        requestParams: [],
        responseParams: [],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.chainToName.set('Item.UploadImage.Response', 'ItemUploadImageResponse');
    const fn = defaultRenderServiceFile('wrapper', '', '');
    const result = fn('Item', 'item', eps, gen, 'mypkg');
    expect(result).toContain('filename string, reader io.Reader');
    expect(result).toContain('multipart.NewWriter');
    expect(result).toContain('json.Unmarshal(wrapper.Data, resp)');
  });
});

describe('defaultRenderTestFile', () => {
  const makeEndpoints = (): IREndpoint[] => [
    {
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
      responseParams: [],
      errors: [],
    },
  ];

  const makeGen = () => {
    const g = new StructGenerator('pkg', {}, {});
    g.chainToName.set('Item.GetItem.Response', 'ItemGetItemResponse');
    return g;
  };

  it('direct style generates test functions', () => {
    const fn = defaultRenderTestFile('direct', ', sid, tok');
    const result = fn('Item', makeEndpoints(), makeGen(), 'mypkg');
    expect(result).toContain('package mypkg');
    expect(result).toContain('func Test_Item_GetItem');
    expect(result).toContain('setup()');
    expect(result).toContain('teardown()');
    expect(result).toContain('httpmock.RegisterResponder');
  });

  it('direct style generates test with empty extraArgs', () => {
    const fn = defaultRenderTestFile('direct', '');
    const result = fn('Item', makeEndpoints(), makeGen(), 'mypkg');
    expect(result).toContain('func Test_Item_GetItem');
    expect(result).not.toContain('undefined');
  });

  it('direct style generates upload test', () => {
    const eps: IREndpoint[] = [
      {
        name: 'UploadImage',
        method: 'POST',
        path: '/image/upload',
        fullPath: '',
        description: '',
        docUrl: '',
        apiType: 'Shop',
        isUpload: true,
        fullApiName: 'image.upload',
        requestParams: [],
        responseParams: [],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.chainToName.set('Item.UploadImage.Response', 'ItemUploadImageResponse');
    const fn = defaultRenderTestFile('direct', ', sid, tok');
    const result = fn('Item', eps, gen, 'mypkg');
    expect(result).toContain('func Test_Item_UploadImage');
  });

  it('direct style generates hasReq with request type', () => {
    const eps: IREndpoint[] = [
      {
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
            name: 'id',
            type: 'int',
            shopeeType: 'int',
            description: '',
            required: true,
            children: [],
          },
        ],
        responseParams: [],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.chainToName.set('Item.GetItem.Request', 'ItemGetItemRequest');
    gen.chainToName.set('Item.GetItem.Response', 'ItemGetItemResponse');
    gen.allStructs.set('ItemGetItemRequest', {
      name: 'ItemGetItemRequest',
      fields: [],
      fileName: 'item',
    });
    const fn = defaultRenderTestFile('direct', '');
    const result = fn('Item', eps, gen, 'mypkg');
    expect(result).toContain('var req ItemGetItemRequest');
  });

  it('wrapper style generates different test functions', () => {
    const fn = defaultRenderTestFile('wrapper', '');
    const result = fn('Item', makeEndpoints(), makeGen(), 'mypkg');
    expect(result).toContain('func Test_Item_GetItem');
    expect(result).toContain('serverURL := client.getServerURL()');
    expect(result).toContain('"code": "0"');
  });

  it('wrapper style generates upload test with request type', () => {
    const eps: IREndpoint[] = [
      {
        name: 'UploadImage',
        method: 'POST',
        path: '/image/upload',
        fullPath: '',
        description: '',
        docUrl: '',
        apiType: 'Shop',
        isUpload: true,
        fullApiName: 'image.upload',
        requestParams: [],
        responseParams: [],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.chainToName.set('Item.UploadImage.Response', 'ItemUploadImageResponse');
    const fn = defaultRenderTestFile('wrapper', '');
    const result = fn('Item', eps, gen, 'mypkg');
    expect(result).toContain('func Test_Item_UploadImage');
    expect(result).toContain('"test.jpg"');
  });

  it('wrapper test generates var req when hasReq is true', () => {
    const eps: IREndpoint[] = [
      {
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
            name: 'id',
            type: 'int',
            shopeeType: 'int',
            description: '',
            required: true,
            children: [],
          },
        ],
        responseParams: [],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.allStructs.set('ItemGetItemResponse', {
      name: 'ItemGetItemResponse',
      fields: [],
      fileName: 'item',
    });
    gen.chainToName.set('Item.GetItem.Request', 'ItemGetItemRequest');
    gen.chainToName.set('Item.GetItem.Response', 'ItemGetItemResponse');
    gen.allStructs.set('ItemGetItemRequest', {
      name: 'ItemGetItemRequest',
      fields: [],
      fileName: 'item',
    });

    const fn = defaultRenderTestFile('wrapper', '');
    const result = fn('Item', eps, gen, 'mypkg');
    expect(result).toContain('var req ItemGetItemRequest');
  });

  it('wrapper test cleans fixture names with special chars', () => {
    const eps: IREndpoint[] = [
      {
        name: 'GetItem',
        method: 'GET',
        path: '/item/get',
        fullPath: '',
        description: '',
        docUrl: '',
        apiType: 'Shop',
        isUpload: false,
        fullApiName: 'item.get$special',
        requestParams: [],
        responseParams: [],
        errors: [],
      },
    ];
    const gen = makeGen();
    gen.chainToName.set('Item.GetItem.Response', 'ItemGetItemResponse');
    const fn = defaultRenderTestFile('wrapper', '');
    const result = fn('Item', eps, gen, 'mypkg');
    expect(result).toContain('item.get_special_resp.json');
  });
});
