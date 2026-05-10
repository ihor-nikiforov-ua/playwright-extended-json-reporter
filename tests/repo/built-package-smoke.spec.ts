/**
 * Built package smoke check.
 *
 * The PRD requires a smoke check that exercises the published Runboard
 * Reporter Package the way a consumer would: build the package, pack it,
 * install the tarball into a fresh project, then import the built ESM
 * entrypoint by its package name. The check fails if package exports, ESM
 * output, or declaration/build wiring drift from what consumers see.
 *
 * The smoke check intentionally avoids importing source files. Source-level
 * export tests (`tests/contract/exports.spec.ts`) and declaration-surface
 * tests (`tests/contract/declaration-surface.spec.ts`) cover related ground
 * but cannot detect packaging-level regressions like a wrong `exports`
 * mapping, a missing `dist/` entry, or a broken `type: module` setup.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SMOKE_SCRIPT = `
import RunboardReporter, {
  RunboardReporter as NamedRunboardReporter,
  RUNBOARD_SCHEMA_VERSION,
} from 'playwright-runboard-reporter';

const checks = [];
function check(label, value) {
  checks.push({ label, value: value === true });
}

check('default export is a function', typeof RunboardReporter === 'function');
check('named export is a function', typeof NamedRunboardReporter === 'function');
check('default and named exports are identical', RunboardReporter === NamedRunboardReporter);
check('schema version is 1.1.0', RUNBOARD_SCHEMA_VERSION === '1.1.0');

const reporter = new RunboardReporter();
check('reporter implements onBegin', typeof reporter.onBegin === 'function');
check('reporter implements onEnd', typeof reporter.onEnd === 'function');
check('reporter implements onError', typeof reporter.onError === 'function');
check('reporter implements printsToStdio', typeof reporter.printsToStdio === 'function');

const failures = checks.filter((c) => !c.value);
if (failures.length > 0) {
  for (const failure of failures) console.error('FAIL: ' + failure.label);
  process.exit(1);
}
console.log('SMOKE_OK');
`;

async function buildAndPackTarball(destination: string): Promise<string> {
  await execFileAsync('npm', ['run', 'build'], { cwd: repoRoot });
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--silent', '--pack-destination', destination],
    { cwd: repoRoot },
  );
  const lines = stdout.trim().split('\n');
  const tarballName = lines[lines.length - 1] ?? '';
  return resolve(destination, tarballName);
}

async function installAndImport(tarball: string): Promise<{ stdout: string; stderr: string }> {
  const consumerDir = await mkdtemp(join(tmpdir(), 'runboard-smoke-consumer-'));
  try {
    await writeFile(
      join(consumerDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'runboard-smoke-consumer',
          version: '0.0.0',
          private: true,
          type: 'module',
          dependencies: {
            'playwright-runboard-reporter': `file:${tarball}`,
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(join(consumerDir, 'smoke.mjs'), SMOKE_SCRIPT);
    await execFileAsync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--no-package-lock'],
      { cwd: consumerDir },
    );
    return await execFileAsync(process.execPath, [join(consumerDir, 'smoke.mjs')], {
      cwd: consumerDir,
    });
  } finally {
    await rm(consumerDir, { recursive: true, force: true });
  }
}

test.describe('Built package smoke check', () => {
  test('packed tarball installs into a fresh project and exposes the public reporter exports', async () => {
    test.setTimeout(180_000);
    const stagingDir = await mkdtemp(join(tmpdir(), 'runboard-smoke-stage-'));
    try {
      const tarball = await buildAndPackTarball(stagingDir);
      const { stdout } = await installAndImport(tarball);
      expect(stdout, stdout).toContain('SMOKE_OK');
    } finally {
      await rm(stagingDir, { recursive: true, force: true });
    }
  });

  test('canonical verify gate runs Playwright tests, which include this smoke spec', async () => {
    const { default: pkg } = await import('../../package.json', {
      with: { type: 'json' },
    });
    expect(pkg.scripts?.verify, '`verify` must invoke `npm test` so the smoke spec runs').toContain(
      'npm test',
    );
    const playwrightConfig = await readFile(resolve(repoRoot, 'playwright.config.ts'), 'utf8');
    expect(
      playwrightConfig,
      'Playwright config must include `tests/` so this smoke spec is discovered',
    ).toMatch(/testDir:\s*['"]\.\/tests['"]/);
  });
});
