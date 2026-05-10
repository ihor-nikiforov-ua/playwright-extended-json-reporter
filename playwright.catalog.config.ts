import { defineConfig } from '@playwright/test';

// The Error Catalog Suite proves that all 45 Error Types from the Error
// Catalog survive Runboard Data Contract serialization. It is a heavier
// fixture-coverage check than the Compatibility Smoke Suite and runs in a
// dedicated CI workflow so normal PR feedback stays fast.
//
// `retries: 1` is a flake mitigation, not a parity bypass. Each catalog
// fixture spawns a real Playwright child process under heavy parallel load,
// and fixtures that hinge on Playwright's `globalTimeout` race (catalog row 9
// in particular) can occasionally serialize the in-flight test result before
// Playwright stamps it as `interrupted`. A real Display Error parity
// regression still fails consistently across retries because the inner
// Playwright invocation is deterministic for the failing case; only
// transient `globalTimeout` timing drift gets absorbed.
export default defineConfig({
  testDir: './tests/error-catalog',
  fullyParallel: true,
  retries: 1,
  reporter: [['list']],
});
