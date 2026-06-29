import type { Config, FileOutput } from './types.js'

function applyIgnoreAPIs(ir: import('./types.js').IR, ignoreAPIs?: string[]): void {
  if (!ignoreAPIs?.length) return
  for (const mod of ir.modules) {
    mod.endpoints = mod.endpoints.filter(
      (ep) => !ignoreAPIs!.includes(ep.fullApiName),
    )
  }
  ir.modules = ir.modules.filter((mod) => mod.endpoints.length > 0)
}

export function filterByStaticModules(ir: import('./types.js').IR, staticModules?: string[]): void {
  if (!staticModules?.length) return
  for (const mod of ir.modules) {
    mod.endpoints = mod.endpoints.filter(
      (ep) => !staticModules!.includes(ep.fullApiName.split('.')[1] ?? ''),
    )
  }
}

export function getModuleDisplayName(moduleName: string): string {
  return moduleName
    .replace(/\(CB seller only\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function toPascalCase(s: string): string {
  return s
    .replace(/[-_.\s]+/g, '_')
    .split('_')
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/[^a-zA-Z0-9]/g, '')
      if (!cleaned) return ''
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    })
    .join('')
}

export async function runPipeline(config: Config): Promise<FileOutput[]> {
  const ir = await config.source.execute(config)

  applyIgnoreAPIs(ir, config.mappings?.ignoreAPIs)
  filterByStaticModules(ir, config.mappings?.staticModules)

  const files = await config.output.render(ir, config)

  return files
}
