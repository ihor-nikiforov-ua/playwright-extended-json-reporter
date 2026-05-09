# Use a split-file Runboard data contract

The Runboard Data Contract will keep Playwright's HTML reporter loading shape: a `report.json` Report Summary plus one `<fileId>.json` Test File Entry per source test file. We are choosing this over a single flattened JSON document because it matches the Runboard's existing lazy-loading assumptions, scales better for large suites, and keeps the Runboard Reporter aligned with Playwright's HTML Report Data instead of inventing a parallel contract.
