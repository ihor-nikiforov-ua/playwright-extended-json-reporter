# API Reference

The Runboard Reporter Package exposes a small, deliberately stable API
surface. The default export is the reporter class. Named exports cover the
reporter class, its options, and the Runboard Contract Types that describe
the emitted JSON shape.

This page is the human-readable entry point into the public API. The
TypeScript declarations in `dist/index.d.ts` remain authoritative; this page
explains the intent and grouping.

## Exports

- `RunboardReporter` — the Playwright reporter class. Also exported as the
  default export so it can be referenced as `'playwright-runboard-reporter'`
  directly in `playwright.config.ts`.
- `RunboardReporterOptions` — the option object accepted by the reporter
  constructor and by Playwright's `reporter:` array.
- `RUNBOARD_SCHEMA_VERSION` — the Schema Version Constant written into
  `report.runboard.schemaVersion`.
- Runboard Contract Types — `RunboardReport`, `RunboardReportOptions`,
  `RunboardMetadata`, `RunboardStats`, `RunboardMachine`, `RunboardTestFile`,
  `RunboardTestFileSummary`, `RunboardTestCase`, `RunboardTestCaseSummary`,
  `RunboardTestResult`, `RunboardTestResultSummary`,
  `RunboardTestResultStatus`, `RunboardTestResultDisplayError`,
  `RunboardTestOutcome`, `RunboardTestStep`, `RunboardTestAttachment`,
  `RunboardTestAnnotation`, `RunboardLocation`, `RunboardResultEvidence`,
  `RunboardErrorEvidence`, `RunboardErrorEvidenceSource`,
  `RunboardTestErrorEvidence`, `RunboardStatusDerivedErrorEvidence`, and
  `RunboardSourceExcerpt`.

The Runboard Contract Types use a `Runboard` prefix even when they mirror
Playwright HTML Report Data so they are clearly distinguishable from
Playwright's runtime reporter API objects and private HTML reporter data
types.

## Reporter options

The reporter accepts a `RunboardReporterOptions` object. The full option
surface, defaults, precedence, and No-op Compatibility Options live in
[Options and Environment Variables](./options.md).

## TSDoc and editor experience

Public exports and public contract fields are documented with TSDoc so that
generated declarations explain the contract in IDE hovers without requiring
a README lookup. When a TSDoc comment and this page disagree, the TSDoc on
the canonical export wins; this page tracks intent and structure.

## Stability

The exports listed above are considered Public API. Anything else inside
`dist/` is internal and may change at any time. See the Contract Stability
Matrix in [Data Contract](./data-contract.md) for the matching JSON-side
stability promises.
