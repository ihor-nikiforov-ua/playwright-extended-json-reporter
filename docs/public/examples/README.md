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
  playwright-input/
    checkout.spec.ts
  playwright-runboard-report/
    report.json
    <fileId>.json
```

`playwright-runboard-report/` uses the default reporter Output Folder name
documented in [Options and Environment Variables](../options.md). A real
Playwright run would produce the same directory next to its
`playwright.config.ts`.

## Example input

The illustrative Playwright input is shipped in the package at
[`playwright-input/checkout.spec.ts`](./playwright-input/checkout.spec.ts).
It declares the three test cases that the bundle was emitted for, inside a
single source file at `tests/checkout.spec.ts` under a project named
`chromium`, running against Playwright `1.59`:

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

The in-package input is illustrative documentation. The byte-stable input
the drift test regenerates from is a deterministic fixture kept inside the
source repository and not shipped in the package; see the
[Repository links](#repository-links) section below.

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
sample JSON cannot silently rot. The validation regenerates the bundle from
the deterministic fixture and asserts the checked-in files match the
Runboard Reporter's current output. The validation also asserts that
`report.runboard.schemaVersion` matches the `RUNBOARD_SCHEMA_VERSION` export
and that `report.runboard.reporterVersion` matches the package version in
`package.json`, so a contract or version bump that is not reflected in this
example fails CI.

## Repository links

These files drive the regeneration and validation flow above. They live in
the source repository and are **not shipped in the package**, so the links
point at GitHub. Installed-package consumers do not need them; they are
relevant only to maintainers updating the example bundle.

- Deterministic fixture used to regenerate the bundle:
  [`tests/helpers/example-bundle-fixture.ts`](https://github.com/ihor-nikiforov-ua/playwright-runboard-reporter/blob/main/tests/helpers/example-bundle-fixture.ts)
  (repository-only).
- Drift-validation test that fails CI when the checked-in JSON diverges
  from the reporter's current output:
  [`tests/repo/example-bundle.spec.ts`](https://github.com/ihor-nikiforov-ua/playwright-runboard-reporter/blob/main/tests/repo/example-bundle.spec.ts)
  (repository-only).
- Maintainer regenerate script:
  [`scripts/regenerate-example-bundle.mjs`](https://github.com/ihor-nikiforov-ua/playwright-runboard-reporter/blob/main/scripts/regenerate-example-bundle.mjs)
  (repository-only). Maintainers run it after a deliberate contract change
  with:

  ```sh
  node scripts/regenerate-example-bundle.mjs
  ```

  and commit the regenerated files alongside the change.
