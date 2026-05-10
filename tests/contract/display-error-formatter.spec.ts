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

  test('hook failure preserves headline, snippet, and stack tail (catalog #32–#35)', () => {
    // Catalog rows 32 (beforeAll), 33 (beforeEach), 34 (afterEach), and 35
    // (afterAll) share Playwright's worker-thrown hook shape: a single-line
    // `Error: <message>` headline, a Babel-rendered codeframe stored in
    // `error.snippet`, and a stack whose first frame is the hook source
    // location. Display Error parity requires the formatter to emit
    // `${headline}\n\n${snippet}\n${stack-tail}` — the same shape Playwright
    // HTML reporter produces — and to derive the per-error `codeframe` field
    // from the location's source file. Each hook variant differs only in the
    // method name on the headline; they all flow through the same generic
    // partition, so a single parametrized check pins the contract for all
    // four rows.
    interface HookCase {
      catalogId: number;
      hookName: 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll';
      sourceFile: string;
    }
    const hookCases: readonly HookCase[] = [
      { catalogId: 32, hookName: 'beforeAll', sourceFile: '/repo/tests/before-all.spec.ts' },
      { catalogId: 33, hookName: 'beforeEach', sourceFile: '/repo/tests/before-each.spec.ts' },
      { catalogId: 34, hookName: 'afterEach', sourceFile: '/repo/tests/after-each.spec.ts' },
      { catalogId: 35, hookName: 'afterAll', sourceFile: '/repo/tests/after-all.spec.ts' },
    ];

    for (const hookCase of hookCases) {
      const headline = `Error: ${hookCase.hookName} boom`;
      const snippet = [
        `  1 | import { test } from '@playwright/test';`,
        `> 2 | test.${hookCase.hookName}(() => { throw new Error('${hookCase.hookName} boom'); });`,
        `    |                              ^`,
        `  3 | test('placeholder so the failing hook surfaces in the bundle', () => {});`,
        `  4 |`,
      ].join('\n');
      const frame = `    at ${hookCase.sourceFile}:2:30`;
      const stack = `${headline}\n${frame}`;

      const run = fakeRun({
        rootDir: '/repo',
        files: [
          {
            fileName: hookCase.sourceFile,
            tests: [
              {
                title: 'placeholder so the failing hook surfaces in the bundle',
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
      if (!error) throw new Error(`expected Display Error for catalog #${hookCase.catalogId}`);

      expect(error.message, `catalog #${hookCase.catalogId}: missing headline`).toContain(headline);
      expect(error.message, `catalog #${hookCase.catalogId}: missing snippet`).toContain(
        `> 2 | test.${hookCase.hookName}(() => { throw new Error('${hookCase.hookName} boom'); });`,
      );
      expect(error.message, `catalog #${hookCase.catalogId}: missing stack frame`).toContain(frame);
      // Headline appears exactly once — a regression that re-emitted the
      // pre-frame portion of the stack would render `Error: <hook> boom`
      // twice in the Display Error message.
      expect(error.message.split(headline).length - 1).toBe(1);
    }
  });

  test('fixture setup failure preserves headline, snippet, and fixture call site (catalog #36)', () => {
    // Catalog #36 parity: a fixture's setup factory throws synchronously, so
    // Playwright's worker reports the error with the fixture call site in the
    // stack frame and the source line that built the fixture in the snippet.
    // The headline is the underlying `Error: <message>` thrown by the test;
    // there is no Call log because the failure is in worker setup code rather
    // than an action against a Playwright object.
    const headline = 'Error: fixture setup boom';
    const snippet = [
      `  1 | import { test as base } from '@playwright/test';`,
      `  2 | const test = base.extend<{ broken: string }>({`,
      `> 3 |   broken: async ({}, use) => { throw new Error('fixture setup boom'); await use('x'); },`,
      `    |                                      ^`,
      `  4 | });`,
    ].join('\n');
    const sourceFile = '/repo/tests/fixture-setup.spec.ts';
    const frame = `    at Object.broken (${sourceFile}:3:38)`;
    const stack = `${headline}\n${frame}`;

    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'fixture setup throws before the test body runs',
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
    if (!error) throw new Error('expected Display Error for catalog #36');

    expect(error.message).toContain(headline);
    expect(error.message).toContain(
      `> 3 |   broken: async ({}, use) => { throw new Error('fixture setup boom'); await use('x'); },`,
    );
    expect(error.message).toContain(frame);
    expect(error.message.split(headline).length - 1).toBe(1);
  });

  test('fixture teardown timeout preserves ANSI-colored headline, snippet, and stack tail (catalog #37)', () => {
    // Catalog #37 parity: a fixture whose teardown exceeds its dedicated
    // `timeout` produces a single-line headline that Playwright wraps in red
    // ANSI escapes before serializing. The headline is the only place the
    // `Fixture "<name>" timeout of Nms exceeded during teardown.` wording
    // appears, so the formatter must keep the ANSI escapes intact in
    // `result.errors[].message` (the parity comparator strips ANSI when
    // building the codeframe message column, but the human-facing message is
    // pre-rendered by Playwright with the colors embedded). The fixture
    // declaration source line lands in the snippet, and the teardown call
    // site appears in the stack frame.
    const ansiHeadline =
      '[31mFixture "slowTeardown" timeout of 100ms exceeded during teardown.[39m';
    const sourceFile = '/repo/tests/fixture-teardown.spec.ts';
    const snippet = [
      `  1 | import { test as base } from '@playwright/test';`,
      `> 2 | const test = base.extend<{ slowTeardown: string }>({`,
      `    |                   ^`,
      `  3 |   slowTeardown: [async ({}, use) => {`,
      `  4 |     await use('x');`,
      `  5 |     await new Promise((r) => setTimeout(r, 5000));`,
    ].join('\n');
    const frame = `    at ${sourceFile}:2:19`;
    const stack = `${ansiHeadline}\n${frame}`;

    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'fixture teardown exceeds its dedicated timeout',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message: ansiHeadline, stack, snippet }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error for catalog #37');

    expect(error.message).toContain(ansiHeadline);
    expect(error.message).toContain(`> 2 | const test = base.extend<{ slowTeardown: string }>({`);
    expect(error.message).toContain(frame);
    // Headline appears exactly once — preserves the ANSI escapes verbatim and
    // does not re-emit the pre-frame portion of the stack as stack tail.
    expect(error.message.split(ansiHeadline).length - 1).toBe(1);
  });

  test('worker teardown produces a stackless Display Error with no codeframe (catalog #38)', () => {
    // Catalog #38 parity: when a worker process exits unexpectedly mid-test,
    // Playwright's dispatcher records the failure as a TestError with a
    // single-line `Error: worker process exited unexpectedly (...)` message
    // and no stack — there is no JavaScript stack frame to capture because
    // the death came from outside JavaScript (a `process.exit(...)` from
    // user code, a SIGKILL, a native crash, …). The Display Error therefore
    // contains the headline only: no snippet, no stack tail, no codeframe
    // (the `codeframe` field requires `error.location`, which Playwright
    // does not attach to runner-level worker failures). A regression that
    // synthesized a fake stack frame, a `<missing>` snippet, or attached a
    // codeframe from the test's source location would diverge from
    // Playwright's HTML reporter for this row.
    const headline = 'Error: worker process exited unexpectedly (code=7, signal=null)';
    const sourceFile = '/repo/tests/worker-teardown.spec.ts';
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'the worker process exits mid-test',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message: headline }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error for catalog #38');

    expect(error.message).toBe(headline);
    expect(error.codeframe).toBeUndefined();
  });

  test('test.step error preserves headline, snippet, and the full stack tail across step boundaries (catalog #39)', async () => {
    // Catalog #39 parity: when a `throw new Error(...)` fires inside a
    // `test.step(...)` callback, Playwright records the failure as a regular
    // TestError on `result.errors[]` whose `error.stack` carries two frames —
    // the throw site (line of the `throw`) and the `test.step(...)` call site
    // — and whose `error.snippet` is the Babel codeframe at the throw line.
    // The Display Error must keep both stack frames intact so Runboard can
    // surface the test.step boundary that recorded the error in addition to
    // the underlying throw, and must place the snippet between the headline
    // and the stack tail exactly once. The structural step path travels on
    // `result.runboard.evidence[].stepPath` (proved by the catalog fixture's
    // `extraAssertion`); this contract test pins the human-facing Display
    // Error shape that pairs with that evidence.
    const scratchRoot = await mkdtemp(join(tmpdir(), 'display-error-formatter-'));
    try {
      const sourceFile = join(scratchRoot, 'tests/step-error.spec.ts');
      await mkdir(dirname(sourceFile), { recursive: true });
      const source = [
        "import { test } from '@playwright/test';",
        "test('error inside test.step preserves stepPath', async () => {",
        "  await test.step('open settings', async () => {",
        "    throw new Error('inside test.step open settings: boom');",
        '  });',
        '});',
        '',
      ].join('\n');
      await writeFile(sourceFile, source, 'utf8');

      const headline = 'Error: inside test.step open settings: boom';
      const snippet = [
        "  2 | test('error inside test.step preserves stepPath', async () => {",
        "  3 |   await test.step('open settings', async () => {",
        "> 4 |     throw new Error('inside test.step open settings: boom');",
        '    |           ^',
        '  5 |   });',
        '  6 | });',
        '  7 |',
      ].join('\n');
      const stepBoundaryFrame = `    at ${sourceFile}:3:3`;
      const throwFrame = `    at ${sourceFile}:4:11`;
      const stack = `${headline}\n${throwFrame}\n${stepBoundaryFrame}`;

      const run = fakeRun({
        rootDir: scratchRoot,
        files: [
          {
            fileName: sourceFile,
            tests: [
              {
                title: 'error inside test.step preserves stepPath',
                status: 'failed',
                expectedStatus: 'passed',
                results: [
                  {
                    status: 'failed',
                    errors: [
                      {
                        message: headline,
                        stack,
                        snippet,
                        location: { file: sourceFile, line: 4, column: 11 },
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
      if (!error) throw new Error('expected Display Error for catalog #39');

      expect(error.message).toContain(headline);
      expect(error.message).toContain(
        "> 4 |     throw new Error('inside test.step open settings: boom');",
      );
      expect(error.message).toContain(throwFrame);
      // The test.step boundary frame must survive — losing it would strip the
      // step-recording call site from the Display Error and diverge from
      // Playwright's HTML reporter, which preserves both frames.
      expect(error.message).toContain(stepBoundaryFrame);
      // Headline appears exactly once — a regression that re-emitted the
      // pre-frame portion of the stack as stack tail would render it twice.
      expect(error.message.split(headline).length - 1).toBe(1);
      // Babel-rendered codeframe is generated from `error.location` so
      // Runboard can highlight the throw line without parsing the message.
      expect(error.codeframe).toBeDefined();
      expect(error.codeframe).toContain("throw new Error('inside test.step open settings: boom');");
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  test('test.step.skip downstream marker preserves headline, snippet, and stack tail (catalog #40)', async () => {
    // Catalog #40 parity: `test.step.skip(...)` records a step that is marked
    // `skipped: true` and whose callback never runs. When downstream test code
    // throws an error to assert that the step was indeed skipped (the
    // catalog's "downstream marker" pattern), Playwright records that error as
    // a regular TestError on `result.errors[]` with a normal stack that points
    // at the throw site in the test body — there is no step boundary frame
    // because the throw is outside any `test.step(...)` callback. The Display
    // Error must therefore preserve the headline, snippet, and single stack
    // frame intact; a regression that synthesized a step path or merged the
    // skipped step's location into the stack tail would diverge from
    // Playwright's HTML reporter for this row. The skipped-step structural
    // signal travels on `result.steps[].skipped` (verified by the parity
    // comparator); this contract test pins only the Display Error shape.
    const scratchRoot = await mkdtemp(join(tmpdir(), 'display-error-formatter-'));
    try {
      const sourceFile = join(scratchRoot, 'tests/step-skip.spec.ts');
      await mkdir(dirname(sourceFile), { recursive: true });
      const source = [
        "import { test } from '@playwright/test';",
        "test('test.step.skip never runs and downstream marker fires', async () => {",
        '  let stepRan = false;',
        "  await test.step.skip('seeded data', async () => { stepRan = true; });",
        '  if (!stepRan) {',
        "    throw new Error('step-skip-downstream-marker triggered without preceding step.skip');",
        '  }',
        '});',
        '',
      ].join('\n');
      await writeFile(sourceFile, source, 'utf8');

      const headline = 'Error: step-skip-downstream-marker triggered without preceding step.skip';
      const snippet = [
        "  4 |   await test.step.skip('seeded data', async () => { stepRan = true; });",
        '  5 |   if (!stepRan) {',
        "> 6 |     throw new Error('step-skip-downstream-marker triggered without preceding step.skip');",
        '    |           ^',
        '  7 |   }',
        '  8 | });',
        '  9 |',
      ].join('\n');
      const throwFrame = `    at ${sourceFile}:6:11`;
      const stack = `${headline}\n${throwFrame}`;

      const run = fakeRun({
        rootDir: scratchRoot,
        files: [
          {
            fileName: sourceFile,
            tests: [
              {
                title: 'test.step.skip never runs and downstream marker fires',
                status: 'failed',
                expectedStatus: 'passed',
                results: [
                  {
                    status: 'failed',
                    errors: [
                      {
                        message: headline,
                        stack,
                        snippet,
                        location: { file: sourceFile, line: 6, column: 11 },
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
      if (!error) throw new Error('expected Display Error for catalog #40');

      expect(error.message).toContain(headline);
      expect(error.message).toContain(
        "> 6 |     throw new Error('step-skip-downstream-marker triggered without preceding step.skip');",
      );
      expect(error.message).toContain(throwFrame);
      // Headline appears exactly once.
      expect(error.message.split(headline).length - 1).toBe(1);
      // Codeframe pins the throw line so Runboard can render the marker
      // location without parsing the message.
      expect(error.codeframe).toBeDefined();
      expect(error.codeframe).toContain(
        "throw new Error('step-skip-downstream-marker triggered without preceding step.skip');",
      );
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  test('closed-target action preserves API-prefixed headline, snippet, and stack tail (catalog #41)', () => {
    // Catalog #41 parity: when an action runs against a page/context/browser
    // that has been closed, Playwright's dispatcher rewrites the error to
    // `<api>: Target page, context or browser has been closed` (see
    // playwright-core `TargetClosedError`). The TestError that reaches the
    // reporter carries the API-prefixed headline as `error.message`, a Babel
    // codeframe at the failing call site as `error.snippet`, and a stack whose
    // message portion is the same headline followed by the first `    at `
    // frame. The Display Error must keep the API prefix, the closed-target
    // wording, the snippet, and the stack frame intact in
    // `result.errors[].message` so Runboard can surface what action ran
    // against the closed target and where in the test it ran.
    const headline = 'Error: locator.click: Target page, context or browser has been closed';
    const sourceFile = '/repo/tests/closed-target.spec.ts';
    const snippet = [
      `  1 | import { test } from '@playwright/test';`,
      `  2 | test('a closed page rejects further actions', async ({ page }) => {`,
      `  3 |   await page.setContent('<html><body><button id="b">Hi</button></body></html>');`,
      `  4 |   await page.close();`,
      `> 5 |   await page.locator('#b').click();`,
      `    |                            ^`,
      `  6 | });`,
      `  7 |`,
    ].join('\n');
    const frame = `    at ${sourceFile}:5:28`;
    const stack = `${headline}\n${frame}`;

    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'a closed page rejects further actions',
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
    if (!error) throw new Error('expected Display Error for catalog #41');

    expect(error.message).toContain(headline);
    expect(error.message).toContain('Target page, context or browser has been closed');
    expect(error.message).toContain(`> 5 |   await page.locator('#b').click();`);
    expect(error.message).toContain(frame);
    // Headline appears exactly once — a regression that re-emitted the
    // pre-frame portion of the stack as stack tail would render the
    // closed-target line twice.
    expect(error.message.split(headline).length - 1).toBe(1);
  });

  test('navigation network error preserves API prefix, net::ERR_ wording, URL, Call log, snippet, and stack tail (catalog #42)', () => {
    // Catalog #42 parity: chromium navigation failures arrive as
    // `page.goto: net::ERR_<reason> at <url>` with a Call log block recording
    // the navigation attempt. The Call log lines are wrapped in dim ANSI
    // escapes (`[2m...[22m`) by Playwright before the reporter
    // sees them, so the formatter must preserve those escapes verbatim. The
    // multi-line message + Call log embeds at the head of `error.stack`
    // before the first `    at ` frame; the parseErrorStack partition keeps
    // both the headline and the Call log intact exactly once in
    // `result.errors[].message` rather than re-emitting them as stack tail
    // (which would render the navigation URL and `net::ERR_*` wording
    // twice).
    const navigateLine =
      '[2m  - navigating to "http://127.0.0.1:1/dashboard", waiting until "load"[22m';
    const messageBody = [
      'Error: page.goto: net::ERR_UNSAFE_PORT at http://127.0.0.1:1/dashboard',
      'Call log:',
      navigateLine,
      '',
    ].join('\n');
    const sourceFile = '/repo/tests/network-error.spec.ts';
    const snippet = [
      `  1 | import { test } from '@playwright/test';`,
      `  2 | test('navigation surfaces a chromium net error', async ({ page }) => {`,
      `> 3 |   await page.goto('http://127.0.0.1:1/dashboard');`,
      `    |              ^`,
      `  4 | });`,
      `  5 |`,
    ].join('\n');
    const frame = `    at ${sourceFile}:3:14`;
    const stack = `${messageBody}\n${frame}`;

    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'navigation surfaces a chromium net error',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message: messageBody, stack, snippet }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error for catalog #42');

    expect(error.message).toContain('page.goto:');
    expect(error.message).toContain('net::ERR_UNSAFE_PORT');
    expect(error.message).toContain('http://127.0.0.1:1/dashboard');
    expect(error.message).toContain('Call log:');
    // ANSI dim escapes around the Call log line survive verbatim — the
    // human-facing Display Error keeps the colors Playwright pre-rendered.
    expect(error.message).toContain(navigateLine);
    expect(error.message).toContain(`> 3 |   await page.goto('http://127.0.0.1:1/dashboard');`);
    expect(error.message).toContain(frame);
    // Each piece of the multi-line message appears exactly once — a
    // regression that re-emitted the pre-frame portion of the stack as
    // stack tail would double the headline and the Call log.
    expect(error.message.split('Call log:').length - 1).toBe(1);
    expect(error.message.split('net::ERR_UNSAFE_PORT').length - 1).toBe(1);
    expect(error.message.split(navigateLine).length - 1).toBe(1);
  });

  test('page-crashed action preserves API prefix, Target crashed wording, Call log, snippet, and stack tail (catalog #43)', () => {
    // Catalog #43 parity: after a `page.crash` event fires (e.g. navigation
    // to chrome://crash), the next page-bound API call rejects with
    // `<api>: Target crashed <browserLogMessage>` where the browser log is
    // typically empty for chromium — leaving the trailing space after
    // `Target crashed` that the Error Catalog distinguishing signal pins.
    // Playwright also attaches a Call log (with dim ANSI escapes) recording
    // the action that raced the crash. The formatter must preserve the
    // trailing space, the API prefix, the `Target crashed` wording, and the
    // Call log block intact in `result.errors[].message` — a regression that
    // trimmed the trailing space or stripped the ANSI would diverge from
    // Playwright's HTML reporter for this row.
    const callLogLine = `[2m    - checking visibility of locator('body')[22m`;
    const messageBody = [
      'Error: locator.isVisible: Target crashed ',
      'Call log:',
      callLogLine,
      '',
    ].join('\n');
    const sourceFile = '/repo/tests/page-crashed.spec.ts';
    const snippet = [
      `  5 |   page.goto('chrome://crash').catch(() => {});`,
      `  6 |   await crashed;`,
      `> 7 |   await page.locator('body').isVisible();`,
      `    |                              ^`,
      `  8 | });`,
      `  9 |`,
    ].join('\n');
    const frame = `    at ${sourceFile}:7:30`;
    const stack = `${messageBody}\n${frame}`;

    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'page crashed when navigating to chrome://crash',
              status: 'failed',
              expectedStatus: 'passed',
              results: [{ status: 'failed', errors: [{ message: messageBody, stack, snippet }] }],
            },
          ],
        },
      ],
    });
    const { test: t, result } = pickTestAndResult(run);

    const [error] = formatDisplayErrors(t, result);
    if (!error) throw new Error('expected Display Error for catalog #43');

    expect(error.message).toContain('locator.isVisible:');
    // The trailing space after `Target crashed` is the artifact of
    // `'Target crashed ' + e.browserLogMessage()` with an empty browser log.
    // It is preserved verbatim so the Display Error matches Playwright.
    expect(error.message).toContain('Target crashed ');
    expect(error.message).toContain('Call log:');
    expect(error.message).toContain(callLogLine);
    expect(error.message).toContain(`> 7 |   await page.locator('body').isVisible();`);
    expect(error.message).toContain(frame);
    expect(error.message.split('Target crashed ').length - 1).toBe(1);
    expect(error.message.split('Call log:').length - 1).toBe(1);
    expect(error.message.split(callLogLine).length - 1).toBe(1);
  });

  test('unhandled in-page exception preserves user throw headline, snippet, and stack tail (catalog #44)', () => {
    // Catalog #44 parity: the test body listens for `pageerror`, observes the
    // in-page exception, and rethrows a `Synthetic crash from /crashy: ...`
    // Error so the failure reaches `result.errors[]`. Unlike #41–#43, there
    // is no Playwright API prefix and no Call log — the failure is a plain
    // user-thrown Error. The formatter must therefore emit the user's
    // headline, the snippet at the throw site, and the single throw-frame
    // stack tail without inventing API prefixes or Call log structure.
    const headline = 'Error: Synthetic crash from /crashy: ReferenceError: x is not defined';
    const sourceFile = '/repo/tests/page-error.spec.ts';
    const snippet = [
      `  4 |   await page.goto('data:text/html,<script>setTimeout(() => { throw new Error("ReferenceError: x is not defined"); }, 0);</script>');`,
      `  5 |   const error = await pageError;`,
      `> 6 |   throw new Error('Synthetic crash from /crashy: ' + error.message);`,
      `    |         ^`,
      `  7 | });`,
      `  8 |`,
    ].join('\n');
    const frame = `    at ${sourceFile}:6:9`;
    const stack = `${headline}\n${frame}`;

    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: sourceFile,
          tests: [
            {
              title: 'page error listener surfaces an unhandled in-page exception',
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
    if (!error) throw new Error('expected Display Error for catalog #44');

    expect(error.message).toContain(headline);
    expect(error.message).toContain('Synthetic crash from /crashy');
    expect(error.message).toContain(
      `> 6 |   throw new Error('Synthetic crash from /crashy: ' + error.message);`,
    );
    expect(error.message).toContain(frame);
    // No Playwright API prefix or Call log structure should be invented —
    // the underlying error is a plain user `throw`.
    expect(error.message).not.toContain('Call log:');
    // Headline appears exactly once.
    expect(error.message.split(headline).length - 1).toBe(1);
  });

  test('test.fail unexpectedly passed produces a status-derived Display Error with the exact "Expected to fail, but passed." message and no codeframe (catalog #45)', () => {
    // Catalog #45 parity: a test marked `test.fail()` whose body actually
    // passes triggers Playwright's status-derived branch in
    // `formatResultFailure` (`packages/playwright/src/reporters/base.ts`):
    // `result.status === 'passed' && test.expectedStatus === 'failed'`. The
    // HTML reporter writes the literal `Expected to fail, but passed.`
    // string for that branch — Playwright wraps the text in
    // `colors.red(...)` from the bundled `colors/safe` npm package, but
    // that package respects the `FORCE_COLOR=0` env the parity harness
    // sets, so both reporters write plain text under the catalog gate.
    // The formatter must emit the exact wording with no codeframe (status-
    // derived shapes carry no `error.location`) and no smuggled extra
    // fields, otherwise an AFK agent would see catalog #45 regress.
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/test-fail.spec.ts',
          tests: [
            {
              title: 'test.fail() but the body actually passes',
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
    const [error] = errors;
    if (!error) throw new Error('expected status-derived Display Error for catalog #45');
    // No ANSI escape codes — the HTML reporter wraps the headline in
    // `colors.red(...)`, but the bundled `colors/safe` package respects
    // FORCE_COLOR=0 and emits plain text. The Runboard formatter must
    // never invent ANSI wrappers for status-derived shapes.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI sequences include control chars
    expect(error.message).not.toMatch(/\[/);
    // Status-derived shapes have no `error.location`, so no codeframe is
    // generated. Inventing a codeframe would diverge from the HTML
    // reporter, which only renders codeframes for TestError entries.
    expect(error.codeframe).toBeUndefined();
  });

  test('status-derived "Expected to fail, but passed." precedes TestError entries when both apply (catalog #45)', () => {
    // Defensive ordering check for catalog #45: Playwright's
    // `formatResultFailure` emits the status-derived entry first, then
    // iterates `result.errors[]`. The Runboard formatter must preserve
    // that ordering so a future shape — e.g. an `afterEach` failure that
    // fires after a `test.fail()` body has already passed — stays
    // index-aligned with the HTML reporter and with the
    // index-aligned `result.runboard.evidence[]` array.
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/test-fail-mixed.spec.ts',
          tests: [
            {
              title: 'test.fail body passes but a teardown error also fires',
              status: 'passed',
              expectedStatus: 'failed',
              results: [
                {
                  status: 'passed',
                  errors: [{ message: 'teardown failure' }],
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
    expect(errors[0]?.message).toBe('Expected to fail, but passed.');
    expect(errors[1]?.message).toContain('teardown failure');
  });
});
