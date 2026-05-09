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
});
