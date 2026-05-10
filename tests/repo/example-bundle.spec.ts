/**
 * Public Example Bundle drift check.
 *
 * The Public Example Bundle under `docs/public/examples/` is the consumer-
 * facing "real JSON" companion to the Public Data Contract Page. These tests
 * regenerate the same bundle from a deterministic Playwright input and assert
 * that the checked-in JSON matches the Runboard Reporter's current output, so
 * the example cannot silently rot when the reporter or contract module
 * changes.
 *
 * If a deliberate contract change requires updating the example bundle, run
 * `node scripts/regenerate-example-bundle.mjs` and commit the regenerated
 * files alongside the change.
 */
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { RUNBOARD_SCHEMA_VERSION } from '../../src/index.js';
import { generateExampleBundle } from '../helpers/example-bundle-fixture.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const exampleRoot = resolve(repoRoot, 'docs/public/examples');
const exampleBundleRoot = resolve(exampleRoot, 'playwright-runboard-report');

async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), relPath);
        continue;
      }
      out.push(relPath);
    }
  }
  await walk(root, '');
  return out.sort();
}

async function readPackageVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

test.describe('Public Example Bundle layout', () => {
  test('docs/public/examples/ ships a README and a playwright-runboard-report bundle directory', async () => {
    const rootStat = await stat(exampleRoot);
    expect(rootStat.isDirectory(), 'docs/public/examples must exist as a directory').toBe(true);

    const readmeStat = await stat(resolve(exampleRoot, 'README.md'));
    expect(
      readmeStat.isFile(),
      'docs/public/examples must include a README that introduces the bundle',
    ).toBe(true);

    const bundleStat = await stat(exampleBundleRoot);
    expect(
      bundleStat.isDirectory(),
      'docs/public/examples/playwright-runboard-report must contain the emitted bundle so the example mirrors the reporter default Output Folder name',
    ).toBe(true);

    const reportStat = await stat(resolve(exampleBundleRoot, 'report.json'));
    expect(
      reportStat.isFile(),
      'docs/public/examples/playwright-runboard-report must contain report.json',
    ).toBe(true);
  });

  test('checked-in report.json carries the current schema, reporter, and Playwright versions', async () => {
    const report = JSON.parse(
      await readFile(resolve(exampleBundleRoot, 'report.json'), 'utf8'),
    ) as Record<string, unknown>;
    const runboard = report['runboard'] as Record<string, unknown>;
    const packageVersion = await readPackageVersion();
    expect(runboard['schemaVersion']).toBe(RUNBOARD_SCHEMA_VERSION);
    expect(runboard['reporterVersion']).toBe(packageVersion);
    expect(typeof runboard['playwrightVersion']).toBe('string');
  });
});

const UPDATE_EXAMPLE_BUNDLE = process.env['UPDATE_EXAMPLE_BUNDLE'] === '1';

test.describe('Public Example Bundle drift', () => {
  let regenerated: string;

  test.beforeAll(async () => {
    if (UPDATE_EXAMPLE_BUNDLE) {
      await generateExampleBundle(exampleBundleRoot);
      regenerated = exampleBundleRoot;
      return;
    }
    regenerated = await mkdtemp(join(tmpdir(), 'runboard-example-bundle-'));
    await generateExampleBundle(regenerated);
  });

  test.afterAll(async () => {
    if (UPDATE_EXAMPLE_BUNDLE) return;
    await rm(regenerated, { recursive: true, force: true });
  });

  test('checked-in bundle has the same file tree as the regenerated bundle', async () => {
    const checkedInFiles = await listFilesRecursive(exampleBundleRoot);
    const regeneratedFiles = await listFilesRecursive(regenerated);
    expect(
      checkedInFiles,
      'docs/public/examples/playwright-runboard-report must list exactly the files the Runboard Reporter emits for the example input',
    ).toEqual(regeneratedFiles);
  });

  test('every checked-in JSON file matches the regenerated JSON content', async () => {
    const regeneratedFiles = await listFilesRecursive(regenerated);
    const jsonFiles = regeneratedFiles.filter((p) => p.endsWith('.json'));
    expect(
      jsonFiles.length,
      'regenerated example bundle must include at least one JSON file',
    ).toBeGreaterThan(0);

    for (const relPath of jsonFiles) {
      const expected = JSON.parse(await readFile(resolve(exampleBundleRoot, relPath), 'utf8'));
      const actual = JSON.parse(await readFile(resolve(regenerated, relPath), 'utf8'));
      expect(
        actual,
        `docs/public/examples/playwright-runboard-report/${relPath} is out of sync with the Runboard Reporter output; regenerate the example bundle`,
      ).toEqual(expected);
    }
  });
});
