/**
 * Compatibility Fixture: Attachment Assets.
 *
 * Issue #5 acceptance: "Compatibility Fixtures prove attachment behavior
 * against Playwright HTML reporter output." Each fixture below runs a tiny
 * Playwright suite once with the Runboard Reporter and once with Playwright's
 * official HTML reporter, then asserts the strict comparator finds no
 * Runboard Data Bundle drift outside the documented normalization allowlist.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  compareCompatibility,
  formatDifferences,
  runCompatibilityFixture,
} from '../harness/compatibility-fixture.js';

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
