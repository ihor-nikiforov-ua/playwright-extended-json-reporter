import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface PackEntry {
  path: string;
  size: number;
}

interface PackOutput {
  files: PackEntry[];
  name: string;
  version: string;
}

async function runNpmPackDryRun(npmCacheDir: string): Promise<PackOutput[]> {
  // `npm run build` is wired into `pack:verify`; the verify gate runs that
  // beforehand. Tests still need fresh dist output to assert that runtime
  // files are present, so build explicitly here too.
  await execFileAsync('npm', ['--cache', npmCacheDir, 'run', 'build'], { cwd: repoRoot });
  const { stdout } = await execFileAsync(
    'npm',
    ['--cache', npmCacheDir, 'pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: repoRoot },
  );
  return JSON.parse(stdout) as PackOutput[];
}

test.describe('Published package contents', () => {
  let npmCacheDir: string;
  let packed: PackOutput;

  test.beforeAll(async () => {
    npmCacheDir = await mkdtemp(join(tmpdir(), 'runboard-npm-cache-'));
    const [first] = await runNpmPackDryRun(npmCacheDir);
    if (!first) throw new Error('npm pack --dry-run produced no entries');
    packed = first;
  });

  test.afterAll(async () => {
    await rm(npmCacheDir, { recursive: true, force: true });
  });

  test('publishes README and the built dist runtime', () => {
    const paths = packed.files.map((f) => f.path);
    expect(paths).toContain('README.md');
    expect(paths).toContain('package.json');
    expect(paths).toContain('dist/index.js');
    expect(paths).toContain('dist/index.d.ts');
    expect(paths).toContain('dist/runboard-reporter.js');
    expect(paths).toContain('dist/runboard-reporter.d.ts');
  });

  test('does not publish any Reporter Fixture Suite files', () => {
    const internalPathPatterns: ReadonlyArray<{ label: string; pattern: RegExp }> = [
      { label: 'tests/ directory', pattern: /^tests\// },
      { label: 'fixture spec files', pattern: /\.spec\.ts$/ },
      { label: 'tests harness directory', pattern: /^tests\/harness\// },
      { label: 'tests helpers directory', pattern: /^tests\/helpers\// },
      { label: 'error-catalog suite directory', pattern: /^tests\/error-catalog\// },
      { label: 'compatibility suite directory', pattern: /^tests\/compatibility\// },
      { label: 'compiled fixture suite under dist', pattern: /^dist\/tests\// },
    ];
    for (const { label, pattern } of internalPathPatterns) {
      const offending = packed.files.filter((f) => pattern.test(f.path)).map((f) => f.path);
      expect(
        offending,
        `Published tarball must not include ${label}; found: ${offending.join(', ')}`,
      ).toEqual([]);
    }
  });

  test('does not publish project configuration that is not needed by consumers', () => {
    const disallowedExactPaths: ReadonlyArray<string> = [
      'playwright.config.ts',
      'playwright.catalog.config.ts',
      'biome.json',
      'eslint.config.mjs',
      'lefthook.yml',
      'tsconfig.base.json',
      'tsconfig.build.json',
      'tsconfig.test.json',
      'tsconfig.json',
      'CONTEXT.md',
      'AGENTS.md',
      'CLAUDE.md',
    ];
    const paths = new Set(packed.files.map((f) => f.path));
    for (const disallowed of disallowedExactPaths) {
      expect(paths.has(disallowed), `Published tarball must not include ${disallowed}`).toBe(false);
    }
  });

  test('publishes only the documented files allowlist roots', () => {
    const allowedRoots = ['dist/', 'README.md', 'package.json'];
    const offending = packed.files
      .map((f) => f.path)
      .filter((path) => !allowedRoots.some((root) => path === root || path.startsWith(root)));
    expect(
      offending,
      `Every published path must live under the package.json files allowlist; found unexpected: ${offending.join(', ')}`,
    ).toEqual([]);
  });
});
