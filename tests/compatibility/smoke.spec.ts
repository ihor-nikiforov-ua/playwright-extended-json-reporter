/**
 * Compatibility Smoke Suite.
 *
 * The PRD requires a fast Compatibility Smoke Suite that runs in normal CI to
 * catch Runboard Data Contract drift from Playwright's official HTML reporter.
 * This file is the canonical Compatibility Smoke Suite.
 *
 * Each test runs a deliberately small fixture once with both the Runboard
 * Reporter and Playwright's official HTML reporter through a single Playwright
 * invocation, then asserts that — modulo the normalization allowlist — the
 * extracted data sets match. Failures point to the mismatched contract path so
 * an AFK agent can act without spelunking through both bundles by hand.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  compareCompatibility,
  formatDifferences,
  runCompatibilityFixture,
} from '../harness/compatibility-fixture.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');

test.describe('Compatibility Smoke Suite', () => {
  let workDir: string;

  test.beforeAll(() => {
    if (!existsSync(reporterDist)) {
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    }
  });

  test.beforeEach(async () => {
    // The fixture's playwright config lives inside this work dir and imports
    // `@playwright/test`. Node module resolution walks parent directories, so
    // the work dir must sit inside the repo for the import to resolve.
    workDir = await mkdtemp(join(repoRoot, '.runboard-compat-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('minimal passing bundle matches the Playwright HTML reporter', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'pass.spec.ts': [
          `import { expect, test } from '@playwright/test';`,
          `test('one plus one is two', () => {`,
          `  expect(1 + 1).toBe(2);`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Compatibility Smoke Suite failure — Runboard bundle drifted from ` +
          `Playwright HTML report data:\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);
  });

  test('summary and detail data for a representative passing fixture matches', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'two-cases.spec.ts': [
          `import { expect, test } from '@playwright/test';`,
          `test.describe('Compatibility detail coverage', () => {`,
          `  test('first case adds numbers', () => {`,
          `    expect(2 + 2).toBe(4);`,
          `  });`,
          `  test('second case compares strings', () => {`,
          `    expect('runboard').toContain('board');`,
          `  });`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    // Summary-side: per-file summary count matches between reporters.
    const htmlFiles = (run.htmlReport['files'] as Array<Record<string, unknown>>) ?? [];
    const runboardFiles = (run.runboardReport['files'] as Array<Record<string, unknown>>) ?? [];
    expect(runboardFiles).toHaveLength(htmlFiles.length);
    expect(htmlFiles).toHaveLength(1);

    // Detail-side: per-file entry tests match in count between reporters.
    const [htmlFileSummary] = htmlFiles;
    const fileId = htmlFileSummary?.['fileId'] as string | undefined;
    expect(fileId).toBeDefined();
    if (!fileId) throw new Error('expected an HTML report file id');
    const htmlFile = run.htmlFiles.get(fileId);
    const runboardFile = run.runboardFiles.get(fileId);
    expect(htmlFile).toBeDefined();
    expect(runboardFile).toBeDefined();
    const htmlTests = (htmlFile?.['tests'] as Array<unknown>) ?? [];
    const runboardTests = (runboardFile?.['tests'] as Array<unknown>) ?? [];
    expect(runboardTests).toHaveLength(htmlTests.length);
    expect(htmlTests).toHaveLength(2);

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Compatibility Smoke Suite failure — summary/detail drift:\n${formatDifferences(diffs)}`,
      );
    }
  });
});
