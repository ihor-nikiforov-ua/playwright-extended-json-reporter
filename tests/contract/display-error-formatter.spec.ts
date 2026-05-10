/**
 * Contract test for the Display Error Formatter boundary.
 *
 * This spec exercises `formatDisplayErrors` directly so the module is the
 * single named seam through which `result.errors[]` Display Errors are
 * produced from public Playwright reporter API objects (TestCase +
 * TestResult). The reporter must not import Playwright's private HTML
 * reporter formatter modules at runtime; see ADR
 * docs/adr/0012-own-display-error-formatter.md.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { codeFrameColumns } from '@babel/code-frame';
import { expect, test } from '@playwright/test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { formatDisplayErrors } from '../../src/display-error-formatter.js';
import { fakeRun } from '../helpers/fake-playwright.js';

function pickTestAndResult(run: ReturnType<typeof fakeRun>): {
  test: TestCase;
  result: TestResult;
} {
  const entry = run.testResults[0];
  if (!entry) throw new Error('expected at least one test result');
  return entry;
}

test.describe('Display Error Formatter — public boundary', () => {
  test('passing test produces zero Display Errors', () => {
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/pass.spec.ts',
          tests: [{ title: 'pass', results: [{ status: 'passed' }] }],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const errors = formatDisplayErrors(t, result);

    expect(errors).toEqual([]);
  });

  test('expected-fail test that passed produces a single status-derived Display Error', () => {
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
    const { test: t, result } = pickTestAndResult(run);

    const errors = formatDisplayErrors(t, result);

    expect(errors).toEqual([{ message: 'Expected to fail, but passed.' }]);
  });

  test('interrupted result produces a status-derived Display Error', () => {
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
    const { test: t, result } = pickTestAndResult(run);

    const errors = formatDisplayErrors(t, result);

    expect(errors).toEqual([{ message: 'Test was interrupted.' }]);
  });

  test('TestError produces a Display Error containing message, snippet, and stack tail', () => {
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
    const { test: t, result } = pickTestAndResult(run);

    const errors = formatDisplayErrors(t, result);

    expect(errors).toHaveLength(1);
    const [error] = errors;
    if (!error) throw new Error('expected Display Error');
    expect(error.message).toContain('Expected 1 to be 2');
    expect(error.message).toContain('> 5 | expect(1).toBe(2);');
    expect(error.message).toContain('at fails:5:1');
  });

  test('nested cause is appended as a [cause]: tail line', () => {
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
                  errors: [{ message: 'outer', cause: { message: 'inner' } }],
                },
              ],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error');

    expect(error.message).toContain('outer');
    expect(error.message).toContain('[cause]: inner');
  });

  test('error.location triggers codeframe generation from the source file', async () => {
    const scratchRoot = await mkdtemp(join(tmpdir(), 'display-error-formatter-'));
    try {
      const sourceFile = join(scratchRoot, 'tests/codeframe.spec.ts');
      await mkdir(dirname(sourceFile), { recursive: true });
      await writeFile(sourceFile, 'a;\nb;\nthrow new Error("boom");\nd;\ne;\n', 'utf8');

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
      const { test: t, result } = pickTestAndResult(run);

      const [error] = formatDisplayErrors(t, result);
      if (!error) throw new Error('expected Display Error');

      expect(typeof error.codeframe).toBe('string');
      expect(error.codeframe).toContain('throw new Error("boom");');
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  test('codeframe matches Playwright HTML reporter Babel output (test timeout shape)', async () => {
    // Catalog #1 / #8 parity: Playwright's HTML reporter calls
    // `codeFrameColumns(source + '\n//', {start}, { highlightCode: false,
    // linesAbove: 100, linesBelow: 100, message })`. Display Error parity for
    // timeout-style errors requires byte-identical codeframes including the
    // trailing `\n//` source suffix and the message attached to the arrow line.
    const scratchRoot = await mkdtemp(join(tmpdir(), 'display-error-formatter-'));
    try {
      const sourceFile = join(scratchRoot, 'tests/timeout.spec.ts');
      await mkdir(dirname(sourceFile), { recursive: true });
      const source = [
        "import { test } from '@playwright/test';",
        'test.beforeAll(async () => {',
        '  await new Promise((r) => setTimeout(r, 5000));',
        '});',
        "test('placeholder so the failing hook surfaces in the bundle', () => {});",
        '',
      ].join('\n');
      await writeFile(sourceFile, source, 'utf8');
      const ansiRedMessage = '[31m"beforeAll" hook timeout of 50ms exceeded.[39m';

      const run = fakeRun({
        rootDir: scratchRoot,
        files: [
          {
            fileName: sourceFile,
            tests: [
              {
                title: 'placeholder so the failing hook surfaces in the bundle',
                status: 'failed',
                expectedStatus: 'passed',
                results: [
                  {
                    status: 'failed',
                    errors: [
                      {
                        message: ansiRedMessage,
                        stack: `${ansiRedMessage}\n    at ${sourceFile}:2:6`,
                        location: { file: sourceFile, line: 2, column: 6 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const { test: t, result } = pickTestAndResult(run);

      const [error] = formatDisplayErrors(t, result);
      if (!error) throw new Error('expected Display Error');

      const expectedCodeframe = codeFrameColumns(
        `${source}\n//`,
        { start: { line: 2, column: 6 } },
        {
          highlightCode: false,
          linesAbove: 100,
          linesBelow: 100,
          message: '"beforeAll" hook timeout of 50ms exceeded.',
        },
      );
      expect(error.codeframe).toBe(expectedCodeframe);
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  test('codeframe omits message when error has no message but has location', async () => {
    // The Babel oracle uses `stripAnsi(message).split('\n')[0] || undefined` —
    // an empty first line means `message` is omitted from `codeFrameColumns`.
    const scratchRoot = await mkdtemp(join(tmpdir(), 'display-error-formatter-'));
    try {
      const sourceFile = join(scratchRoot, 'tests/no-msg.spec.ts');
      await mkdir(dirname(sourceFile), { recursive: true });
      const source = 'a;\nb;\nthrow new Error();\nd;\n';
      await writeFile(sourceFile, source, 'utf8');

      const run = fakeRun({
        rootDir: scratchRoot,
        files: [
          {
            fileName: sourceFile,
            tests: [
              {
                title: 'fails',
                status: 'failed',
                expectedStatus: 'passed',
                results: [
                  {
                    status: 'failed',
                    errors: [{ location: { file: sourceFile, line: 3, column: 7 } }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const { test: t, result } = pickTestAndResult(run);
      const [error] = formatDisplayErrors(t, result);
      if (!error) throw new Error('expected Display Error');

      const expectedCodeframe = codeFrameColumns(
        `${source}\n//`,
        { start: { line: 3, column: 7 } },
        { highlightCode: false, linesAbove: 100, linesBelow: 100 },
      );
      expect(error.codeframe).toBe(expectedCodeframe);
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  test('absent error.location yields no codeframe (test timeout shape with no stack frames)', () => {
    // Catalog #1: a Playwright test timeout's TestError carries no `location`
    // and a stack that is just the message (no `\n    at …` frames). Playwright
    // HTML reporter omits the codeframe in that case; the formatter must too.
    const ansiRedMessage = '[31mTest timeout of 50ms exceeded.[39m';
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/test-timeout.spec.ts',
          tests: [
            {
              title: 'exceeds the configured test timeout',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [{ message: ansiRedMessage, stack: ansiRedMessage }],
                },
              ],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error');

    expect(error.message).toBe(ansiRedMessage);
    expect(error.codeframe).toBeUndefined();
  });

  test('status-derived entries precede TestError entries when both apply', () => {
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
    const { test: t, result } = pickTestAndResult(run);

    const errors = formatDisplayErrors(t, result);

    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain('Test was interrupted.');
    expect(errors[1]?.message).toContain('underlying failure');
  });
});
