# Playwright Parity

The Runboard Reporter emits a Playwright HTML Report Data bundle without
rendered HTML. The data shape, naming, and behavior match Playwright's
official HTML reporter wherever that mapping applies to a standalone data
bundle. Rendered UI, static assets, report serving, and report opening are
intentionally out of scope.

This page explains the parity model so consumers know which Playwright
behaviors are guaranteed, which are deliberately omitted, and how Display
Error parity is enforced.

## What matches Playwright HTML Report Data

The HTML Report Data Parity Rule covers the data side of Playwright's HTML
reporter:

- Output folder layout: `report.json`, `<fileId>.json` per source file, and
  copied attachment files under `data/`.
- `<fileId>` derivation: first 20 characters of the SHA-1 of the
  POSIX-normalized source file name relative to Playwright `config.rootDir`.
- Report Summary fields: aggregate stats, project names, top-level errors,
  per-file summaries, Playwright-compatible `report.options`, and (when
  applicable) `report.machines[]` shard metadata after `merge-reports`.
- Full Test File Entry shape: test cases, retry results, steps, formatted
  errors, attachments, stdout, stderr, traces, screenshots, and run
  metadata.
- Display Errors: human-facing failure entries in `result.errors[]` with
  formatted message text and optional codeframe data.
- Attachment handling: path attachments copied into the bundle, text bodies
  inlined where appropriate, stdout/stderr represented as attachments, and
  traces/screenshots preserved.
- Output Folder cleanup, with explicit safety guards against clearing
  filesystem root, `process.cwd()`, Playwright `configDir`,
  `config.rootDir`, project `testDir`, or project `outputDir`.
- `merge-reports` integration: replaying Playwright blob reports through
  the Runboard Reporter emits a Merged Runboard Data Bundle whose
  `report.machines[]` matches Playwright HTML reporter merge behavior.

The first Playwright Support Range is `@playwright/test >=1.59 <2`. A
Playwright minor inside that range is supported when the Compatibility
Fixtures pass for that version. See [Support Matrix](./support-matrix.md).

## What is intentionally out of scope

The Runboard Reporter does not own the rendered HTML reporter UI or the
Runboard application surface. The following are explicit non-goals:

- Rendered HTML report files or any HTML report UI assets.
- Serving the report over HTTP, opening the report in a browser, or any
  `open`/`host`/`port` behavior. These options are accepted as No-op
  Compatibility Options; see [Options and Environment Variables](./options.md).
- Storing or comparing Previous Runs. The reporter only emits the current
  run.
- The Runboard UI itself.
- Reporter-side Error Classification. The reporter preserves Structured
  Error Evidence and Playwright-compatible Display Errors, but does not
  assign Error Type labels. Error classification belongs to the Runboard or
  analytics layer.
- The Playwright JSON reporter shape. The Runboard Data Contract is HTML
  Report Data-shaped without rendered HTML, not a JSON-reporter superset.

## Display Error parity

Display Errors are first-class. The reporter ships an in-package Display
Error Formatter built from public Playwright reporter API data, so users do
not depend on Playwright private internals to get matching error text.

Display Error parity is proven across a maintained Playwright error
catalog, validated end-to-end against Playwright's official HTML reporter
output. The current catalog is the source of truth for what we test; the
catalog size is a maintenance detail, not a permanent public promise, so
this page intentionally does not pin a specific count.

Parity uses strict equality except for a small, documented normalization
allowlist for non-semantic environment noise: path roots, timestamps,
durations, equivalent attachment hashes or paths, snippet/codeframe
line-ending or root-path noise, and version/package metadata. Missing call
logs, assertion diffs, codeframes, causes, screenshot/text diff signals,
step or hook context, or status-derived messages are real parity failures
and are tracked as such.

When the public Playwright reporter API cannot reproduce a specific HTML
Report Data field closely enough, a narrow Compatibility Adapter is added.
These adapters are scoped to the Runboard Reporter and documented in the
maintainer plan rather than in public docs.

## Sharded runs

Playwright supports running tests in parallel across shards by passing
`--shard=<index>/<total>`. Each shard is an independent Playwright
invocation, so wiring the Runboard Reporter into the matrix jobs directly
would produce one Runboard Data Bundle per shard rather than one bundle for
the whole run.

Use Playwright's `blob` reporter on the shard jobs and replay the blobs
through `playwright merge-reports` with the Runboard Reporter on a single
merge job. The merge step emits one Merged Runboard Data Bundle whose
`report.machines[]` is populated with the per-shard metadata, matching
Playwright HTML reporter merge behavior.

1. On each shard job, run Playwright with the `blob` reporter and upload
   the produced blob directory as a CI artifact:

   ```ts
   // playwright.config.ts (shard job)
   import { defineConfig } from '@playwright/test';

   export default defineConfig({
     reporter: process.env.CI ? [['blob']] : [['list']],
   });
   ```

   ```sh
   npx playwright test --shard=${MATRIX_INDEX}/${MATRIX_TOTAL}
   ```

2. On a single merge job, download every shard's blob artifact into one
   directory and replay them through `merge-reports`, wiring
   `playwright-runboard-reporter` as the merge reporter:

   ```sh
   npx playwright merge-reports \
     --reporter playwright-runboard-reporter \
     ./all-blobs
   ```

   This emits the Merged Runboard Data Bundle in the default Output Folder.
   Upload the merged bundle as a single artifact using the
   [CI artifact](./options.md#ci-artifact) snippet from the options page.

Sharded matrices that do not use `merge-reports` still emit per-shard
Runboard Data Bundles, but `report.machines[]` will be empty for each
because the shards never see one another. Use merge-reports whenever you
need one bundle per run.
