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
 */
import { readFileSync } from 'node:fs';
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
  const tokens: string[] = [];
  const baseMessage = error.message ?? error.value ?? '';
  tokens.push(baseMessage);
  if (error.snippet !== undefined && error.snippet !== '') {
    tokens.push('');
    tokens.push(error.snippet);
  }
  if (error.stack !== undefined && error.stack !== '') {
    const stackLines = stripMessageLineFromStack(error.stack, baseMessage);
    if (stackLines.length > 0) tokens.push(stackLines.join('\n'));
  }
  if (error.cause) {
    const cause = serializeDisplayError(error.cause);
    tokens.push(`[cause]: ${cause.message}`);
  }
  const out: RunboardTestResultDisplayError = { message: tokens.join('\n') };
  const codeframe = error.location
    ? readSourceCodeframe(error.location.file, error.location.line, error.location.column)
    : undefined;
  if (codeframe !== undefined) out.codeframe = codeframe;
  return out;
}

function stripMessageLineFromStack(stack: string, message: string): string[] {
  const lines = stack.split('\n');
  const firstMessageLine = message.split('\n')[0];
  if (firstMessageLine && lines[0]?.includes(firstMessageLine)) {
    return lines.slice(1);
  }
  return lines;
}

function readSourceCodeframe(file: string, line: number, column: number): string | undefined {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) return undefined;
  const linesAbove = 5;
  const linesBelow = 5;
  const startLine = Math.max(1, line - linesAbove);
  const endLine = Math.min(lines.length, line + linesBelow);
  const lineNumberWidth = String(endLine).length;
  const out: string[] = [];
  for (let ln = startLine; ln <= endLine; ln++) {
    const marker = ln === line ? '>' : ' ';
    const padded = String(ln).padStart(lineNumberWidth);
    out.push(`${marker} ${padded} | ${lines[ln - 1] ?? ''}`);
    if (ln === line) {
      const arrowColumn = Math.max(0, column - 1);
      out.push(`  ${' '.repeat(lineNumberWidth)} | ${' '.repeat(arrowColumn)}^`);
    }
  }
  return out.join('\n');
}
