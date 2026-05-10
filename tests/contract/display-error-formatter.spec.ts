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

  test('multi-line error message (e.g. Call log) is not duplicated into the stack tail', () => {
    // Catalog #2/#3/#5/#6 parity: action and wait-style timeout errors carry a
    // multi-line `error.message` (the headline + a Call log block) that is
    // also embedded as the leading lines of `error.stack` before the first
    // `    at ` frame. Playwright HTML reporter parses the stack and drops
    // every line up to the first frame so the Call log appears exactly once;
    // the formatter must do the same so the Display Error doesn't render the
    // Call log twice (once inside `error.message`, once in the stack tail).
    const message =
      'TimeoutError: locator.click: Timeout 100ms exceeded.\n' +
      'Call log:\n' +
      "  - waiting for locator('#missing')\n";
    const stack =
      `${message}\n` +
      '    at /repo/tests/action.spec.ts:5:34\n' +
      '    at TestRunner.run (/repo/lib/runner.js:1:1)';
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/action.spec.ts',
          tests: [
            {
              title: 'action times out',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message, stack }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error');

    expect(error.message).toContain("Call log:\n  - waiting for locator('#missing')");
    expect(error.message).toContain('    at /repo/tests/action.spec.ts:5:34');
    // The Call log lines must appear exactly once — the previous
    // implementation only stripped the first stack line, so the rest of the
    // multi-line message landed in the stack tail and Call log lines rendered
    // twice.
    const callLogOccurrences = error.message.split('Call log:').length - 1;
    expect(callLogOccurrences).toBe(1);
  });

  test('strict mode violation preserves locator-alternative lines (catalog #10)', () => {
    // Catalog #10 parity: Playwright's strict-mode error packs the violation
    // headline plus an indented "resolved to N elements" block with one line
    // per match into `error.message`. The same multi-line content appears at
    // the head of `error.stack` before the first frame. The formatter must
    // keep every alternative line in the Display Error message; losing them
    // strips the locator-preview signal Runboard relies on for triage.
    const message = [
      "locator.click: Error: strict mode violation: locator('div') resolved to 2 elements:",
      "    1) <div>a</div> aka getByText('a')",
      "    2) <div>b</div> aka getByText('b')",
      '',
      'Call log:',
      "  - waiting for locator('div')",
      '',
    ].join('\n');
    const stack = `${message}    at /repo/tests/strict.spec.ts:5:34`;
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/strict.spec.ts',
          tests: [
            {
              title: 'strict mode violation',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message, stack }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error');

    expect(error.message).toContain('strict mode violation');
    expect(error.message).toContain("1) <div>a</div> aka getByText('a')");
    expect(error.message).toContain("2) <div>b</div> aka getByText('b')");
    expect(error.message).toContain('    at /repo/tests/strict.spec.ts:5:34');
    // Each alternative line appears once — the parsed-stack partition keeps
    // the multi-line message intact rather than re-rendering it as stack tail.
    const firstAlternativeOccurrences =
      error.message.split("1) <div>a</div> aka getByText('a')").length - 1;
    expect(firstAlternativeOccurrences).toBe(1);
  });

  test('actionability reason inside Call log is preserved (catalog #11–#16)', () => {
    // Catalog #11–#16 parity: locator-resolution timeouts (not visible, not
    // stable, intercepts pointer events, outside viewport, not enabled,
    // detached) carry their distinguishing reason text inside the Call log
    // section of `error.message`. The full Call log — including the
    // actionability retry lines — must reach the Display Error so Runboard
    // can surface why the element wasn't actionable.
    const message = [
      'TimeoutError: locator.click: Timeout 200ms exceeded.',
      'Call log:',
      "  - waiting for locator('#b')",
      '  - locator resolved to <button id="b">Hi</button>',
      '  - attempting click action',
      '    - waiting for element to be visible, enabled and stable',
      '    - element is not visible - waiting...',
      '    - waiting for element to be visible, enabled and stable',
      '    - element is not visible - waiting...',
      '',
    ].join('\n');
    const stack = `${message}    at /repo/tests/actionability.spec.ts:5:34`;
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/actionability.spec.ts',
          tests: [
            {
              title: 'element is not visible',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message, stack }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error');

    expect(error.message).toContain('element is not visible - waiting...');
    expect(error.message).toContain('locator resolved to <button id="b">Hi</button>');
    expect(error.message).toContain('attempting click action');
    expect(error.message).toContain('    at /repo/tests/actionability.spec.ts:5:34');
  });

  test('web-first assertion preserves matcher hint, Locator/Expected/Received/Timeout, and Call log (catalog #4, #18–#20, #22, #23)', () => {
    // Catalog rows 4 (web-first assertion timeout), 18 (toHaveText), 19
    // (toContainText), 20 (toHaveValue), 22 (toHaveCount), and 23 (toHaveURL /
    // toHaveTitle) share Playwright's web-first assertion failure shape: a
    // matcher-hint headline, a structured Locator/Expected/Received/Timeout
    // block, and a Call log with the matcher-driven retry lines. The full
    // multi-line content is embedded in `error.message` and again at the head
    // of `error.stack` before the first `    at ` frame. The formatter must
    // keep the structured block and Call log in the Display Error message
    // exactly once — a regression that fell back to "drop only the first
    // stack line" would re-emit the Locator/Expected/Received/Call-log lines
    // as stack tail and render them twice.
    const message = [
      'Error: expect(locator).toHaveText(expected) failed',
      '',
      "Locator:  locator('h1')",
      'Expected: "Welcome"',
      'Received: "Hello"',
      'Timeout:  100ms',
      '',
      'Call log:',
      '  - Expect "toHaveText" with timeout 100ms',
      "  - waiting for locator('h1')",
      '    2 × locator resolved to <h1>Hello</h1>',
      '      - unexpected value "Hello"',
      '',
    ].join('\n');
    const stack = `${message}\n    at /repo/tests/to-have-text.spec.ts:4:36`;
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/to-have-text.spec.ts',
          tests: [
            {
              title: 'toHaveText fails on text mismatch',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message, stack }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error');

    expect(error.message).toContain('expect(locator).toHaveText(expected) failed');
    expect(error.message).toContain("Locator:  locator('h1')");
    expect(error.message).toContain('Expected: "Welcome"');
    expect(error.message).toContain('Received: "Hello"');
    expect(error.message).toContain('Timeout:  100ms');
    expect(error.message).toContain('Call log:');
    expect(error.message).toContain('    2 × locator resolved to <h1>Hello</h1>');
    expect(error.message).toContain('    at /repo/tests/to-have-text.spec.ts:4:36');
    // Each structured line appears exactly once — duplication would surface as
    // a parity diff against Playwright's HTML reporter for these rows.
    expect(error.message.split('Call log:').length - 1).toBe(1);
    expect(error.message.split('Expected: "Welcome"').length - 1).toBe(1);
    expect(error.message.split('Received: "Hello"').length - 1).toBe(1);
  });

  test('disposed-context error preserves headline and stack tail (catalog #17)', () => {
    // Catalog #17 parity: disposed-context errors ("Execution context was
    // destroyed", "JSHandle is disposed", "Frame was detached") arrive as a
    // single-line headline plus a normal stack. The formatter must preserve
    // both — the headline is the distinguishing signal, and the stack tail is
    // the only locality cue Runboard has for the disposed call site.
    const message =
      'page.evaluate: Execution context was destroyed, most likely because of a navigation.';
    const stack =
      `${message}\n` +
      '    at /repo/tests/disposed.spec.ts:5:34\n' +
      '    at runMicrotasks (/repo/lib/runner.js:1:1)';
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/disposed.spec.ts',
          tests: [
            {
              title: 'execution context was destroyed',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message, stack }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error');

    expect(error.message).toContain('Execution context was destroyed');
    expect(error.message).toContain('    at /repo/tests/disposed.spec.ts:5:34');
    // Headline must appear exactly once — a regression that re-emitted the
    // pre-frame portion as stack tail would render the headline twice.
    const headlineOccurrences = error.message.split('Execution context was destroyed').length - 1;
    expect(headlineOccurrences).toBe(1);
  });
});
