/**
 * Compatibility Fixture: Structured Error Evidence.
 *
 * Issue #6 acceptance: "Compatibility Fixtures cover at least one raw test
 * error and one status-derived failure such as `test.fail()` unexpectedly
 * passing." Each fixture below runs a tiny Playwright suite once with the
 * Runboard Reporter and once with Playwright's official HTML reporter and
 * asserts the Runboard side carries Structured Error Evidence aligned by
 * index with the serialized `result.errors[]` display array and tagged with
 * the documented `source` provenance.
 *
 * The status-derived fixture also runs the strict comparator: `test.fail()`
 * unexpectedly passing produces a fixed display message that both reporters
 * format identically. The raw-test-error fixture intentionally skips the
 * full comparator because Playwright's HTML reporter formats raw assertion
 * messages and codeframes through Babel/jest-matcher-utils branches that the
 * v1 Public Serializer does not yet reproduce; reaching display-string parity
 * for failing assertions is its own workstream and would expand Issue #6
 * beyond its evidence-emission scope.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  type CompatibilityRun,
  compareCompatibility,
  formatDifferences,
  runCompatibilityFixture,
} from '../harness/compatibility-fixture.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');

interface ResultShape {
  errors: Array<Record<string, unknown>>;
  runboard?: { evidence: Array<Record<string, unknown>> };
}

function firstResult(run: CompatibilityRun): ResultShape {
  const [runboardFile] = [...run.runboardFiles.values()];
  if (!runboardFile) throw new Error('expected one runboard file shard');
  const tests = runboardFile['tests'] as Array<Record<string, unknown>>;
  const [testCase] = tests;
  if (!testCase) throw new Error('expected a test case');
  const results = testCase['results'] as Array<ResultShape>;
  const [result] = results;
  if (!result) throw new Error('expected a result');
  return result;
}

test.describe('Compatibility Fixture — Structured Error Evidence', () => {
  let workDir: string;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  });

  test.beforeEach(async () => {
    workDir = await mkdtemp(join(repoRoot, '.runboard-compat-evidence-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('raw test error preserves a test-error evidence entry under each result', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      expectFailingSuite: true,
      specs: {
        'raw-error.spec.ts': [
          `import { expect, test } from '@playwright/test';`,
          `test('arithmetic mismatch fails loudly', () => {`,
          `  expect(1 + 1).toBe(3);`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const result = firstResult(run);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.runboard).toBeDefined();
    const evidence = result.runboard?.evidence ?? [];
    expect(evidence).toHaveLength(result.errors.length);
    const [primary] = evidence;
    expect(primary?.['source']).toBe('test-error');
    expect(typeof primary?.['message']).toBe('string');
    expect(primary).not.toHaveProperty('errorType');
  });

  test('test.fail() unexpectedly passing emits a status-derived evidence entry', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      expectFailingSuite: true,
      specs: {
        'expected-fail-passes.spec.ts': [
          `import { expect, test } from '@playwright/test';`,
          `test('expected to fail but passes', () => {`,
          `  test.fail();`,
          `  expect(1 + 1).toBe(2);`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Error Evidence Compatibility Fixture failure (status-derived):\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);

    const result = firstResult(run);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.['message']).toContain('Expected to fail, but passed.');
    expect(result.runboard).toBeDefined();
    const evidence = result.runboard?.evidence ?? [];
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toEqual({
      source: 'status-derived',
      message: 'Expected to fail, but passed.',
    });
  });
});
