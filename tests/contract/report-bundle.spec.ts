import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

  test('report.options is empty until reporter options are wired up', async () => {
    const reporter = new RunboardReporter({ outputFolder });
    const run = fakeRun({ rootDir: '/repo' });

    reporter.onBegin?.(run.config, run.rootSuite);
    await reporter.onEnd?.(fakeFullResult({ status: 'passed' }));

    const report = JSON.parse(await readFile(join(outputFolder, 'report.json'), 'utf8'));
    expect(report.options).toEqual({});
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
