# Allow DOM types for Playwright reporter typings

The shared TypeScript base profile keeps `lib: ["ES2024"]` and remains the canonical Node reporter policy: production source must not depend on browser globals. The effective build, test, and editor profiles add `DOM` and `DOM.Iterable` only because the public `@playwright/test/reporter` type chain references browser ambient names from Playwright's page API declarations, including element and node types.

This is a compile-time compatibility exception for Playwright's public reporter typings, not permission to use browser globals in `src`. Repository invariants must keep the exception explicit in the effective profiles and reject direct production-source usage of browser globals such as `window`, `document`, `HTMLElement`, `SVGElement`, and `NodeList`.
