/**
 * Unit tests for the focused Error Catalog Display Error parity comparator.
 *
 * The comparator narrows the full Compatibility Fixture diff stream to just
 * the `result.errors[]` Display Error surface and enriches each difference
 * with the catalog ID, Error Type label, test file name, per-result index, and
 * per-error index that issue #32 requires. The synthetic runs in this file
 * also serve as negative-normalization guards: every signal the Display Error
 * Parity PRD calls out as "not normalization noise" — call logs, assertion
 * diffs, codeframes, causes, screenshot/text diff signals, step/hook context,
 * and status-derived messages — must surface as a diff when only one side
 * carries it. The matching end-to-end suite (under
 * `playwright.catalog.config.ts`) drives this comparator against real
 * Playwright runs.
 */
import { expect, test } from '@playwright/test';
import {
  type CompatibilityRun,
  compareCatalogDisplayErrors,
  formatCatalogDisplayErrorDifferences,
} from '../harness/compatibility-fixture.js';

interface DisplayError {
  message: string;
  codeframe?: string;
}

interface ResultShape {
  retry?: number;
  startTime?: string;
  duration?: number;
  steps?: unknown[];
  errors: DisplayError[];
  attachments?: unknown[];
  status?: string;
  annotations?: unknown[];
  workerIndex?: number;
}

function makeFile(args: {
  fileId: string;
  fileName: string;
  testTitle: string;
  results: ResultShape[];
}): Record<string, unknown> {
  return {
    fileId: args.fileId,
    fileName: args.fileName,
    tests: [
      {
        testId: `${args.fileId}-test`,
        title: args.testTitle,
        path: [],
        projectName: '',
        location: { file: args.fileName, line: 1, column: 1 },
        annotations: [],
        tags: [],
        outcome: 'unexpected',
        duration: 0,
        ok: false,
        results: args.results,
      },
    ],
  };
}

function buildRun(args: {
  htmlErrors: DisplayError[][];
  runboardErrors: DisplayError[][];
  fileName?: string;
  testTitle?: string;
}): CompatibilityRun {
  const fileName = args.fileName ?? 'fixture.spec.ts';
  const testTitle = args.testTitle ?? 'a failing test';
  const htmlResults = args.htmlErrors.map((errors) => ({ errors }));
  const runboardResults = args.runboardErrors.map((errors) => ({ errors }));
  return {
    htmlReport: { metadata: {}, files: [], stats: {}, errors: [] },
    htmlFiles: new Map([
      ['abc', makeFile({ fileId: 'abc', fileName, testTitle, results: htmlResults })],
    ]),
    runboardReport: { metadata: {}, files: [], stats: {}, errors: [] },
    runboardFiles: new Map([
      ['abc', makeFile({ fileId: 'abc', fileName, testTitle, results: runboardResults })],
    ]),
    rootDir: '/tmp/fixture',
  };
}

const FIXTURE = { catalogId: 1, errorType: 'Test timeout' };

test.describe('compareCatalogDisplayErrors — structural shape', () => {
  test('returns no diffs when display errors match', () => {
    const run = buildRun({
      htmlErrors: [[{ message: 'Test timeout of 100ms exceeded.' }]],
      runboardErrors: [[{ message: 'Test timeout of 100ms exceeded.' }]],
    });
    expect(compareCatalogDisplayErrors(run, FIXTURE)).toEqual([]);
  });

  test('reports a divergent message with catalogId, errorType, testFile, resultIndex, errorIndex, and path', () => {
    const run = buildRun({
      fileName: 'tests/01-test-timeout.spec.ts',
      testTitle: 'exceeds the configured test timeout',
      htmlErrors: [[{ message: 'Test timeout of 100ms exceeded.' }]],
      runboardErrors: [[{ message: 'Timed out (legacy phrasing).' }]],
    });
    const diffs = compareCatalogDisplayErrors(run, FIXTURE);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      catalogId: 1,
      errorType: 'Test timeout',
      scope: 'result',
      testFile: 'tests/01-test-timeout.spec.ts',
      testTitle: 'exceeds the configured test timeout',
      resultIndex: 0,
      errorIndex: 0,
      path: 'message',
      expected: 'Test timeout of 100ms exceeded.',
      actual: 'Timed out (legacy phrasing).',
    });
  });

  test('reports a divergent codeframe at the codeframe path', () => {
    const run = buildRun({
      htmlErrors: [
        [{ message: 'msg', codeframe: '> 12 |   await page.locator(...)\n     |          ^' }],
      ],
      runboardErrors: [
        [{ message: 'msg', codeframe: '> 12 |   await page.locator(...)\n     |   ^' }],
      ],
    });
    const diffs = compareCatalogDisplayErrors(run, FIXTURE);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe('codeframe');
    expect(diffs[0]?.errorIndex).toBe(0);
  });

  test('tags result index and error index for second error in second result', () => {
    const run = buildRun({
      htmlErrors: [
        [{ message: 'first attempt' }],
        [{ message: 'second attempt error A' }, { message: 'second attempt error B' }],
      ],
      runboardErrors: [
        [{ message: 'first attempt' }],
        [{ message: 'second attempt error A' }, { message: 'DIVERGED' }],
      ],
    });
    const diffs = compareCatalogDisplayErrors(run, FIXTURE);
    expect(diffs).toHaveLength(1);
    const [diff] = diffs;
    expect(diff?.scope).toBe('result');
    if (diff?.scope !== 'result') throw new Error('expected per-result diff');
    expect(diff.resultIndex).toBe(1);
    expect(diff.errorIndex).toBe(1);
  });

  test('reports a missing display error (one side has fewer entries)', () => {
    const run = buildRun({
      htmlErrors: [[{ message: 'soft assertion 1' }, { message: 'soft assertion 2' }]],
      runboardErrors: [[{ message: 'soft assertion 1' }]],
    });
    const diffs = compareCatalogDisplayErrors(run, FIXTURE);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.errorIndex).toBe(1);
    expect(diffs[0]?.expected).toEqual({ message: 'soft assertion 2' });
    expect(diffs[0]?.actual).toBeUndefined();
  });
});

test.describe('compareCatalogDisplayErrors — semantic signals are not normalized away', () => {
  function expectDiverges(html: DisplayError, runboard: DisplayError, label: string): void {
    const run = buildRun({ htmlErrors: [[html]], runboardErrors: [[runboard]] });
    const diffs = compareCatalogDisplayErrors(run, FIXTURE);
    expect(
      diffs.length,
      `${label}: expected the comparator to surface the divergence, got no diffs`,
    ).toBeGreaterThanOrEqual(1);
  }

  test('call log differences inside the message surface as diffs', () => {
    expectDiverges(
      {
        message:
          "locator.click: Timeout 100ms exceeded.\nCall log:\n  - waiting for locator('#missing')\n  - locator resolved to <button>",
      },
      {
        message: 'locator.click: Timeout 100ms exceeded.',
      },
      'call log',
    );
  });

  test('assertion diff lines (Expected/Received) surface as diffs', () => {
    expectDiverges(
      { message: 'Error: expect(received).toBe(expected)\nExpected: 3\nReceived: 2' },
      { message: 'Error: expect(received).toBe(expected)' },
      'assertion diff',
    );
  });

  test('codeframe content differences surface as diffs', () => {
    expectDiverges(
      { message: 'msg', codeframe: '> 10 |   expect(2).toBe(3);\n     |             ^' },
      { message: 'msg' },
      'codeframe',
    );
  });

  test('cause prefix differences surface as diffs', () => {
    expectDiverges(
      { message: 'outer error\n[cause]: inner cause text' },
      { message: 'outer error' },
      'cause',
    );
  });

  test('screenshot diff signal ("are different") surfaces as a diff', () => {
    expectDiverges(
      {
        message:
          'Error: Screenshot comparison failed:\n  3 pixels (ratio 0.01) are different.\nExpected: -expected.png\nReceived: -actual.png\nDiff: -diff.png',
      },
      { message: 'Error: Screenshot comparison failed.' },
      'screenshot diff signal',
    );
  });

  test('step path / hook context (e.g. "in beforeAll") surfaces as a diff', () => {
    expectDiverges(
      { message: 'Error in "beforeAll" hook: Hook timeout of 50ms exceeded.' },
      { message: 'Hook timeout of 50ms exceeded.' },
      'hook context',
    );
  });

  test('status-derived "Expected to fail, but passed." surfaces when one side omits it', () => {
    expectDiverges(
      { message: 'Expected to fail, but passed.' },
      { message: 'Test passed.' },
      'status-derived message',
    );
  });
});

test.describe('compareCatalogDisplayErrors — minimal normalization is preserved', () => {
  test('rootDir prefix occurrences inside a message do not produce a diff', () => {
    const run = buildRun({
      htmlErrors: [[{ message: '/tmp/fixture/specs/a.spec.ts:12:5\nError boom' }]],
      runboardErrors: [[{ message: 'specs/a.spec.ts:12:5\nError boom' }]],
    });
    expect(compareCatalogDisplayErrors(run, FIXTURE)).toEqual([]);
  });

  test('Windows line endings inside a codeframe do not produce a diff', () => {
    const run = buildRun({
      htmlErrors: [[{ message: 'm', codeframe: '> 1 | x\r\n    | ^' }]],
      runboardErrors: [[{ message: 'm', codeframe: '> 1 | x\n    | ^' }]],
    });
    expect(compareCatalogDisplayErrors(run, FIXTURE)).toEqual([]);
  });
});

test.describe('formatCatalogDisplayErrorDifferences', () => {
  test('produces an actionable line citing catalog ID, Error Type, test file, result index, error index, and path', () => {
    const out = formatCatalogDisplayErrorDifferences([
      {
        catalogId: 8,
        errorType: 'Hook timeout',
        scope: 'result',
        testFile: 'tests/08-hook-timeout.spec.ts',
        testTitle: 'placeholder so the failing hook surfaces in the bundle',
        resultIndex: 0,
        errorIndex: 0,
        path: 'message',
        expected: 'Error in "beforeAll" hook: Hook timeout of 50ms exceeded.',
        actual: 'Hook timeout of 50ms exceeded.',
      },
    ]);
    expect(out).toContain('Catalog #8');
    expect(out).toContain('Hook timeout');
    expect(out).toContain('tests/08-hook-timeout.spec.ts');
    expect(out).toContain('result[0]');
    expect(out).toContain('errors[0]');
    expect(out).toContain('message');
    // Values are JSON-encoded so embedded newlines and quotes survive grep.
    expect(out).toContain(
      JSON.stringify('Error in "beforeAll" hook: Hook timeout of 50ms exceeded.'),
    );
    expect(out).toContain(JSON.stringify('Hook timeout of 50ms exceeded.'));
  });

  test('renders top-level diffs against report.errors[i] instead of the per-test path', () => {
    const out = formatCatalogDisplayErrorDifferences([
      {
        catalogId: 9,
        errorType: 'Global timeout',
        scope: 'top-level',
        errorIndex: 0,
        path: '',
        expected: 'Timed out waiting 0.5s for the test to run',
        actual: 'Timed out (legacy phrasing)',
      },
    ]);
    expect(out).toContain('Catalog #9');
    expect(out).toContain('Global timeout');
    expect(out).toContain('report.errors[0]');
    // Top-level diffs are not associated with a test file or per-result index.
    expect(out).not.toContain('result[');
    expect(out).toContain(JSON.stringify('Timed out waiting 0.5s for the test to run'));
    expect(out).toContain(JSON.stringify('Timed out (legacy phrasing)'));
  });
});

test.describe('compareCatalogDisplayErrors — top-level report.errors[]', () => {
  function buildTopLevelRun(args: {
    htmlErrors: string[];
    runboardErrors: string[];
    rootDir?: string;
  }): CompatibilityRun {
    return {
      htmlReport: { metadata: {}, files: [], stats: {}, errors: args.htmlErrors },
      htmlFiles: new Map(),
      runboardReport: { metadata: {}, files: [], stats: {}, errors: args.runboardErrors },
      runboardFiles: new Map(),
      rootDir: args.rootDir ?? '/tmp/fixture',
    };
  }

  const GLOBAL_TIMEOUT_FIXTURE = { catalogId: 9, errorType: 'Global timeout' };

  test('returns no diffs when top-level errors match', () => {
    const run = buildTopLevelRun({
      htmlErrors: ['Timed out waiting 0.5s for the test to run'],
      runboardErrors: ['Timed out waiting 0.5s for the test to run'],
    });
    expect(compareCatalogDisplayErrors(run, GLOBAL_TIMEOUT_FIXTURE)).toEqual([]);
  });

  test('flags a divergent top-level error with scope=top-level and errorIndex', () => {
    const run = buildTopLevelRun({
      htmlErrors: ['Timed out waiting 0.5s for the test to run'],
      runboardErrors: ['Timed out (legacy phrasing)'],
    });
    const diffs = compareCatalogDisplayErrors(run, GLOBAL_TIMEOUT_FIXTURE);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      catalogId: 9,
      errorType: 'Global timeout',
      scope: 'top-level',
      errorIndex: 0,
      path: '',
      expected: 'Timed out waiting 0.5s for the test to run',
      actual: 'Timed out (legacy phrasing)',
    });
  });

  test('reports a missing top-level error when one side has fewer entries', () => {
    const run = buildTopLevelRun({
      htmlErrors: ['first', 'second'],
      runboardErrors: ['first'],
    });
    const diffs = compareCatalogDisplayErrors(run, GLOBAL_TIMEOUT_FIXTURE);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.scope).toBe('top-level');
    expect(diffs[0]?.errorIndex).toBe(1);
    expect(diffs[0]?.expected).toBe('second');
    expect(diffs[0]?.actual).toBeUndefined();
  });

  test('rootDir prefix occurrences inside a top-level error do not produce a diff', () => {
    const run = buildTopLevelRun({
      htmlErrors: ['/tmp/fixture/specs/a.spec.ts:12:5\nError boom'],
      runboardErrors: ['specs/a.spec.ts:12:5\nError boom'],
    });
    expect(compareCatalogDisplayErrors(run, GLOBAL_TIMEOUT_FIXTURE)).toEqual([]);
  });

  test('Windows line endings inside a top-level error do not produce a diff', () => {
    const run = buildTopLevelRun({
      htmlErrors: ['line1\r\nline2'],
      runboardErrors: ['line1\nline2'],
    });
    expect(compareCatalogDisplayErrors(run, GLOBAL_TIMEOUT_FIXTURE)).toEqual([]);
  });
});
