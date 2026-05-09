# playwright-runboard-reporter

A Playwright reporter for Runboard. It emits a current-run Runboard Data Bundle that follows Playwright's official HTML Report Data shape without generating a rendered HTML report.

The canonical in-repo data-contract plan lives in [`docs/prd/runboard-reporter-data-contract.md`](docs/prd/runboard-reporter-data-contract.md); GitHub Issues track implementation work.

## Target Usage

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    [
      'playwright-runboard-reporter',
      {
        outputFolder: 'playwright-runboard-report',
      },
    ],
  ],
});
```

## Target Output

```text
playwright-runboard-report/
  report.json
  <fileId>.json
  data/
    <sha>.<ext>
```

## Development

```sh
npm install
npm run build
```
