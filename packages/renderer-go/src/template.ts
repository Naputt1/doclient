import fs from 'fs';
import path from 'path';

export interface GoTemplate {
  render(data: Record<string, string>): string;
}

function getCallerDir(): string {
  const err = new Error();
  Error.captureStackTrace(err, loadTemplate);
  const stack = err.stack?.split('\n') ?? [];
  const callerLine = stack[1] ?? '';
  const m = callerLine.match(/\((.*):\d+:\d+\)$/);
  const file = m?.[1] ?? callerLine.match(/at\s+(.*):\d+:\d+$/)?.[1];
  if (!file) throw new Error('Cannot determine caller file from stack trace');
  return path.dirname(file);
}

/**
 * Load a `.go` template file that uses markers:
 * - Inline: `__MARKER_NAME__` (replaced inline, MUST match Go identifier rules)
 * - Comment: `// @MARKER_NAME` (the entire line is replaced with the value)
 *
 * The `.go` file remains syntactically valid so the Go LSP works on it.
 *
 * Relative paths are resolved from the caller's file (no `import.meta.url` needed).
 *
 * @example
 * ```go
 * // templates/client.go
 * package __PACKAGE_NAME__
 *
 * type Client[T any] struct {
 *     mu sync.Mutex
 *     // @SERVICES_SECTION
 * }
 * ```
 *
 * ```ts
 * const tpl = loadTemplate('./templates/client.go');
 * tpl.render({ PACKAGE_NAME: 'goshopee', SERVICES_SECTION: '\tAuth AuthService' });
 * ```
 */
export function loadTemplate(filePath: string): GoTemplate {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getCallerDir(), filePath);
  const content = fs.readFileSync(resolved, 'utf-8');

  const inlineMarkers = new Set<string>();
  const inlineRe = /__(\w+)__/g;
  {
    let m: RegExpExecArray | null;
    while ((m = inlineRe.exec(content)) !== null) {
      inlineMarkers.add(m[1]);
    }
  }

  const commentMarkers = new Set<string>();
  const commentRe = /^\t*\/\/ @(\w+)\s*$/gm;
  {
    let m: RegExpExecArray | null;
    while ((m = commentRe.exec(content)) !== null) {
      commentMarkers.add(m[1]);
    }
  }

  return {
    render(data: Record<string, string>): string {
      let result = content;

      for (const key of inlineMarkers) {
        const value = data[key];
        if (value !== undefined) {
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          result = result.replace(new RegExp(`__${escaped}__`, 'g'), value);
        }
      }

      for (const key of commentMarkers) {
        const value = data[key];
        if (value !== undefined) {
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const lineRe = new RegExp(`^\\t*\\/\\/ @${escaped}\\s*$`, 'gm');
          result = result.replace(lineRe, value);
        }
      }

      return result;
    },
  };
}
