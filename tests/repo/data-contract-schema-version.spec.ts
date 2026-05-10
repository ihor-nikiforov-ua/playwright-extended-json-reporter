/**
 * Schema-version drift check for the Public Data Contract Page.
 *
 * The Public Data Contract Page (`docs/public/data-contract.md`) names the
 * current Runboard Data Contract Schema Version in consumer-facing prose.
 * These tests assert the documented schema version stays in lock-step with
 * `RUNBOARD_SCHEMA_VERSION` so a code-level schema bump cannot leave the
 * Public Data Contract Page reading a stale hand-written value.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { RUNBOARD_SCHEMA_VERSION } from '../../src/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataContractPath = resolve(repoRoot, 'docs/public/data-contract.md');

test.describe('Public Data Contract Page schema version freshness', () => {
  test('data-contract.md names the current Schema Version in its consumer-facing prose', async () => {
    const doc = await readFile(dataContractPath, 'utf8');
    expect(
      doc,
      `data-contract.md must mention the current Schema Version \`${RUNBOARD_SCHEMA_VERSION}\` so consumers see a freshness-checked value`,
    ).toContain(`\`${RUNBOARD_SCHEMA_VERSION}\``);
  });

  test('every "current Schema Version" claim in data-contract.md matches RUNBOARD_SCHEMA_VERSION', async () => {
    const doc = await readFile(dataContractPath, 'utf8');
    const currentVersionPattern = /current\s+Schema\s+Version\s+is\s+`([^`]+)`/gi;
    const matches = [...doc.matchAll(currentVersionPattern)];
    expect(
      matches.length,
      'data-contract.md must explicitly call out the current Schema Version so the drift check can anchor against it',
    ).toBeGreaterThan(0);
    for (const match of matches) {
      expect(
        match[1],
        `data-contract.md says current Schema Version is \`${match[1]}\` but RUNBOARD_SCHEMA_VERSION is \`${RUNBOARD_SCHEMA_VERSION}\``,
      ).toBe(RUNBOARD_SCHEMA_VERSION);
    }
  });
});
