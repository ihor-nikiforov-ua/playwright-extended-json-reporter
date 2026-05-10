# Public Example Bundle

This directory ships a small, real Runboard Data Bundle so consumers can
inspect the actual JSON shape produced by `playwright-runboard-reporter`
without running Playwright themselves. The contract page at
[`../data-contract.md`](../data-contract.md) describes the layout in words;
this example shows the same layout as files.

## Layout

```text
docs/public/examples/
  README.md
  playwright-runboard-report/
    report.json
    <fileId>.json
```

`playwright-runboard-report/` uses the default reporter Output Folder name
documented in [Options and Environment Variables](../options.md). A real
Playwright run would produce the same directory next to its
`playwright.config.ts`.

## Example input

The bundle was emitted for a single Playwright test file at
`tests/checkout.spec.ts` under a project named `chromium`, running against
Playwright `1.59.0`. The file contains three test cases that exercise the
shapes a Runboard ingestion layer must handle:

- `completes purchase as a logged-in user` — a passing test that captured a
  short stdout chunk. Stdout is preserved as a `text/plain` attachment with
  an inline body so the bundle stays self-contained.
- `shows an error for an invalid card` — a failing test whose `result.errors`
  carries a Playwright-compatible Display Error, and whose
  `result.runboard.evidence[]` Runboard Extension carries the index-aligned
  Structured Error Evidence with the underlying message and stack.
- `is skipped pending design review` — a skipped test demonstrating the
  `outcome: 'skipped'` bucket and how skipped cases contribute to aggregate
  stats.

The complete fixture lives at
[`tests/helpers/example-bundle-fixture.ts`](../../../tests/helpers/example-bundle-fixture.ts).
The Runboard Reporter is invoked against the fixture and emits this bundle
verbatim — no hand-edited JSON, no schematic-only output.

## Example output

The two JSON files under `playwright-runboard-report/` are the Report
Summary and the per-file Test File Entry:

- [`playwright-runboard-report/report.json`](./playwright-runboard-report/report.json)
  is the [Report Summary](../data-contract.md#report-summary). It carries
  `report.runboard` Runboard Metadata, aggregate stats, project names,
  per-file summaries, top-level errors, serialized
  [Runboard Report Options](../data-contract.md#report-summary), and a
  `report.machines[]` array that is empty for non-merged runs.
- `playwright-runboard-report/<fileId>.json` is the
  [Test File Entry](../data-contract.md#test-file-entry) for
  `tests/checkout.spec.ts`. The filename uses the Playwright HTML reporter
  file-id algorithm (first 20 hex chars of SHA-1 of the POSIX-normalized
  source path relative to Playwright's `config.rootDir`). It contains the
  full per-test details: results, retries, steps, attachments, Display
  Errors, and `result.runboard` Structured Error Evidence.

## Freshness

`playwright-runboard-report/` is generated and validated by tests, so the
sample JSON cannot silently rot. The validation lives in
[`tests/repo/example-bundle.spec.ts`](../../../tests/repo/example-bundle.spec.ts):
it regenerates the bundle from the same fixture and asserts the checked-in
files match the Runboard Reporter's current output. The validation also
asserts that `report.runboard.schemaVersion` matches the
`RUNBOARD_SCHEMA_VERSION` export and that `report.runboard.reporterVersion`
matches the package version in `package.json`, so a contract or version bump
that is not reflected in this example fails CI.

If a deliberate contract change requires updating the example, run:

```sh
node scripts/regenerate-example-bundle.mjs
```

and commit the regenerated files alongside the change.
