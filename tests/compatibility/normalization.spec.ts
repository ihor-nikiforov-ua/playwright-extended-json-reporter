/**
 * Compatibility Fixture normalization tests.
 *
 * Compatibility normalization is limited to a small,
 * explicitly enumerated allowlist:
 *   - path roots (absolute → relative POSIX),
 *   - timestamps and durations (run-to-run noise),
 *   - equivalent attachment hashes or paths,
 *   - snippet/codeframe line-ending or root-path noise,
 *   - version/package metadata.
 * Anything outside this allowlist must produce a strict difference.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
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

  test('absolute path prefixes equal to the fixture root are normalized away inside string fields', () => {
    const rootDir = '/tmp/runboard-fixture-root-A';
    const htmlFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            {
              title: 't',
              location: { file: `${rootDir}/a.spec.ts`, line: 1, column: 1 },
            },
          ],
        },
      ],
    ]);
    // Runboard side stores the same field as a POSIX-relative path; root
    // normalization should strip the html-side absolute prefix so the
    // comparator sees them as equal.
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
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles, rootDir }));
    expect(diffs).toEqual([]);
  });

  test('snippet/codeframe absolute paths under the fixture root normalize to a stable placeholder', () => {
    const rootDir = '/tmp/runboard-fixture-root-B';
    const codeframeWithAbsolute = `at ${rootDir}/specs/a.spec.ts:1:1\nexpect(1).toBe(2)`;
    const codeframeWithRelative = `at specs/a.spec.ts:1:1\nexpect(1).toBe(2)`;
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
                  errors: [{ message: 'bad', codeframe: codeframeWithAbsolute }],
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
                  errors: [{ message: 'bad', codeframe: codeframeWithRelative }],
                },
              ],
            },
          ],
        },
      ],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles, rootDir }));
    expect(diffs).toEqual([]);
  });

  test('non-root path differences still surface as strict mismatches', () => {
    const rootDir = '/tmp/runboard-fixture-root-C';
    const htmlFiles = new Map<string, Record<string, unknown>>([
      [
        'abc',
        {
          fileId: 'abc',
          fileName: 'a.spec.ts',
          tests: [
            { title: 't', location: { file: '/some/other/place/a.spec.ts', line: 1, column: 1 } },
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
            { title: 't', location: { file: '/yet/another/place/a.spec.ts', line: 1, column: 1 } },
          ],
        },
      ],
    ]);
    const diffs = compareCompatibility(buildRun({ htmlFiles, runboardFiles, rootDir }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toContain('location/file');
  });

  test('attachment data/<sha>.<ext> path divergence is normalized only when underlying bytes match', () => {
    const sharedBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
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
    const htmlAttachments = new Map<string, Buffer>([
      ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', sharedBytes],
    ]);
    const runboardAttachments = new Map<string, Buffer>([
      ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png', sharedBytes],
    ]);
    const diffs = compareCompatibility(
      buildRun({ htmlFiles, runboardFiles, htmlAttachments, runboardAttachments }),
    );
    expect(diffs).toEqual([]);
  });

  test('attachments with same path but divergent bytes surface a content difference', () => {
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
    const htmlAttachments = new Map<string, Buffer>([
      ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', Buffer.from('html-bytes')],
    ]);
    const runboardAttachments = new Map<string, Buffer>([
      ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png', Buffer.from('runboard-bytes-differ')],
    ]);
    const diffs = compareCompatibility(
      buildRun({ htmlFiles, runboardFiles, htmlAttachments, runboardAttachments }),
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toContain('attachments/0/path');
  });

  test('attachment path divergence without provided bytes refuses to normalize and surfaces a difference', () => {
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
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toContain('attachments/0/path');
  });

  test('attachments referenced by identical paths but missing bytes on one side surface a difference', () => {
    // Regression scenario: a future change could keep emitting the right
    // `data/<sha>.<ext>` path while failing to write the copied asset. Because
    // Playwright derives the path from sha1(bytes), naive normalization on the
    // HTML side returns the same string the runboard side sends through
    // unchanged, so the comparator must instead refuse to normalize a path
    // whose bytes are missing on either side.
    const bytes = Buffer.from('asset-bytes-on-html-side-only');
    const sha = createHash('sha1').update(bytes).digest('hex');
    const sharedPath = `data/${sha}.png`;
    const file = (path: string): Record<string, unknown> => ({
      fileId: 'abc',
      fileName: 'a.spec.ts',
      tests: [
        {
          title: 't',
          results: [
            {
              retry: 0,
              status: 'passed',
              attachments: [{ name: 'screenshot', contentType: 'image/png', path }],
            },
          ],
        },
      ],
    });
    const htmlFiles = new Map<string, Record<string, unknown>>([['abc', file(sharedPath)]]);
    const runboardFiles = new Map<string, Record<string, unknown>>([['abc', file(sharedPath)]]);
    const htmlAttachments = new Map<string, Buffer>([[`${sha}.png`, bytes]]);
    const runboardAttachments = new Map<string, Buffer>();
    const diffs = compareCompatibility(
      buildRun({ htmlFiles, runboardFiles, htmlAttachments, runboardAttachments }),
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toContain('attachments/0/path');
  });

  test('non-default attachmentsBaseURL is honored when normalizing attachment paths', () => {
    // Issue #5: `attachmentsBaseURL` controls where the report references
    // copied assets. The comparator must therefore match attachment paths
    // against the configured prefix — not a hard-coded `data/` — so a
    // regression that silently drops the asset under a custom prefix still
    // surfaces a difference.
    const bytes = Buffer.from('asset-bytes-with-custom-baseurl');
    const sha = createHash('sha1').update(bytes).digest('hex');
    const sharedPath = `assets/${sha}.png`;
    const file = (path: string): Record<string, unknown> => ({
      fileId: 'abc',
      fileName: 'a.spec.ts',
      tests: [
        {
          title: 't',
          results: [
            {
              retry: 0,
              status: 'passed',
              attachments: [{ name: 'screenshot', contentType: 'image/png', path }],
            },
          ],
        },
      ],
    });
    const htmlFiles = new Map<string, Record<string, unknown>>([['abc', file(sharedPath)]]);
    const runboardFiles = new Map<string, Record<string, unknown>>([['abc', file(sharedPath)]]);
    const htmlAttachments = new Map<string, Buffer>([[`${sha}.png`, bytes]]);
    const runboardAttachments = new Map<string, Buffer>();
    const diffs = compareCompatibility(
      buildRun({
        htmlFiles,
        runboardFiles,
        htmlAttachments,
        runboardAttachments,
        attachmentsBaseURL: 'assets/',
      }),
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toContain('attachments/0/path');
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
    const htmlAttachments = new Map<string, Buffer>([
      ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', Buffer.from('same-bytes')],
    ]);
    const runboardAttachments = new Map<string, Buffer>([
      ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', Buffer.from('same-bytes')],
    ]);
    const diffs = compareCompatibility(
      buildRun({ htmlFiles, runboardFiles, htmlAttachments, runboardAttachments }),
    );
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
