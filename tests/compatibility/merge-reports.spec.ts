/**
 * Merged Runboard Data Bundle Compatibility Fixture.
 *
 * The PRD requires Compatibility Fixtures for Playwright's blob `merge-reports`
 * flow. This spec runs a small fixture across two blob shards, then merges
 * the blobs through `playwright merge-reports` with both the Runboard Reporter
 * and Playwright's official HTML reporter wired into the merge config. The
 * resulting Runboard Data Bundle is compared against the merged HTML report
 * to prove that — modulo the normalization allowlist — the merged bundle
 * matches Playwright's HTML reporter, including a populated `report.machines[]`
 * with shard index, tags, start time, and duration metadata per shard.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  compareCompatibility,
  formatDifferences,
  runMergeReportsCompatibilityFixture,
} from '../harness/compatibility-fixture.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');

test.describe('Compatibility Fixture — Playwright merge-reports', () => {
  let workDir: string;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  });

  test.beforeEach(async () => {
    workDir = await mkdtemp(join(repoRoot, '.runboard-merge-compat-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('merged Runboard Data Bundle matches the merged HTML report', async () => {
    const run = await runMergeReportsCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'a.spec.ts': [
          `import { expect, test } from '@playwright/test';`,
          `test('case in a', () => { expect(1).toBe(1); });`,
          '',
        ].join('\n'),
        'b.spec.ts': [
          `import { expect, test } from '@playwright/test';`,
          `test('case in b', () => { expect(2).toBe(2); });`,
          '',
        ].join('\n'),
      },
      shards: [{ tags: ['@shard-a'] }, { tags: ['@shard-b'] }],
    });

    const machines = run.runboardReport['machines'];
    expect(Array.isArray(machines)).toBe(true);
    expect(machines).toHaveLength(2);
    const shardIndexes = (machines as Array<{ shardIndex?: number }>).map((m) => m.shardIndex);
    expect(new Set(shardIndexes)).toEqual(new Set([1, 2]));
    const tags = (machines as Array<{ tag: string[] }>).map((m) => m.tag);
    expect(tags).toContainEqual(['@shard-a']);
    expect(tags).toContainEqual(['@shard-b']);

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `merge-reports Compatibility Fixture failure — Runboard merged bundle drifted from ` +
          `Playwright merged HTML report data:\n${formatDifferences(diffs)}`,
      );
    }
  });
});
