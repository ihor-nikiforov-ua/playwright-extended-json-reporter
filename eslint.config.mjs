// Targeted ESLint safety layer.
//
// This config is intentionally narrow: it does not replace Biome formatting or
// broad linting. It only adds checks Biome and TypeScript cannot express —
// type-aware async lifecycle correctness, private Playwright import boundaries,
// the explicit-any policy, type-only imports, and circular-dependency
// prevention.
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

const PRIVATE_PLAYWRIGHT_BARE_PATHS = [
  '@playwright/test/lib',
  'playwright/lib',
  'playwright-core/lib',
];

const PRIVATE_PLAYWRIGHT_PATTERNS = [
  '@playwright/test/lib/*',
  '@playwright/test/lib/**',
  'playwright/lib/*',
  'playwright/lib/**',
  'playwright-core/lib/*',
  'playwright-core/lib/**',
];

const PRIVATE_PLAYWRIGHT_MESSAGE =
  'Importing Playwright private internals is forbidden. Use the public reporter API ' +
  '(`@playwright/test/reporter`); a Compatibility Adapter with an explicit ADR or PRD ' +
  'decision is the only allowed exception.';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'docs/**',
      'node_modules/**',
      'playwright-runboard-report/**',
      'test-results/**',
      'coverage/**',
      'playwright-report/**',
      '.runboard-int-*/**',
      '.runboard-compat-*/**',
      '*.tgz',
    ],
  },
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: PRIVATE_PLAYWRIGHT_BARE_PATHS.map((name) => ({
            name,
            message: PRIVATE_PLAYWRIGHT_MESSAGE,
          })),
          patterns: [
            {
              group: PRIVATE_PLAYWRIGHT_PATTERNS,
              message: PRIVATE_PLAYWRIGHT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.{mjs,mts,ts}', 'playwright.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
