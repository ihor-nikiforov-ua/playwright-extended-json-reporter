# Options and Environment Variables

The Runboard Reporter accepts a small set of options. Where an option also
applies to Playwright's official HTML reporter, the Runboard Reporter uses
the same option name and default. Options that only make sense for a
rendered HTML report are accepted for compatibility but ignored.

This page lists the option surface and how it interacts with environment
variables. See [API Reference](./api.md) for the TypeScript export details.

## Reporter options

The reporter is configured through Playwright's `reporter:` array. Options
are the second element of the tuple, matching Playwright's reporter wiring
conventions.

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    [
      'playwright-runboard-reporter',
      {
        outputFolder: 'playwright-runboard-report',
        attachmentsBaseURL: 'data/',
      },
    ],
  ],
});
```

| Option                 | Type                                | Default                       | Notes |
| ---------------------- | ----------------------------------- | ----------------------------- | ----- |
| `outputFolder`         | `string`                            | `'playwright-runboard-report'` | The Output Folder for the Runboard Data Bundle. Resolved to an absolute path before cleanup. |
| `attachmentsBaseURL`   | `string`                            | `'data/'`                     | Base path used in copied Attachment Asset references. |
| `title`                | `string`                            | (none)                        | Preserved in `report.options.title`. |
| `noCopyPrompt`         | `boolean`                           | (none)                        | Preserved in `report.options.noCopyPrompt`. |
| `noSnippets`           | `boolean`                           | (none)                        | Preserved in `report.options.noSnippets`. Suppresses Source Excerpts in Structured Error Evidence. |
| `open`                 | `'always' \| 'never' \| 'on-failure'` | (none)                      | No-op Compatibility Option. |
| `host`                 | `string`                            | (none)                        | No-op Compatibility Option. |
| `port`                 | `number`                            | (none)                        | No-op Compatibility Option. |
| `doNotInlineAssets`    | `boolean`                           | (none)                        | No-op Compatibility Option. |

Only `title`, `noCopyPrompt`, and `noSnippets` are preserved in
`report.options`. `attachmentsBaseURL` configures Attachment Asset paths but
is not part of `report.options`, matching Playwright's serialized
`HTMLReport.options` shape.

## Environment variables

Environment variables override the corresponding option when the option is
not supplied at construction time. They take precedence over defaults but
not over an explicitly set option.

| Environment variable                          | Overrides            | Default                       |
| --------------------------------------------- | -------------------- | ----------------------------- |
| `PLAYWRIGHT_RUNBOARD_OUTPUT_DIR`              | `outputFolder`       | `'playwright-runboard-report'` |
| `PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL`    | `attachmentsBaseURL` | `'data/'`                     |

The Runboard Reporter does not reuse Playwright's HTML reporter environment
variables (such as `PLAYWRIGHT_HTML_OUTPUT_DIR` and `PLAYWRIGHT_HTML_REPORT`)
because mixing them with the Runboard Output Environment Variable would
make precedence ambiguous when both reporters run in the same config.

Precedence (highest to lowest):

1. Explicit constructor option supplied through `playwright.config.ts`.
2. Runboard-specific environment variable.
3. Default value listed in the option table above.

## No-op compatibility options

`open`, `host`, `port`, and `doNotInlineAssets` are accepted purely for
configuration compatibility with Playwright's HTML reporter so existing
Playwright configs can mention them without breaking. They have no runtime
effect because the Runboard Reporter does not render, serve, or open an
HTML report.

When a No-op Compatibility Option is supplied, the reporter logs a
once-per-option warning during `onBegin` through `console.warn` with the
stable `playwright-runboard-reporter:` prefix so the inert behavior is
visible without interrupting the run.

If you rely on serving, opening, or asset-inlining behavior, use
Playwright's HTML reporter directly. The Runboard Reporter intentionally
keeps those concerns out of scope.

## CI artifact

The Runboard Reporter writes a Runboard Data Bundle to disk; CI jobs
preserve that bundle the same way they preserve any other Playwright
artifact. Upload the bundle on every job, including failed runs, so the
emitted JSON and copied attachment files survive after the runner is torn
down.

The example below uses GitHub Actions and the default Output Folder
`playwright-runboard-report`:

```yaml
- name: Upload Runboard Data Bundle
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: runboard-data-bundle
    path: playwright-runboard-report/
    if-no-files-found: error
```

Notes:

- `if: always()` runs the upload on failed jobs too. Without it, a failing
  Playwright job would discard the bundle that explains the failure.
- The `path:` value matches the default Output Folder. If you override
  `outputFolder` (or `PLAYWRIGHT_RUNBOARD_OUTPUT_DIR`), update the upload
  path to match.
- Other CI systems use equivalent artifact-collection steps; the rule is
  the same: archive the bundle on every run, including failures, before the
  runner is torn down.
