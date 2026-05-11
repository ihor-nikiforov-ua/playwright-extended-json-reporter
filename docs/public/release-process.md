# Release Process

This page describes how a Runboard Reporter Package release moves from a
working repository to a published artifact. The process is intentionally
small while npm publishing is deferred, but every release still goes
through a Release PR and a Release Tag so the artifact is reviewable and
reproducible.

For a record of past releases and changelog entries, see
[`CHANGELOG.md`](../../CHANGELOG.md).

## Public Preview Release posture

The package is in Public Preview Release posture while the broader Runboard
ecosystem is pre-`1.0`. During this posture:

- Package versions are `0.x`. Breaking package-API changes may occur
  between minor versions and are called out in
  [`CHANGELOG.md`](../../CHANGELOG.md).
- The Runboard Data Contract Schema Version is independent of the package
  version and follows its own semver, exported as
  `RUNBOARD_SCHEMA_VERSION`.
- Public documentation, package trust signals, and release discipline meet
  the Public Package Quality Target even though the package is `0.x`.

## Release PR

A Release PR is the unit of release review. It updates exactly the files
required to cut a Pre-NPM Release; no other content changes ship in the
same PR.

1. Bumps `package.json` `version` to the target `0.Y.Z` value.
2. Renames the `## [Unreleased]` heading in `CHANGELOG.md` to
   `## [0.Y.Z] - YYYY-MM-DD` and adds a fresh `## [Unreleased]` section
   above it for future work.
3. Updates any other consumer-visible documentation that the release
   changes (option defaults, support matrix bumps, schema version notes).
4. Runs the release gate locally with `npm run release-gate` before
   review, and is gated on the same workflow in CI.

A Release PR does not publish anything. It only prepares the repository for
a Release Tag.

## Release Tag

After the Release PR merges, the release is started by creating a
`vX.Y.Z` git tag on the merge commit. The tag drives the authoritative
release workflow:

```sh
git tag v0.Y.Z
git push origin v0.Y.Z
```

The tag, not the GitHub release UI, is the trigger. This keeps the
relationship between code and release artifacts strictly source-controlled.

## Pre-NPM Release

While npm publishing is deferred, every release ships as a Pre-NPM Release:
a versioned GitHub Release built from the Release Tag, with the `npm pack`
tarball attached as the Release Artifact. The Release Artifact carries
exactly the files documented under [API Reference](./api.md) and
[Data Contract](./data-contract.md) — `dist/`, `docs/public/`, `README.md`,
`LICENSE`, and `CHANGELOG.md`.

Pre-NPM Releases prove the package is publish-ready without uploading it to
the npm registry. Consumers can install the artifact directly from the
GitHub Release for evaluation.

### Release Artifact build

The Release Artifact is produced by the canonical
`npm run release:artifact` script:

```sh
npm run release:artifact
```

The script builds the package and then runs `npm pack` to write a real
`playwright-runboard-reporter-0.Y.Z.tgz` file in the repository root. It
intentionally does **not** pass `--dry-run` (that path is reserved for
`npm run pack:verify` inside the canonical verify gate) and never calls
`npm publish`.

### Release Artifact workflow

The [`release-artifact.yml`](../../.github/workflows/release-artifact.yml)
GitHub Actions workflow runs the same script in CI when a `vX.Y.Z` Release
Tag is pushed:

1. Checks out the tagged commit.
2. Installs Node from `.nvmrc` and runs `npm ci`.
3. Runs `npm run release-gate` so a Pre-NPM Release inherits the strict
   pre-release quality gate (the canonical verify gate plus the all-45
   Error Catalog Display Error parity suite).
4. Runs `npm run release:artifact` to produce the packed tarball.
5. Calls `gh release create` to create a GitHub Release for the Release
   Tag and attaches the `.tgz` Release Artifact.

The workflow is also runnable on demand through `workflow_dispatch` so
maintainers can re-run an artifact build after fixing a release workflow
regression. The release gate workflow at
[`release-gate.yml`](../../.github/workflows/release-gate.yml) continues to
run on `release.published` events as the strict pre-release quality gate.

## Guardrails against accidental npm publishing

`npm publish` must not run while npm publishing is deferred. Two
guardrails enforce this:

- `package.json` defines a `prepublishOnly` script that runs
  [`scripts/forbid-npm-publish.mjs`](../../scripts/forbid-npm-publish.mjs).
  Any `npm publish` invocation — local or workflow — aborts with a
  descriptive error pointing maintainers at the Pre-NPM Release flow.
- The `release-artifact.yml` workflow never invokes `npm publish`, and a
  repository invariant test asserts that no workflow file references it.

To produce a Release Artifact without publishing, use
`npm run release:artifact` locally or push a `vX.Y.Z` Release Tag to
trigger the workflow.

## npm publishing (deferred)

Publishing to npm is intentionally not part of this release process yet.
The remaining preconditions are tracked separately:

- npm account ownership and the publishing identity.
- Reservation of the `playwright-runboard-reporter` package name.
- Two-factor authentication and authentication strategy for the publishing
  identity.
- Choice between npm trusted publishing (OIDC provenance) and token-based
  publishing.
- Transition plan from Pre-NPM Releases to npm-published Public Preview
  Releases without breaking installed Release Artifacts.

When those decisions land, a follow-up update to this page documents how a
Release Tag drives an npm publish in addition to the GitHub Release. Until
then, the `prepublishOnly` guardrail keeps `npm publish` blocked.
