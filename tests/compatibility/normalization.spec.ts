/**
 * Compatibility Fixture normalization tests.
 *
 * The data-contract PRD limits compatibility normalization to a small,
 * explicitly enumerated allowlist:
 *   - path roots (absolute → relative POSIX),
 *   - timestamps and durations (run-to-run noise),
 *   - equivalent attachment hashes or paths,
 *   - snippet/codeframe line-ending or root-path noise,
 *   - version/package metadata.
 * Anything outside this allowlist must produce a strict difference.
 */
import { expect, test } from '@playwright/test';
import { type CompatibilityRun, compareCompatibility } from '../harness/compatibility-fixture.js';

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
    rootDir: '/repo',
    ...overrides,
  };
}

test.describe('Normalization allowlist', () => {
  test('startTime divergence is normalized to a single placeholder on both sides', () => {
    const html = { ...emptyHtmlReport(), startTime: 1700000000000 };
    const runboard = { ...emptyRunboardReport(), startTime: 1700000000999 };
    const diffs = compareCompatibility(buildRun({ htmlReport: html, runboardReport: runboard }));
    expect(diffs).toEqual([]);
  });

  test('duration divergence is normalized away', () => {
    const html = { ...emptyHtmlReport(), duration: 12 };
    const runboard = { ...emptyRunboardReport(), duration: 19 };
    const diffs = compareCompatibility(buildRun({ htmlReport: html, runboardReport: runboard }));
    expect(diffs).toEqual([]);
  });

  test('per-result startTime/duration divergence is normalized inside files', () => {
    const baseFile = (startTime: string, duration: number) => ({
      fileId: 'abc',
      fileName: 'a.spec.ts',
      tests: [
        {
          title: 't',
          duration,
          results: [{ retry: 0, startTime, duration, status: 'passed' }],
        },
      ],
    });
    const htmlFiles = new Map<string, Record<string, unknown>>([
      ['abc', baseFile('2024-01-01T00:00:00.000Z', 12)],
    ]);
    const runboardFiles = new Map<string, Record<string, unknown>>([
      ['abc', baseFile('2024-12-31T23:59:59.999Z', 30)],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles }));
    expect(diffs).toEqual([]);
  });

  test('absolute filesystem prefixes inside string fields are normalized to a stable placeholder', () => {
    const htmlFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [{ title: 't', location: { file: 'a.spec.ts', line: 1, column: 1 } }],
        },
      ],
    ]);
    const runboardFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [{ title: 't', location: { file: 'a.spec.ts', line: 1, column: 1 } }],
        },
      ],
    ]);
    const diffs = compareCompatibility(
      buildRun({
        htmlFiles,
        runboardFiles,
        rootDir: '/different/root/that/should/not/matter',
      }),
    );
    expect(diffs).toEqual([]);
  });

  test('attachment data/<sha>.<ext> path divergence is normalized when both reference equivalent extensions', () => {
    const htmlFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            {
              title: 't',
              results: [
                {
                  retry: 0,
                  status: 'passed',
                  attachments: [
                    {
                      name: 'screenshot',
                      contentType: 'image/png',
                      path: 'data/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    ]);
    const runboardFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            {
              title: 't',
              results: [
                {
                  retry: 0,
                  status: 'passed',
                  attachments: [
                    {
                      name: 'screenshot',
                      contentType: 'image/png',
                      path: 'data/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles }));
    expect(diffs).toEqual([]);
  });

  test('attachment with mismatched extension still surfaces a difference', () => {
    const htmlFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            {
              title: 't',
              results: [
                {
                  retry: 0,
                  status: 'passed',
                  attachments: [
                    {
                      name: 'screenshot',
                      contentType: 'image/png',
                      path: 'data/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    ]);
    const runboardFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            {
              title: 't',
              results: [
                {
                  retry: 0,
                  status: 'passed',
                  attachments: [
                    {
                      name: 'screenshot',
                      contentType: 'image/png',
                      path: 'data/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toContain('attachments/0/path');
  });

  test('CRLF/LF differences inside snippet strings are normalized to LF', () => {
    const htmlFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            {
              title: 't',
              results: [
                {
                  retry: 0,
                  status: 'failed',
                  errors: [{ message: 'bad', codeframe: 'line1\r\nline2\r\n' }],
                },
              ],
            },
          ],
        },
      ],
    ]);
    const runboardFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            {
              title: 't',
              results: [
                {
                  retry: 0,
                  status: 'failed',
                  errors: [{ message: 'bad', codeframe: 'line1\nline2\n' }],
                },
              ],
            },
          ],
        },
      ],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles }));
    expect(diffs).toEqual([]);
  });

  test('Playwright reporter version metadata in report.options is normalized but option mismatches still surface', () => {
    // The Runboard Reporter does not expose `_playwrightVersion` in options;
    // nullable HTML reporter version-ish metadata should be normalized away
    // while a deliberate option mismatch still fails.
    const html = {
      ...emptyHtmlReport(),
      options: { title: 'My report' },
    };
    const runboard = {
      ...emptyRunboardReport(),
      options: { title: 'Other title' },
    };
    const diffs = compareCompatibility(buildRun({ htmlReport: html, runboardReport: runboard }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe('report/options/title');
  });
});
