import type { Config, FileOutput, StaticModulesConfig } from './types.js';

function applyIgnoreAPIs(ir: import('./types.js').IR, ignoreAPIs?: string[]): void {
  if (!ignoreAPIs?.length) return;
  for (const mod of ir.modules) {
    mod.endpoints = mod.endpoints.filter((ep) => !ignoreAPIs!.includes(ep.fullApiName));
  }
  ir.modules = ir.modules.filter((mod) => mod.endpoints.length > 0);
}

function getApiSegment(fullApiName: string, segment: number): string {
  const parts = fullApiName.split('.');
  const idx = segment < 0 ? parts.length + segment : segment;
  if (idx < 0 || idx >= parts.length) {
    throw new Error(
      `fullApiName "${fullApiName}" has ${parts.length} segment(s) — cannot resolve segment index ${segment} (resolved to ${idx})`,
    );
  }
  return parts[idx];
}

export function filterByStaticModules(
  ir: import('./types.js').IR,
  staticModules?: StaticModulesConfig,
): void {
  if (!staticModules?.values?.length) return;
  const segment = staticModules.segment ?? -1;
  for (const mod of ir.modules) {
    mod.endpoints = mod.endpoints.filter(
      (ep) => !staticModules.values.includes(getApiSegment(ep.fullApiName, segment)),
    );
  }
}

export function getModuleDisplayName(moduleName: string): string {
  return moduleName
    .replace(/\(CB seller only\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

export async function runPipeline(config: Config): Promise<FileOutput[]> {
  const ir = await config.source.execute(config);

  applyIgnoreAPIs(ir, config.mappings?.ignoreAPIs);
  filterByStaticModules(ir, config.mappings?.staticModules);

  const files = await config.output.render(ir, config);

  return files;
}
