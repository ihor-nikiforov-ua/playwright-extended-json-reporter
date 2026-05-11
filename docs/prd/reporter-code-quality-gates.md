# PRD: Reporter Code Quality Gates

## Problem Statement

The Runboard Reporter package needs stronger, explicit code quality gates before implementation expands beyond the current small codebase. The package exists to produce a stable Runboard Data Bundle that follows Playwright HTML Report Data semantics, so accidental drift in TypeScript strictness, package metadata, private Playwright imports, async file-writing behavior, or published package contents can break consumers even when ordinary tests still pass.

The current setup already has useful foundations: strict TypeScript, Biome formatting and linting, Playwright tests, package verification, and CI. However, those checks do not yet define a single shippability contract for the Runboard Reporter Package, and they do not enforce several project-specific rules such as the Playwright Support Range, public Playwright reporter API preference, compatibility-adapter boundaries, and published package boundary.

## Solution

Create a reporter-specific quality-gates standard for the Runboard Reporter Package. The standard keeps Biome as the primary formatter and broad linter, splits TypeScript configuration into explicit profiles, adds targeted type-aware ESLint only for rules Biome and TypeScript cannot express, and defines one canonical verification command that CI and humans can use before merge.

The quality gates should be pragmatic rather than broad. They should protect package correctness, public API declarations, Playwright compatibility, async reporter lifecycle behavior, metadata consistency, generated-output hygiene, and published package contents. They should not copy Playwright's monorepo configuration wholesale, and they should not add React, Vite, or browser UI assumptions to this reporter-only package.

## User Stories

1. As a Runboard Reporter maintainer, I want one canonical verification command, so that I know what must pass before code is shippable.
2. As a Runboard Reporter maintainer, I want CI to run the same canonical verification command as local development, so that quality gates do not drift between machines.
3. As a Runboard Reporter maintainer, I want TypeScript configuration split by purpose, so that build, test, and editor typechecking have clear responsibilities.
4. As a package consumer, I want the package to emit reliable JavaScript and declarations, so that I can depend on the Runboard Reporter from TypeScript and JavaScript projects.
5. As a package consumer, I want generated declaration files to reflect only the intended public API, so that internal serializer and adapter details do not become accidental contracts.
6. As a Runboard developer, I want the Contract Module's exported types to remain strict and inspectable, so that Runboard Data Contract changes are deliberate.
7. As a Runboard Reporter maintainer, I want TypeScript to catch unchecked indexed access, missing overrides, accidental index-signature property access, and unused locals, so that drift is caught early.
8. As a Runboard Reporter maintainer, I want the emitted JavaScript target to match the package's Node support policy, so that runtime assumptions are explicit.
9. As a Runboard Reporter maintainer, I want DOM libraries excluded from the reporter package by default, so that accidental browser-global dependencies cannot enter Node reporter code unnoticed.
10. As a Runboard Reporter maintainer, I want library typechecking enabled, so that incompatibilities in Node or Playwright types are visible before publishing.
11. As a Runboard Reporter maintainer, I want Biome to keep formatting, import organization, and broad lint hygiene consistent, so that basic code style remains cheap and automatic.
12. As a Runboard Reporter maintainer, I want targeted ESLint rules only where they provide additional safety, so that the toolchain stays small and defensible.
13. As a Runboard Reporter maintainer, I want type-aware async rules, so that reporter lifecycle hooks do not accidentally start unawaited writes or cleanup work.
14. As a Runboard Reporter maintainer, I want intentional fire-and-forget promises to be explicit, so that async behavior can be reviewed rather than inferred.
15. As a Runboard Reporter maintainer, I want production code to forbid explicit `any`, so that Runboard Data Contract and serializer code narrow unknown data deliberately.
16. As a test author, I want limited flexibility in test helpers, so that fake Playwright reporter objects can stay readable without weakening production code.
17. As a Runboard Reporter maintainer, I want imports from Playwright private internals forbidden by default, so that the package follows the public reporter API first.
18. As a Runboard Reporter maintainer, I want compatibility-adapter exceptions to be narrow and named, so that unavoidable parity gaps are isolated and testable.
19. As a Runboard Reporter maintainer, I want import hygiene rules that require type-only imports and prevent cycles, so that module boundaries stay clear as the package grows.
20. As a Runboard Reporter maintainer, I want the Contract Module to remain dependency-light, so that public contract shapes do not become coupled to serializer implementation.
21. As a package maintainer, I want package metadata checked against canonical policy, so that peer dependency ranges, Node support, exports, and published files do not drift from decisions.
22. As a package maintainer, I want a small repo-specific invariant checker, so that project-specific rules can fail with clear messages instead of being encoded awkwardly in generic tools.
23. As a package maintainer, I want built-output smoke tests, so that broken package exports, ESM output, or declaration/build drift are caught before publish.
24. As a package maintainer, I want package contents verified, so that internal Reporter Fixture Suite files and generated artifacts do not leak to consumers.
25. As a package maintainer, I want Node runtime metadata pinned consistently, so that CI, local development, package engines, and Node type packages describe the same runtime policy.
26. As a package maintainer, I want Playwright compatibility checks to cover the claimed support range, so that package metadata does not overpromise compatibility.
27. As a package maintainer, I want fast PR gates and broader scheduled compatibility checks, so that normal feedback remains quick while support-range drift is still detected.
28. As a contributor, I want generated outputs ignored and excluded from source checks, so that build output and report artifacts do not create noisy review churn.
29. As a contributor, I want local hooks to run useful subsets of the quality gates, so that common issues are caught before pushing.
30. As a future AFK agent, I want quality rules documented as implementation decisions, so that code changes can follow the repo's intended standards without rediscovering them.

## Implementation Decisions

- Scope the PRD to the Runboard Reporter Package only.
- Do not add a Playwright HTML reporter UI profile, React profile, Vite profile, browser bundle profile, or cloned UI assumptions.
- Do not copy Playwright's repository configuration wholesale; borrow only the relevant quality principles.
- Keep Biome as the primary formatter, import organizer, and broad linter.
- Keep Biome conservative: use recommended rules, formatting, organize imports, and specific additional rules only when they enforce an explicitly desired package rule.
- Add targeted type-aware ESLint only for checks that Biome and TypeScript cannot enforce.
- Keep production source stricter than tests.
- Allow the most flexibility in test helper code where fake Playwright reporter API objects would otherwise become brittle or unreadable.
- Split TypeScript configuration into purpose-specific profiles for shared base settings, package build, test typechecking, and editor/default typechecking.
- Keep the reporter package as a Node package configuration rather than a bundler configuration.
- Use Node module semantics appropriate for a published ESM package.
- Preserve declaration output for the package build.
- Use `target: "ES2024"` for emitted JavaScript.
- Use `lib: ["ES2024"]` for the reporter package by default.
- Exclude DOM libraries unless a concrete reporter/package type need justifies adding them.
- Require `strict: true`.
- Require `exactOptionalPropertyTypes: true`.
- Require `noUncheckedIndexedAccess: true`.
- Require `noImplicitOverride: true`.
- Require `noPropertyAccessFromIndexSignature: true`.
- Require `useUnknownInCatchVariables: true`.
- Require `verbatimModuleSyntax: true`.
- Require `noUnusedLocals: true`.
- Do not make unused parameters a hard TypeScript failure by default because Playwright reporter lifecycle signatures and tests can require callback parameters that are intentionally unused.
- Require `skipLibCheck: false` by default.
- Require `isolatedDeclarations: true` in the build profile when compatible with declaration emit.
- Do not require `isolatedModules` for the reporter package unless the build pipeline changes to require single-file transpilation.
- Emit JavaScript source maps and declaration maps.
- Treat generated declarations as part of the package product.
- Ensure public API export tests cover the intended entrypoint and prevent accidental public exports.
- Forbid broad explicit `any` in production reporter code.
- Prefer `unknown` at compatibility boundaries and narrow into Runboard-owned types.
- Allow limited explicit `any` only in tests and fakes where the alternative would obscure the behavior under test.
- Require type-aware async safety rules for unawaited promises, awaiting non-promises, and misused promises.
- Require intentional fire-and-forget promises to use explicit `void` plus a short justification comment.
- Forbid imports from Playwright private internals by default.
- Allow private Playwright internals only inside narrow compatibility adapters when an explicit parity gap requires them.
- Require compatibility-adapter exceptions to be covered by Compatibility Fixtures, an explicit PRD decision, or an ADR when the trade-off is hard to reverse and surprising.
- Permit imports from public Playwright reporter APIs.
- Prefer public package imports over deep imports.
- Require type-only imports for type-only dependencies.
- Forbid circular dependencies in production source.
- Keep the Contract Module dependency-light and free of serializer implementation coupling.
- Define one canonical verification command that represents shippability.
- Keep individual scripts available for fast local checks, but ensure the canonical verification command runs the required complete gate.
- Include Biome, targeted ESLint, typechecking, tests, package smoke checks, repository invariant checks, and package verification in the canonical gate.
- Add a small repository invariant checker for project-specific policies that do not belong in TypeScript, Biome, or ESLint.
- Use repository invariant checks for package metadata consistency, Playwright peer range consistency, Node runtime metadata consistency, package exports, package file allowlists, and generated-output hygiene.
- Keep runtime dependencies minimal.
- Require any new runtime dependency to have an explicit reason.
- Prevent dev-only fixture and test dependencies from becoming runtime dependencies.
- Keep package exports limited to the intended public entrypoint.
- Keep published package contents limited to the built package output and package-facing metadata/docs.
- Verify package contents as part of the canonical gate.
- Require a built-output smoke check that imports the built package entrypoint and proves the default reporter export and public exports are usable.
- Require Node runtime metadata to be pinned consistently across local runtime selection, CI, package engines, and Node type packages.
- Use a concrete Node major version for local runtime selection rather than a moving LTS alias.
- Align the package Node engine policy with the concrete supported runtime.
- Align Node type package major with the supported runtime unless a specific reason requires otherwise.
- Require package metadata for the Playwright peer dependency to match the canonical support policy.
- Require package metadata not to claim a Playwright support range wider than compatibility checks prove.
- Keep normal verification on the locked development Playwright version.
- Add a compatibility smoke gate for the minimum supported Playwright version.
- Add broader latest-supported Playwright compatibility checks on a scheduled or manual cadence rather than every PR if runtime cost is high.
- Ignore and exclude generated outputs such as build output, Playwright reports, Runboard Data Bundle outputs, test results, coverage, and pack artifacts.
- Ensure CI verifies from a clean checkout and can regenerate build output.
- Keep local hooks as convenience checks, not the canonical definition of shippability.

## Testing Decisions

- Tests should verify external behavior and public contracts rather than implementation details.
- TypeScript typechecking is a quality gate and should run against build, test, and editor/default profiles as appropriate.
- Biome checks should verify formatting, organize imports, and broad lint hygiene.
- Targeted ESLint checks should verify type-aware async safety, restricted imports, explicit `any` policy, import hygiene, and cycle prevention where those checks are not covered elsewhere.
- Repository invariant tests should verify package metadata and policy consistency with clear failure messages.
- Package smoke tests should build the package, import the emitted entrypoint, and verify the public exports expected by package consumers.
- Public API tests should verify the package entrypoint exports only intended Runboard Reporter and Runboard Data Contract APIs.
- Producer Contract Tests remain required to prove emitted Report Summary and Test File Entry data match the Runboard Data Contract.
- Compatibility Smoke Suite tests remain required to compare Runboard Reporter output against Playwright HTML Report Data behavior.
- Output Folder safety tests remain required because cleanup behavior can delete user data if the safety guard regresses.
- No-op Compatibility Option tests remain required because the reporter accepts Playwright HTML reporter configuration options while intentionally not rendering or serving HTML.
- Attachment behavior tests should be required as the attachment implementation reaches each behavior area.
- Playwright support-range checks should include a fast PR path and a broader scheduled or manual path.
- Package contents should be verified through package packing rather than by inspecting implementation files directly.
- Generated-output hygiene should be verified by checking ignore/exclusion policy and clean-checkout reproducibility.

## Out of Scope

- Building or configuring a Runboard UI.
- Building or configuring a cloned Playwright HTML reporter UI.
- Introducing React, Vite, JSX, browser bundle, or DOM-oriented TypeScript profiles.
- Replacing Biome wholesale with ESLint.
- Copying Playwright's monorepo lint configuration in full.
- Defining the Runboard Data Contract itself.
- Changing reporter runtime behavior beyond quality gates needed to enforce existing design decisions.
- Runtime schema validation inside the v1 Runboard Reporter before writing bundles.
- Error Classification in the Runboard Reporter.
- Publishing internal Reporter Fixture Suite files to package consumers.

## Further Notes

The Runboard Data Contract implementation and compatibility tests remain canonical for Runboard Data Contract shape and Playwright HTML Report Data parity requirements. This PRD defines the package quality gates needed to keep implementation aligned with those requirements as the Runboard Reporter Package grows.

The local Playwright repository remains useful as a reference for official HTML reporter behavior and for examples of strict TypeScript and ESLint rules. Its monorepo and UI-specific configuration should be treated as reference material, not as a direct template for this reporter-only package.

During planning, one existing metadata inconsistency was identified: the canonical support policy says the first Playwright Support Range is `@playwright/test >=1.59 <2`, while current package metadata can claim a wider range. This PRD intentionally includes metadata consistency gates so that this class of drift becomes executable and visible in CI.
