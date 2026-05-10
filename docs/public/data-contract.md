# Data Contract

The Runboard Reporter writes a Runboard Data Bundle for the current
Playwright test run. The bundle is a directory of JSON files plus copied
attachment assets. It carries Playwright HTML Report Data semantics without
containing rendered HTML, served pages, or static UI assets.

This page describes the public, versioned shape of that output and the
rules around it. The canonical maintainer plan for the data contract lives
under `docs/prd/runboard-reporter-data-contract.md` and is not part of the
public docs spine.

## Output layout

The default Output Folder is `playwright-runboard-report/`. The Runboard
Reporter clears it before writing the current run, following Playwright's
HTML reporter cleanup model and the guards documented in
[Options and Environment Variables](./options.md).

```text
playwright-runboard-report/
  report.json
  <fileId>.json
  data/
    <sha>.<ext>
```

- `report.json` is the Report Summary for the run.
- `<fileId>.json` is one Test File Entry per Playwright test source file.
- `data/` holds copied Attachment Assets (screenshots, traces, videos,
  stdout/stderr, error context, user attachments).

The exact filename `<fileId>` matches Playwright HTML reporter file IDs: the
first 20 characters of the SHA-1 of the POSIX-normalized source file name
relative to Playwright's `config.rootDir`.

## Report Summary

`report.json` contains the lightweight Playwright HTML Report Data summary
plus the Runboard Metadata extension. It carries:

- Schema and version markers (`report.runboard.schemaVersion`,
  `report.runboard.reporterVersion`, `report.runboard.playwrightVersion`).
- Aggregate run stats and project names.
- Top-level errors raised before the run started.
- Playwright-compatible per-file summaries.
- A `report.machines[]` array. Ordinary non-merged runs use an empty array;
  Merged Runboard Data Bundles produced through `merge-reports` populate
  Playwright-compatible shard metadata.
- `report.options`, containing only Playwright-applicable display options
  (`title`, `noCopyPrompt`, `noSnippets`). See
  [Options and Environment Variables](./options.md) for which option keys
  are preserved here.

## Test File Entry

Each `<fileId>.json` contains the full Playwright HTML Report Data shape for
one test source file: test cases, retry results, steps, formatted errors,
attachments, stdout, stderr, traces, screenshots, and run metadata.

The naming and structure mirror Playwright's HTML reporter so a Runboard
ingestion layer can consume entries directly.

## Attachment assets

Path attachments referenced by Playwright are copied into `data/` under a
content-addressed filename (`<sha>.<ext>`) and referenced from the JSON
entries through the Attachments Base URL (default `data/`). Text bodies may
be inlined into the JSON. Standard output and standard error are represented
as attachments. Traces and screenshots remain navigable from the bundle.

The base path used in attachment references is configured with
`attachmentsBaseURL` or the `PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL`
environment variable.

## Runboard extensions

The Runboard Data Contract preserves Playwright HTML reporter field names
wherever possible. Any Runboard Extension is namespaced under a Runboard
key so it does not collide with Playwright-shaped fields:

- `report.runboard` — Runboard Metadata. Contains exactly `schemaVersion`,
  `reporterVersion`, and `playwrightVersion`.
- `result.runboard` — Result Evidence. Contains an `evidence` array aligned
  by index to one Playwright-compatible serialized `result.errors[]` entry
  per attempt.

Result Evidence entries are Structured Error Evidence. They preserve
structured failure details (call logs, location, snippet, step context,
attachment indexes, recursive causes) and may include a Source Excerpt when
source snippets are enabled. They never replace Display Error parity: the
Playwright-compatible `result.errors[]` array is still the canonical human
display surface.

Reporter-side Error Classification is intentionally out of scope. Error
classification belongs to the Runboard or analytics layer, not the reporter.

## Schema versioning

The Runboard Data Contract carries its own Schema Version, exported as
`RUNBOARD_SCHEMA_VERSION` and written into `report.runboard.schemaVersion`.
The Schema Version follows semver and is independent of both the package
version and the Playwright version, so the Runboard can choose
ingest-compatible behavior even when the reporter or Playwright bumps.

The current Schema Version is `1.1.0`. `1.1.0` adds optional Source Excerpts
under `result.runboard.evidence[].sourceExcerpt` while remaining backward
compatible with the original `1.0.0` shape.

## Migration notes

- `1.0.0` → `1.1.0`: Source Excerpts are optional. Consumers that ignored
  unknown fields continue to work without changes. Consumers that want to
  render Runboard-native codeframes can read
  `result.runboard.evidence[].sourceExcerpt` when present. Source Excerpts
  are suppressed by `noSnippets: true`.

Forward-looking migration notes are added in the same Release PR that ships
a Schema Version change. Breaking changes to the Schema Version follow
semver: the major bump is the public signal, and this page documents the
migration path before the release ships.

## Contract Stability Matrix

The Contract Stability Matrix separates the Runboard Reporter's consumer
surfaces by how strong a stability promise the package makes about them.
"Stable" here means stability under the Public Preview Release posture in
[Release Process](./release-process.md): breaking changes follow semver and
are called out in [`CHANGELOG.md`](../../CHANGELOG.md) before the release
ships.

| Surface                                                                                       | Category                  | Stability promise |
| --------------------------------------------------------------------------------------------- | ------------------------- | ----------------- |
| `RunboardReporter` default and named exports                                                  | Stable public promise     | Breaking changes follow semver and are documented in [`CHANGELOG.md`](../../CHANGELOG.md). |
| `RunboardReporterOptions` and documented [Options and Environment Variables](./options.md)    | Stable public promise     | Defaults, names, and precedence are documented; option removal or rename is a breaking package-API change. |
| `RUNBOARD_SCHEMA_VERSION` and Runboard Contract Types ([API Reference](./api.md))             | Stable public promise     | Breaking type-shape changes follow semver on the package version. |
| `report.json` and `<fileId>.json` field shapes (Playwright HTML Report Data parity)           | Schema-versioned          | Governed by `report.runboard.schemaVersion`; changes follow Schema Version semver, not package semver. |
| Runboard Extensions under `report.runboard` and `result.runboard`                             | Schema-versioned          | Same schema-version semver as the JSON contract; additive fields land in minor bumps, breaking changes in majors. |
| Source Excerpts (`result.runboard.evidence[].sourceExcerpt`)                                  | Preview                   | Stable shape under schema `1.1.0`; treated as a preview area because the surrounding Structured Error Evidence may evolve before the broader Runboard ecosystem reaches `1.0`. |
| Anything inside `dist/` not re-exported from `src/index.ts`                                   | Internal (no promise)     | Not part of the contract; may change at any time without notice. |
| Maintainer plans under `docs/prd/`, `docs/adr/`, repository configuration, tests, fixtures    | Internal (no promise)     | Excluded from the packed package and not part of the public surface. |

The Contract Stability Matrix governs intent. The
[API Reference](./api.md) lists the exact stable export names, and the
sections above on Output layout, Report Summary, Test File Entry, and
Runboard extensions describe the schema-versioned JSON shape.
