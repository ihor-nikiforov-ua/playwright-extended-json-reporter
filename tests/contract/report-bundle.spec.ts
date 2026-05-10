import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { RUNBOARD_SCHEMA_VERSION, RunboardReporter } from '../../src/index.js';
import { fakeFullResult, fakeRun } from '../helpers/fake-playwright.js';

function expectedFileId(posixRelativeFileName: string): string {
  return createHash('sha1').update(posixRelativeFileName).digest('hex').slice(0, 20);
}

test.describe('RunboardReporter — Producer Contract', () => {
  let outputFolder: string;

  test.beforeEach(async () => {
    outputFolder = await mkdtemp(join(tmpdir(), 'runboard-test-'));
  });

  test.afterEach(async () => {
    await rm(outputFolder, { recursive: true, force: true });
  });

  test('writes report.json to outputFolder for an empty passing run', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const reportPath = join(outputFolder, 'report.json');
    const reportRaw = await readFile(reportPath, 'utf8');
    expect(reportRaw.length).toBeGreaterThan(0);
    expect(() => JSON.parse(reportRaw)).not.toThrow();
  });

  test('report.json embeds runboard schema, reporter, and Playwright versions', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo', playwrightVersion: '1.59.1' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.runboard.schemaVersion).toBe(RUNBOARD_SCHEMA_VERSION);
    expect(report.runboard.playwrightVersion).toBe('1.59.1');
    expect(report.runboard.reporterVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('writes one <fileId>.json per source test file with Playwright-compatible fileId', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/checkout.spec.ts',
          tests: [{ title: 'completes purchase' }],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const fileId = expectedFileId('tests/checkout.spec.ts');
    const fileEntry = JSON.parse(await readFile(join(outputFolder, `${fileId}.json`), 'utf8'));
    expect(fileEntry.fileId).toBe(fileId);
    expect(fileEntry.fileName).toBe('tests/checkout.spec.ts');

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(Array.isArray(report.files)).toBe(true);
    expect(report.files).toHaveLength(1);
    expect(report.files[0].fileId).toBe(fileId);
    expect(report.files[0].fileName).toBe('tests/checkout.spec.ts');
  });

  test('non-merged run emits empty report.machines array', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.machines).toEqual([]);
  });

  test('merge-reports onReportConfigure/onReportEnd hooks populate report.machines per shard', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });
    reporter.onBegin?.(run.config, run.rootSuite);

    type MergeAdapter = {
      onReportConfigure?: (params: {
        reportPath: string;
        config: { tags: string[]; shard: null | { current: number; total: number } };
      }) => void;
      onReportEnd?: (params: {
        reportPath: string;
        result: { startTime: Date; duration: number };
      }) => void;
    };
    const adapter = reporter as unknown as MergeAdapter;
    expect(typeof adapter.onReportConfigure).toBe('function');
    expect(typeof adapter.onReportEnd).toBe('function');

    adapter.onReportConfigure?.({
      reportPath: '/tmp/blob/report-1.zip',
      config: { tags: ['linux'], shard: { current: 1, total: 2 } },
    });
    adapter.onReportEnd?.({
      reportPath: '/tmp/blob/report-1.zip',
      result: { startTime: new Date(1000), duration: 250 },
    });
    adapter.onReportConfigure?.({
      reportPath: '/tmp/blob/report-2.zip',
      config: { tags: ['windows'], shard: { current: 2, total: 2 } },
    });
    adapter.onReportEnd?.({
      reportPath: '/tmp/blob/report-2.zip',
      result: { startTime: new Date(2000), duration: 400 },
    });

    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.machines).toEqual([
      { tag: ['linux'], startTime: 1000, duration: 250, shardIndex: 1 },
      { tag: ['windows'], startTime: 2000, duration: 400, shardIndex: 2 },
    ]);
  });

  test('merge-reports machines omit shardIndex when blob has no shard config', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });
    reporter.onBegin?.(run.config, run.rootSuite);

    type MergeAdapter = {
      onReportConfigure?: (params: {
        reportPath: string;
        config: { tags: string[]; shard: null | { current: number; total: number } };
      }) => void;
      onReportEnd?: (params: {
        reportPath: string;
        result: { startTime: Date; duration: number };
      }) => void;
    };
    const adapter = reporter as unknown as MergeAdapter;
    adapter.onReportConfigure?.({
      reportPath: '/tmp/blob/only.zip',
      config: { tags: [], shard: null },
    });
    adapter.onReportEnd?.({
      reportPath: '/tmp/blob/only.zip',
      result: { startTime: new Date(500), duration: 75 },
    });

    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.machines).toEqual([{ tag: [], startTime: 500, duration: 75 }]);
  });

  test('merge-reports onReportEnd without matching onReportConfigure does not emit a machine', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });
    reporter.onBegin?.(run.config, run.rootSuite);

    type MergeAdapter = {
      onReportEnd?: (params: {
        reportPath: string;
        result: { startTime: Date; duration: number };
      }) => void;
    };
    const adapter = reporter as unknown as MergeAdapter;
    adapter.onReportEnd?.({
      reportPath: '/tmp/blob/orphan.zip',
      result: { startTime: new Date(1), duration: 1 },
    });

    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.machines).toEqual([]);
  });

  test('report.options is empty when no display options are provided', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.options).toEqual({});
  });

  test('serializes title, noCopyPrompt, and noSnippets into report.options', async () => {
    const reporter = new RunboardReporter({
      outputFolder,
      title: 'Nightly Smoke',
      noCopyPrompt: true,
      noSnippets: true,
    });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.options).toEqual({
      title: 'Nightly Smoke',
      noCopyPrompt: true,
      noSnippets: true,
    });
  });

  test('omits unset display options from report.options instead of writing undefined', async () => {
    const reporter = new RunboardReporter({ outputFolder, title: 'Only Title' });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.options).toEqual({ title: 'Only Title' });
    expect(report.options).not.toHaveProperty('noCopyPrompt');
    expect(report.options).not.toHaveProperty('noSnippets');
  });

  test('does not include attachmentsBaseURL in report.options', async () => {
    const reporter = new RunboardReporter({
      outputFolder,
      title: 'with attachments base',
      attachmentsBaseURL: 'https://cdn.example/runboard/',
    });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.options).not.toHaveProperty('attachmentsBaseURL');
    expect(report.options).toEqual({ title: 'with attachments base' });
  });

  test('does not include no-op compatibility options in report.options', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const reporter = new RunboardReporter({
        outputFolder,
        title: 'no-op only',
        open: 'always',
        host: '127.0.0.1',
        port: 9323,
        doNotInlineAssets: true,
      });
      const run = fakeRun({ rootDir: '/repo' });

      reporter.onBegin?.(run.config, run.rootSuite);
      await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

      const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
      expect(report.options).toEqual({ title: 'no-op only' });
      expect(report.options).not.toHaveProperty('open');
      expect(report.options).not.toHaveProperty('host');
      expect(report.options).not.toHaveProperty('port');
      expect(report.options).not.toHaveProperty('doNotInlineAssets');
    } finally {
      console.warn = warn;
    }
  });

  test('warns once via console.warn for each supplied no-op compatibility option during onBegin', async () => {
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
    try {
      const reporter = new RunboardReporter({
        outputFolder,
        open: 'always',
        host: '127.0.0.1',
        port: 9323,
        doNotInlineAssets: true,
      });
      const run = fakeRun({ rootDir: '/repo' });

      reporter.onBegin?.(run.config, run.rootSuite);
      await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

      expect(warnCalls).toHaveLength(4);
      const messages = warnCalls.map((args) => String(args[0]));
      for (const message of messages) {
        expect(message).toMatch(/^playwright-runboard-reporter:/);
      }
      expect(messages.some((m) => m.includes("'open'"))).toBe(true);
      expect(messages.some((m) => m.includes("'host'"))).toBe(true);
      expect(messages.some((m) => m.includes("'port'"))).toBe(true);
      expect(messages.some((m) => m.includes("'doNotInlineAssets'"))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('does not warn when no no-op compatibility option is supplied', async () => {
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
    try {
      const reporter = new RunboardReporter({ outputFolder, title: 'silent run' });
      const run = fakeRun({ rootDir: '/repo' });

      reporter.onBegin?.(run.config, run.rootSuite);
      await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

      expect(warnCalls).toEqual([]);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('warns at most once per supplied no-op option even if onBegin runs multiple times', async () => {
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
    try {
      const reporter = new RunboardReporter({ outputFolder, open: 'always', port: 9323 });
      const run = fakeRun({ rootDir: '/repo' });

      reporter.onBegin?.(run.config, run.rootSuite);
      reporter.onBegin?.(run.config, run.rootSuite);
      await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

      expect(warnCalls).toHaveLength(2);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('honors PLAYWRIGHT_RUNBOARD_OUTPUT_DIR when no outputFolder option is provided', async () => {
    const original = process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'];
    process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'] = outputFolder;
    try {
      const reporter = new RunboardReporter();
      const run = fakeRun({ rootDir: '/repo' });

      reporter.onBegin?.(run.config, run.rootSuite);
      await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

      const reportRaw = await readFile(join(outputFolder, 'report.json'), 'utf8');
      expect(() => JSON.parse(reportRaw)).not.toThrow();
    } finally {
      if (original === undefined) {
        delete process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'];
      } else {
        process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'] = original;
      }
    }
  });

  test('computes report and per-file stats from outcomes (passed, unexpected, skipped, flaky)', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/passing.spec.ts',
          tests: [
            { title: 'green 1', outcome: 'expected' },
            { title: 'green 2', outcome: 'expected' },
          ],
        },
        {
          fileName: '/repo/tests/mixed.spec.ts',
          tests: [
            { title: 'red', outcome: 'unexpected' },
            { title: 'flake', outcome: 'flaky' },
            { title: 'noop', outcome: 'skipped' },
          ],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.stats).toEqual({
      total: 5,
      expected: 2,
      unexpected: 1,
      flaky: 1,
      skipped: 1,
      ok: false,
    });

    const passingFile = report.files.find(
      (f: { fileName: string }) => f.fileName === 'tests/passing.spec.ts',
    );
    const mixedFile = report.files.find(
      (f: { fileName: string }) => f.fileName === 'tests/mixed.spec.ts',
    );
    expect(passingFile.stats).toEqual({
      total: 2,
      expected: 2,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
      ok: true,
    });
    expect(mixedFile.stats).toEqual({
      total: 3,
      expected: 0,
      unexpected: 1,
      flaky: 1,
      skipped: 1,
      ok: false,
    });
  });

  test('serializes top-level Playwright errors via onError into report.errors', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    reporter.onError?.({
      message: 'global setup failed',
      stack: 'Error: global setup failed\n    at globalSetup.ts:3:9',
    });
    reporter.onError?.({ message: 'worker exited unexpectedly' });
    await reporter.onEnd?.(fakeFullResult({ status: 'failed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0]).toContain('global setup failed');
    expect(report.errors[1]).toContain('worker exited unexpectedly');
  });

  test('all-passing run reports stats.ok = true', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({
      rootDir: '/repo',
      files: [
        {
          fileName: '/repo/tests/all-green.spec.ts',
          tests: [{ title: 't1' }, { title: 't2' }],
        },
      ],
    });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.stats).toEqual({
      total: 2,
      expected: 2,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
      ok: true,
    });
  });

  test('clears stale files inside the resolved Output Folder before writing the current run', async () => {
    const stalePath = join(outputFolder, 'stale.json');
    await writeFile(stalePath, '"stale"', 'utf8');

    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    await expect(readFile(stalePath, 'utf8')).rejects.toThrow();
    await expect(readFile(join(outputFolder, 'report.json'), 'utf8')).resolves.toBeDefined();
  });

  test('refuses to clear when Output Folder equals config.rootDir', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'guard-rootdir-'));
    try {
      const reporter = new RunboardReporter({ outputFolder: fixture });
      const run = fakeRun({ rootDir: fixture });

      expect(() => reporter.onBegin?.(run.config, run.rootSuite)).toThrow(/refuses to clear/);

      const stillThere = await stat(fixture);
      expect(stillThere.isDirectory()).toBe(true);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test('refuses to clear when Output Folder equals dirname(config.configFile)', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'guard-configdir-'));
    const rootDir = await mkdtemp(join(tmpdir(), 'guard-rootdir-'));
    try {
      const configFile = join(configDir, 'playwright.config.ts');
      await writeFile(configFile, 'export default {};', 'utf8');
      const reporter = new RunboardReporter({ outputFolder: configDir });
      const run = fakeRun({ rootDir, configFile });

      expect(() => reporter.onBegin?.(run.config, run.rootSuite)).toThrow(/refuses to clear/);
    } finally {
      await rm(configDir, { recursive: true, force: true });
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test('refuses to clear when Output Folder equals a project testDir', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'guard-testdir-'));
    const projectTestDir = join(fixture, 'tests');
    try {
      const reporter = new RunboardReporter({ outputFolder: projectTestDir });
      const run = fakeRun({
        rootDir: fixture,
        projects: [{ name: 'chromium', testDir: projectTestDir, outputDir: join(fixture, 'out') }],
      });

      expect(() => reporter.onBegin?.(run.config, run.rootSuite)).toThrow(/refuses to clear/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test('refuses to clear when Output Folder equals a project outputDir', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'guard-outputdir-'));
    const projectOutputDir = join(fixture, 'project-output');
    try {
      const reporter = new RunboardReporter({ outputFolder: projectOutputDir });
      const run = fakeRun({
        rootDir: fixture,
        projects: [{ name: 'chromium', testDir: fixture, outputDir: projectOutputDir }],
      });

      expect(() => reporter.onBegin?.(run.config, run.rootSuite)).toThrow(/refuses to clear/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test('warns when Output Folder is nested inside a project outputDir', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'overlap-outputdir-'));
    const projectOutputDir = join(fixture, 'test-results');
    const nested = join(projectOutputDir, 'runboard');
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
    try {
      const reporter = new RunboardReporter({ outputFolder: nested });
      const run = fakeRun({
        rootDir: fixture,
        projects: [{ name: 'chromium', testDir: fixture, outputDir: projectOutputDir }],
      });

      reporter.onBegin?.(run.config, run.rootSuite);
      await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

      const overlapWarnings = warnCalls
        .map((args) => String(args[0]))
        .filter((m) => m.includes('overlap'));
      expect(overlapWarnings.length).toBeGreaterThan(0);
      expect(overlapWarnings[0]).toMatch(/^playwright-runboard-reporter:/);
    } finally {
      console.warn = originalWarn;
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test('options.outputFolder wins over PLAYWRIGHT_RUNBOARD_OUTPUT_DIR', async () => {
    const original = process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'];
    const envFolder = await mkdtemp(join(tmpdir(), 'runboard-env-'));
    process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'] = envFolder;
    try {
      const reporter = new RunboardReporter({ outputFolder });
      const run = fakeRun({ rootDir: '/repo' });

      reporter.onBegin?.(run.config, run.rootSuite);
      await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

      await expect(readFile(join(outputFolder, 'report.json'), 'utf8')).resolves.toBeDefined();
      await expect(readFile(join(envFolder, 'report.json'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(envFolder, { recursive: true, force: true });
      if (original === undefined) {
        delete process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'];
      } else {
        process.env['PLAYWRIGHT_RUNBOARD_OUTPUT_DIR'] = original;
      }
    }
  });
});
