import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function createCachedFetcher(cacheDir: string) {
  const resolved = cacheDir;

  function cachePath(url: string): string {
    return join(resolved, urlHash(url) + '.json');
  }

  async function fetchJSON<T = unknown>(url: string): Promise<T> {
    const cached = cachePath(url);
    if (existsSync(cached)) {
      const raw = readFileSync(cached, 'utf-8');
      return JSON.parse(raw) as T;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
    const data: T = await res.json();

    mkdirSync(dirname(cached), { recursive: true });
    writeFileSync(cached, JSON.stringify(data, null, 2), 'utf-8');

    return data;
  }

  return { fetchJSON };
}
