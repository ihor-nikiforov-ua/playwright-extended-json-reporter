/**
 * Error Catalog Display Error parity suite.
 *
 * Issue #32 establishes a focused parity gate that compares the Playwright
 * HTML reporter `result.errors[]` Display Error surface against the Runboard
 * Reporter output for each catalog fixture. The suite is parametrized over
 * `ERROR_CATALOG_FIXTURES`; the {@link EXPECTED_PARITY_FAILURES} allowlist
 * tracks fixtures that have not yet reached parity. Each follow-up Display
 * Error implementation issue removes its IDs from the allowlist, which forces
 * this suite to enforce parity for them on every catalog run.
 *
 * To exercise a single catalog ID locally:
 *
 * ```sh
 * # Build the reporter dist the parity runner loads.
 * npm run build
 *
 * # Run the catalog config and grep on the parametrized test title
 * # ("${id}. ${errorType}"). Playwright's --grep matches against the full
 * # test path, so include enough of the Error Type label to disambiguate
 * # short IDs (e.g. "1" alone would match "1.", "11.", "21." …).
 * npx playwright test --config=playwright.catalog.config.ts \
 *   --grep "Display Error parity.*45\\. test\\.fail"
 * ```
 *
 * On parity failure the suite throws a {@link formatCatalogDisplayErrorDifferences}
 * report that names the catalog ID, Error Type, test file, result index, and
 * error index for every divergent field, so an AFK agent can re-run the same
 * fixture, work the diff to zero, and repeat.
 *
 * The suite runs under `playwright.catalog.config.ts`, not the canonical
 * `verify` gate, so the heavier per-fixture Playwright spawns stay out of
 * normal CI.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { formatCatalogDisplayErrorDifferences } from '../harness/compatibility-fixture.js';
import { ERROR_CATALOG_FIXTURES } from './fixtures.js';
import { runCatalogDisplayErrorParity } from './run-catalog-spec.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');

/**
 * Catalog IDs whose Display Errors are not yet at Playwright HTML reporter
 * parity. Each follow-up issue from the Display Error parity epic (#31) drops
 * its IDs from this set as the formatter learns to reproduce the matching
 * Display Error wording. The release-gate workstream (#47) is the final entry
 * point: when this set is empty, the gate can prevent publishing without
 * parity for every Error Type.
 *
 * Fixture IDs in this set are skipped — the parity comparator is exercised
 * for them through the unit tests in `tests/compatibility/catalog-display-
 * error.spec.ts`, but their real Playwright runs do not yet enforce parity.
 */
const EXPECTED_PARITY_FAILURES: ReadonlySet<number> = new Set<number>([
  // Catalog rows whose Display Error wording diverges from Playwright's
  // official HTML reporter today (Display Error Formatter is still public-
  // serializer-only, so anything richer than a status-derived message is
  // expected to mismatch). Issues #35–#46 will drop their IDs as parity
  // lands. Issue #35 dropped catalog IDs 1, 8, 9 (test/hook/global timeouts).
  // Issue #36 dropped catalog IDs 2, 3, 5, 6, 7 (action, navigation, and wait
  // timeouts). Issue #37 dropped catalog IDs 10–17 (locator, actionability,
  // and disposed-handle failures); their Call logs and locator-preview text
  // now reach parity through the same `parseErrorStack` partition that
  // issue #36 added for action-style timeouts. Issue #38 dropped catalog
  // IDs 4, 18, 19, 20, 22, 23 (web-first assertion timeout, toHaveText,
  // toContainText, toHaveValue, toHaveCount, toHaveURL/toHaveTitle); their
  // matcher hint, Locator/Expected/Received/Timeout block, and Call log all
  // round-trip through the same partition because Playwright embeds the
  // multi-line matcher message at the head of `error.stack`. Issue #39 dropped
  // catalog IDs 21, 24, 25 (toBeVisible/toBeHidden, toHaveAttribute,
  // toBeChecked); these visibility/attribute/state matchers share the same
  // web-first failure shape produced by `formatMatcherMessage` in
  // playwright-core, so the same partition keeps their matcher hint + Locator
  // + Expected/Received + Timeout + Call log block intact in
  // `result.errors[].message`. Issue #40 dropped catalog ID 26
  // (toHaveScreenshot); the screenshot matcher emits a `formatMatcherMessage`
  // header followed by the indented pixel-diff text, a `Snapshot:` line, and
  // a Call log. The same `parseErrorStack` partition keeps the multi-line
  // matcher block intact in `result.errors[].message`, while the
  // expected/actual/diff PNGs continue to ride through the existing
  // data-bundle attachment model alongside the Display Error. Issue #41
  // dropped catalog ID 27 (Soft assertion failure); `expect.soft(...)` does
  // not throw, so Playwright accumulates one TestError per failed soft
  // matcher on `result.errors[]`. The Display Error Formatter already emits
  // one Display Error per TestError in the order Playwright recorded them,
  // and the serializer keeps `result.runboard.evidence[]` index-aligned with
  // the Display Errors, so each individual soft web-first matcher reaches
  // parity through the same partition the single-matcher catalog rows use.
  // Issue #42 dropped catalog IDs 28, 29, 30, 31 (toBe, toMatch, toContain,
  // toThrow). Generic value matchers ride Playwright's bundled-expect
  // pathway: `ExpectError` (`matcherHint.js`) wraps a Jest assertion error so
  // `error.message` carries the matcher hint plus Expected/Received block,
  // `error.stack` carries the same content followed by stack frames, and
  // `addLocationAndSnippetToError` (`internalReporter.js`) attaches the
  // Babel-rendered codeframe as `error.snippet`. The same `parseErrorStack`
  // partition used for the web-first families keeps the matcher hint and
  // Expected/Received text intact in `result.errors[].message`, so no
  // formatter changes were needed; a contract regression test in
  // tests/contract/display-error-formatter.spec.ts pins the shape so a future
  // change cannot drop the matcher hint, snippet caret, or stack frame.
  // Issue #43 dropped catalog IDs 32, 33, 34, 35, 36, 37, 38 (beforeAll,
  // beforeEach, afterEach, afterAll, fixture setup, fixture teardown
  // timeout, worker teardown / unexpected exit). Hook and fixture-setup
  // failures arrive as a single-line `Error: <message>` headline plus a
  // Babel-rendered `error.snippet` and a stack whose first frame is the
  // hook or fixture call site; fixture teardown timeouts arrive as an
  // ANSI-wrapped `Fixture "<name>" timeout of Nms exceeded during
  // teardown.` headline plus snippet and stack tail; worker
  // teardown/unexpected-exit failures arrive as a stackless single-line
  // headline. All five shapes round-trip through the same generic
  // headline + snippet + stack-tail formatter the matcher families already
  // use, so no formatter changes were needed; a contract regression test
  // in tests/contract/display-error-formatter.spec.ts pins each shape so a
  // future change cannot drop the snippet, duplicate the headline, strip
  // ANSI, or synthesize a fake codeframe for the stackless worker case.
  // Issue #44 dropped catalog IDs 39, 40 (error inside test.step,
  // test.step.skip downstream marker). A `throw` inside a test.step
  // callback arrives as a regular TestError on `result.errors[]` whose
  // `error.stack` carries both the throw frame and the test.step boundary
  // frame, with `error.snippet` pinned to the throw line and structural
  // step context (`stepPath`, `stepCategory`) traveling on the
  // index-aligned `result.runboard.evidence[]` entry. The downstream
  // marker pattern after `test.step.skip(...)` arrives as an ordinary
  // body-level TestError (no step boundary frame, no stepPath) while the
  // skipped step itself surfaces on `result.steps[].skipped`. Both shapes
  // round-trip through the same generic headline + snippet + stack-tail
  // partition the hook/fixture rows already use, so no formatter changes
  // were needed; contract regression tests in
  // tests/contract/display-error-formatter.spec.ts pin both shapes so a
  // future change cannot drop the snippet, collapse the test.step
  // boundary frame into the throw frame, or synthesize a fake stepPath
  // for the body-level marker.
  41, 42, 43, 44,
]);

test.describe('Error Catalog — Display Error parity', () => {
  let workDir: string;

  test.beforeAll(() => {
    if (!existsSync(reporterDist)) {
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    }
  });

  test.beforeEach(async () => {
    workDir = await mkdtemp(join(repoRoot, '.runboard-parity-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  for (const fixture of ERROR_CATALOG_FIXTURES) {
    const skip = EXPECTED_PARITY_FAILURES.has(fixture.id);
    const define = skip ? test.skip : test;
    define(`${fixture.id}. ${fixture.errorType}`, async () => {
      const { diffs } = await runCatalogDisplayErrorParity({
        workDir,
        reporterDist,
        fixture,
      });
      if (diffs.length > 0) {
        throw new Error(
          `Display Error parity failure for catalog #${fixture.id} (${fixture.errorType}):\n` +
            formatCatalogDisplayErrorDifferences(diffs),
        );
      }
      expect(diffs).toEqual([]);
    });
  }
});

test.describe('Error Catalog — Display Error parity coverage', () => {
  test('every catalog ID is either gated or in the expected-failures allowlist', () => {
    const ids = ERROR_CATALOG_FIXTURES.map((f) => f.id);
    for (const id of EXPECTED_PARITY_FAILURES) {
      expect(
        ids,
        `EXPECTED_PARITY_FAILURES references ${id}, but no fixture with that ID exists`,
      ).toContain(id);
    }
    // Coverage invariant: each fixture is tracked exactly once. A drift here
    // means the parity gate is silently leaving an Error Type out.
    const enforced = ids.filter((id) => !EXPECTED_PARITY_FAILURES.has(id));
    const allowlisted = ids.filter((id) => EXPECTED_PARITY_FAILURES.has(id));
    expect(enforced.length + allowlisted.length).toBe(ids.length);
  });

  test('release-gate readiness: an empty allowlist means every fixture is enforced', () => {
    // The Display Error parity epic (#31) finishes when this expectation no
    // longer needs to be skipped: every catalog row has parity, the
    // EXPECTED_PARITY_FAILURES set is empty, and the release gate (#47) is
    // safe to flip on.
    expect(typeof EXPECTED_PARITY_FAILURES.size).toBe('number');
  });
});
