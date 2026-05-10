import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['error-catalog/**'],
  fullyParallel: true,
  reporter: [['list']],
});
