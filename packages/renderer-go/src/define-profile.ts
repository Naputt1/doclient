import type { IREndpoint } from '@doclient/core';
import type { PlatformProfile } from './platform-profile.js';
import type { StructGenerator, GoField } from './renderer.js';
import type { ServiceStyle, TestSetupConfig } from './profile-defaults.js';
import {
  renderResponseFile,
  renderGoMod,
  testSetupFile,
  defaultRenderServiceFile,
  defaultRenderTestFile,
} from './profile-defaults.js';

export interface ProfileConfig {
  /** Human-readable platform name */
  name: string;

  /** The field name containing the response payload (e.g. "response" for Shopee) */
  responseDataFieldName: string;

  /** Response-level fields to skip when building structs */
  commonFields: string[];

  /** Request-level fields to skip when building structs */
  commonRequestFields: string[];

  /** Fields for BaseResponse struct (embedded inline in every response struct) */
  baseResponseFields: GoField[];

  /** Extra parameters in every generated method signature (e.g. ", sid uint64, tok string") */
  extraMethodParams?: string;

  /** Extra arguments passed to every client call (e.g. "sid, tok") */
  extraMethodArgs?: string;

  /** Upload method extra params (defaults to extraMethodParams) */
  uploadMethodExtraParams?: string;

  /** Upload method extra args (defaults to extraMethodArgs) */
  uploadMethodExtraArgs?: string;

  /** Client file template — platform-specific, must be provided */
  renderClientFile: (
    packageName: string,
    servicesSection: string,
    servicesInitSection: string,
  ) => string;

  /** Auth file template — optional, platform-specific */
  renderAuthFile?: (packageName: string) => string;

  /** Test setup configuration — generates setup_test.go */
  testSetup?: TestSetupConfig;

  /** Service/test file generation style (defaults to 'direct') */
  serviceStyle?: ServiceStyle;

  /** Dependencies for go.mod */
  dependencies?: string[];

  /** Custom struct building for endpoints */
  buildEndpointStructs?: (structGen: StructGenerator, moduleName: string, ep: IREndpoint) => void;

  /** Override any profile method */
  overrides?: Partial<PlatformProfile>;
}

export function defineProfile(config: ProfileConfig): PlatformProfile {
  const extraMethodParams = config.extraMethodParams ?? '';
  const extraMethodArgs = config.extraMethodArgs ?? '';
  const uploadExtraMethodParams = config.uploadMethodExtraParams ?? config.extraMethodParams ?? '';
  const uploadExtraMethodArgs = config.uploadMethodExtraArgs ?? config.extraMethodArgs ?? '';
  const serviceStyle: ServiceStyle = config.serviceStyle ?? 'direct';

  const profile: PlatformProfile = {
    name: config.name,
    responseDataFieldName: config.responseDataFieldName,
    commonFields: config.commonFields,
    commonRequestFields: config.commonRequestFields,
    baseResponseFields: config.baseResponseFields,

    extraMethodParams: () => extraMethodParams,
    extraMethodArgs: () => extraMethodArgs,
    uploadMethodExtraParams: () => uploadExtraMethodParams,
    uploadMethodExtraArgs: () => uploadExtraMethodArgs,

    renderClientFile: config.renderClientFile,

    renderAuthFile: config.renderAuthFile ?? ((_packageName: string): string => ''),

    renderResponseFile: renderResponseFile(config.baseResponseFields),

    renderTestSetupFile: config.testSetup
      ? testSetupFile(config.testSetup)
      : (_packageName: string): string => '',

    renderGoMod: renderGoMod(config.dependencies ?? []),

    renderServiceFile: defaultRenderServiceFile(serviceStyle, extraMethodParams, extraMethodArgs),

    renderTestFile: defaultRenderTestFile(serviceStyle, extraMethodArgs),

    buildEndpointStructs: config.buildEndpointStructs,

    serviceStyle,
    dependencies: config.dependencies ?? [],
  } as PlatformProfile & { serviceStyle: ServiceStyle; dependencies: string[] };

  if (config.overrides) {
    Object.assign(profile, config.overrides);
  }

  return profile;
}
