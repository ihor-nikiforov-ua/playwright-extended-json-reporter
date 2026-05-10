import { defineConfig } from '@playwright/test';

// The Error Catalog Suite proves that all 45 Error Types from the Error
// Catalog survive Runboard Data Contract serialization. It is a heavier
// fixture-coverage check than the Compatibility Smoke Suite and runs in a
// dedicated CI workflow so normal PR feedback stays fast.
export default defineConfig({
  testDir: './tests/error-catalog',
  fullyParallel: true,
  reporter: [['list']],
});
