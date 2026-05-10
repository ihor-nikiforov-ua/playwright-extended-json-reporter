# Playwright Runboard Reporter

This package produces Playwright test-run data for Runboard, a dashboard that follows the official Playwright HTML report and adds awareness of previous runs.

## Language

**Runboard Reporter**:
A Playwright reporter that emits Runboard-consumable data for the current test run.
_Avoid_: Custom JSON reporter

**Runboard Reporter Package**:
The npm package named `playwright-runboard-reporter`, exporting `RunboardReporter` as the default reporter implementation.
_Avoid_: Generic JSON reporter package

**HTML Report Data**:
The data model consumed by Playwright's official HTML report UI, including run summary, per-file test details, retry results, steps, formatted errors, attachments, stdout, stderr, traces, screenshots, and run metadata.
_Avoid_: Plain JSON summary, report dump

**Runboard Data Contract**:
The stable data-bundle output shape produced by the Runboard Reporter and consumed by the Runboard; it does not include a rendered HTML report.
_Avoid_: Report UI, rendered report

**Producer Contract Test**:
A reporter-side automated test that proves emitted Runboard Data Bundle files match the Runboard Data Contract.
_Avoid_: Runtime producer validation, consumer ingest validation

**Runboard Contract Type**:
A public TypeScript export that describes the versioned Runboard Data Contract JSON shape and uses a `Runboard` prefix even when its fields mirror Playwright HTML Report Data.
_Avoid_: Bare TestCase, bare TestResult, private HTML reporter type re-export

**Contract Module**:
The `src/contract.ts` source module that owns Runboard Data Contract public types and schema constants before they are re-exported by the package entrypoint.
_Avoid_: types bucket, docs-only schema

**Report Summary**:
The `report.json` entry in the Runboard Data Contract, containing schema/version markers, run metadata, aggregate stats, project names, top-level errors, and Playwright-compatible per-file summaries.
_Avoid_: Root report, main JSON

**Schema Version**:
A semver Runboard Data Contract version number that lets the Runboard choose compatible ingestion behavior independently of the Runboard Reporter package version and Playwright version.
_Avoid_: Reporter version, Playwright version

**Schema Version Constant**:
The `RUNBOARD_SCHEMA_VERSION` export from the Contract Module used whenever the reporter writes `report.runboard.schemaVersion`.
_Avoid_: Magic schema string, duplicated schema version

**Reporter Version**:
The Runboard Reporter package version that identifies which reporter build produced a Runboard Data Bundle.
_Avoid_: Schema version, Playwright version

**Runboard Extension**:
A Runboard Data Contract field that is not part of Playwright's HTML Report Data and must live under a clearly named Runboard-specific object.
_Avoid_: Custom top-level field, extra field

**Test File Entry**:
A `<fileId>.json` entry in the Runboard Data Contract, containing full Playwright-compatible test-case details for one source test file; `fileId` follows Playwright HTML reporter compatibility by using the first 20 characters of the SHA-1 of the POSIX-normalized source file name relative to Playwright `config.rootDir`.
_Avoid_: Spec dump, details blob

**Attachment Asset**:
A file or inline body referenced by a test result attachment, including screenshots, traces, videos, stdout, stderr, error context, and user attachments.
_Avoid_: Artifact, blob

**Runboard Data Bundle**:
The output directory produced by the Runboard Reporter, defaulting to `playwright-runboard-report`, containing `report.json`, one `<fileId>.json` per Test File Entry, and copied Attachment Assets under `data/`.
_Avoid_: HTML report, report folder

**Output Folder**:
The configurable directory where the Runboard Reporter writes the Runboard Data Bundle, resolved to an absolute path before cleanup.
_Avoid_: Output file, report file

**Runboard Output Environment Variable**:
`PLAYWRIGHT_RUNBOARD_OUTPUT_DIR` overrides the Runboard Reporter's Output Folder without colliding with Playwright's official HTML reporter environment variables.
_Avoid_: PLAYWRIGHT_RUNBOARD_REPORT, PLAYWRIGHT_RUNBOARD_OUTPUT_FOLDER, PLAYWRIGHT_HTML_OUTPUT_DIR, PLAYWRIGHT_HTML_REPORT

**Attachments Base URL**:
The base path used for copied Attachment Asset references, configured with `attachmentsBaseURL` or `PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL`, defaulting to `data/`.
_Avoid_: HTML attachments base URL

**Runboard Reporter Options**:
The reporter option surface, mirroring Playwright's HTML reporter option names wherever they apply to a Runboard Data Bundle.
_Avoid_: Custom options, JSON reporter options

**Runboard Report Options**:
The serialized `report.options` contract shape containing Playwright-applicable display options preserved in the Report Summary.
_Avoid_: Reporter constructor options, output configuration

**No-op Compatibility Option**:
A Playwright HTML reporter option accepted by the Runboard Reporter for config compatibility but ignored with a once-per-option `onBegin` warning because this package does not render, serve, or open HTML.
_Avoid_: Supported serving option, hidden behavior

**Runboard**:
The downstream UI that starts as a clone of Playwright's official HTML report and adds knowledge of previous test runs.
_Avoid_: The reporter, dashboard clone

**Previous Run**:
A prior Playwright test run for the same Runboard context, stored and compared outside the Runboard Reporter.
_Avoid_: Old report, history item

**Merged Runboard Data Bundle**:
A Runboard Data Bundle produced from Playwright blob reports through `merge-reports`, containing the merged run data and Playwright-compatible machine/shard metadata.
_Avoid_: Previous Run, history merge

**Error Catalog**:
A canonical list of 45 Playwright error shapes at `docs/error-catalog/playwright-error-types.md`, used to design representative reporter test fixtures.
_Avoid_: Error list, 30-error catalog

**Error Type**:
One catalogued Playwright error shape with a distinctive message, call log, attachment, step, or outcome signature.
_Avoid_: Failure kind, error case

**Error Catalog Coverage**:
The requirement that Compatibility Fixtures exercise all 45 Error Types from the Error Catalog.
_Avoid_: Representative failures, sample failures

**Error Classification**:
Analytics behavior that maps preserved Playwright failure data to an Error Type after the Runboard Reporter has emitted the current run.
_Avoid_: Reporter support, reporter error typing

**Structured Error Evidence**:
A Result Evidence entry aligned to one serialized HTML-report display error, preserving structured failure details without assigning an Error Type in the Runboard Reporter.
_Avoid_: Reporter classification, formatted-only error

**Source Excerpt**:
An optional structured source-code slice attached to Structured Error Evidence so Runboard can render its own codeframe without parsing Display Errors or reading source files.
_Avoid_: Parsed codeframe, source file dependency, mandatory source dump

**Runboard Metadata**:
Runboard Extension data stored under `report.runboard`, containing exactly `schemaVersion`, `reporterVersion`, and `playwrightVersion` in the first Runboard Data Contract.
_Avoid_: Unnamespaced metadata, top-level custom fields

**Result Evidence**:
Runboard Extension data stored under `result.runboard`, containing an `evidence` array for one test result attempt.
_Avoid_: Test-level custom fields, step-level custom fields

**Display Error**:
The Playwright-compatible human-facing failure entry stored in `result.errors[]`, containing formatted message text and optional codeframe data.
_Avoid_: Error HTML, raw TestError, structured evidence

**Compatibility Fixture**:
A deliberately small Playwright test suite run through both the Runboard Reporter and Playwright's official HTML reporter to compare normalized generated data.
_Avoid_: Reporter test, sample report

**Reporter Fixture Suite**:
The package-internal Playwright tests used to verify the Runboard Reporter and Error Catalog Coverage; these fixtures are not part of the published package consumed by users.
_Avoid_: User tests, Runboard app tests

**Implementation Issue**:
A GitHub Issue scoped so one focused coding session can complete and independently verify it.
_Avoid_: Broad milestone issue, vague work item

**Compatibility Smoke Suite**:
A fast subset of the Reporter Fixture Suite that runs on normal CI to catch Runboard Data Contract regressions quickly.
_Avoid_: Partial support, weak coverage

**Error Catalog Suite**:
The heavier Reporter Fixture Suite path that exercises all 45 Error Types.
_Avoid_: Normal smoke tests, consumer tests

**Public Serializer**:
The Runboard Reporter serialization layer built from Playwright's public reporter API objects.
_Avoid_: HTML reporter fork, private serializer

**Display Error Formatter**:
A Runboard Reporter-owned formatter that produces Playwright-compatible Display Errors from public Playwright reporter API data.
_Avoid_: Runtime private Playwright formatter import, raw error dump

**Compatibility Adapter**:
A narrow adapter used only when the public reporter API cannot reproduce a specific HTML Report Data field closely enough.
_Avoid_: Private dependency, copied reporter

**Compatibility Rule**:
Match Playwright's official HTML reporter data, naming, and behavior whenever it applies to a Runboard Data Bundle; when matching is impossible or conflicts with the Runboard Reporter boundary, pause for an explicit decision.
_Avoid_: Best effort, custom behavior

**HTML Report Data Parity Rule**:
The Runboard Reporter matches Playwright HTML Report Data and applicable merge behavior for a standalone data bundle, while rendered HTML, static assets, serving, and opening remain out of scope.
_Avoid_: Partial data subset, UI parity

**Playwright Support Range**:
The Playwright version range the Runboard Reporter claims compatibility with for the HTML Report Data Parity Rule.
_Avoid_: Research range, untested historical support

**Runboard Reporter Quality Target**:
The release-grade expectation that the Runboard Reporter proves producer correctness for every claimed Runboard Data Bundle behavior at a level comparable to Playwright's official HTML reporter.
_Avoid_: Full HTML reporter feature parity, report-serving parity, UI parity

## Relationships

- The **Runboard Reporter** emits a **Runboard Data Bundle** for one Playwright test run.
- The **Runboard Reporter Package** is named `playwright-runboard-reporter` and exports `RunboardReporter`.
- The GitHub repository has been renamed to match the **Runboard Reporter Package**.
- The **HTML Report Data Parity Rule** governs the Runboard Reporter's data-shape target.
- The **Runboard Reporter Quality Target** applies to the Runboard Reporter's producer behavior, not to rendered HTML, static assets, report serving, automatic opening, or Playwright JSON reporter output.
- The **Runboard Reporter Quality Target** requires **Display Error** parity as a first-class producer behavior, not merely preservation of **Structured Error Evidence**.
- A release-grade Runboard Reporter must prove **Display Error** parity across every **Error Type** in the **Error Catalog**, not only representative formatter families.
- **Display Error** parity uses minimal normalization only for non-semantic environment noise; missing call logs, assertion diffs, codeframes, causes, screenshot/text diff signals, step or hook context, and status-derived messages are real parity failures.
- The first **Playwright Support Range** is `@playwright/test >=1.59 <2`.
- A Playwright minor version inside the **Playwright Support Range** is supported when Compatibility Fixtures pass for that version; parity breaks require an explicit support-range or adapter decision.
- Playwright `1.40+` wording research informs the **Error Catalog**, but is not a support promise until compatibility fixtures prove it.
- A **Runboard Data Bundle** defaults to `playwright-runboard-report/` and contains `report.json`, `<fileId>.json` entries, and `data/<sha>.<ext>` Attachment Assets.
- The **Output Folder** is configured with `outputFolder`, matching Playwright's HTML reporter option name.
- The **Runboard Output Environment Variable** overrides `outputFolder`; Playwright's HTML reporter environment variables are not reused.
- The **Attachments Base URL** follows Playwright's option name and default but uses a Runboard-specific environment variable.
- **Runboard Reporter Options** include `outputFolder`, `attachmentsBaseURL`, `title`, `noSnippets`, `noCopyPrompt`, and explicitly typed **No-op Compatibility Options**.
- Playwright-applicable **Runboard Reporter Options** such as `title`, `noSnippets`, and `noCopyPrompt` are preserved in **Runboard Report Options**, not in **Runboard Metadata**.
- **Runboard Report Options** contains only `title`, `noCopyPrompt`, and `noSnippets`.
- `attachmentsBaseURL` configures **Attachment Asset** paths but is not part of **Runboard Report Options**, matching Playwright's serialized `HTMLReport.options` shape.
- `open`, `host`, `port`, and `doNotInlineAssets` are **No-op Compatibility Options** and are not included in `report.options`.
- **No-op Compatibility Option** warnings are emitted during `onBegin` through `console.warn` with the stable `playwright-runboard-reporter:` prefix, once per supplied no-op option.
- The **Compatibility Smoke Suite** verifies that **No-op Compatibility Options** are accepted and do not prevent Runboard Data Bundle creation.
- The **Runboard Reporter** clears the **Runboard Data Bundle** output directory before writing the current run, following Playwright's HTML reporter cleanup model.
- The **Runboard Reporter** warns when the **Output Folder** overlaps with Playwright test artifact directories.
- The **Runboard Reporter** refuses to clear an **Output Folder** whose resolved absolute path exactly equals the filesystem root, `process.cwd()`, Playwright `configDir`, Playwright `config.rootDir`, any project `testDir`, or any project `outputDir`.
- The **Runboard Data Contract** defines how the **Runboard Reporter** packages **HTML Report Data** for the **Runboard**.
- Public exported data-contract shapes are **Runboard Contract Types**; they use `Runboard`-prefixed names such as `RunboardTestCase` and `RunboardTestAnnotation` to distinguish them from Playwright's runtime reporter API objects and private HTML reporter data types.
- Tags, project names, and repeat indexes remain primitive fields in **Runboard Contract Types**, not separate exported alias types.
- The **Contract Module** is the canonical source for **Runboard Contract Types** and schema constants; README and docs explain that module rather than redefining a second contract.
- A direct sharded Playwright invocation emits a **Runboard Data Bundle** for that shard's current invocation.
- The **Report Summary** always includes Playwright-compatible `report.machines[]`; ordinary non-merged runs use an empty array.
- When Playwright `merge-reports` replays blob reports into the **Runboard Reporter**, the reporter emits a **Merged Runboard Data Bundle** matching Playwright HTML reporter merge behavior, including populated `report.machines[]` shard metadata.
- The **Runboard Data Contract** contains one **Report Summary** and one **Test File Entry** per source test file.
- The **Report Summary** uses Playwright's lightweight summary shape, while each **Test File Entry** uses Playwright's full lazy-loaded file shape.
- The **Runboard Data Contract** includes **Attachment Assets**, following Playwright HTML reporter behavior: path attachments are copied into the data bundle, text bodies may be inlined, stdout/stderr are represented as attachments, and traces/screenshots remain navigable by the Runboard.
- The **Report Summary** includes a **Schema Version**, **Reporter Version**, and Playwright package version.
- The Playwright package version in **Runboard Metadata** comes from Playwright's public `FullConfig.version` string for the reported run.
- The first supported **Schema Version** is `1.0.0`; the **Reporter Version** may still be a `0.x` package version while the reporter implementation matures.
- The **Schema Version Constant** is the single code-level source for `report.runboard.schemaVersion`.
- The **Runboard Data Contract** preserves Playwright HTML reporter field names where possible; any **Runboard Extension** is namespaced away from Playwright-shaped fields.
- **Runboard Metadata** contains only required string fields: `schemaVersion`, `reporterVersion`, and `playwrightVersion`.
- The **Runboard** consumes **HTML Report Data** for the current run and one or more **Previous Runs**.
- A **Previous Run** is outside the Runboard Reporter output; the reporter emits only the current run.
- The **Error Catalog** contains 45 **Error Types** used to select reporter fixtures and lives at `docs/error-catalog/playwright-error-types.md`.
- **Error Catalog Coverage** is required; the Runboard Reporter test suite must verify all 45 **Error Types** are represented by the Runboard Data Contract.
- **Error Classification** belongs to the Runboard or analytics layer, not the Runboard Reporter.
- **Structured Error Evidence** is emitted as a Runboard Extension alongside Playwright-compatible serialized display errors.
- **Source Excerpts** may enrich **Structured Error Evidence** when source snippets are enabled, while **Display Errors** remain the Playwright-compatible human display surface.
- **Source Excerpts** live only inside **Structured Error Evidence** under `result.runboard.evidence[]`, not inside the Playwright-shaped **Display Error** fields.
- A **Source Excerpt** contains a small focused source slice by default: two lines above the highlighted line, the highlighted line, and two lines below it, with root-relative file, start line, highlighted line, and highlighted column metadata.
- `noSnippets: true` suppresses **Source Excerpts** as source-bearing output, matching its role as the source-snippet privacy and size control.
- Adding optional **Source Excerpts** to **Structured Error Evidence** is a backward-compatible **Runboard Data Contract** expansion that should ship as Schema Version `1.1.0`.
- **Result Evidence** contains only `evidence: RunboardErrorEvidence[]` in the first Runboard Data Contract.
- A **Display Error** is the canonical Playwright-compatible display surface for one serialized failure; **Structured Error Evidence** is index-aligned enrichment and does not replace Display Error parity.
- Each **Structured Error Evidence** entry corresponds by index to one Playwright-compatible serialized `result.errors[]` display entry when **Result Evidence** exists, not to the raw public reporter API `TestResult.errors[]`.
- **Structured Error Evidence** has `source: 'test-error'` when it comes from a Playwright `TestError`, and `source: 'status-derived'` when Playwright derives the failure from result or expected-status logic.
- These `source` values are Runboard Data Contract provenance labels for Playwright `formatResultFailure()` branches; Playwright does not expose them as official labels.
- Status-derived **Structured Error Evidence** includes a required `message`; test-error **Structured Error Evidence** preserves optional `message`, `stack`, `value`, `location`, `snippet`, `stepPath`, `stepCategory`, `attachmentIndexes`, and recursive `cause`.
- The first Runboard Data Contract places Runboard Extensions only in **Runboard Metadata** and **Result Evidence**.
- A **Compatibility Fixture** protects compatibility by comparing Runboard Reporter output to official Playwright HTML reporter data for the same run.
- Compatibility comparisons are strict except for an explicit normalization allowlist: path roots, timestamps, durations, equivalent attachment hashes or paths, snippet/codeframe line-ending or root-path noise, and version/package metadata.
- **Producer Contract Tests** prove the Runboard Reporter emits the **Runboard Data Contract**; the v1 reporter does not perform runtime schema validation before writing bundles.
- Runtime validation of a **Runboard Data Bundle** belongs to the Runboard or ingestion layer when reading a bundle.
- The **Reporter Fixture Suite** is development-only and excluded from the published Runboard Reporter package.
- The **Compatibility Smoke Suite** runs in normal CI; the **Error Catalog Suite** remains available as a separate full-coverage check.
- The **Public Serializer** is the default implementation strategy for producing the **Runboard Data Contract**.
- The **Display Error Formatter** must be implemented from public Playwright reporter API data by default; Playwright's official HTML reporter remains the test oracle, not a runtime dependency.
- A **Compatibility Adapter** may fill specific gaps when public Playwright reporter API data is insufficient, including Playwright's merged-report machine metadata hooks needed to match the HTML reporter.
- The **Compatibility Rule** governs Runboard Reporter design decisions when the **HTML Report Data Parity Rule** cannot be followed exactly.
- The in-repo PRD is canonical for the Runboard Reporter data-contract plan; GitHub Issues are canonical for implementation tracking and may link or mirror planning content.
- Broad quality milestones may be tracked as epics, but each **Implementation Issue** should be one-session sized and independently verifiable.
- The canonical Display Error parity milestone lives at `docs/prd/display-error-parity.md`.
- The Error Catalog Display Error parity comparator lives at `tests/harness/compatibility-fixture.ts` (`compareCatalogDisplayErrors` and `formatCatalogDisplayErrorDifferences`); the parametrized parity suite at `tests/error-catalog/display-error-parity.spec.ts` runs catalog fixtures through both reporters and tracks not-yet-at-parity rows with an `EXPECTED_PARITY_FAILURES` allowlist that follow-up Display Error implementation issues drain.

## Example dialogue

> **Dev:** "Should the Runboard Reporter count retries as separate tests?"
> **Domain expert:** "No. It should follow HTML Report Data: one test case with multiple result attempts."

## Flagged ambiguities

- "reporter" can mean Playwright's official HTML reporter, Playwright's generic reporter API, or this package's **Runboard Reporter**. Use the specific term.
- "same data" means **HTML Report Data** unless we explicitly decide to produce a smaller compatibility layer.
- "TestCase" can mean Playwright's public runtime reporter API object, Playwright's private serialized HTML reporter data type, or the Runboard-owned serialized contract shape. Resolved: public package exports use **Runboard Contract Type** names such as `RunboardTestCase`.
- "annotations" can mean Playwright's imported `TestAnnotation` type or a Runboard-owned serialized shape. Resolved: export a `RunboardTestAnnotation` structural type from the Contract Module.
- "`errors[]`" can mean Playwright's raw public reporter API `TestResult.errors[]` or the serialized HTML-report display error array. Resolved: in the Runboard Data Contract, evidence aligns with the serialized `result.errors[]` display array.
- "evidence can reconstruct the error UI" is too broad. Resolved: **Display Errors** are the Playwright-compatible human display contract, while **Structured Error Evidence** enriches them for Runboard classification, linking, grouping, and history.
- "evidence has everything to reconstruct codeframes" was too broad. Resolved: **Source Excerpts** are the optional structured field needed for Runboard-native codeframe rendering.
- "use Playwright internals for error formatting" is too broad for a published package. Resolved: **Display Error Formatter** is repo-owned and public-API-based by default; runtime private internals require a separate explicit decision.
- "`report.machines[]`" can mean a merged-report-only concept or an always-present serialized field. Resolved: the field is always present; merged runs are the case where it contains machine metadata.
- "dangerous directory" for **Output Folder** cleanup means an exact resolved-path match, not any parent/child overlap.
- "canonical PRD" means `docs/prd/runboard-reporter-data-contract.md` for the data-contract plan; GitHub Issues are the implementation tracker.
- The pasted catalog says "30 distinct error types" but enumerates 45. Resolved: the **Error Catalog** has 45 **Error Types**; the "30" wording is stale.
- "same level of software quality as Playwright's official HTML reporter" means the **Runboard Reporter Quality Target**, not full Playwright HTML reporter feature parity or Playwright JSON reporter compatibility.
