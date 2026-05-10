# Playwright Error Catalog

This is the canonical Error Catalog for the Runboard Reporter fixture strategy. It contains 45 Playwright Error Types grouped by the HTML reporter-facing failure shape they exercise.

The catalog is not reporter output and is not an Error Classification schema. It is a fixture coverage target: the Reporter Fixture Suite must prove that each Error Type's distinguishing evidence survives Runboard Data Contract serialization.

## Version Notes

- The stale "30 distinct error types" wording from earlier research is superseded here. This catalog has 45 Error Types.
- Distinguishing signals may need updates when Playwright changes failure wording. Compatibility Fixtures should catch that drift.
- Reporter output must preserve evidence for these shapes, but must not emit an `errorType` classification field.
- Match fixture signatures on stable substrings and structural evidence, not full-line equality, because timeouts, locators, file paths, and browser-specific wording vary across runs.

## Evidence Preservation Notes

- Test-runner-level errors, such as test timeout, hook timeout, worker teardown, global timeout, and `test.fail()` mismatch, may have no ordinary stack frame and can be rendered as plain failure display entries.
- Action and API errors usually carry an API-call prefix such as `locator.click:` or `page.goto:` plus a Call log.
- Web-first assertion errors preserve `Locator`, `Expected`, `Received`, and Call log sections, but wording differs across Playwright versions.
- Generic value matcher errors come from Playwright's bundled expect implementation and commonly preserve matcher hints, Expected/Received lines, and diffs without a Call log.
- The highest-value evidence to preserve is the API prefix, the Call log, unique actionability phrases, matcher hints, related attachments, step path, and top-level status-derived failure text.

## Catalog

| ID | Section | Error Type | Distinguishing Signal |
| --- | --- | --- | --- |
| 1 | A. Timeouts | Test timeout | `Test timeout` and `exceeded` |
| 2 | A. Timeouts | Action timeout | `locator.`, `Timeout`, and `exceeded` |
| 3 | A. Timeouts | Navigation timeout | `page.`, `Timeout`, and `exceeded` |
| 4 | A. Timeouts | Web-first assertion timeout | `Expect `, `with timeout`, and `element(s) not found` |
| 5 | A. Timeouts | `locator.waitFor` / `page.waitForSelector` timeout | `waitFor`, `Timeout`, and `exceeded` |
| 6 | A. Timeouts | `waitForEvent` / request / response / load-state timeout | `while waiting for event`, `waiting for response`, `waiting for request`, or equivalent wait evidence |
| 7 | A. Timeouts | `page.waitForFunction` timeout | `waitForFunction`, `Timeout`, and function-polling evidence |
| 8 | A. Timeouts | Hook timeout | `"beforeAll"`, `hook timeout`, and `exceeded` |
| 9 | A. Timeouts | Global timeout | `Timed out waiting` and `to run` |
| 10 | B. Locator / element resolution | Strict mode violation | `strict mode violation` |
| 11 | B. Locator / element resolution | Element is not visible | `element is not visible` |
| 12 | B. Locator / element resolution | Element is detached from the DOM | `element was detached from the DOM` |
| 13 | B. Locator / element resolution | Element is not stable | `not stable` |
| 14 | B. Locator / element resolution | Element intercepts pointer events | `intercepts pointer events` |
| 15 | B. Locator / element resolution | Element is outside of the viewport | `outside of the viewport` |
| 16 | B. Locator / element resolution | Element is not enabled | `element is not enabled` |
| 17 | B. Locator / element resolution | Frame / element handle disposed | `Execution context was destroyed`, `JSHandle is disposed`, or `Frame was detached` |
| 18 | C. Web-first assertions | `toHaveText` failure | `toHaveText` |
| 19 | C. Web-first assertions | `toContainText` failure | `toContainText` |
| 20 | C. Web-first assertions | `toHaveValue` failure | `toHaveValue` |
| 21 | C. Web-first assertions | `toBeVisible` / `toBeHidden` failure | `toBeVisible` |
| 22 | C. Web-first assertions | `toHaveCount` failure | `toHaveCount` |
| 23 | C. Web-first assertions | `toHaveURL` / `toHaveTitle` failure | `toHaveURL` |
| 24 | C. Web-first assertions | Attribute-shaped matcher failure | `toHaveAttribute` |
| 25 | C. Web-first assertions | State-flag matcher failure | `toBeChecked` |
| 26 | C. Web-first assertions | `toHaveScreenshot` failure | `toHaveScreenshot`, screenshot comparison text, pixel-diff text, or screenshot diff attachments |
| 27 | C. Web-first assertions | Soft assertion failure | Multiple preserved soft errors for one test result plus matcher-specific evidence such as `toHaveText` and `toHaveCount` |
| 28 | D. Generic value matchers | `toBe` / equality matcher failure | `toBe` and `Object.is equality` |
| 29 | D. Generic value matchers | `toMatch` failure | `toMatch` and `Expected pattern` |
| 30 | D. Generic value matchers | `toContain` / `toContainEqual` failure | `toContain` |
| 31 | D. Generic value matchers | `toThrow` / `toThrowError` failure | `toThrow` and `Received function did not throw` |
| 32 | E. Hooks and fixtures | `beforeAll` hook failure | `beforeAll` and `beforeAll boom` |
| 33 | E. Hooks and fixtures | `beforeEach` hook failure | `beforeEach boom` |
| 34 | E. Hooks and fixtures | `afterEach` hook failure | `afterEach boom` |
| 35 | E. Hooks and fixtures | `afterAll` hook failure | `afterAll boom` |
| 36 | E. Hooks and fixtures | Fixture setup failure | `fixture setup boom` |
| 37 | E. Hooks and fixtures | Fixture teardown failure / fixture timeout | Fixture timeout text, teardown step evidence, or `Fixture` and `teardown` |
| 38 | E. Hooks and fixtures | Worker teardown / worker process exited unexpectedly | `Worker teardown timeout`, `Failed worker ran`, or `exited unexpectedly` |
| 39 | F. test.step failures | Error inside `test.step()` | `inside test.step open settings: boom` |
| 40 | F. test.step failures | `test.step.skip` not running | `step-skip-downstream-marker` |
| 41 | G. Misc | Page / target / browser context closed | `Target page, context or browser has been closed`, `Page closed`, or a closed-target API prefix |
| 42 | G. Misc | Network error during navigation | `net::ERR_`, `NS_ERROR_`, URL, and navigation Call log evidence |
| 43 | G. Misc | Page crashed | `Target crashed` or `Page crashed` |
| 44 | G. Misc | Unhandled exception in page | `Synthetic crash from /crashy` |
| 45 | G. Misc | `test.fail()` unexpectedly passed | `Expected to fail, but passed` |

## Drift Notes

- Some older traces render `Timeout of {N}ms exceeded.` instead of `Test timeout of {N}ms exceeded.`.
- Assertion timeout wording has shifted across Playwright versions; the fixture suite should prefer matcher names, Call log content, and Expected/Received structure over exact first-line equality.
- Call logs may appear as folded HTML report sections or raw log blocks depending on reporter/version, but their content is still contract-relevant evidence.
- Browser engines may phrase navigation and target-closed errors differently, especially Firefox `NS_ERROR_*` network failures.
- Worker and fixture teardown failures can surface as top-level or suite-level failures rather than ordinary test-body errors.
