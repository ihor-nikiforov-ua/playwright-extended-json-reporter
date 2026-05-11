#!/usr/bin/env node
// @ts-check
/**
 * Pre-NPM Release guardrail.
 *
 * The Public Package Surface PRD defers `npm publish` until a separate
 * decision resolves npm account ownership, package-name reservation,
 * authentication, and provenance/trusted-publishing setup. Until that
 * decision lands, every release ships as a Pre-NPM Release: a versioned
 * GitHub Release with the `npm pack` tarball attached as the Release
 * Artifact.
 *
 * `package.json` wires this script into `prepublishOnly` so any attempted
 * `npm publish` (local or workflow) aborts with a descriptive message
 * before the registry upload step runs. To produce a Release Artifact
 * without publishing, use `npm run release:artifact` (locally) or push a
 * `vX.Y.Z` Release Tag to trigger the `release-artifact.yml` workflow.
 */
console.error('');
console.error('  npm publish is intentionally disabled for playwright-runboard-reporter.');
console.error('');
console.error('  Reason: this package is in Pre-NPM Release posture. Releases ship as');
console.error('  versioned GitHub Releases with an `npm pack` Release Artifact attached.');
console.error('  npm publishing is deferred until a separate decision resolves npm');
console.error('  account ownership, package-name reservation, authentication, and');
console.error('  provenance/trusted-publishing setup.');
console.error('');
console.error('  To build a Release Artifact without publishing:');
console.error('    npm run release:artifact');
console.error('');
console.error('  See docs/public/release-process.md for the full Pre-NPM Release flow.');
console.error('');
process.exit(1);
