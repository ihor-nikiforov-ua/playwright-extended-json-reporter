/**
 * Compatibility Fixture: Attachment Assets.
 *
 * Issue #5 acceptance: "Compatibility Fixtures prove attachment behavior
 * against Playwright HTML reporter output." Each fixture below runs a tiny
 * Playwright suite once with the Runboard Reporter and once with Playwright's
 * official HTML reporter, then asserts the strict comparator finds no
 * Runboard Data Bundle drift outside the documented normalization allowlist.
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  type CompatibilityRun,
  collectReferencedAttachmentBasenames,
  compareCompatibility,
  formatDifferences,
  runCompatibilityFixture,
} from '../harness/compatibility-fixture.js';

/**
 * Assert that every `<sha>.<ext>` path either reporter writes into its bundle
 * actually exists on disk on both sides and the bytes match. The strict
 * comparator already catches one-sided omissions through its missing-asset
 * sentinel, but stating the invariant directly here keeps the test readable
 * and makes Issue #5's "data files exist and byte-match" expectation visible
 * without forcing a regression to come back through the comparator.
 */
function expectReferencedAssetsByteMatch(run: CompatibilityRun): void {
  const baseUrl = run.attachmentsBaseURL ?? 'data/';
  const refs = new Set<string>([
    ...collectReferencedAttachmentBasenames(run.htmlFiles, baseUrl),
    ...collectReferencedAttachmentBasenames(run.runboardFiles, baseUrl),
  ]);
  expect(refs.size).toBeGreaterThan(0);
  for (const basename of refs) {
    const htmlBytes = run.htmlAttachments?.get(basename);
    const runboardBytes = run.runboardAttachments?.get(basename);
    expect(htmlBytes, `Playwright HTML reporter missing copied asset ${basename}`).toBeDefined();
    expect(runboardBytes, `Runboard Reporter missing copied asset ${basename}`).toBeDefined();
    expect(runboardBytes?.equals(htmlBytes ?? Buffer.alloc(0))).toBe(true);
  }
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDist = resolve(repoRoot, 'dist', 'runboard-reporter.js');

test.describe('Compatibility Fixture — Attachment Assets', () => {
  let workDir: string;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  });

  test.beforeEach(async () => {
    workDir = await mkdtemp(join(repoRoot, '.runboard-compat-att-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('inline text body attachment matches Playwright HTML reporter', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'text-attach.spec.ts': [
          `import { test } from '@playwright/test';`,
          `test('attaches a text note', async ({}, testInfo) => {`,
          `  await testInfo.attach('note', {`,
          `    body: 'inline runboard note',`,
          `    contentType: 'text/plain',`,
          `  });`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Attachment Compatibility Fixture failure (text body):\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);
  });

  test('binary body attachment matches Playwright HTML reporter', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'binary-attach.spec.ts': [
          `import { test } from '@playwright/test';`,
          `test('attaches a binary blob', async ({}, testInfo) => {`,
          `  await testInfo.attach('blob.bin', {`,
          `    body: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]),`,
          `    contentType: 'application/octet-stream',`,
          `  });`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Attachment Compatibility Fixture failure (binary body):\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);
  });

  test('path-backed file attachment matches Playwright HTML reporter', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'path-attach.spec.ts': [
          `import { mkdtempSync, writeFileSync } from 'node:fs';`,
          `import { tmpdir } from 'node:os';`,
          `import { join } from 'node:path';`,
          `import { test } from '@playwright/test';`,
          `test('attaches a file from disk', async ({}, testInfo) => {`,
          `  const dir = mkdtempSync(join(tmpdir(), 'runboard-att-'));`,
          `  const file = join(dir, 'cap.png');`,
          `  // Minimal PNG signature so the bytes look like a real screenshot.`,
          `  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]));`,
          `  await testInfo.attach('screenshot', { path: file, contentType: 'image/png' });`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Attachment Compatibility Fixture failure (path attachment):\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);
    expectReferencedAssetsByteMatch(run);
  });

  test('non-default attachmentsBaseURL routes copied assets through the configured prefix', async () => {
    // Issue #5 acceptance: "`attachmentsBaseURL` controls serialized
    // copied-asset paths and defaults to `data/`." Both reporters share the
    // same custom prefix; the comparator (now strict about referenced bytes)
    // proves both still write the underlying asset and reference it through
    // the prefix.
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      attachmentsBaseURL: 'assets/',
      specs: {
        'baseurl-attach.spec.ts': [
          `import { mkdtempSync, writeFileSync } from 'node:fs';`,
          `import { tmpdir } from 'node:os';`,
          `import { join } from 'node:path';`,
          `import { test } from '@playwright/test';`,
          `test('attaches a file with a custom attachmentsBaseURL', async ({}, testInfo) => {`,
          `  const dir = mkdtempSync(join(tmpdir(), 'runboard-baseurl-'));`,
          `  const file = join(dir, 'cap.png');`,
          `  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xab, 0xcd]));`,
          `  await testInfo.attach('screenshot', { path: file, contentType: 'image/png' });`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Attachment Compatibility Fixture failure (custom attachmentsBaseURL):\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);
    expectReferencedAssetsByteMatch(run);
  });

  test('trace, video, and error-context attachments match Playwright HTML reporter', async () => {
    // Issue #5 acceptance: "Screenshots, traces, videos, and error context
    // remain navigable from serialized Test File Entries." Each attachment
    // is treated like any other path-backed asset by both reporters; the
    // fixture forges representative bytes and contentTypes so the parity
    // check covers the names and extensions Playwright emits in real runs.
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'trace-video-context.spec.ts': [
          `import { mkdtempSync, writeFileSync } from 'node:fs';`,
          `import { tmpdir } from 'node:os';`,
          `import { join } from 'node:path';`,
          `import { test } from '@playwright/test';`,
          `test('attaches trace, video, and error-context assets', async ({}, testInfo) => {`,
          `  const dir = mkdtempSync(join(tmpdir(), 'runboard-trace-'));`,
          `  // PK header so the bytes look like a real Playwright trace zip.`,
          `  const traceFile = join(dir, 'trace.zip');`,
          `  writeFileSync(traceFile, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));`,
          `  await testInfo.attach('trace', { path: traceFile, contentType: 'application/zip' });`,
          `  // EBML header so the bytes parse as a webm container.`,
          `  const videoFile = join(dir, 'video.webm');`,
          `  writeFileSync(videoFile, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42]));`,
          `  await testInfo.attach('video', { path: videoFile, contentType: 'video/webm' });`,
          `  // Plain markdown to mirror Playwright's error-context attachment shape.`,
          `  const ecFile = join(dir, 'error-context.md');`,
          `  writeFileSync(ecFile, '# Page snapshot\\n- main\\n  - ref: e1');`,
          `  await testInfo.attach('error-context', { path: ecFile, contentType: 'text/markdown' });`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Attachment Compatibility Fixture failure (trace/video/error-context):\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);
    expectReferencedAssetsByteMatch(run);
  });

  test('stdout and stderr attachments match Playwright HTML reporter', async () => {
    const run = await runCompatibilityFixture({
      workDir,
      reporterDist,
      specs: {
        'stdio.spec.ts': [
          `import { test } from '@playwright/test';`,
          `test('emits stdout and stderr', () => {`,
          `  console.log('runboard stdout line');`,
          `  console.error('runboard stderr line');`,
          `});`,
          '',
        ].join('\n'),
      },
    });

    const diffs = compareCompatibility(run);
    if (diffs.length > 0) {
      throw new Error(
        `Attachment Compatibility Fixture failure (stdio):\n${formatDifferences(diffs)}`,
      );
    }
    expect(diffs).toEqual([]);
  });
});
