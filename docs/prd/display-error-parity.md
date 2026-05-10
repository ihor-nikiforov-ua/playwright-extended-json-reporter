# PRD: Display Error Parity

## Problem Statement

The Runboard Reporter already preserves Structured Error Evidence for Runboard-specific classification and linking, but release-grade producer quality also requires the human-facing `result.errors[]` Display Error surface to match Playwright's official HTML reporter. Without Display Error parity, Runboard can preserve raw evidence while still showing failure text, call logs, diffs, causes, or codeframes that diverge from the report users expect.

## Quality Target

A release-grade Runboard Reporter must prove Display Error parity across every Error Type in `docs/error-catalog/playwright-error-types.md`. Compatibility comparisons should use minimal normalization only for non-semantic environment noise such as temp paths, timestamps, durations, line endings, or equivalent attachment paths. Missing call logs, assertion diffs, codeframes, nested causes, screenshot or text diff signals, step or hook context, and status-derived messages are real parity failures.

## Contract Boundaries

- `result.errors[]` is the canonical Playwright-compatible Display Error surface for human rendering.
- `result.runboard.evidence[]` is index-aligned Structured Error Evidence for Runboard-specific classification, linking, grouping, and history.
- Runboard should pair `result.errors[i]` with `result.runboard.evidence[i]` when evidence exists.
- Structured Error Evidence enriches Display Errors; it does not replace Display Error parity.
- Optional Source Excerpts may be added under `result.runboard.evidence[]` so Runboard can render custom codeframes without parsing Display Errors or reading source files.
- Source Excerpts are source-bearing output and must be suppressed by `noSnippets: true`.
- Adding optional Source Excerpts is a backward-compatible Runboard Data Contract expansion and should ship as schema version `1.1.0`.

## Implementation Policy

- Production Display Error formatting must be owned by this repo and built from public Playwright reporter API data by default.
- Playwright's official HTML reporter is the compatibility oracle in tests, not a runtime dependency.
- Runtime private Playwright internals for Display Error formatting require a separate explicit decision.
- Broad quality milestones may be tracked as epics, but each Implementation Issue should be one-session sized and independently verifiable.

## Release Criteria

- The Error Catalog Suite proves Display Error parity for all 45 catalogued Error Types.
- The parity harness produces contract-path-specific diffs that make formatter regressions actionable.
- The normal release gate or a required release workflow prevents publishing without all-45 Display Error parity.
- Source Excerpt schema `1.1.0` behavior is covered by contract tests, compatibility tests where applicable, and documentation.

## Out of Scope

- Rendering the Runboard UI.
- Serving or opening Playwright HTML reports.
- Shipping Playwright HTML reporter static assets.
- Matching Playwright's JSON reporter schema.
- Reporter-side Error Classification.
