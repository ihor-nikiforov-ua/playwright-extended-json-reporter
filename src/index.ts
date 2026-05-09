import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

export interface ExtendedJsonReporterOptions {
  outputFile?: string;
  pretty?: boolean | number;
  includeAttachments?: boolean;
  includeStdIO?: boolean;
}

export interface ExtendedJsonReport {
  status: FullResult['status'];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  total: number;
  stats: {
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    interrupted: number;
  };
  tests: ExtendedJsonTestResult[];
}

export interface ExtendedJsonTestResult {
  id: string;
  title: string;
  titlePath: string[];
  projectName: string;
  file: string;
  line: number;
  column: number;
  expectedStatus: TestCase['expectedStatus'];
  outcome: ReturnType<TestCase['outcome']>;
  annotations: TestCase['annotations'];
  tags: string[];
  status: TestResult['status'];
  retry: number;
  durationMs: number;
  workerIndex: number;
  parallelIndex: number;
  startedAt: string;
  errors: SerializedTestError[];
  stdout?: string[];
  stderr?: string[];
  attachments?: SerializedAttachment[];
}

export interface SerializedTestError {
  message?: string;
  stack?: string;
  value?: string;
}

export interface SerializedAttachment {
  name: string;
  contentType: string;
  path?: string;
  bodyBase64?: string;
}

const DEFAULT_OUTPUT_FILE = 'playwright-extended-report.json';

export default class ExtendedJsonReporter implements Reporter {
  private readonly options: Required<ExtendedJsonReporterOptions>;
  private startedAt = new Date();
  private total = 0;
  private readonly tests: ExtendedJsonTestResult[] = [];

  constructor(options: ExtendedJsonReporterOptions = {}) {
    this.options = {
      outputFile: options.outputFile ?? DEFAULT_OUTPUT_FILE,
      pretty: options.pretty ?? true,
      includeAttachments: options.includeAttachments ?? true,
      includeStdIO: options.includeStdIO ?? true,
    };
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startedAt = new Date();
    this.total = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.tests.push({
      id: test.id,
      title: test.title,
      titlePath: test.titlePath(),
      projectName: test.parent.project()?.name ?? '',
      file: test.location.file,
      line: test.location.line,
      column: test.location.column,
      expectedStatus: test.expectedStatus,
      outcome: test.outcome(),
      annotations: test.annotations,
      tags: test.tags,
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex,
      startedAt: result.startTime.toISOString(),
      errors: result.errors.map(serializeError),
      ...(this.options.includeStdIO
        ? {
            stdout: result.stdout.map(serializeOutput),
            stderr: result.stderr.map(serializeOutput),
          }
        : {}),
      ...(this.options.includeAttachments
        ? {
            attachments: result.attachments.map(serializeAttachment),
          }
        : {}),
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const endedAt = new Date();
    const report: ExtendedJsonReport = {
      status: result.status,
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      total: this.total,
      stats: summarize(this.tests),
      tests: this.tests,
    };

    const outputFile = resolve(this.options.outputFile);
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(report, null, jsonSpacing(this.options.pretty))}\n`, 'utf8');
  }
}

function serializeError(error: TestError): SerializedTestError {
  const serialized: SerializedTestError = {};

  if (error.message !== undefined) {
    serialized.message = error.message;
  }

  if (error.stack !== undefined) {
    serialized.stack = error.stack;
  }

  if (error.value !== undefined) {
    serialized.value = error.value;
  }

  return serialized;
}

function serializeAttachment(attachment: TestResult['attachments'][number]): SerializedAttachment {
  const serialized: SerializedAttachment = {
    name: attachment.name,
    contentType: attachment.contentType,
  };

  if (attachment.path !== undefined) {
    serialized.path = attachment.path;
  }

  if (attachment.body !== undefined) {
    serialized.bodyBase64 = Buffer.from(attachment.body).toString('base64');
  }

  return serialized;
}

function serializeOutput(output: string | Buffer): string {
  return typeof output === 'string' ? output : output.toString('utf8');
}

function summarize(tests: ExtendedJsonTestResult[]): ExtendedJsonReport['stats'] {
  return tests.reduce(
    (stats, test) => {
      stats[test.status] += 1;
      return stats;
    },
    {
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      interrupted: 0,
    },
  );
}

function jsonSpacing(pretty: boolean | number): number | undefined {
  if (typeof pretty === 'number') {
    return pretty;
  }

  return pretty ? 2 : undefined;
}
