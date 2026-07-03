import { loadTemplate } from './template.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { renderGoMod } from './profile-defaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientTpl = loadTemplate(path.join(__dirname, 'scaffolds', 'client.go'));
const authTpl = loadTemplate(path.join(__dirname, 'scaffolds', 'auth.go'));

export function scaffoldClientText(): string {
  return clientTpl.render({});
}

export function scaffoldAuthText(): string {
  return authTpl.render({});
}

export function initGoModule(dir: string, modulePath: string, dependencies: string[]): void {
  const content = renderGoMod(dependencies)(modulePath, '__PACKAGE_NAME__');
  writeFileSync(path.join(dir, 'go.mod'), content);
  console.log(`  wrote ${path.join(dir, 'go.mod')}`);
  const result = spawnSync('go', ['mod', 'tidy'], { cwd: dir, stdio: 'inherit' });
  if (result.status !== 0) {
    console.warn('  warning: go mod tidy failed — run it manually in the template directory');
  }
}
