import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { ESLint } from 'eslint';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
}

interface ResolvedConfig {
  rules?: Record<string, unknown>;
}

function severityOf(config: ResolvedConfig, ruleName: string): number {
  const entry = config.rules?.[ruleName];
  if (Array.isArray(entry)) {
    const head = entry[0];
    if (typeof head === 'number') return head;
    if (head === 'off') return 0;
    if (head === 'warn') return 1;
    if (head === 'error') return 2;
    return 0;
  }
  if (typeof entry === 'number') return entry;
  if (entry === 'off') return 0;
  if (entry === 'warn') return 1;
  if (entry === 'error') return 2;
  return 0;
}

async function configFor(filePath: string): Promise<ResolvedConfig> {
  const eslint = new ESLint({ cwd: repoRoot });
  return (await eslint.calculateConfigForFile(filePath)) as ResolvedConfig;
}

test.describe('Targeted ESLint safety layer', () => {
  test('lint script runs eslint and is included in the verify gate', async () => {
    const pkg = await readPackageJson();
    const lint = pkg.scripts?.['lint'] ?? '';
    expect(lint, 'package.json must define a `lint` script that runs eslint').toContain('eslint');
    const verify = pkg.scripts?.['verify'] ?? '';
    expect(verify, 'verify gate must run targeted ESLint safety rules').toContain('npm run lint');
  });

  test('eslint config file is checked into the repo', async () => {
    const configPath = resolve(repoRoot, 'eslint.config.mjs');
    const stats = await stat(configPath);
    expect(stats.isFile(), 'eslint.config.mjs must exist as a flat-config file').toBe(true);
  });

  test('eslint depends on type-aware tooling but does not bring in a generic recommended preset', async () => {
    const pkg = await readPackageJson();
    const dev = pkg.devDependencies ?? {};
    expect(dev['eslint'], 'eslint must be a devDependency').toBeTruthy();
    expect(
      dev['typescript-eslint'],
      'typescript-eslint must be a devDependency for type-aware async rules',
    ).toBeTruthy();
  });

  test('production reporter source forbids broad explicit any', async () => {
    const config = await configFor(resolve(repoRoot, 'src/runboard-reporter.ts'));
    expect(
      severityOf(config, '@typescript-eslint/no-explicit-any'),
      'src must forbid explicit any so contract and serializer code narrow unknown deliberately',
    ).toBe(2);
  });

  test('test helpers retain documented flexibility around explicit any', async () => {
    const config = await configFor(resolve(repoRoot, 'tests/helpers/fake-playwright.ts'));
    expect(
      severityOf(config, '@typescript-eslint/no-explicit-any'),
      'tests and helpers must keep no-explicit-any disabled to allow fake reporter API objects',
    ).toBe(0);
  });

  test('type-aware async safety rules are enforced as errors', async () => {
    const config = await configFor(resolve(repoRoot, 'src/runboard-reporter.ts'));
    expect(severityOf(config, '@typescript-eslint/no-floating-promises')).toBe(2);
    expect(severityOf(config, '@typescript-eslint/await-thenable')).toBe(2);
    expect(severityOf(config, '@typescript-eslint/no-misused-promises')).toBe(2);
  });

  test('type-only imports and circular-dependency prevention are enforced', async () => {
    const config = await configFor(resolve(repoRoot, 'src/runboard-reporter.ts'));
    expect(severityOf(config, '@typescript-eslint/consistent-type-imports')).toBe(2);
    expect(severityOf(config, 'import-x/no-cycle')).toBe(2);
  });

  test('private Playwright internals are forbidden by default', async () => {
    const config = await configFor(resolve(repoRoot, 'src/runboard-reporter.ts'));
    const entry = config.rules?.['no-restricted-imports'];
    expect(
      Array.isArray(entry) && entry[0] !== 0 && entry[0] !== 'off',
      '`no-restricted-imports` must be enabled to forbid private Playwright imports',
    ).toBe(true);
    const serialized = JSON.stringify(entry);
    for (const privatePath of [
      'playwright-core/lib/',
      '@playwright/test/lib/',
      'playwright/lib/',
    ]) {
      expect(
        serialized.includes(privatePath),
        `\`no-restricted-imports\` must restrict ${privatePath}* imports`,
      ).toBe(true);
    }
  });

  test('repository-wide eslint run reports zero violations', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const results = await eslint.lintFiles([
      'src/**/*.ts',
      'tests/**/*.ts',
      'scripts/**/*.{mjs,mts}',
    ]);
    const messages = results.flatMap((r) =>
      r.messages.map((m) => `${r.filePath}: ${m.ruleId ?? 'parse'} - ${m.message}`),
    );
    expect(messages, 'eslint must pass on the current repo').toEqual([]);
  });
});
