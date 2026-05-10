# Public Docs

Public documentation for `playwright-runboard-reporter`. These pages are the
shared source for human and AI-agent Playwright users who install, configure,
or integrate the Runboard Reporter Package.

The package landing page is [`README.md`](../../README.md) at the repository
root. Maintainer planning (PRDs, ADRs, agent guides) lives elsewhere in
`docs/` and is intentionally not part of the public docs spine.

## Public docs index

- [API Reference](./api.md) — public exports, reporter options, and the
  Runboard Contract Types surface.
- [Data Contract](./data-contract.md) — output layout, `report.json`,
  `<fileId>.json`, attachment assets, Runboard extensions, schema versioning,
  and migration notes.
- [Options and Environment Variables](./options.md) — reporter options,
  environment variable overrides, and No-op Compatibility Options.
- [Playwright Parity](./playwright-parity.md) — what matches Playwright HTML
  Report Data, what is intentionally out of scope, and Display Error parity.
- [Support Matrix](./support-matrix.md) — Node, Playwright, and TypeScript
  declaration compatibility under the Support Matrix Policy.
- [Release Process](./release-process.md) — Public Preview Release posture,
  Release PRs, Release Tags, Pre-NPM Releases, and deferred npm publishing.

## How to read these docs

These pages are written as Agent-Readable Documentation. They use stable
headings, canonical terms, explicit defaults, runnable commands, and checked
examples. Headings are intentionally stable across releases so AI agents and
humans can link, quote, or scaffold workflows on top of them.

When a deeper or maintainer-only topic is referenced, the link points to the
maintainer doc rather than duplicating its content here.
