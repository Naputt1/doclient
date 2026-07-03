import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import type {
  Config,
  IR,
  IRModule,
  IREndpoint,
  IRParam,
  IRError,
  SourceAdapter,
} from '@doclient/core';
import { toPascalCase } from '@doclient/core';

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description?: string }>;
  paths: Record<string, PathItem>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
}

interface Operation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseObject>;
}

interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema: Schema;
}

interface RequestBody {
  required?: boolean;
  content?: Record<string, MediaType>;
}

interface ResponseObject {
  description: string;
  content?: Record<string, MediaType>;
}

interface MediaType {
  schema: Schema;
}

interface Schema {
  type?: string;
  format?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  $ref?: string;
  additionalProperties?: boolean | Schema;
  enum?: string[];
  oneOf?: Schema[];
  allOf?: Schema[];
}

function openAPITypeToIRType(schema: Schema): string {
  if (schema.$ref) return 'object';
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'int':
    case 'long':
      return 'integer';
    case 'number':
    case 'double':
    case 'float':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array': {
      if (!schema.items) return 'object[]';
      const itemType = openAPITypeToIRType(schema.items);
      return itemType + '[]';
    }
    default:
      return 'string';
  }
}

function schemaToIRParams(schema: Schema, requiredFields: string[], parentName: string): IRParam[] {
  if (!schema.properties) return [];
  const params: IRParam[] = [];
  for (const [name, propSchema] of Object.entries(schema.properties)) {
    const irType = openAPITypeToIRType(propSchema);
    let children: IRParam[] = [];
    if (propSchema.type === 'object' && propSchema.properties) {
      children = schemaToIRParams(
        propSchema,
        propSchema.required ?? [],
        parentName ? `${parentName}.${name}` : name,
      );
    }
    if (
      propSchema.type === 'array' &&
      propSchema.items?.type === 'object' &&
      propSchema.items?.properties
    ) {
      children = schemaToIRParams(
        propSchema.items,
        propSchema.items.required ?? [],
        parentName ? `${parentName}.${name}` : name,
      );
    }
    params.push({
      name,
      type: irType,
      shopeeType: propSchema.type ?? 'string',
      description: '',
      required: requiredFields.includes(name),
      children,
    });
  }
  return params;
}

function cleanEndpointName(operationId: string, method: string): string {
  let name = operationId;
  const prefixes = ['get', 'post', 'put', 'delete'];
  for (const p of prefixes) {
    if (name.toLowerCase().startsWith(p) && name.length > p.length) {
      const rest = name.slice(p.length);
      if (rest[0] === rest[0]?.toUpperCase() || rest[0] === rest[0]?.toLowerCase()) {
        name = rest;
        break;
      }
    }
  }
  const cleaned = toPascalCase(name);
  const methodPrefix = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  return methodPrefix + cleaned;
}

function tagToModuleName(tag: string): string {
  const cleaned = tag.replace(/-api$/i, '').replace(/[-_\s]+/g, ' ');
  return toPascalCase(cleaned);
}

function getFixtureContent(operation: Operation): string | undefined {
  try {
    const resp = operation.responses?.['200'];
    const content = resp?.content?.['application/json'];
    if (content?.schema) {
      return JSON.stringify(content.schema, null, 2);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function cleanFixtureName(name: string): string {
  let cleaned = '';
  for (const ch of name) {
    if (/[a-zA-Z0-9._]/.test(ch)) cleaned += ch;
    else cleaned += '_';
  }
  while (cleaned.includes('__')) cleaned = cleaned.replace(/__/g, '_');
  return cleaned;
}

export const lazadaOpenAPISource: SourceAdapter = {
  name: 'lazada-openapi',

  async execute(config: Config): Promise<IR> {
    const specPath = join(dirname(fileURLToPath(import.meta.url)), 'lazada.openapi.yaml');
    if (!existsSync(specPath)) {
      throw new Error(
        `OpenAPI spec not found at ${specPath}. Download from:\n  https://raw.githubusercontent.com/xKeNcHii/lazada-sdk/main/spec/openapi/lazada.openapi.yaml`,
      );
    }

    const raw = readFileSync(specPath, 'utf-8');
    const spec = yaml.load(raw) as OpenAPISpec;

    const moduleEndpoints = new Map<string, IREndpoint[]>();
    const allErrors = new Map<string, IRError>();
    const fixtures: Array<{ filename: string; content: string }> = [];
    const allMethodNames = new Map<string, number>();

    for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
      const operations: Array<[string, Operation]> = [];
      if (pathItem.get) operations.push(['GET', pathItem.get]);
      if (pathItem.post) operations.push(['POST', pathItem.post]);
      if (pathItem.put) operations.push(['PUT', pathItem.put]);
      if (pathItem.delete) operations.push(['DELETE', pathItem.delete]);

      for (const [method, op] of operations) {
        const endpointName = cleanEndpointName(op.operationId, method);
        const uniqueName = makeUniqueName(endpointName, allMethodNames);

        const relPath = pathStr.replace(/^\/rest/, '');

        let requestParams: IRParam[] = [];
        if (method === 'GET' || method === 'DELETE') {
          if (op.parameters) {
            for (const param of op.parameters) {
              if (param.in !== 'query') continue;
              requestParams.push({
                name: param.name,
                type: openAPITypeToIRType(param.schema),
                shopeeType: param.schema.type ?? 'string',
                description: param.description ?? '',
                required: param.required ?? false,
                children: [],
              });
            }
          }
        } else {
          if (op.requestBody?.content?.['application/json']?.schema) {
            const bodySchema = op.requestBody.content['application/json'].schema;
            requestParams = schemaToIRParams(bodySchema, bodySchema.required ?? [], uniqueName);
          }
        }

        let responseParams: IRParam[] = [];
        const resp200 = op.responses?.['200'];
        if (resp200?.content?.['application/json']?.schema) {
          const respSchema = resp200.content['application/json'].schema;
          responseParams = schemaToIRParams(respSchema, respSchema.required ?? [], uniqueName);
        }

        if (responseParams.length === 0 && resp200?.content?.['application/json']?.schema) {
          const respSchema = resp200.content['application/json'].schema;
          const allProps = respSchema.properties ?? {};
          for (const [name, propSchema] of Object.entries(allProps)) {
            let children: IRParam[] = [];
            if (propSchema.type === 'object' && propSchema.properties) {
              children = schemaToIRParams(propSchema, propSchema.required ?? [], name);
            }
            responseParams.push({
              name,
              type: openAPITypeToIRType(propSchema),
              shopeeType: propSchema.type ?? 'string',
              description: '',
              required: respSchema.required?.includes(name) ?? false,
              children,
            });
          }
        }

        const fixtureContent = getFixtureContent(op);
        const fixtureName = cleanFixtureName(op.operationId) + '_resp.json';
        if (fixtureContent) {
          fixtures.push({ filename: fixtureName, content: fixtureContent });
        }

        const tags = op.tags ?? ['default'];
        for (const tag of tags) {
          const moduleName = tagToModuleName(tag);
          if (!moduleEndpoints.has(moduleName)) {
            moduleEndpoints.set(moduleName, []);
          }
          const moduleEps = moduleEndpoints.get(moduleName)!;

          const irEp: IREndpoint = {
            name: uniqueName,
            method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
            path: relPath,
            fullPath: pathStr,
            description: op.summary ?? op.description ?? '',
            docUrl: `https://open.lazada.com/apps/doc/api?path=${encodeURIComponent(pathStr)}`,
            apiType: 'Shop',
            isUpload: pathStr.includes('image') || pathStr.includes('upload'),
            fullApiName: `${method.toLowerCase()}${relPath.replace(/\//g, '.')}`,
            requestParams: requestParams.sort((a, b) => a.name.localeCompare(b.name)),
            responseParams: responseParams.sort((a, b) => a.name.localeCompare(b.name)),
            errors: [],
          };

          moduleEps.push(irEp);
        }
      }
    }

    const irModules: IRModule[] = [];
    for (const [name, endpoints] of moduleEndpoints) {
      endpoints.sort((a, b) => a.name.localeCompare(b.name));
      irModules.push({ name, moduleId: 0, endpoints });
    }
    irModules.sort((a, b) => a.name.localeCompare(b.name));

    return {
      name: config.name,
      modules: irModules,
      constants: [],
      errors: Array.from(allErrors.values()).sort((a, b) => a.code.localeCompare(b.code)),
      fixtures: fixtures.sort((a, b) => a.filename.localeCompare(b.filename)),
    };
  },
};

function makeUniqueName(name: string, used: Map<string, number>): string {
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);
  if (count > 0) {
    return `${name}${count}`;
  }
  return name;
}
