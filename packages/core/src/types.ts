export interface IR {
  name: string;
  modules: IRModule[];
  constants: IRConstant[];
  errors: IRError[];
  fixtures: IRFixture[];
}

export interface IRModule {
  name: string;
  moduleId: number;
  endpoints: IREndpoint[];
}

export interface IREndpoint {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  fullPath: string;
  description: string;
  docUrl: string;
  apiType: 'Shop' | 'Merchant' | 'Public';
  isUpload: boolean;
  fullApiName: string;
  requestParams: IRParam[];
  responseParams: IRParam[];
  errors: IRError[];
}

export interface IRParam {
  name: string;
  type: string;
  shopeeType: string;
  description: string;
  required: boolean;
  children: IRParam[];
}

export interface IRConstant {
  typeName: string;
  baseType: string;
  values: IRConstantValue[];
}

export interface IRConstantValue {
  name: string;
  value: string;
}

export interface IRError {
  code: string;
  description: string;
}

export interface IRFixture {
  filename: string;
  content: string;
}

export interface Config {
  name: string;
  source: SourceAdapter;
  output: Renderer;
  outputDir?: string;
  cacheDir?: string;
  mappings?: MappingsConfig;
}

export interface StaticModulesConfig {
  values: string[];
  /** Dot-delimited segment index of fullApiName to match against.
   *  Defaults to -1 (last segment). Use 0 for first, 1 for second, etc.
   *  Negative values index from the end. */
  segment?: number;
}

export interface MappingsConfig {
  typeOverrides?: Record<string, string>;
  structTypeOverrides?: Record<string, Record<string, string>>;
  enums?: Record<string, EnumDef>;
  ignoreAPIs?: string[];
  staticModules?: StaticModulesConfig;
}

export interface EnumDef {
  base: 'string' | 'int';
  values: Record<string, string>;
}

export interface SourceAdapter {
  name: string;
  execute(config: Config): Promise<IR>;
}

export interface Renderer {
  name: string;
  render(ir: IR, config: Config): Promise<FileOutput[]>;
}

export interface FileOutput {
  path: string;
  content: string;
}

export function defineConfig(config: Config): Config {
  if (!config.name) throw new Error('Config must have a name');
  if (!config.source) throw new Error('Config must have a source');
  if (!config.output) throw new Error('Config must have an output');
  return config;
}

export function defineRenderer(renderer: Renderer): Renderer {
  return renderer;
}
