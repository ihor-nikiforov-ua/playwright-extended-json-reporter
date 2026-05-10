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

- Public-package trust signals: MIT `LICENSE`, manually maintained
  `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- Explicit Public Pack Boundary: the packed npm tarball publishes the built
  runtime, `README.md`, `LICENSE`, `CHANGELOG.md`, and package metadata, while
  PRDs, ADRs, agent and error-catalog docs, tests, fixtures, scripts,
  generated output, repository governance docs (`CONTRIBUTING.md`,
  `SECURITY.md`), and repository configuration remain repository-only.
