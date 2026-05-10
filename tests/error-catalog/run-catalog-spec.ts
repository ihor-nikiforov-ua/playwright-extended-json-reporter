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
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

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
