/**
 * Compatibility Fixture Harness.
 *
 * Runs a deliberately small Playwright fixture once with the Runboard Reporter
 * and once with Playwright's official HTML reporter, extracts comparable data
 * from both bundles, and reports any contract-path mismatch outside the
 * normalization allowlist defined in the data-contract PRD.
 *
 * The harness is the only place the test suite is allowed to read Playwright's
 * private HTML report bundle layout: the `index.html` template embeds report
 * data as a base64-encoded ZIP, so a minimal ZIP extractor lives in this
 * module. Production code must not depend on this layout.
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export interface ExtractedHtmlReport {
  report: Record<string, unknown>;
  files: Map<string, Record<string, unknown>>;
}

export interface CompatibilityRun {
  htmlReport: Record<string, unknown>;
  htmlFiles: Map<string, Record<string, unknown>>;
  runboardReport: Record<string, unknown>;
  runboardFiles: Map<string, Record<string, unknown>>;
  rootDir: string;
  /**
   * Attachment bytes referenced by `data/<sha>.<ext>` paths in the HTML
   * report. Keys are the basename (`<sha>.<ext>`); values are the file bytes.
   * Optional so non-attachment unit tests can omit it. When omitted, the
   * comparator cannot prove byte-equivalence and therefore refuses to
   * normalize attachment-hash divergence.
   */
  htmlAttachments?: Map<string, Buffer>;
  /** Mirror of {@link htmlAttachments} for the Runboard side. */
  runboardAttachments?: Map<string, Buffer>;
  /**
   * The `attachmentsBaseURL` prefix configured for both reporters, used by
   * the comparator to match serialized attachment paths. Defaults to `data/`,
   * matching the Playwright HTML reporter and Runboard Reporter defaults.
   */
  attachmentsBaseURL?: string;
}

export interface CompatibilityDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

const RUNBOARD_EXTENSION_KEY = 'runboard';

const TIMESTAMP_PLACEHOLDER = '<timestamp>';
const DURATION_PLACEHOLDER = '<duration>';

const TIMESTAMP_FIELDS: ReadonlySet<string> = new Set(['startTime']);
const DURATION_FIELDS: ReadonlySet<string> = new Set(['duration']);
const SNIPPET_FIELDS: ReadonlySet<string> = new Set(['snippet', 'codeframe', 'stack']);

const DEFAULT_ATTACHMENTS_BASE_URL = 'data/';

interface NormalizeContext {
  rootDir: string;
  attachments: Map<string, Buffer> | undefined;
  attachmentPathPattern: RegExp;
}

export function compareCompatibility(run: CompatibilityRun): CompatibilityDifference[] {
  const baseUrl = run.attachmentsBaseURL ?? DEFAULT_ATTACHMENTS_BASE_URL;
  const attachmentPathPattern = buildAttachmentPathPattern(baseUrl);
  const htmlContext: NormalizeContext = {
    rootDir: run.rootDir,
    attachments: run.htmlAttachments,
    attachmentPathPattern,
  };
  const runboardContext: NormalizeContext = {
    rootDir: run.rootDir,
    attachments: run.runboardAttachments,
    attachmentPathPattern,
  };
  const html = normalizeNode(run.htmlReport, '', htmlContext) as Record<string, unknown>;
  const runboard = normalizeNode(run.runboardReport, '', runboardContext) as Record<
    string,
    unknown
  >;

  const diffs: CompatibilityDifference[] = [];
  diffObjects('report', html, runboard, diffs);

  const fileIds = new Set<string>([...run.htmlFiles.keys(), ...run.runboardFiles.keys()]);
  for (const fileId of [...fileIds].sort()) {
    const htmlFile = run.htmlFiles.get(fileId);
    const runboardFile = run.runboardFiles.get(fileId);
    if (htmlFile === undefined || runboardFile === undefined) {
      diffs.push({ path: `files/${fileId}`, expected: htmlFile, actual: runboardFile });
      continue;
    }
    diffObjects(
      `files/${fileId}`,
      normalizeNode(htmlFile, '', htmlContext) as Record<string, unknown>,
      normalizeNode(runboardFile, '', runboardContext) as Record<string, unknown>,
      diffs,
    );
  }

  return diffs;
}

function normalizeNode(value: unknown, key: string, ctx: NormalizeContext): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNode(item, '', ctx));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      out[k] = normalizeNode(value[k], k, ctx);
    }
    return out;
  }
  if (typeof value === 'number') {
    if (TIMESTAMP_FIELDS.has(key)) return TIMESTAMP_PLACEHOLDER;
    if (DURATION_FIELDS.has(key)) return DURATION_PLACEHOLDER;
    return value;
  }
  if (typeof value === 'string') {
    if (TIMESTAMP_FIELDS.has(key)) return TIMESTAMP_PLACEHOLDER;
    let normalized = value;
    if (key === 'path') {
      normalized = normalizeAttachmentPath(normalized, ctx.attachments, ctx.attachmentPathPattern);
    }
    if (SNIPPET_FIELDS.has(key)) normalized = normalizeLineEndings(normalized);
    normalized = normalizeRootPaths(normalized, ctx.rootDir);
    return normalized;
  }
  return value;
}

function buildAttachmentPathPattern(baseUrl: string): RegExp {
  const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}([0-9a-f]+)(\\.[A-Za-z0-9_.-]+)?$`);
}

const MISSING_ASSET_SENTINEL = '<missing-asset>:';

function normalizeAttachmentPath(
  value: string,
  attachments: Map<string, Buffer> | undefined,
  pattern: RegExp,
): string {
  const match = pattern.exec(value);
  if (!match) return value;
  // Without a bytes map (unit tests that explicitly opt out), leave the value
  // unchanged: the comparator can only enforce byte-equivalence when both
  // sides of the run supply attachment bytes.
  if (!attachments) return value;
  const basename = `${match[1]}${match[2] ?? ''}`;
  const bytes = attachments.get(basename);
  // Playwright derives the path from sha1(bytes), so a regression that
  // serialized the right path while skipping the asset write would naively
  // round-trip to the same string the other side sends through unchanged.
  // Replace missing-byte references with an explicit sentinel so a one-sided
  // omission cannot silently agree with the other side's content-derived hash.
  if (!bytes) {
    return `${MISSING_ASSET_SENTINEL}${basename}`;
  }
  const contentDigest = createHash('sha1').update(bytes).digest('hex');
  const ext = match[2] ?? '';
  return `data/${contentDigest}${ext}`;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function normalizeRootPaths(value: string, rootDir: string): string {
  if (!rootDir) return value;
  const escaped = rootDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Strip every "<rootDir>/" occurrence so an absolute "rootDir/x" and a
  // relative "x" collapse to the same canonical POSIX-relative form, even
  // when the absolute prefix is embedded inside a multi-line snippet.
  return value.replace(new RegExp(`${escaped}/`, 'g'), '');
}

/**
 * Collects the `<sha>.<ext>` basenames referenced by every `path` field whose
 * value matches `<attachmentsBaseURL><sha>.<ext>` inside the supplied report
 * shards. Tests use this to make the "asset bytes must exist on both sides"
 * invariant explicit rather than relying solely on the comparator's missing-
 * asset sentinel.
 */
export function collectReferencedAttachmentBasenames(
  files: Map<string, Record<string, unknown>>,
  attachmentsBaseURL: string = DEFAULT_ATTACHMENTS_BASE_URL,
): Set<string> {
  const pattern = buildAttachmentPathPattern(attachmentsBaseURL);
  const out = new Set<string>();
  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'path' && typeof child === 'string') {
        const match = pattern.exec(child);
        if (match?.[1]) out.add(`${match[1]}${match[2] ?? ''}`);
        continue;
      }
      walk(child);
    }
  }
  for (const file of files.values()) walk(file);
  return out;
}

export function formatDifferences(diffs: CompatibilityDifference[]): string {
  return diffs
    .map(
      (d) =>
        `at ${d.path}\n  expected: ${formatValue(d.expected)}\n  actual:   ${formatValue(d.actual)}`,
    )
    .join('\n');
}

/**
 * Catalog metadata supplied alongside a {@link CompatibilityRun} so the focused
 * Display Error parity comparator can label each diff with the catalog row it
 * belongs to. Issue #32 requires the comparator output to name the catalog ID
 * and Error Type so an AFK agent can act on a single failure.
 */
export interface CatalogDisplayErrorFixtureContext {
  catalogId: number;
  errorType: string;
}

/**
 * One Display Error parity mismatch from an Error Catalog fixture. Catalog
 * fixtures place their distinguishing Display Error in one of two locations:
 *  - `scope: 'result'` — per-test `result.errors[]`. The diff is scoped to a
 *    test file, per-result attempt, and per-error index inside that result.
 *  - `scope: 'top-level'` — top-level `report.errors[]`, which Playwright fills
 *    via `onError(...)` for runner-level failures (e.g. global timeout). The
 *    diff carries only the `errorIndex` position in the array; there is no
 *    test file or per-result attempt to associate it with.
 *
 * The `path` field names the field within the Display Error that diverged
 * (e.g. `message`, `codeframe`). For `top-level` scope the entries are bare
 * strings, so `path` is always `''`.
 */
export type CatalogDisplayErrorDifference =
  | CatalogResultDisplayErrorDifference
  | CatalogTopLevelDisplayErrorDifference;

export interface CatalogResultDisplayErrorDifference {
  catalogId: number;
  errorType: string;
  scope: 'result';
  testFile: string;
  testTitle: string;
  resultIndex: number;
  errorIndex: number;
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface CatalogTopLevelDisplayErrorDifference {
  catalogId: number;
  errorType: string;
  scope: 'top-level';
  errorIndex: number;
  path: string;
  expected: unknown;
  actual: unknown;
}

/**
 * Compares the Playwright HTML reporter and Runboard Reporter Display Error
 * surfaces for a Compatibility Run. Covers both per-result `result.errors[]`
 * (where most catalog rows live) and top-level `report.errors[]` (where
 * runner-level failures like the catalog #9 Global timeout surface via
 * `onError(...)`). Returns one entry per divergent field, enriched with the
 * catalog ID and Error Type so the failure message can name the row that
 * needs work, plus a `scope` discriminator that distinguishes per-result
 * from top-level diffs. Normalization is the same minimal allowlist used by
 * {@link compareCompatibility}: temp/root paths, timestamps, durations, line
 * endings, and equivalent attachment paths. Every other signal — call logs,
 * assertion diffs, codeframes, causes, screenshot/text diff signals, step or
 * hook context, and status-derived messages — surfaces as a real diff.
 */
export function compareCatalogDisplayErrors(
  run: CompatibilityRun,
  fixture: CatalogDisplayErrorFixtureContext,
): CatalogDisplayErrorDifference[] {
  const baseUrl = run.attachmentsBaseURL ?? DEFAULT_ATTACHMENTS_BASE_URL;
  const attachmentPathPattern = buildAttachmentPathPattern(baseUrl);
  const htmlContext: NormalizeContext = {
    rootDir: run.rootDir,
    attachments: run.htmlAttachments,
    attachmentPathPattern,
  };
  const runboardContext: NormalizeContext = {
    rootDir: run.rootDir,
    attachments: run.runboardAttachments,
    attachmentPathPattern,
  };

  const out: CatalogDisplayErrorDifference[] = [];
  const fileIds = new Set<string>([...run.htmlFiles.keys(), ...run.runboardFiles.keys()]);
  for (const fileId of [...fileIds].sort()) {
    const htmlFile = run.htmlFiles.get(fileId);
    const runboardFile = run.runboardFiles.get(fileId);
    // Missing-file-shard divergence is a structural concern surfaced by the
    // full comparator; the focused Display Error comparator only acts when
    // both sides serialize the same shard.
    if (!htmlFile || !runboardFile) continue;
    const fileName =
      (htmlFile['fileName'] as string | undefined) ??
      (runboardFile['fileName'] as string | undefined) ??
      '';
    const htmlTests = (htmlFile['tests'] as Array<Record<string, unknown>> | undefined) ?? [];
    const runboardTests =
      (runboardFile['tests'] as Array<Record<string, unknown>> | undefined) ?? [];
    const testCount = Math.max(htmlTests.length, runboardTests.length);
    for (let testIdx = 0; testIdx < testCount; testIdx++) {
      const htmlTest = htmlTests[testIdx];
      const runboardTest = runboardTests[testIdx];
      if (!htmlTest || !runboardTest) continue;
      const testTitle =
        (htmlTest['title'] as string | undefined) ??
        (runboardTest['title'] as string | undefined) ??
        '';
      const htmlResults = (htmlTest['results'] as Array<Record<string, unknown>> | undefined) ?? [];
      const runboardResults =
        (runboardTest['results'] as Array<Record<string, unknown>> | undefined) ?? [];
      const resultCount = Math.max(htmlResults.length, runboardResults.length);
      for (let resultIdx = 0; resultIdx < resultCount; resultIdx++) {
        const htmlResult = htmlResults[resultIdx];
        const runboardResult = runboardResults[resultIdx];
        const htmlErrors =
          (htmlResult?.['errors'] as Array<Record<string, unknown>> | undefined) ?? [];
        const runboardErrors =
          (runboardResult?.['errors'] as Array<Record<string, unknown>> | undefined) ?? [];
        const errorCount = Math.max(htmlErrors.length, runboardErrors.length);
        for (let errIdx = 0; errIdx < errorCount; errIdx++) {
          const htmlError = htmlErrors[errIdx];
          const runboardError = runboardErrors[errIdx];
          const normHtml =
            htmlError === undefined ? undefined : normalizeNode(htmlError, '', htmlContext);
          const normRunboard =
            runboardError === undefined
              ? undefined
              : normalizeNode(runboardError, '', runboardContext);
          const localDiffs: CompatibilityDifference[] = [];
          if (normHtml === undefined || normRunboard === undefined) {
            localDiffs.push({ path: '', expected: normHtml, actual: normRunboard });
          } else {
            diffValues('', normHtml, normRunboard, localDiffs);
          }
          for (const d of localDiffs) {
            out.push({
              catalogId: fixture.catalogId,
              errorType: fixture.errorType,
              scope: 'result',
              testFile: fileName,
              testTitle,
              resultIndex: resultIdx,
              errorIndex: errIdx,
              path: d.path.startsWith('/') ? d.path.slice(1) : d.path,
              expected: d.expected,
              actual: d.actual,
            });
          }
        }
      }
    }
  }

  const htmlTopLevelErrors = (run.htmlReport['errors'] as string[] | undefined) ?? [];
  const runboardTopLevelErrors = (run.runboardReport['errors'] as string[] | undefined) ?? [];
  const topLevelErrorCount = Math.max(htmlTopLevelErrors.length, runboardTopLevelErrors.length);
  for (let i = 0; i < topLevelErrorCount; i++) {
    const htmlError = htmlTopLevelErrors[i];
    const runboardError = runboardTopLevelErrors[i];
    const normHtml =
      htmlError === undefined ? undefined : normalizeTopLevelError(htmlError, run.rootDir);
    const normRunboard =
      runboardError === undefined ? undefined : normalizeTopLevelError(runboardError, run.rootDir);
    if (normHtml === normRunboard) continue;
    out.push({
      catalogId: fixture.catalogId,
      errorType: fixture.errorType,
      scope: 'top-level',
      errorIndex: i,
      path: '',
      expected: normHtml,
      actual: normRunboard,
    });
  }

  return out;
}

// Top-level errors live in `report.errors[]` as bare strings (Playwright HTML
// reporter produces them via `formatError(...).message`; the Runboard Reporter
// joins `error.stack ?? error.message ?? error.value`). Apply the same minimal
// normalization the per-result comparator uses for stack/snippet text: strip
// the rootDir prefix so absolute and project-relative paths collapse to the
// same canonical form, and normalize CRLF to LF so cross-platform output is
// equivalent.
function normalizeTopLevelError(value: string, rootDir: string): string {
  return normalizeRootPaths(normalizeLineEndings(value), rootDir);
}

/**
 * Renders {@link compareCatalogDisplayErrors} output as actionable text. For
 * per-result diffs, each line names the catalog ID, Error Type, test file,
 * per-result index, per-error index, and divergent field path. For top-level
 * diffs (e.g. global timeout), the line points at `report.errors[i]` instead
 * of a test file, so an AFK agent can grep for a single row, switch to the
 * matching fixture, and run it locally.
 */
export function formatCatalogDisplayErrorDifferences(
  diffs: readonly CatalogDisplayErrorDifference[],
): string {
  return diffs
    .map((d) => {
      const location =
        d.scope === 'top-level'
          ? `report.errors[${d.errorIndex}]`
          : `${d.testFile} > ${d.testTitle} > result[${d.resultIndex}] > errors[${d.errorIndex}]`;
      const header = `Catalog #${d.catalogId} (${d.errorType}) — ${location}${d.path ? ` > ${d.path}` : ''}`;
      return `${header}\n  expected: ${formatValue(d.expected)}\n  actual:   ${formatValue(d.actual)}`;
    })
    .join('\n');
}

function formatValue(v: unknown): string {
  if (v === undefined) return '<missing>';
  return JSON.stringify(v);
}

function diffValues(
  path: string,
  expected: unknown,
  actual: unknown,
  diffs: CompatibilityDifference[],
): void {
  if (expected === actual) return;
  if (isPlainObject(expected) && isPlainObject(actual)) {
    diffObjects(path, expected, actual, diffs);
    return;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    diffArrays(path, expected, actual, diffs);
    return;
  }
  diffs.push({ path, expected, actual });
}

function diffObjects(
  path: string,
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  diffs: CompatibilityDifference[],
): void {
  const keys = new Set<string>([...Object.keys(expected), ...Object.keys(actual)]);
  // The Runboard Extension is namespaced by design. The first Runboard Data
  // Contract places extensions only at `report.runboard` (Runboard Metadata)
  // and per-result `runboard` (Result Evidence); both are absent from
  // Playwright's HTML report. Ignore those keys when they're only present on
  // the runboard side, so a future extension elsewhere still flags as drift.
  if (!(RUNBOARD_EXTENSION_KEY in expected) && (path === 'report' || isResultPath(path))) {
    keys.delete(RUNBOARD_EXTENSION_KEY);
  }
  for (const key of [...keys].sort()) {
    diffValues(`${path}/${key}`, expected[key], actual[key], diffs);
  }
}

const RESULT_PATH_PATTERN = /\/tests\/\d+\/results\/\d+$/;

function isResultPath(path: string): boolean {
  return RESULT_PATH_PATTERN.test(path);
}

function diffArrays(
  path: string,
  expected: readonly unknown[],
  actual: readonly unknown[],
  diffs: CompatibilityDifference[],
): void {
  const length = Math.max(expected.length, actual.length);
  for (let i = 0; i < length; i++) {
    diffValues(`${path}/${i}`, expected[i], actual[i], diffs);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const HTML_TEMPLATE_OPEN = '<template id="playwrightReportBase64">data:application/zip;base64,';
const HTML_TEMPLATE_CLOSE = '</template>';

export async function extractHtmlReportData(indexHtmlPath: string): Promise<ExtractedHtmlReport> {
  const html = await readFile(indexHtmlPath, 'utf8');
  const start = html.indexOf(HTML_TEMPLATE_OPEN);
  if (start < 0) {
    throw new Error(
      `Compatibility Fixture: ${indexHtmlPath} does not contain the expected ` +
        `playwrightReportBase64 template that Playwright's HTML reporter writes.`,
    );
  }
  const payloadStart = start + HTML_TEMPLATE_OPEN.length;
  const end = html.indexOf(HTML_TEMPLATE_CLOSE, payloadStart);
  if (end < 0) {
    throw new Error(
      `Compatibility Fixture: ${indexHtmlPath} contains a playwrightReportBase64 template ` +
        `opening but is missing its closing </template> tag.`,
    );
  }
  const base64 = html.slice(payloadStart, end).replace(/\s+/g, '');
  const zipBuffer = Buffer.from(base64, 'base64');
  const entries = readZipEntries(zipBuffer);

  let report: Record<string, unknown> | undefined;
  const files = new Map<string, Record<string, unknown>>();
  for (const [name, body] of entries) {
    if (name === 'report.json') {
      report = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
      continue;
    }
    const fileIdMatch = /^([0-9a-f]+)\.json$/.exec(name);
    if (fileIdMatch?.[1]) {
      files.set(fileIdMatch[1], JSON.parse(body.toString('utf8')) as Record<string, unknown>);
    }
  }

  if (!report) {
    throw new Error(`Compatibility Fixture: ${indexHtmlPath} embedded zip is missing report.json.`);
  }
  return { report, files };
}

// Minimal ZIP central-directory reader for the small set of entries that
// Playwright's HTML reporter packs (report.json + per-file shards). Supports
// STORE (method 0) and DEFLATE (method 8). yazl writes both; the reporter's
// JSON entries are typically deflated.
function readZipEntries(zipBuffer: Buffer): Map<string, Buffer> {
  const eocdOffset = findEndOfCentralDirectory(zipBuffer);
  const centralDirSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const out = new Map<string, Buffer>();

  let cursor = centralDirOffset;
  const centralDirEnd = centralDirOffset + centralDirSize;
  while (cursor < centralDirEnd) {
    if (zipBuffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Compatibility Fixture: corrupt ZIP central directory entry.');
    }
    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(cursor + 24);
    const nameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraLength = zipBuffer.readUInt16LE(cursor + 30);
    const commentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);
    const name = zipBuffer.slice(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    if (zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Compatibility Fixture: corrupt ZIP local header for ${name}.`);
    }
    const localNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = zipBuffer.slice(dataStart, dataStart + compressedSize);

    let body: Buffer;
    if (compressionMethod === 0) {
      body = compressedData;
    } else if (compressionMethod === 8) {
      body = inflateRawSync(compressedData);
      if (body.length !== uncompressedSize) {
        throw new Error(
          `Compatibility Fixture: ZIP inflate size mismatch for ${name} ` +
            `(expected ${uncompressedSize}, got ${body.length}).`,
        );
      }
    } else {
      throw new Error(
        `Compatibility Fixture: unsupported ZIP compression method ${compressionMethod} for ${name}.`,
      );
    }
    out.set(name, body);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

function findEndOfCentralDirectory(zipBuffer: Buffer): number {
  // Scan from the end backwards for the EOCD signature; the comment field is
  // bounded by 65535 bytes per the ZIP spec.
  const minOffset = Math.max(0, zipBuffer.length - 22 - 0xffff);
  for (let i = zipBuffer.length - 22; i >= minOffset; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  throw new Error('Compatibility Fixture: ZIP end-of-central-directory record not found.');
}

export interface RunCompatibilityFixtureOptions {
  /**
   * Disposable temp directory the harness owns. The harness writes the
   * Playwright config, spec files, and both reporter outputs underneath it.
   * Callers are responsible for cleanup; tests use mkdtemp + rm.
   */
  workDir: string;
  /**
   * Built `dist/runboard-reporter.js` path; passed straight to Playwright's
   * `reporter` config so a real Node process loads the published entry.
   */
  reporterDist: string;
  /**
   * Spec files to drop under `<workDir>/specs/`. Keys are spec-relative
   * file names (e.g. `pass.spec.ts`); values are the file contents.
   */
  specs: Record<string, string>;
  /**
   * Optional override for both reporters' `attachmentsBaseURL` option. When
   * supplied, both the Runboard Reporter and Playwright HTML reporter receive
   * the same prefix and the resulting {@link CompatibilityRun} carries it so
   * the comparator matches attachment paths against the configured prefix.
   */
  attachmentsBaseURL?: string;
  /**
   * Allow Playwright to exit non-zero. Required for fault-injection fixtures
   * where the suite itself reports a failure (e.g. error-evidence parity that
   * intentionally throws or uses `test.fail()` unexpectedly passing). Both
   * reporters still write a complete bundle when Playwright exits non-zero,
   * so the comparator and evidence assertions remain meaningful.
   */
  expectFailingSuite?: boolean;
  /**
   * Wires a chromium browser project into the inner Playwright config. Most
   * Error Catalog fixtures need a real browser to surface their distinguishing
   * Display Error wording (e.g. action timeouts, locator failures); only the
   * pure-runner cases (`expect()` matchers, hooks) can opt out.
   */
  needsBrowser?: boolean;
  /**
   * Extra top-level keys appended to the inner `defineConfig({...})` body.
   * Mirrors the catalog runner so a single fixture can pin `globalTimeout`,
   * `timeout`, or other Playwright config knobs without leaking them into the
   * spec source.
   */
  extraConfigLines?: readonly string[];
}

export async function runCompatibilityFixture(
  options: RunCompatibilityFixtureOptions,
): Promise<CompatibilityRun> {
  const {
    workDir,
    reporterDist,
    specs,
    attachmentsBaseURL,
    expectFailingSuite,
    needsBrowser = false,
    extraConfigLines = [],
  } = options;
  const specsDir = join(workDir, 'specs');
  const runboardOutputDir = join(workDir, 'runboard-bundle');
  const htmlOutputDir = join(workDir, 'html-bundle');
  const configPath = join(workDir, 'playwright.config.mjs');

  await mkdirp(specsDir);
  for (const [name, body] of Object.entries(specs)) {
    const target = join(specsDir, name);
    await mkdirp(dirname(target));
    await writeFile(target, body, 'utf8');
  }

  // `noSnippets: true` is set on both reporters because Playwright's HTML
  // reporter generates snippets via Babel's `codeFrameColumns` while the
  // Runboard Reporter uses a pure Node algorithm; matching the algorithm
  // byte-for-byte is a separate parity workstream. The PRD allowlist lets us
  // normalize snippet line-ending or root-path noise, but it does not cover
  // wholesale algorithm differences, so the smoke pins both sides to no
  // snippets to keep the comparison strict elsewhere.
  const reporterOptions = JSON.stringify({
    outputFolder: runboardOutputDir,
    noSnippets: true,
    ...(attachmentsBaseURL !== undefined ? { attachmentsBaseURL } : {}),
  });
  const htmlOptions = JSON.stringify({
    outputFolder: htmlOutputDir,
    open: 'never',
    noSnippets: true,
    ...(attachmentsBaseURL !== undefined ? { attachmentsBaseURL } : {}),
  });
  const browserImports = needsBrowser
    ? `import { defineConfig, devices } from '@playwright/test';`
    : `import { defineConfig } from '@playwright/test';`;
  const projectsLine = needsBrowser
    ? `  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],`
    : '';
  // Pin the child Playwright run's `outputDir` to a workDir-scoped folder.
  // Playwright otherwise resolves the default to `<packageJsonDir>/test-results/`,
  // and its `clear output` startup task removes that folder wholesale (see
  // `createRemoveOutputDirsTask`). When two parent compatibility tests run in
  // parallel, the second child's startup wipes the first child's test-results
  // subdir mid-run, after which the HTML reporter's `fs.readFileSync(a.path)`
  // for path-backed attachments silently fails and leaves an absolute path in
  // the serialized report — surfacing as a spurious Compatibility Fixture diff.
  const childOutputDir = join(workDir, 'test-results');
  const configSource = [
    browserImports,
    `export default defineConfig({`,
    `  testDir: ${JSON.stringify(specsDir)},`,
    `  outputDir: ${JSON.stringify(childOutputDir)},`,
    `  fullyParallel: false,`,
    ...extraConfigLines.map((line) => `  ${line}`),
    `  reporter: [`,
    `    [${JSON.stringify(reporterDist)}, ${reporterOptions}],`,
    `    ['html', ${htmlOptions}],`,
    `  ],`,
    projectsLine,
    `});`,
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
  await writeFile(configPath, configSource, 'utf8');

  const pkgRoot = resolve(dirname(reporterDist), '..');
  const playwrightBin = join(pkgRoot, 'node_modules', '.bin', 'playwright');
  // Playwright exits non-zero when the fixture itself reports a failure. The
  // baseline harness uses non-failing fixtures so passing-bundle parity stays
  // the default; fault-injection scenarios opt in via `expectFailingSuite` so
  // both reporters can still write complete bundles for evidence parity. The
  // CLI must run from the package root so the generated playwright config can
  // resolve `@playwright/test` against the installed node_modules.
  // Strip env overrides that would otherwise outrank the explicit reporter
  // options below. Both reporters resolve options through `?? env ?? default`
  // chains where an empty string still counts as defined, so unsetting the
  // keys (rather than emptying them) is what restores the default fallbacks.
  const childEnv: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };
  for (const key of [
    'PLAYWRIGHT_RUNBOARD_OUTPUT_DIR',
    'PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL',
    'PLAYWRIGHT_HTML_OUTPUT_DIR',
    'PLAYWRIGHT_HTML_REPORT',
    'PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL',
  ]) {
    delete childEnv[key];
  }
  childEnv['PLAYWRIGHT_HTML_OPEN'] = 'never';

  try {
    execFileSync(playwrightBin, ['test', '--config', configPath], {
      cwd: pkgRoot,
      stdio: 'pipe',
      env: childEnv,
    });
  } catch (error) {
    if (!expectFailingSuite) throw error;
  }

  const runboardReport = JSON.parse(
    await readFile(join(runboardOutputDir, 'report.json'), 'utf8'),
  ) as Record<string, unknown>;
  const runboardFiles = await readRunboardFileShards(runboardOutputDir);
  const runboardAttachments = await readAttachmentBytes(join(runboardOutputDir, 'data'));
  const html = await extractHtmlReportData(join(htmlOutputDir, 'index.html'));
  // Playwright's HTML reporter writes attachment bytes to <htmlOutputDir>/data/<sha>.<ext>
  // alongside the index.html bundle, not into the embedded zip.
  const htmlAttachments = await readAttachmentBytes(join(htmlOutputDir, 'data'));

  return {
    htmlReport: html.report,
    htmlFiles: html.files,
    htmlAttachments,
    runboardReport,
    runboardFiles,
    runboardAttachments,
    rootDir: specsDir,
    ...(attachmentsBaseURL !== undefined ? { attachmentsBaseURL } : {}),
  };
}

export interface RunMergeReportsFixtureOptions {
  workDir: string;
  reporterDist: string;
  specs: Record<string, string>;
  /**
   * One config block per shard; each block contributes one machine to the
   * merged report (matching Playwright's HTML reporter `machines[]` semantics).
   * The harness invokes Playwright once per shard with `--shard=current/total`
   * and the shard-specific `tags`, then runs `playwright merge-reports` over
   * all collected blob reports with both the Runboard Reporter and Playwright
   * HTML reporter wired into the merge config.
   */
  shards: Array<{ tags?: string[] }>;
}

export async function runMergeReportsCompatibilityFixture(
  options: RunMergeReportsFixtureOptions,
): Promise<CompatibilityRun> {
  const { workDir, reporterDist, specs, shards } = options;
  if (shards.length === 0) {
    throw new Error('Compatibility Fixture: runMergeReportsCompatibilityFixture needs ≥1 shard');
  }
  const specsDir = join(workDir, 'specs');
  const blobDir = join(workDir, 'blob-reports');
  const runboardOutputDir = join(workDir, 'runboard-bundle');
  const htmlOutputDir = join(workDir, 'html-bundle');

  await mkdirp(specsDir);
  await mkdirp(blobDir);
  for (const [name, body] of Object.entries(specs)) {
    const target = join(specsDir, name);
    await mkdirp(dirname(target));
    await writeFile(target, body, 'utf8');
  }

  const pkgRoot = resolve(dirname(reporterDist), '..');
  const playwrightBin = join(pkgRoot, 'node_modules', '.bin', 'playwright');

  const childEnv: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };
  for (const key of [
    'PLAYWRIGHT_RUNBOARD_OUTPUT_DIR',
    'PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL',
    'PLAYWRIGHT_HTML_OUTPUT_DIR',
    'PLAYWRIGHT_HTML_REPORT',
    'PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL',
    'PLAYWRIGHT_BLOB_DO_NOT_PROCESS_CLI_OPTIONS',
  ]) {
    delete childEnv[key];
  }
  childEnv['PLAYWRIGHT_HTML_OPEN'] = 'never';

  for (const [index, shard] of shards.entries()) {
    const current = index + 1;
    const total = shards.length;
    const shardBlobDir = join(blobDir, `shard-${current}`);
    await mkdirp(shardBlobDir);
    const shardConfigPath = join(workDir, `playwright.shard-${current}.config.mjs`);
    const blobOptions = JSON.stringify({ outputDir: shardBlobDir, fileName: `report.zip` });
    // See `runCompatibilityFixture` for the rationale: pin the child run's
    // `outputDir` under workDir so parallel parent tests can't race on
    // `<packageJsonDir>/test-results/` via the `clear output` startup task.
    const shardOutputDir = join(workDir, `test-results-shard-${current}`);
    const shardConfig = [
      `import { defineConfig } from '@playwright/test';`,
      `export default defineConfig({`,
      `  testDir: ${JSON.stringify(specsDir)},`,
      `  outputDir: ${JSON.stringify(shardOutputDir)},`,
      `  fullyParallel: false,`,
      `  workers: 1,`,
      shard.tags && shard.tags.length > 0 ? `  tag: ${JSON.stringify(shard.tags)},` : '',
      `  reporter: [['blob', ${blobOptions}]],`,
      `});`,
      '',
    ]
      .filter(Boolean)
      .join('\n');
    await writeFile(shardConfigPath, shardConfig, 'utf8');

    execFileSync(
      playwrightBin,
      ['test', '--config', shardConfigPath, `--shard=${current}/${total}`],
      { cwd: pkgRoot, stdio: 'pipe', env: childEnv },
    );
  }

  // Stage every blob into a single directory because `merge-reports` reads
  // one directory rather than walking subdirectories.
  const mergedBlobDir = join(workDir, 'merged-blob');
  await mkdirp(mergedBlobDir);
  for (const [index] of shards.entries()) {
    const current = index + 1;
    const source = join(blobDir, `shard-${current}`, `report.zip`);
    const dest = join(mergedBlobDir, `report-${current}.zip`);
    await writeFile(dest, await readFile(source));
  }

  const mergeReporterOptions = JSON.stringify({
    outputFolder: runboardOutputDir,
    noSnippets: true,
  });
  const htmlOptions = JSON.stringify({
    outputFolder: htmlOutputDir,
    open: 'never',
    noSnippets: true,
  });
  const mergeConfigPath = join(workDir, 'merge.config.mjs');
  const mergeConfig = [
    `import { defineConfig } from '@playwright/test';`,
    `export default defineConfig({`,
    `  reporter: [`,
    `    [${JSON.stringify(reporterDist)}, ${mergeReporterOptions}],`,
    `    ['html', ${htmlOptions}],`,
    `  ],`,
    `});`,
    '',
  ].join('\n');
  await writeFile(mergeConfigPath, mergeConfig, 'utf8');

  execFileSync(playwrightBin, ['merge-reports', '--config', mergeConfigPath, mergedBlobDir], {
    cwd: pkgRoot,
    stdio: 'pipe',
    env: childEnv,
  });

  const runboardReport = JSON.parse(
    await readFile(join(runboardOutputDir, 'report.json'), 'utf8'),
  ) as Record<string, unknown>;
  const runboardFiles = await readRunboardFileShards(runboardOutputDir);
  const runboardAttachments = await readAttachmentBytes(join(runboardOutputDir, 'data'));
  const html = await extractHtmlReportData(join(htmlOutputDir, 'index.html'));
  const htmlAttachments = await readAttachmentBytes(join(htmlOutputDir, 'data'));

  return {
    htmlReport: html.report,
    htmlFiles: html.files,
    htmlAttachments,
    runboardReport,
    runboardFiles,
    runboardAttachments,
    rootDir: specsDir,
  };
}

async function readRunboardFileShards(
  outputDir: string,
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const entries = await readdir(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileIdMatch = /^([0-9a-f]+)\.json$/.exec(entry.name);
    if (!fileIdMatch?.[1]) continue;
    const text = await readFile(join(outputDir, entry.name), 'utf8');
    out.set(fileIdMatch[1], JSON.parse(text) as Record<string, unknown>);
  }
  return out;
}

async function readAttachmentBytes(dataDir: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const entries = await readdir(dataDir, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    out.set(entry.name, await readFile(join(dataDir, entry.name)));
  }
  return out;
}

async function mkdirp(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
