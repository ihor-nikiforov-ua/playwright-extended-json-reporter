/**
 * Release-gate wiring invariants.
 *
 * Issue #47 closes the Display Error parity epic by wiring the heavier
 * Error Catalog Suite into a documented release gate that fails when any
 * catalog ID loses Display Error parity. The gate is intentionally split off
 * from the canonical `verify` PR-time gate so normal CI feedback stays fast,
 * while a release workflow and an `npm run release-gate` aggregate make the
 * stricter pre-publish gate easy to run on demand.
 *
 * These specs verify the wiring rather than running the heavier catalog suite
 * in-process: the `release-gate` script chains `verify` and `test:catalog`,
 * the dedicated workflow triggers on release/tag events, and `verify` keeps
 * the heavy path out of every PR.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readTextFile(relativePath: string): Promise<string> {
  return readFile(resolve(repoRoot, relativePath), 'utf8');
}

async function readPackageJson(): Promise<{ scripts?: Record<string, string> }> {
  return JSON.parse(await readTextFile('package.json'));
}

const RELEASE_WORKFLOW_PATH = '.github/workflows/release-gate.yml';

test.describe('Release-gate npm script', () => {
  test('package.json defines a `release-gate` script', async () => {
    const pkg = await readPackageJson();
    expect(
      pkg.scripts?.['release-gate'],
      'package.json must define a `release-gate` script that runs the all-45 Display Error parity gate',
    ).toBeTruthy();
  });

  test('`release-gate` runs the canonical verify gate so Source Excerpt 1.1.0 contract coverage is included', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['release-gate'] ?? '';
    expect(
      script,
      '`release-gate` must depend on `npm run verify` so the canonical PR-time gates (Source Excerpt 1.1.0 contract coverage, repo invariants, lint, typecheck, smoke tests, pack verification) all run before publishing',
    ).toContain('npm run verify');
  });

  test('`release-gate` runs the all-45 Error Catalog Display Error parity suite', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['release-gate'] ?? '';
    expect(
      script,
      '`release-gate` must run `npm run test:catalog` so every Error Type is exercised by the Display Error parity comparator before publishing',
    ).toContain('npm run test:catalog');
  });

  test('canonical verify gate keeps the heavier all-45 catalog suite out of every PR', async () => {
    const pkg = await readPackageJson();
    const verify = pkg.scripts?.['verify'] ?? '';
    expect(
      verify,
      'verify gate must not invoke `test:catalog` so PR-time runtime cost stays focused on the locked dev version',
    ).not.toContain('test:catalog');
    expect(
      verify,
      'verify gate must not invoke `release-gate` either, since `release-gate` would recurse back into `verify`',
    ).not.toContain('release-gate');
  });
});

test.describe('Release-gate GitHub workflow', () => {
  test('a dedicated release-gate workflow exists', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(yml, 'release-gate workflow must declare jobs').toMatch(/^jobs:/m);
  });

  test('release-gate workflow triggers when a release is published', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-gate workflow must trigger on `release` events so a published GitHub release fails when any catalog ID loses Display Error parity',
    ).toMatch(/^[^#\n]*release:/m);
    expect(
      yml,
      'release-gate workflow must restrict the release trigger to `published` so draft/prereleases do not duplicate the gate',
    ).toContain('published');
  });

  test('release-gate workflow is also runnable on demand', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-gate workflow must trigger on `workflow_dispatch` so maintainers can run the gate without cutting a release',
    ).toMatch(/workflow_dispatch:/);
  });

  test('release-gate workflow runs the `release-gate` npm script', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-gate workflow must execute `npm run release-gate` so the script and workflow gates run the same chain',
    ).toContain('npm run release-gate');
  });

  test('release-gate workflow installs Node from .nvmrc to match the canonical CI workflow', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-gate workflow must drive Node from .nvmrc to share the canonical runtime metadata',
    ).toContain('node-version-file: .nvmrc');
  });
});

test.describe('Release-gate documentation', () => {
  test('Display Error parity PRD points at the release-gate script', async () => {
    const prd = await readTextFile('docs/prd/display-error-parity.md');
    expect(
      prd,
      'Display Error Parity PRD must reference the release-gate script so maintainers know where the all-45 gate lives',
    ).toContain('npm run release-gate');
  });

  test('README documents the release gate alongside normal development commands', async () => {
    const readme = await readTextFile('README.md');
    expect(
      readme,
      'README must describe the release gate so package consumers and contributors know how the all-45 Display Error parity check runs before publishing',
    ).toContain('npm run release-gate');
  });
});
