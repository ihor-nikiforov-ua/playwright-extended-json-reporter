# PRD: Playwright Runboard Reporter Data Contract

## Problem Statement

Playwright's official HTML reporter contains the data model needed by a Runboard, but it produces a rendered HTML report rather than a standalone current-run data bundle. The Runboard is a clone of Playwright's HTML report with awareness of Previous Runs, so it needs current-run HTML Report Data in a stable, machine-consumable Runboard Data Contract.

The Runboard needs more than a generic test-results JSON file. It needs Playwright HTML Report Data semantics: per-file lazy loading, retry attempts, steps, formatted and structured error evidence, attachments, traces, screenshots, stdout/stderr, run stats, and machine metadata.

## Solution

Build a Runboard Reporter that emits a Runboard Data Bundle for the current Playwright run. The bundle follows Playwright's HTML reporter data model whenever it applies, avoids rendered report generation, and adds only minimal namespaced Runboard Extensions.

The Runboard Reporter follows an HTML Report Data Parity Rule: match Playwright HTML Report Data and applicable merge behavior for a standalone data bundle. Rendered HTML, static assets, report serving, and automatic opening remain out of scope.

The public package/API uses the resolved Runboard Reporter language: npm package `playwright-runboard-reporter`, default export/class `RunboardReporter`, options type `RunboardReporterOptions`, and `Runboard`-prefixed public data-contract types named around `RunboardReport`.

Public data-contract types are Runboard-owned structural types, even when their field shape mirrors Playwright's HTML reporter data types.

The default output is:

```text
playwright-runboard-report/
  report.json
  <fileId>.json
  data/
    <sha>.<ext>
```

The Runboard owns rendering, history storage, Previous Run comparison, and Error Classification. The Runboard Reporter owns current-run data extraction and bundle writing.

## User Stories

1. As a Playwright user, I want to add one reporter entry to my config, so that my test run produces Runboard-ready data.
2. As a Runboard developer, I want the bundle shape to match Playwright HTML Report Data, so that the Runboard needs minimal translation.
3. As a Runboard developer, I want `report.json` to contain aggregate stats and file summaries, so that Runboard can render the overview quickly.
4. As a Runboard developer, I want one `<fileId>.json` Test File Entry per source test file, so that test details can be lazy-loaded.
5. As a Runboard developer, I want `fileId` to match Playwright's HTML reporter algorithm, so that routing and cached entries behave predictably.
6. As a Runboard developer, I want retry attempts nested under one test case, so that flaky and retried tests are represented like the official HTML report.
7. As a Runboard developer, I want steps, annotations, tags, project names, repeat indexes, status, outcome, duration, and worker data preserved, so that report views can be faithful to Playwright.
8. As a Runboard developer, I want screenshots, traces, videos, stdout, stderr, text attachments, binary attachments, and error context preserved, so that detail panes work.
9. As a Runboard developer, I want Runboard-specific fields under `report.runboard` and `result.runboard`, so that Playwright-shaped fields stay clean.
10. As a Runboard developer, I want `report.runboard.schemaVersion`, `report.runboard.reporterVersion`, and `report.runboard.playwrightVersion`, so that ingestion can be version-aware.
11. As a Runboard developer, I want Structured Error Evidence under `result.runboard`, so that Runboard can render and classify errors without relying only on formatted strings.
12. As a Runboard developer, I want all 45 Error Types covered by internal fixtures, so that unusual Playwright failure shapes survive reporter serialization.
13. As a package consumer, I do not want the Reporter Fixture Suite published with the package, so that installing the reporter does not pull in internal Runboard/reporter tests.
14. As a package maintainer, I want differential Compatibility Fixtures against Playwright's official HTML reporter, so that compatibility drift is caught by tests.
15. As a package maintainer, I want fast smoke coverage in normal CI and a heavier all-45 Error Catalog Suite available separately, so that feedback remains fast while full coverage exists.
16. As a package maintainer, I want the reporter to use Playwright's public reporter API first, so that the package is not brittle across Playwright releases.
17. As a package maintainer, I want any unavoidable mismatch with Playwright's HTML reporter surfaced as an explicit decision, so that accidental divergence does not become contract behavior.

## Implementation Decisions

- Build a Runboard Reporter, not a rendered Runboard app or HTML report generator.
- Use `playwright-runboard-reporter` and `RunboardReporter` as the package/API language.
- Rename the GitHub repository to match `playwright-runboard-reporter`.
- Adopt the HTML Report Data Parity Rule for the Runboard Reporter data-shape target.
- Set the initial Playwright peer dependency support range to `@playwright/test >=1.59 <2`.
- Treat older Playwright `1.40+` error wording research as fixture-design input, not as a support claim.
- Emit only the current run. Previous Runs are handled by the Runboard or its storage/ingestion layer.
- Match Playwright HTML reporter behavior for sharding: direct sharded invocations emit that shard's current-run bundle, while `merge-reports` over blob reports emits one merged Runboard Data Bundle.
- Preserve Playwright-compatible `report.machines[]` metadata for merged blob reports, including shard indexes where Playwright provides them.
- Emit a Runboard Data Bundle with `report.json`, `<fileId>.json`, and `data/<sha>.<ext>` attachment assets.
- Default the output folder to `playwright-runboard-report`.
- Use `outputFolder`, matching Playwright's HTML reporter option name.
- Support `PLAYWRIGHT_RUNBOARD_OUTPUT_DIR`. Do not reuse Playwright HTML reporter env vars or add a `PLAYWRIGHT_RUNBOARD_REPORT` alias.
- Support `attachmentsBaseURL`, defaulting to `data/`, with Runboard-specific env var `PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL`.
- Support Playwright-applicable options: `outputFolder`, `attachmentsBaseURL`, `title`, `noSnippets`, and `noCopyPrompt`.
- Preserve Playwright-applicable report options such as `title`, `noSnippets`, and `noCopyPrompt` in `report.options`, matching Playwright's HTML report shape.
- Define `RunboardReportOptions` as the serialized `report.options` shape, not the reporter constructor options: `{ title?: string; noCopyPrompt?: boolean; noSnippets?: boolean }`.
- Use `RunboardReporterOptions` for reporter constructor/config input.
- Define `RunboardReporterOptions` with `outputFolder`, `attachmentsBaseURL`, `title`, `noSnippets`, `noCopyPrompt`, and the no-op compatibility options `open`, `host`, `port`, and `doNotInlineAssets`.
- Accept `open`, `host`, `port`, and `doNotInlineAssets` as no-op compatibility options because this package does not render or serve HTML.
- Emit a once-per-option warning when a no-op compatibility option is supplied, and do not include no-op compatibility options in `report.options`.
- Clear the Runboard Data Bundle output folder before writing the current run.
- Follow Playwright HTML reporter behavior by warning when the output folder overlaps with Playwright test artifact directories.
- Add a Runboard Reporter safety guard that refuses to clear exact dangerous directories such as the filesystem root, current working directory, config root directory, project test directory, or project output directory.
- Use Playwright-compatible `fileId`: first 20 characters of SHA-1 of the relative source test file name.
- Preserve Playwright HTML reporter field names where possible.
- Export `Runboard`-prefixed public data-contract types rather than bare names such as `TestCase` or `TestResult`.
- Put canonical Runboard Data Contract types and schema constants in `src/contract.ts`, and re-export them from `src/index.ts`.
- Export these public data-contract types for the first supported schema: `RunboardReport`, `RunboardReportOptions`, `RunboardMetadata`, `RunboardStats`, `RunboardLocation`, `RunboardMachine`, `RunboardTestFile`, `RunboardTestFileSummary`, `RunboardTestCase`, `RunboardTestCaseSummary`, `RunboardTestResult`, `RunboardTestResultSummary`, `RunboardTestAttachment`, `RunboardTestStep`, `RunboardResultEvidence`, and `RunboardErrorEvidence`.
- Define `RunboardReport` as the Playwright HTML reporter `HTMLReport` field shape plus `runboard: RunboardMetadata`.
- Define `RunboardTestResult` as the Playwright HTML reporter `TestResult` field shape plus optional `runboard?: RunboardResultEvidence`.
- Add Runboard Extensions only under `report.runboard` and `result.runboard` in the first contract.
- Keep `report.runboard` minimal: `schemaVersion`, `reporterVersion`, and `playwrightVersion`.
- Define `RunboardMetadata` with exactly three required string fields: `schemaVersion`, `reporterVersion`, and `playwrightVersion`.
- Export `RUNBOARD_SCHEMA_VERSION = '1.0.0'` from `src/contract.ts` as the single code-level schema version source.
- Write `report.runboard.schemaVersion` from `RUNBOARD_SCHEMA_VERSION`.
- Use semver for `report.runboard.schemaVersion`, starting the first supported Runboard Data Contract at `1.0.0`.
- Treat `report.runboard.schemaVersion` as the JSON contract version and `report.runboard.reporterVersion` as the Runboard Reporter package version; they can change independently.
- Preserve Playwright-compatible `errors[].message` where possible.
- Add Structured Error Evidence under `result.runboard` for Runboard rendering and classification, but do not add reporter-side `errorType` classification.
- Define `RunboardResultEvidence` as `{ evidence: RunboardErrorEvidence[] }` in the first contract.
- Align Structured Error Evidence entries one-to-one with Playwright HTML-report failure display entries, including status-derived failures that do not have a raw `TestError`.
- When `result.runboard` exists, `result.runboard.evidence[i]` is the structured evidence for `result.errors[i]`.
- Define Structured Error Evidence as a discriminated union with `source: 'test-error'` for evidence derived from a Playwright `TestError` and `source: 'status-derived'` for failures derived from result or expected-status logic.
- Document that Playwright does not expose these source labels; they are Runboard Data Contract provenance labels for the branches currently flattened by Playwright's `formatResultFailure()`: status/expected-status display entries and formatted raw `result.errors[]` entries.
- Define `RunboardErrorEvidence` with only `source`, `message`, `stack`, `value`, `location`, `snippet`, `stepPath`, `stepCategory`, `attachmentIndexes`, and recursive `cause`; `status-derived` evidence requires `message`, while other fields remain optional.
- Use the public Playwright reporter API as the default serializer source.
- Use Compatibility Adapters only for specific gaps where public API data is insufficient, including the merged-report machine metadata hooks needed to match Playwright's HTML reporter.

## Testing Decisions

- Add a Compatibility Smoke Suite that runs in normal CI.
- Add an Error Catalog Suite that exercises all 45 Error Types.
- Use `docs/error-catalog/playwright-error-types.md` as the canonical Error Catalog for the all-45 coverage requirement.
- Keep the Reporter Fixture Suite development-only and excluded from the published package.
- Use differential tests against Playwright's official HTML reporter output for the same fixtures.
- Test external behavior of the Runboard Data Bundle rather than internal implementation details.
- Verify no-op compatibility options are accepted and still produce a valid bundle.
- Verify attachment behavior: copied path assets, inline text bodies, stdout/stderr as attachments, traces/screenshots/videos remaining navigable.
- Verify current-run purity: reporter output does not read or merge Previous Runs.
- Verify merged-report behavior against Playwright's blob `merge-reports` flow.
- Verify schema/version metadata exists under `report.runboard`.

## Out of Scope

- Rendering the Runboard.
- Generating `index.html`.
- Shipping or inlining Playwright HTML reporter static assets.
- Serving or opening a report.
- Embedding report data into a base64 ZIP template.
- Storing Previous Runs.
- Comparing Previous Runs.
- Classifying errors into the 45 Error Types inside the reporter.
- Publishing internal Reporter Fixture Suite files to package consumers.
- Depending broadly on Playwright private runtime modules.

## Further Notes

The local Playwright source at `/Users/ingvar/Projects/playwright` is the primary reference for official HTML reporter behavior while planning locally. The canonical Error Catalog for this repo is `docs/error-catalog/playwright-error-types.md`; the existing synthetic suite at `/Users/ingvar/Projects/ttt` remains useful research material, but its 500-test Runboard-fixture mission is broader than this package's reporter-focused fixture needs.

Any future decision that cannot match Playwright's official HTML reporter behavior should be paused and decided explicitly.
