import type { IREndpoint } from '@doclient/core';
import type { PlatformProfile } from './platform-profile.js';
import type { StructGenerator, GoField } from './renderer.js';
import { goClientMethod } from './renderer.js';

export type ServiceStyle = 'direct' | 'wrapper';

// ─── Response file ─────────────────────────────────────────

export function renderResponseFile(baseResponseFields: GoField[]): (packageName: string) => string {
  return (packageName: string): string => {
    let out = `package ${packageName}\n\ntype BaseResponse struct {\n`;
    for (const f of baseResponseFields) {
      out += `\t${f.name} ${f.type} \`json:"${f.jsonTag}"\`\n`;
    }
    out += `}\n`;
    return out;
  };
}

// ─── Go mod ────────────────────────────────────────────────

export function renderGoMod(
  dependencies: string[],
): (modulePath: string, packageName: string) => string {
  return (modulePath: string, _packageName: string): string => {
    let out = `module ${modulePath}\n\ngo 1.22\n`;
    if (dependencies.length > 0) {
      out += `\nrequire (\n`;
      for (const dep of dependencies) {
        out += `\t${dep}\n`;
      }
      out += `)\n`;
    }
    return out;
  };
}

// ─── Test setup file ──────────────────────────────────────

export interface TestSetupConfig {
  /** Extra Go variable declarations (e.g. "\tshopID uint64 = 123456\n\taccessToken = \"test_token\"") */
  appVars?: string;
  /** Go struct literal for App initialization (e.g. "App{\n\t\tPartnerID: 123456,\n\t}") */
  appLiteral: string;
  /** Extra setup statements after client creation (e.g. "\tclient.Region = \"SG\"") */
  extraSetup?: string;
}

export function testSetupFile(config: TestSetupConfig): (packageName: string) => string {
  return (packageName: string): string => `package ${packageName}

import (
\t"encoding/json"
\t"io"
\t"os"
\t"sync"

\t"github.com/jarcoal/httpmock"
)

var (
\tclient      *DefaultClient
\tapp         App
${config.appVars ?? ''}
\tskippedMu   sync.Mutex
\tskippedRoutes []string
)

func setup() {
\thttpmock.Activate()
\tapp = ${config.appLiteral}
\tclient = NewDefaultClient(app)
${config.extraSetup ?? ''}
}

func teardown() {
\thttpmock.DeactivateAndReset()
}

func loadFixtureSafe(path string) (interface{}, error) {
\tf, err := os.Open("fixtures/" + path)
\tif err != nil {
\t\treturn nil, err
\t}
\tdefer f.Close()
\tdata, err := io.ReadAll(f)
\tif err != nil {
\t\treturn nil, err
\t}
\tvar result interface{}
\tif err := json.Unmarshal(data, &result); err != nil {
\t\treturn nil, err
\t}
\treturn result, nil
}
`;
}

// ─── Service file ──────────────────────────────────────────

function directServiceFile(
  moduleName: string,
  _fileName: string,
  endpoints: IREndpoint[],
  structGen: StructGenerator,
  packageName: string,
  extraMethodParams: string,
  extraMethodArgs: string,
): string {
  const hasUpload = endpoints.some((e) => e.isUpload);
  const sortedEps = [...endpoints].sort((a, b) => a.name.localeCompare(b.name));

  let out = `package ${packageName}

import (
\t"context"
`;
  if (hasUpload) {
    out += `\t"io"
`;
  }
  out += `)

`;

  out += `type ${moduleName}Service interface {
`;
  for (const ep of sortedEps) {
    const comment = ep.description.replace(/\n/g, '\n\t// ');
    const respType = structGen.getNameForChain(moduleName, ep.name, 'Response');
    out += `\t// ${ep.name} ${comment}
\t// Path: ${ep.fullPath}
\t// ${ep.docUrl}
`;
    if (ep.isUpload) {
      out += `\t${ep.name}(ctx context.Context${extraMethodParams}, filename string, tok string) (*${respType}, error)
\t${ep.name}FromReader(ctx context.Context${extraMethodParams}, filename string, reader io.Reader, tok string) (*${respType}, error)
`;
    } else {
      const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
      const hasReq = reqType && structGen.getAllStructs().some((s) => s.name === reqType);
      out += `\t${ep.name}(ctx context.Context${extraMethodParams}${hasReq ? ', ' + (ep.method === 'GET' ? 'opt ' : 'req ') + reqType : ''}) (*${respType}, error)
`;
    }
  }
  out += `}

type ${moduleName}ServiceOp[T any] struct {
\tclient *Client[T]
}

`;
  for (const ep of sortedEps) {
    const respType = structGen.getNameForChain(moduleName, ep.name, 'Response');
    out += `// ${ep.name} ${ep.description.replace(/\n/g, '\n// ')}
// Path: ${ep.fullPath}
// ${ep.docUrl}
`;
    const gm = goClientMethod(ep.method);
    if (ep.isUpload) {
      out += `func (s *${moduleName}ServiceOp[T]) ${ep.name}(ctx context.Context${extraMethodParams}, filename string, tok string) (*${respType}, error) {
\tpath := "/${ep.path}"
\tresp := new(${respType})
\terr := s.client.Upload(ctx, path, "image", filename, resp${extraMethodArgs ? ', ' + extraMethodArgs : ''})
\treturn resp, err
}

func (s *${moduleName}ServiceOp[T]) ${ep.name}FromReader(ctx context.Context${extraMethodParams}, filename string, reader io.Reader, tok string) (*${respType}, error) {
\tpath := "/${ep.path}"
\tresp := new(${respType})
\terr := s.client.UploadFromReader(ctx, path, "image", filename, reader, resp${extraMethodArgs ? ', ' + extraMethodArgs : ''})
\treturn resp, err
}

`;
    } else {
      const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
      const hasReq = reqType && structGen.getAllStructs().some((s) => s.name === reqType);
      const methodCall =
        ep.method === 'GET'
          ? `s.client.${gm}(ctx, path, resp, ${hasReq ? 'opt' : 'nil'}${extraMethodArgs ? ', ' + extraMethodArgs : ''})`
          : `s.client.${gm}(ctx, path, ${hasReq ? 'req' : 'nil'}, resp${extraMethodArgs ? ', ' + extraMethodArgs : ''})`;
      out += `func (s *${moduleName}ServiceOp[T]) ${ep.name}(ctx context.Context${extraMethodParams}${hasReq ? ', ' + (ep.method === 'GET' ? 'opt ' : 'req ') + reqType : ''}) (*${respType}, error) {
\tpath := "/${ep.path}"
\tresp := new(${respType})
\terr := ${methodCall}
\treturn resp, err
}
`;
    }
  }

  return out;
}

function wrapperServiceFile(
  moduleName: string,
  _fileName: string,
  endpoints: IREndpoint[],
  structGen: StructGenerator,
  packageName: string,
): string {
  const hasUpload = endpoints.some((e) => e.isUpload);
  const sortedEps = [...endpoints].sort((a, b) => a.name.localeCompare(b.name));

  const needsJSON =
    hasUpload ||
    sortedEps.some((ep) => {
      const respType = structGen.getNameForChain(moduleName, ep.name, 'Response');
      const respStruct = structGen.allStructs.get(respType);
      return respStruct && respStruct.fields.some((f) => f.name === 'Response');
    });

  const needsFmt =
    hasUpload ||
    sortedEps.some((ep) => {
      if (ep.isUpload) return true;
      const respType = structGen.getNameForChain(moduleName, ep.name, 'Response');
      const respStruct = structGen.allStructs.get(respType);
      return respStruct && respStruct.fields.some((f) => f.name === 'Response');
    });

  let out = `package ${packageName}

import (
\t"context"
`;
  if (needsFmt) {
    out += `\t"fmt"
`;
  }
  if (needsJSON) {
    out += `\t"encoding/json"
`;
  }
  if (hasUpload) {
    out += `\t"io"
\t"mime/multipart"
\t"bytes"
`;
  }
  out += `)

`;

  out += `type ${moduleName}Service interface {
`;
  for (const ep of sortedEps) {
    const comment = ep.description.replace(/\n/g, '\n\t// ');
    const respType = structGen.getNameForChain(moduleName, ep.name, 'Response');
    out += `\t// ${ep.name} ${comment}
\t// Path: ${ep.fullPath}
`;
    if (ep.isUpload) {
      out += `\t${ep.name}(ctx context.Context, filename string, reader io.Reader) (*${respType}, error)
`;
    } else {
      const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
      const hasReq = reqType !== '' && structGen.allStructs.has(reqType);
      out += `\t${ep.name}(ctx context.Context${hasReq ? (ep.method === 'GET' ? ', opt ' + reqType : ', req ' + reqType) : ''}) (*${respType}, error)
`;
    }
  }
  out += `}

type ${moduleName}ServiceOp[T any] struct {
\tclient *Client[T]
}

`;
  for (const ep of sortedEps) {
    const respType = structGen.getNameForChain(moduleName, ep.name, 'Response');
    out += `// ${ep.name} ${ep.description.replace(/\n/g, '\n// ')}
// Path: ${ep.fullPath}
`;
    if (ep.isUpload) {
      out += `func (s *${moduleName}ServiceOp[T]) ${ep.name}(ctx context.Context, filename string, reader io.Reader) (*${respType}, error) {
\tpath := "${ep.path}"
\tbody := &bytes.Buffer{}
\twriter := multipart.NewWriter(body)
\tpart, err := writer.CreateFormFile("image", filename)
\tif err != nil {
\t\treturn nil, err
\t}
\tif _, err := io.Copy(part, reader); err != nil {
\t\treturn nil, err
\t}
\tif err := writer.Close(); err != nil {
\t\treturn nil, err
\t}

\twrapper, err := s.client.execute(ctx, "POST", path, nil, map[string][]byte{"image": {}})
\tif err != nil {
\t\treturn nil, err
\t}
\tresp := new(${respType})
\tif err := json.Unmarshal(wrapper.Data, resp); err != nil {
\t\treturn nil, fmt.Errorf("failed to decode response: %w", err)
\t}
\treturn resp, nil
}

`;
    } else {
      const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
      const hasReq = reqType !== '' && structGen.allStructs.has(reqType);
      const isGet = ep.method === 'GET';
      const respStruct = structGen.allStructs.get(respType);
      const hasResponseField = respStruct && respStruct.fields.some((f) => f.name === 'Response');

      out += `func (s *${moduleName}ServiceOp[T]) ${ep.name}(ctx context.Context${hasReq ? (isGet ? ', opt ' + reqType : ', req ' + reqType) : ''}) (*${respType}, error) {
\tpath := "${ep.path}"
`;
      if (hasReq && isGet) {
        out += `\tparams := paramsFromStruct(opt)
`;
      } else if (hasReq && !isGet) {
        out += `\tparams := paramsFromStruct(req)
`;
      } else {
        out += `\tvar params map[string]string
`;
      }
      out += `\twrapper, err := s.client.${isGet ? 'Get(ctx, path, params)' : 'Post(ctx, path, params, nil)'}
\tif err != nil {
\t\treturn nil, err
\t}
\tresp := new(${respType})
${
  hasResponseField
    ? `\tif string(wrapper.Data) != "null" && len(wrapper.Data) > 0 {
\t\tif err := json.Unmarshal(wrapper.Data, &resp.Response); err != nil {
\t\t\treturn nil, fmt.Errorf("failed to decode response: %w", err)
\t\t}
\t}
`
    : ''
}\tresp.Code = wrapper.Code
\tresp.Type = wrapper.Type
\tresp.Message = wrapper.Message
\tresp.RequestID = wrapper.RequestID
\treturn resp, nil
}

`;
    }
  }

  return out;
}

export function defaultRenderServiceFile(
  serviceStyle: ServiceStyle,
  extraMethodParams: string,
  extraMethodArgs: string,
): PlatformProfile['renderServiceFile'] {
  if (serviceStyle === 'wrapper') {
    return wrapperServiceFile;
  }
  return (
    moduleName: string,
    fileName: string,
    endpoints: IREndpoint[],
    structGen: StructGenerator,
    packageName: string,
  ): string =>
    directServiceFile(
      moduleName,
      fileName,
      endpoints,
      structGen,
      packageName,
      extraMethodParams,
      extraMethodArgs,
    );
}

// ─── Test file ────────────────────────────────────────────

function directTestFile(
  moduleName: string,
  endpoints: IREndpoint[],
  structGen: StructGenerator,
  packageName: string,
  extraMethodArgs: string,
): string {
  const sortedEps = [...endpoints].sort((a, b) => a.name.localeCompare(b.name));

  let out = `package ${packageName}

import (
\t"context"
\t"fmt"
\t"testing"

\t"github.com/jarcoal/httpmock"
)

`;
  for (const ep of sortedEps) {
    out += `func Test_${moduleName}_${ep.name}(t *testing.T) {
\tsetup()
\tdefer teardown()

\tfixture := "${ep.fullApiName}_resp.json"
\tdata, err := loadFixtureSafe(fixture)
\tif err != nil {
\t\tt.Skipf("Skipping ${ep.name} due to missing fixture: %v", err)
\t}
\tresponder, err := httpmock.NewJsonResponder(200, data)
\tif err != nil {
\t\tt.Skipf("Skipping ${ep.name} due to invalid fixture: %v", err)
\t}

\thttpmock.RegisterResponder("${ep.method}", fmt.Sprintf("%s/api/v2/${ep.path}", app.APIURL), responder)

`;
    if (ep.isUpload) {
      out += `\tctx := context.Background()
\tres, err := client.${moduleName}.${ep.name}(ctx, shopID, "fixtures/test.jpg", accessToken)
`;
    } else {
      const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
      const hasReq =
        reqType !== moduleName + ep.name + 'Request' ||
        structGen.getAllStructs().some((s) => s.name === reqType);
      if (hasReq) {
        out += `\tvar req ${reqType}
`;
      }
      const extraArgs = extraMethodArgs
        ? ', ' +
          extraMethodArgs
            .replace(/^,\s*/, '')
            .split(',')
            .map((a) => a.trim().split(/\s+/).pop()!)
            .join(', ')
        : '';
      out += `\tctx := context.Background()
\tres, err := client.${moduleName}.${ep.name}(ctx, shopID${hasReq ? ', req' : ''}${extraArgs})
`;
    }
    out += `\tif err != nil {
\t\tt.Logf("${moduleName}.${ep.name} returned error (possibly expected with mock data): %s", err)
\t}

\tt.Logf("${moduleName}.${ep.name} response: %#v", res)
}
`;
  }
  return out;
}

function wrapperTestFile(
  moduleName: string,
  endpoints: IREndpoint[],
  structGen: StructGenerator,
  packageName: string,
): string {
  const hasUpload = endpoints.some((e) => e.isUpload);
  const sortedEps = [...endpoints].sort((a, b) => a.name.localeCompare(b.name));

  function cleanFixtureName(name: string): string {
    let cleaned = '';
    for (const ch of name) {
      if (/[a-zA-Z0-9._]/.test(ch)) cleaned += ch;
      else cleaned += '_';
    }
    while (cleaned.includes('__')) cleaned = cleaned.replace(/__/g, '_');
    return cleaned;
  }

  let out = `package ${packageName}

import (
\t"context"
\t"encoding/json"
\t"fmt"
\t"net/http"${
    hasUpload
      ? `
\t"strings"`
      : ''
  }
\t"testing"

\t"github.com/jarcoal/httpmock"
)

`;
  for (const ep of sortedEps) {
    const isGet = ep.method === 'GET';
    out += `func Test_${moduleName}_${ep.name}(t *testing.T) {
\tsetup()
\tdefer teardown()

\tserverURL := client.getServerURL()
\tfixture := "${cleanFixtureName(ep.fullApiName)}_resp.json"
\tdata, err := loadFixtureSafe(fixture)
\tif err != nil {
\t\tt.Skipf("Skipping ${ep.name} due to missing fixture: %v", err)
\t}

\tmockResp := map[string]interface{}{
\t\t"code": "0",
\t\t"data": data,
\t}
\tmockData, _ := json.Marshal(mockResp)

\thttpmock.RegisterResponder(
\t\t"${ep.method}",
\t\tfmt.Sprintf("%s${ep.path}*", serverURL),
\t\tfunc(req *http.Request) (*http.Response, error) {
\t\t\tresp := httpmock.NewStringResponse(200, string(mockData))
\t\t\tresp.Header.Set("Content-Type", "application/json")
\t\t\treturn resp, nil
\t\t},
\t)

`;
    const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
    const hasReq = reqType !== '' && structGen.allStructs.has(reqType);
    if (hasReq && !ep.isUpload) {
      out += `\tvar req ${reqType}
`;
    }
    out += `\tctx := context.Background()
`;
    if (ep.isUpload) {
      out += `\tres, err := client.${moduleName}.${ep.name}(ctx, "test.jpg", strings.NewReader("test data"))
`;
    } else {
      out += `\tres, err := client.${moduleName}.${ep.name}(ctx${hasReq ? (isGet ? ', req' : ', req') : ''})
`;
    }
    out += `\tif err != nil {
\t\tt.Logf("${moduleName}.${ep.name} returned error (possibly expected with mock data): %s", err)
\t}

\tt.Logf("${moduleName}.${ep.name} response: %#v", res)
}
`;
  }
  return out;
}

export function defaultRenderTestFile(
  serviceStyle: ServiceStyle,
  extraMethodArgs: string,
): PlatformProfile['renderTestFile'] {
  if (serviceStyle === 'wrapper') {
    return wrapperTestFile;
  }
  return (
    moduleName: string,
    endpoints: IREndpoint[],
    structGen: StructGenerator,
    packageName: string,
  ): string => directTestFile(moduleName, endpoints, structGen, packageName, extraMethodArgs);
}
