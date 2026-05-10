import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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

async function runNpmPackDryRun(): Promise<PackOutput[]> {
  // `npm run build` is wired into `pack:verify`; the verify gate runs that
  // beforehand. Tests still need fresh dist output to assert that runtime
  // files are present, so build explicitly here too.
  await execFileAsync('npm', ['run', 'build'], { cwd: repoRoot });
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: repoRoot },
  );
  return JSON.parse(stdout) as PackOutput[];
}

test.describe('Published package contents', () => {
  let packed: PackOutput;

  test.beforeAll(async () => {
    const [first] = await runNpmPackDryRun();
    if (!first) throw new Error('npm pack --dry-run produced no entries');
    packed = first;
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

  test('publishes the MIT LICENSE trust signal alongside package metadata', async () => {
    const paths = packed.files.map((f) => f.path);
    expect(paths).toContain('LICENSE');
    const licenseText = await readFile(resolve(repoRoot, 'LICENSE'), 'utf8');
    expect(licenseText).toMatch(/MIT License/);
    const pkg = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.license).toBe('MIT');
  });

  test('publishes the manually maintained CHANGELOG.md trust signal', async () => {
    const paths = packed.files.map((f) => f.path);
    expect(paths).toContain('CHANGELOG.md');
    const changelog = await readFile(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
    // Public Preview Release structure: a top-level Changelog heading and a
    // forward-looking [Unreleased] section that release PRs can rename to
    // a versioned entry.
    expect(changelog).toMatch(/^# Changelog/m);
    expect(changelog).toMatch(/## \[Unreleased\]/);
  });

  test('keeps repository governance docs in the repo but out of the tarball', async () => {
    for (const repoOnlyDoc of ['CONTRIBUTING.md', 'SECURITY.md']) {
      const repoStat = await stat(resolve(repoRoot, repoOnlyDoc));
      expect(repoStat.isFile(), `${repoOnlyDoc} must exist in the repository`).toBe(true);
    }
    const paths = new Set(packed.files.map((f) => f.path));
    for (const repoOnlyDoc of ['CONTRIBUTING.md', 'SECURITY.md']) {
      expect(
        paths.has(repoOnlyDoc),
        `Published tarball must not include repository governance doc ${repoOnlyDoc}`,
      ).toBe(false);
    }
  });

  test('does not publish maintainer docs (PRDs, ADRs, agents, error catalog)', () => {
    const internalDocPatterns: ReadonlyArray<{ label: string; pattern: RegExp }> = [
      { label: 'PRD docs', pattern: /^docs\/prd\// },
      { label: 'ADR docs', pattern: /^docs\/adr\// },
      { label: 'agent docs', pattern: /^docs\/agents\// },
      { label: 'error catalog docs', pattern: /^docs\/error-catalog\// },
    ];
    for (const { label, pattern } of internalDocPatterns) {
      const offending = packed.files.filter((f) => pattern.test(f.path)).map((f) => f.path);
      expect(
        offending,
        `Published tarball must not include ${label}; found: ${offending.join(', ')}`,
      ).toEqual([]);
    }
  });

  test('does not publish repository scripts or generated test output', () => {
    const repoOnlyPatterns: ReadonlyArray<{ label: string; pattern: RegExp }> = [
      { label: 'scripts directory', pattern: /^scripts\// },
      { label: 'Playwright report output', pattern: /^playwright-report\// },
      { label: 'Playwright test results', pattern: /^test-results\// },
      { label: 'Runboard Data Bundle output', pattern: /^playwright-runboard-report\// },
    ];
    for (const { label, pattern } of repoOnlyPatterns) {
      const offending = packed.files.filter((f) => pattern.test(f.path)).map((f) => f.path);
      expect(
        offending,
        `Published tarball must not include ${label}; found: ${offending.join(', ')}`,
      ).toEqual([]);
    }
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
    // Public Pack Boundary: the published tarball must contain only the built
    // runtime, README, package metadata, public consumer docs, and Package
    // Trust Signals (LICENSE and CHANGELOG.md). Everything else — PRDs, ADRs,
    // agent/error-catalog docs, tests, fixtures, scripts, generated output,
    // repository governance docs, and repository configuration — stays in the
    // repository.
    const allowedRoots = [
      'dist/',
      'docs/public/',
      'README.md',
      'package.json',
      'LICENSE',
      'CHANGELOG.md',
    ];
    const offending = packed.files
      .map((f) => f.path)
      .filter((path) => !allowedRoots.some((root) => path === root || path.startsWith(root)));
    expect(
      offending,
      `Every published path must live under the package.json files allowlist; found unexpected: ${offending.join(', ')}`,
    ).toEqual([]);
  });
});
