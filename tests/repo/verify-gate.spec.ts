import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readPackageJson(): Promise<{ scripts?: Record<string, string> }> {
  return JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
}

test.describe('Canonical verify gate', () => {
  test('package.json defines a `verify` script', async () => {
    const pkg = await readPackageJson();
    expect(pkg.scripts?.['verify'], 'package.json must define a `verify` script').toBeTruthy();
  });

  test('`verify` runs Biome check, targeted ESLint, typecheck, tests, and pack verification', async () => {
    const pkg = await readPackageJson();
    const verify = pkg.scripts?.['verify'] ?? '';
    for (const gate of [
      'npm run check',
      'npm run lint',
      'npm run typecheck',
      'npm test',
      'npm run pack:verify',
    ]) {
      expect(verify, `\`verify\` must invoke \`${gate}\``).toContain(gate);
    }
  });

  test('focused scripts remain available for fast local checks', async () => {
    const pkg = await readPackageJson();
    for (const focused of ['check', 'lint', 'typecheck', 'test', 'pack:verify']) {
      expect(
        pkg.scripts?.[focused],
        `\`${focused}\` script must remain runnable on its own`,
      ).toBeTruthy();
    }
  });

  test('pack verification builds explicitly without running lifecycle scripts', async () => {
    const pkg = await readPackageJson();
    const packVerify = pkg.scripts?.['pack:verify'] ?? '';
    expect(packVerify, '`pack:verify` must build package artifacts explicitly').toContain(
      'npm run build',
    );
    expect(packVerify, '`pack:verify` must dry-run package contents').toContain(
      'npm pack --dry-run',
    );
    expect(
      packVerify,
      '`pack:verify` must not run lifecycle scripts such as `prepare` hook installation',
    ).toContain('--ignore-scripts');
  });

  test('CI workflow runs `npm run verify` and does not duplicate gate steps inline', async () => {
    const ciYml = await readFile(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(ciYml, 'CI must invoke the canonical verify gate').toContain('npm run verify');
    expect(
      ciYml,
      'CI must not install browsers because the default verify gate excludes browser-backed catalog fixtures',
    ).not.toContain('npm run install:browsers');
    for (const inlineGate of [
      'npm run check',
      'npm run lint',
      'npm run typecheck',
      'npm test',
      'npm pack --dry-run',
    ]) {
      expect(
        ciYml,
        `CI must not duplicate \`${inlineGate}\` outside \`npm run verify\``,
      ).not.toContain(inlineGate);
    }
  });
});
