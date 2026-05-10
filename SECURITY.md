# Security Policy

## Public Preview Release Posture

`playwright-runboard-reporter` is in Public Preview Release status. Security
fixes are prioritized for the most recent `0.x` release line. Older `0.x`
versions may not receive backports while the broader Runboard ecosystem is
pre-`1.0`.

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub
issues, discussions, or pull requests.

Instead, report vulnerabilities privately through GitHub's
["Report a vulnerability"](https://github.com/ihor-nikiforov-ua/playwright-runboard-reporter/security/advisories/new)
flow under the repository's Security tab. This opens a private security
advisory and notifies the maintainer.

When reporting, please include:

- A description of the issue and its potential impact.
- Steps to reproduce or a minimal proof of concept.
- The Runboard Reporter package version and Playwright version in use.
- Any relevant configuration (reporter options, environment variables) that
  influence the issue.

You can expect:

- An acknowledgement of your report within a reasonable time, typically
  within a few business days.
- A follow-up with a remediation plan or, if the report is determined to be
  out of scope, an explanation.
- Coordination on a coordinated disclosure timeline if a fix is required.

## Scope

The Runboard Reporter is a producer of test-run data: it runs inside a
Playwright test process and writes a Runboard Data Bundle to disk. Reports
that are most relevant to this package include:

- Path-handling vulnerabilities in the reporter's output folder, attachment
  copying, or cleanup logic.
- Information leakage through emitted bundle files beyond what Playwright's
  HTML Report Data already exposes.
- Supply-chain concerns about the published npm package (after npm
  publishing exists).

Out of scope for this package:

- The downstream Runboard application and its UI.
- Storage and comparison of Previous Runs, which live outside the reporter.
- Reporter-side Error Classification, which is intentionally not implemented.
