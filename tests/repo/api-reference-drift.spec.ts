/**
 * Public API Reference drift check.
 *
 * The Public API Reference Page (`docs/public/api.md`) is the human-readable
 * map of the package's public exports. This test reads the named exports
 * from `src/index.ts` and asserts that the API reference neither omits a
 * real public export nor invents a `Runboard*` symbol that is not actually
 * exported.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const indexPath = resolve(repoRoot, 'src/index.ts');
const apiDocPath = resolve(repoRoot, 'docs/public/api.md');

/**
 * Extract the public named exports from a `src/index.ts` file written in the
 * canonical aggregating-barrel form used by this package: `export { ... }
 * from '...';` and `export type { ... } from '...';` clauses. The `default`
 * re-export is intentionally skipped because it is not an identifier in the
 * public type surface.
 */
function parsePublicExports(source: string): string[] {
  const names = new Set<string>();
  const exportBlockPattern = /export(?:\s+type)?\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g;
  for (const match of source.matchAll(exportBlockPattern)) {
    const body = match[1] ?? '';
    for (const rawEntry of body.split(',')) {
      const entry = rawEntry.replace(/\/\/.*$/gm, '').trim();
      if (!entry) continue;
      const cleaned = entry.replace(/^type\s+/, '');
      const [name] = cleaned.split(/\s+as\s+/);
      if (!name || name === 'default') continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

test.describe('Public API Reference drift', () => {
  test('every public export from src/index.ts is named in docs/public/api.md', async () => {
    const indexSource = await readFile(indexPath, 'utf8');
    const apiDoc = await readFile(apiDocPath, 'utf8');
    const exports = parsePublicExports(indexSource);

    expect(exports.length, 'src/index.ts must publish at least one named export').toBeGreaterThan(
      0,
    );
    expect(exports, 'core public exports must be parsed').toEqual(
      expect.arrayContaining([
        'RUNBOARD_SCHEMA_VERSION',
        'RunboardReporter',
        'RunboardReporterOptions',
      ]),
    );

    const missing = exports.filter((name) => !apiDoc.includes(name));
    expect(
      missing,
      `docs/public/api.md is missing references to public exports: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('docs/public/api.md does not invent Runboard exports that are not in src/index.ts', async () => {
    const indexSource = await readFile(indexPath, 'utf8');
    const apiDoc = await readFile(apiDocPath, 'utf8');
    const exports = new Set(parsePublicExports(indexSource));

    const mentioned = new Set<string>();
    for (const match of apiDoc.matchAll(/\bRunboard[A-Za-z0-9_]*/g)) {
      mentioned.add(match[0]);
    }
    // Documented domain terms that are not exports.
    mentioned.delete('Runboard');
    mentioned.delete('RunboardData');

    const invented = [...mentioned].filter((name) => !exports.has(name));
    expect(
      invented,
      `docs/public/api.md references Runboard* symbols that are not exported from src/index.ts: ${invented.join(', ')}`,
    ).toEqual([]);
  });

  test('docs/public/api.md introduces the public entrypoint and key API anchors', async () => {
    const apiDoc = await readFile(apiDocPath, 'utf8');
    expect(apiDoc, 'API reference must point at the package entrypoint name').toContain(
      'playwright-runboard-reporter',
    );
    expect(apiDoc, 'API reference must mention the default reporter export').toMatch(
      /\bdefault export\b/i,
    );
    expect(apiDoc, 'API reference must mention RunboardReporter').toContain('RunboardReporter');
    expect(apiDoc, 'API reference must mention RunboardReporterOptions').toContain(
      'RunboardReporterOptions',
    );
    expect(apiDoc, 'API reference must mention RUNBOARD_SCHEMA_VERSION').toContain(
      'RUNBOARD_SCHEMA_VERSION',
    );
  });
});
