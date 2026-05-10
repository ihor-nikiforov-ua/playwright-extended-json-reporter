/**
 * Public docs CI artifact and sharded merge-report guidance.
 *
 * Consumers running Playwright in CI need two pieces of guidance that the
 * Public Documentation Set has to surface explicitly:
 *
 * 1. How to preserve the Runboard Data Bundle as a CI artifact so it can be
 *    inspected after the run finishes.
 * 2. How to use Playwright's `merge-reports` with sharded runs so the
 *    Runboard Reporter emits one Merged Runboard Data Bundle for the whole
 *    matrix instead of one bundle per shard.
 *
 * These tests assert that the canonical headings, default Output Folder name,
 * `actions/upload-artifact` reference, `--shard` reference, and
 * `merge-reports` reference are all present in `docs/public/`. The default
 * Output Folder name is read from `src/options.ts` so the guidance examples
 * cannot drift from the source constant.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { DEFAULT_OUTPUT_FOLDER } from '../../src/options.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const optionsDocPath = resolve(repoRoot, 'docs/public/options.md');
const parityDocPath = resolve(repoRoot, 'docs/public/playwright-parity.md');

test.describe('CI artifact guidance for the Runboard Data Bundle', () => {
  test('options.md publishes a stable "CI artifact" section so the guidance is discoverable', async () => {
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    expect(
      optionsDoc,
      'options.md must include a stable heading that introduces the CI artifact guidance section',
    ).toMatch(/^## CI artifact/m);
  });

  test('CI artifact section shows an actions/upload-artifact example using the default Output Folder', async () => {
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    const sectionStart = optionsDoc.search(/^## CI artifact/m);
    expect(
      sectionStart,
      'options.md must contain a "## CI artifact" section before the upload-artifact example can be checked',
    ).toBeGreaterThan(-1);
    const section = optionsDoc.slice(sectionStart);
    expect(
      section,
      'CI artifact section must reference actions/upload-artifact so consumers can copy the snippet directly',
    ).toContain('actions/upload-artifact');
    expect(
      section,
      `CI artifact section must reference the default Output Folder '${DEFAULT_OUTPUT_FOLDER}' so the example matches the reporter default`,
    ).toContain(DEFAULT_OUTPUT_FOLDER);
  });

  test('CI artifact section preserves the bundle on failed runs as well as passing runs', async () => {
    const optionsDoc = await readFile(optionsDocPath, 'utf8');
    const sectionStart = optionsDoc.search(/^## CI artifact/m);
    const section = optionsDoc.slice(sectionStart);
    expect(
      section,
      'CI artifact section must show `if: always()` (or an equivalent failure-also condition) so the bundle is uploaded even when tests fail',
    ).toMatch(/if:\s*always\(\)/);
  });
});

test.describe('Sharded merge-report guidance', () => {
  test('playwright-parity.md publishes a stable "Sharded runs" section so the guidance is discoverable', async () => {
    const parityDoc = await readFile(parityDocPath, 'utf8');
    expect(
      parityDoc,
      'playwright-parity.md must include a stable heading that introduces the sharded merge-report guidance section',
    ).toMatch(/^## Sharded runs/m);
  });

  test('sharded runs section references --shard, blob shards, and Playwright merge-reports', async () => {
    const parityDoc = await readFile(parityDocPath, 'utf8');
    const sectionStart = parityDoc.search(/^## Sharded runs/m);
    expect(
      sectionStart,
      'playwright-parity.md must contain a "## Sharded runs" section before the merge-reports guidance can be checked',
    ).toBeGreaterThan(-1);
    const section = parityDoc.slice(sectionStart);
    expect(
      section,
      'sharded runs section must reference the Playwright `--shard` flag so the matrix example matches Playwright defaults',
    ).toContain('--shard');
    expect(
      section,
      'sharded runs section must reference Playwright `blob` shards so consumers know which reporter to wire into the matrix jobs',
    ).toMatch(/\bblob\b/);
    expect(
      section,
      'sharded runs section must reference `merge-reports` so consumers know how to fold the shard outputs into a Merged Runboard Data Bundle',
    ).toContain('merge-reports');
  });

  test('sharded runs section names the package as the reporter used when replaying merged blobs', async () => {
    const parityDoc = await readFile(parityDocPath, 'utf8');
    const sectionStart = parityDoc.search(/^## Sharded runs/m);
    const section = parityDoc.slice(sectionStart);
    expect(
      section,
      'sharded runs section must name `playwright-runboard-reporter` as the reporter wired into merge-reports so the example is copy-pastable',
    ).toContain('playwright-runboard-reporter');
  });
});
