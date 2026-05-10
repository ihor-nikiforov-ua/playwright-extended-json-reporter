import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
} from '@playwright/test/reporter';
import {
  assertOutputFolderSafe,
  clearOutputFolder,
  collectForbiddenPaths,
  collectProjectArtifactDirs,
  detectOutputFolderOverlaps,
} from './cleanup.js';
import {
  RUNBOARD_SCHEMA_VERSION,
  type RunboardMachine,
  type RunboardMetadata,
  type RunboardReport,
  type RunboardReportOptions,
  type RunboardStats,
  type RunboardTestCase,
  type RunboardTestCaseSummary,
  type RunboardTestFile,
  type RunboardTestFileSummary,
} from './contract.js';
import {
  type NoOpCompatibilityOptionName,
  type RunboardReporterOptions,
  resolveRunboardOptions,
} from './options.js';
import { serializeTestCase, summarizeTestCase } from './serialize.js';

export type { RunboardReporterOptions } from './options.js';

const RUNBOARD_LOG_PREFIX = 'playwright-runboard-reporter:';

// Compatibility Adapter shape for Playwright merge-reports' per-shard hooks.
// `onReportConfigure` and `onReportEnd` are not part of the public Reporter
// interface; merge-reports' Multiplexer dispatches them through optional
// chaining, so any reporter that implements them (with these payloads) is
// invoked once per blob shard during a `merge-reports` replay. Match
// Playwright's HTML reporter usage of these hooks closely so the merged
// Runboard Data Bundle's `report.machines[]` carries the same shard
// metadata (tag, shardIndex, startTime, duration).
//
// These payload shapes are Playwright-internal, so each interface and the
// hooks that consume them are `@internal`: `stripInternal` removes them from
// `dist/runboard-reporter.d.ts` while preserving the runtime methods that
// Playwright's Multiplexer needs to invoke.
/** @internal */
interface MergeReportConfigureParams {
  reportPath: string;
  config: { tags?: string[]; shard?: { current: number; total: number } | null };
}

/** @internal */
interface MergeReportEndParams {
  reportPath: string;
  result: { startTime: Date; duration: number };
}

/**
 * Playwright reporter that emits a Runboard Data Bundle for the current
 * test run.
 *
 * Output defaults to `playwright-runboard-report/` and contains a
 * Playwright HTML Report Data shape without rendered HTML: `report.json`
 * for the Report Summary, one `<fileId>.json` per Test File Entry, and
 * copied Attachment Assets under `data/`. The bundle is intended for
 * ingestion by the Runboard or by any consumer that reads the documented
 * Runboard Data Contract.
 *
 * Wire it into Playwright through the `reporter:` array, either by package
 * name or by named import:
 *
 * ```ts
 * import { defineConfig } from '@playwright/test';
 *
 * export default defineConfig({
 *   reporter: [
 *     ['list'],
 *     ['playwright-runboard-reporter', { outputFolder: 'playwright-runboard-report' }],
 *   ],
 * });
 * ```
 *
 * Rendering, serving, or opening HTML, Previous Run storage, and reporter-
 * side Error Classification are intentionally out of scope; see the
 * Public Documentation Set under `docs/public/` for the full boundary list.
 */
export class RunboardReporter implements Reporter {
  private readonly outputFolder: string;
  private readonly attachmentsBaseURL: string;
  private readonly reportOptions: RunboardReportOptions;
  private readonly noOpOptionsToWarn: NoOpCompatibilityOptionName[];
  private playwrightVersion = '';
  private configMetadata: Record<string, unknown> = {};
  private projectNames: string[] = [];
  private rootDir = '';
  private rootSuite: Suite | null = null;
  private pendingConfig: FullConfig | null = null;
  private readonly testFiles = new Map<string, RunboardTestFile>();
  private readonly topLevelErrors: TestError[] = [];
  private readonly shardConfigs = new Map<
    string,
    { tags: string[]; shard: { current: number; total: number } | null }
  >();
  private readonly machines: RunboardMachine[] = [];

  // Declare v2 so Playwright's reporter dispatcher delivers the merge-reports
  // hooks (`onReportConfigure`, `onReportEnd`) directly. Without this,
  // Playwright wraps v1 reporters in `ReporterV2Wrapper`, which only proxies
  // `onConfigure`/`onBegin`/`onTestBegin`/...; the merge-reports hooks would
  // be silently dropped and `report.machines[]` would never populate.
  /** @internal */
  version(): 'v2' {
    return 'v2';
  }

  constructor(options: RunboardReporterOptions = {}) {
    const resolved = resolveRunboardOptions(options);
    this.outputFolder = resolved.outputFolder;
    this.attachmentsBaseURL = resolved.attachmentsBaseURL;
    this.reportOptions = resolved.reportOptions;
    this.noOpOptionsToWarn = [...resolved.noOpOptionsSupplied];
  }

  printsToStdio(): boolean {
    return false;
  }

  onError(error: TestError): void {
    this.topLevelErrors.push(error);
  }

  /** @internal */
  onReportConfigure(params: MergeReportConfigureParams): void {
    this.shardConfigs.set(params.reportPath, {
      tags: params.config.tags ?? [],
      shard: params.config.shard ?? null,
    });
  }

  /** @internal */
  onReportEnd(params: MergeReportEndParams): void {
    const config = this.shardConfigs.get(params.reportPath);
    if (!config) {
      return;
    }
    const machine: RunboardMachine = {
      tag: config.tags,
      startTime: params.result.startTime.getTime(),
      duration: params.result.duration,
    };
    if (config.shard) {
      machine.shardIndex = config.shard.current;
    }
    this.machines.push(machine);
  }

  onConfigure(config: FullConfig): void {
    this.pendingConfig = config;
  }

  // Public Playwright Reporter v2 onBegin — this is the only overload that
  // surfaces in `dist/runboard-reporter.d.ts`.
  onBegin(suite: Suite): void;
  // v1-style overload kept as a Compatibility Adapter for `ReporterV2Wrapper`
  // dispatch and for unit tests that pass `(config, suite)` directly. Marked
  // `@internal` so `stripInternal` excludes it from the public declaration
  // surface; the runtime behavior is preserved by the implementation below.
  /** @internal */
  onBegin(config: FullConfig, suite: Suite): void;
  onBegin(configOrSuite: FullConfig | Suite, maybeSuite?: Suite): void {
    let config: FullConfig;
    let suite: Suite;
    if (maybeSuite !== undefined) {
      // v1-style call: `onBegin(config, suite)`. The pending config from a
      // prior `onConfigure` is not consulted here; the explicit argument
      // always wins.
      config = configOrSuite as FullConfig;
      suite = maybeSuite;
    } else {
      // v2-style call: `onBegin(suite)`. Playwright dispatched `onConfigure`
      // first, so use the stashed config.
      if (!this.pendingConfig) {
        throw new Error('RunboardReporter: onBegin(suite) called before onConfigure(config)');
      }
      config = this.pendingConfig;
      suite = configOrSuite as Suite;
    }

    this.playwrightVersion = config.version;
    this.configMetadata = (config.metadata ?? {}) as Record<string, unknown>;
    this.projectNames = suite.suites.map((projectSuite) => projectSuite.project()?.name ?? '');
    this.rootDir = config.rootDir;
    this.rootSuite = suite;

    while (this.noOpOptionsToWarn.length > 0) {
      const name = this.noOpOptionsToWarn.shift();
      console.warn(
        `${RUNBOARD_LOG_PREFIX} '${name}' is a Playwright HTML reporter option and is ignored; this reporter emits a Runboard Data Bundle and does not render, serve, or open HTML.`,
      );
    }

    const forbidden = collectForbiddenPaths(config);
    assertOutputFolderSafe(this.outputFolder, forbidden);

    const projectArtifactDirs = collectProjectArtifactDirs(config);
    const overlaps = detectOutputFolderOverlaps(this.outputFolder, projectArtifactDirs);
    for (const overlap of overlaps) {
      console.warn(
        `${RUNBOARD_LOG_PREFIX} Output Folder '${resolve(this.outputFolder)}' overlaps with Playwright test artifact directory '${overlap}'.`,
      );
    }

    for (const projectSuite of suite.suites) {
      for (const fileSuite of projectSuite.suites) {
        const absolute = fileSuite.location?.file;
        if (!absolute) {
          continue;
        }
        const fileName = toPosixPath(relative(config.rootDir, absolute));
        const fileId = sha1(fileName).slice(0, 20);
        if (!this.testFiles.has(fileId)) {
          this.testFiles.set(fileId, { fileId, fileName, tests: [] });
        }
      }
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const outputFolder = resolve(this.outputFolder);
    await clearOutputFolder(outputFolder);

    const reporterVersion = await readReporterVersion();
    const runboard: RunboardMetadata = {
      schemaVersion: RUNBOARD_SCHEMA_VERSION,
      reporterVersion,
      playwrightVersion: this.playwrightVersion,
    };

    const fileStats = this.computeFileStats();
    const cases = this.collectTestCases();

    const fileSummaries: RunboardTestFileSummary[] = [];
    for (const file of this.testFiles.values()) {
      const fileCases = cases.get(file.fileId) ?? [];
      const fullEntry: RunboardTestFile = {
        fileId: file.fileId,
        fileName: file.fileName,
        tests: fileCases.map((entry) => entry.full),
      };
      await writeFile(join(outputFolder, `${file.fileId}.json`), JSON.stringify(fullEntry), 'utf8');
      fileSummaries.push({
        fileId: file.fileId,
        fileName: file.fileName,
        tests: fileCases.map((entry) => entry.summary),
        stats: fileStats.get(file.fileId) ?? emptyStats(),
      });
    }

    const aggregateStats = emptyStats();
    for (const stats of fileStats.values()) {
      addStats(aggregateStats, stats);
    }

    const report: RunboardReport = {
      runboard,
      metadata: this.configMetadata,
      startTime: result.startTime.getTime(),
      duration: result.duration,
      files: fileSummaries,
      projectNames: this.projectNames,
      stats: aggregateStats,
      errors: this.topLevelErrors.map(formatTopLevelError),
      options: this.reportOptions,
      machines: this.machines,
    };

    await writeFile(join(outputFolder, 'report.json'), JSON.stringify(report), 'utf8');
  }

  private collectTestCases(): Map<
    string,
    Array<{ summary: RunboardTestCaseSummary; full: RunboardTestCase }>
  > {
    const out = new Map<
      string,
      Array<{ summary: RunboardTestCaseSummary; full: RunboardTestCase }>
    >();
    if (!this.rootSuite) {
      return out;
    }
    for (const projectSuite of this.rootSuite.suites) {
      const projectName = projectSuite.project()?.name ?? '';
      for (const fileSuite of projectSuite.suites) {
        const absolute = fileSuite.location?.file;
        if (!absolute) {
          continue;
        }
        const fileName = toPosixPath(relative(this.rootDir, absolute));
        const fileId = sha1(fileName).slice(0, 20);
        let bucket = out.get(fileId);
        if (!bucket) {
          bucket = [];
          out.set(fileId, bucket);
        }
        for (const test of fileSuite.allTests()) {
          const ctx = {
            projectName,
            fileName,
            rootDir: this.rootDir,
            outputFolder: resolve(this.outputFolder),
            attachmentsBaseURL: this.attachmentsBaseURL,
            noSnippets: this.reportOptions.noSnippets ?? false,
          };
          bucket.push({
            summary: summarizeTestCase(test, ctx),
            full: serializeTestCase(test, ctx),
          });
        }
      }
    }
    return out;
  }

  private computeFileStats(): Map<string, RunboardStats> {
    const fileStats = new Map<string, RunboardStats>();
    if (!this.rootSuite) {
      return fileStats;
    }
    for (const projectSuite of this.rootSuite.suites) {
      for (const fileSuite of projectSuite.suites) {
        const absolute = fileSuite.location?.file;
        if (!absolute) {
          continue;
        }
        const fileName = toPosixPath(relative(this.rootDir, absolute));
        const fileId = sha1(fileName).slice(0, 20);
        let stats = fileStats.get(fileId);
        if (!stats) {
          stats = emptyStats();
          fileStats.set(fileId, stats);
        }
        for (const test of fileSuite.allTests()) {
          accumulateOutcome(stats, test);
        }
      }
    }
    for (const stats of fileStats.values()) {
      stats.ok = stats.unexpected + stats.flaky === 0;
    }
    return fileStats;
  }
}

export default RunboardReporter;

function toPosixPath(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/');
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

function emptyStats(): RunboardStats {
  return { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true };
}

function formatTopLevelError(error: TestError): string {
  return error.stack ?? error.message ?? error.value ?? '';
}

function accumulateOutcome(stats: RunboardStats, test: TestCase): void {
  stats.total += 1;
  switch (test.outcome()) {
    case 'expected':
      stats.expected += 1;
      break;
    case 'unexpected':
      stats.unexpected += 1;
      break;
    case 'flaky':
      stats.flaky += 1;
      break;
    case 'skipped':
      stats.skipped += 1;
      break;
  }
}

function addStats(target: RunboardStats, delta: RunboardStats): void {
  target.total += delta.total;
  target.expected += delta.expected;
  target.unexpected += delta.unexpected;
  target.flaky += delta.flaky;
  target.skipped += delta.skipped;
  target.ok = target.ok && delta.ok;
}

async function readReporterVersion(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgRaw = await readFile(join(here, '..', 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw) as { version: string };
  return pkg.version;
}
