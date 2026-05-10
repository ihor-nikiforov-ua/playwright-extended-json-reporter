import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readTextFile(path: string): Promise<string> {
  return readFile(resolve(repoRoot, path), 'utf8');
}

async function readPackageJson(): Promise<{ scripts?: Record<string, string> }> {
  return JSON.parse(await readTextFile('package.json'));
}

test.describe('Error Catalog Suite split from Compatibility Smoke Suite', () => {
  test('default Playwright config excludes the Error Catalog Suite', async () => {
    const config = await readTextFile('playwright.config.ts');
    expect(
      config,
      'default Playwright config must keep the heavier Error Catalog Suite out of `npm test`',
    ).toMatch(/testIgnore[\s\S]*error-catalog/);
  });

  test('a dedicated Error Catalog Playwright config drives the heavier suite', async () => {
    const catalog = await readTextFile('playwright.catalog.config.ts');
    expect(
      catalog,
      'playwright.catalog.config.ts must point Playwright at the Error Catalog Suite directory',
    ).toMatch(/testDir[\s\S]*tests\/error-catalog/);
  });

  test('package.json exposes a `test:catalog` script that uses the catalog config', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['test:catalog'] ?? '';
    expect(script, 'package.json must define a `test:catalog` script').toBeTruthy();
    expect(
      script,
      '`test:catalog` must run Playwright with the dedicated Error Catalog config',
    ).toContain('playwright.catalog.config.ts');
  });

  test('the canonical verify gate keeps the catalog suite out of normal CI', async () => {
    const pkg = await readPackageJson();
    const verify = pkg.scripts?.['verify'] ?? '';
    expect(verify, 'verify gate must not run the heavier `test:catalog` script').not.toContain(
      'test:catalog',
    );
  });

  test('a dedicated CI workflow exists for the heavier Error Catalog Suite', async () => {
    const workflow = await readTextFile('.github/workflows/error-catalog.yml');
    expect(
      workflow,
      'error-catalog workflow must run the dedicated `test:catalog` npm script',
    ).toContain('npm run test:catalog');
    expect(
      workflow,
      'error-catalog workflow must be runnable on demand without blocking normal PRs',
    ).toMatch(/workflow_dispatch:/);
    expect(
      workflow,
      'error-catalog workflow must install Node from .nvmrc to match the canonical CI workflow',
    ).toContain('node-version-file: .nvmrc');
  });

  test('normal CI workflow does not invoke the catalog suite', async () => {
    const ci = await readTextFile('.github/workflows/ci.yml');
    expect(
      ci,
      'normal CI workflow must not run the heavier `test:catalog` script on every PR',
    ).not.toContain('test:catalog');
  });
});
