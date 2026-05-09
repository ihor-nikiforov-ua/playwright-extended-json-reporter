# Model Review Brief: Runboard Reporter Planning Packet

## Request

Review the Runboard Reporter plan for conceptual consistency, missing decisions, and risks before implementation begins.

## Project Goal

Create a Playwright reporter that emits Runboard-consumable current-run data matching Playwright's official HTML reporter data model wherever possible. The project does not build the Runboard UI and does not generate rendered HTML reports.

## Key Source References

- Local project glossary: `CONTEXT.md`
- PRD: `docs/prd/runboard-reporter-data-contract.md`
- Error Catalog: `docs/error-catalog/playwright-error-types.md`
- Open questions: `docs/grill/unanswered-questions.md`
- ADRs: `docs/adr/`
- Official Playwright HTML reporter source: `/Users/ingvar/Projects/playwright/packages/playwright/src/reporters/html.ts`
- Official HTML reporter data types: `/Users/ingvar/Projects/playwright/packages/html-reporter/src/types.d.ts`
- Existing synthetic error research reference: `references/ttt`

## Settled Decisions

- Build a Runboard Reporter, not a Runboard UI.
- Emit a data bundle, not `index.html`.
- Emit current-run data only.
- Match Playwright HTML reporter data, naming, and behavior whenever applicable.
- If matching Playwright is impossible or conflicts with the Runboard Reporter boundary, stop and ask.
- Output layout:

```text
playwright-runboard-report/
  report.json
  <fileId>.json
  data/
    <sha>.<ext>
```

- Default output folder: `playwright-runboard-report`.
- Package/API naming: `playwright-runboard-reporter`, default export/class `RunboardReporter`.
- Legacy flat reporter compatibility: intentionally removed; old options should fail with migration guidance.
- Playwright support range: `@playwright/test >=1.59 <2`.
- Option name: `outputFolder`, matching Playwright HTML reporter.
- Env var: `PLAYWRIGHT_RUNBOARD_OUTPUT_DIR`; `PLAYWRIGHT_RUNBOARD_REPORT` is intentionally not supported.
- Attachment option: `attachmentsBaseURL`, env `PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL`, default `data/`.
- Support `title`, `noSnippets`, and `noCopyPrompt`.
- Accept `open`, `host`, `port`, and `doNotInlineAssets` as no-op compatibility options.
- Clear output folder before writing a new run.
- Use Playwright-compatible `fileId`: SHA-1 of relative source test file name, first 20 chars.
- Add Runboard Extensions only under `report.runboard` and `result.runboard` in v1.
- `report.runboard` contains only `schemaVersion`, `reporterVersion`, and `playwrightVersion`.
- Preserve Playwright-compatible `errors[].message` where possible.
- Add Structured Error Evidence under `result.runboard`, but do not classify errors in the reporter.
- Runboard or its backend owns Error Classification into the 45 Error Types.
- Internal tests must cover all 45 Error Types.
- Reporter fixtures are development-only and not published to consumers.
- Normal CI runs a fast Compatibility Smoke Suite.
- Full Error Catalog Suite is a separate heavier check.
- Use Playwright public reporter API first.
- Use Compatibility Adapters only for specific public API gaps.

## ADRs Written

- `0001-emit-runboard-data-bundle.md`
- `0002-use-split-file-runboard-data-contract.md`
- `0003-prefer-public-reporter-api-serializer.md`
- `0004-version-the-runboard-data-contract.md`
- `0005-do-not-classify-errors-in-the-reporter.md`
- `0006-name-the-consumer-runboard.md`

## Known Open Questions

See `docs/grill/unanswered-questions.md`. Highest-priority unresolved areas:

- Exact Runboard Data Contract TypeScript shapes.
- Structured Error Evidence v1 fields.
- Differential compatibility test normalization rules.
- Fixture architecture for the all-45 Error Catalog Suite.
- First implementation milestone.
- Playwright version support policy.
- Exact public type naming.

## Review Questions for the Other Model

1. Are any settled decisions inconsistent with each other?
2. Does the plan overfit to Playwright HTML internals in a way that threatens package stability?
3. Does the plan under-specify any data the Runboard will likely need?
4. Is the boundary between reporter, Runboard rendering, Previous Run storage, and Error Classification clear?
5. Are the no-op compatibility options a good idea, or should unsupported options fail loudly?
6. Is the proposed testing split enough to protect the all-45 Error Type requirement?
7. What should be the first implementation PR?

## Important Caution

Do not reinterpret "support all 45 Error Types" as adding `errorType` classification to reporter output. The settled decision is that the reporter preserves evidence for all 45 shapes; classification belongs to Runboard or the analytics layer.
