// Illustrative Playwright Input for the Public Example Bundle.
//
// This file is the package-visible companion to the emitted bundle under
// ../playwright-runboard-report/. It shows the kind of Playwright spec that
// produced the example output: three test cases (passing, failing, skipped)
// inside a single source file at tests/checkout.spec.ts, run under a project
// named "chromium" against Playwright 1.59.
//
// It is documentation: not picked up by the reporter's own test runner and
// not intended to be executed by the package. The byte-stable input that the
// drift test regenerates from is a deterministic fixture (kept inside the
// repository, not shipped in the package). See the "Example input" section
// in ../README.md for the link.

import { expect, test } from '@playwright/test';

test('completes purchase as a logged-in user', async () => {
  process.stdout.write('Processing order 12345\n');
  expect(1 + 1).toBe(2);
});

test('shows an error for an invalid card', async () => {
  const response = { status: 400 };
  expect(response.status).toBe(200);
});

test.skip('is skipped pending design review', async () => {
  expect(true).toBe(true);
});
