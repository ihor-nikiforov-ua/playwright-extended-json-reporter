import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter';
import {
  RUNBOARD_SCHEMA_VERSION,
  type RunboardMetadata,
  type RunboardReport,
  type RunboardStats,
  type RunboardTestFile,
  type RunboardTestFileSummary,
} from './contract.js';

export interface RunboardReporterOptions {
  outputFolder?: string;
}

const DEFAULT_OUTPUT_FOLDER = 'playwright-runboard-report';

export class RunboardReporter implements Reporter {
  private readonly outputFolder: string;
  private playwrightVersion = '';
  private configMetadata: Record<string, unknown> = {};
  private projectNames: string[] = [];
  private readonly testFiles = new Map<string, RunboardTestFile>();

  constructor(options: RunboardReporterOptions = {}) {
    this.outputFolder = options.outputFolder ?? DEFAULT_OUTPUT_FOLDER;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.playwrightVersion = config.version;
    this.configMetadata = (config.metadata ?? {}) as Record<string, unknown>;
    this.projectNames = suite.suites.map((projectSuite) => projectSuite.project()?.name ?? '');

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
    await mkdir(outputFolder, { recursive: true });

    const reporterVersion = await readReporterVersion();
    const runboard: RunboardMetadata = {
      schemaVersion: RUNBOARD_SCHEMA_VERSION,
      reporterVersion,
      playwrightVersion: this.playwrightVersion,
    };

    const fileSummaries: RunboardTestFileSummary[] = [];
    for (const file of this.testFiles.values()) {
      await writeFile(join(outputFolder, `${file.fileId}.json`), JSON.stringify(file), 'utf8');
      fileSummaries.push({
        fileId: file.fileId,
        fileName: file.fileName,
        tests: [],
        stats: emptyStats(),
      });
    }

    const report: RunboardReport = {
      runboard,
      metadata: this.configMetadata,
      startTime: result.startTime.getTime(),
      duration: result.duration,
      files: fileSummaries,
      projectNames: this.projectNames,
      stats: emptyStats(),
      errors: [],
      options: {},
      machines: [],
    };

    await writeFile(join(outputFolder, 'report.json'), JSON.stringify(report), 'utf8');
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

async function readReporterVersion(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgRaw = await readFile(join(here, '..', 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw) as { version: string };
  return pkg.version;
}
