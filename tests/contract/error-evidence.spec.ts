import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { RunboardReporter } from '../../src/index.js';
import { fakeFullResult, fakeRun } from '../helpers/fake-playwright.js';

test.describe('RunboardReporter — Structured Error Evidence', () => {
  let outputFolder: string;

  test.beforeEach(async () => {
    outputFolder = await mkdtemp(join(tmpdir(), 'runboard-evidence-'));
  });

  test.afterEach(async () => {
    await rm(outputFolder, { recursive: true, force: true });
  });

  async function readResult(): Promise<Record<string, unknown>> {
    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8')) as {
      files: Array<{ fileId: string }>;
    };
    const [fileSummary] = report.files;
    if (!fileSummary) throw new Error('expected file summary');
    const fileEntry = JSON.parse(
      await readFile(join(outputFolder, `${fileSummary.fileId}.json`), 'utf8'),
    ) as { tests: Array<{ results: Array<Record<string, unknown>> }> };
    const [testCase] = fileEntry.tests;
    if (!testCase) throw new Error('expected test case');
    const [result] = testCase.results;
    if (!result) throw new Error('expected result');
    return result;
  }

  test('passing test with no display errors omits result.runboard', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/pass.spec.ts',
          tests: [{ title: 'pass', results: [{ status: 'passed' }] }],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const result = await readResult();
    expect(result).not.toHaveProperty('runboard');
  });

  test('raw TestError emits result.runboard.evidence[0] with source=test-error and preserves message/stack/value/snippet', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/err.spec.ts',
          tests: [
            {
              title: 'fails',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: 'Expected 1 to be 2',
                      stack: 'Error: Expected 1 to be 2\n    at fails:5:1',
                      value: 'thrown-value',
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    expect(runboard).toBeDefined();
    expect(runboard.evidence).toHaveLength(1);
    const [evidence] = runboard.evidence;
    if (!evidence) throw new Error('expected evidence');
    expect(evidence['source']).toBe('test-error');
    expect(evidence['message']).toBe('Expected 1 to be 2');
    expect(evidence['stack']).toBe('Error: Expected 1 to be 2\n    at fails:5:1');
    expect(evidence['value']).toBe('thrown-value');
    expect(evidence['snippet']).toBe('> 5 | expect(1).toBe(2);');
  });

  test('test.fail() unexpectedly passing emits source=status-derived with required message', async () => {
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    expect(runboard.evidence).toHaveLength(1);
    expect(runboard.evidence[0]).toEqual({
      source: 'status-derived',
      message: 'Expected to fail, but passed.',
    });
  });

  test('interrupted result emits source=status-derived evidence', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/interrupted.spec.ts',
          tests: [
            {
              title: 'interrupted',
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    expect(runboard.evidence).toHaveLength(1);
    expect(runboard.evidence[0]).toEqual({
      source: 'status-derived',
      message: 'Test was interrupted.',
    });
  });

  test('evidence aligns by index with serialized result.errors[] when both status-derived and test-error present', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/mixed.spec.ts',
          tests: [
            {
              title: 'interrupted with TestError',
              status: 'interrupted',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'interrupted',
                  errors: [{ message: 'underlying failure' }],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const result = await readResult();
    const errors = result['errors'] as Array<Record<string, unknown>>;
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    expect(errors).toHaveLength(2);
    expect(runboard.evidence).toHaveLength(2);

    expect(errors[0]?.['message']).toContain('Test was interrupted.');
    expect(runboard.evidence[0]?.['source']).toBe('status-derived');
    expect(runboard.evidence[0]?.['message']).toBe('Test was interrupted.');

    expect(errors[1]?.['message']).toContain('underlying failure');
    expect(runboard.evidence[1]?.['source']).toBe('test-error');
    expect(runboard.evidence[1]?.['message']).toBe('underlying failure');
  });

  test('evidence preserves location relative to rootDir as POSIX path', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/loc.spec.ts',
          tests: [
            {
              title: 'has location',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: 'boom',
                      location: { file: '/repo/tests/sub/loc.spec.ts', line: 7, column: 3 },
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    const [evidence] = runboard.evidence;
    expect(evidence?.['location']).toEqual({
      file: 'tests/sub/loc.spec.ts',
      line: 7,
      column: 3,
    });
  });

  test('evidence preserves recursive cause data', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/cause.spec.ts',
          tests: [
            {
              title: 'with cause',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: 'outer',
                      cause: {
                        message: 'inner',
                        cause: { message: 'deepest' },
                      },
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    const [evidence] = runboard.evidence;
    expect(evidence?.['source']).toBe('test-error');
    expect(evidence?.['message']).toBe('outer');
    const cause = evidence?.['cause'] as Record<string, unknown> | undefined;
    expect(cause?.['source']).toBe('test-error');
    expect(cause?.['message']).toBe('inner');
    const innerCause = cause?.['cause'] as Record<string, unknown> | undefined;
    expect(innerCause?.['message']).toBe('deepest');
    expect(innerCause).not.toHaveProperty('cause');
  });

  test('evidence captures stepPath, stepCategory, and attachmentIndexes from step containing the error', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const screenshot = { name: 'screenshot', contentType: 'image/png', path: '/tmp/cap.png' };
    const stepError = { message: 'boom inside step' };
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/steps.spec.ts',
          tests: [
            {
              title: 'fails inside step',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  attachments: [screenshot],
                  errors: [stepError],
                  steps: [
                    {
                      title: 'outer',
                      category: 'test.step',
                      steps: [
                        {
                          title: 'inner click',
                          category: 'pw:api',
                          attachments: [screenshot],
                          error: stepError,
                        },
                      ],
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    const [evidence] = runboard.evidence;
    expect(evidence?.['source']).toBe('test-error');
    expect(evidence?.['stepPath']).toEqual(['outer', 'inner click']);
    expect(evidence?.['stepCategory']).toBe('pw:api');
    expect(evidence?.['attachmentIndexes']).toEqual([0]);
  });

  test('step linkage matches structurally even when step.error and result.errors[] are distinct objects', async () => {
    // Real Playwright serializes step.error and result.errors[] across the
    // worker-to-main IPC boundary as separate TestError objects with the same
    // content. This regression test pins linkage to a stable structural match
    // so the reporter does not silently drop stepPath/stepCategory/
    // attachmentIndexes when reference identity is gone.
    const reporter = new RunboardReporter({ outputFolder });
    const screenshot = { name: 'screenshot', contentType: 'image/png', path: '/tmp/cap.png' };
    const errorContent = {
      message: 'expect(received).toBe(expected)',
      stack: 'Error: expect(received).toBe(expected)\n    at click.spec.ts:5:1',
      location: { file: '/repo/tests/click.spec.ts', line: 5, column: 1 },
    };
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/click.spec.ts',
          tests: [
            {
              title: 'fails inside step (distinct objects)',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  attachments: [screenshot],
                  errors: [{ ...errorContent, location: { ...errorContent.location } }],
                  steps: [
                    {
                      title: 'outer',
                      category: 'test.step',
                      steps: [
                        {
                          title: 'inner click',
                          category: 'pw:api',
                          attachments: [screenshot],
                          error: { ...errorContent, location: { ...errorContent.location } },
                        },
                      ],
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    const [evidence] = runboard.evidence;
    expect(evidence?.['stepPath']).toEqual(['outer', 'inner click']);
    expect(evidence?.['stepCategory']).toBe('pw:api');
    expect(evidence?.['attachmentIndexes']).toEqual([0]);
  });

  test('duplicate structurally-equal errors each consume their own step linkage in order', async () => {
    // Two failing steps that record the same logical error must each get
    // their own linkage entry in result.errors[] order, not collapse into a
    // single shared linkage.
    const reporter = new RunboardReporter({ outputFolder });
    const errorContent = {
      message: 'flaky timeout',
      stack: 'Error: flaky timeout\n    at flaky.spec.ts:7:1',
    };
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/flaky.spec.ts',
          tests: [
            {
              title: 'two distinct steps fail with the same content',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [{ ...errorContent }, { ...errorContent }],
                  steps: [
                    {
                      title: 'first step',
                      category: 'test.step',
                      error: { ...errorContent },
                    },
                    {
                      title: 'second step',
                      category: 'test.step',
                      error: { ...errorContent },
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

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    expect(runboard.evidence).toHaveLength(2);
    expect(runboard.evidence[0]?.['stepPath']).toEqual(['first step']);
    expect(runboard.evidence[1]?.['stepPath']).toEqual(['second step']);
  });

  test('evidence omits step linkage fields when error is not associated with a step', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/no-step.spec.ts',
          tests: [
            {
              title: 'fails outside steps',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [{ message: 'unattached error' }],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    const [evidence] = runboard.evidence;
    expect(evidence).not.toHaveProperty('stepPath');
    expect(evidence).not.toHaveProperty('stepCategory');
    expect(evidence).not.toHaveProperty('attachmentIndexes');
  });

  test('reporter does not emit reporter-side errorType classification', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/no-classify.spec.ts',
          tests: [
            {
              title: 'fails',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [{ message: 'TimeoutError: timed out' }],
                },
              ],
            },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const result = await readResult();
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    const [evidence] = runboard.evidence;
    expect(evidence).not.toHaveProperty('errorType');
  });
});
