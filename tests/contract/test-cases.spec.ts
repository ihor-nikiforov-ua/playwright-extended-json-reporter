import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { RunboardReporter } from '../../src/index.js';
import { fakeFullResult, fakeRun } from '../helpers/fake-playwright.js';

test.describe('RunboardReporter — Test Case Serialization', () => {
  let outputFolder: string;

  test.beforeEach(async () => {
    outputFolder = await mkdtemp(join(tmpdir(), 'runboard-tests-'));
  });

  test.afterEach(async () => {
    await rm(outputFolder, { recursive: true, force: true });
  });

  async function readReport(): Promise<{
    files: Array<{
      fileId: string;
      fileName: string;
      tests: Array<Record<string, unknown>>;
    }>;
  }> {
    return JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
  }

  async function readFileEntry(fileId: string): Promise<{
    fileId: string;
    fileName: string;
    tests: Array<Record<string, unknown>>;
  }> {
    return JSON.parse(await readFile(join(outputFolder, `${fileId}.json`), 'utf8'));
  }

  test('report.files[].tests contains lightweight RunboardTestCaseSummary entries', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      projectName: 'webkit',
      files: [
        {
          fileName: '/repo/tests/login.spec.ts',
          tests: [
            {
              title: 'sign in',
              location: { file: '/repo/tests/login.spec.ts', line: 10, column: 5 },
              tags: ['@auth'],
              annotations: [{ type: 'owner', description: 'team-platform' }],
              results: [
                {
                  status: 'passed',
                  startTime: new Date('2026-01-01T00:00:00.000Z'),
                  duration: 12,
                  workerIndex: 3,
                  attachments: [
                    { name: 'screenshot', contentType: 'image/png', path: '/tmp/x.png' },
                    {
                      name: 'note',
                      contentType: 'text/plain',
                      body: Buffer.from('inline'),
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
    expect(fileSummary.tests).toHaveLength(1);
    const [summary] = fileSummary.tests;
    if (!summary) throw new Error('expected summary');

    expect(summary['title']).toBe('sign in');
    expect(summary['projectName']).toBe('webkit');
    expect(summary['outcome']).toBe('expected');
    expect(summary['duration']).toBe(12);
    expect(summary['ok']).toBe(true);
    expect(summary['tags']).toEqual(['@auth']);
    expect(summary['annotations']).toEqual([{ type: 'owner', description: 'team-platform' }]);
    const summaryResults = summary['results'] as Array<Record<string, unknown>>;
    expect(summaryResults).toHaveLength(1);
    const [resultSummary] = summaryResults;
    if (!resultSummary) throw new Error('expected result summary');
    expect(resultSummary['startTime']).toBe('2026-01-01T00:00:00.000Z');
    expect(resultSummary['workerIndex']).toBe(3);
    expect(resultSummary['attachments']).toEqual([
      { name: 'screenshot', contentType: 'image/png', path: '/tmp/x.png' },
      { name: 'note', contentType: 'text/plain' },
    ]);
    // Summary attachments must NOT contain bodies — those live in the full file entry.
    for (const attachment of resultSummary['attachments'] as Array<Record<string, unknown>>) {
      expect(attachment).not.toHaveProperty('body');
    }
    // Summary results must not include heavy fields like steps or errors.
    expect(resultSummary).not.toHaveProperty('steps');
    expect(resultSummary).not.toHaveProperty('errors');
    expect(resultSummary).not.toHaveProperty('status');
    expect(resultSummary).not.toHaveProperty('duration');
  });

  test('full RunboardTestResult preserves retry/startTime/duration/status/workerIndex/annotations', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/full.spec.ts',
          tests: [
            {
              title: 'attempt twice',
              outcome: 'flaky',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  retry: 0,
                  startTime: new Date('2026-02-02T00:00:00.000Z'),
                  duration: 99,
                  workerIndex: 7,
                  annotations: [{ type: 'flake', description: 'first try' }],
                },
                {
                  status: 'passed',
                  retry: 1,
                  startTime: new Date('2026-02-02T00:00:01.000Z'),
                  duration: 50,
                  workerIndex: 7,
                  annotations: [{ type: 'flake', description: 'second try' }],
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
    const results = testCase['results'] as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      retry: 0,
      startTime: '2026-02-02T00:00:00.000Z',
      duration: 99,
      status: 'failed',
      workerIndex: 7,
      annotations: [{ type: 'flake', description: 'first try' }],
    });
    expect(results[1]).toMatchObject({
      retry: 1,
      startTime: '2026-02-02T00:00:01.000Z',
      duration: 50,
      status: 'passed',
      workerIndex: 7,
      annotations: [{ type: 'flake', description: 'second try' }],
    });
  });

  test('full result preserves attachments (path and body) and serialized display errors', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/errors.spec.ts',
          tests: [
            {
              title: 'fails loudly',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  attachments: [
                    { name: 'trace', contentType: 'application/zip', path: '/tmp/trace.zip' },
                    { name: 'stdout', contentType: 'text/plain', body: Buffer.from('hi') },
                  ],
                  errors: [
                    {
                      message: 'Expected 1 to be 2',
                      stack: 'Error: Expected 1 to be 2\n    at fails:5:1',
                      snippet: '> 5 | expect(1).toBe(2);',
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
    expect(result['attachments']).toEqual([
      { name: 'trace', contentType: 'application/zip', path: '/tmp/trace.zip' },
      { name: 'stdout', contentType: 'text/plain', body: 'hi' },
    ]);
    const errors = result['errors'] as Array<Record<string, unknown>>;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.['message']).toContain('Expected 1 to be 2');
  });

  test('steps preserve nested structure, location, error, attachment indexes, and count', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const sharedAttachment = {
      name: 'screenshot',
      contentType: 'image/png',
      path: '/tmp/cap.png',
    };
    const childErrorAttachment = {
      name: 'log',
      contentType: 'text/plain',
      body: Buffer.from('child error'),
    };
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/steps.spec.ts',
          tests: [
            {
              title: 'with nested steps',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  attachments: [sharedAttachment, childErrorAttachment],
                  steps: [
                    {
                      title: 'outer step',
                      startTime: new Date('2026-03-03T00:00:00.000Z'),
                      duration: 17,
                      location: { file: '/repo/tests/steps.spec.ts', line: 11, column: 4 },
                      attachments: [sharedAttachment],
                      steps: [
                        {
                          title: 'inner step',
                          startTime: new Date('2026-03-03T00:00:00.500Z'),
                          duration: 4,
                          error: { message: 'inner failed' },
                          attachments: [childErrorAttachment],
                        },
                      ],
                    },
                    {
                      title: 'skipped sibling',
                      annotations: [{ type: 'skip' }],
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

    const steps = result['steps'] as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);

    const outer = steps[0] as Record<string, unknown>;
    expect(outer['title']).toBe('outer step');
    expect(outer['startTime']).toBe('2026-03-03T00:00:00.000Z');
    expect(outer['duration']).toBe(17);
    expect(outer['location']).toEqual({
      file: 'tests/steps.spec.ts',
      line: 11,
      column: 4,
    });
    expect(outer['attachments']).toEqual([0]);
    expect(outer['count']).toBe(1);

    const innerSteps = outer['steps'] as Array<Record<string, unknown>>;
    expect(innerSteps).toHaveLength(1);
    const inner = innerSteps[0] as Record<string, unknown>;
    expect(inner['title']).toBe('inner step');
    expect(inner['error']).toContain('inner failed');
    expect(inner['attachments']).toEqual([1]);

    const skipped = steps[1] as Record<string, unknown>;
    expect(skipped['title']).toBe('skipped sibling (skipped)');
    expect(skipped['skipped']).toBe(true);
  });

  test('omits step snippet when noSnippets is enabled', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'snip-no-'));
    try {
      const sourceFile = join(sourceRoot, 'tests/snip.spec.ts');
      await mkdir(dirname(sourceFile), { recursive: true });
      await writeFile(sourceFile, 'a;\nb;\nlocator.click();\nd;\ne;\n', 'utf8');

      const reporter = new RunboardReporter({ outputFolder, noSnippets: true });
      const run = fakeRun({
        rootDir: sourceRoot,
        files: [
          {
            fileName: sourceFile,
            tests: [
              {
                title: 'snippet test',
                results: [
                  {
                    status: 'passed',
                    steps: [
                      {
                        title: 'click',
                        location: { file: sourceFile, line: 3, column: 1 },
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
      expect(step).not.toHaveProperty('snippet');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('generates step snippet from step.location source by default', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'snip-yes-'));
    try {
      const sourceFile = join(sourceRoot, 'tests/snip.spec.ts');
      await mkdir(dirname(sourceFile), { recursive: true });
      await writeFile(sourceFile, 'a;\nb;\nlocator.click();\nd;\ne;\n', 'utf8');

      const reporter = new RunboardReporter({ outputFolder });
      const run = fakeRun({
        rootDir: sourceRoot,
        files: [
          {
            fileName: sourceFile,
            tests: [
              {
                title: 'snippet test',
                results: [
                  {
                    status: 'passed',
                    steps: [
                      {
                        title: 'click',
                        location: { file: sourceFile, line: 3, column: 1 },
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
      expect(step['snippet']).toContain('locator.click();');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('flaky test exposes one summary entry with one summary per attempt', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/flaky.spec.ts',
          tests: [
            {
              title: 'flaky test',
              outcome: 'flaky',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  startTime: new Date('2026-01-01T00:00:00.000Z'),
                  workerIndex: 1,
                },
                {
                  status: 'passed',
                  startTime: new Date('2026-01-01T00:00:01.000Z'),
                  workerIndex: 1,
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
    expect(fileSummary.tests).toHaveLength(1);
    const [summary] = fileSummary.tests;
    if (!summary) throw new Error('expected summary');
    expect(summary['outcome']).toBe('flaky');
    expect(summary['ok']).toBe(true);
    const summaryResults = summary['results'] as Array<Record<string, unknown>>;
    expect(summaryResults).toHaveLength(2);
    expect(summaryResults[0]?.['startTime']).toBe('2026-01-01T00:00:00.000Z');
    expect(summaryResults[1]?.['startTime']).toBe('2026-01-01T00:00:01.000Z');

    const fileEntry = await readFileEntry(fileSummary.fileId);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const fullResults = testCase['results'] as Array<Record<string, unknown>>;
    expect(fullResults).toHaveLength(2);
    expect(fullResults[0]?.['retry']).toBe(0);
    expect(fullResults[0]?.['status']).toBe('failed');
    expect(fullResults[1]?.['retry']).toBe(1);
    expect(fullResults[1]?.['status']).toBe('passed');
  });

  test('test case duration sums durations across retry attempts', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/durations.spec.ts',
          tests: [
            {
              title: 'flaky timing',
              outcome: 'flaky',
              expectedStatus: 'passed',
              results: [
                { status: 'failed', duration: 100 },
                { status: 'passed', duration: 25 },
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
    const [summary] = fileSummary.tests;
    if (!summary) throw new Error('expected summary');
    expect(summary['duration']).toBe(125);
  });

  test('test case path contains describe-block titles between file and test', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/desc.spec.ts',
          tests: [
            {
              title: 'leaf',
              describes: ['outer suite', 'inner suite'],
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
    expect(testCase['path']).toEqual(['outer suite', 'inner suite']);
  });

  test('writes full RunboardTestCase entries into <fileId>.json', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      projectName: 'chromium',
      files: [
        {
          fileName: '/repo/tests/checkout.spec.ts',
          tests: [
            {
              title: 'completes purchase',
              location: { file: '/repo/tests/checkout.spec.ts', line: 42, column: 7 },
              tags: ['@smoke'],
              annotations: [{ type: 'issue', description: 'PR-42' }],
              repeatEachIndex: 2,
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = await readReport();
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected one file summary');
    const fileEntry = await readFileEntry(fileSummary.fileId);
    expect(fileEntry.tests).toHaveLength(1);
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected one test case');

    expect(testCase['title']).toBe('completes purchase');
    expect(testCase['projectName']).toBe('chromium');
    expect(testCase['location']).toEqual({
      file: 'tests/checkout.spec.ts',
      line: 42,
      column: 7,
    });
    expect(testCase['tags']).toEqual(['@smoke']);
    expect(testCase['annotations']).toEqual([{ type: 'issue', description: 'PR-42' }]);
    expect(testCase['repeatEachIndex']).toBe(2);
    expect(testCase['outcome']).toBe('expected');
    expect(testCase['ok']).toBe(true);
    expect(typeof testCase['testId']).toBe('string');
    expect(testCase['testId']).not.toBe('');
    expect(Array.isArray(testCase['path'])).toBe(true);
    expect(Array.isArray(testCase['results'])).toBe(true);
  });
});
