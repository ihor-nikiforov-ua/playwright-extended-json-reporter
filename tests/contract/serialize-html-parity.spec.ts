import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { RunboardReporter } from '../../src/index.js';
import { fakeFullResult, fakeRun } from '../helpers/fake-playwright.js';

test.describe('RunboardReporter — Playwright HTML parity', () => {
  let outputFolder: string;
  let scratchRoot: string;

  test.beforeEach(async () => {
    outputFolder = await mkdtemp(join(tmpdir(), 'runboard-parity-out-'));
    scratchRoot = await mkdtemp(join(tmpdir(), 'runboard-parity-src-'));
  });

  test.afterEach(async () => {
    await rm(outputFolder, { recursive: true, force: true });
    await rm(scratchRoot, { recursive: true, force: true });
  });

  async function readReport(): Promise<{
    files: Array<{ fileId: string; fileName: string; tests: Array<Record<string, unknown>> }>;
  }> {
    return JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
  }

  async function readFileEntry(
    fileId: string,
  ): Promise<{ fileId: string; fileName: string; tests: Array<Record<string, unknown>> }> {
    return JSON.parse(await readFile(join(outputFolder, `${fileId}.json`), 'utf8'));
  }

  test('test case location is rewritten root-relative POSIX', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/sub/login.spec.ts',
          tests: [
            {
              title: 'sign in',
              location: { file: '/repo/tests/sub/login.spec.ts', line: 4, column: 2 },
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const [summary] = fileSummary.tests;
    if (!summary) throw new Error('expected summary');
    expect(summary['location']).toEqual({
      file: 'tests/sub/login.spec.ts',
      line: 4,
      column: 2,
    });
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [full] = fileEntry.tests;
    if (!full) throw new Error('expected full');
    expect(full['location']).toEqual({
      file: 'tests/sub/login.spec.ts',
      line: 4,
      column: 2,
    });
  });

  test('step location is rewritten root-relative POSIX', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/steps.spec.ts',
          tests: [
            {
              title: 'with step',
              results: [
                {
                  status: 'passed',
                  steps: [
                    {
                      title: 'click',
                      location: { file: '/repo/tests/sub/helpers.ts', line: 10, column: 3 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const [step] = result['steps'] as Array<Record<string, unknown>>;
    if (!step) throw new Error('expected step');
    expect(step['location']).toEqual({
      file: 'tests/sub/helpers.ts',
      line: 10,
      column: 3,
    });
  });

  test('status-derived error appears when expected-fail test passes', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/expected-fail.spec.ts',
          tests: [
            {
              title: 'expected to fail but passed',
              status: 'passed',
              expectedStatus: 'failed',
              results: [{ status: 'passed' }],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const errors = result['errors'] as Array<Record<string, unknown>>;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.['message']).toContain('Expected to fail, but passed.');
  });

  test('status-derived error appears when result is interrupted', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/interrupted.spec.ts',
          tests: [
            {
              title: 'interrupted run',
              status: 'interrupted',
              expectedStatus: 'passed',
              results: [{ status: 'interrupted' }],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const errors = result['errors'] as Array<Record<string, unknown>>;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.['message']).toContain('Test was interrupted.');
  });

  test('error codeframe is generated from error.location source', async () => {
    const sourceFile = join(scratchRoot, 'tests/codeframe.spec.ts');
    await mkdir(dirname(sourceFile), { recursive: true });
    await writeFile(sourceFile, 'a;\nb;\nthrow new Error("boom");\nd;\ne;\n', 'utf8');

    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: scratchRoot,
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'fails with location',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: 'boom',
                      location: { file: sourceFile, line: 3, column: 7 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const [error] = result['errors'] as Array<Record<string, unknown>>;
    if (!error) throw new Error('expected error');
    expect(typeof error['codeframe']).toBe('string');
    expect(error['codeframe']).toContain('throw new Error("boom");');
  });

  test('file attachment is copied to data/<sha>.<ext> and path rewritten via attachmentsBaseURL', async () => {
    const assetPath = join(scratchRoot, 'screenshot.png');
    const assetBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    await writeFile(assetPath, assetBytes);

    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: scratchRoot,
      files: [
        {
          fileName: join(scratchRoot, 'tests/cap.spec.ts'),
          tests: [
            {
              title: 'attached',
              results: [
                {
                  status: 'passed',
                  attachments: [{ name: 'screenshot', contentType: 'image/png', path: assetPath }],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const sha1 = createHash('sha1').update(assetBytes).digest('hex');
    const expectedFileName = `${sha1}.png`;
    const dataFiles = await readdir(join(outputFolder, 'data'));
    expect(dataFiles).toContain(expectedFileName);

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const attachments = result['attachments'] as Array<Record<string, unknown>>;
    expect(attachments[0]?.['path']).toBe(`data/${expectedFileName}`);
    expect(attachments[0]).not.toHaveProperty('body');
  });

  test('binary body attachment is written to data/<sha>.<ext> and path rewritten', async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: scratchRoot,
      files: [
        {
          fileName: join(scratchRoot, 'tests/bin.spec.ts'),
          tests: [
            {
              title: 'binary',
              results: [
                {
                  status: 'passed',
                  attachments: [
                    { name: 'sample.bin', contentType: 'application/octet-stream', body: binary },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const sha1 = createHash('sha1').update(binary).digest('hex');
    const dataFiles = await readdir(join(outputFolder, 'data'));
    const match = dataFiles.find((f) => f.startsWith(sha1));
    expect(match).toBeDefined();

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const attachments = result['attachments'] as Array<Record<string, unknown>>;
    expect(attachments[0]?.['path']).toBe(`data/${match}`);
    expect(attachments[0]).not.toHaveProperty('body');
  });

  test('text body attachment is decoded and inlined without writing to data/', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: scratchRoot,
      files: [
        {
          fileName: join(scratchRoot, 'tests/txt.spec.ts'),
          tests: [
            {
              title: 'text',
              results: [
                {
                  status: 'passed',
                  attachments: [
                    {
                      name: 'note',
                      contentType: 'text/plain',
                      body: Buffer.from('inline content'),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const attachments = result['attachments'] as Array<Record<string, unknown>>;
    expect(attachments[0]).toEqual({
      name: 'note',
      contentType: 'text/plain',
      body: 'inline content',
    });
  });

  test('stdout and stderr are serialized as text/plain attachments', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: scratchRoot,
      files: [
        {
          fileName: join(scratchRoot, 'tests/stdio.spec.ts'),
          tests: [
            {
              title: 'with stdio',
              results: [
                {
                  status: 'passed',
                  stdout: ['hello\n', Buffer.from('world\n')],
                  stderr: ['oops\n'],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const attachments = result['attachments'] as Array<Record<string, unknown>>;
    const stdoutAttachment = attachments.find((a) => a['name'] === 'stdout');
    const stderrAttachment = attachments.find((a) => a['name'] === 'stderr');
    expect(stdoutAttachment).toEqual({
      name: 'stdout',
      contentType: 'text/plain',
      body: 'hello\nworld\n',
    });
    expect(stderrAttachment).toEqual({
      name: 'stderr',
      contentType: 'text/plain',
      body: 'oops\n',
    });
  });

  test('consecutive identical leaf steps with locations are deduped into a count', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const stepLocation = { file: '/repo/tests/sub/helper.ts', line: 5, column: 3 };
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/dedupe.spec.ts',
          tests: [
            {
              title: 'dedupes',
              results: [
                {
                  status: 'passed',
                  steps: [
                    {
                      title: 'expect ok',
                      duration: 5,
                      location: stepLocation,
                      category: 'expect',
                    },
                    {
                      title: 'expect ok',
                      duration: 7,
                      location: stepLocation,
                      category: 'expect',
                    },
                    {
                      title: 'other',
                      duration: 3,
                      location: { file: '/repo/tests/sub/helper.ts', line: 9, column: 3 },
                      category: 'expect',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const steps = result['steps'] as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    expect(steps[0]?.['title']).toBe('expect ok');
    expect(steps[0]?.['count']).toBe(2);
    expect(steps[0]?.['duration']).toBe(12);
    expect(steps[1]?.['title']).toBe('other');
    expect(steps[1]?.['count']).toBe(1);
  });

  test('skip annotation marks step skipped and updates title', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/skip.spec.ts',
          tests: [
            {
              title: 'with skipped step',
              results: [
                {
                  status: 'passed',
                  steps: [
                    {
                      title: 'optional flow',
                      annotations: [{ type: 'skip', description: 'feature off' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase['results'] as Array<Record<string, unknown>>;
    if (!result) throw new Error('expected result');
    const [step] = result['steps'] as Array<Record<string, unknown>>;
    if (!step) throw new Error('expected step');
    expect(step['skipped']).toBe(true);
    expect(step['title']).toBe('optional flow (skipped: feature off)');
  });
});
