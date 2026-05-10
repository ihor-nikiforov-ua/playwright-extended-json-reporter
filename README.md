# playwright-runboard-reporter

A Playwright reporter for [Runboard](#what-this-package-is) that emits a
Playwright HTML Report Data bundle for the current test run,
without rendered HTML, served pages, or static UI assets.

[![CI](https://github.com/ihor-nikiforov-ua/playwright-runboard-reporter/actions/workflows/ci.yml/badge.svg)](https://github.com/ihor-nikiforov-ua/playwright-runboard-reporter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D24-brightgreen.svg)](./docs/public/support-matrix.md)
[![Playwright](https://img.shields.io/badge/Playwright-%3E%3D1.59%20%3C2-45ba4b.svg)](./docs/public/support-matrix.md)

## What this package is

`playwright-runboard-reporter` is a Playwright test reporter that writes a
Runboard Data Bundle: a directory of JSON files plus copied attachment
assets that follows Playwright's official HTML reporter data shape without
emitting any rendered HTML. The bundle is consumed by Runboard, a downstream
dashboard that starts as a clone of Playwright's HTML report and adds
awareness of previous runs.

The package is in **Public Preview Release** posture. Package versions are
`0.x`. The Runboard Data Contract Schema Version is independent of the
package version. See [Release Process](./docs/public/release-process.md).

## Who this package is for

The primary audience is human or AI-agent Playwright users who want a
Playwright-compatible report data bundle as a producer artifact:

- Playwright users who want test-run data on disk without hosting a
  rendered HTML report.
- Runboard integrators who ingest the documented Runboard Data Contract.
- AI agents installing or operating the reporter from documented
  instructions, defaults, and examples.

Advanced consumers can read the documented Runboard Data Contract directly
even when Runboard itself is not deployed. See
[Data Contract](./docs/public/data-contract.md).

## Install

```sh
npm install --save-dev playwright-runboard-reporter
```

The package declares Playwright as a peer dependency: `@playwright/test
>=1.59 <2`. See [Support Matrix](./docs/public/support-matrix.md) for the
Node, Playwright, and TypeScript declaration compatibility policy.

## Configure

Add the reporter to your `playwright.config.ts`. Combine it with any other
Playwright reporter — the Runboard Reporter does not replace `list` or
other developer-facing reporters.

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

Full option surface, environment variable overrides, and No-op
Compatibility Options live in
[Options and Environment Variables](./docs/public/options.md).

## Output overview

A Runboard Reporter run writes a Runboard Data Bundle to the configured
output folder. The default folder is `playwright-runboard-report/`.

```text
playwright-runboard-report/
  report.json
  <fileId>.json
  data/
    <sha>.<ext>
```

- `report.json` is the Report Summary for the run, including aggregate
  stats, project names, top-level errors, Playwright-compatible per-file
  summaries, `report.options`, and Runboard Metadata
  (`schemaVersion`, `reporterVersion`, `playwrightVersion`).
- `<fileId>.json` is one Test File Entry per Playwright test source file,
  with the full Playwright HTML Report Data shape (test cases, retries,
  steps, formatted errors, attachments, stdout, stderr, traces,
  screenshots).
- `data/` holds copied Attachment Assets referenced from the JSON entries.

See [Data Contract](./docs/public/data-contract.md) for the full shape and
schema versioning rules.

## Comparison with Playwright's built-in reporters

The Runboard Reporter is closest in spirit to Playwright's `html` reporter,
but it stops at producing the underlying report data. The table below
compares it to Playwright's built-in `html`, `json`, and `blob` reporters
along the dimensions that usually drive reporter choice.

| Capability                                  | `html`              | `json`           | `blob`              | `playwright-runboard-reporter` |
| ------------------------------------------- | ------------------- | ---------------- | ------------------- | ------------------------------ |
| Emits Playwright HTML Report Data shape     | yes (in the bundle) | no (custom JSON) | no (private format) | yes                            |
| Renders an HTML report UI                   | yes                 | no               | no                  | no                             |
| Serves or opens the report                  | yes                 | no               | no                  | no                             |
| Designed to be merged with `merge-reports`  | no                  | no               | yes                 | yes (replay through Playwright `merge-reports`) |
| Preserves attachments, stdout, traces       | yes                 | partial          | yes                 | yes                            |
| Designed for downstream ingestion           | no                  | yes              | yes (Playwright internal) | yes (documented Runboard Data Contract) |
| Schema-versioned public contract            | no                  | no               | no (Playwright internal) | yes (`RUNBOARD_SCHEMA_VERSION`) |

If you want the rendered HTML report UI directly, use Playwright's `html`
reporter. If you want a Playwright-compatible report **data** bundle on
disk that downstream tools can ingest, this package is the producer.

## Not included

The Runboard Reporter is intentionally narrow. The following are explicit
non-goals of this package:

- **Rendered HTML**: the bundle contains JSON and copied assets. There is
  no `index.html`, no JavaScript bundle, and no static report UI.
- **Report serving or opening**: this package does not start a server,
  open a browser, or respect `open`, `host`, `port`, or
  `doNotInlineAssets`. Those options are accepted as No-op Compatibility
  Options to keep existing Playwright configs valid; see
  [Options and Environment Variables](./docs/public/options.md).
- **Previous Run storage or comparison**: the reporter writes only the
  current run. Storing or comparing historical runs is Runboard's
  responsibility.
- **Runboard UI**: this package does not include the Runboard dashboard
  itself. Runboard consumes the data bundle this reporter produces.
- **Reporter-side Error Classification**: the reporter preserves
  Playwright-compatible Display Errors and Structured Error Evidence, but
  does not assign Error Type labels. Error classification belongs to the
  Runboard or analytics layer. See
  [Playwright Parity](./docs/public/playwright-parity.md).

## Public documentation

Deeper public docs live under [`docs/public/`](./docs/public/README.md):

- [API Reference](./docs/public/api.md) — public exports and the Runboard
  Contract Types surface.
- [Data Contract](./docs/public/data-contract.md) — output layout,
  `report.json`, `<fileId>.json`, attachment assets, Runboard extensions,
  schema versioning, and migration notes.
- [Options and Environment Variables](./docs/public/options.md) — reporter
  options, environment variable overrides, and No-op Compatibility
  Options.
- [Playwright Parity](./docs/public/playwright-parity.md) — what matches
  Playwright HTML Report Data, what is out of scope, and Display Error
  parity.
- [Support Matrix](./docs/public/support-matrix.md) — Node, Playwright,
  and TypeScript declaration compatibility under the Support Matrix
  Policy.
- [Release Process](./docs/public/release-process.md) — Public Preview
  Release posture, Release PRs, Release Tags, Pre-NPM Releases, and
  deferred npm publishing.

## Repository governance

Repository governance docs live in the repository and are intentionally
**not** published in the npm package:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — local setup, verify gate, and
  documentation discipline.
- [`SECURITY.md`](./SECURITY.md) — security disclosure policy and
  in-scope/out-of-scope classes of issues.
- [`CHANGELOG.md`](./CHANGELOG.md) — manually maintained changelog for
  Public Preview Releases.
- [`LICENSE`](./LICENSE) — MIT license matching the package metadata.

## Local development

Contributors run the canonical verify gate on every change:

```sh
npm install
npm run verify
```

Before a Public Preview Release, the heavier release gate runs the all-45
Error Catalog Display Error parity suite:

```sh
npm run release-gate
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full local setup and
documentation discipline, and
[Release Process](./docs/public/release-process.md) for how a release moves
from a Release PR to a Pre-NPM Release.

## License

[MIT](./LICENSE).
