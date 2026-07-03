import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { cwd } from 'node:process';
import type { PlatformProfile, ServiceStyle } from '@doclient/renderer-go';
import {
  lspStubsText,
  scaffoldClientText,
  scaffoldAuthText,
  initGoModule,
} from '@doclient/renderer-go';

interface ScaffoldArgs {
  profile: string;
  dir?: string;
  module?: string;
  packageName?: string;
}

export function findProfileExport(
  mod: Record<string, unknown>,
  profilePath: string,
): PlatformProfile {
  // Check if it's a config (has default.profile or default.source)
  const defaultExport = mod.default;
  if (defaultExport && typeof defaultExport === 'object' && defaultExport !== null) {
    if ('profile' in defaultExport) {
      const p = (defaultExport as Record<string, unknown>).profile;
      if (p && typeof p === 'object' && 'name' in p) {
        return p as PlatformProfile;
      }
    }
    if ('name' in defaultExport) {
      return defaultExport as PlatformProfile;
    }
  }

  // Scan named exports for one that looks like a PlatformProfile
  for (const [key, value] of Object.entries(mod)) {
    if (key === 'default') continue;
    if (value && typeof value === 'object' && 'name' in value && 'renderClientFile' in value) {
      return value as PlatformProfile;
    }
  }

  // Second pass: any export with a name property
  for (const [key, value] of Object.entries(mod)) {
    if (key === 'default') continue;
    if (value && typeof value === 'object' && 'name' in value) {
      return value as PlatformProfile;
    }
  }

  const available = Object.keys(mod).filter((k) => k !== 'default');
  throw new Error(
    `Could not find a PlatformProfile export in "${profilePath}".\n` +
      `Available exports: ${available.join(', ') || '(none)'}\n` +
      `Ensure your profile exports a result from defineProfile().`,
  );
}

export async function scaffoldCommand(args: ScaffoldArgs): Promise<void> {
  const profilePath = resolve(cwd(), args.profile);
  const profileDir = dirname(profilePath);
  const outDir = args.dir ? resolve(cwd(), args.dir) : join(profileDir, 'templates');
  // Import the profile (uses tsx for TypeScript support)
  let mod: Record<string, unknown>;
  try {
    const tsx = await import('tsx/esm/api');
    if (typeof tsx.register === 'function') {
      tsx.register();
    }
    mod = await import(profilePath);
  } catch {
    mod = await import(profilePath);
  }

  const profile = findProfileExport(mod, profilePath);

  // Auto-extract module and package from config if not provided
  const cfgModule =
    mod.default && typeof mod.default === 'object'
      ? ((mod.default as Record<string, unknown>).module as string | undefined)
      : undefined;
  const resolvedModule: string = args.module ?? cfgModule ?? '';

  const extended = profile as PlatformProfile & {
    serviceStyle?: ServiceStyle;
    dependencies?: string[];
  };
  const serviceStyle = extended.serviceStyle ?? 'direct';
  const deps = extended.dependencies;

  // Create output directory
  mkdirSync(outDir, { recursive: true });

  // Write go_lsp_stubs.go
  const stubs = lspStubsText(serviceStyle);
  writeFileSync(join(outDir, 'go_lsp_stubs.go'), stubs);
  console.log(`  wrote ${join(outDir, 'go_lsp_stubs.go')}`);

  // Write client.go scaffold
  const clientSrc = scaffoldClientText();
  writeFileSync(join(outDir, 'client.go'), clientSrc);
  console.log(`  wrote ${join(outDir, 'client.go')}`);

  // Write auth.go scaffold
  const authSrc = scaffoldAuthText();
  writeFileSync(join(outDir, 'auth.go'), authSrc);
  console.log(`  wrote ${join(outDir, 'auth.go')}`);

  // Write go.mod and run go mod tidy if --module provided
  if (resolvedModule) {
    initGoModule(outDir, resolvedModule, deps ?? []);
  }

  console.log(`\nScaffold generated in ${outDir}`);
  console.log('Customize the templates and then run: doclient\n');
}
