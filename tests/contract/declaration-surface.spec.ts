/**
 * Public declaration-surface contract for the published reporter package.
 *
 * The PRD requires only a *narrow* Compatibility Adapter for Playwright
 * reporter API gaps. Playwright's `merge-reports` Multiplexer dispatches
 * `version`, `onReportConfigure`, and `onReportEnd` via optional chaining,
 * so the reporter must implement them at runtime — but their payload shapes
 * are Playwright-internal and must not surface in this package's public
 * type surface. This spec asserts the generated `dist/runboard-reporter.d.ts`
 * exposes only the public Playwright Reporter API.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reporterDts = resolve(repoRoot, 'dist', 'runboard-reporter.d.ts');

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
});
