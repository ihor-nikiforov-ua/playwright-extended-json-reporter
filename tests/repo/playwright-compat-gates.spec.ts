/**
 * Playwright support-range compatibility gates.
 *
 * The PRD requires fast PR-time coverage of the minimum supported Playwright
 * version and a heavier scheduled or manual gate for the latest supported
 * version below 2. Together they keep the canonical Playwright Support Range
 * (`@playwright/test >=1.59 <2`) honest without slowing normal PR feedback.
 *
 * These specs verify the workflow wiring rather than running Playwright
 * compatibility under multiple versions in-process. Repository invariants
 * already guard the peer-dependency declaration; this file ensures the gates
 * exist, run on the right triggers, and exercise the existing Compatibility
 * Smoke Suite against pinned Playwright versions.
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

const COMPAT_WORKFLOW_PATH = '.github/workflows/playwright-compat.yml';

test.describe('Playwright support-range compatibility gates', () => {
  test('package.json defines a `test:compat` script that runs the Compatibility Smoke Suite', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['test:compat'] ?? '';
    expect(script, 'package.json must define a `test:compat` script').toBeTruthy();
    expect(
      script,
      '`test:compat` must run Playwright against the existing Compatibility Smoke Suite',
    ).toContain('tests/compatibility');
  });

  test('canonical verify gate keeps multi-version compatibility runs out of `npm test`', async () => {
    const pkg = await readPackageJson();
    const verify = pkg.scripts?.['verify'] ?? '';
    expect(
      verify,
      'verify gate must not invoke `test:compat` so PR-time runtime cost stays focused on the locked dev version',
    ).not.toContain('test:compat');
  });

  test('a dedicated Playwright compatibility workflow exists', async () => {
    const yml = await readTextFile(COMPAT_WORKFLOW_PATH);
    expect(yml, 'compatibility workflow must declare jobs').toMatch(/^jobs:/m);
  });

  test('min-supported job runs on pull_request to keep PR-time coverage of the lower bound', async () => {
    const yml = await readTextFile(COMPAT_WORKFLOW_PATH);
    expect(yml, 'compatibility workflow must trigger on pull_request').toMatch(/pull_request:/);
    expect(
      yml,
      'compatibility workflow must define a `min-supported` job for the canonical 1.59 lower bound',
    ).toMatch(/min-supported:/);
    expect(
      yml,
      'min-supported job must override @playwright/test to the exact 1.59.0 lower bound so the lockfile cannot silently float to 1.59.x',
    ).toMatch(/@playwright\/test@1\.59\.0(?!\d)/);
    expect(yml, 'min-supported job must run the Compatibility Smoke Suite').toContain(
      'npm run test:compat',
    );
  });

  test('latest-supported job runs on schedule and workflow_dispatch and pins below 2', async () => {
    const yml = await readTextFile(COMPAT_WORKFLOW_PATH);
    expect(yml, 'compatibility workflow must trigger on schedule').toMatch(/schedule:/);
    expect(yml, 'compatibility workflow must trigger on workflow_dispatch').toMatch(
      /workflow_dispatch:/,
    );
    expect(
      yml,
      'compatibility workflow must define a `latest-supported` job for latest <2 coverage',
    ).toMatch(/latest-supported:/);
    expect(yml, 'latest-supported job must constrain @playwright/test below 2').toMatch(
      /@playwright\/test@<2|@playwright\/test@\^1(?!\.)/,
    );
    expect(yml, 'latest-supported job must run the Compatibility Smoke Suite').toContain(
      'npm run test:compat',
    );
  });

  test('compatibility jobs install Node from .nvmrc to match the canonical CI workflow', async () => {
    const yml = await readTextFile(COMPAT_WORKFLOW_PATH);
    const occurrences = yml.match(/node-version-file:\s*\.nvmrc/g) ?? [];
    expect(
      occurrences.length,
      'both compatibility jobs must drive Node from .nvmrc',
    ).toBeGreaterThanOrEqual(2);
  });

  test('compatibility jobs do not install browsers for the current smoke-only suite', async () => {
    const yml = await readTextFile(COMPAT_WORKFLOW_PATH);
    expect(
      yml,
      'compatibility workflow must avoid browser downloads until test:compat grows browser-backed fixtures',
    ).not.toContain('npm run install:browsers');
  });

  test('compatibility workflow keeps normal PRs fast by guarding heavy paths to schedule/dispatch', async () => {
    const yml = await readTextFile(COMPAT_WORKFLOW_PATH);
    expect(
      yml,
      'latest-supported job must guard against running on every PR with an event filter',
    ).toMatch(/latest-supported:[\s\S]*?if:[\s\S]*?(schedule|workflow_dispatch)/);
  });
});
