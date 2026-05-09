# playwright-extended-json-reporter

A small Playwright reporter that writes a normalized JSON summary with test metadata,
retry details, errors, stdio, and attachment references.

## Install

```sh
npm install --save-dev playwright-extended-json-reporter
```

## Usage

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    [
      'playwright-extended-json-reporter',
      {
        outputFile: 'test-results/extended-report.json',
        pretty: true,
      },
    ],
  ],
});
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `outputFile` | `string` | `playwright-extended-report.json` | Path for the generated report. |
| `pretty` | `boolean \| number` | `true` | Pretty-print JSON with 2 spaces, a custom number of spaces, or no spacing. |
| `includeAttachments` | `boolean` | `true` | Include attachment metadata and file paths. |
| `includeStdIO` | `boolean` | `true` | Include serialized stdout and stderr chunks. |

## Development

Use the latest Node.js LTS release.

```sh
npm install
npm run build
```

