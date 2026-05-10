# Contributing

Thanks for your interest in `playwright-runboard-reporter`. This document
explains how to set up a local development environment, the verification
gates the project enforces, and how repository documentation is organized.

This file lives in the repository so contributors and GitHub visitors can
find it. It is intentionally **not published** in the npm package: the
packed tarball ships only the public-package surface (built runtime,
`README.md`, `LICENSE`, `CHANGELOG.md`, and package metadata).

## Repository Layout

- `src/` — Runboard Reporter source.
- `tests/` — Reporter Fixture Suite (compatibility, contract, error catalog,
  integration, repo-policy tests). Not part of the published package.
- `docs/prd/` — Product Requirement Docs (maintainer context only).
- `docs/adr/` — Architecture Decision Records (maintainer context only).
- `docs/agents/` — Agent-facing repo guides.
- `docs/error-catalog/` — Playwright Error Catalog reference.
- `scripts/` — Repository invariant checker and other maintenance scripts.

`AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` document the agent-facing
collaboration model and the project's domain language. Read them before
making non-trivial changes.

## Local Setup

```sh
nvm use            # uses the Node version pinned in .nvmrc
npm install
npm run build
```

## Verification Gate

Every pull request must pass the canonical verification gate:

```sh
npm run verify
```

`npm run verify` chains:

- `npm run check` — Biome formatting and lint rules.
- `npm run lint` — ESLint.
- `npm run typecheck` — TypeScript across build, test, and project configs.
- `npm run invariants` — Repository policy checks
  (`scripts/check-invariants.mjs`).
- `npm test` — Playwright smoke tests, including contract and Display Error
  parity coverage.
- `npm run pack:verify` — Builds the package and runs `npm pack --dry-run`
  to confirm the published tarball matches the documented Public Pack
  Boundary.

## Release Gate

Before a Public Preview Release, run the full release gate:

```sh
npm run release-gate
```

`npm run release-gate` runs `npm run verify` plus `npm run test:catalog`,
which parametrizes the Error Catalog Display Error parity suite over every
Error Type. The same gate runs in CI on `release.published` and
`workflow_dispatch`.

## Documentation Discipline

- Public consumer docs live in `README.md` and (when present) under
  `docs/public/`. They are written as Agent-Readable Documentation: stable
  headings, canonical terms, explicit defaults, runnable commands, and
  checked examples.
- Maintainer planning lives in `docs/prd/` and `docs/adr/`. PRDs and ADRs
  are not consumer documentation and stay out of the published package.
- Update `CHANGELOG.md` for any consumer-visible change in the same pull
  request that introduces the change. Keep entries consumer-facing rather
  than commit-shaped.

## Reporting Security Issues

Security vulnerabilities should be reported through the process documented
in [`SECURITY.md`](SECURITY.md), not through public issues.
