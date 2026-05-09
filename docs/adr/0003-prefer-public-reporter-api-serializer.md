# Prefer a public reporter API serializer

The Runboard Reporter will build its Runboard Data Contract from Playwright's public reporter API objects first, using narrow Compatibility Adapters only for fields the public API cannot reproduce closely enough. This avoids taking a brittle runtime dependency on Playwright private paths such as `playwright/lib/...`, while differential Compatibility Fixtures keep the output aligned with official HTML Report Data.

Merged blob-report machine metadata is one explicit Compatibility Adapter case. Playwright's public Reporter API is replayed during `merge-reports`, but Playwright's HTML reporter records `report.machines[]` through additional merged-report hooks. The Runboard Reporter may implement the same narrow hooks to match HTML reporter output from the first contract.
