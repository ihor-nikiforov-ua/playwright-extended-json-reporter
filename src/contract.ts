/**
 * Current Runboard Data Contract Schema Version, written into
 * `report.runboard.schemaVersion` on every emitted Runboard Data Bundle.
 *
 * The Schema Version follows semver and is independent of both the package
 * version and the Playwright version so the Runboard can choose ingest
 * behavior even when the reporter or Playwright bumps. Schema `1.1.0` adds
 * optional Source Excerpts under `result.runboard.evidence[].sourceExcerpt`
 * while remaining backward compatible with the original `1.0.0` shape.
 */
export const RUNBOARD_SCHEMA_VERSION = '1.1.0';

/**
 * A source location expressed in Playwright's HTML-report-compatible
 * `{ file, line, column }` shape. Paths are POSIX-normalized and relative
 * to Playwright's `config.rootDir`.
 */
export interface RunboardLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * Aggregate counts for one Test File Entry or for the whole run.
 *
 * `ok` is true when both `unexpected` and `flaky` are zero, mirroring
 * Playwright HTML Report Data semantics.
 */
export interface RunboardStats {
  /** Total number of test cases counted by these stats. */
  total: number;
  /** Test cases whose outcome matched the expected status. */
  expected: number;
  /** Test cases whose outcome did not match the expected status. */
  unexpected: number;
  /** Test cases that produced both failed and passing attempts under retries. */
  flaky: number;
  /** Test cases that did not run because they were skipped. */
  skipped: number;
  /** True when no test case ended in `unexpected` or `flaky`. */
  ok: boolean;
}

/**
 * Runboard Metadata namespaced under `report.runboard`.
 *
 * Contains the version markers needed to ingest a Runboard Data Bundle: the
 * Schema Version that governs the JSON contract, the Reporter Version that
 * produced the bundle, and the Playwright version the run executed against.
 */
export interface RunboardMetadata {
  /** Runboard Data Contract Schema Version that governs this bundle. */
  schemaVersion: string;
  /** Version of the Runboard Reporter package that produced this bundle. */
  reporterVersion: string;
  /** Playwright version reported by `FullConfig.version` for the run. */
  playwrightVersion: string;
}

/**
 * Serialized Runboard Report Options surfaced under `report.options`.
 *
 * Contains only the Playwright-applicable display options the Runboard
 * Reporter preserves; reporter-side configuration such as `outputFolder`
 * or `attachmentsBaseURL` is not part of the serialized contract.
 */
export interface RunboardReportOptions {
  /** Human-readable report title preserved verbatim. */
  title?: string;
  /** When `true`, Runboard UIs should hide the AI copy-prompt affordance. */
  noCopyPrompt?: boolean;
  /** When `true`, Source Excerpts are suppressed in Structured Error Evidence. */
  noSnippets?: boolean;
}

/**
 * Playwright-compatible per-shard machine metadata entry under
 * `report.machines[]`.
 *
 * Ordinary non-merged runs emit an empty `report.machines` array. Merged
 * Runboard Data Bundles produced via `merge-reports` populate one entry per
 * blob shard with tags, optional shard index, start time, and duration.
 */
export interface RunboardMachine {
  /** Playwright shard index for the contributing blob report, when sharded. */
  shardIndex?: number;
  /** Playwright shard tags applied during the original shard run. */
  tag: string[];
  /** Shard start time in milliseconds since the Unix epoch. */
  startTime: number;
  /** Shard duration in milliseconds. */
  duration: number;
}

/**
 * Playwright-compatible test annotation as recorded on a test case.
 */
export interface RunboardTestAnnotation {
  /** Annotation kind, mirroring Playwright's annotation `type`. */
  type: string;
  /** Optional description supplied to the annotation. */
  description?: string;
  /** Optional location of the annotation call site. */
  location?: RunboardLocation;
}

/**
 * Playwright-compatible attachment entry recorded on a test result.
 *
 * `path` points to a file inside the Runboard Data Bundle's attachments
 * directory; `body` carries an inline text body for short attachments.
 */
export interface RunboardTestAttachment {
  /** Attachment name (e.g. `screenshot`, `stdout`). */
  name: string;
  /** MIME content type of the attachment. */
  contentType: string;
  /** Relative path to the copied attachment file, prefixed with the Attachments Base URL. */
  path?: string;
  /** Inline text body when the attachment is short enough to inline. */
  body?: string;
}

/**
 * Playwright-compatible step entry recorded on a test result.
 *
 * Steps form a tree via the nested `steps` array; `attachments` is a list
 * of indexes into the owning test result's `attachments` array.
 */
export interface RunboardTestStep {
  /** Step title as recorded by Playwright. */
  title: string;
  /** Step start time as an ISO-8601 string. */
  startTime: string;
  /** Step duration in milliseconds. */
  duration: number;
  /** Optional source location where the step originates. */
  location?: RunboardLocation;
  /** Optional codeframe-style source snippet for the step. */
  snippet?: string;
  /** Formatted error text when the step failed. */
  error?: string;
  /** Nested sub-steps in start order. */
  steps: RunboardTestStep[];
  /** Indexes into the owning test result's `attachments[]`. */
  attachments: number[];
  /** Number of times this step ran (e.g. retries, polling). */
  count: number;
  /** True when the step was skipped rather than executed. */
  skipped: boolean;
}

/**
 * Provenance label that distinguishes how a Structured Error Evidence entry
 * was produced.
 *
 * `'test-error'` comes from a Playwright `TestError`; `'status-derived'`
 * comes from Playwright deriving the failure from result or expected-status
 * logic. These are Runboard Data Contract provenance labels for Playwright's
 * `formatResultFailure()` branches; Playwright does not expose them as
 * official labels.
 */
export type RunboardErrorEvidenceSource = 'test-error' | 'status-derived';

/**
 * Optional structured source-code slice attached to Structured Error
 * Evidence so a Runboard can render its own codeframe without parsing
 * Display Errors or reading source files.
 *
 * By default the slice contains two lines above the highlighted line, the
 * highlighted line, and two lines below it, with root-relative file, start
 * line, highlighted line, and highlighted column metadata. Suppressed when
 * `noSnippets: true`.
 */
export interface RunboardSourceExcerpt {
  /** Root-relative file path of the source excerpt. */
  file: string;
  /** 1-based line number of the first line in `lines`. */
  startLine: number;
  /** Captured source lines in order. */
  lines: string[];
  /** 1-based line number to highlight inside the excerpt. */
  highlightedLine: number;
  /** Optional 1-based column inside the highlighted line. */
  highlightedColumn?: number;
}

/**
 * Structured Error Evidence produced from a Playwright `TestError`.
 *
 * Index-aligned with one Playwright-compatible serialized `result.errors[]`
 * display entry. Fields preserve structured failure details without
 * assigning an Error Type; Error Classification belongs to the Runboard or
 * analytics layer, not the reporter.
 */
export interface RunboardTestErrorEvidence {
  /** Always `'test-error'` for `TestError`-sourced evidence. */
  source: 'test-error';
  /** Formatted error message text when available. */
  message?: string;
  /** Original error stack when available. */
  stack?: string;
  /** Serialized value for thrown non-Error values. */
  value?: string;
  /** Location associated with the underlying error. */
  location?: RunboardLocation;
  /** Source snippet captured for the error site. */
  snippet?: string;
  /** Path of step titles leading to the failing step, when applicable. */
  stepPath?: string[];
  /** Playwright step category for the failing step, when applicable. */
  stepCategory?: string;
  /** Indexes into the owning test result's `attachments[]`. */
  attachmentIndexes?: number[];
  /** Optional Source Excerpt for Runboard-native codeframe rendering. */
  sourceExcerpt?: RunboardSourceExcerpt;
  /** Recursive cause chain for wrapped errors. */
  cause?: RunboardErrorEvidence;
}

/**
 * Structured Error Evidence derived from Playwright's status logic rather
 * than a `TestError` (for example, an unexpected pass or a timed-out
 * worker).
 *
 * Index-aligned with one Playwright-compatible serialized `result.errors[]`
 * display entry. `message` is required because status-derived failures do
 * not carry a Playwright `TestError` payload.
 */
export interface RunboardStatusDerivedErrorEvidence {
  /** Always `'status-derived'` for status-logic-sourced evidence. */
  source: 'status-derived';
  /** Required formatted message describing the status-derived failure. */
  message: string;
  /** Optional stack when Playwright captures one for the derived failure. */
  stack?: string;
  /** Serialized value for thrown non-Error values, when applicable. */
  value?: string;
  /** Location associated with the underlying failure, when known. */
  location?: RunboardLocation;
  /** Source snippet captured for the failure site, when available. */
  snippet?: string;
  /** Path of step titles leading to the failing step, when applicable. */
  stepPath?: string[];
  /** Playwright step category for the failing step, when applicable. */
  stepCategory?: string;
  /** Indexes into the owning test result's `attachments[]`. */
  attachmentIndexes?: number[];
  /** Optional Source Excerpt for Runboard-native codeframe rendering. */
  sourceExcerpt?: RunboardSourceExcerpt;
  /** Recursive cause chain for wrapped failures. */
  cause?: RunboardErrorEvidence;
}

/**
 * One Structured Error Evidence entry, discriminated by `source`.
 */
export type RunboardErrorEvidence = RunboardTestErrorEvidence | RunboardStatusDerivedErrorEvidence;

/**
 * Result Evidence namespaced under `result.runboard` for one test result
 * attempt.
 *
 * `evidence` is index-aligned with the Playwright-compatible serialized
 * `result.errors[]` display array, not with the raw public reporter API
 * `TestResult.errors[]`.
 */
export interface RunboardResultEvidence {
  /** Structured Error Evidence aligned with the serialized Display Errors. */
  evidence: RunboardErrorEvidence[];
}

/**
 * Playwright-compatible Display Error entry stored in `result.errors[]`.
 *
 * Carries formatted human-facing failure text and optional codeframe data;
 * Structured Error Evidence enriches but does not replace this surface.
 */
export interface RunboardTestResultDisplayError {
  /** Formatted message text suitable for human display. */
  message: string;
  /** Optional codeframe-style snippet for the failure. */
  codeframe?: string;
}

/**
 * Playwright-compatible test result status for one attempt.
 */
export type RunboardTestResultStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/**
 * Playwright-compatible test result for one attempt, including retry index,
 * timings, steps, Display Errors, attachments, status, annotations, worker
 * index, and the optional Result Evidence Runboard Extension.
 */
export interface RunboardTestResult {
  /** Zero-based retry index for this attempt; `0` is the initial run. */
  retry: number;
  /** Attempt start time as an ISO-8601 string. */
  startTime: string;
  /** Attempt duration in milliseconds. */
  duration: number;
  /** Step tree captured during the attempt. */
  steps: RunboardTestStep[];
  /** Playwright-compatible serialized Display Errors for the attempt. */
  errors: RunboardTestResultDisplayError[];
  /** Attachments referenced by indexes from `steps[]` and `errors`. */
  attachments: RunboardTestAttachment[];
  /** Playwright-compatible attempt status. */
  status: RunboardTestResultStatus;
  /** Annotations attached to this attempt. */
  annotations: RunboardTestAnnotation[];
  /** Playwright worker index that executed the attempt. */
  workerIndex: number;
  /** Result Evidence Runboard Extension aligned with `errors[]`. */
  runboard?: RunboardResultEvidence;
}

/**
 * Lightweight per-attempt summary recorded in the Report Summary
 * `<fileId>` entries.
 */
export interface RunboardTestResultSummary {
  /** Attachment headers for the attempt, without inline bodies. */
  attachments: { name: string; contentType: string; path?: string }[];
  /** Attempt start time as an ISO-8601 string. */
  startTime: string;
  /** Playwright worker index that executed the attempt. */
  workerIndex: number;
}

/**
 * Playwright-compatible outcome bucket for a test case across all attempts.
 *
 * Matches Playwright's HTML reporter outcome categorization, where `flaky`
 * means the test produced both failed and passing attempts under retries.
 */
export type RunboardTestOutcome = 'skipped' | 'expected' | 'unexpected' | 'flaky';

/**
 * Lightweight Playwright-compatible summary of one test case for the
 * Report Summary `<fileId>` entries.
 */
export interface RunboardTestCaseSummary {
  /** Stable Playwright test id for this test case. */
  testId: string;
  /** Final segment of the test case title. */
  title: string;
  /** Path of describe-block titles leading to this test case. */
  path: string[];
  /** Project name the test case ran under. */
  projectName: string;
  /** Source location of the test definition. */
  location: RunboardLocation;
  /** Annotations attached to the test case. */
  annotations: RunboardTestAnnotation[];
  /** Tags attached to the test case (`@`-prefixed in the source). */
  tags: string[];
  /** Playwright-compatible outcome bucket across all attempts. */
  outcome: RunboardTestOutcome;
  /** Total duration across all attempts in milliseconds. */
  duration: number;
  /** True when the case's outcome is not `unexpected` or `flaky`. */
  ok: boolean;
  /** Per-attempt summaries in attempt order. */
  results: RunboardTestResultSummary[];
  /** Playwright repeat-each iteration index, when applicable. */
  repeatEachIndex?: number;
}

/**
 * Full Playwright-compatible test case for the `<fileId>.json` Test File
 * Entry. Inherits the summary fields but replaces `results` with the
 * full {@link RunboardTestResult} entries.
 */
export interface RunboardTestCase extends Omit<RunboardTestCaseSummary, 'results'> {
  /** Full per-attempt results in attempt order. */
  results: RunboardTestResult[];
}

/**
 * Lightweight per-file summary entry recorded under `report.files[]` in
 * the Report Summary.
 */
export interface RunboardTestFileSummary {
  /** First 20 hex chars of SHA-1(POSIX-normalized fileName). */
  fileId: string;
  /** POSIX-normalized file path relative to Playwright `config.rootDir`. */
  fileName: string;
  /** Per-case summaries for the test file. */
  tests: RunboardTestCaseSummary[];
  /** Aggregate stats for the test file. */
  stats: RunboardStats;
}

/**
 * Full Playwright-compatible Test File Entry written to `<fileId>.json`.
 */
export interface RunboardTestFile {
  /** First 20 hex chars of SHA-1(POSIX-normalized fileName). */
  fileId: string;
  /** POSIX-normalized file path relative to Playwright `config.rootDir`. */
  fileName: string;
  /** Full per-case entries for the test file. */
  tests: RunboardTestCase[];
}

/**
 * Top-level Report Summary written to `report.json` in every Runboard Data
 * Bundle.
 *
 * Carries Runboard Metadata, Playwright `FullConfig.metadata`, run timings,
 * per-file summaries, project names, aggregate stats, top-level errors,
 * serialized Runboard Report Options, and Playwright-compatible
 * `report.machines[]` shard metadata.
 */
export interface RunboardReport {
  /** Runboard Metadata namespaced under `report.runboard`. */
  runboard: RunboardMetadata;
  /** Verbatim `FullConfig.metadata` from the Playwright run. */
  metadata: Record<string, unknown>;
  /** Run start time in milliseconds since the Unix epoch. */
  startTime: number;
  /** Run duration in milliseconds. */
  duration: number;
  /** Per-file summaries in file order. */
  files: RunboardTestFileSummary[];
  /** Names of Playwright projects that participated in the run. */
  projectNames: string[];
  /** Aggregate run stats. */
  stats: RunboardStats;
  /** Formatted top-level errors raised before the run started. */
  errors: string[];
  /** Serialized Runboard Report Options preserved from the reporter config. */
  options: RunboardReportOptions;
  /** Playwright-compatible per-shard machine metadata; empty for non-merged runs. */
  machines: RunboardMachine[];
}
