/**
 * Deterministic input used to generate the Public Example Bundle published
 * under `docs/public/examples/`.
 *
 * The example bundle is the consumer-facing "real JSON" companion to the
 * Public Data Contract Page. It must stay byte-stable for the same inputs so
 * a validation test can detect silent drift between the Runboard Reporter's
 * emitted JSON and the checked-in sample bundle.
 *
 * Everything here is intentionally fixed: rootDir, Playwright version, test
 * titles, statuses, error messages and stacks, durations, and timestamps.
 * Any change to this fixture must be paired with a regenerated example
 * bundle under `docs/public/examples/`.
 */
import { mkdir } from 'node:fs/promises';
import { RunboardReporter } from '../../src/index.js';
import type { FakeRun } from './fake-playwright.js';
import { fakeFullResult, fakeRun } from './fake-playwright.js';

export const EXAMPLE_FIXTURE_ROOT_DIR = '/example/repo';
export const EXAMPLE_FIXTURE_PLAYWRIGHT_VERSION = '1.59.0';
export const EXAMPLE_FIXTURE_FILE_NAME = 'tests/checkout.spec.ts';
export const EXAMPLE_FIXTURE_REPORT_TITLE = 'Checkout Suite';
export const EXAMPLE_FIXTURE_RUN_START_TIME = new Date(1_700_000_000_000);
export const EXAMPLE_FIXTURE_RUN_DURATION_MS = 1_250;

const ABSOLUTE_FIXTURE_FILE = `${EXAMPLE_FIXTURE_ROOT_DIR}/${EXAMPLE_FIXTURE_FILE_NAME}`;

export function buildExampleRun(): FakeRun {
  return fakeRun({
    rootDir: EXAMPLE_FIXTURE_ROOT_DIR,
    playwrightVersion: EXAMPLE_FIXTURE_PLAYWRIGHT_VERSION,
    projects: [
      {
        name: 'chromium',
        testDir: `${EXAMPLE_FIXTURE_ROOT_DIR}/tests`,
        outputDir: `${EXAMPLE_FIXTURE_ROOT_DIR}/test-results`,
      },
    ],
    files: [
      {
        fileName: ABSOLUTE_FIXTURE_FILE,
        tests: [
          {
            title: 'completes purchase as a logged-in user',
            id: 'example-tests-checkout-1',
            location: { file: ABSOLUTE_FIXTURE_FILE, line: 5, column: 5 },
            results: [
              {
                status: 'passed',
                startTime: EXAMPLE_FIXTURE_RUN_START_TIME,
                duration: 320,
                stdout: ['Processing order 12345\n'],
              },
            ],
          },
          {
            title: 'shows an error for an invalid card',
            id: 'example-tests-checkout-2',
            status: 'failed',
            outcome: 'unexpected',
            location: { file: ABSOLUTE_FIXTURE_FILE, line: 14, column: 5 },
            results: [
              {
                status: 'failed',
                startTime: new Date(EXAMPLE_FIXTURE_RUN_START_TIME.getTime() + 320),
                duration: 480,
                errors: [
                  {
                    message:
                      'expect(received).toBe(expected) // Object.is equality\n\nExpected: 200\nReceived: 400',
                    stack:
                      'Error: expect(received).toBe(expected) // Object.is equality\n\n' +
                      'Expected: 200\n' +
                      'Received: 400\n' +
                      `    at ${ABSOLUTE_FIXTURE_FILE}:17:25`,
                  },
                ],
              },
            ],
          },
          {
            title: 'is skipped pending design review',
            id: 'example-tests-checkout-3',
            status: 'skipped',
            expectedStatus: 'skipped',
            location: { file: ABSOLUTE_FIXTURE_FILE, line: 24, column: 5 },
            results: [
              {
                status: 'skipped',
                startTime: new Date(EXAMPLE_FIXTURE_RUN_START_TIME.getTime() + 800),
                duration: 0,
              },
            ],
          },
        ],
      },
    ],
  });
}

/**
 * Runs the Runboard Reporter against the deterministic example input and
 * writes a Runboard Data Bundle into `outputFolder`. The bundle is the same
 * shape a real run would produce, so the resulting `report.json` and
 * `<fileId>.json` files can be checked in as the Public Example Bundle.
 */
export async function generateExampleBundle(outputFolder: string): Promise<void> {
  await mkdir(outputFolder, { recursive: true });
  const reporter = new RunboardReporter({
    outputFolder,
    title: EXAMPLE_FIXTURE_REPORT_TITLE,
  });
  const run = buildExampleRun();
  reporter.onBegin?.(run.config, run.rootSuite);
  await reporter.onEnd?.(
    fakeFullResult({
      status: 'failed',
      startTime: EXAMPLE_FIXTURE_RUN_START_TIME,
      duration: EXAMPLE_FIXTURE_RUN_DURATION_MS,
    }),
  );
}
