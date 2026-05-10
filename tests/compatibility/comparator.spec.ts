import { expect, test } from '@playwright/test';
import {
  type CompatibilityRun,
  compareCompatibility,
  formatDifferences,
} from '../harness/compatibility-fixture.js';

function emptyHtmlReport(): Record<string, unknown> {
  return {
    metadata: {},
    startTime: 0,
    duration: 0,
    files: [],
    projectNames: [],
    stats: { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true },
    errors: [],
    options: {},
    machines: [],
  };
}

function emptyRunboardReport(): Record<string, unknown> {
  return {
    ...emptyHtmlReport(),
    runboard: { schemaVersion: '1.0.0', reporterVersion: '0.1.0', playwrightVersion: '1.59.0' },
  };
}

function buildRun(overrides: Partial<CompatibilityRun> = {}): CompatibilityRun {
  return {
    htmlReport: emptyHtmlReport(),
    htmlFiles: new Map(),
    runboardReport: emptyRunboardReport(),
    runboardFiles: new Map(),
    rootDir: '/tmp/fixture',
    ...overrides,
  };
}

test.describe('compareCompatibility', () => {
  test('returns no differences when reports are structurally identical (modulo runboard extension)', () => {
    const diffs = compareCompatibility(buildRun());
    expect(diffs).toEqual([]);
  });

  test('reports a difference at a precise contract path when a top-level field diverges', () => {
    const html = emptyHtmlReport();
    const runboard = emptyRunboardReport();
    (html as { projectNames: string[] }).projectNames = ['chromium'];
    (runboard as { projectNames: string[] }).projectNames = ['firefox'];
    const diffs = compareCompatibility(buildRun({ htmlReport: html, runboardReport: runboard }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe('report/projectNames/0');
    expect(diffs[0]?.expected).toBe('chromium');
    expect(diffs[0]?.actual).toBe('firefox');
  });

  test('reports a difference when a per-file entry diverges, with file-id-qualified path', () => {
    const htmlFiles = new Map<string, Record<string, unknown>>([
      ['abc', { fileId: 'abc', fileName: 'a.spec.ts', tests: [{ title: 'A' }] }],
    ]);
    const runboardFiles = new Map<string, Record<string, unknown>>([
      ['abc', { fileId: 'abc', fileName: 'a.spec.ts', tests: [{ title: 'B' }] }],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe('files/abc/tests/0/title');
    expect(diffs[0]?.expected).toBe('A');
    expect(diffs[0]?.actual).toBe('B');
  });

  test('reports an extra runboard-side property as a difference outside the runboard extension', () => {
    const html = emptyHtmlReport();
    const runboard = { ...emptyRunboardReport(), unexpectedExtra: 1 };
    const diffs = compareCompatibility(buildRun({ htmlReport: html, runboardReport: runboard }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe('report/unexpectedExtra');
    expect(diffs[0]?.actual).toBe(1);
    expect(diffs[0]?.expected).toBeUndefined();
  });

  test('reports a missing runboard-side property as a difference', () => {
    const html = { ...emptyHtmlReport(), customField: 'present' };
    const runboard = emptyRunboardReport();
    const diffs = compareCompatibility(buildRun({ htmlReport: html, runboardReport: runboard }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe('report/customField');
    expect(diffs[0]?.expected).toBe('present');
    expect(diffs[0]?.actual).toBeUndefined();
  });

  test('reports a missing per-file entry on the runboard side', () => {
    const htmlFiles = new Map<string, Record<string, unknown>>([
      ['abc', { fileId: 'abc', fileName: 'a.spec.ts', tests: [] }],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles: new Map() }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe('files/abc');
    expect(diffs[0]?.expected).toBeDefined();
    expect(diffs[0]?.actual).toBeUndefined();
  });
});

test.describe('formatDifferences', () => {
  test('produces a multi-line output that names each contract path so an AFK agent can act', () => {
    const out = formatDifferences([
      {
        path: 'report/files/0/tests/0/location/file',
        expected: 'tests/foo.spec.ts',
        actual: 'tests/bar.spec.ts',
      },
      {
        path: 'files/abc/tests/0/results/0/status',
        expected: 'passed',
        actual: 'failed',
      },
    ]);
    expect(out).toContain('report/files/0/tests/0/location/file');
    expect(out).toContain('tests/foo.spec.ts');
    expect(out).toContain('tests/bar.spec.ts');
    expect(out).toContain('files/abc/tests/0/results/0/status');
    expect(out).toContain('passed');
    expect(out).toContain('failed');
  });
});
