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
- Tested: a declaration compatibility gate consumes the packed declarations
  from a fixture project and runs `tsc` against documented TypeScript
  compiler versions. The specific compiler versions are documented in
  [`CHANGELOG.md`](../../CHANGELOG.md) before being claimed here.
- Not supported: TypeScript compiler versions outside the documented range.
  The package does not publish TypeScript source, so consumers compile the
  declarations directly.

A minimum TypeScript compiler version is not pinned in this matrix until
the declaration-compatibility gate proves it. Until then, this section
documents the policy, not a specific version range.
