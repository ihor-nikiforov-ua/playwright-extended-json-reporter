import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { RUNBOARD_SCHEMA_VERSION } from '../../src/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');
const playwrightBin = resolve(repoRoot, 'node_modules', '.bin', 'playwright');

test.describe('RunboardReporter — Real Playwright Integration', () => {
  let workDir: string;

  test.beforeAll(() => {
    if (!existsSync(reporterDist)) {
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    }
  });

  test.beforeEach(async () => {
    workDir = await mkdtemp(join(repoRoot, '.runboard-int-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('emits report.json and <fileId>.json end-to-end through Playwright Test', async () => {
    const reportDir = join(workDir, 'runboard-bundle');
    const configPath = join(workDir, 'playwright.config.mjs');
    const specPath = join(workDir, 'sample.spec.ts');

    await writeFile(
      configPath,
      `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: ${JSON.stringify(workDir)},
  reporter: [[${JSON.stringify(reporterDist)}, { outputFolder: ${JSON.stringify(reportDir)} }]],
});
`,
      'utf8',
    );

    await writeFile(
      specPath,
      `import { expect, test } from '@playwright/test';
test('arithmetic stays sane', () => {
  expect(1 + 1).toBe(2);
});
`,
      'utf8',
    );

    execFileSync(playwrightBin, ['test', '--config', configPath], {
      cwd: repoRoot,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const report = JSON.parse(await readFile(join(reportDir, 'report.json'), 'utf8'));
    expect(report.runboard.schemaVersion).toBe(RUNBOARD_SCHEMA_VERSION);
    expect(report.runboard.playwrightVersion).toMatch(/^1\.\d+\.\d+/);
    expect(report.stats).toMatchObject({ total: 1, expected: 1, unexpected: 0, ok: true });
    expect(report.errors).toEqual([]);
    expect(report.files).toHaveLength(1);

    const [fileSummary] = report.files;
    expect(fileSummary.fileName).toBe('sample.spec.ts');
    const fileBundle = JSON.parse(
      await readFile(join(reportDir, `${fileSummary.fileId}.json`), 'utf8'),
    );
    expect(fileBundle.fileId).toBe(fileSummary.fileId);
    expect(fileBundle.fileName).toBe('sample.spec.ts');
  });
});
