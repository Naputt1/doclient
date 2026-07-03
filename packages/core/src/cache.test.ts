import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('createCachedFetcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'doclient-cache-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('fetches from URL on cache miss and writes to disk', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ foo: 'bar' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createCachedFetcher } = await import('./cache.js');
    const { fetchJSON } = createCachedFetcher(tmpDir);

    const result = await fetchJSON<{ foo: string }>('https://example.com/data.json');
    expect(result).toEqual({ foo: 'bar' });
    expect(fetchMock).toHaveBeenCalledOnce();

    const dirContents = readdirSync(tmpDir);
    expect(dirContents.length).toBe(1);
  });

  it('reads from cache on subsequent call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ foo: 'bar' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createCachedFetcher } = await import('./cache.js');
    const { fetchJSON } = createCachedFetcher(tmpDir);

    // first call populates cache
    await fetchJSON('https://example.com/another.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // second call should use cache
    const result = await fetchJSON<{ foo: string }>('https://example.com/another.json');
    expect(result).toEqual({ foo: 'bar' });
    // fetch should NOT have been called again
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createCachedFetcher } = await import('./cache.js');
    const { fetchJSON } = createCachedFetcher(tmpDir);

    await expect(fetchJSON('https://example.com/notfound')).rejects.toThrow('fetch failed');
  });
});
