import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { checkInvariants, type InvariantResult } from '../../scripts/check-invariants.mjs';

const execFileAsync = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function getInvariant(name: string, root: string = repoRoot): Promise<InvariantResult> {
  const results = await checkInvariants(root);
  const result = results.find((r) => r.name === name);
  if (!result) {
    throw new Error(
      `Invariant '${name}' is not produced by checkInvariants(); ` +
        `produced names: ${results.map((r) => r.name).join(', ')}`,
    );
  }
  return result;
}

test.describe('Playwright peer support policy', () => {
  test('peer dependency matches the canonical >=1.59 <2 support range', async () => {
    const r = await getInvariant('playwright-peer-policy');
    expect(r.ok, r.message).toBe(true);
  });
});

test.describe('Node runtime metadata consistency', () => {
  test('.nvmrc pins a concrete Node major rather than a moving alias', async () => {
    const r = await getInvariant('nvmrc-concrete-major');
    expect(r.ok, r.message).toBe(true);
  });

  test('package.json engines.node lower bound matches .nvmrc major', async () => {
    const r = await getInvariant('engines-node-matches-nvmrc');
    expect(r.ok, r.message).toBe(true);
  });

  test('@types/node major matches .nvmrc major', async () => {
    const r = await getInvariant('types-node-matches-nvmrc');
    expect(r.ok, r.message).toBe(true);
  });

  test('CI workflow drives Node from .nvmrc via node-version-file', async () => {
    const r = await getInvariant('ci-uses-nvmrc-node-version-file');
    expect(r.ok, r.message).toBe(true);
  });
});

test.describe('Package exports', () => {
  test('package.json exports only the public "." entrypoint', async () => {
    const r = await getInvariant('package-exports-single-entrypoint');
    expect(r.ok, r.message).toBe(true);
  });

  test('package.json main and types point at the built bundle in dist', async () => {
    const r = await getInvariant('package-main-types-point-at-dist');
    expect(r.ok, r.message).toBe(true);
  });
});

test.describe('Package file allowlist', () => {
  test('package.json files allowlist contains only built output and README', async () => {
    const r = await getInvariant('package-files-allowlist');
    expect(r.ok, r.message).toBe(true);
  });
});

test.describe('Generated-output policy', () => {
  test('.gitignore excludes every category of generated output named in the PRD', async () => {
    const r = await getInvariant('gitignore-generated-output');
    expect(r.ok, r.message).toBe(true);
  });
});

test.describe('Failure messages identify the invariant and missing inputs', () => {
  let fixtureRoot: string;

  test.beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'invariants-fixture-'));
  });

  test.afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  test('missing .nvmrc fails nvmrc-concrete-major with a named invariant result, not a stack trace', async () => {
    const r = await getInvariant('nvmrc-concrete-major', fixtureRoot);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('.nvmrc');
  });

  test('missing .gitignore fails gitignore-generated-output with a named invariant result, not a stack trace', async () => {
    const r = await getInvariant('gitignore-generated-output', fixtureRoot);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('.gitignore');
  });

  test('CI workflow with node-version-file only inside a YAML comment fails the CI invariant', async () => {
    await mkdir(join(fixtureRoot, '.github', 'workflows'), { recursive: true });
    await writeFile(
      join(fixtureRoot, '.github', 'workflows', 'ci.yml'),
      [
        'name: CI',
        'on: [push]',
        'jobs:',
        '  checks:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v6',
        '      - name: Setup Node.js',
        '        uses: actions/setup-node@v6',
        '        with:',
        '          # node-version-file: .nvmrc (commented out — drift risk)',
        '          node-version: 20',
        '',
      ].join('\n'),
      'utf8',
    );
    const r = await getInvariant('ci-uses-nvmrc-node-version-file', fixtureRoot);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/node-version-file/);
  });
});

test.describe('Independently runnable script', () => {
  test('node scripts/check-invariants.mjs exits 0 when all invariants pass', async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [resolve(repoRoot, 'scripts/check-invariants.mjs')],
      { cwd: repoRoot },
    );
    expect(stdout, 'each passing invariant should be printed with a ✓ marker').toContain('✓');
    expect(stderr, 'no failure summary should be written when invariants pass').toBe('');
  });

  test('npm script `invariants` runs the standalone checker', async () => {
    const { default: pkg } = await import('../../package.json', {
      with: { type: 'json' },
    });
    expect(pkg.scripts?.invariants, 'package.json must define a `invariants` script').toContain(
      'scripts/check-invariants.mjs',
    );
    expect(pkg.scripts?.verify, 'verify gate must run repository invariants').toContain(
      'npm run invariants',
    );
  });
});
