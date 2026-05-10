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

## Release Gate

The canonical `npm run verify` gate runs on every PR and covers Biome, lint, typecheck, repo invariants, smoke tests (including Source Excerpt schema `1.1.0` contract coverage), and pack verification. It keeps PR feedback fast by skipping the heavier all-45 Error Catalog Display Error parity suite.

Before publishing a release, run the release gate:

```sh
npm run release-gate
```

`npm run release-gate` chains `npm run verify` with `npm run test:catalog`, which parametrizes the Error Catalog Display Error parity suite over every Error Type. A parity failure fails the gate with a report that names the catalog ID, Error Type, and divergent fields. The same gate runs in CI through the `Release Gate` workflow on `release.published` and `workflow_dispatch`.
