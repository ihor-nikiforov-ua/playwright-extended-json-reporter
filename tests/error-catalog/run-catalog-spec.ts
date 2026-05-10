/**
 * Error Catalog runner: drives a single real Playwright invocation and returns
 * the resulting Runboard Data Bundle for catalog assertions.
 *
 * The Compatibility Fixture Harness (`tests/harness/compatibility-fixture.ts`)
 * runs both reporters side-by-side to compare contract paths. Catalog cases do
 * not need that comparison; they only need to prove a real Playwright run
 * surfaces each Error Type's distinguishing evidence into the Runboard bundle.
 * This helper writes one fixture spec, executes Playwright with the published
 * `dist/runboard-reporter.js` reporter, and parses `report.json` plus the
 * per-file shards. A `chromium` project is wired in only for fixtures that need
 * a real browser, so non-browser cases keep their startup overhead minimal.
 *
 * `runCatalogDisplayErrorParity` adds the Display Error parity comparator on
 * top of the harness: it runs one fixture through both the Runboard Reporter
 * and Playwright's official HTML reporter, then narrows the diff stream to
 * `result.errors[]` and labels each entry with the catalog row metadata.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type CatalogDisplayErrorDifference,
  type CompatibilityRun,
  compareCatalogDisplayErrors,
  runCompatibilityFixture,
} from '../harness/compatibility-fixture.js';
import type { ErrorCatalogFixture } from './fixtures.js';

export interface CatalogSpecOptions {
  /** Disposable temp directory the helper owns. The caller cleans it up. */
  workDir: string;
  /** Built `dist/runboard-reporter.js` path for the inner Playwright config. */
  reporterDist: string;
  /** Single fixture spec source written under `<workDir>/specs/fixture.spec.ts`. */
  spec: string;
  /** Wires a chromium project into the inner Playwright config when true. */
  needsBrowser?: boolean;
  /**
   * Top-level config keys appended to the inner `defineConfig({...})` body.
   * Used to set fixture-specific options like `globalTimeout` or `timeout`
   * without baking them into the spec source.
   */
  extraConfigLines?: readonly string[];
}

export interface CatalogBundle {
  report: Record<string, unknown>;
  files: Map<string, Record<string, unknown>>;
}

export async function runCatalogSpec(options: CatalogSpecOptions): Promise<CatalogBundle> {
  const { workDir, reporterDist, spec, needsBrowser = false, extraConfigLines = [] } = options;
  const specsDir = join(workDir, 'specs');
  const outputDir = join(workDir, 'runboard-bundle');
  const configPath = join(workDir, 'playwright.config.mjs');
  await mkdir(specsDir, { recursive: true });
  await writeFile(join(specsDir, 'fixture.spec.ts'), spec, 'utf8');

  const reporterOptions = JSON.stringify({ outputFolder: outputDir, noSnippets: true });
  const browserImports = needsBrowser
    ? `import { defineConfig, devices } from '@playwright/test';`
    : `import { defineConfig } from '@playwright/test';`;
  const projectsLine = needsBrowser
    ? `  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],`
    : '';
  const configSource = [
    browserImports,
    `export default defineConfig({`,
    `  testDir: ${JSON.stringify(specsDir)},`,
    `  fullyParallel: false,`,
    `  workers: 1,`,
    ...extraConfigLines.map((line) => `  ${line}`),
    `  reporter: [[${JSON.stringify(reporterDist)}, ${reporterOptions}]],`,
    projectsLine,
    `});`,
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
  await writeFile(configPath, configSource, 'utf8');

  const pkgRoot = resolve(dirname(reporterDist), '..');
  const playwrightBin = join(pkgRoot, 'node_modules', '.bin', 'playwright');
  const childEnv: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };
  // The reporter resolves its options through `option ?? env ?? default`, so
  // env keys with empty strings would still outrank the explicit options.
  // Drop them entirely instead of setting them to '' so the in-config options
  // win for catalog runs.
  for (const key of [
    'PLAYWRIGHT_RUNBOARD_OUTPUT_DIR',
    'PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL',
    'PLAYWRIGHT_HTML_OUTPUT_DIR',
    'PLAYWRIGHT_HTML_REPORT',
    'PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL',
  ]) {
    delete childEnv[key];
  }

  try {
    execFileSync(playwrightBin, ['test', '--config', configPath], {
      cwd: pkgRoot,
      stdio: 'pipe',
      env: childEnv,
    });
  } catch {
    // Catalog fixtures intentionally fail; ignore the non-zero exit so the
    // bundle still gets parsed below.
  }

  const report = JSON.parse(await readFile(join(outputDir, 'report.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const files = new Map<string, Record<string, unknown>>();
  for (const entry of await readdir(outputDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = /^([0-9a-f]+)\.json$/.exec(entry.name);
    if (!match?.[1]) continue;
    files.set(
      match[1],
      JSON.parse(await readFile(join(outputDir, entry.name), 'utf8')) as Record<string, unknown>,
    );
  }
  return { report, files };
}

export interface CatalogResultView {
  result: Record<string, unknown>;
  topLevelErrors: string[];
}

export interface RunCatalogDisplayErrorParityOptions {
  /**
   * Disposable temp directory the helper owns. The harness writes the
   * Playwright config, spec files, and both reporter outputs underneath it.
   */
  workDir: string;
  /** Built `dist/runboard-reporter.js` path. */
  reporterDist: string;
  /** Catalog fixture (id, error type, spec source, browser hint, …). */
  fixture: ErrorCatalogFixture;
}

export interface CatalogDisplayErrorParityResult {
  run: CompatibilityRun;
  diffs: CatalogDisplayErrorDifference[];
}

/**
 * Runs one Error Catalog fixture through both the Runboard Reporter and
 * Playwright's official HTML reporter, then returns the focused Display Error
 * comparator output. Each diff is enriched with the fixture's catalog ID and
 * Error Type label so failure messages quote the row to act on.
 *
 * To exercise a single catalog ID locally without scripting:
 * ```sh
 * npx playwright test --config=playwright.catalog.config.ts \
 *   --grep "Display Error parity.*45\\. test\\.fail"
 * ```
 * Playwright's `--grep` matches against the full test path, so include enough
 * of the suite name and Error Type label to disambiguate short numeric IDs.
 */
export async function runCatalogDisplayErrorParity(
  options: RunCatalogDisplayErrorParityOptions,
): Promise<CatalogDisplayErrorParityResult> {
  const { workDir, reporterDist, fixture } = options;
  const run = await runCompatibilityFixture({
    workDir,
    reporterDist,
    specs: { 'fixture.spec.ts': fixture.spec },
    expectFailingSuite: true,
    ...(fixture.needsBrowser !== undefined ? { needsBrowser: fixture.needsBrowser } : {}),
    ...(fixture.extraConfigLines !== undefined
      ? { extraConfigLines: fixture.extraConfigLines }
      : {}),
  });
  const diffs = compareCatalogDisplayErrors(run, {
    catalogId: fixture.id,
    errorType: fixture.errorType,
  });
  return { run, diffs };
}

/**
 * Returns the first test result from the bundle plus the top-level
 * `report.errors[]` list. Catalog fixtures are single-test-per-spec, so the
 * first result is always the relevant one.
 */
export function readPrimaryResult(bundle: CatalogBundle): CatalogResultView {
  // The Runboard Reporter serializes top-level errors as strings (stack ??
  // message ?? value); they are not TestError objects on the wire.
  const reportErrors = (bundle.report['errors'] as string[] | undefined) ?? [];
  for (const file of bundle.files.values()) {
    const tests = (file['tests'] as Array<Record<string, unknown>>) ?? [];
    for (const testCase of tests) {
      const results = (testCase['results'] as Array<Record<string, unknown>>) ?? [];
      const [primary] = results;
      if (primary) return { result: primary, topLevelErrors: reportErrors };
    }
  }
  return { result: {}, topLevelErrors: reportErrors };
}
