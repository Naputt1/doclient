import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';
import { spawn } from 'node:child_process';
import type {
  Config,
  MappingsConfig,
  EnumDef,
  SourceAdapter,
  Renderer,
  FileOutput,
  IR,
} from '@doclient/core';
import {
  defineConfig as coreDefineConfig,
  defineRenderer,
  runPipeline,
  createCachedFetcher,
  filterByStaticModules,
  getModuleDisplayName,
  toPascalCase,
  type IRModule,
  type IREndpoint,
  type IRParam,
  type IRConstant,
  type IRConstantValue,
  type IRError,
  type IRFixture,
} from '@doclient/core';
import { scaffoldCommand } from './scaffold.js';

// Re-exported for convenience — import { defineConfig, ... } from '@doclient/cli'
export {
  defineRenderer,
  runPipeline,
  createCachedFetcher,
  filterByStaticModules,
  getModuleDisplayName,
  toPascalCase,
};
export type {
  IR,
  IRModule,
  IREndpoint,
  IRParam,
  IRConstant,
  IRConstantValue,
  IRError,
  IRFixture,
  Config,
  MappingsConfig,
  EnumDef,
  SourceAdapter,
  Renderer,
  FileOutput,
};

export function defineConfig(config: Config): Config {
  return coreDefineConfig(config);
}

export function parseArg(args: string[], name: string, short?: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` || (short && args[i] === `-${short}`)) {
      return args[i + 1];
    }
  }
}

export async function main(allArgs?: string[]): Promise<void> {
  const args = allArgs ?? argv.slice(2);

  if (args[0] === 'scaffold') {
    let profile = parseArg(args, 'profile', 'p');
    if (!profile) {
      const candidates = ['doclient.config.ts', 'doclient.config.js', 'doclient.config.mjs'];
      for (const candidate of candidates) {
        if (existsSync(resolve(cwd(), candidate))) {
          profile = candidate;
          break;
        }
      }
      if (!profile) {
        console.error(
          'Error: --profile is required (or create doclient.config.ts with a profile field)',
        );
        exit(1);
      }
    }
    await scaffoldCommand({
      profile,
      dir: parseArg(args, 'dir', 'd'),
      module: parseArg(args, 'module', 'm'),
    });
    return;
  }

  let configPath = '';
  let cache = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' || args[i] === '-c') {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--cache') {
      cache = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`doclient - API doc scraper -> typed SDK generator

Usage:
  doclient [--config <config-file>]
  doclient scaffold --profile <path> [options]

Options:
  -c, --config   Path to config file (defaults to doclient.config.ts)
  --out-dir      Output directory (overrides config.outputDir)
  --cache        Cache API responses in .doclient-cache under output dir

Scaffold subcommand:
  doclient scaffold
    Generate LSP stubs and template boilerplate for a profile.
    --profile, -p   Path to profile file (default: doclient.config.ts)
    --dir, -d       Output directory (default: templates/ next to profile)
    --module, -m    Go module path (generates go.mod)
  -h, --help     Show this help
`);
      exit(0);
    }
  }

  if (!configPath) {
    const candidates = ['doclient.config.ts', 'doclient.config.js', 'doclient.config.mjs'];
    for (const candidate of candidates) {
      if (existsSync(resolve(cwd(), candidate))) {
        configPath = candidate;
        break;
      }
    }
    if (!configPath) {
      console.error('Error: --config is required (or create doclient.config.ts)');
      exit(1);
    }
  }

  const absConfigPath = resolve(cwd(), configPath);

  const config: Config = await loadConfig(absConfigPath);

  const outDir = resolve(cwd(), config.outputDir ?? '.');

  if (cache) {
    config.cacheDir = join(outDir, '.doclient-cache');
  }

  console.log(`Running doclient for: ${config.name}`);
  const files = await runPipeline(config);

  for (const file of files) {
    const fullPath = join(outDir, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
    console.log(`  wrote ${file.path}`);
  }

  const proc = spawn('gofmt', ['-w', '.'], { cwd: outDir, stdio: 'ignore' });
  proc.on('error', () => {});
  proc.unref();

  console.log(`\nDone - ${files.length} files generated in ${outDir}`);
}

async function loadConfig(absPath: string): Promise<Config> {
  let mod;
  try {
    const tsx = await import('tsx/esm/api');
    if (typeof tsx.register === 'function') {
      tsx.register();
    }
    mod = await import(absPath);
  } catch {
    mod = await import(absPath);
  }
  const config = mod.default ?? mod;
  return typeof config === 'function' ? config() : (config as Config);
}

const isMain = argv[1]?.endsWith('cli.ts') || argv[1]?.endsWith('cli.js');
if (isMain) {
  main().catch((err) => {
    console.error(err);
    exit(1);
  });
}
