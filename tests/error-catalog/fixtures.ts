/**
 * Error Catalog fixtures: one entry per Error Type from
 * `docs/error-catalog/playwright-error-types.md`.
 *
 * Every fixture pairs a real Playwright spec source with the
 * distinguishing-signal substrings the Runboard Reporter must preserve through
 * serialization. The spec runs through `runCatalogSpec`, which executes a real
 * Playwright child process so the resulting Error Type, Call log, attachments,
 * hooks, timeouts, and status-derived shapes come from Playwright itself —
 * never from hand-written `TestError` payloads. The catalog spec then asserts
 * the signals survive into the Runboard Data Bundle.
 *
 * The fixture metadata is also the source of truth that the markdown pairing
 * guard checks against, so a catalog row update forces an aligned fixture.
 */

export interface ErrorCatalogFixture {
  /** Catalog ID (1..45) matching the markdown table row. */
  id: number;
  /** Human-readable Error Type label, mirroring the markdown row. */
  errorType: string;
  /**
   * Substrings the markdown lists as the row's distinguishing signal. Every
   * substring must survive into either the per-result evidence/error messages
   * or, for runner-level shapes, the top-level `report.errors[]` list.
   */
  distinguishingSignals: readonly string[];
  /**
   * Where the distinguishing signals live in the bundle:
   *  - `result`: per-test `errors[]` and `runboard.evidence[]`
   *  - `top-level`: top-level `report.errors[]`
   */
  evidenceLocation: 'result' | 'top-level';
  /** Spec source written into the fixture file run by Playwright. */
  spec: string;
  /** Wires a chromium browser project into the inner Playwright config. */
  needsBrowser?: boolean;
  /** Extra inner Playwright config keys (e.g. `globalTimeout: 1000,`). */
  extraConfigLines?: readonly string[];
  /**
   * Optional extra structural assertion run after the signals check (e.g.
   * "primary evidence has stepPath" or "attachments contain a -diff.png").
   */
  extraAssertion?: ExtraAssertion;
}

import type { CatalogBundle, CatalogResultView } from './run-catalog-spec.js';

export type ExtraAssertion = (ctx: {
  bundle: CatalogBundle;
  view: CatalogResultView;
}) => void | Promise<void>;

const PW = `import { test, expect } from '@playwright/test';`;
const PW_NO_EXPECT = `import { test } from '@playwright/test';`;

export const ERROR_CATALOG_FIXTURES: readonly ErrorCatalogFixture[] = [
  {
    id: 1,
    errorType: 'Test timeout',
    distinguishingSignals: ['Test timeout', 'exceeded'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test('exceeds the configured test timeout', async () => {`,
      `  test.setTimeout(50);`,
      `  await new Promise((r) => setTimeout(r, 5000));`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 2,
    errorType: 'Action timeout',
    distinguishingSignals: ['locator.', 'Timeout', 'exceeded'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('action times out waiting for a missing locator', async ({ page }) => {`,
      `  await page.setContent('<html><body><h1>no target</h1></body></html>');`,
      `  await page.locator('#missing').click({ timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 3,
    errorType: 'Navigation timeout',
    distinguishingSignals: ['page.', 'Timeout', 'exceeded'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('navigation times out under a slow route handler', async ({ page }) => {`,
      // A route handler that never fulfills makes the navigation hang until
      // the page-level timeout fires deterministically — no flaky network.
      `  await page.route('https://runboard.invalid/**', async () => {`,
      `    await new Promise((r) => setTimeout(r, 30_000));`,
      `  });`,
      `  await page.goto('https://runboard.invalid/dashboard', { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 4,
    errorType: 'Web-first assertion timeout',
    distinguishingSignals: ['Expect ', 'with timeout', 'element(s) not found'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('web-first assertion times out on a missing element', async ({ page }) => {`,
      `  await page.setContent('<html><body><h1>only header</h1></body></html>');`,
      `  await expect(page.locator('#missing')).toBeVisible({ timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 5,
    errorType: 'locator.waitFor / page.waitForSelector timeout',
    distinguishingSignals: ['waitFor', 'Timeout', 'exceeded'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('locator.waitFor times out on a missing selector', async ({ page }) => {`,
      `  await page.setContent('<html><body></body></html>');`,
      `  await page.locator('#missing').waitFor({ timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 6,
    errorType: 'waitForEvent / request / response / load-state timeout',
    distinguishingSignals: ['while waiting for event'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('waitForEvent times out without the event firing', async ({ page }) => {`,
      `  await page.setContent('<html><body></body></html>');`,
      `  await page.waitForEvent('console', { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 7,
    errorType: 'page.waitForFunction timeout',
    distinguishingSignals: ['waitForFunction', 'Timeout'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('waitForFunction times out polling a never-truthy expression', async ({ page }) => {`,
      `  await page.setContent('<html><body></body></html>');`,
      `  await page.waitForFunction(() => false, undefined, { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 8,
    errorType: 'Hook timeout',
    distinguishingSignals: ['"beforeAll"', 'hook timeout', 'exceeded'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test.beforeAll(async () => {`,
      // Hook timeout is taken from `timeout` in config; we set 50ms there.
      `  await new Promise((r) => setTimeout(r, 5000));`,
      `});`,
      `test('placeholder so the failing hook surfaces in the bundle', () => {});`,
      '',
    ].join('\n'),
    extraConfigLines: [`timeout: 50,`],
  },
  {
    id: 9,
    errorType: 'Global timeout',
    distinguishingSignals: ['Timed out waiting', 'to run'],
    evidenceLocation: 'top-level',
    spec: [
      PW_NO_EXPECT,
      `test('runs longer than the entire-suite global timeout', async () => {`,
      `  await new Promise((r) => setTimeout(r, 30_000));`,
      `});`,
      '',
    ].join('\n'),
    extraConfigLines: [`globalTimeout: 500,`],
  },
  {
    id: 10,
    errorType: 'Strict mode violation',
    distinguishingSignals: ['strict mode violation'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('locator click violates strict mode with multiple matches', async ({ page }) => {`,
      `  await page.setContent('<html><body><div>a</div><div>b</div></body></html>');`,
      `  await page.locator('div').click({ timeout: 1000 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 11,
    errorType: 'Element is not visible',
    distinguishingSignals: ['element is not visible'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('clicking a hidden element fails actionability', async ({ page }) => {`,
      `  await page.setContent('<html><body><button id="b" style="display:none">Hi</button></body></html>');`,
      `  await page.locator('#b').click({ timeout: 200 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 12,
    errorType: 'Element is detached from the DOM',
    distinguishingSignals: ['element was detached from the DOM'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('clicking a self-removing element fires detached retry', async ({ page }) => {`,
      // Reattach a fresh button on every animation frame so each resolved
      // handle is stale by the time Playwright dispatches the click action.
      // requestAnimationFrame fires on every paint (~16ms), which is faster
      // than Playwright's actionability sampling, guaranteeing the call log
      // accumulates "element was detached from the DOM, retrying".
      `  await page.setContent([`,
      `    '<html><body><button id="b">Hi</button>',`,
      `    '<script>',`,
      `    'const swap = () => {',`,
      `    '  const b = document.getElementById("b");',`,
      `    '  if (b) b.parentNode.replaceChild(b.cloneNode(true), b);',`,
      `    '  requestAnimationFrame(swap);',`,
      `    '};',`,
      `    'requestAnimationFrame(swap);',`,
      `    '</script>',`,
      `    '</body></html>',`,
      `  ].join(''));`,
      `  await page.locator('#b').click({ timeout: 1000 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 13,
    errorType: 'Element is not stable',
    distinguishingSignals: ['not stable'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('clicking a continuously animating element fails actionability', async ({ page }) => {`,
      `  await page.setContent([`,
      `    '<html><body>',`,
      // A long-cycle animation keeps the element bounding box moving across
      // every actionability sample, so Playwright never sees a stable target.
      `    '<style>@keyframes m { 0%, 100% { left: 0 } 50% { left: 200px } }',`,
      `    '#b { position: absolute; animation: m 200ms infinite linear; }</style>',`,
      `    '<button id="b">Hi</button>',`,
      `    '</body></html>',`,
      `  ].join(''));`,
      `  await page.locator('#b').click({ timeout: 500 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 14,
    errorType: 'Element intercepts pointer events',
    distinguishingSignals: ['intercepts pointer events'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('an overlay element intercepts the click', async ({ page }) => {`,
      `  await page.setContent([`,
      `    '<html><body>',`,
      `    '<button id="b">Hi</button>',`,
      `    '<div style="position:fixed;inset:0;background:red"></div>',`,
      `    '</body></html>',`,
      `  ].join(''));`,
      `  await page.locator('#b').click({ timeout: 200 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 15,
    errorType: 'Element is outside of the viewport',
    distinguishingSignals: ['outside of the viewport'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('forced click on an off-screen element throws viewport error', async ({ page }) => {`,
      `  await page.setContent([`,
      `    '<html><body>',`,
      `    '<button id="b" style="position:fixed;top:-99999px;left:0">Hi</button>',`,
      `    '</body></html>',`,
      `  ].join(''));`,
      // `force: true` short-circuits the auto-wait loop and throws the
      // non-recoverable "Element is outside of the viewport" directly.
      `  await page.locator('#b').click({ force: true, timeout: 200 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 16,
    errorType: 'Element is not enabled',
    distinguishingSignals: ['element is not enabled'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('clicking a disabled button fails actionability', async ({ page }) => {`,
      `  await page.setContent('<html><body><button id="b" disabled>Hi</button></body></html>');`,
      `  await page.locator('#b').click({ timeout: 200 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 17,
    errorType: 'Frame / element handle disposed',
    distinguishingSignals: ['Execution context was destroyed'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('execution context dies underneath an in-flight evaluate', async ({ page }) => {`,
      `  await page.setContent('<html><body></body></html>');`,
      `  const evaluating = page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1000)));`,
      `  await page.goto('about:blank');`,
      `  await evaluating;`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 18,
    errorType: 'toHaveText failure',
    distinguishingSignals: ['toHaveText'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toHaveText fails on text mismatch', async ({ page }) => {`,
      `  await page.setContent('<html><body><h1>Hello</h1></body></html>');`,
      `  await expect(page.locator('h1')).toHaveText('Welcome', { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 19,
    errorType: 'toContainText failure',
    distinguishingSignals: ['toContainText'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toContainText fails on missing substring', async ({ page }) => {`,
      `  await page.setContent('<html><body><div id="status">loading</div></body></html>');`,
      `  await expect(page.locator('#status')).toContainText('ready', { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 20,
    errorType: 'toHaveValue failure',
    distinguishingSignals: ['toHaveValue'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toHaveValue fails on input mismatch', async ({ page }) => {`,
      `  await page.setContent('<html><body><input id="n" value=""></body></html>');`,
      `  await expect(page.locator('#n')).toHaveValue('42', { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 21,
    errorType: 'toBeVisible / toBeHidden failure',
    distinguishingSignals: ['toBeVisible'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toBeVisible fails when the element is missing', async ({ page }) => {`,
      `  await page.setContent('<html><body></body></html>');`,
      `  await expect(page.locator('#missing')).toBeVisible({ timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 22,
    errorType: 'toHaveCount failure',
    distinguishingSignals: ['toHaveCount'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toHaveCount fails on count mismatch', async ({ page }) => {`,
      `  await page.setContent('<html><body><ul><li>1</li></ul></body></html>');`,
      `  await expect(page.locator('li')).toHaveCount(3, { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 23,
    errorType: 'toHaveURL / toHaveTitle failure',
    distinguishingSignals: ['toHaveURL'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toHaveURL fails on URL mismatch', async ({ page }) => {`,
      `  await page.goto('about:blank');`,
      `  await expect(page).toHaveURL(/\\/dashboard$/, { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 24,
    errorType: 'Attribute-shaped matcher failure',
    distinguishingSignals: ['toHaveAttribute'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toHaveAttribute fails on attribute mismatch', async ({ page }) => {`,
      `  await page.setContent('<html><body><a id="a" href="https://other.com">x</a></body></html>');`,
      `  await expect(page.locator('#a')).toHaveAttribute('href', 'https://example.com', { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 25,
    errorType: 'State-flag matcher failure',
    distinguishingSignals: ['toBeChecked'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toBeChecked fails on unchecked state', async ({ page }) => {`,
      `  await page.setContent('<html><body><input id="c" type="checkbox"></body></html>');`,
      `  await expect(page.locator('#c')).toBeChecked({ timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 26,
    errorType: 'toHaveScreenshot failure',
    // The matcher name and the pixel-diff text are both stable signals
    // Playwright still emits in the failure message and call log.
    distinguishingSignals: ['toHaveScreenshot', 'are different'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('toHaveScreenshot fails because the baseline differs', async ({ page }) => {`,
      `  await page.setContent('<html><body style="background:#fff"><h1 id="h">A</h1></body></html>');`,
      `  // First call records the baseline; second call mutates the DOM so it diverges.`,
      `  await expect(page).toHaveScreenshot('baseline.png', { timeout: 1000 });`,
      `  await page.evaluate(() => { document.getElementById('h').textContent = 'BBBBBBB'; });`,
      `  await expect(page).toHaveScreenshot('baseline.png', { timeout: 1000, maxDiffPixels: 0 });`,
      `});`,
      '',
    ].join('\n'),
    extraAssertion: ({ view }) => {
      const attachments =
        (view.result['attachments'] as Array<{ name?: string }> | undefined) ?? [];
      const names = attachments.map((a) => a.name ?? '');
      const hasDiff = names.some((n) => /-diff\.png$/.test(n));
      const hasExpected = names.some((n) => /-expected\.png$/.test(n));
      const hasActual = names.some((n) => /-actual\.png$/.test(n));
      if (!hasDiff || !hasExpected || !hasActual) {
        throw new Error(
          `expected screenshot diff/expected/actual attachments; got ${JSON.stringify(names)}`,
        );
      }
    },
  },
  {
    id: 27,
    errorType: 'Soft assertion failure',
    distinguishingSignals: ['toHaveText', 'toHaveCount'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW,
      `test('soft assertions accumulate multiple errors per result', async ({ page }) => {`,
      `  await page.setContent('<html><body><h1>B</h1><ul><li>1</li></ul></body></html>');`,
      `  await expect.soft(page.locator('h1')).toHaveText('A', { timeout: 100 });`,
      `  await expect.soft(page.locator('li')).toHaveCount(2, { timeout: 100 });`,
      `});`,
      '',
    ].join('\n'),
    extraAssertion: ({ view }) => {
      const evidence =
        (view.result['runboard'] as { evidence?: Array<Record<string, unknown>> } | undefined)
          ?.evidence ?? [];
      if (evidence.length < 2) {
        throw new Error(
          `expected ≥2 soft-assertion evidence entries; got ${JSON.stringify(evidence)}`,
        );
      }
    },
  },
  {
    id: 28,
    errorType: 'toBe / equality matcher failure',
    distinguishingSignals: ['toBe', 'Object.is equality'],
    evidenceLocation: 'result',
    spec: [
      PW,
      `test('toBe fails on equality mismatch', () => {`,
      `  expect(2).toBe(3);`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 29,
    errorType: 'toMatch failure',
    distinguishingSignals: ['toMatch', 'Expected pattern'],
    evidenceLocation: 'result',
    spec: [
      PW,
      `test('toMatch fails on regex mismatch', () => {`,
      `  expect('bar').toMatch(/^foo/);`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 30,
    errorType: 'toContain / toContainEqual failure',
    distinguishingSignals: ['toContain'],
    evidenceLocation: 'result',
    spec: [
      PW,
      `test('toContain fails on missing substring', () => {`,
      `  expect('loading').toContain('ready');`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 31,
    errorType: 'toThrow / toThrowError failure',
    distinguishingSignals: ['toThrow', 'Received function did not throw'],
    evidenceLocation: 'result',
    spec: [
      PW,
      `test('toThrow fails when the function does not throw', () => {`,
      `  expect(() => 1 + 1).toThrow();`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 32,
    errorType: 'beforeAll hook failure',
    distinguishingSignals: ['beforeAll', 'beforeAll boom'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test.beforeAll(() => { throw new Error('beforeAll boom'); });`,
      `test('placeholder so the failing hook surfaces in the bundle', () => {});`,
      '',
    ].join('\n'),
  },
  {
    id: 33,
    errorType: 'beforeEach hook failure',
    distinguishingSignals: ['beforeEach boom'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test.beforeEach(() => { throw new Error('beforeEach boom'); });`,
      `test('placeholder so the failing hook surfaces in the bundle', () => {});`,
      '',
    ].join('\n'),
  },
  {
    id: 34,
    errorType: 'afterEach hook failure',
    distinguishingSignals: ['afterEach boom'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test.afterEach(() => { throw new Error('afterEach boom'); });`,
      `test('placeholder so the failing hook surfaces in the bundle', () => {});`,
      '',
    ].join('\n'),
  },
  {
    id: 35,
    errorType: 'afterAll hook failure',
    distinguishingSignals: ['afterAll boom'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test.afterAll(() => { throw new Error('afterAll boom'); });`,
      `test('placeholder so the failing hook surfaces in the bundle', () => {});`,
      '',
    ].join('\n'),
  },
  {
    id: 36,
    errorType: 'Fixture setup failure',
    distinguishingSignals: ['fixture setup boom'],
    evidenceLocation: 'result',
    spec: [
      `import { test as base } from '@playwright/test';`,
      `const test = base.extend<{ broken: string }>({`,
      `  broken: async ({}, use) => { throw new Error('fixture setup boom'); await use('x'); },`,
      `});`,
      `test('fixture setup throws before the test body runs', ({ broken }) => {`,
      `  void broken;`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 37,
    errorType: 'Fixture teardown failure / fixture timeout',
    distinguishingSignals: ['Fixture', 'teardown'],
    evidenceLocation: 'result',
    spec: [
      `import { test as base } from '@playwright/test';`,
      `const test = base.extend<{ slowTeardown: string }>({`,
      `  slowTeardown: [async ({}, use) => {`,
      `    await use('x');`,
      `    await new Promise((r) => setTimeout(r, 5000));`,
      `  }, { timeout: 100 }],`,
      `});`,
      `test('fixture teardown exceeds its dedicated timeout', ({ slowTeardown }) => {`,
      `  void slowTeardown;`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 38,
    errorType: 'Worker teardown / worker process exited unexpectedly',
    distinguishingSignals: ['exited unexpectedly'],
    // Playwright's dispatcher attaches the unexpected-exit error directly to
    // the test that was running when the worker died, not to the top-level
    // `report.errors[]`, so the signal lives in per-result evidence.
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test('the worker process exits mid-test', async () => {`,
      `  setTimeout(() => process.exit(7), 10);`,
      `  await new Promise((r) => setTimeout(r, 5000));`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 39,
    errorType: 'Error inside test.step()',
    distinguishingSignals: ['inside test.step open settings: boom'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test('error inside test.step preserves stepPath', async () => {`,
      `  await test.step('open settings', async () => {`,
      `    throw new Error('inside test.step open settings: boom');`,
      `  });`,
      `});`,
      '',
    ].join('\n'),
    extraAssertion: ({ view }) => {
      const evidence =
        (view.result['runboard'] as { evidence?: Array<Record<string, unknown>> } | undefined)
          ?.evidence ?? [];
      const [primary] = evidence;
      const stepPath = primary?.['stepPath'] as string[] | undefined;
      if (!stepPath?.includes('open settings')) {
        throw new Error(
          `expected stepPath to include 'open settings'; got ${JSON.stringify(primary)}`,
        );
      }
    },
  },
  {
    id: 40,
    errorType: 'test.step.skip not running',
    distinguishingSignals: ['step-skip-downstream-marker'],
    evidenceLocation: 'result',
    spec: [
      PW_NO_EXPECT,
      `test('test.step.skip never runs and downstream marker fires', async () => {`,
      `  let stepRan = false;`,
      `  await test.step.skip('seeded data', async () => { stepRan = true; });`,
      `  if (!stepRan) {`,
      `    throw new Error('step-skip-downstream-marker triggered without preceding step.skip');`,
      `  }`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 41,
    errorType: 'Page / target / browser context closed',
    distinguishingSignals: ['Target page, context or browser has been closed'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('a closed page rejects further actions', async ({ page }) => {`,
      `  await page.setContent('<html><body><button id="b">Hi</button></body></html>');`,
      `  await page.close();`,
      `  await page.locator('#b').click();`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 42,
    errorType: 'Network error during navigation',
    distinguishingSignals: ['net::ERR_'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('navigation surfaces a chromium net error', async ({ page }) => {`,
      `  await page.goto('http://127.0.0.1:1/dashboard');`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 43,
    errorType: 'Page crashed',
    distinguishingSignals: ['Target crashed'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('page crashed when navigating to chrome://crash', async ({ page }) => {`,
      `  // Listen for crash so we wait for it before failing the assertion below.`,
      `  const crashed = page.waitForEvent('crash', { timeout: 5000 });`,
      `  page.goto('chrome://crash').catch(() => {});`,
      `  await crashed;`,
      `  await page.locator('body').isVisible();`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 44,
    errorType: 'Unhandled exception in page',
    distinguishingSignals: ['Synthetic crash from /crashy'],
    evidenceLocation: 'result',
    needsBrowser: true,
    spec: [
      PW_NO_EXPECT,
      `test('page error listener surfaces an unhandled in-page exception', async ({ page }) => {`,
      `  const pageError = page.waitForEvent('pageerror');`,
      `  await page.goto('data:text/html,<script>setTimeout(() => { throw new Error("ReferenceError: x is not defined"); }, 0);</script>');`,
      `  const error = await pageError;`,
      `  throw new Error('Synthetic crash from /crashy: ' + error.message);`,
      `});`,
      '',
    ].join('\n'),
  },
  {
    id: 45,
    errorType: 'test.fail() unexpectedly passed',
    distinguishingSignals: ['Expected to fail, but passed'],
    evidenceLocation: 'result',
    spec: [
      PW,
      `test('test.fail() but the body actually passes', () => {`,
      `  test.fail();`,
      `  expect(1 + 1).toBe(2);`,
      `});`,
      '',
    ].join('\n'),
    extraAssertion: ({ view }) => {
      const evidence =
        (view.result['runboard'] as { evidence?: Array<Record<string, unknown>> } | undefined)
          ?.evidence ?? [];
      const [primary] = evidence;
      if (primary?.['source'] !== 'status-derived') {
        throw new Error(
          `expected source=status-derived for test.fail() unexpectedly passed; got ${JSON.stringify(primary)}`,
        );
      }
    },
  },
];
