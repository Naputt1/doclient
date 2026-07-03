import { loadTemplate } from './template.js';
import { fileURLToPath } from 'url';
import path from 'path';
import type { ServiceStyle } from './profile-defaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stubsTpl = loadTemplate(path.join(__dirname, 'lsp-stubs.go'));

export function lspStubsText(_style?: ServiceStyle): string {
  return stubsTpl.render({});
}
