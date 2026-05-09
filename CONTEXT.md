# Playwright Runboard Reporter

This package produces Playwright test-run data for Runboard, a dashboard that follows the official Playwright HTML report and adds awareness of previous runs.

## Language

**Runboard Reporter**:
A Playwright reporter that emits Runboard-consumable data for the current test run.
_Avoid_: Extended JSON reporter, custom JSON reporter

**Runboard Reporter Package**:
The npm package named `playwright-runboard-reporter`, exporting `RunboardReporter` as the default reporter implementation.
_Avoid_: playwright-extended-json-reporter, ExtendedJsonReporter

**Legacy Extended JSON Reporter**:
The pre-v1 flat JSON reporter replaced by the Runboard Reporter Package; its package name, flat output file, options, and contract are not preserved.
_Avoid_: Compatibility mode, old contract

**HTML Report Data**:
The data model consumed by Playwright's official HTML report UI, including run summary, per-file test details, retry results, steps, formatted errors, attachments, stdout, stderr, traces, screenshots, and run metadata.
_Avoid_: Plain JSON summary, report dump

**Runboard Data Contract**:
The stable data-bundle output shape produced by the Runboard Reporter and consumed by the Runboard; it does not include a rendered HTML report.
_Avoid_: Report UI, rendered report

**Report Summary**:
The `report.json` entry in the Runboard Data Contract, containing schema/version markers, run metadata, aggregate stats, project names, top-level errors, and per-file summaries.
_Avoid_: Root report, main JSON

**Schema Version**:
A semver Runboard Data Contract version number that lets the Runboard choose compatible ingestion behavior independently of the Runboard Reporter package version and Playwright version.
_Avoid_: Reporter version, Playwright version

**Reporter Version**:
The Runboard Reporter package version that identifies which reporter build produced a Runboard Data Bundle.
_Avoid_: Schema version, Playwright version

**Runboard Extension**:
A Runboard Data Contract field that is not part of Playwright's HTML Report Data and must live under a clearly named Runboard-specific object.
_Avoid_: Custom top-level field, extra field

**Test File Entry**:
A `<fileId>.json` entry in the Runboard Data Contract, containing full test-case details for one source test file; `fileId` follows Playwright HTML reporter compatibility by using the first 20 characters of the SHA-1 of the relative source file name.
_Avoid_: Spec dump, details blob

**Attachment Asset**:
A file or inline body referenced by a test result attachment, including screenshots, traces, videos, stdout, stderr, error context, and user attachments.
_Avoid_: Artifact, blob

**Runboard Data Bundle**:
The output directory produced by the Runboard Reporter, defaulting to `playwright-runboard-report`, containing `report.json`, one `<fileId>.json` per Test File Entry, and copied Attachment Assets under `data/`.
_Avoid_: HTML report, report folder

**Output Folder**:
The configurable directory where the Runboard Reporter writes the Runboard Data Bundle.
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

**No-op Compatibility Option**:
A Playwright HTML reporter option accepted by the Runboard Reporter for config compatibility but ignored with a once-per-option warning because this package does not render, serve, or open HTML.
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
A Result Evidence collection aligned to Playwright HTML-report failure display entries, preserving raw Playwright error fields where available without assigning an Error Type in the Runboard Reporter.
_Avoid_: Reporter classification, formatted-only error

**Runboard Metadata**:
Runboard Extension data stored under `report.runboard`, including schema version and package versions; run timing and machine data remain in Playwright-compatible Report Summary fields.
_Avoid_: Unnamespaced metadata, top-level custom fields

**Result Evidence**:
Runboard Extension data stored under `result.runboard`, including Structured Error Evidence for one test result attempt.
_Avoid_: Test-level custom fields, step-level custom fields

**Compatibility Fixture**:
A deliberately small Playwright test suite run through both the Runboard Reporter and Playwright's official HTML reporter to compare their generated data.
_Avoid_: Reporter test, sample report

**Reporter Fixture Suite**:
The package-internal Playwright tests used to verify the Runboard Reporter and Error Catalog Coverage; these fixtures are not part of the published package consumed by users.
_Avoid_: User tests, Runboard app tests

**Compatibility Smoke Suite**:
A fast subset of the Reporter Fixture Suite that runs on normal CI to catch Runboard Data Contract regressions quickly.
_Avoid_: Partial support, weak coverage

**Error Catalog Suite**:
The heavier Reporter Fixture Suite path that exercises all 45 Error Types.
_Avoid_: Normal smoke tests, consumer tests

**Public Serializer**:
The Runboard Reporter serialization layer built from Playwright's public reporter API objects.
_Avoid_: HTML reporter fork, private serializer

**Compatibility Adapter**:
A narrow adapter used only when the public reporter API cannot reproduce a specific HTML Report Data field closely enough.
_Avoid_: Private dependency, copied reporter

**Compatibility Rule**:
Match Playwright's official HTML reporter data, naming, and behavior whenever it applies to a Runboard Data Bundle; when matching is impossible or conflicts with the Runboard Reporter boundary, pause for an explicit decision.
_Avoid_: Best effort, custom behavior

**V1 Parity Rule**:
The first Runboard Data Contract supports every Playwright HTML reporter data-contract and merge behavior that applies to a standalone data bundle, while rendered HTML, static assets, serving, and opening remain out of scope.
_Avoid_: Partial v1, data subset

**Playwright Support Range**:
The Playwright version range the Runboard Reporter claims compatibility with for the V1 Parity Rule.
_Avoid_: Research range, untested historical support

## Relationships

- The **Runboard Reporter** emits a **Runboard Data Bundle** for one Playwright test run.
- The **Runboard Reporter Package** is named `playwright-runboard-reporter` and exports `RunboardReporter`.
- The **Legacy Extended JSON Reporter** is removed cleanly rather than supported through a compatibility layer.
- The GitHub repository should be renamed to match the **Runboard Reporter Package**.
- The **V1 Parity Rule** governs the first supported **Runboard Data Contract**.
- The first **Playwright Support Range** is `@playwright/test >=1.59 <2`.
- Playwright `1.40+` wording research informs the **Error Catalog**, but is not a v1 support promise until compatibility fixtures prove it.
- A **Runboard Data Bundle** defaults to `playwright-runboard-report/` and contains `report.json`, `<fileId>.json` entries, and `data/<sha>.<ext>` Attachment Assets.
- The **Output Folder** is configured with `outputFolder`, matching Playwright's HTML reporter option name; the old flat-report `outputFile` option does not belong to the Runboard Data Contract.
- The **Runboard Output Environment Variable** overrides `outputFolder`; Playwright's HTML reporter environment variables are not reused.
- The **Attachments Base URL** follows Playwright's option name and default but uses a Runboard-specific environment variable.
- **Runboard Reporter Options** include `outputFolder`, `attachmentsBaseURL`, `title`, `noSnippets`, and `noCopyPrompt`.
- Playwright-applicable **Runboard Reporter Options** such as `title`, `noSnippets`, and `noCopyPrompt` are preserved in the Playwright-shaped `report.options` field, not in **Runboard Metadata**.
- `open`, `host`, `port`, and `doNotInlineAssets` are **No-op Compatibility Options** and are not included in `report.options`.
- The **Compatibility Smoke Suite** verifies that **No-op Compatibility Options** are accepted and do not prevent Runboard Data Bundle creation.
- The **Runboard Reporter** clears the **Runboard Data Bundle** output directory before writing the current run, following Playwright's HTML reporter cleanup model.
- The **Runboard Reporter** warns when the **Output Folder** overlaps with Playwright test artifact directories and refuses to clear exact dangerous directories such as the filesystem root, current working directory, config root directory, project test directory, or project output directory.
- The **Runboard Data Contract** defines how the **Runboard Reporter** packages **HTML Report Data** for the **Runboard**.
- A direct sharded Playwright invocation emits a **Runboard Data Bundle** for that shard's current invocation.
- When Playwright `merge-reports` replays blob reports into the **Runboard Reporter**, the reporter emits a **Merged Runboard Data Bundle** matching Playwright HTML reporter merge behavior, including `report.machines[]` shard metadata.
- The **Runboard Data Contract** contains one **Report Summary** and one **Test File Entry** per source test file.
- The **Runboard Data Contract** includes **Attachment Assets**, following Playwright HTML reporter behavior: path attachments are copied into the data bundle, text bodies may be inlined, stdout/stderr are represented as attachments, and traces/screenshots remain navigable by the Runboard.
- The **Report Summary** includes a **Schema Version**, **Reporter Version**, and Playwright package version.
- The first supported **Schema Version** is `1.0.0`; the **Reporter Version** may still be a `0.x` package version while the reporter implementation matures.
- The **Runboard Data Contract** preserves Playwright HTML reporter field names where possible; any **Runboard Extension** is namespaced away from Playwright-shaped fields.
- **Runboard Metadata** contains only `schemaVersion`, `reporterVersion`, and `playwrightVersion` in the first Runboard Data Contract.
- The **Runboard** consumes **HTML Report Data** for the current run and one or more **Previous Runs**.
- A **Previous Run** is outside the Runboard Reporter output; the reporter emits only the current run.
- The **Error Catalog** contains 45 **Error Types** used to select reporter fixtures and lives at `docs/error-catalog/playwright-error-types.md`.
- **Error Catalog Coverage** is required; the Runboard Reporter test suite must verify all 45 **Error Types** are represented by the Runboard Data Contract.
- **Error Classification** belongs to the Runboard or analytics layer, not the Runboard Reporter.
- **Structured Error Evidence** is emitted as a Runboard Extension alongside Playwright-compatible `errors[].message`.
- Each **Structured Error Evidence** entry corresponds to one Playwright HTML-report failure display entry, including status-derived failures such as expected-failure tests that unexpectedly pass.
- The first Runboard Data Contract places Runboard Extensions only in **Runboard Metadata** and **Result Evidence**.
- A **Compatibility Fixture** protects compatibility by comparing Runboard Reporter output to official Playwright HTML reporter data for the same run.
- The **Reporter Fixture Suite** is development-only and excluded from the published Runboard Reporter package.
- The **Compatibility Smoke Suite** runs in normal CI; the **Error Catalog Suite** remains available as a separate full-coverage check.
- The **Public Serializer** is the default implementation strategy for producing the **Runboard Data Contract**.
- A **Compatibility Adapter** may fill specific gaps when public Playwright reporter API data is insufficient, including Playwright's merged-report machine metadata hooks needed to match the HTML reporter.
- The **Compatibility Rule** governs Runboard Reporter design decisions after the **V1 Parity Rule** establishes the first-contract target.

## Example dialogue

> **Dev:** "Should the Runboard Reporter count retries as separate tests?"
> **Domain expert:** "No. It should follow HTML Report Data: one test case with multiple result attempts."

## Flagged ambiguities

- "reporter" can mean Playwright's official HTML reporter, Playwright's generic reporter API, or this package's **Runboard Reporter**. Use the specific term.
- "same data" means **HTML Report Data** unless we explicitly decide to produce a smaller compatibility layer.
- The pasted catalog says "30 distinct error types" but enumerates 45. Resolved: the **Error Catalog** has 45 **Error Types**; the "30" wording is stale.
