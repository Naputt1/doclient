import type { Config, IR, IREndpoint, IRParam, Renderer, FileOutput } from '@doclient/core';
import type { PlatformProfile } from './platform-profile.js';

// Note: the client template (`renderClientFile`) is provided by each PlatformProfile,
// not imported here. Profile examples live in profiles/shopee.ts and profiles/lazada.ts.

export interface GoStruct {
  name: string;
  fields: GoField[];
  fileName: string;
}

export interface GoField {
  name: string;
  type: string;
  jsonTag: string;
  urlTag: string;
  comment: string;
}

export interface ServiceInfo {
  name: string;
  interfaceName: string;
  implName: string;
}

export function toPascalCase(s: string): string {
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

export function toSnakeCase(s: string, legacy?: boolean): string {
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

export function getFileName(moduleName: string, legacy?: boolean): string {
  return toSnakeCase(moduleName, legacy);
}

export function isParamRequired(req: boolean | string): boolean {
  if (typeof req === 'boolean') return req;
  if (!req) return true;
  return req === 'yes' || req === 'true';
}

export class StructGenerator {
  private structSignatures = new Map<string, string>();
  allStructs = new Map<string, GoStruct>();
  private nameToSignature = new Map<string, string>();
  chainToName = new Map<string, string>();
  typeOverrides: Record<string, string>;
  structTypeOverrides: Record<string, Record<string, string>>;
  packageName: string;
  legacySnakeCase: boolean;

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

  generateResponseDataWith(
    responseFieldName: string,
    chain: string[],
    responseParams: IRParam[],
    fileName: string,
  ): GoStruct | null {
    const responseParam = responseParams.find((p) => p.name === responseFieldName);
    if (!responseParam || !responseParam.children || responseParam.children.length === 0)
      return null;

    return this.generateStruct(chain, responseParam.children, false, false, fileName);
  }

  resolveTypeName(moduleName: string, ...chain: string[]): string {
    const parts = chain.map(toPascalCase).filter(Boolean);
    for (let i = Math.min(2, parts.length); i <= parts.length; i++) {
      const candidate = parts.slice(parts.length - i).join('');
      if (this.allStructs.has(candidate) || this.nameToSignature.has(candidate)) return candidate;
    }
    return parts.join('');
  }

  generateStruct(
    chain: string[],
    params: IRParam[],
    isGet: boolean,
    isRequest: boolean,
    fileName: string,
    skipParam?: (name: string) => boolean,
  ): GoStruct | null {
    const fields: GoField[] = [];

    for (const p of params) {
      if (skipParam && skipParam(p.name)) continue;

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

  mapType(p: IRParam, chain: string[], isRequest: boolean, fileName: string): string {
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

  paramToField(p: IRParam, chain: string[], isRequest: boolean, fileName: string): GoField | null {
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

  getSignature(s: GoStruct): string {
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

  isReserved(name: string): boolean {
    return this.reservedNames.has(name);
  }

  pickName(signature: string, chain: string[]): string {
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

export function goClientMethod(httpMethod: string): string {
  const m: Record<string, string> = { GET: 'Get', POST: 'Post', PUT: 'Put', DELETE: 'Delete' };
  return m[httpMethod] ?? httpMethod;
}

export function renderTypesFile(structs: GoStruct[], packageName: string): string {
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

export function renderErrorsFile(
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

export function renderEnumsFile(
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

export function renderOptionsFile(packageName: string): string {
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

export function renderLoggerFile(packageName: string): string {
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

/**
 * Create a Go renderer using a platform profile.
 * The profile defines all platform-specific templates (client, auth, response, etc.),
 * while the renderer handles the common pipeline (iterating modules, building structs,
 * organizing files).
 *
 * @example
 * ```ts
 * import { createGoRenderer, shopeeProfile } from '@doclient/renderer-go';
 * export default defineConfig({
 *   output: createGoRenderer(shopeeProfile, { package: 'goshopee', module: '...' }),
 * });
 * ```
 */
export function createGoRenderer(
  profile: PlatformProfile,
  options?: {
    package?: string;
    module?: string;
    legacySnakeCase?: boolean;
  },
): Renderer {
  const staticServices: ServiceInfo[] = [
    { name: 'Auth', interfaceName: 'AuthService', implName: 'AuthServiceOp' },
  ];

  return {
    name: `go-${profile.name}`,

    async render(ir: IR, _config: Config): Promise<FileOutput[]> {
      const packageName = options?.package ?? `${profile.name}go`;
      const modPath = options?.module;
      const legacySnakeCase = options?.legacySnakeCase ?? false;
      const typeOverrides = _config.mappings?.typeOverrides ?? {};
      const structTypeOverrides = _config.mappings?.structTypeOverrides ?? {};

      const files: FileOutput[] = [];

      if (modPath) {
        files.push({
          path: 'go.mod',
          content: profile.renderGoMod(modPath, packageName),
        });
      }

      const structGen = new StructGenerator(
        packageName,
        typeOverrides,
        structTypeOverrides,
        legacySnakeCase,
      );

      const build = profile.buildEndpointStructs ?? defaultBuildEndpointStructs(profile);
      for (const mod of ir.modules) {
        for (const ep of mod.endpoints) {
          build(structGen, mod.name, ep);
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
        path: `${packageName}.go`,
        content: profile.renderClientFile(
          packageName,
          servicesSection.trimEnd(),
          servicesInitSection.trimEnd(),
        ),
      });

      files.push({ path: 'response.go', content: profile.renderResponseFile(packageName) });
      files.push({ path: 'options.go', content: renderOptionsFile(packageName) });
      files.push({ path: 'logger.go', content: renderLoggerFile(packageName) });
      files.push({ path: 'auth.go', content: profile.renderAuthFile(packageName) });
      files.push({ path: 'setup_test.go', content: profile.renderTestSetupFile(packageName) });

      for (const svc of serviceList) {
        const fileName = getFileName(svc.name, legacySnakeCase);
        const moduleStructs = structGen.getStructsForFile(svc.name);

        files.push({
          path: `${fileName}.gen.go`,
          content: profile.renderServiceFile(
            svc.name,
            fileName,
            svc.endpoints,
            structGen,
            packageName,
          ),
        });

        files.push({
          path: `${fileName}.type.gen.go`,
          content: renderTypesFile(moduleStructs, packageName),
        });

        files.push({
          path: `${fileName}_test.go`,
          content: profile.renderTestFile(svc.name, svc.endpoints, structGen, packageName),
        });
      }

      const errorsContent = renderErrorsFile(ir.errors, packageName);
      if (errorsContent) {
        files.push({ path: 'errors.gen.go', content: errorsContent });
      }

      const enumsContent = renderEnumsFile(ir.constants, packageName);
      if (enumsContent) {
        files.push({ path: 'common.type.gen.go', content: enumsContent });
      }

      for (const f of ir.fixtures) {
        files.push({ path: `fixtures/${f.filename}`, content: f.content });
      }

      return files;
    },
  };
}

/**
 * Default struct building using profile's `responseDataFieldName`, `commonFields`,
 * and `commonRequestFields`. Returns a function suitable for `buildEndpointStructs`.
 */
export function defaultBuildEndpointStructs(profile: PlatformProfile) {
  return function build(structGen: StructGenerator, moduleName: string, ep: IREndpoint): void {
    const fileName = getFileName(moduleName, structGen.legacySnakeCase);

    const skipReqParam =
      profile.commonRequestFields && profile.commonRequestFields.length > 0
        ? (name: string) => profile.commonRequestFields.includes(name)
        : undefined;

    structGen.generateStruct(
      [moduleName, ep.name, 'Request'],
      ep.requestParams,
      ep.method === 'GET',
      true,
      fileName,
      skipReqParam,
    );

    const respDataChain = [moduleName, ep.name, 'ResponseData'];
    const respDataStruct = structGen.generateResponseDataWith(
      profile.responseDataFieldName,
      respDataChain,
      ep.responseParams,
      fileName,
    );

    const mainResp: GoStruct = {
      name: '',
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

    const commonFields = new Set(profile.commonFields);
    const dataParam = ep.responseParams.find((p) => p.name === profile.responseDataFieldName);

    if (respDataStruct) {
      mainResp.fields.push({
        name: 'Response',
        type: respDataStruct.name,
        jsonTag: profile.responseDataFieldName,
        urlTag: '',
        comment: 'Response data',
      });
    } else if (dataParam && dataParam.type === 'object[]') {
      mainResp.fields.push({
        name: 'Response',
        type: '[]interface{}',
        jsonTag: profile.responseDataFieldName,
        urlTag: '',
        comment: 'Response data',
      });
    } else if (dataParam && !dataParam.type.startsWith('object')) {
      const scalarType = goScalarType(dataParam.type);
      mainResp.fields.push({
        name: 'Response',
        type: scalarType,
        jsonTag: profile.responseDataFieldName,
        urlTag: '',
        comment: 'Response data',
      });
    }

    for (const p of ep.responseParams) {
      if (commonFields.has(p.name) || p.name === profile.responseDataFieldName) continue;
      const field = structGen.paramToField(p, respDataChain, false, fileName);
      if (field) {
        field.jsonTag += ',omitempty';
        mainResp.fields.push(field);
      }
    }

    const sig = structGen.getSignature(mainResp);
    mainResp.name = structGen.pickName(sig, [moduleName, ep.name, 'Response']);
    structGen.allStructs.set(mainResp.name, mainResp);
    structGen.chainToName.set([moduleName, ep.name, 'Response'].join('.'), mainResp.name);
  };
}

function goScalarType(irType: string): string {
  switch (irType) {
    case 'integer':
      return 'int64';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'bool';
    case 'string':
      return 'string';
    default:
      return 'interface{}';
  }
}
