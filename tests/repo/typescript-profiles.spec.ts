import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(repoRoot, relativePath), 'utf8'));
}

type CompilerOptions = Record<string, unknown>;

async function readCompilerOptions(profilePath: string): Promise<CompilerOptions> {
  const json = await readJson(profilePath);
  const options = json['compilerOptions'];
  expect(options, `${profilePath} must define compilerOptions`).toBeTruthy();
  return options as CompilerOptions;
}

test.describe('TypeScript profiles', () => {
  test('repo declares base, build, test, and editor/default profile files', async () => {
    for (const profile of [
      'tsconfig.base.json',
      'tsconfig.build.json',
      'tsconfig.test.json',
      'tsconfig.json',
    ]) {
      const json = await readJson(profile);
      expect(json, `${profile} must be valid JSON describing a tsconfig`).toBeTruthy();
    }
  });

  test('npm scripts wire build to the build profile and typecheck to every relevant profile', async () => {
    const pkg = (await readJson('package.json')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    expect(scripts['build'], '`build` script must compile against tsconfig.build.json').toContain(
      'tsc -p tsconfig.build.json',
    );
    const typecheck = scripts['typecheck'] ?? '';
    for (const profile of ['tsconfig.build.json', 'tsconfig.test.json', 'tsconfig.json']) {
      expect(typecheck, `\`typecheck\` script must cover ${profile}`).toContain(`-p ${profile}`);
    }
    expect(typecheck, '`typecheck` script must run tsc in noEmit mode').toContain('--noEmit');
  });

  test('editor/default profile extends base, is no-emit, and covers src + tests', async () => {
    const editorJson = await readJson('tsconfig.json');
    expect(
      editorJson['extends'],
      'editor/default profile must extend the shared base profile',
    ).toBe('./tsconfig.base.json');
    const editor = await readCompilerOptions('tsconfig.json');
    expect(editor['noEmit'], 'editor/default profile must not emit').toBe(true);
    expect(
      editor['isolatedDeclarations'],
      'editor/default profile must not enforce isolated declarations',
    ).not.toBe(true);
    const include = editorJson['include'] as string[] | undefined;
    expect(include, 'editor/default profile must declare an include array').toBeDefined();
    expect(include).toEqual(
      expect.arrayContaining(['src/**/*.ts', 'tests/**/*.ts', 'playwright.config.ts']),
    );
  });

  test('test profile extends base, is no-emit, and includes src + tests + playwright.config', async () => {
    const testJson = await readJson('tsconfig.test.json');
    expect(testJson['extends'], 'test profile must extend the shared base profile').toBe(
      './tsconfig.base.json',
    );
    const testOptions = await readCompilerOptions('tsconfig.test.json');
    expect(testOptions['noEmit'], 'test profile must not emit').toBe(true);
    expect(
      testOptions['isolatedDeclarations'],
      'test profile must not enforce isolated declarations',
    ).not.toBe(true);
    const include = testJson['include'] as string[] | undefined;
    expect(include, 'test profile must declare an include array').toBeDefined();
    expect(include).toEqual(
      expect.arrayContaining(['src/**/*.ts', 'tests/**/*.ts', 'playwright.config.ts']),
    );
  });

  test('build profile enables isolatedDeclarations and scopes to src only', async () => {
    const buildJson = await readJson('tsconfig.build.json');
    const build = await readCompilerOptions('tsconfig.build.json');
    expect(build['isolatedDeclarations']).toBe(true);
    expect(buildJson['include']).toEqual(['src/**/*.ts']);
  });

  test('build profile emits JS, declarations, source maps, and declaration maps', async () => {
    const buildJson = await readJson('tsconfig.build.json');
    expect(buildJson['extends'], 'build profile must extend the shared base profile').toBe(
      './tsconfig.base.json',
    );
    const build = await readCompilerOptions('tsconfig.build.json');
    expect(build['declaration'], 'build profile must emit declaration files').toBe(true);
    expect(build['declarationMap'], 'build profile must emit declaration maps').toBe(true);
    expect(build['sourceMap'], 'build profile must emit JS source maps').toBe(true);
    expect(build['noEmit'], 'build profile must emit JS').not.toBe(true);
    expect(build['outDir'], 'build profile must direct emit to dist').toBe('dist');
    expect(build['rootDir'], 'build profile must read sources from src').toBe('src');
  });

  test('base profile targets ES2024 with ES2024 lib and excludes DOM libraries', async () => {
    const base = await readCompilerOptions('tsconfig.base.json');
    expect(base['target']).toBe('ES2024');
    expect(base['lib']).toEqual(['ES2024']);
    const lib = (base['lib'] as string[]) ?? [];
    for (const entry of lib) {
      expect(
        entry.toLowerCase().includes('dom'),
        'base profile must not pull in DOM libraries unless explicitly justified',
      ).toBe(false);
    }
  });

  test('base profile enforces every PRD-required strict compiler option', async () => {
    const base = await readCompilerOptions('tsconfig.base.json');
    const requiredTrue = [
      'strict',
      'exactOptionalPropertyTypes',
      'noUncheckedIndexedAccess',
      'noImplicitOverride',
      'noPropertyAccessFromIndexSignature',
      'useUnknownInCatchVariables',
      'verbatimModuleSyntax',
      'noUnusedLocals',
    ] as const;
    for (const flag of requiredTrue) {
      expect(base[flag], `base profile must enable ${flag}`).toBe(true);
    }
    expect(base['skipLibCheck'], 'base profile must keep skipLibCheck disabled').toBe(false);
    // Unused parameters intentionally not a hard failure: Playwright reporter callbacks and
    // tests legitimately accept arguments they do not consume.
    expect(
      base['noUnusedParameters'],
      'base profile must not enforce noUnusedParameters as a hard failure',
    ).not.toBe(true);
  });
});
