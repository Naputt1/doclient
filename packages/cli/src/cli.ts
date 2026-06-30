import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';
import { spawn } from 'node:child_process';
import type { Config } from '@doclient/core';
import { runPipeline } from '@doclient/core';

export async function main(): Promise<void> {
  const args = argv.slice(2);
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
  doclient --config <config-file>

Options:
  -c, --config   Path to config file (required)
  --out-dir      Output directory (overrides config.outputDir)
  --cache        Cache API responses in .doclient-cache under output dir
  -h, --help     Show this help
`);
      exit(0);
    }
  }

  if (!configPath) {
    console.error('Error: --config is required');
    exit(1);
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
