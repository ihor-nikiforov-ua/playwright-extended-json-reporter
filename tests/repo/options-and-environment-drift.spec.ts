/**
 * Public options and environment-variable drift checks.
 *
 * The Public Documentation Set at `docs/public/options.md` is the canonical
 * consumer-facing description of `RunboardReporterOptions`, the Runboard
 * Output Environment Variable, the Attachments Base URL environment variable,
 * defaults, precedence, and No-op Compatibility Option behavior. These tests
 * read the option surface from `src/options.ts` and assert that the public
 * docs page neither omits a real option / environment variable nor invents
 * one that does not exist in source.
 *
 * Pair this spec with `docs/public/options.md`: the markdown is the public
 * commitment, and the assertions here keep that commitment in sync with the
 * option module constants and the `RunboardReporterOptions` interface.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  ATTACHMENTS_BASE_URL_ENV,
  DEFAULT_ATTACHMENTS_BASE_URL,
  DEFAULT_OUTPUT_FOLDER,
  NO_OP_COMPATIBILITY_OPTIONS,
  OUTPUT_FOLDER_ENV,
} from '../../src/options.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const optionsDocPath = resolve(repoRoot, 'docs/public/options.md');
const optionsSourcePath = resolve(repoRoot, 'src/options.ts');

/**
 * Extract the property names declared on the `RunboardReporterOptions`
 * interface body. The parser scans for lines that look like
 * `  name?: <type>;` inside the interface block. Block comments and blank
 * lines between members are ignored.
 */
function parseRunboardReporterOptionFields(source: string): string[] {
  const interfaceMatch = source.match(
    /export interface RunboardReporterOptions\s*\{([\s\S]*?)\n\}/,
  );
  expect(
    interfaceMatch,
    'src/options.ts must declare the RunboardReporterOptions interface',
  ).not.toBeNull();
  const body = interfaceMatch?.[1] ?? '';
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const names = new Set<string>();
  for (const match of stripped.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return [...names].sort();
}

test.describe('Options and Environment Variables — public docs drift', () => {
  test('options.md names every property on RunboardReporterOptions', async () => {
    const sourceText = await readFile(optionsSourcePath, 'utf8');
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    const fields = parseRunboardReporterOptionFields(sourceText);
    expect(fields, 'RunboardReporterOptions must declare at least one field').not.toEqual([]);
    const missing = fields.filter((name) => !optionsDoc.includes(`\`${name}\``));
    expect(
      missing,
      `docs/public/options.md must reference every RunboardReporterOptions field in a code span; missing: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('options.md No-op compatibility section lists every NO_OP_COMPATIBILITY_OPTIONS entry', async () => {
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    const heading = '## No-op compatibility options';
    const startIdx = optionsDoc.indexOf(heading);
    expect(
      startIdx,
      'options.md must include a "## No-op compatibility options" section',
    ).toBeGreaterThan(-1);
    const sectionBody = optionsDoc.slice(startIdx);
    const missing = NO_OP_COMPATIBILITY_OPTIONS.filter(
      (name) => !sectionBody.includes(`\`${name}\``),
    );
    expect(
      missing,
      `docs/public/options.md No-op compatibility section must list every No-op Compatibility Option in source order; missing: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('options.md environment-variable table cites the canonical environment variable names', async () => {
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    const heading = '## Environment variables';
    const startIdx = optionsDoc.indexOf(heading);
    expect(
      startIdx,
      'options.md must include a "## Environment variables" section',
    ).toBeGreaterThan(-1);
    const sectionBody = optionsDoc.slice(startIdx);
    for (const envName of [OUTPUT_FOLDER_ENV, ATTACHMENTS_BASE_URL_ENV]) {
      expect(
        sectionBody,
        `options.md Environment variables section must include canonical env var \`${envName}\``,
      ).toContain(`\`${envName}\``);
    }
  });

  test('options.md documents the canonical default values for outputFolder and attachmentsBaseURL', async () => {
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    expect(
      optionsDoc,
      `options.md must document the DEFAULT_OUTPUT_FOLDER value '${DEFAULT_OUTPUT_FOLDER}' so the table cannot drift from source`,
    ).toContain(`\`'${DEFAULT_OUTPUT_FOLDER}'\``);
    expect(
      optionsDoc,
      `options.md must document the DEFAULT_ATTACHMENTS_BASE_URL value '${DEFAULT_ATTACHMENTS_BASE_URL}' so the table cannot drift from source`,
    ).toContain(`\`'${DEFAULT_ATTACHMENTS_BASE_URL}'\``);
  });

  test('options.md documents an explicit precedence order from option to environment variable to default', async () => {
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    expect(
      optionsDoc,
      'options.md must include explicit precedence language so consumers know how options, env vars, and defaults interact',
    ).toMatch(/[Pp]recedence/);
    // Precedence has to mention all three layers so readers can resolve a
    // conflict without inferring it from the table.
    expect(optionsDoc).toMatch(/Explicit[^\n]+option/i);
    expect(optionsDoc).toMatch(/environment variable/i);
    expect(optionsDoc).toMatch(/[Dd]efault/);
  });
});
