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
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function toImportSpecifier(fromDir: string, toPath: string): string {
  const relativePath = relative(fromDir, toPath).split(sep).join('/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

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

async function buildAndPackTarball(destination: string, npmCacheDir: string): Promise<string> {
  await execFileAsync('npm', ['--cache', npmCacheDir, 'run', 'build'], { cwd: repoRoot });
  const { stdout } = await execFileAsync(
    'npm',
    [
      '--cache',
      npmCacheDir,
      'pack',
      '--ignore-scripts',
      '--silent',
      '--pack-destination',
      destination,
    ],
    { cwd: repoRoot },
  );
  const lines = stdout.trim().split('\n');
  const tarballName = lines[lines.length - 1] ?? '';
  return resolve(destination, tarballName);
}

async function installAndImport(
  tarball: string,
  npmCacheDir: string,
): Promise<{ stdout: string; stderr: string }> {
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
            '@babel/code-frame': `file:${resolve(repoRoot, 'node_modules/@babel/code-frame')}`,
            '@babel/helper-validator-identifier': `file:${resolve(
              repoRoot,
              'node_modules/@babel/helper-validator-identifier',
            )}`,
            'js-tokens': `file:${resolve(repoRoot, 'node_modules/js-tokens')}`,
            picocolors: `file:${resolve(repoRoot, 'node_modules/picocolors')}`,
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
      [
        '--cache',
        npmCacheDir,
        'install',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        '--no-package-lock',
        '--legacy-peer-deps',
      ],
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
    const npmCacheDir = join(stagingDir, 'npm-cache');
    try {
      const tarball = await buildAndPackTarball(stagingDir, npmCacheDir);
      const { stdout } = await installAndImport(tarball, npmCacheDir);
      expect(stdout, stdout).toContain('SMOKE_OK');
    } finally {
      await rm(stagingDir, { recursive: true, force: true });
    }
  });

  test('package root resolves from a separate project folder like a Playwright reporter path', async () => {
    await execFileAsync('npm', ['run', 'build'], { cwd: repoRoot });
    const consumerDir = await mkdtemp(join(tmpdir(), 'runboard-folder-consumer-'));
    try {
      const configPath = join(consumerDir, 'playwright.config.cjs');
      const smokePath = join(consumerDir, 'folder-smoke.mjs');
      const reporterSpecifier = toImportSpecifier(consumerDir, repoRoot);
      await writeFile(configPath, 'module.exports = {};\n');
      await writeFile(
        smokePath,
        `
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFromConsumerConfig = createRequire(${JSON.stringify(configPath)});
const resolved = requireFromConsumerConfig.resolve(${JSON.stringify(reporterSpecifier)});
const mod = await import(pathToFileURL(resolved).href);

if (typeof mod.default !== 'function') {
  console.error('default export was not a reporter constructor');
  process.exit(1);
}
if (mod.default !== mod.RunboardReporter) {
  console.error('default and named reporter exports diverged');
  process.exit(1);
}
console.log('FOLDER_SMOKE_OK');
`,
        'utf8',
      );
      const { stdout } = await execFileAsync(process.execPath, [smokePath], { cwd: consumerDir });
      expect(stdout, stdout).toContain('FOLDER_SMOKE_OK');
    } finally {
      await rm(consumerDir, { recursive: true, force: true });
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
