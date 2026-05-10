# PRD: Public Package Surface

## Problem Statement

The Runboard Reporter Package already has strong producer behavior, compatibility tests, PRDs, ADRs, and release gates, but its Public Package Surface does not yet match the quality of the underlying implementation. A Playwright user, Runboard integrator, maintainer, or AI agent can inspect the repository and find the technical intent, but the consumer-facing package surface is still too thin to feel like a top-tier public package.

The current README is functional but minimal. Public exports and Runboard Data Contract fields have little or no Public API Documentation. There is no public docs set, no checked example bundle, no changelog, no license file, no repository governance docs, no pre-npm release process, and no documented support matrix for Node, Playwright, and TypeScript declaration compatibility.

The package should be public-package ready before Runboard itself exists. The Runboard Reporter is a contract producer, so documentation, release metadata, support promises, and package trust signals are part of the product, not post-implementation polish.

## Solution

Create a Public Package Surface for `playwright-runboard-reporter` that meets the Public Package Quality Target while keeping the package in a Public Preview Release posture.

The package should remain Runboard-first while being friendly to advanced consumers who read the documented Runboard Data Contract directly. Public docs should optimize first for human and AI-agent Playwright users evaluating or installing the reporter, then for Runboard integrators, then for maintainers.

The solution includes:

- A high-quality README that works as the package landing page.
- A focused Public Documentation Set under `docs/public/`.
- Strict Public API Documentation for every public export and public contract field.
- A Public API Reference Page checked against the package exports.
- A Public Data Contract Page that owns output layout, Runboard extensions, schema versioning, and migration notes.
- A validated Public Example Bundle showing real reporter input and emitted output.
- A Contract Stability Matrix that separates stable public promises, schema-versioned JSON fields, preview areas, and non-contract internals.
- A Support Matrix Policy for Node, Playwright, and TypeScript declaration compatibility.
- Package Trust Signals: MIT `LICENSE`, manual `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- A Pre-NPM Release flow with Release PRs, Release Tags, GitHub Releases, and `npm pack` Release Artifacts, without publishing to npm.

## User Stories

1. As a Playwright user, I want to understand what the Runboard Reporter does in the first README screen, so that I can decide whether it fits my test reporting workflow.
2. As a Playwright user, I want install and config examples, so that I can add the reporter without reading source code.
3. As a Playwright user, I want a comparison with Playwright's `html`, `json`, and `blob` reporters, so that I can choose the right reporter for my use case.
4. As a Playwright user, I want clear "not included" boundaries, so that I do not expect rendered HTML, report serving, previous-run storage, or reporter-side Error Classification.
5. As a CI maintainer, I want artifact upload examples, so that I can preserve the Runboard Data Bundle from CI runs.
6. As a CI maintainer, I want merge-report guidance, so that sharded Playwright runs can produce a merged Runboard Data Bundle.
7. As a Runboard integrator, I want a data contract page, so that I can ingest `report.json`, `<fileId>.json`, and `data/` entries correctly.
8. As a Runboard integrator, I want schema versioning and migration notes near the data contract, so that ingestion behavior can be version-aware.
9. As a Runboard integrator, I want a real example bundle, so that I can inspect actual JSON rather than infer behavior from a folder diagram.
10. As a TypeScript consumer, I want documented public types, so that editor hovers and generated declarations explain the contract fields.
11. As a TypeScript consumer, I want TypeScript declaration compatibility documented, so that I know which compiler versions are expected to consume the published `.d.ts` files.
12. As an AI agent installing the package, I want stable headings, explicit defaults, exact commands, and checked examples, so that I can operate from docs without hidden assumptions.
13. As an AI agent maintaining the package, I want docs tables checked against source constants and public exports, so that documentation drift is detected before release.
14. As a package consumer, I want a support matrix, so that I know the supported Node version, Playwright peer range, and TypeScript declaration compatibility posture.
15. As a package consumer, I want a contract stability matrix, so that I know which surfaces are safe to depend on and which are internal or preview.
16. As a package consumer, I want a LICENSE file, so that legal usage is clear from GitHub and the packed package.
17. As a package consumer, I want a changelog, so that I can understand each release in consumer-facing terms.
18. As a contributor, I want CONTRIBUTING guidance, so that local checks, release gates, and documentation standards are discoverable.
19. As a security reporter, I want SECURITY guidance, so that vulnerability handling expectations are explicit.
20. As a maintainer, I want release PRs, release tags, and GitHub release artifacts, so that pre-npm releases are reviewable and reproducible.
21. As a maintainer, I want npm publishing explicitly deferred, so that account ownership and provenance setup can be decided later without blocking package readiness.
22. As a maintainer, I want the packed package to include public docs but exclude PRDs, ADRs, tests, fixtures, and repository configuration, so that installed packages carry consumer guidance without exposing internal planning material.
23. As a maintainer, I want public docs to mention Display Error parity without hard-coding the current error catalog count as a permanent public promise, so that catalog growth does not turn into a documentation contradiction.
24. As a maintainer, I want meaningful README badges only, so that badges communicate real maintenance signals rather than decoration.

## Implementation Decisions

- Treat `playwright-runboard-reporter` as a public, library-grade npm package now, even before Runboard exists.
- Keep the package in Public Preview Release posture through `0.x` versions until the broader Runboard ecosystem and package API are ready for `1.0`.
- Define this PRD as the public-package contract. It should state requirements and acceptance criteria, while implementation tasks belong in separate issues or plans.
- Optimize public docs first for human and AI-agent Playwright users, second for Runboard integrators, and third for maintainers.
- Make the Public Documentation Set one shared source for humans and AI agents. Do not create separate consumer-agent docs unless one shared source stops working.
- Write public docs as Agent-Readable Documentation: stable headings, canonical terms, explicit defaults, runnable commands, checked examples, and clear expected outputs.
- Keep PRDs and ADRs as maintainer context. Do not treat them as consumer documentation.
- Create `docs/public/` for focused public docs.
- Include `docs/public/` in the published package contents because installed packages should carry enough authoritative docs for human and AI-agent consumers.
- Publish `dist/`, `docs/public/`, `README.md`, `LICENSE`, and `CHANGELOG.md` in the package tarball. Exclude PRDs, ADRs, tests, fixtures, repository governance docs, and repository configuration.
- Add an MIT `LICENSE` file matching package metadata.
- Add a manually maintained `CHANGELOG.md`. Do not introduce a changeset or automated changelog tool yet.
- Add `CONTRIBUTING.md` and `SECURITY.md` to the repository and link them from README, but do not publish them in the npm package initially.
- Rewrite README as the landing page. It should cover what the package is, why it exists, install/config, output layout, options, environment variables, CI artifact usage, support matrix, public preview status, not-included boundaries, and links to deeper docs.
- Add a concise reporter comparison table that compares Playwright `html`, `json`, `blob`, and `playwright-runboard-reporter`.
- Use the phrase "Playwright HTML Report Data bundle, without rendered HTML" when comparing output to Playwright's built-in reporters.
- Position the package as Runboard-first while acknowledging that advanced consumers may consume the documented Runboard Data Contract directly.
- Add a "Not Included" section covering rendered HTML, report serving/opening, Previous Run storage, Previous Run comparison, Runboard UI, and reporter-side Error Classification.
- Add minimal README badges for meaningful maintenance signals only: CI, license, Node support, Playwright support, and npm version only after npm publishing exists.
- Add `docs/public/api.md` as the Public API Reference Page.
- Add `docs/public/data-contract.md` as the Public Data Contract Page.
- Keep schema versioning and migration notes inside `docs/public/data-contract.md` until that concern grows large enough to split.
- Add public docs for options and environment variables, including defaults and precedence.
- Add public docs for release process and support matrix.
- Add public docs for Playwright parity, including what matches HTML Report Data and what intentionally remains out of scope.
- Add a troubleshooting page if the first public docs pass identifies enough user-facing failure modes to justify it.
- Add a Public Example Bundle with a small Playwright config, example spec, and emitted Runboard Data Bundle output.
- Validate the Public Example Bundle by test or generation so sample JSON cannot silently rot.
- Add a Contract Stability Matrix to public docs. It should distinguish stable public package promises, schema-versioned JSON fields, preview areas, and non-contract internals.
- Make Public API Documentation strict for every public export and public contract field.
- Add TSDoc to `RunboardReporterOptions`, `RUNBOARD_SCHEMA_VERSION`, `RunboardReporter`, and every exported Runboard Contract Type.
- Generated declaration files should be useful in editors without requiring README lookup for every field.
- Do not build a Playwright-style custom docs generator now. Use TSDoc-first documentation and public markdown docs, while leaving room for generated API docs later.
- Add TypeScript Declaration Compatibility as a documented support surface because the package publishes `.d.ts` files rather than TypeScript source.
- Do not document a minimum TypeScript compiler version until a declaration-compatibility gate proves it.
- Follow a Support Matrix Policy instead of a broad historical compatibility lab.
- For Node, support the current repo baseline, currently Node `>=24`, and test the `.nvmrc` Node version.
- For Playwright, keep the declared support range `@playwright/test >=1.59 <2`, but document that CI gates the lower bound, the locked development version, and latest supported `<2`, not every historical minor.
- If a Playwright minor inside the support range breaks parity, resolve it by a compatibility adapter decision or by narrowing the support range explicitly.
- For TypeScript, test declaration consumption against selected compiler versions before documenting a compiler support range.
- Public docs may mention Display Error parity as covered by a maintained Playwright error catalog, but must not turn the current catalog count into a permanent public promise.
- Keep npm publishing out of this PRD's implementation scope.
- Define Pre-NPM Releases as versioned GitHub releases that prove the package is publish-ready without uploading to the npm registry.
- Use Release PRs to update package version metadata and changelog content.
- Use `vX.Y.Z` Release Tags to start the authoritative pre-npm release workflow.
- Attach the `npm pack` tarball as the Release Artifact on GitHub Releases.
- Document npm publishing as deferred until a separate decision resolves account ownership, package-name reservation, authentication, and provenance or trusted-publishing setup.

## Testing Decisions

- Public documentation is part of shippability and should be covered by CI where practical.
- Validate docs examples and public docs tables that can drift from source behavior.
- Add checks that README links to public docs do not break.
- Add checks that public docs reference the current `RUNBOARD_SCHEMA_VERSION`.
- Add checks that the Public API Reference Page does not drift from package public exports.
- Add checks that options and environment-variable docs do not drift from `RunboardReporterOptions` and option constants.
- Add checks that package contents include exactly the intended public files and exclude internal PRDs, ADRs, tests, fixtures, scripts, and repository configuration.
- Extend package smoke tests so an installed packed tarball exposes public docs where expected.
- Add a declaration compatibility gate that installs or packs the package into a consumer fixture and runs `tsc` with documented TypeScript compiler versions.
- Keep tests focused on external behavior: package contents, published declarations, public docs consistency, example output, and release artifacts.
- Continue using the existing canonical verification gate for format, lint, typecheck, invariants, tests, and pack verification.
- Continue using the existing release gate as the strict pre-release quality gate, including the maintained error-catalog parity suite.
- Add pre-npm release workflow checks that build a Release Artifact through `npm pack` without publishing to npm.

## Acceptance Criteria

- `README.md` reads like a public package landing page and includes install/config examples, reporter comparison, output overview, support matrix summary, public preview status, not-included boundaries, and links to public docs.
- `docs/public/` exists and includes public docs for API reference, data contract, options/environment variables, Playwright parity, support matrix, and release process.
- `docs/public/data-contract.md` explains `report.json`, `<fileId>.json`, `data/`, Runboard extensions, schema versioning, and migration notes.
- Public docs include a Contract Stability Matrix.
- Public docs include a validated Public Example Bundle or link to one.
- Public docs are written with stable headings, explicit defaults, commands, and checked examples suitable for humans and AI agents.
- Public exports and public contract fields have TSDoc that appears in generated declarations.
- The package has `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- `LICENSE` and `CHANGELOG.md` are included in the packed package.
- `CONTRIBUTING.md` and `SECURITY.md` are linked from README but excluded from the packed package.
- The packed package includes `dist/`, `docs/public/`, `README.md`, `LICENSE`, `CHANGELOG.md`, and package metadata only.
- The packed package excludes PRDs, ADRs, tests, fixtures, scripts, generated test output, and repository configuration.
- The release process supports versioned Pre-NPM Releases with Release PRs, `vX.Y.Z` tags, GitHub Releases, and attached `npm pack` tarballs.
- No workflow publishes to npm as part of this PRD.
- Npm publishing preconditions are documented for a later decision.
- CI validates public docs consistency where practical.
- CI validates declaration compatibility for documented TypeScript compiler versions once the TypeScript support range is documented.
- Public docs describe the Support Matrix Policy without claiming exhaustive historical compatibility testing.

## Out of Scope

- Publishing the package to npm.
- Reserving the npm package name.
- Creating or configuring an npm account or npm organization.
- Choosing between npm trusted publishing and token-based publishing.
- Building a Runboard UI.
- Rendering, serving, or opening HTML reports.
- Storing or comparing Previous Runs.
- Reporter-side Error Classification.
- A custom Playwright-style docs generation pipeline.
- Publishing PRDs, ADRs, tests, fixtures, or repository governance docs in the npm package.
- Supporting old Node, Playwright, or TypeScript versions that are not covered by the documented Support Matrix Policy.

## Further Notes

The local Playwright repository is useful as a quality reference. Playwright's public docs combine authored guide pages with structured API documentation that feeds generated type/declaration comments. This package should copy the quality bar and source-of-truth discipline, not the full documentation generation machinery.

The existing data-contract, Display Error parity, and code-quality PRDs remain canonical for producer behavior. This PRD governs the consumer-facing Public Package Surface and pre-npm release readiness.

When npm publishing becomes relevant, create a separate decision document or PRD covering account ownership, package-name reservation, two-factor authentication, trusted publishing or provenance, npm dist-tags, and the transition from Pre-NPM Releases to npm-published Public Preview Releases.
