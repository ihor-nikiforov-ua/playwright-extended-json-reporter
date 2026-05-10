/**
 * Error Catalog Suite — fixture coverage for all 45 Error Types.
 *
 * The Error Catalog at `docs/error-catalog/playwright-error-types.md` defines
 * 45 Playwright Error Types whose distinguishing evidence the Runboard
 * Reporter must preserve through Runboard Data Contract serialization. Each
 * test below builds a synthetic Playwright run that surfaces one Error Type's
 * distinguishing signal as either a raw `TestError` (`source: 'test-error'`)
 * or a status-derived display message (`source: 'status-derived'`), runs it
 * through the real `RunboardReporter`, and asserts the distinguishing signal
 * survives end-to-end into the emitted Runboard Data Bundle.
 *
 * The suite intentionally does not assert any reporter-side `errorType`
 * classification: classification is the Runboard's responsibility, while the
 * reporter only carries evidence forward.
 *
 * The suite is registered as a separate Playwright config at
 * `playwright.catalog.config.ts` so the heavier coverage check stays out of
 * the canonical `verify` gate and only runs in the dedicated catalog
 * workflow.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { TestError } from '@playwright/test/reporter';
import { RunboardReporter } from '../../src/index.js';
import {
  type FakeStepSpec,
  type FakeTestResultSpec,
  type FakeTestSpec,
  fakeFullResult,
  fakeRun,
} from '../helpers/fake-playwright.js';

interface BundleResult {
  result: Record<string, unknown>;
  topLevelErrors: string[];
}

interface ErrorTypeFixtureOptions {
  /**
   * Optional override that lets a fixture report a top-level error such as a
   * Global Timeout via `reporter.onError(error)` before `onEnd` fires. When
   * omitted, only test-level evidence is asserted.
   */
  topLevelErrors?: TestError[];
  /**
   * Optional override for the `FullResult` status. Defaults to `'failed'` so
   * the bundle reflects an unhealthy run for failure fixtures.
   */
  finalStatus?: 'passed' | 'failed' | 'timedout' | 'interrupted';
  /**
   * Override the synthesized test case spec. The default produces a single
   * `unexpected` failed test with the supplied result errors and steps.
   */
  testSpec?: Partial<FakeTestSpec>;
  /**
   * Override the synthesized test result spec.
   */
  resultSpec?: Partial<FakeTestResultSpec>;
}

async function runErrorTypeFixture(
  outputFolder: string,
  options: ErrorTypeFixtureOptions = {},
): Promise<BundleResult> {
  const reporter = new RunboardReporter({ outputFolder });
  const baseTestSpec: FakeTestSpec = {
    title: options.testSpec?.title ?? 'fixture',
    status: options.testSpec?.status ?? 'failed',
    expectedStatus: options.testSpec?.expectedStatus ?? 'passed',
    results: options.testSpec?.results ?? [
      {
        status: options.resultSpec?.status ?? 'failed',
        errors: options.resultSpec?.errors ?? [],
        ...(options.resultSpec?.steps !== undefined ? { steps: options.resultSpec.steps } : {}),
        ...(options.resultSpec?.attachments !== undefined
          ? { attachments: options.resultSpec.attachments }
          : {}),
      },
    ],
  };
  const run = fakeRun({
    rootDir: '/repo',
    files: [{ fileName: '/repo/tests/fixture.spec.ts', tests: [baseTestSpec] }],
  });

  reporter.onBegin?.(run.config, run.rootSuite);
  for (const error of options.topLevelErrors ?? []) {
    reporter.onError?.(error);
  }
  await reporter.onEnd?.(fakeFullResult({ status: options.finalStatus ?? 'failed' }));

  const reportRaw = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8')) as {
    files: Array<{ fileId: string }>;
    errors: string[];
  };
  const [fileSummary] = reportRaw.files;
  if (!fileSummary) throw new Error('expected file summary');
  const fileEntry = JSON.parse(
    await readFile(join(outputFolder, `${fileSummary.fileId}.json`), 'utf8'),
  ) as { tests: Array<{ results: Array<Record<string, unknown>> }> };
  const [testCase] = fileEntry.tests;
  if (!testCase) throw new Error('expected test case');
  const [result] = testCase.results;
  if (!result) throw new Error('expected result');
  return { result, topLevelErrors: reportRaw.errors };
}

interface PrimaryEvidence {
  evidence: Array<Record<string, unknown>>;
  primary: Record<string, unknown>;
  errorMessages: string[];
}

function readEvidence(result: Record<string, unknown>): PrimaryEvidence {
  const errors = (result['errors'] as Array<{ message?: string }>) ?? [];
  const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> } | undefined;
  const evidence = runboard?.evidence ?? [];
  if (evidence.length === 0) throw new Error('expected at least one evidence entry');
  const [primary] = evidence;
  if (!primary) throw new Error('expected primary evidence entry');
  return {
    evidence,
    primary,
    errorMessages: errors.map((e) => e?.message ?? ''),
  };
}

function expectEvidenceContains(
  result: Record<string, unknown>,
  fragments: readonly string[],
): PrimaryEvidence {
  const ev = readEvidence(result);
  for (const fragment of fragments) {
    const found =
      ev.errorMessages.some((m) => m.includes(fragment)) ||
      ev.evidence.some((entry) => {
        const message = (entry['message'] as string | undefined) ?? '';
        const stack = (entry['stack'] as string | undefined) ?? '';
        const value = (entry['value'] as string | undefined) ?? '';
        return message.includes(fragment) || stack.includes(fragment) || value.includes(fragment);
      });
    expect(
      found,
      `Expected fragment '${fragment}' to survive serialization. Got errors=${JSON.stringify(
        ev.errorMessages,
      )} evidence=${JSON.stringify(ev.evidence)}`,
    ).toBe(true);
  }
  return ev;
}

function expectNoErrorTypeField(result: Record<string, unknown>): void {
  const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> } | undefined;
  for (const entry of runboard?.evidence ?? []) {
    expect(entry).not.toHaveProperty('errorType');
  }
}

function makeError(overrides: Partial<TestError>): TestError {
  return overrides as TestError;
}

function makeStep(overrides: FakeStepSpec): FakeStepSpec {
  return overrides;
}

test.describe('Error Catalog Suite — all 45 Error Types preserve distinguishing evidence', () => {
  let outputFolder: string;

  test.beforeEach(async () => {
    outputFolder = await mkdtemp(join(tmpdir(), 'runboard-catalog-'));
  });

  test.afterEach(async () => {
    await rm(outputFolder, { recursive: true, force: true });
  });

  test('1. Test timeout preserves "Test timeout" and "exceeded" evidence', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'Test timeout of 30000ms exceeded.',
            stack: 'Error: Test timeout of 30000ms exceeded.\n    at fixture.spec.ts:5:1',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['Test timeout', 'exceeded']);
    expectNoErrorTypeField(result);
  });

  test('2. Action timeout preserves locator API prefix, "Timeout", and "exceeded"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              "locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator('#missing')",
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['locator.', 'Timeout', 'exceeded']);
    expectNoErrorTypeField(result);
  });

  test('3. Navigation timeout preserves "page.", "Timeout", and "exceeded"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'page.goto: Timeout 30000ms exceeded.\nCall log:\n  - navigating to "https://example.com/", waiting until "load"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['page.', 'Timeout', 'exceeded']);
    expectNoErrorTypeField(result);
  });

  test('4. Web-first assertion timeout preserves Expect/with timeout/element(s) not found', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Expect "toBeVisible" with timeout 5000ms\nCall log:\n  - expect.toBeVisible with timeout 5000ms\n  - waiting for locator(\'#x\')\n  -   locator resolved to 0 elements\n  -   element(s) not found',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['Expect ', 'with timeout', 'element(s) not found']);
    expectNoErrorTypeField(result);
  });

  test('5. locator.waitFor / page.waitForSelector timeout preserves "waitFor", "Timeout", "exceeded"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'locator.waitFor: Timeout 1000ms exceeded.',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['waitFor', 'Timeout', 'exceeded']);
    expectNoErrorTypeField(result);
  });

  test('6. waitForEvent / request / response / load-state timeout preserves wait-evidence', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'page.waitForEvent: Timeout 5000ms exceeded while waiting for event "console"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['while waiting for event']);
    expectNoErrorTypeField(result);
  });

  test('7. page.waitForFunction timeout preserves "waitForFunction" and polling evidence', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'page.waitForFunction: Timeout 1000ms exceeded.\nCall log:\n  - waiting for function to return truthy value',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['waitForFunction', 'Timeout']);
    expectNoErrorTypeField(result);
  });

  test('8. Hook timeout preserves "beforeAll", "hook timeout", and "exceeded"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: '"beforeAll" hook timeout of 30000ms exceeded.',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['"beforeAll"', 'hook timeout', 'exceeded']);
    expectNoErrorTypeField(result);
  });

  test('9. Global timeout preserves "Timed out waiting" and "for the entire test run"', async () => {
    const globalError = makeError({
      message: 'Timed out waiting 60000ms for the entire test run.',
    });
    const { topLevelErrors } = await runErrorTypeFixture(outputFolder, {
      topLevelErrors: [globalError],
      resultSpec: { errors: [] },
      testSpec: { status: 'passed', expectedStatus: 'passed' },
      finalStatus: 'failed',
    });
    const text = topLevelErrors.join('\n');
    expect(text).toContain('Timed out waiting');
    expect(text).toContain('for the entire test run');
  });

  test('10. Strict mode violation preserves "strict mode violation"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              "locator.click: Error: strict mode violation: locator('div') resolved to 3 elements",
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['strict mode violation']);
    expectNoErrorTypeField(result);
  });

  test('11. Element not visible preserves "element is not visible"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'locator.click: Timeout 5000ms exceeded.\nCall log:\n  - element is not visible',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['element is not visible']);
    expectNoErrorTypeField(result);
  });

  test('12. Element detached from DOM preserves "element was detached from the DOM"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'locator.click: element was detached from the DOM, retrying',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['element was detached from the DOM']);
    expectNoErrorTypeField(result);
  });

  test('13. Element not stable preserves "not stable"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'locator.click: Timeout 5000ms exceeded.\nCall log:\n  - element is not stable',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['not stable']);
    expectNoErrorTypeField(result);
  });

  test('14. Element intercepts pointer events preserves "intercepts pointer events"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'locator.click: <div class="overlay"></div> intercepts pointer events',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['intercepts pointer events']);
    expectNoErrorTypeField(result);
  });

  test('15. Element outside of viewport preserves "outside of the viewport"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'locator.click: element is outside of the viewport',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['outside of the viewport']);
    expectNoErrorTypeField(result);
  });

  test('16. Element not enabled preserves "element is not enabled"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'locator.click: Timeout 5000ms exceeded.\nCall log:\n  - element is not enabled',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['element is not enabled']);
    expectNoErrorTypeField(result);
  });

  test('17. Frame / element handle disposed preserves disposal evidence', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'page.evaluate: Error: Execution context was destroyed, most likely because of a navigation',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['Execution context was destroyed']);
    expectNoErrorTypeField(result);
  });

  test('18. toHaveText failure preserves "toHaveText"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(locator).toHaveText(expected)\n\nLocator: locator(\'h1\')\nExpected string: "Welcome"\nReceived string: "Hello"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toHaveText']);
    expectNoErrorTypeField(result);
  });

  test('19. toContainText failure preserves "toContainText"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(locator).toContainText(expected)\n\nLocator: locator(\'#status\')\nExpected substring: "ready"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toContainText']);
    expectNoErrorTypeField(result);
  });

  test('20. toHaveValue failure preserves "toHaveValue"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(locator).toHaveValue(expected)\n\nLocator: locator(\'input\')\nExpected: "42"\nReceived: ""',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toHaveValue']);
    expectNoErrorTypeField(result);
  });

  test('21. toBeVisible / toBeHidden failure preserves "toBeVisible"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              "Error: expect(locator).toBeVisible()\n\nLocator: locator('#missing')\nExpected: visible\nReceived: <element(s) not found>",
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toBeVisible']);
    expectNoErrorTypeField(result);
  });

  test('22. toHaveCount failure preserves "toHaveCount"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              "Error: expect(locator).toHaveCount(expected)\n\nLocator: locator('li')\nExpected: 3\nReceived: 1",
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toHaveCount']);
    expectNoErrorTypeField(result);
  });

  test('23. toHaveURL / toHaveTitle failure preserves "toHaveURL"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(page).toHaveURL(expected)\n\nExpected pattern: /\\/dashboard$/\nReceived string: "https://example.com/login"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toHaveURL']);
    expectNoErrorTypeField(result);
  });

  test('24. Attribute-shaped matcher failure preserves "toHaveAttribute"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(locator).toHaveAttribute(name, value)\n\nLocator: locator(\'a\')\nExpected: "https://example.com"\nReceived: "https://other.com"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toHaveAttribute']);
    expectNoErrorTypeField(result);
  });

  test('25. State-flag matcher failure preserves "toBeChecked"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              "Error: expect(locator).toBeChecked()\n\nLocator: locator('input[type=checkbox]')\nExpected: checked\nReceived: unchecked",
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toBeChecked']);
    expectNoErrorTypeField(result);
  });

  test('26. toHaveScreenshot failure preserves screenshot diff evidence', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(page).toHaveScreenshot()\n\nScreenshot comparison failed:\n  12345 pixels (ratio 0.05) are different.',
          }),
        ],
        attachments: [
          {
            name: 'header-expected.png',
            contentType: 'image/png',
            path: '/tmp/expected.png',
          },
          {
            name: 'header-actual.png',
            contentType: 'image/png',
            path: '/tmp/actual.png',
          },
          {
            name: 'header-diff.png',
            contentType: 'image/png',
            path: '/tmp/diff.png',
          },
        ],
      },
    });
    expectEvidenceContains(result, ['toHaveScreenshot', 'pixels']);
    const attachments = (result['attachments'] as Array<{ name?: string }>) ?? [];
    expect(attachments.some((a) => (a.name ?? '').includes('-diff.png'))).toBe(true);
    expect(attachments.some((a) => (a.name ?? '').includes('-expected.png'))).toBe(true);
    expect(attachments.some((a) => (a.name ?? '').includes('-actual.png'))).toBe(true);
    expectNoErrorTypeField(result);
  });

  test('27. Soft assertion failure preserves multiple matcher errors per result', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect.soft(locator).toHaveText(expected)\n\nExpected: "A"\nReceived: "B"',
          }),
          makeError({
            message:
              'Error: expect.soft(locator).toHaveCount(expected)\n\nExpected: 2\nReceived: 5',
          }),
        ],
      },
    });
    const ev = expectEvidenceContains(result, ['toHaveText']);
    expect(ev.evidence.length).toBeGreaterThanOrEqual(2);
    const evidenceText = ev.evidence
      .map((e) => (e['message'] as string | undefined) ?? '')
      .join('\n');
    expect(evidenceText).toContain('toHaveCount');
    expectNoErrorTypeField(result);
  });

  test('28. toBe / equality failure preserves "toBe" and "Object.is equality"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: 3\nReceived: 2',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toBe', 'Object.is equality']);
    expectNoErrorTypeField(result);
  });

  test('29. toMatch failure preserves "toMatch" and "Expected pattern"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(received).toMatch(expected)\n\nExpected pattern: /^foo/\nReceived string: "bar"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toMatch', 'Expected pattern']);
    expectNoErrorTypeField(result);
  });

  test('30. toContain / toContainEqual failure preserves "toContain"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'Error: expect(received).toContain(expected)\n\nExpected substring: "ready"\nReceived string: "loading"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toContain']);
    expectNoErrorTypeField(result);
  });

  test('31. toThrow / toThrowError failure preserves "toThrow" and "did not throw"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'Error: expect(received).toThrow(expected)\n\nReceived function did not throw',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['toThrow', 'Received function did not throw']);
    expectNoErrorTypeField(result);
  });

  test('32. beforeAll hook failure preserves "beforeAll" and the hook-specific message', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'Error: beforeAll boom',
            stack: 'Error: beforeAll boom\n    at beforeAll',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['beforeAll', 'beforeAll boom']);
    expectNoErrorTypeField(result);
  });

  test('33. beforeEach hook failure preserves "beforeEach boom"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [makeError({ message: 'Error: beforeEach boom' })],
      },
    });
    expectEvidenceContains(result, ['beforeEach boom']);
    expectNoErrorTypeField(result);
  });

  test('34. afterEach hook failure preserves "afterEach boom"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [makeError({ message: 'Error: afterEach boom' })],
      },
    });
    expectEvidenceContains(result, ['afterEach boom']);
    expectNoErrorTypeField(result);
  });

  test('35. afterAll hook failure preserves "afterAll boom"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [makeError({ message: 'Error: afterAll boom' })],
      },
    });
    expectEvidenceContains(result, ['afterAll boom']);
    expectNoErrorTypeField(result);
  });

  test('36. Fixture setup failure preserves "fixture setup boom"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [makeError({ message: 'Error: fixture setup boom' })],
      },
    });
    expectEvidenceContains(result, ['fixture setup boom']);
    expectNoErrorTypeField(result);
  });

  test('37. Fixture teardown / fixture timeout preserves "Fixture" and "teardown"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'Fixture "page" teardown timed out: 5000ms exceeded.',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['Fixture', 'teardown']);
    expectNoErrorTypeField(result);
  });

  test('38. Worker teardown / worker process exited preserves worker-failure evidence', async () => {
    const workerError = makeError({
      message: 'Failed worker ran 1 test\n\nWorker process exited unexpectedly',
    });
    const { topLevelErrors } = await runErrorTypeFixture(outputFolder, {
      topLevelErrors: [workerError],
      resultSpec: { errors: [] },
      testSpec: { status: 'passed', expectedStatus: 'passed' },
      finalStatus: 'failed',
    });
    const text = topLevelErrors.join('\n');
    expect(text).toContain('Failed worker ran');
    expect(text).toContain('exited unexpectedly');
  });

  test('39. Error inside test.step() preserves the step error message and stepPath linkage', async () => {
    const stepError = makeError({ message: 'inside test.step open settings: boom' });
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [stepError],
        steps: [
          makeStep({
            title: 'open settings',
            category: 'test.step',
            error: stepError,
          }),
        ],
      },
    });
    const ev = expectEvidenceContains(result, ['inside test.step open settings: boom']);
    expect(ev.primary['source']).toBe('test-error');
    expect(ev.primary['stepPath']).toEqual(['open settings']);
    expect(ev.primary['stepCategory']).toBe('test.step');
    expectNoErrorTypeField(result);
  });

  test('40. test.step.skip not running preserves a downstream-marker signal', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'Error: step-skip-downstream-marker triggered without preceding step.skip',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['step-skip-downstream-marker']);
    expectNoErrorTypeField(result);
  });

  test('41. Page / target / browser context closed preserves "Target closed"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'page.click: Target closed',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['Target closed']);
    expectNoErrorTypeField(result);
  });

  test('42. Network error during navigation preserves "net::ERR_" and URL evidence', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message:
              'page.goto: net::ERR_CONNECTION_REFUSED at https://example.invalid/dashboard\nCall log:\n  - navigating to "https://example.invalid/dashboard"',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['net::ERR_', 'navigating to']);
    expectNoErrorTypeField(result);
  });

  test('43. Page crashed preserves "Page crashed"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'Error: Page crashed',
            stack: 'Error: Page crashed\n    at fixture.spec.ts:5:1',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['Page crashed']);
    expectNoErrorTypeField(result);
  });

  test('44. Unhandled exception in page preserves "Synthetic crash from /crashy"', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      resultSpec: {
        errors: [
          makeError({
            message: 'Synthetic crash from /crashy: ReferenceError: x is not defined',
          }),
        ],
      },
    });
    expectEvidenceContains(result, ['Synthetic crash from /crashy']);
    expectNoErrorTypeField(result);
  });

  test('45. test.fail() unexpectedly passing emits source=status-derived evidence', async () => {
    const { result } = await runErrorTypeFixture(outputFolder, {
      testSpec: {
        title: 'expected to fail but passed',
        status: 'passed',
        expectedStatus: 'failed',
        results: [{ status: 'passed' }],
      },
      finalStatus: 'failed',
    });
    const errors = (result['errors'] as Array<{ message?: string }>) ?? [];
    expect(errors[0]?.message).toContain('Expected to fail, but passed.');
    const runboard = result['runboard'] as { evidence: Array<Record<string, unknown>> };
    expect(runboard.evidence).toHaveLength(1);
    expect(runboard.evidence[0]).toEqual({
      source: 'status-derived',
      message: 'Expected to fail, but passed.',
    });
    expectNoErrorTypeField(result);
  });
});

test.describe('Error Catalog Suite — coverage matches the 45 catalogued Error Types', () => {
  test('exactly 45 catalog test ids are exercised, one per Error Type', async () => {
    const here = new URL('./error-catalog.spec.ts', import.meta.url);
    const source = await readFile(here, 'utf8');
    const ids = new Set<number>();
    for (const match of source.matchAll(/test\(['"](\d+)\./g)) {
      const raw = match[1];
      if (raw === undefined) continue;
      ids.add(Number.parseInt(raw, 10));
    }
    expect([...ids].sort((a, b) => a - b)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
  });

  test('every Error Type from the catalog markdown is paired with a fixture in this suite', async () => {
    const repoRoot = new URL('../../', import.meta.url);
    const catalog = await readFile(
      new URL('docs/error-catalog/playwright-error-types.md', repoRoot),
      'utf8',
    );
    const ids = new Set<number>();
    for (const match of catalog.matchAll(/^\|\s*(\d+)\s*\|/gm)) {
      const raw = match[1];
      if (raw === undefined) continue;
      ids.add(Number.parseInt(raw, 10));
    }
    expect(
      [...ids].sort((a, b) => a - b),
      'Error Catalog markdown must enumerate exactly 45 Error Types',
    ).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
  });
});
