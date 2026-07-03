import type { IREndpoint } from '@doclient/core';
import type { StructGenerator, GoField } from './renderer.js';

/**
 * A PlatformProfile defines all the platform-specific behavior for generating
 * a Go SDK from an IR (Intermediate Representation).
 *
 * The generic `createGoRenderer(profile, options)` handles the pipeline
 * scaffolding (iterating modules, building structs, organizing files) and
 * delegates platform-specific template rendering to this profile.
 *
 * To create a SDK for a new platform, implement this interface and pass it
 * to `createGoRenderer()`:
 *
 * ```ts
 * const myProfile: PlatformProfile = {
 *   name: 'my-platform',
 *   responseDataFieldName: 'data',
 *   commonFields: ['code', 'msg', 'request_id'],
 *   // ... implement template functions
 * };
 * export default defineConfig({
 *   output: createGoRenderer(myProfile, { package: 'gomyplat', module: '...' }),
 * });
 * ```
 */
export interface PlatformProfile {
  /** Human-readable platform name (used for the renderer name) */
  name: string;

  // ─── Response model ───────────────────────────────────────

  /** The field name that contains the response payload (e.g. "response" for Shopee, "data" for Lazada) */
  responseDataFieldName: string;

  /** Response-level fields to skip when building structs (e.g. ["code", "type", "message", "request_id"]) */
  commonFields: string[];

  /** Request-level fields to skip when building structs (e.g. ["partner_id", "shop_id", "merchant_id"]) */
  commonRequestFields: string[];

  /** The fields that make up BaseResponse (embedded inline in every response struct) */
  baseResponseFields: GoField[];

  // ─── Auth / method signature ──────────────────────────────

  /** Extra parameters added to every generated method signature (e.g. ", sid uint64, tok string") */
  extraMethodParams(): string;

  /** Extra arguments passed to every client call (e.g. "sid, tok") */
  extraMethodArgs(): string;

  /** Custom upload method signature portion (beyond ctx, filename, reader) */
  uploadMethodExtraParams(): string;

  /** Custom upload method call args (beyond ctx, filename, reader) */
  uploadMethodExtraArgs(): string;

  // ─── Struct building ──────────────────────────────────────

  /**
   * Build request/response structs for a single endpoint.
   * Default: `defaultBuildEndpointStructs(profile)` uses `responseDataFieldName` and `commonFields`.
   * Override for custom response shapes (e.g. scalar data, array data, extra filtering).
   */
  buildEndpointStructs?(structGen: StructGenerator, moduleName: string, ep: IREndpoint): void;

  // ─── File templates ───────────────────────────────────────

  renderClientFile(
    packageName: string,
    servicesSection: string,
    servicesInitSection: string,
  ): string;

  renderResponseFile(packageName: string): string;

  renderAuthFile(packageName: string): string;

  renderTestSetupFile(packageName: string): string;

  renderGoMod(modulePath: string, packageName: string): string;

  renderServiceFile(
    moduleName: string,
    fileName: string,
    endpoints: IREndpoint[],
    structGen: StructGenerator,
    packageName: string,
  ): string;

  renderTestFile(
    moduleName: string,
    endpoints: IREndpoint[],
    structGen: StructGenerator,
    packageName: string,
  ): string;
}
