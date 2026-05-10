/**
 * Public declaration-surface contract for the published reporter package.
 *
 * Two concerns live in this spec because they share the same build step:
 *
 * - The PRD requires only a *narrow* Compatibility Adapter for Playwright
 *   reporter API gaps. Playwright's `merge-reports` Multiplexer dispatches
 *   `version`, `onReportConfigure`, and `onReportEnd` via optional chaining,
 *   so the reporter must implement them at runtime — but their payload
 *   shapes are Playwright-internal and must not surface in this package's
 *   public type surface.
 * - Every public export must carry a TSDoc block so generated declarations
 *   and editor hovers explain the API without forcing a README lookup.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = resolve(repoRoot, 'dist');
const indexDts = resolve(distDir, 'index.d.ts');
const contractDts = resolve(distDir, 'contract.d.ts');
const reporterDts = resolve(distDir, 'runboard-reporter.d.ts');
const optionsDts = resolve(distDir, 'options.d.ts');

const CONTRACT_TYPES = [
  'RunboardLocation',
  'RunboardStats',
  'RunboardMetadata',
  'RunboardReportOptions',
  'RunboardMachine',
  'RunboardTestAnnotation',
  'RunboardTestAttachment',
  'RunboardTestStep',
  'RunboardErrorEvidenceSource',
  'RunboardSourceExcerpt',
  'RunboardTestErrorEvidence',
  'RunboardStatusDerivedErrorEvidence',
  'RunboardErrorEvidence',
  'RunboardResultEvidence',
  'RunboardTestResultDisplayError',
  'RunboardTestResultStatus',
  'RunboardTestResult',
  'RunboardTestResultSummary',
  'RunboardTestOutcome',
  'RunboardTestCaseSummary',
  'RunboardTestCase',
  'RunboardTestFileSummary',
  'RunboardTestFile',
  'RunboardReport',
] as const;

function tsDocBeforeDeclaration(name: string): RegExp {
  return new RegExp(
    `/\\*\\*[\\s\\S]*?\\*/\\s*export(?:\\s+declare)?\\s+(?:const|interface|type|class)\\s+${name}\\b`,
  );
}

test.describe('Reporter declaration surface', () => {
  test.beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  });

  test('public reporter d.ts hides v2/merge-reports compatibility hooks', async () => {
    const dts = await readFile(reporterDts, 'utf8');

    // v2 dispatcher discriminator is a Playwright Multiplexer hook, not public API.
    expect(dts, 'version() must be stripped from the public declaration surface').not.toMatch(
      /\bversion\s*\(\s*\)/,
    );

    // merge-reports per-shard hooks are dispatched by the Multiplexer via optional
    // chaining and are not part of `@playwright/test/reporter`'s public Reporter type.
    expect(dts).not.toContain('onReportConfigure');
    expect(dts).not.toContain('onReportEnd');

    // The merge-reports hook payload shapes leak Playwright internals.
    expect(dts).not.toContain('MergeReportConfigureParams');
    expect(dts).not.toContain('MergeReportEndParams');
    expect(dts).not.toContain('reportPath');
  });

  test('public reporter d.ts exposes only the v2 onBegin(suite) overload', async () => {
    const dts = await readFile(reporterDts, 'utf8');

    expect(dts, 'public d.ts must expose the v2 onBegin overload').toMatch(
      /onBegin\s*\(\s*suite\s*:\s*Suite\s*\)\s*:\s*void/,
    );

    // The v1-style 2-arg overload and the union implementation signature must not leak.
    expect(dts).not.toMatch(/onBegin\s*\(\s*configOrSuite\b/);
    expect(dts).not.toMatch(/onBegin\s*\(\s*config\s*:\s*FullConfig\s*,/);
  });

  test('RUNBOARD_SCHEMA_VERSION carries TSDoc in the public contract declarations', async () => {
    const dts = await readFile(contractDts, 'utf8');
    expect(dts).toMatch(tsDocBeforeDeclaration('RUNBOARD_SCHEMA_VERSION'));
  });

  test('RunboardReporter class carries TSDoc in the public reporter declarations', async () => {
    const dts = await readFile(reporterDts, 'utf8');
    expect(dts).toMatch(tsDocBeforeDeclaration('RunboardReporter'));
  });

  test('RunboardReporterOptions carries TSDoc in the public options declarations', async () => {
    const dts = await readFile(optionsDts, 'utf8');
    expect(dts).toMatch(tsDocBeforeDeclaration('RunboardReporterOptions'));
  });

  test('every Runboard Contract Type carries a TSDoc block', async () => {
    const dts = await readFile(contractDts, 'utf8');
    const undocumented = CONTRACT_TYPES.filter((name) => !tsDocBeforeDeclaration(name).test(dts));
    expect(
      undocumented,
      `Runboard Contract Types must carry TSDoc in dist/contract.d.ts; missing: ${undocumented.join(', ')}`,
    ).toEqual([]);
  });

  test('Runboard Metadata fields document the schema-versioning trio', async () => {
    const dts = await readFile(contractDts, 'utf8');
    const metadataMatch = dts.match(/interface RunboardMetadata\b[\s\S]*?\}/);
    expect(metadataMatch, 'RunboardMetadata must be present in contract.d.ts').not.toBeNull();
    const body = metadataMatch?.[0] ?? '';
    for (const field of ['schemaVersion', 'reporterVersion', 'playwrightVersion']) {
      expect(
        body,
        `RunboardMetadata.${field} must carry inline TSDoc explaining its semantic`,
      ).toMatch(new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s*${field}\\s*:`));
    }
  });

  test('RunboardReportOptions fields document Playwright-applicable display options', async () => {
    const dts = await readFile(contractDts, 'utf8');
    const optionsMatch = dts.match(/interface RunboardReportOptions\b[\s\S]*?\}/);
    expect(optionsMatch, 'RunboardReportOptions must be present in contract.d.ts').not.toBeNull();
    const body = optionsMatch?.[0] ?? '';
    for (const field of ['title', 'noCopyPrompt', 'noSnippets']) {
      expect(
        body,
        `RunboardReportOptions.${field} must carry inline TSDoc explaining its semantic`,
      ).toMatch(new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s*${field}\\?:`));
    }
  });

  test('public index.d.ts still re-exports the documented schema constant and reporter symbols', async () => {
    const dts = await readFile(indexDts, 'utf8');
    expect(dts).toContain('RUNBOARD_SCHEMA_VERSION');
    expect(dts).toContain('RunboardReporter');
    expect(dts).toContain('RunboardReporterOptions');
  });
});
