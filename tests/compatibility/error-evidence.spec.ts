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

  test('failing nested test.step records stepPath, stepCategory, and attachmentIndexes', async () => {
    // Real-Playwright regression guard: the public reporter API serializes
    // step.error and the matching result.errors[] entry as separate TestError
    // objects, so a reference-keyed linkage drops stepPath/stepCategory/
    // attachmentIndexes entirely when the run leaves the worker. This fixture
    // boots a real Playwright process that fails inside a nested test.step
    // after attaching a screenshot so structural linkage is exercised
    // end-to-end against the published reporter dist.
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      expectFailingSuite: true,
      specs: {
        'nested-step-failure.spec.ts': [
          `import { expect, test } from '@playwright/test';`,
          `test('inner step fails after attachment', async ({}, testInfo) => {`,
          `  await test.step('outer step', async () => {`,
          `    await test.step('inner step', async () => {`,
          `      await testInfo.attach('shot', { body: Buffer.from([1, 2, 3]), contentType: 'image/png' });`,
          `      expect(1 + 1).toBe(3);`,
          `    });`,
          `  });`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const result = firstResult(run);
    expect(result.runboard).toBeDefined();
    const evidence = result.runboard?.evidence ?? [];
    expect(evidence.length).toBeGreaterThanOrEqual(1);
    const [primary] = evidence;
    expect(primary?.['source']).toBe('test-error');
    // Real-Playwright structural-linkage assertions. Playwright propagates
    // `step.error` up every parent test.step on the failing call stack, so
    // the structural matcher resolves the deepest matching step (the
    // `expect`-category leaf) for stepPath/stepCategory and unions
    // attachments across the chain — the testInfo.attach() lives on a
    // sibling `test.attach` step under the inner test.step, so a strict
    // per-step lookup would drop attachmentIndexes entirely.
    const stepPath = primary?.['stepPath'] as string[] | undefined;
    expect(stepPath?.[0]).toBe('outer step');
    expect(stepPath?.[1]).toBe('inner step');
    expect(stepPath?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(primary?.['stepCategory']).toBe('expect');
    const attachmentIndexes = primary?.['attachmentIndexes'] as number[] | undefined;
    expect(Array.isArray(attachmentIndexes)).toBe(true);
    expect(attachmentIndexes?.length).toBeGreaterThanOrEqual(1);
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
