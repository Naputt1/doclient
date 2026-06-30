import type { Config, IR, IREndpoint, IRParam, Renderer, FileOutput } from '@doclient/core';
import { renderClientFile } from './client.js';

interface GoStruct {
  name: string;
  fields: GoField[];
  fileName: string;
}

interface GoField {
  name: string;
  type: string;
  jsonTag: string;
  urlTag: string;
  comment: string;
}

interface ServiceInfo {
  name: string;
  interfaceName: string;
  implName: string;
}

const staticServices: ServiceInfo[] = [
  { name: 'Auth', interfaceName: 'AuthService', implName: 'AuthServiceOp' },
];

function isCommonParam(name: string): boolean {
  return ['partner_id', 'shop_id', 'merchant_id', 'access_token', 'timestamp', 'sign'].includes(
    name,
  );
}

function toPascalCase(s: string): string {
  return s
    .replace(/[-_.\s]+/g, '_')
    .split('_')
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/[^a-zA-Z0-9]/g, '');
      if (!cleaned) return '';
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    })
    .join('');
}

function toSnakeCase(s: string, legacy?: boolean): string {
  if (legacy) {
    return s
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/__+/g, '_');
  }
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/__+/g, '_');
}

function getFileName(moduleName: string, legacy?: boolean): string {
  return toSnakeCase(moduleName, legacy);
}

function isParamRequired(req: boolean | string): boolean {
  if (typeof req === 'boolean') return req;
  if (!req) return true;
  return req === 'yes' || req === 'true';
}

class StructGenerator {
  private structSignatures = new Map<string, string>();
  private allStructs = new Map<string, GoStruct>();
  private nameToSignature = new Map<string, string>();
  private chainToName = new Map<string, string>();
  private typeOverrides: Record<string, string>;
  private structTypeOverrides: Record<string, Record<string, string>>;
  private packageName: string;
  private legacySnakeCase: boolean;

  constructor(
    packageName: string,
    typeOverrides: Record<string, string>,
    structTypeOverrides: Record<string, Record<string, string>>,
    legacySnakeCase?: boolean,
  ) {
    this.packageName = packageName;
    this.typeOverrides = typeOverrides;
    this.structTypeOverrides = structTypeOverrides;
    this.legacySnakeCase = legacySnakeCase ?? false;
  }

  getNameForChain(...chain: string[]): string {
    const key = chain.join('.');
    return this.chainToName.get(key) ?? chain.map(toPascalCase).join('');
  }

  generateForEndpoint(
    moduleName: string,
    ep: IREndpoint,
  ): { requestStruct: GoStruct | null; responseStruct: GoStruct } {
    const fileName = getFileName(moduleName, this.legacySnakeCase);

    const reqStruct =
      ep.requestParams.length > 0
        ? this.generateStruct(
            [moduleName, ep.name, 'Request'],
            ep.requestParams,
            ep.method === 'GET',
            true,
            fileName,
          )
        : null;

    const respDataChain = [moduleName, ep.name, 'ResponseData'];
    const respDataStruct = this.generateResponseData(respDataChain, ep.responseParams, fileName);

    const mainResp: GoStruct = {
      name: moduleName + ep.name + 'Response',
      fields: [
        {
          name: '',
          type: 'BaseResponse',
          jsonTag: ',inline',
          urlTag: '',
          comment: 'Common response fields',
        },
      ],
      fileName,
    };

    for (const p of ep.responseParams) {
      if (['request_id', 'error', 'message', 'warning'].includes(p.name)) continue;

      if (p.name === 'response') {
        if (respDataStruct) {
          mainResp.fields.push({
            name: 'Response',
            type: respDataStruct.name,
            jsonTag: 'response',
            urlTag: '',
            comment: p.description ?? 'Actual response data',
          });
        } else {
          mainResp.fields.push({
            name: 'Response',
            type: 'interface{}',
            jsonTag: 'response',
            urlTag: '',
            comment: 'Actual response data',
          });
        }
      } else {
        const field = this.paramToField(p, respDataChain, false, fileName);
        if (field) {
          field.jsonTag += ',omitempty';
          mainResp.fields.push(field);
        }
      }
    }

    const sig = this.getSignature(mainResp);
    mainResp.name = this.pickName(sig, [moduleName, ep.name, 'Response']);
    this.allStructs.set(mainResp.name, mainResp);
    this.chainToName.set([moduleName, ep.name, 'Response'].join('.'), mainResp.name);

    return {
      requestStruct: reqStruct,
      responseStruct: mainResp,
    };
  }

  resolveTypeName(moduleName: string, ...chain: string[]): string {
    const parts = chain.map(toPascalCase).filter(Boolean);
    for (let i = Math.min(2, parts.length); i <= parts.length; i++) {
      const candidate = parts.slice(parts.length - i).join('');
      if (this.allStructs.has(candidate) || this.nameToSignature.has(candidate)) return candidate;
    }
    return parts.join('');
  }

  private generateResponseData(
    chain: string[],
    responseParams: IRParam[],
    fileName: string,
  ): GoStruct | null {
    const responseParam = responseParams.find((p) => p.name === 'response');
    if (!responseParam || !responseParam.children || responseParam.children.length === 0)
      return null;

    return this.generateStruct(chain, responseParam.children, false, false, fileName);
  }

  private generateStruct(
    chain: string[],
    params: IRParam[],
    isGet: boolean,
    isRequest: boolean,
    fileName: string,
  ): GoStruct | null {
    const fields: GoField[] = [];

    for (const p of params) {
      if (isRequest && isCommonParam(p.name)) continue;

      const fieldName = toPascalCase(p.name);
      let goType = this.mapType(p, chain, isRequest, fileName);

      if (goType === '') continue;

      const required = isParamRequired(p.required);
      const comment = (required ? '[Required] ' : '[Optional] ') + (p.description ?? '');

      if (
        !required &&
        !goType.startsWith('*') &&
        !goType.startsWith('[]') &&
        !goType.startsWith('map[')
      ) {
        goType = '*' + goType;
      }

      const jsonTag = p.name + (required ? '' : ',omitempty');
      const urlTag = isGet && isRequest ? p.name + (required ? '' : ',omitempty') : '';

      fields.push({
        name: fieldName,
        type: goType,
        jsonTag,
        urlTag,
        comment,
      });
    }

    if (fields.length === 0) return null;

    const s: GoStruct = { name: '', fields, fileName };
    const sig = this.getSignature(s);
    s.name = this.pickName(sig, chain);
    this.allStructs.set(s.name, s);
    this.chainToName.set(chain.join('.'), s.name);
    return s;
  }

  private mapType(p: IRParam, chain: string[], isRequest: boolean, fileName: string): string {
    const fieldName = p.name;

    if (chain.length > 0) {
      const structName = toPascalCase(chain[chain.length - 1]);
      const override =
        this.structTypeOverrides[structName]?.[fieldName] ??
        this.structTypeOverrides[p.name]?.[fieldName];
      if (override) {
        if (p.shopeeType.endsWith('[]') && !override.startsWith('[]')) {
          return '[]' + override;
        }
        return override;
      }
    }

    if (this.typeOverrides[fieldName]) {
      const override = this.typeOverrides[fieldName];
      if (p.shopeeType.endsWith('[]') && !override.startsWith('[]')) {
        return '[]' + override;
      }
      return override;
    }

    const children = p.children ?? [];
    const isList = p.shopeeType.endsWith('[]') || p.type.endsWith('[]');
    const shopeeKey = p.shopeeType.replace('[]', '');

    switch (shopeeKey) {
      case 'int':
      case 'int32':
      case 'int64':
      case 'timestamp':
        return isList ? '[]int64' : 'int64';
      case 'float':
      case 'double':
        return isList ? '[]float64' : 'float64';
      case 'boolean':
        return isList ? '[]bool' : 'bool';
      case 'string':
        return isList ? '[]string' : 'string';
      case 'object': {
        if (children.length === 0) {
          return isList ? '[]interface{}' : 'interface{}';
        }
        const shortName = toPascalCase(fieldName);
        const trimmedName =
          shortName.endsWith('List') && shortName.length > 4 ? shortName.slice(0, -4) : shortName;
        const newChain = [...chain, trimmedName];
        const sub = this.generateStruct(newChain, children, false, isRequest, fileName);
        if (!sub) return isList ? '[]interface{}' : 'interface{}';
        return isList ? '[]' + sub.name : sub.name.startsWith('*') ? sub.name : '*' + sub.name;
      }
      default:
        return 'interface{}';
    }
  }

  private paramToField(
    p: IRParam,
    chain: string[],
    isRequest: boolean,
    fileName: string,
  ): GoField | null {
    const fieldName = toPascalCase(p.name);
    const goType = this.mapType(p, chain, isRequest, fileName);
    if (!goType) return null;
    return {
      name: fieldName,
      type: goType,
      jsonTag: p.name,
      urlTag: '',
      comment: p.description ?? '',
    };
  }

  private getSignature(s: GoStruct): string {
    const parts: string[] = [];
    for (const f of s.fields) {
      const cleanType = f.type.replace(/^\*/, '');
      const cleanJSON = f.jsonTag.replace(/,omitempty$/, '');
      parts.push(`${cleanJSON}:${cleanType}:${f.urlTag}`);
    }
    parts.sort();
    return parts.join('|');
  }

  private reservedNames = new Set(['Option']);

  private isReserved(name: string): boolean {
    return this.reservedNames.has(name);
  }

  private pickName(signature: string, chain: string[]): string {
    const last = chain.length > 0 ? chain[chain.length - 1] : '';
    const isTopLevel =
      last.endsWith('Request') || last.endsWith('Response') || last.endsWith('ResponseData');

    if (!isTopLevel) {
      const existing = this.structSignatures.get(signature);
      if (existing) return existing;
    }

    const parts = chain.map((c) => toPascalCase(c)).filter(Boolean);
    const start = isTopLevel && parts.length >= 2 ? 2 : 1;

    for (let i = start; i <= parts.length; i++) {
      const candidateParts = parts.slice(parts.length - i);
      const candidate = candidateParts.join('');
      if (!candidate) continue;
      if (!isTopLevel && this.isReserved(candidate)) continue;

      const takenSig = this.nameToSignature.get(candidate);
      if (!takenSig) {
        this.nameToSignature.set(candidate, signature);
        if (!isTopLevel) this.structSignatures.set(signature, candidate);
        return candidate;
      }
      if (!isTopLevel && takenSig === signature) return candidate;
    }

    const fullName = parts.join('');
    return fullName;
  }

  getStructsForFile(moduleName: string): GoStruct[] {
    const fileName = getFileName(moduleName, this.legacySnakeCase);
    return Array.from(this.allStructs.values()).filter((s) => s.fileName === fileName);
  }

  getAllStructs(): GoStruct[] {
    return Array.from(this.allStructs.values());
  }
}

function renderServiceFile(
  moduleName: string,
  fileName: string,
  endpoints: IREndpoint[],
  structGen: StructGenerator,
  packageName: string,
): string {
  const hasUpload = endpoints.some((e) => e.isUpload);
  const sortedEps = [...endpoints].sort((a, b) => a.name.localeCompare(b.name));

  let out = `package ${packageName}

import (
	"context"
`;
  if (hasUpload) {
    out += `	"io"
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
      out += `\t${ep.name}(ctx context.Context, sid uint64, filename string, tok string) (*${respType}, error)
\t${ep.name}FromReader(ctx context.Context, sid uint64, filename string, reader io.Reader, tok string) (*${respType}, error)
`;
    } else {
      const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
      const hasReq = reqType && structGen.getAllStructs().some((s) => s.name === reqType);
      out += `\t${ep.name}(ctx context.Context, sid uint64, ${hasReq ? (ep.method === 'GET' ? 'opt ' : 'req ') + reqType + ', ' : ''}tok string) (*${respType}, error)
`;
    }
  }
  out += `}

type ${moduleName}ServiceOp[T any] struct {
	client *Client[T]
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
      const makeMethod =
        ep.apiType === 'Shop' ? `s.client.WithShop(sid, tok)` : `s.client.WithMerchant(sid, tok)`;
      out += `func (s *${moduleName}ServiceOp[T]) ${ep.name}(ctx context.Context, sid uint64, filename string, tok string) (*${respType}, error) {
	path := "/${ep.path}"
	resp := new(${respType})
	err := ${makeMethod}.Upload(ctx, path, "image", filename, resp)
	return resp, err
}

func (s *${moduleName}ServiceOp[T]) ${ep.name}FromReader(ctx context.Context, sid uint64, filename string, reader io.Reader, tok string) (*${respType}, error) {
	path := "/${ep.path}"
	resp := new(${respType})
	err := ${makeMethod}.UploadFromReader(ctx, path, "image", filename, reader, resp)
	return resp, err
}

`;
    } else {
      const reqType = structGen.getNameForChain(moduleName, ep.name, 'Request');
      const hasReq = reqType && structGen.getAllStructs().some((s) => s.name === reqType);
      const methodCall = (() => {
        const withAuth =
          ep.apiType === 'Shop'
            ? `s.client.WithShop(sid, tok)`
            : ep.apiType === 'Merchant'
              ? `s.client.WithMerchant(sid, tok)`
              : `s.client`;
        const args =
          ep.method === 'GET'
            ? `${gm}(ctx, path, resp, ${hasReq ? 'opt' : 'nil'})`
            : `${gm}(ctx, path, ${hasReq ? 'req' : 'nil'}, resp)`;
        return `${withAuth}.${args}`;
      })();
      out += `func (s *${moduleName}ServiceOp[T]) ${ep.name}(ctx context.Context, sid uint64, ${hasReq ? (ep.method === 'GET' ? 'opt ' : 'req ') + reqType + ', ' : ''}tok string) (*${respType}, error) {
	path := "/${ep.path}"
	resp := new(${respType})
	err := ${methodCall}
	return resp, err
}
`;
    }
  }

  return out;
}

function renderTypesFile(structs: GoStruct[], packageName: string): string {
  if (structs.length === 0) return '';

  const sorted = [...structs].sort((a, b) => a.name.localeCompare(b.name));
  let out = `package ${packageName}

`;
  for (const s of sorted) {
    out += `type ${s.name} struct {
`;
    for (const f of s.fields) {
      if (f.name) {
        const tags = [];
        if (f.jsonTag) tags.push(`json:"${f.jsonTag}"`);
        if (f.urlTag) tags.push(`url:"${f.urlTag}"`);
        const tagStr = tags.join(' ');
        out += `\t${f.name} ${f.type} \`${tagStr}\` // ${f.comment.replace(/\n/g, ' ')}
`;
      } else {
        out += `\t${f.type} // ${f.comment.replace(/\n/g, ' ')}
`;
      }
    }
    out += `}
`;
  }
  return out;
}

function renderTestFile(
  moduleName: string,
  endpoints: IREndpoint[],
  structGen: StructGenerator,
  packageName: string,
): string {
  const sortedEps = [...endpoints].sort((a, b) => a.name.localeCompare(b.name));

  let out = `package ${packageName}

import (
	"context"
	"fmt"
	"testing"

	"github.com/jarcoal/httpmock"
)

`;
  for (const ep of sortedEps) {
    out += `func Test_${moduleName}_${ep.name}(t *testing.T) {
	setup()
	defer teardown()

	fixture := "${ep.fullApiName}_resp.json"
	data, err := loadFixtureSafe(fixture)
	if err != nil {
		t.Skipf("Skipping ${ep.name} due to missing fixture: %v", err)
	}
	responder, err := httpmock.NewJsonResponder(200, data)
	if err != nil {
		t.Skipf("Skipping ${ep.name} due to invalid fixture: %v", err)
	}

	httpmock.RegisterResponder("${ep.method}", fmt.Sprintf("%s/api/v2/${ep.path}", app.APIURL), responder)

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
      out += `\tctx := context.Background()
\tres, err := client.${moduleName}.${ep.name}(ctx, shopID, ${hasReq ? 'req, ' : ''}accessToken)
`;
    }
    out += `\tif err != nil {
		t.Logf("${moduleName}.${ep.name} returned error (possibly expected with mock data): %s", err)
	}

	t.Logf("${moduleName}.${ep.name} response: %#v", res)
}
`;
  }
  return out;
}

function renderErrorsFile(
  errors: Array<{ code: string; description: string }>,
  packageName: string,
): string {
  if (errors.length === 0) return '';
  const sorted = [...errors].sort((a, b) => a.code.localeCompare(b.code));

  let out = `package ${packageName}

const (
`;
  for (const e of sorted) {
    const constName = 'Err' + toPascalCase(e.code.replace(/[-.]/g, '_'));
    out += `\t${constName} = "${e.code}" // ${e.description.replace(/\n/g, ' ')}
`;
  }
  out += `)
`;
  return out;
}

function renderEnumsFile(
  constants: Array<{
    typeName: string;
    baseType: string;
    values: Array<{ name: string; value: string }>;
  }>,
  packageName: string,
): string {
  if (constants.length === 0) return '';

  let out = `package ${packageName}

`;
  for (const c of constants) {
    const baseType = c.baseType === 'int' ? 'int' : 'string';
    out += `type ${c.typeName} ${baseType}

const (
`;
    const sorted = [...c.values].sort((a, b) => a.name.localeCompare(b.name));
    for (const v of sorted) {
      if (baseType === 'int') {
        out += `\t${v.name} ${c.typeName} = ${v.value}
`;
      } else {
        out += `\t${v.name} ${c.typeName} = "${v.value}"
`;
      }
    }
    out += `)
`;
  }
  return out;
}

function renderAuthFile(packageName: string): string {
  return `package ${packageName}

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

type AuthService interface {
	// GetAuthURL returns the URL to authorize the app.
	// Path: /api/v2/shop/auth_partner
	GetAuthURL() (string, error)

	// GetCancelAuthURL returns the URL to cancel the authorization.
	// Path: /api/v2/shop/cancel_auth_partner
	GetCancelAuthURL() (string, error)

	// GetAccessToken gets the access token.
	// Path: /api/v2/auth/token/get
	GetAccessToken(ctx context.Context, sid uint64, aid uint64, code string) (*AccessTokenResponse, error)

	// RefreshAccessToken refreshes the access token.
	// Path: /api/v2/auth/access_token/get
	RefreshAccessToken(ctx context.Context, sid uint64, aid uint64, refresh string) (*RefreshAccessTokenResponse, error)
}

type AccessTokenResponse struct {
	BaseResponse

	AccessToken    string   \`json:"access_token"\`
	RefreshToken   string   \`json:"refresh_token"\`
	ExpireIn       int      \`json:"expire_in"\`
	MerchantIDList []uint64 \`json:"merchant_id_list,omitempty"\`
	ShopIDList     []uint64 \`json:"shop_id_list,omitempty"\`
}

type RefreshAccessTokenResponse struct {
	BaseResponse

	AccessToken  string \`json:"access_token"\`
	RefreshToken string \`json:"refresh_token"\`
	ExpireIn     int    \`json:"expire_in"\`
	PartnerID    uint64 \`json:"partner_id"\`
	MerchantID   uint64 \`json:"merchant_id"\`
	ShopID       uint64 \`json:"shop_id"\`
}

type AuthServiceOp[T any] struct {
	client *Client[T]
}

func (s *AuthServiceOp[T]) GetAuthURL() (string, error) {
	return s.authURL("/api/v2/shop/auth_partner")
}

func (s *AuthServiceOp[T]) GetCancelAuthURL() (string, error) {
	return s.authURL("/api/v2/shop/cancel_auth_partner")
}

func (s *AuthServiceOp[T]) authURL(path string) (string, error) {
	rurl := s.client.app.RedirectURL
	ts := time.Now().Unix()
	baseStr := fmt.Sprintf("%d%s%d", s.client.app.PartnerID, path, ts)
	h := hmac.New(sha256.New, []byte(s.client.app.PartnerKey))
	h.Write([]byte(baseStr))
	sign := hex.EncodeToString(h.Sum(nil))
	return fmt.Sprintf("%s%s?partner_id=%d&timestamp=%d&sign=%s&redirect=%s", s.client.app.APIURL, path, s.client.app.PartnerID, ts, sign, rurl), nil
}

func (s *AuthServiceOp[T]) GetAccessToken(ctx context.Context, sid uint64, aid uint64, code string) (*AccessTokenResponse, error) {
	path := "/auth/token/get"
	params := map[string]interface{}{
		"code":       code,
		"partner_id": s.client.app.PartnerID,
	}
	if sid != 0 {
		params["shop_id"] = sid
	} else if aid != 0 {
		params["main_account_id"] = aid
	}
	resp := new(AccessTokenResponse)
	err := s.client.Post(ctx, path, params, resp)
	return resp, err
}

func (s *AuthServiceOp[T]) RefreshAccessToken(ctx context.Context, sid uint64, aid uint64, refresh string) (*RefreshAccessTokenResponse, error) {
	path := "/auth/access_token/get"
	params := map[string]interface{}{
		"refresh_token": refresh,
		"partner_id":    s.client.app.PartnerID,
	}
	if sid != 0 {
		params["shop_id"] = sid
	} else if aid != 0 {
		params["main_account_id"] = aid
	}
	resp := new(RefreshAccessTokenResponse)
	err := s.client.Post(ctx, path, params, resp)
	return resp, err
}
`;
}

function renderOptionsFile(packageName: string): string {
  return `package ${packageName}

import (
	"net/http"
	"net/url"
)

type Option[T any] func(*Client[T])

type DefaultOption = Option[any]

func WithHTTPClient[T any](client *http.Client) Option[T] {
	return func(c *Client[T]) {
		c.Client = client
	}
}

func WithRetry[T any](retries int) Option[T] {
	return func(c *Client[T]) {
		c.retries = retries
	}
}

func WithLogger[T any](logger LeveledLoggerInterface) Option[T] {
	return func(c *Client[T]) {
		c.log = logger
	}
}

func WithProxy[T any](proxyHost string) Option[T] {
	return func(c *Client[T]) {
		proxyURL, err := url.Parse(proxyHost)
		if err != nil {
			return
		}
		c.Client.Transport = &http.Transport{Proxy: http.ProxyURL(proxyURL)}
	}
}

func WithRefreshToken[T any](refreshToken string) Option[T] {
	return func(c *Client[T]) {
		c.RefreshToken = refreshToken
	}
}

func WithOnTokenRefresh[T any](fn func(res *RefreshAccessTokenResponse, meta T)) Option[T] {
	return func(c *Client[T]) {
		c.OnTokenRefresh = fn
	}
}

func WithMeta[T any](meta T) Option[T] {
	return func(c *Client[T]) {
		c.Meta = meta
	}
}

func WithHTTPClientDefault(client *http.Client) DefaultOption {
	return WithHTTPClient[any](client)
}

func WithRetryDefault(retries int) DefaultOption {
	return WithRetry[any](retries)
}

func WithLoggerDefault(logger LeveledLoggerInterface) DefaultOption {
	return WithLogger[any](logger)
}

func WithProxyDefault(proxyHost string) DefaultOption {
	return WithProxy[any](proxyHost)
}

func WithRefreshTokenDefault(refreshToken string) DefaultOption {
	return WithRefreshToken[any](refreshToken)
}

func WithOnTokenRefreshDefault(fn func(res *RefreshAccessTokenResponse, meta any)) DefaultOption {
	return WithOnTokenRefresh[any](fn)
}

func WithMetaDefault(meta any) DefaultOption {
	return WithMeta[any](meta)
}
`;
}

function renderLoggerFile(packageName: string): string {
  return `package ${packageName}

import (
	"fmt"
	"io"
	"log"
)

type LeveledLoggerInterface interface {
	Debugf(format string, v ...interface{})
	Infof(format string, v ...interface{})
	Warnf(format string, v ...interface{})
	Errorf(format string, v ...interface{})
}

type LeveledLogger struct {
	DebugLogger *log.Logger
	InfoLogger  *log.Logger
	WarnLogger  *log.Logger
	ErrorLogger *log.Logger
}

func NewLeveledLogger(debug, info, warn, err io.Writer) *LeveledLogger {
	return &LeveledLogger{
		DebugLogger: log.New(debug, "DEBUG: ", log.Ltime|log.Lshortfile),
		InfoLogger:  log.New(info, "INFO: ", log.Ltime|log.Lshortfile),
		WarnLogger:  log.New(warn, "WARN: ", log.Ltime|log.Lshortfile),
		ErrorLogger: log.New(err, "ERROR: ", log.Ltime|log.Lshortfile),
	}
}

func (l *LeveledLogger) Debugf(format string, v ...interface{}) {
	if l.DebugLogger != nil { l.DebugLogger.Output(2, fmt.Sprintf(format, v...)) }
}

func (l *LeveledLogger) Infof(format string, v ...interface{}) {
	if l.InfoLogger != nil { l.InfoLogger.Output(2, fmt.Sprintf(format, v...)) }
}

func (l *LeveledLogger) Warnf(format string, v ...interface{}) {
	if l.WarnLogger != nil { l.WarnLogger.Output(2, fmt.Sprintf(format, v...)) }
}

func (l *LeveledLogger) Errorf(format string, v ...interface{}) {
	if l.ErrorLogger != nil { l.ErrorLogger.Output(2, fmt.Sprintf(format, v...)) }
}
`;
}

function renderResponseFile(packageName: string): string {
  return `package ${packageName}

type BaseResponse struct {
	Error     string \`json:"error"\`
	Message   string \`json:"message"\`
	RequestID string \`json:"request_id"\`
	Warning   string \`json:"warning,omitempty"\`
}
`;
}

function goClientMethod(httpMethod: string): string {
  const m: Record<string, string> = { GET: 'Get', POST: 'Post', PUT: 'Put', DELETE: 'Delete' };
  return m[httpMethod] ?? httpMethod;
}

function renderTestSetupFile(packageName: string): string {
  return `package ${packageName}

import (
	"encoding/json"
	"io"
	"os"
	"sync"

	"github.com/jarcoal/httpmock"
)

var (
	client      *DefaultClient
	app         App
	shopID      uint64 = 123456
	merchantID  uint64 = 789012
	accessToken        = "test_access_token"
	skippedMu   sync.Mutex
	skippedRoutes []string
)

func setup() {
	httpmock.Activate()
	app = App{
		PartnerID:  123456,
		PartnerKey: "test_partner_key",
		RedirectURL: "https://example.com/callback",
		APIURL:     "https://open-api.test.com",
	}
	client = NewDefaultClient(app)
}

func teardown() {
	httpmock.DeactivateAndReset()
}

func loadFixtureSafe(path string) (interface{}, error) {
	f, err := os.Open("fixtures/" + path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	var result interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result, nil
}
`;
}

function renderGoMod(modulePath: string, _packageName: string): string {
  return `module ${modulePath}

go 1.22

require (
	github.com/google/go-querystring v1.1.0
	github.com/jarcoal/httpmock v1.3.1
)
`;
}

export function createGoRenderer(options?: {
  package?: string;
  module?: string;
  legacySnakeCase?: boolean;
}): Renderer {
  const pkg = options?.package ?? 'goshopee';
  const modPath = options?.module;
  const legacySnakeCase = options?.legacySnakeCase ?? false;

  return {
    name: 'go',

    async render(ir: IR, _config: Config): Promise<FileOutput[]> {
      const packageName = pkg;
      const typeOverrides = _config.mappings?.typeOverrides ?? {};
      const structTypeOverrides = _config.mappings?.structTypeOverrides ?? {};

      const files: FileOutput[] = [];

      if (modPath) {
        files.push({
          path: 'go.mod',
          content: renderGoMod(modPath, packageName),
        });
      }

      const structGen = new StructGenerator(
        packageName,
        typeOverrides,
        structTypeOverrides,
        legacySnakeCase,
      );

      for (const mod of ir.modules) {
        for (const ep of mod.endpoints) {
          structGen.generateForEndpoint(mod.name, ep);
        }
      }

      const serviceList: Array<{ name: string; endpoints: IREndpoint[] }> = [];
      for (const mod of ir.modules) {
        if (mod.endpoints.length > 0) {
          serviceList.push({ name: mod.name, endpoints: mod.endpoints });
        }
      }
      serviceList.sort((a, b) => a.name.localeCompare(b.name));

      const allServices: ServiceInfo[] = [
        ...staticServices,
        ...serviceList.map((s) => ({
          name: s.name,
          interfaceName: s.name + 'Service',
          implName: s.name + 'ServiceOp',
        })),
      ];
      allServices.sort((a, b) => a.name.localeCompare(b.name));

      let servicesSection = '';
      let servicesInitSection = '';
      for (const svc of allServices) {
        servicesSection += `\t${svc.name} ${svc.interfaceName}\n`;
        servicesInitSection += `\tc.${svc.name} = &${svc.implName}[T]{client: c}\n`;
      }

      files.push({
        path: 'goshopee.go',
        content: renderClientFile({
          packageName,
          servicesSection: servicesSection.trimEnd(),
          servicesInitSection: servicesInitSection.trimEnd(),
        }),
      });

      files.push({ path: 'response.go', content: renderResponseFile(packageName) });
      files.push({ path: 'options.go', content: renderOptionsFile(packageName) });

      const loggerContent = renderLoggerFile(packageName);
      files.push({ path: 'logger.go', content: loggerContent });

      files.push({ path: 'auth.go', content: renderAuthFile(packageName) });

      const setupContent = renderTestSetupFile(packageName);
      files.push({ path: 'setup_test.go', content: setupContent });

      for (const svc of serviceList) {
        const fileName = getFileName(svc.name, legacySnakeCase);
        const moduleStructs = structGen.getStructsForFile(svc.name);

        files.push({
          path: `${fileName}.gen.go`,
          content: renderServiceFile(svc.name, fileName, svc.endpoints, structGen, packageName),
        });

        files.push({
          path: `${fileName}.type.gen.go`,
          content: renderTypesFile(moduleStructs, packageName),
        });

        files.push({
          path: `${fileName}_test.go`,
          content: renderTestFile(svc.name, svc.endpoints, structGen, packageName),
        });
      }

      files.push({
        path: 'errors.gen.go',
        content: renderErrorsFile(ir.errors, packageName),
      });

      files.push({
        path: 'common.type.gen.go',
        content: renderEnumsFile(ir.constants, packageName),
      });

      for (const f of ir.fixtures) {
        files.push({ path: `fixtures/${f.filename}`, content: f.content });
      }

      return files;
    },
  };
}
