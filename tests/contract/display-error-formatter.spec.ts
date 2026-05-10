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

  test('toBeVisible against missing element preserves matcher hint, Expected/Timeout/Error block, and Call log (catalog #21)', () => {
    // Catalog #21 parity: when `toBeVisible` runs against an unfound locator,
    // Playwright omits the `Received:` line and instead emits an
    // `Error: element(s) not found` line via the matcher's `errorMessage`
    // pathway. The full multi-line content is embedded in `error.message` and
    // again at the head of `error.stack` before the first `    at ` frame, so
    // the parseErrorStack partition is what keeps the structured block and
    // Call log from rendering twice in the Display Error message.
    const message = [
      'Error: expect(locator).toBeVisible() failed',
      '',
      "Locator: locator('#missing')",
      'Expected: visible',
      'Timeout: 100ms',
      'Error: element(s) not found',
      '',
      'Call log:',
      '  - Expect "toBeVisible" with timeout 100ms',
      "  - waiting for locator('#missing')",
      '',
    ].join('\n');
    const stack = `${message}\n    at /repo/tests/to-be-visible.spec.ts:4:42`;
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/to-be-visible.spec.ts',
          tests: [
            {
              title: 'toBeVisible fails when the element is missing',
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

    expect(error.message).toContain('expect(locator).toBeVisible() failed');
    expect(error.message).toContain("Locator: locator('#missing')");
    expect(error.message).toContain('Expected: visible');
    expect(error.message).toContain('Timeout: 100ms');
    expect(error.message).toContain('Error: element(s) not found');
    expect(error.message).toContain('Call log:');
    expect(error.message).toContain('    at /repo/tests/to-be-visible.spec.ts:4:42');
    expect(error.message.split('Call log:').length - 1).toBe(1);
    expect(error.message.split('Expected: visible').length - 1).toBe(1);
    expect(error.message.split('Error: element(s) not found').length - 1).toBe(1);
  });

  test('toHaveAttribute preserves matcher hint, Locator/Expected/Received block, and Call log (catalog #24)', () => {
    // Catalog #24 parity: attribute-shaped matcher failures ride the
    // `toMatchText` pathway, so the structured block carries
    // `Expected: "<value>"`, `Received: "<value>"`, and the Call log records
    // both `locator resolved to <a …>` and `unexpected value "…"`. As with the
    // toHaveText shape (catalog #18), the parseErrorStack partition is what
    // prevents the structured block from being re-emitted as stack tail.
    const message = [
      'Error: expect(locator).toHaveAttribute(expected) failed',
      '',
      "Locator:  locator('#a')",
      'Expected: "https://example.com"',
      'Received: "https://other.com"',
      'Timeout:  100ms',
      '',
      'Call log:',
      '  - Expect "toHaveAttribute" with timeout 100ms',
      "  - waiting for locator('#a')",
      '    2 × locator resolved to <a id="a" href="https://other.com">x</a>',
      '      - unexpected value "https://other.com"',
      '',
    ].join('\n');
    const stack = `${message}\n    at /repo/tests/to-have-attribute.spec.ts:4:36`;
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/to-have-attribute.spec.ts',
          tests: [
            {
              title: 'toHaveAttribute fails on attribute mismatch',
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

    expect(error.message).toContain('expect(locator).toHaveAttribute(expected) failed');
    expect(error.message).toContain("Locator:  locator('#a')");
    expect(error.message).toContain('Expected: "https://example.com"');
    expect(error.message).toContain('Received: "https://other.com"');
    expect(error.message).toContain('Timeout:  100ms');
    expect(error.message).toContain('Call log:');
    expect(error.message).toContain(
      '    2 × locator resolved to <a id="a" href="https://other.com">x</a>',
    );
    expect(error.message).toContain('      - unexpected value "https://other.com"');
    expect(error.message).toContain('    at /repo/tests/to-have-attribute.spec.ts:4:36');
    expect(error.message.split('Call log:').length - 1).toBe(1);
    expect(error.message.split('Expected: "https://example.com"').length - 1).toBe(1);
    expect(error.message.split('Received: "https://other.com"').length - 1).toBe(1);
  });

  test('toBeChecked preserves matcher hint, Locator/Expected/Received block, and Call log (catalog #25)', () => {
    // Catalog #25 parity: state-flag matchers (`toBeChecked`, `toBeEnabled`,
    // `toBeDisabled`, `toBeFocused`, …) ride the `toBeTruthy` pathway with a
    // word expected (`checked`/`unchecked`/`enabled`/…) and a matching
    // `Received:` line, plus the Call log emits `locator resolved to <input
    // …>` and `unexpected value "<state>"`. The partition keeps the structured
    // block intact in the Display Error message; a "drop only the first stack
    // line" regression would re-render every line below the matcher hint as
    // stack tail.
    const message = [
      'Error: expect(locator).toBeChecked() failed',
      '',
      "Locator:  locator('#c')",
      'Expected: checked',
      'Received: unchecked',
      'Timeout:  100ms',
      '',
      'Call log:',
      '  - Expect "toBeChecked" with timeout 100ms',
      "  - waiting for locator('#c')",
      '    2 × locator resolved to <input id="c" type="checkbox"/>',
      '      - unexpected value "unchecked"',
      '',
    ].join('\n');
    const stack = `${message}\n    at /repo/tests/to-be-checked.spec.ts:4:36`;
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/to-be-checked.spec.ts',
          tests: [
            {
              title: 'toBeChecked fails on unchecked state',
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

    expect(error.message).toContain('expect(locator).toBeChecked() failed');
    expect(error.message).toContain("Locator:  locator('#c')");
    expect(error.message).toContain('Expected: checked');
    expect(error.message).toContain('Received: unchecked');
    expect(error.message).toContain('Timeout:  100ms');
    expect(error.message).toContain('Call log:');
    expect(error.message).toContain('    2 × locator resolved to <input id="c" type="checkbox"/>');
    expect(error.message).toContain('      - unexpected value "unchecked"');
    expect(error.message).toContain('    at /repo/tests/to-be-checked.spec.ts:4:36');
    expect(error.message.split('Call log:').length - 1).toBe(1);
    expect(error.message.split('Expected: checked').length - 1).toBe(1);
    expect(error.message.split('Received: unchecked').length - 1).toBe(1);
  });

  test('toHaveScreenshot preserves matcher hint, pixel-diff text, Snapshot line, and Call log (catalog #26)', () => {
    // Catalog #26 parity: `toHaveScreenshot` failures ride a different shape
    // than the other web-first matchers. There is no Locator/Expected/Received
    // block (the matcher targets a Page, not a Locator, and the Expected and
    // Received values are images, not printable strings). Instead, the
    // `formatMatcherMessage` header is followed by an indented pixel-diff line
    // produced by the image comparator (e.g. "X pixels (ratio Y of all image
    // pixels) are different."), then a blank line, then a `  Snapshot: <name>`
    // line, and finally the Call log. The full multi-line content is embedded
    // in `error.message` and again at the head of `error.stack` before the
    // first `    at ` frame; the parseErrorStack partition keeps every line
    // intact in the Display Error message instead of duplicating any of them
    // into the stack tail. Screenshot diff/expected/actual attachments stay on
    // the test result alongside the Display Error and remain available through
    // the existing data-bundle attachment model — this contract test only pins
    // the human-facing message wording the formatter is responsible for.
    const message = [
      'Error: expect(page).toHaveScreenshot(expected) failed',
      '',
      'Timeout:  1000ms',
      '  3 pixels (ratio 0.01 of all image pixels) are different.',
      '',
      '  Snapshot: baseline.png',
      '',
      'Call log:',
      '  - Expect "toHaveScreenshot" with timeout 1000ms',
      '    - taking page screenshot',
      '      - waiting for fonts to load...',
      '      - fonts loaded',
      '    - 3 pixels (ratio 0.01 of all image pixels) are different.',
      '',
    ].join('\n');
    const stack = `${message}\n    at /repo/tests/to-have-screenshot.spec.ts:6:30`;
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/to-have-screenshot.spec.ts',
          tests: [
            {
              title: 'toHaveScreenshot fails because the baseline differs',
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

    expect(error.message).toContain('expect(page).toHaveScreenshot(expected) failed');
    expect(error.message).toContain('Timeout:  1000ms');
    expect(error.message).toContain('3 pixels (ratio 0.01 of all image pixels) are different.');
    expect(error.message).toContain('  Snapshot: baseline.png');
    expect(error.message).toContain('Call log:');
    expect(error.message).toContain('  - Expect "toHaveScreenshot" with timeout 1000ms');
    expect(error.message).toContain('    at /repo/tests/to-have-screenshot.spec.ts:6:30');
    // The pixel-diff text appears in the matcher block AND in the Call log
    // (Playwright records the comparator output in both places). Each
    // occurrence in the original message must round-trip exactly once — a
    // regression that re-emitted the pre-frame content as stack tail would
    // double both copies.
    expect(error.message.split('Call log:').length - 1).toBe(1);
    expect(error.message.split('  Snapshot: baseline.png').length - 1).toBe(1);
    expect(
      error.message.split('3 pixels (ratio 0.01 of all image pixels) are different.').length - 1,
    ).toBe(2);
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

  test('soft assertions produce one Display Error per accumulated TestError, in order, with matcher-specific text preserved (catalog #27)', () => {
    // Catalog #27 parity: `expect.soft(...)` does not throw, so Playwright
    // accumulates each failed soft matcher as a separate `TestError` on
    // `result.errors[]`. The formatter must emit one Display Error per
    // TestError, in the same order Playwright recorded them, and must not
    // collapse them into a single generic message — matcher-specific text
    // (`toHaveText`, `toHaveCount`) is the distinguishing signal Runboard uses
    // to tell which soft assertion failed.
    const toHaveTextMessage = [
      'Error: expect(locator).toHaveText(expected) failed',
      '',
      "Locator:  locator('h1')",
      'Expected: "A"',
      'Received: "B"',
      'Timeout:  100ms',
      '',
      'Call log:',
      '  - Expect "toHaveText" with timeout 100ms',
      "  - waiting for locator('h1')",
      '',
    ].join('\n');
    const toHaveCountMessage = [
      'Error: expect(locator).toHaveCount(expected) failed',
      '',
      "Locator:  locator('li')",
      'Expected: 2',
      'Received: 1',
      'Timeout:  100ms',
      '',
      'Call log:',
      '  - Expect "toHaveCount" with timeout 100ms',
      "  - waiting for locator('li')",
      '',
    ].join('\n');
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/soft.spec.ts',
          tests: [
            {
              title: 'soft assertions accumulate multiple errors per result',
              status: 'failed',
              expectedStatus: 'passed',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: toHaveTextMessage,
                      stack: `${toHaveTextMessage}\n    at /repo/tests/soft.spec.ts:3:48`,
                    },
                    {
                      message: toHaveCountMessage,
                      stack: `${toHaveCountMessage}\n    at /repo/tests/soft.spec.ts:4:48`,
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

    // Two Display Errors, one per soft assertion failure — never collapsed.
    expect(errors).toHaveLength(2);
    const [first, second] = errors;
    if (!first || !second) throw new Error('expected two Display Errors');

    // Order must match the input `result.errors[]` — Playwright records the
    // toHaveText failure before the toHaveCount failure in the fixture spec.
    expect(first.message).toContain('toHaveText');
    expect(first.message).toContain("Locator:  locator('h1')");
    expect(first.message).toContain('Expected: "A"');
    expect(first.message).toContain('Received: "B"');
    expect(first.message).toContain('    at /repo/tests/soft.spec.ts:3:48');

    expect(second.message).toContain('toHaveCount');
    expect(second.message).toContain("Locator:  locator('li')");
    expect(second.message).toContain('Expected: 2');
    expect(second.message).toContain('Received: 1');
    expect(second.message).toContain('    at /repo/tests/soft.spec.ts:4:48');

    // The matcher names are mutually exclusive between the two Display Errors:
    // a regression that merged or duplicated the entries would surface as a
    // matcher-name appearing in the wrong slot.
    expect(first.message).not.toContain('toHaveCount');
    expect(second.message).not.toContain('toHaveText');
  });

  test('generic value matcher failures preserve matcher hint, Expected/Received, snippet caret, and stack frame (catalog #28–#31)', () => {
    // Catalog rows 28 (toBe), 29 (toMatch), 30 (toContain), and 31 (toThrow)
    // share Playwright's bundled-expect failure shape: an `ExpectError`
    // (`matcherHint.js`) wraps a Jest assertion error so `error.message` is the
    // matcher hint headline plus the matcher-specific Expected/Received block,
    // and `error.stack` is `${name}: ${message}\n${frames}`. Playwright's
    // internal reporter then enriches each error with `error.snippet`, a
    // Babel-rendered codeframe whose caret pinpoints the failing column.
    //
    // The Display Error Formatter must keep all three signals visible exactly
    // once in `result.errors[].message` so Runboard can show the matcher hint,
    // value comparison, caret, and call site. A regression that re-emitted the
    // pre-frame portion of the stack as the stack tail would render the
    // matcher hint twice; a regression that dropped the snippet would lose the
    // column signal that Playwright's bundled expect provides for these
    // matchers (no Call log is available here, unlike web-first matchers).
    //
    // The matcher-specific signals come from the Error Catalog distinguishing
    // signals column: `Object.is equality` (#28), `Expected pattern` (#29),
    // `Expected substring` (#30), and `Received function did not throw` (#31).
    interface MatcherCase {
      catalogId: number;
      title: string;
      messageBody: string;
      file: string;
      line: number;
      column: number;
      caretColumn: number;
      sourceLine: string;
      uniqueSignals: readonly string[];
    }
    const cases: readonly MatcherCase[] = [
      {
        catalogId: 28,
        title: 'toBe fails on equality mismatch',
        messageBody: [
          'expect(received).toBe(expected) // Object.is equality',
          '',
          'Expected: 3',
          'Received: 2',
        ].join('\n'),
        file: '/repo/tests/to-be.spec.ts',
        line: 3,
        column: 13,
        caretColumn: 13,
        sourceLine: '  expect(2).toBe(3);',
        uniqueSignals: ['toBe', 'Object.is equality', 'Expected: 3', 'Received: 2'],
      },
      {
        catalogId: 29,
        title: 'toMatch fails on regex mismatch',
        messageBody: [
          'expect(received).toMatch(expected)',
          '',
          'Expected pattern: /^foo/',
          'Received string:  "bar"',
        ].join('\n'),
        file: '/repo/tests/to-match.spec.ts',
        line: 3,
        column: 17,
        caretColumn: 17,
        sourceLine: "  expect('bar').toMatch(/^foo/);",
        uniqueSignals: ['toMatch', 'Expected pattern: /^foo/', 'Received string:  "bar"'],
      },
      {
        catalogId: 30,
        title: 'toContain fails on missing substring',
        messageBody: [
          'expect(received).toContain(expected) // indexOf',
          '',
          'Expected substring: "ready"',
          'Received string:    "loading"',
        ].join('\n'),
        file: '/repo/tests/to-contain.spec.ts',
        line: 3,
        column: 21,
        caretColumn: 21,
        sourceLine: "  expect('loading').toContain('ready');",
        uniqueSignals: [
          'toContain',
          'Expected substring: "ready"',
          'Received string:    "loading"',
        ],
      },
      {
        catalogId: 31,
        title: 'toThrow fails when the function does not throw',
        messageBody: ['expect(received).toThrow()', '', 'Received function did not throw'].join(
          '\n',
        ),
        file: '/repo/tests/to-throw.spec.ts',
        line: 3,
        column: 23,
        caretColumn: 23,
        sourceLine: '  expect(() => 1 + 1).toThrow();',
        uniqueSignals: ['toThrow', 'Received function did not throw'],
      },
    ];

    for (const matcherCase of cases) {
      const headline = `Error: ${matcherCase.messageBody}`;
      const snippet = [
        `  1 | import { test, expect } from '@playwright/test';`,
        `  2 | test('${matcherCase.title}', () => {`,
        `> 3 | ${matcherCase.sourceLine}`,
        `    | ${' '.repeat(matcherCase.caretColumn)}^`,
        `  4 | });`,
        `  5 |`,
      ].join('\n');
      const frame = `    at ${matcherCase.file}:${matcherCase.line}:${matcherCase.column}`;
      const stack = `${headline}\n${frame}`;

      const run = fakeRun({
        rootDir: '/repo',
        files: [
          {
            fileName: matcherCase.file,
            tests: [
              {
                title: matcherCase.title,
                status: 'failed',
                expectedStatus: 'passed',
                results: [{ status: 'failed', errors: [{ message: headline, stack, snippet }] }],
              },
            ],
          },
        ],
      });
      const { test: t, result } = pickTestAndResult(run);

      const [error] = formatDisplayErrors(t, result);
      if (!error) throw new Error(`expected Display Error for catalog #${matcherCase.catalogId}`);

      // Headline tokens must survive verbatim — no normalization to `//`
      // comments, no rewrite to a generic "assertion failed" shape.
      for (const signal of matcherCase.uniqueSignals) {
        expect(
          error.message,
          `catalog #${matcherCase.catalogId}: missing signal ${JSON.stringify(signal)}`,
        ).toContain(signal);
      }
      // Snippet caret stays in the Display Error so the column signal Playwright's
      // bundled expect produces for the failing token is preserved.
      expect(error.message, `catalog #${matcherCase.catalogId}: missing snippet line`).toContain(
        `> 3 | ${matcherCase.sourceLine}`,
      );
      expect(error.message).toContain(`^`);
      // Stack frame stays as the call-site signal even though there is no Call
      // log for generic value matchers.
      expect(error.message).toContain(frame);
      // Matcher hint must appear once — a regression that re-emitted the
      // pre-frame portion of the stack as stack tail would duplicate it.
      const matcherName = matcherCase.uniqueSignals[0];
      if (!matcherName) throw new Error('matcher case is missing a primary signal');
      const matcherHintFragment = `expect(received).${matcherName}`;
      expect(error.message.split(matcherHintFragment).length - 1).toBe(1);
    }
  });
});
