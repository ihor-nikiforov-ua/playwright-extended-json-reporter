# Changelog

All notable changes to `playwright-runboard-reporter` are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for the package version. The Runboard Data Contract carries its own Schema
Version (currently `1.1.0`), which is versioned independently of the package
version through the `RUNBOARD_SCHEMA_VERSION` export and
`report.runboard.schemaVersion` field.

This package is in **Public Preview Release** posture. While the package
version is `0.x`, breaking changes to the package API may occur between
minor versions and will be called out in this changelog. Schema-versioned
JSON contract fields follow the Runboard Data Contract Schema Version
semantics independently of the package version.

## [Unreleased]

### Added

- Pre-NPM Release flow: `npm run release:artifact` builds the package and
  runs `npm pack` to produce the versioned tarball that ships as the
  Release Artifact, and a new `.github/workflows/release-artifact.yml`
  workflow runs the same script from a `vX.Y.Z` Release Tag push to create
  a GitHub Release with the tarball attached. `npm run release-gate`
  continues to gate the artifact build as the strict pre-release quality
  gate.
- Accidental-npm-publish guardrail: `package.json` `prepublishOnly` runs
  `scripts/forbid-npm-publish.mjs`, which aborts `npm publish` with a
  descriptive message and points maintainers at the Pre-NPM Release flow.
  A repository invariant test asserts that no workflow file invokes
  `npm publish` while npm publishing is deferred.
- Public-package trust signals: MIT `LICENSE`, manually maintained
  `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- Explicit Public Pack Boundary: the packed npm tarball publishes the built
  runtime, `README.md`, `LICENSE`, `CHANGELOG.md`, and package metadata, while
  PRDs, ADRs, agent and error-catalog docs, tests, fixtures, scripts,
  generated output, repository governance docs (`CONTRIBUTING.md`,
  `SECURITY.md`), and repository configuration remain repository-only.
- Consumer-style TypeScript Declaration Compatibility gate at
  `tests/repo/declaration-compatibility.spec.ts`: packs the built package,
  installs it into a fresh consumer fixture, and runs `tsc --noEmit` over
  every public export under documented TypeScript compiler versions. The
  initial covered version is TypeScript `6.0.3`; `docs/public/support-matrix.md`
  is now the canonical list.

### Changed

- Restored the public `onBegin(config, suite)` overload on `RunboardReporter`
  so the published `dist/runboard-reporter.d.ts` is structurally assignable
  to Playwright's `Reporter.onBegin?(config, suite)` signature. The v2
  `onBegin(suite)` overload remains the preferred call path; both surface
  in editor hovers.
