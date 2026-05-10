#!/usr/bin/env node
// @ts-check
/**
 * Regenerate the Public Example Bundle checked in under
 * `docs/public/examples/playwright-runboard-report/`.
 *
 * The bundle is the consumer-facing "real JSON" companion to the Public Data
 * Contract Page. Running this script re-emits the bundle from the
 * deterministic fixture in `tests/helpers/example-bundle-fixture.ts` so a
 * deliberate contract change can refresh the example without hand-editing
 * JSON. CI never runs this script; the matching validation test in
 * `tests/repo/example-bundle.spec.ts` fails when the checked-in bundle drifts
 * from the reporter's current output.
 *
 * The script delegates to Playwright's test runner so the TypeScript helper
 * is loaded through the same resolver that the validation test uses. The
 * `UPDATE_EXAMPLE_BUNDLE=1` environment variable flips the test from "compare
 * to checked-in" to "write to checked-in".
 */
import { spawn } from 'node:child_process';

const child = spawn(
  'npx',
  ['playwright', 'test', 'tests/repo/example-bundle.spec.ts', '--reporter=list', '--workers=1'],
  {
    stdio: 'inherit',
    env: { ...process.env, UPDATE_EXAMPLE_BUNDLE: '1' },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
