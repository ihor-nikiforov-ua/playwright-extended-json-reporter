# Grilling Session Handoff

Last updated: 2026-05-09.

This file preserves the state of the Runboard Reporter planning session so the next grilling session can continue without replaying old decisions. Treat the "Resolved" section as settled unless the user explicitly reopens it.

## Resolved This Session

- V1 means parity with every Playwright HTML reporter data-contract and merge behavior that applies to a standalone data bundle.
- Rendered HTML, Playwright HTML static assets, report serving, and automatic opening are out of scope.
- The Runboard Reporter is a clean replacement for the legacy flat Extended JSON Reporter.
- Do not preserve legacy flat reporter options: `outputFile`, `pretty`, `includeAttachments`, or `includeStdIO`.
- If legacy flat reporter options are supplied, fail fast with migration guidance.
- The GitHub repository should be renamed as part of the clean slate.
- The npm package name and matching GitHub repository name should be `playwright-runboard-reporter`.
- The downstream consumer should be named **Runboard**.
- The default export/class should be `RunboardReporter`.
- Export `RunboardReporterOptions`.
- Export main public contract types around `RunboardReport`, including `RunboardReport`, `RunboardTestFile`, `RunboardTestResult`, `RunboardMetadata`, `RunboardResultEvidence`, and `RunboardErrorEvidence`.
- `report.runboard.schemaVersion` is the Runboard Data Contract version.
- `report.runboard.reporterVersion` is the Runboard Reporter package version.
- `schemaVersion` and `reporterVersion` move independently.
- The first supported `schemaVersion` is `1.0.0`.
- Schema Version uses semver: major for breaking JSON contract changes, minor for additive compatible fields or enum values, patch for clarifications or bugfixes that do not change JSON shape.
- Initial Playwright support range is `@playwright/test >=1.59 <2`.
- Older Playwright `1.40+` wording research informs fixture design but is not a v1 compatibility promise.
- `title`, `noSnippets`, and `noCopyPrompt` live in Playwright-shaped `report.options`, not in `report.runboard`.
- `open`, `host`, `port`, and `doNotInlineAssets` are accepted as no-op compatibility options.
- No-op compatibility options warn once per supplied option and are not included in `report.options`.
- The only Runboard Output Environment Variable is `PLAYWRIGHT_RUNBOARD_OUTPUT_DIR`.
- `PLAYWRIGHT_RUNBOARD_REPORT` is intentionally not supported.
- Output folder cleanup follows Playwright HTML reporter behavior, with an extra safety guard.
- The reporter warns when the Output Folder overlaps Playwright artifact directories.
- The reporter refuses to clear exact dangerous directories such as filesystem root, current working directory, config root directory, project test directory, or project output directory.
- Direct sharded Playwright invocations emit the current shard's Runboard Data Bundle.
- `merge-reports` over blob reports emits one merged Runboard Data Bundle, matching Playwright HTML reporter behavior.
- `report.machines[]` shard metadata is part of v1 compatibility.
- Merged-report machine metadata hooks are an explicit Compatibility Adapter case because they are not exposed by the public Reporter interface.
- Structured Error Evidence lives under `result.runboard`.
- Structured Error Evidence entries align one-to-one with Playwright HTML-report failure display entries, not necessarily one-to-one with raw `result.errors[]`.
- Structured Error Evidence v1 fields are `source`, `message`, `stack`, `value`, `location`, `snippet`, `stepPath`, `stepCategory`, `attachmentIndexes`, and recursive `cause`.
- The reporter does not classify Error Types and must not emit an `errorType` field.
- The canonical Error Catalog lives in this repo at `docs/error-catalog/playwright-error-types.md`.
- `/Users/ingvar/Projects/ttt` is research material, not the source of truth.
- The Error Catalog has 45 Error Types; the old "30 distinct error types" wording is stale.
- The Runboard naming decision is captured in `docs/adr/0006-name-the-consumer-runboard.md`.

## Open Questions For Next Session

### 1. Exact Runboard Data Contract Types

Finalize TypeScript shapes for:

- `report.json`
- `<fileId>.json`
- `report.runboard`
- `result.runboard`
- exported local structural copies of Playwright HTML reporter data types

Current leaning:

- V1 supports every Playwright HTML reporter data-contract and merge behavior that applies to a standalone data bundle.
- Match Playwright HTML reporter types wherever possible.
- Add only minimal Runboard Extensions.
- Do not import or re-export Playwright private `@html-reporter/types`.
- Export local structural types that mirror Playwright HTML reporter data.
- `RunboardReport = HtmlReportLike & { runboard: RunboardMetadata }`.
- `RunboardTestResult = HtmlTestResultLike & { runboard?: RunboardResultEvidence }`.

Question to resolve:

- What exact public type names and nested type names should be exported?

### 2. Compatibility Diff Rules

Decide how differential tests compare Runboard Reporter output with Playwright HTML reporter output.

Likely normalized fields:

- timestamps
- durations
- absolute paths
- attachment hashes
- machine-specific metadata
- codeframe/snippet text if public APIs cannot reproduce exact formatting

Question to resolve:

- Which fields require exact equality, and which require semantic equality?

### 3. File Identity And Cross-Run Stability

Some details are answerable from Playwright source, but still need explicit documentation.

Questions to resolve or document:

- `fileId` is based on the Playwright HTML reporter algorithm: first 20 chars of SHA-1 of the relative source file name.
- Confirm/document the relative root: Playwright HTML reporter uses `config.rootDir` and POSIX separators.
- Confirm/document that one `<fileId>.json` merges results across projects for the same source file, with `projectName` distinguishing project entries.
- Confirm/document that Playwright `testId` is preserved as the Runboard join key across runs, with a merged-report caveat for duplicate IDs that Playwright salts during blob merge.
- Decide whether to document truncated SHA-1 collision handling or detection.

### 4. Fixture Architecture

Settled:

- Fixture suite is development-only.
- Normal CI runs a Compatibility Smoke Suite.
- Error Catalog Suite covers all 45 Error Types separately.
- Fixtures are not published to package consumers.
- `docs/error-catalog/playwright-error-types.md` is the canonical Error Catalog.

Questions to resolve:

- Should all-45 fixtures be generated from a manifest?
- Should fixtures reuse any code from `/Users/ingvar/Projects/ttt`, or only use it as research?
- How slow can the Error Catalog Suite be?
- Should the Error Catalog Suite run in scheduled CI, manual CI, or both?

### 5. Implementation Staging

Proposed first implementation PR:

- rename package/API metadata
- replace stale README with v1 contract and migration docs
- add exported TypeScript contract types
- update peer dependency to `@playwright/test >=1.59 <2`
- introduce `RunboardReporterOptions`
- fail fast on legacy flat reporter options

Question to resolve:

- Is the first PR contract/docs/types only, or should it also include the split-file bundle writer?

### 6. Documentation Scope

Questions to resolve:

- Do we publish a schema reference in README, separate docs, or both?
- Do we document the Error Catalog Suite for contributors only?
- Do we document Runboard ingestion assumptions?
- Should `docs/review/model-review-brief.md` stay as a dated one-shot brief, or should unique points be folded into canonical docs and the brief removed?

### 7. Compatibility Adapter Inventory

Known adapter case:

- merged blob-report machine metadata hooks for `report.machines[]`

Questions to resolve later:

- Which other HTML reporter fields cannot be reproduced closely enough from the public reporter API?
- Should each adapter be documented in one file as it is introduced?

## Useful Local References

- Playwright source: `/Users/ingvar/Projects/playwright`
- Synthetic suite research: `/Users/ingvar/Projects/ttt`
- Canonical Error Catalog: `docs/error-catalog/playwright-error-types.md`
- PRD: `docs/prd/runboard-reporter-data-contract.md`
- Domain glossary: `CONTEXT.md`
- ADRs: `docs/adr/`
