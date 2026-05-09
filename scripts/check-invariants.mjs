#!/usr/bin/env node
// @ts-check
/**
 * Repository invariant checker for project-specific policies that do not
 * belong in TypeScript, Biome, or ESLint. Runs as a standalone script via
 * `node scripts/check-invariants.mjs` and is also imported by Playwright
 * tests to assert each invariant individually.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @typedef {{ name: string, ok: boolean, message: string }} InvariantResult */

const PLAYWRIGHT_PEER_RANGE = '>=1.59 <2';

/**
 * @param {string} repoRoot
 * @returns {Promise<Record<string, unknown>>}
 */
async function readPackageJson(repoRoot) {
  return JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkPlaywrightPeerPolicy(repoRoot) {
  const pkg = await readPackageJson(repoRoot);
  const peers = /** @type {Record<string, string> | undefined} */ (pkg['peerDependencies']);
  const actual = peers?.['@playwright/test'];
  const ok = actual === PLAYWRIGHT_PEER_RANGE;
  return {
    name: 'playwright-peer-policy',
    ok,
    message: ok
      ? `peerDependencies['@playwright/test'] is '${PLAYWRIGHT_PEER_RANGE}' (canonical Playwright Support Range)`
      : `peerDependencies['@playwright/test'] must equal '${PLAYWRIGHT_PEER_RANGE}' ` +
        `(canonical Playwright Support Range from ADR 0008); found '${actual ?? '<missing>'}'`,
  };
}

const CONCRETE_VERSION_PATTERN = /^(\d+)(?:\.\d+){0,2}$/;
const SEMVER_RANGE_LOWER_PATTERN = /^>=\s*(\d+)/;
const SEMVER_CARET_MAJOR_PATTERN = /^\^(\d+)/;

/**
 * @param {string} repoRoot
 */
async function readNvmrcMajor(repoRoot) {
  const raw = (await readFile(resolve(repoRoot, '.nvmrc'), 'utf8')).trim();
  const match = raw.match(CONCRETE_VERSION_PATTERN);
  return { raw, major: match ? Number(match[1]) : null };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkNvmrcConcreteMajor(repoRoot) {
  const { raw, major } = await readNvmrcMajor(repoRoot);
  // PRD: "Use a concrete Node major version for local runtime selection rather than a moving LTS alias."
  // Accept "24" or "24.12.3"; reject "lts/*", "lts/iron", "node", "stable", etc.
  return {
    name: 'nvmrc-concrete-major',
    ok: major !== null,
    message:
      major !== null
        ? `.nvmrc pins concrete Node ${major}`
        : `.nvmrc must pin a concrete Node major (e.g. '24' or '24.12.3'), ` +
          `not a moving alias; found '${raw}'`,
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkEnginesNodeMatchesNvmrc(repoRoot) {
  const { major: nvmrcMajor } = await readNvmrcMajor(repoRoot);
  const pkg = await readPackageJson(repoRoot);
  const engines = /** @type {Record<string, string> | undefined} */ (pkg['engines']);
  const enginesNode = engines?.['node'] ?? '';
  const enginesMatch = enginesNode.match(SEMVER_RANGE_LOWER_PATTERN);
  const enginesMajor = enginesMatch ? Number(enginesMatch[1]) : null;
  const ok = nvmrcMajor !== null && enginesMajor !== null && nvmrcMajor === enginesMajor;
  return {
    name: 'engines-node-matches-nvmrc',
    ok,
    message: ok
      ? `package.json engines.node '${enginesNode}' aligns with .nvmrc Node ${nvmrcMajor}`
      : `package.json engines.node lower bound major must equal .nvmrc Node major ` +
        `(.nvmrc=${nvmrcMajor ?? '<invalid>'}, engines.node='${enginesNode || '<missing>'}')`,
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkTypesNodeMatchesNvmrc(repoRoot) {
  const { major: nvmrcMajor } = await readNvmrcMajor(repoRoot);
  const pkg = await readPackageJson(repoRoot);
  const dev = /** @type {Record<string, string> | undefined} */ (pkg['devDependencies']);
  const typesNode = dev?.['@types/node'] ?? '';
  const caretMatch = typesNode.match(SEMVER_CARET_MAJOR_PATTERN);
  const typesMajor = caretMatch ? Number(caretMatch[1]) : null;
  const ok = nvmrcMajor !== null && typesMajor !== null && nvmrcMajor === typesMajor;
  return {
    name: 'types-node-matches-nvmrc',
    ok,
    message: ok
      ? `devDependencies['@types/node'] '${typesNode}' aligns with .nvmrc Node ${nvmrcMajor}`
      : `devDependencies['@types/node'] major must equal .nvmrc Node major ` +
        `(.nvmrc=${nvmrcMajor ?? '<invalid>'}, @types/node='${typesNode || '<missing>'}'); ` +
        `PRD requires alignment unless an explicit reason is documented.`,
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkCiUsesNvmrc(repoRoot) {
  const ciPath = resolve(repoRoot, '.github/workflows/ci.yml');
  let ci = '';
  try {
    ci = await readFile(ciPath, 'utf8');
  } catch {
    return {
      name: 'ci-uses-nvmrc-node-version-file',
      ok: false,
      message: `CI workflow not found at .github/workflows/ci.yml`,
    };
  }
  const ok = /node-version-file:\s*\.nvmrc/.test(ci);
  return {
    name: 'ci-uses-nvmrc-node-version-file',
    ok,
    message: ok
      ? `CI workflow uses node-version-file: .nvmrc`
      : `CI workflow must drive Node from .nvmrc via 'node-version-file: .nvmrc' to keep ` +
        `local and CI runtime selection consistent`,
  };
}

const EXPECTED_EXPORT_TYPES = './dist/index.d.ts';
const EXPECTED_EXPORT_IMPORT = './dist/index.js';
const EXPECTED_FILES_ALLOWLIST = ['dist', 'README.md'];
const REQUIRED_GITIGNORE_PATTERNS = [
  'node_modules/',
  'dist/',
  'coverage/',
  'playwright-report/',
  'test-results/',
  'playwright-runboard-report/',
  '*.tgz',
];

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkPackageExportsSingleEntrypoint(repoRoot) {
  const pkg = await readPackageJson(repoRoot);
  const exportsField = /** @type {Record<string, unknown> | undefined} */ (pkg['exports']);
  const keys = exportsField ? Object.keys(exportsField) : [];
  const onlyDot = keys.length === 1 && keys[0] === '.';
  const dotEntry = /** @type {Record<string, unknown> | undefined} */ (exportsField?.['.']);
  const conditions = dotEntry ? Object.keys(dotEntry) : [];
  const expectedConditions = ['types', 'import'];
  const conditionsMatch =
    conditions.length === expectedConditions.length &&
    expectedConditions.every((c) => conditions.includes(c));
  const typesValue = dotEntry?.['types'];
  const importValue = dotEntry?.['import'];
  const valuesMatch =
    typesValue === EXPECTED_EXPORT_TYPES && importValue === EXPECTED_EXPORT_IMPORT;
  const ok = onlyDot && conditionsMatch && valuesMatch;
  return {
    name: 'package-exports-single-entrypoint',
    ok,
    message: ok
      ? `package.json exports a single '.' entry mapping types→${EXPECTED_EXPORT_TYPES}, import→${EXPECTED_EXPORT_IMPORT}`
      : `package.json exports must contain exactly { ".": { "types": "${EXPECTED_EXPORT_TYPES}", ` +
        `"import": "${EXPECTED_EXPORT_IMPORT}" } } so the package keeps a single public entrypoint; ` +
        `found keys=[${keys.join(', ')}], conditions=[${conditions.join(', ')}], ` +
        `types='${typesValue ?? '<missing>'}', import='${importValue ?? '<missing>'}'`,
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkPackageMainTypesPointAtDist(repoRoot) {
  const pkg = await readPackageJson(repoRoot);
  const main = pkg['main'];
  const types = pkg['types'];
  const ok = main === EXPECTED_EXPORT_IMPORT && types === EXPECTED_EXPORT_TYPES;
  return {
    name: 'package-main-types-point-at-dist',
    ok,
    message: ok
      ? `package.json main and types resolve to dist/`
      : `package.json main must equal '${EXPECTED_EXPORT_IMPORT}' and types must equal ` +
        `'${EXPECTED_EXPORT_TYPES}'; found main='${main ?? '<missing>'}', types='${types ?? '<missing>'}'`,
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkPackageFilesAllowlist(repoRoot) {
  const pkg = await readPackageJson(repoRoot);
  const files = /** @type {unknown[] | undefined} */ (pkg['files']);
  const ok =
    Array.isArray(files) &&
    files.length === EXPECTED_FILES_ALLOWLIST.length &&
    EXPECTED_FILES_ALLOWLIST.every((entry) => files.includes(entry));
  return {
    name: 'package-files-allowlist',
    ok,
    message: ok
      ? `package.json files = [${EXPECTED_FILES_ALLOWLIST.map((e) => `'${e}'`).join(', ')}]`
      : `package.json files allowlist must equal [${EXPECTED_FILES_ALLOWLIST.map((e) => `'${e}'`).join(', ')}] ` +
        `to keep published contents limited to built output and package-facing docs; ` +
        `found ${JSON.stringify(files)}`,
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult>}
 */
async function checkGitignoreGeneratedOutput(repoRoot) {
  const gitignore = await readFile(resolve(repoRoot, '.gitignore'), 'utf8');
  const lines = new Set(
    gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')),
  );
  const missing = REQUIRED_GITIGNORE_PATTERNS.filter((pattern) => !lines.has(pattern));
  const ok = missing.length === 0;
  return {
    name: 'gitignore-generated-output',
    ok,
    message: ok
      ? `.gitignore covers build output, Playwright reports, Runboard Data Bundle outputs, ` +
        `test results, coverage, and pack artifacts`
      : `.gitignore must list every generated-output category from the PRD ` +
        `(${REQUIRED_GITIGNORE_PATTERNS.map((p) => `'${p}'`).join(', ')}); ` +
        `missing: ${missing.map((p) => `'${p}'`).join(', ')}`,
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<InvariantResult[]>}
 */
export async function checkInvariants(repoRoot) {
  return [
    await checkPlaywrightPeerPolicy(repoRoot),
    await checkNvmrcConcreteMajor(repoRoot),
    await checkEnginesNodeMatchesNvmrc(repoRoot),
    await checkTypesNodeMatchesNvmrc(repoRoot),
    await checkCiUsesNvmrc(repoRoot),
    await checkPackageExportsSingleEntrypoint(repoRoot),
    await checkPackageMainTypesPointAtDist(repoRoot),
    await checkPackageFilesAllowlist(repoRoot),
    await checkGitignoreGeneratedOutput(repoRoot),
  ];
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const repoRoot = process.cwd();
  const results = await checkInvariants(repoRoot);
  const failures = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}: ${r.message}`);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${results.length} repository invariants failed`);
    process.exit(1);
  } else {
    console.log(`\n${results.length} repository invariants passed`);
  }
}
