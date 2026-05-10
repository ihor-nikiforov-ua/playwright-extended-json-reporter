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

const ATTACHMENT_PATH_PATTERN = /^data\/([0-9a-f]+)(\.[A-Za-z0-9_.-]+)?$/;

interface NormalizeContext {
  rootDir: string;
  attachments: Map<string, Buffer> | undefined;
}

export function compareCompatibility(run: CompatibilityRun): CompatibilityDifference[] {
  const htmlContext: NormalizeContext = {
    rootDir: run.rootDir,
    attachments: run.htmlAttachments,
  };
  const runboardContext: NormalizeContext = {
    rootDir: run.rootDir,
    attachments: run.runboardAttachments,
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
    if (key === 'path') normalized = normalizeAttachmentPath(normalized, ctx.attachments);
    if (SNIPPET_FIELDS.has(key)) normalized = normalizeLineEndings(normalized);
    normalized = normalizeRootPaths(normalized, ctx.rootDir);
    return normalized;
  }
  return value;
}

function normalizeAttachmentPath(
  value: string,
  attachments: Map<string, Buffer> | undefined,
): string {
  const match = ATTACHMENT_PATH_PATTERN.exec(value);
  if (!match) return value;
  // Only normalize the hash when we can prove byte-equivalence: replace the
  // sha with a content-derived digest of the referenced attachment bytes. If
  // bytes are missing, leave the original sha so a real divergence still
  // surfaces.
  if (!attachments) return value;
  const basename = `${match[1]}${match[2] ?? ''}`;
  const bytes = attachments.get(basename);
  if (!bytes) return value;
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

export function formatDifferences(diffs: CompatibilityDifference[]): string {
  return diffs
    .map(
      (d) =>
        `at ${d.path}\n  expected: ${formatValue(d.expected)}\n  actual:   ${formatValue(d.actual)}`,
    )
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
  // The Runboard Extension is namespaced by design: when the path is the report
  // root, ignore the runboard-side `runboard` field and only flag it if the HTML
  // reporter ever starts emitting one.
  if (path === 'report' && !(RUNBOARD_EXTENSION_KEY in expected)) {
    keys.delete(RUNBOARD_EXTENSION_KEY);
  }
  for (const key of [...keys].sort()) {
    diffValues(`${path}/${key}`, expected[key], actual[key], diffs);
  }
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
}

export async function runCompatibilityFixture(
  options: RunCompatibilityFixtureOptions,
): Promise<CompatibilityRun> {
  const { workDir, reporterDist, specs } = options;
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
  });
  const htmlOptions = JSON.stringify({
    outputFolder: htmlOutputDir,
    open: 'never',
    noSnippets: true,
  });
  const configSource = [
    `import { defineConfig } from '@playwright/test';`,
    `export default defineConfig({`,
    `  testDir: ${JSON.stringify(specsDir)},`,
    `  fullyParallel: false,`,
    `  reporter: [`,
    `    [${JSON.stringify(reporterDist)}, ${reporterOptions}],`,
    `    ['html', ${htmlOptions}],`,
    `  ],`,
    `});`,
    '',
  ].join('\n');
  await writeFile(configPath, configSource, 'utf8');

  const pkgRoot = resolve(dirname(reporterDist), '..');
  const playwrightBin = join(pkgRoot, 'node_modules', '.bin', 'playwright');
  // Playwright exits non-zero when the fixture itself reports a failure. The
  // harness uses non-failing fixtures to make passing-bundle parity the
  // baseline; fault-injection scenarios will need to opt in to ignore the exit
  // code separately. The CLI must run from the package root so the generated
  // playwright config can resolve `@playwright/test` against the installed
  // node_modules.
  execFileSync(playwrightBin, ['test', '--config', configPath], {
    cwd: pkgRoot,
    stdio: 'pipe',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      // Prevent the Runboard Reporter and Playwright HTML reporter from
      // resolving outputs relative to a stale env override during the test.
      PLAYWRIGHT_RUNBOARD_OUTPUT_DIR: '',
      PLAYWRIGHT_HTML_OUTPUT_DIR: '',
      PLAYWRIGHT_HTML_REPORT: '',
      PLAYWRIGHT_HTML_OPEN: 'never',
    },
  });

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
