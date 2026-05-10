/**
 * Compatibility Harness — Output Isolation.
 *
 * Pins the invariant that the Compatibility Fixture harness gives every child
 * Playwright run its own `outputDir` underneath the harness work directory.
 *
 * Why this matters: Playwright's runner starts each `test` invocation with a
 * `clear output` task that removes the configured `outputDir` wholesale (see
 * `createRemoveOutputDirsTask` in Playwright). If the harness lets Playwright
 * fall back to its default — `<packageJsonDir>/test-results/` — every parallel
 * parent compatibility test in this suite spawns a child Playwright that wipes
 * the same shared test-results folder. That race deletes the test-results
 * subdir of a sibling parent test mid-run, and the HTML reporter's
 * `fs.readFileSync(a.path)` for a path-backed attachment then silently fails,
 * leaving the absolute test-results path serialized and producing a spurious
 * Compatibility Fixture diff. The path-backed fixture in `attachments.spec.ts`
 * is the most visible victim, but every fixture that uses path attachments is
 * exposed.
 *
 * The test plants a sentinel file under `<repoRoot>/test-results/` immediately
 * before running a fixture and asserts the sentinel survives the run. With
 * harness isolation in place the child Playwright wipes only its own
 * workDir-scoped output folder; without it, the sentinel is the canary that
 * gets deleted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { runCompatibilityFixture } from '../harness/compatibility-fixture.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');

test.describe('Compatibility Harness — Output Isolation', () => {
  let workDir: string;
  let sentinelDir: string;
  let sentinelPath: string;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  });

  test.beforeEach(async () => {
    workDir = await mkdtemp(join(repoRoot, '.runboard-compat-iso-'));
    // Plant the sentinel under <repoRoot>/test-results/ where Playwright's
    // default outputDir resolves to. The unique random subdir avoids any
    // collision with the outer Playwright suite's per-test output folders.
    sentinelDir = join(
      repoRoot,
      'test-results',
      `.harness-iso-sentinel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(sentinelDir, { recursive: true });
    sentinelPath = join(sentinelDir, 'sentinel.txt');
    await writeFile(sentinelPath, 'do-not-delete', 'utf8');
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    await rm(sentinelDir, { recursive: true, force: true });
  });

  test('child Playwright outputDir does not collide with the package root test-results', async () => {
    await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'pass.spec.ts': [
          `import { test } from '@playwright/test';`,
          `test('passes', () => {});`,
          '',
        ].join('\n'),
      },
    });

    expect(
      existsSync(sentinelPath),
      'Harness child Playwright wiped <repoRoot>/test-results/ — every parallel parent compatibility test would race on the same shared folder.',
    ).toBe(true);
    const contents = await readFile(sentinelPath, 'utf8');
    expect(contents).toBe('do-not-delete');
  });
});
