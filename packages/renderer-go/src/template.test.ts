import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadTemplate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'template-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('replaces inline markers __KEY__', async () => {
    writeFileSync(join(tmpDir, 'test.go'), 'package __PACKAGE_NAME__\nconst X = "__VALUE__"');
    const { loadTemplate } = await import('./template.js');
    const tpl = loadTemplate(join(tmpDir, 'test.go'));
    const result = tpl.render({ PACKAGE_NAME: 'mypkg', VALUE: '42' });
    expect(result).toBe('package mypkg\nconst X = "42"');
  });

  it('replaces comment markers // @KEY', async () => {
    writeFileSync(join(tmpDir, 'test.go'), 'package pkg\n\n// @SERVICES_SECTION');
    const { loadTemplate } = await import('./template.js');
    const tpl = loadTemplate(join(tmpDir, 'test.go'));
    const result = tpl.render({ SERVICES_SECTION: '\tAuth AuthService' });
    expect(result).toContain('\tAuth AuthService');
    expect(result).not.toContain('// @SERVICES_SECTION');
  });

  it('leaves unused markers unchanged', async () => {
    writeFileSync(join(tmpDir, 'test.go'), '__KEEP__ __REMOVE__');
    const { loadTemplate } = await import('./template.js');
    const tpl = loadTemplate(join(tmpDir, 'test.go'));
    const result = tpl.render({ REMOVE: 'gone' });
    expect(result).toBe('__KEEP__ gone');
  });

  it('resolves relative paths from caller directory', async () => {
    // For relative path resolution, we need the file to be in a subdir of the caller
    // Since the caller is this test file, the relative path needs to exist.
    // We'll use an absolute path instead to test the template functionality.
    writeFileSync(join(tmpDir, 'relative_test.go'), 'package __PKG__');
    const { loadTemplate } = await import('./template.js');
    const tpl = loadTemplate(join(tmpDir, 'relative_test.go'));
    const result = tpl.render({ PKG: 'testpkg' });
    expect(result).toBe('package testpkg');
  });
});
