/**
 * Display Error Formatter — produces Playwright-compatible Display Errors
 * (entries in `result.errors[]`) from public Playwright reporter API data.
 *
 * Input shape (public Playwright reporter API only):
 *   - `TestCase` from `@playwright/test/reporter`, used for `expectedStatus`
 *     so a passing test under `test.fail()` still emits the expected
 *     "Expected to fail, but passed." Display Error.
 *   - `TestResult` from `@playwright/test/reporter`, including
 *     `result.status` for status-derived Display Errors and
 *     `result.errors[]` (`TestError[]`) for raw failure formatting.
 *
 * Private-internals policy (ADR docs/adr/0012-own-display-error-formatter.md):
 *   Production code MUST NOT import Playwright's private HTML reporter
 *   formatter modules at runtime. Playwright's official HTML reporter is the
 *   compatibility oracle in Compatibility Fixtures, never a runtime
 *   dependency. A separate explicit decision is required before this
 *   formatter takes a runtime dependency on private Playwright internals.
 *
 *   `@babel/code-frame` is the same public Babel package Playwright HTML
 *   reporter uses to render error codeframes. Importing it directly keeps the
 *   codeframe byte-identical to Playwright's output for timeout-style errors
 *   (catalog rows 1, 8, 9) without reaching into Playwright internals.
 */
import { readFileSync } from 'node:fs';
import { codeFrameColumns } from '@babel/code-frame';
import type { TestCase, TestError, TestResult } from '@playwright/test/reporter';
import type { RunboardTestResultDisplayError } from './contract.js';

export function formatDisplayErrors(
  test: TestCase,
  result: TestResult,
): RunboardTestResultDisplayError[] {
  const out: RunboardTestResultDisplayError[] = [];
  if (result.status === 'passed' && test.expectedStatus === 'failed') {
    out.push({ message: 'Expected to fail, but passed.' });
  }
  if (result.status === 'interrupted') {
    out.push({ message: 'Test was interrupted.' });
  }
  for (const error of result.errors ?? []) {
    out.push(serializeDisplayError(error));
  }
  return out;
}

function serializeDisplayError(error: TestError): RunboardTestResultDisplayError {
  const fallbackMessage = error.message ?? error.value ?? '';
  const parsedStack = error.stack ? parseErrorStack(error.stack) : undefined;
  const headlineMessage = parsedStack?.message || fallbackMessage;

  const tokens: string[] = [headlineMessage];
  if (error.snippet !== undefined && error.snippet !== '') {
    tokens.push('');
    tokens.push(error.snippet);
  }
  if (parsedStack && parsedStack.stackLines.length > 0) {
    tokens.push(parsedStack.stackLines.join('\n'));
  }
  if (error.cause) {
    const cause = serializeDisplayError(error.cause);
    tokens.push(`[cause]: ${cause.message}`);
  }
  const formattedMessage = tokens.join('\n');
  const out: RunboardTestResultDisplayError = { message: formattedMessage };
  const codeframe = error.location
    ? createErrorCodeframe(formattedMessage, error.location)
    : undefined;
  if (codeframe !== undefined) out.codeframe = codeframe;
  return out;
}

/**
 * Mirrors Playwright HTML reporter's `parseErrorStack`: split the stack on
 * newlines, locate the first frame line (`    at …`), and partition the stack
 * into a leading message portion and the trailing frame lines. For Playwright
 * action / wait timeouts, the leading portion is multi-line — it includes the
 * Call log block — so a naive "drop the first stack line" approach would
 * duplicate the Call log into the formatted Display Error message.
 */
function parseErrorStack(stack: string): { message: string; stackLines: string[] } {
  const lines = stack.split('\n');
  const firstFrameIndex = lines.findIndex((line) => line.startsWith('    at '));
  const splitAt = firstFrameIndex === -1 ? lines.length : firstFrameIndex;
  return {
    message: lines.slice(0, splitAt).join('\n'),
    stackLines: lines.slice(splitAt),
  };
}

/**
 * Mirrors Playwright HTML reporter's `createErrorCodeframe` so timeout and
 * other location-bearing Display Errors render the same Babel codeframe:
 * the source is suffixed with `\n//` (Playwright's trailing terminator that
 * forces an empty line + comment so a one-frame stack still highlights), the
 * message is the stripped first line of the formatted Display Error message,
 * and Babel formats the entire file via `linesAbove: 100, linesBelow: 100`.
 *
 * Returns `undefined` when the source file cannot be read so a missing or
 * relocated source file leaves the rest of the Display Error intact rather
 * than throwing during reporter shutdown.
 */
function createErrorCodeframe(
  message: string,
  location: { file: string; line: number; column: number },
): string | undefined {
  let source: string;
  try {
    source = readFileSync(location.file, 'utf8');
  } catch {
    return undefined;
  }
  const messageHeadline = stripAnsiEscapes(message).split('\n')[0] || undefined;
  return codeFrameColumns(
    `${source}\n//`,
    { start: { line: location.line, column: location.column } },
    {
      highlightCode: false,
      linesAbove: 100,
      linesBelow: 100,
      ...(messageHeadline !== undefined ? { message: messageHeadline } : {}),
    },
  );
}

// Standard ANSI CSI escape sequences. The Display Error message is built from
// `error.message`, `error.snippet`, and stack tail tokens that Playwright may
// have wrapped in red/dim colors via `colors.red(...)`/`colors.dim(...)`. The
// Babel oracle strips ANSI before extracting the headline so the codeframe
// message column does not bleed escape codes into the column-arrow line.
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences include control chars
const ANSI_ESCAPE_PATTERN = /\[[0-9;]*[A-Za-z]/g;

function stripAnsiEscapes(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}
