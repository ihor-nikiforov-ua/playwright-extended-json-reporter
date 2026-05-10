# Support Matrix

The Runboard Reporter Package follows a Support Matrix Policy: document
supported Node, Playwright, and TypeScript compatibility through current
baselines plus latest-version checks, rather than an exhaustive historical
matrix.

This page is the canonical source for which versions are actively
supported. The release-gated checks that back these promises live with the
maintainer plan; this page tracks the public commitment.

## Node

- Supported: the current repository baseline declared in
  [`package.json`](../../package.json) `engines.node` and pinned in the
  repository `.nvmrc`. The current baseline is Node `>=24`.
- Tested: CI installs and runs the verify gate against the Node version in
  `.nvmrc`.
- Not supported: Node versions below the declared `engines.node` lower
  bound. The package may still install or run on older Node, but parity is
  not gated.

The Node baseline moves forward when the project drops a Node major. Older
Node majors are dropped in a Public Preview Release that is called out in
[`CHANGELOG.md`](../../CHANGELOG.md) before the change ships.

## Playwright

- Supported peer range: `@playwright/test >=1.59 <2`, declared as the
  package `peerDependencies` entry. This is the Playwright Support Range.
- Tested: Compatibility Fixtures gate the lower bound, the development
  version locked in `package-lock.json`, and the latest Playwright
  `<2` release. Historical minors between those points are not exhaustively
  tested.
- Not supported: Playwright versions below `1.59` or `2.x+`. A breaking
  Playwright change inside the support range is resolved by either an
  explicit support-range narrowing or a Compatibility Adapter.

Parity breakage inside the support range is treated as a real Display Error
parity failure, not as a tolerated drift. See
[Playwright Parity](./playwright-parity.md).

## TypeScript declaration compatibility

The package publishes generated `.d.ts` declarations, not TypeScript source.
TypeScript Declaration Compatibility describes which TypeScript compiler
versions are expected to consume the published declarations.

- Declaration target: the generated declarations follow the package's
  `tsconfig.build.json` settings and ship under `dist/`.
- Tested compiler versions:
  - TypeScript `6.0.3`
- Pinned consumer fixture dependencies:
  - `@playwright/test` `1.59.1`
  - `@types/node` `24.12.3`
- Not supported: TypeScript compiler versions outside the tested list. The
  package does not publish TypeScript source, so consumers compile the
  declarations directly.

The gate installs these pinned fixture dependencies into a throwaway
consumer project so a new `@playwright/test` or `@types/node` release
cannot silently change which Reporter or Node typings the gate exercises.

The consumer-style declaration compatibility gate at
[`tests/repo/declaration-compatibility.spec.ts`](../../tests/repo/declaration-compatibility.spec.ts)
packs the built package, installs it into a fresh consumer fixture with
the pinned dependencies above plus each tested TypeScript compiler
version, and runs `tsc --noEmit` against a consumer source file that
imports every public export. The gate runs as part of `npm run verify`
through the Playwright test suite invoked by `npm test`. Drift between
this section and the actual gate is rejected by docs-consistency tests in
the same spec.

There is no minimum supported TypeScript compiler version. The Support
Matrix Policy refuses to claim a compiler range broader than the
declaration compatibility gate actually covers, so the tested list above is
the only public commitment. The tested list expands version-by-version as
the gate gains coverage.
