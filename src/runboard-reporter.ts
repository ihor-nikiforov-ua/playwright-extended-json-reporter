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
  type RunboardMetadata,
  type RunboardReport,
  type RunboardReportOptions,
  type RunboardStats,
  type RunboardTestFile,
  type RunboardTestFileSummary,
} from './contract.js';
import {
  type NoOpCompatibilityOptionName,
  type RunboardReporterOptions,
  resolveRunboardOptions,
} from './options.js';

export type { RunboardReporterOptions } from './options.js';

const RUNBOARD_LOG_PREFIX = 'playwright-runboard-reporter:';

export class RunboardReporter implements Reporter {
  private readonly outputFolder: string;
  private readonly reportOptions: RunboardReportOptions;
  private readonly noOpOptionsToWarn: NoOpCompatibilityOptionName[];
  private playwrightVersion = '';
  private configMetadata: Record<string, unknown> = {};
  private projectNames: string[] = [];
  private rootDir = '';
  private rootSuite: Suite | null = null;
  private readonly testFiles = new Map<string, RunboardTestFile>();
  private readonly topLevelErrors: TestError[] = [];

  constructor(options: RunboardReporterOptions = {}) {
    const resolved = resolveRunboardOptions(options);
    this.outputFolder = resolved.outputFolder;
    this.reportOptions = resolved.reportOptions;
    this.noOpOptionsToWarn = [...resolved.noOpOptionsSupplied];
  }

  printsToStdio(): boolean {
    return false;
  }

  onError(error: TestError): void {
    this.topLevelErrors.push(error);
  }

  onBegin(config: FullConfig, suite: Suite): void {
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

    const fileSummaries: RunboardTestFileSummary[] = [];
    for (const file of this.testFiles.values()) {
      await writeFile(join(outputFolder, `${file.fileId}.json`), JSON.stringify(file), 'utf8');
      fileSummaries.push({
        fileId: file.fileId,
        fileName: file.fileName,
        tests: [],
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
      machines: [],
    };

    await writeFile(join(outputFolder, 'report.json'), JSON.stringify(report), 'utf8');
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
