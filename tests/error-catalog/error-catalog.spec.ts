/**
 * Error Catalog Suite — fixture coverage for all 45 Error Types.
 *
 * The Error Catalog at `docs/error-catalog/playwright-error-types.md` defines
 * 45 Playwright Error Types whose distinguishing evidence the Runboard
 * Reporter must preserve through Runboard Data Contract serialization. Each
 * fixture in `./fixtures.ts` declares a real Playwright spec source that
 * triggers the natural Error Type — never a hand-written `TestError` payload —
 * and runs through the published `dist/runboard-reporter.js` reporter via
 * `runCatalogSpec`. The suite then asserts the markdown's distinguishing
 * signals survive end-to-end into the emitted Runboard Data Bundle.
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
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { ERROR_CATALOG_FIXTURES, type ErrorCatalogFixture } from './fixtures.js';
import {
  type CatalogBundle,
  type CatalogResultView,
  readPrimaryResult,
  runCatalogSpec,
} from './run-catalog-spec.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');

function expectSignalsSurvive(view: CatalogResultView, fixture: ErrorCatalogFixture): void {
  const haystack = collectHaystack(view, fixture.evidenceLocation);
  for (const signal of fixture.distinguishingSignals) {
    const found = haystack.some((entry) => entry.includes(signal));
    expect(
      found,
      `Catalog #${fixture.id} (${fixture.errorType}): expected signal ${JSON.stringify(signal)} ` +
        `to survive in ${fixture.evidenceLocation} evidence. Got: ${JSON.stringify(haystack)}`,
    ).toBe(true);
  }
}

function collectHaystack(
  view: CatalogResultView,
  location: ErrorCatalogFixture['evidenceLocation'],
): string[] {
  const out: string[] = [];
  if (location === 'top-level') {
    out.push(...view.topLevelErrors);
    return out;
  }
  const errors = (view.result['errors'] as Array<{ message?: string; stack?: string }>) ?? [];
  for (const err of errors) {
    if (err?.message) out.push(err.message);
    if (err?.stack) out.push(err.stack);
  }
  const evidence =
    (view.result['runboard'] as { evidence?: Array<Record<string, unknown>> } | undefined)
      ?.evidence ?? [];
  for (const entry of evidence) {
    const message = entry['message'] as string | undefined;
    const stack = entry['stack'] as string | undefined;
    const value = entry['value'] as string | undefined;
    if (message) out.push(message);
    if (stack) out.push(stack);
    if (value) out.push(value);
  }
  return out;
}

function expectNoErrorTypeField(bundle: CatalogBundle): void {
  for (const file of bundle.files.values()) {
    const tests = (file['tests'] as Array<Record<string, unknown>>) ?? [];
    for (const testCase of tests) {
      const results = (testCase['results'] as Array<Record<string, unknown>>) ?? [];
      for (const result of results) {
        const evidence =
          (result['runboard'] as { evidence?: Array<Record<string, unknown>> } | undefined)
            ?.evidence ?? [];
        for (const entry of evidence) {
          expect(entry).not.toHaveProperty('errorType');
        }
      }
    }
  }
}

test.describe('Error Catalog Suite — all 45 Error Types preserve distinguishing evidence', () => {
  let workDir: string;

  test.beforeAll(() => {
    if (!existsSync(reporterDist)) {
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    }
  });

  test.beforeEach(async () => {
    // The inner Playwright config imports `@playwright/test`; placing the
    // work dir under the repo lets node module resolution walk up to the
    // installed dependency.
    workDir = await mkdtemp(join(repoRoot, '.runboard-catalog-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  for (const fixture of ERROR_CATALOG_FIXTURES) {
    test(`${fixture.id}. ${fixture.errorType}`, async () => {
      const bundle = await runCatalogSpec({
        workDir,
        reporterDist,
        spec: fixture.spec,
        ...(fixture.needsBrowser !== undefined ? { needsBrowser: fixture.needsBrowser } : {}),
        ...(fixture.extraConfigLines !== undefined
          ? { extraConfigLines: fixture.extraConfigLines }
          : {}),
      });
      const view = readPrimaryResult(bundle);
      expectSignalsSurvive(view, fixture);
      expectNoErrorTypeField(bundle);
      if (fixture.extraAssertion) {
        await fixture.extraAssertion({ bundle, view });
      }
    });
  }
});

interface CatalogRow {
  id: number;
  section: string;
  errorType: string;
  signalText: string;
}

function parseCatalogRows(markdown: string): CatalogRow[] {
  const rows: CatalogRow[] = [];
  // Match rows of form `| ID | Section | Error Type | Distinguishing Signal |`.
  // The signal column may contain backticks and additional pipe chars are not
  // expected because the markdown quotes them inside backticks.
  const rowPattern = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    const [, idText, section, errorType, signalText] = match;
    if (!idText || !section || !errorType || !signalText) continue;
    rows.push({
      id: Number.parseInt(idText, 10),
      section,
      errorType,
      signalText,
    });
  }
  return rows;
}

function stripBackticks(value: string): string {
  return value.replace(/`/g, '');
}

test.describe('Error Catalog Suite — coverage matches the 45 catalogued Error Types', () => {
  test('exactly 45 fixtures are declared, one per Error Type', () => {
    const ids = ERROR_CATALOG_FIXTURES.map((f) => f.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
  });

  test('every catalog markdown row pairs with a fixture sharing its ID, Error Type, and signal', async () => {
    const repoUrl = new URL('../../', import.meta.url);
    const catalog = await readFile(
      new URL('docs/error-catalog/playwright-error-types.md', repoUrl),
      'utf8',
    );
    const rows = parseCatalogRows(catalog);
    expect(
      rows.length,
      'Error Catalog markdown must enumerate exactly 45 rows under the | ID | Section | Error Type | Distinguishing Signal | table',
    ).toBe(45);

    const fixturesById = new Map(ERROR_CATALOG_FIXTURES.map((f) => [f.id, f]));
    for (const row of rows) {
      const fixture = fixturesById.get(row.id);
      expect(fixture, `catalog row #${row.id} has no paired fixture`).toBeDefined();
      if (!fixture) continue;
      // The markdown Error Type column wraps API names in backticks for
      // readability; the fixture declares the bare label so its `errorType`
      // matches the row identifier readers see in failure messages. Compare
      // after stripping the backticks so wording drift surfaces but markdown
      // syntax noise does not.
      expect(
        stripBackticks(fixture.errorType),
        `catalog row #${row.id} Error Type drift: markdown says ${JSON.stringify(
          row.errorType,
        )}, fixture says ${JSON.stringify(fixture.errorType)}`,
      ).toBe(stripBackticks(row.errorType));
      // The markdown signal column quotes substrings in backticks. Each
      // backtick-quoted token must appear verbatim in the fixture's
      // declared distinguishing signals so a row update forces a fixture
      // update (or vice-versa).
      const quotedTokens = Array.from(row.signalText.matchAll(/`([^`]+)`/g))
        .map((m) => m[1])
        .filter((t): t is string => typeof t === 'string' && t.length > 0);
      expect(
        quotedTokens.length,
        `catalog row #${row.id} signal column ${JSON.stringify(row.signalText)} ` +
          `must quote ≥1 substring in backticks`,
      ).toBeGreaterThan(0);
      const fixtureSignalsText = fixture.distinguishingSignals.join('|');
      const matched = quotedTokens.filter((token) =>
        stripBackticks(fixtureSignalsText).includes(token),
      );
      expect(
        matched.length,
        `catalog row #${row.id} (${row.errorType}): no markdown-quoted token from ` +
          `${JSON.stringify(quotedTokens)} appears in fixture signals ` +
          `${JSON.stringify(fixture.distinguishingSignals)}`,
      ).toBeGreaterThan(0);
    }
  });
});
