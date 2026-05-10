/**
 * Public API Reference drift check.
 *
 * The Public API Reference Page (`docs/public/api.md`) is the human-readable
 * map of the package's public exports. These tests read the public exports
 * from `src/index.ts` and assert that the API reference neither omits a real
 * public export nor invents an identifier that is not actually exported.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const indexPath = resolve(repoRoot, 'src/index.ts');
const apiDocPath = resolve(repoRoot, 'docs/public/api.md');

/**
 * Extract the public exports from a `src/index.ts` file written in the
 * canonical aggregating-barrel form used by this package: `export { ... }
 * from '...';` and `export type { ... } from '...';` clauses. The `default`
 * re-export is included so the documented surface can be cross-checked
 * against it explicitly.
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
      if (!name) continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * Extract the identifiers documented as exports in the `## Exports` section
 * of `docs/public/api.md`. Only identifiers wrapped in code spans (backticks)
 * count, so prose words and quoted module specifiers are ignored. The
 * section ends at the next H2 heading.
 */
function parseDocumentedExports(apiDoc: string): string[] {
  const heading = '## Exports';
  const start = apiDoc.indexOf(heading);
  if (start === -1) return [];
  const afterHeading = start + heading.length;
  const nextHeading = apiDoc.indexOf('\n## ', afterHeading);
  const sectionBody = apiDoc.slice(afterHeading, nextHeading === -1 ? undefined : nextHeading);
  const ids = new Set<string>();
  for (const match of sectionBody.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids].sort();
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

  test('docs/public/api.md ## Exports section exactly matches the public exports of src/index.ts', async () => {
    const indexSource = await readFile(indexPath, 'utf8');
    const apiDoc = await readFile(apiDocPath, 'utf8');
    const exports = new Set(parsePublicExports(indexSource));
    const documented = new Set(parseDocumentedExports(apiDoc));

    expect(
      exports.has('default'),
      'src/index.ts must explicitly re-export the default reporter; without it consumers cannot use the package entry as a bare module specifier',
    ).toBe(true);

    const invented = [...documented].filter((name) => !exports.has(name));
    expect(
      invented,
      `docs/public/api.md ## Exports section names identifiers that are not exported from src/index.ts: ${invented.join(', ')}`,
    ).toEqual([]);

    const omitted = [...exports].filter((name) => !documented.has(name));
    expect(
      omitted,
      `docs/public/api.md ## Exports section omits public exports from src/index.ts: ${omitted.join(', ')}`,
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
