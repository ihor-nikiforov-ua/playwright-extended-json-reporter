import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type { TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';
import type {
  RunboardErrorEvidence,
  RunboardLocation,
  RunboardSourceExcerpt,
  RunboardTestAttachment,
  RunboardTestCase,
  RunboardTestCaseSummary,
  RunboardTestErrorEvidence,
  RunboardTestResult,
  RunboardTestResultSummary,
  RunboardTestStep,
} from './contract.js';
import { formatDisplayErrors } from './display-error-formatter.js';

export interface SerializeContext {
  projectName: string;
  fileName: string;
  rootDir: string;
  outputFolder: string;
  attachmentsBaseURL: string;
  noSnippets?: boolean;
}

export function serializeTestCase(test: TestCase, ctx: SerializeContext): RunboardTestCase {
  const base = baseTestCase(test, ctx);
  return {
    ...base,
    results: test.results.map((result) => serializeResult(test, result, ctx)),
  };
}

export function summarizeTestCase(test: TestCase, ctx: SerializeContext): RunboardTestCaseSummary {
  const base = baseTestCase(test, ctx);
  return {
    ...base,
    results: test.results.map((result) => summarizeResult(result, ctx)),
  };
}

function baseTestCase(
  test: TestCase,
  ctx: SerializeContext,
): Omit<RunboardTestCaseSummary, 'results'> {
  const titlePath = test.titlePath();
  const path = titlePath.slice(3, -1);
  const duration = test.results.reduce((acc, r) => acc + r.duration, 0);
  const summary: Omit<RunboardTestCaseSummary, 'results'> = {
    testId: test.id,
    title: test.title,
    path,
    projectName: ctx.projectName,
    location: relativeLocation(ctx.rootDir, test.location),
    annotations: test.annotations.map((a) => ({ ...a })),
    tags: [...test.tags],
    outcome: test.outcome(),
    duration,
    ok: test.ok(),
  };
  // Playwright's HTML reporter omits `repeatEachIndex` from serialized
  // testCase shapes (see playwright/lib/reporters/html.js); its public
  // reporter API exposes the field as a number that defaults to 0, so the
  // Compatibility Fixture treats the omission as canonical and only emits
  // the field when it has a meaningful (non-zero) value.
  if (test.repeatEachIndex) {
    summary.repeatEachIndex = test.repeatEachIndex;
  }
  return summary;
}

function serializeResult(
  test: TestCase,
  result: TestResult,
  ctx: SerializeContext,
): RunboardTestResult {
  const attachments = serializeAttachments(collectAttachments(result), ctx);
  const out: RunboardTestResult = {
    retry: result.retry,
    startTime: result.startTime.toISOString(),
    duration: result.duration,
    steps: dedupeSteps(result.steps).map((d) => serializeStep(d, result.attachments, ctx)),
    errors: formatDisplayErrors(test, result),
    attachments,
    status: result.status,
    annotations: (result.annotations ?? []).map((a) => ({ ...a })),
    workerIndex: result.workerIndex,
  };
  const evidence = formatEvidenceEntries(test, result, ctx);
  if (evidence.length > 0) {
    out.runboard = { evidence };
  }
  return out;
}

function summarizeResult(result: TestResult, ctx: SerializeContext): RunboardTestResultSummary {
  const attachments = serializeAttachments(collectAttachments(result), ctx);
  return {
    attachments: attachments.map((a) => {
      const summary: { name: string; contentType: string; path?: string } = {
        name: a.name,
        contentType: a.contentType,
      };
      if (a.path !== undefined) summary.path = a.path;
      return summary;
    }),
    startTime: result.startTime.toISOString(),
    workerIndex: result.workerIndex,
  };
}

interface DedupedStep {
  step: TestStep;
  count: number;
  duration: number;
}

function dedupeSteps(steps: readonly TestStep[]): DedupedStep[] {
  const out: DedupedStep[] = [];
  let last: DedupedStep | undefined;
  for (const step of steps) {
    const canDedupe =
      !step.error && step.duration >= 0 && !!step.location?.file && step.steps.length === 0;
    if (
      canDedupe &&
      last &&
      step.category === last.step.category &&
      step.title === last.step.title &&
      step.location?.file === last.step.location?.file &&
      step.location?.line === last.step.location?.line &&
      step.location?.column === last.step.location?.column
    ) {
      last.count += 1;
      last.duration += step.duration;
      continue;
    }
    last = { step, count: 1, duration: step.duration };
    out.push(last);
    if (!canDedupe) last = undefined;
  }
  return out;
}

function serializeStep(
  deduped: DedupedStep,
  resultAttachments: readonly TestResult['attachments'][number][],
  ctx: SerializeContext,
): RunboardTestStep {
  const { step, count, duration } = deduped;
  const skipAnnotation = step.annotations?.find((a) => a.type === 'skip');
  const title = skipAnnotation
    ? `${step.title} (skipped${skipAnnotation.description ? `: ${skipAnnotation.description}` : ''})`
    : step.title;
  // Playwright's HTML reporter writes `skipped: !!skip-annotation` on every
  // serialized step (see playwright/lib/reporters/html.js _createTestStep);
  // emit the same boolean shape unconditionally so the Compatibility Fixture
  // sees identical step payloads when no skip annotation is present.
  const out: RunboardTestStep = {
    title,
    startTime: step.startTime.toISOString(),
    duration,
    steps: dedupeSteps(step.steps).map((d) => serializeStep(d, resultAttachments, ctx)),
    attachments: step.attachments
      .map((attachment) => resultAttachments.indexOf(attachment))
      .filter((index) => index !== -1),
    count,
    skipped: skipAnnotation !== undefined,
  };
  if (step.location !== undefined) {
    out.location = relativeLocation(ctx.rootDir, step.location);
  }
  if (step.error !== undefined) {
    out.error = step.error.message ?? step.error.value ?? '';
  }
  if (!ctx.noSnippets && step.location !== undefined) {
    const snippet = readSourceSnippet(step.location.file, step.location.line, step.location.column);
    if (snippet !== undefined) out.snippet = snippet;
  }
  return out;
}

interface StepLinkage {
  stepPath: string[];
  stepCategory: string;
  attachmentIndexes: number[];
}

interface StepLinkageEntry {
  key: string;
  linkage: StepLinkage;
}

// Real Playwright serializes `step.error` and the corresponding entry in
// `result.errors[]` as separate TestError objects across the worker→main IPC
// boundary, so reference identity cannot associate an error with the step
// that recorded it. The structural key combines fields that survive
// serialization unchanged (message/stack/value/location). The queue is built
// in post-order (children before parent) so when Playwright records the same
// `step.error` on every step on the failing call stack, the deepest match is
// consumed first; sibling order is preserved so two siblings emitting
// structurally-equal errors each receive their own linkage. Attachments are
// collected from the matching step's whole subtree because Playwright sets
// `step.error` on outer test.step boundaries while attachments captured
// during the failure (e.g. screenshots) live on inner pw:api / test.step
// children — strict per-step `step.attachments` would drop them entirely.
function buildStepLinkageQueue(result: TestResult): StepLinkageEntry[] {
  const out: StepLinkageEntry[] = [];
  function walk(step: TestStep, parents: readonly string[]): void {
    const path = [...parents, step.title];
    for (const child of step.steps) walk(child, path);
    if (step.error) {
      out.push({
        key: stepLinkageKey(step.error),
        linkage: {
          stepPath: path,
          stepCategory: step.category,
          attachmentIndexes: collectSubtreeAttachmentIndexes(step, result.attachments),
        },
      });
    }
  }
  for (const step of result.steps) walk(step, []);
  return out;
}

function collectSubtreeAttachmentIndexes(
  step: TestStep,
  resultAttachments: readonly TestResult['attachments'][number][],
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  function visit(current: TestStep): void {
    for (const attachment of current.attachments) {
      const index = resultAttachments.indexOf(attachment);
      if (index < 0 || seen.has(index)) continue;
      seen.add(index);
      out.push(index);
    }
    for (const child of current.steps) visit(child);
  }
  visit(step);
  return out;
}

function stepLinkageKey(error: TestError): string {
  const location = error.location
    ? `${error.location.file}:${error.location.line}:${error.location.column}`
    : '';
  return JSON.stringify([error.message ?? '', error.stack ?? '', error.value ?? '', location]);
}

function consumeStepLinkage(queue: StepLinkageEntry[], error: TestError): StepLinkage | undefined {
  const key = stepLinkageKey(error);
  // The queue is post-order, so the first matching entry is the deepest step
  // on the failing call stack — Playwright propagates the same `step.error`
  // up through every parent test.step boundary, leaving an ancestor chain of
  // structurally-equal entries. Use the deepest entry's stepPath /
  // stepCategory (the test step that actually threw) and union attachment
  // indexes across the chain so attachments captured at any level of the
  // failing path (e.g. testInfo.attach() inside an inner step that produces
  // a `test.attach` child step) are surfaced on the evidence linkage.
  const deepestIndex = queue.findIndex((entry) => entry.key === key);
  if (deepestIndex < 0) return undefined;
  const deepest = queue[deepestIndex];
  if (!deepest) return undefined;

  const ancestorIndexes: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    if (i === deepestIndex) continue;
    const candidate = queue[i];
    if (!candidate || candidate.key !== key) continue;
    if (isStepPathStrictPrefix(candidate.linkage.stepPath, deepest.linkage.stepPath)) {
      ancestorIndexes.push(i);
    }
  }

  const attachmentIndexes = new Set<number>(deepest.linkage.attachmentIndexes);
  for (const i of ancestorIndexes) {
    const ancestor = queue[i];
    if (!ancestor) continue;
    for (const idx of ancestor.linkage.attachmentIndexes) attachmentIndexes.add(idx);
  }

  for (const i of [deepestIndex, ...ancestorIndexes].sort((a, b) => b - a)) {
    queue.splice(i, 1);
  }

  return {
    stepPath: deepest.linkage.stepPath,
    stepCategory: deepest.linkage.stepCategory,
    attachmentIndexes: [...attachmentIndexes].sort((a, b) => a - b),
  };
}

function isStepPathStrictPrefix(prefix: readonly string[], full: readonly string[]): boolean {
  if (prefix.length >= full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

function buildTestErrorEvidence(
  error: TestError,
  ctx: SerializeContext,
  queue: StepLinkageEntry[],
): RunboardTestErrorEvidence {
  const out: RunboardTestErrorEvidence = { source: 'test-error' };
  if (error.message !== undefined) out.message = error.message;
  if (error.stack !== undefined) out.stack = error.stack;
  if (error.value !== undefined) out.value = error.value;
  if (error.snippet !== undefined) out.snippet = error.snippet;
  if (error.location !== undefined) out.location = relativeLocation(ctx.rootDir, error.location);
  if (error.cause) out.cause = buildTestErrorEvidence(error.cause, ctx, queue);
  const link = consumeStepLinkage(queue, error);
  if (link) {
    out.stepPath = link.stepPath;
    out.stepCategory = link.stepCategory;
    if (link.attachmentIndexes.length > 0) out.attachmentIndexes = link.attachmentIndexes;
  }
  if (!ctx.noSnippets && error.location !== undefined) {
    const excerpt = buildSourceExcerpt(error.location, ctx);
    if (excerpt) out.sourceExcerpt = excerpt;
  }
  return out;
}

function buildSourceExcerpt(
  location: { file: string; line: number; column: number },
  ctx: SerializeContext,
): RunboardSourceExcerpt | undefined {
  let source: string;
  try {
    source = readFileSync(location.file, 'utf8');
  } catch {
    return undefined;
  }
  const allLines = source.split('\n');
  // A trailing newline produces an empty terminator element from split('\n');
  // drop it so line counts and clipping reflect the file's actual line content.
  if (allLines.length > 0 && allLines[allLines.length - 1] === '' && source.endsWith('\n')) {
    allLines.pop();
  }
  if (location.line < 1 || location.line > allLines.length) return undefined;
  const startLine = Math.max(1, location.line - 2);
  const endLine = Math.min(allLines.length, location.line + 2);
  const lines = allLines.slice(startLine - 1, endLine);
  const excerpt: RunboardSourceExcerpt = {
    file: toPosixPath(relative(ctx.rootDir, location.file)),
    startLine,
    lines,
    highlightedLine: location.line,
  };
  if (location.column > 0) excerpt.highlightedColumn = location.column;
  return excerpt;
}

function formatEvidenceEntries(
  test: TestCase,
  result: TestResult,
  ctx: SerializeContext,
): RunboardErrorEvidence[] {
  const out: RunboardErrorEvidence[] = [];
  if (result.status === 'passed' && test.expectedStatus === 'failed') {
    out.push({ source: 'status-derived', message: 'Expected to fail, but passed.' });
  }
  if (result.status === 'interrupted') {
    out.push({ source: 'status-derived', message: 'Test was interrupted.' });
  }
  const queue = buildStepLinkageQueue(result);
  for (const error of result.errors ?? []) {
    out.push(buildTestErrorEvidence(error, ctx, queue));
  }
  return out;
}

interface NormalizedAttachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string | Buffer;
}

function collectAttachments(result: TestResult): NormalizedAttachment[] {
  const attachments: NormalizedAttachment[] = [];
  for (const a of result.attachments) {
    const item: NormalizedAttachment = { name: a.name, contentType: a.contentType };
    if (a.path !== undefined) item.path = a.path;
    if (a.body !== undefined) item.body = a.body;
    attachments.push(item);
  }
  for (const chunk of result.stdout ?? []) {
    attachments.push(stdioAttachment(chunk, 'stdout'));
  }
  for (const chunk of result.stderr ?? []) {
    attachments.push(stdioAttachment(chunk, 'stderr'));
  }
  return attachments;
}

function stdioAttachment(chunk: string | Buffer, name: 'stdout' | 'stderr'): NormalizedAttachment {
  return {
    name,
    contentType: 'text/plain',
    body: typeof chunk === 'string' ? chunk : chunk.toString('utf8'),
  };
}

function serializeAttachments(
  attachments: NormalizedAttachment[],
  ctx: SerializeContext,
): RunboardTestAttachment[] {
  const out: RunboardTestAttachment[] = [];
  let lastStdio: RunboardTestAttachment | undefined;
  for (const a of attachments) {
    const isStdio = (a.name === 'stdout' || a.name === 'stderr') && a.contentType === 'text/plain';
    if (isStdio) {
      const text = stripAnsiEscapes(
        typeof a.body === 'string' ? a.body : (a.body?.toString('utf8') ?? ''),
      );
      if (lastStdio && lastStdio.name === a.name && lastStdio.contentType === a.contentType) {
        lastStdio.body = (lastStdio.body ?? '') + text;
        continue;
      }
      const merged: RunboardTestAttachment = {
        name: a.name,
        contentType: a.contentType,
        body: text,
      };
      out.push(merged);
      lastStdio = merged;
      continue;
    }
    lastStdio = undefined;

    if (a.path !== undefined) {
      const rewritten = copyFileAttachment(a.path, ctx);
      const item: RunboardTestAttachment = {
        name: a.name,
        contentType: a.contentType,
        path: rewritten ?? a.path,
      };
      if (typeof a.body === 'string') item.body = a.body;
      out.push(item);
      continue;
    }

    if (Buffer.isBuffer(a.body)) {
      if (isTextContentType(a.contentType)) {
        const charset = a.contentType.match(/charset=([^\s;]+)/i)?.[1];
        try {
          const text = a.body.toString((charset ?? 'utf8') as BufferEncoding);
          out.push({ name: a.name, contentType: a.contentType, body: text });
          continue;
        } catch {
          // fall through to binary write
        }
      }
      const written = writeBinaryAttachment(a.name, a.contentType, a.body, ctx);
      out.push({ name: a.name, contentType: a.contentType, path: written });
      continue;
    }

    const item: RunboardTestAttachment = { name: a.name, contentType: a.contentType };
    if (typeof a.body === 'string') item.body = a.body;
    out.push(item);
  }
  return out;
}

function copyFileAttachment(sourcePath: string, ctx: SerializeContext): string | undefined {
  let buffer: Buffer;
  try {
    buffer = readFileSync(sourcePath);
  } catch {
    return undefined;
  }
  const sha1 = sha1Hex(buffer) + extname(sourcePath);
  writeAttachmentFile(sha1, buffer, ctx);
  return ctx.attachmentsBaseURL + sha1;
}

function writeBinaryAttachment(
  name: string,
  contentType: string,
  buffer: Buffer,
  ctx: SerializeContext,
): string {
  const ext =
    sanitizeExtension(extname(name).replace(/^\./, '')) || mimeExtension(contentType) || 'dat';
  const sha1 = `${sha1Hex(buffer)}.${ext}`;
  writeAttachmentFile(sha1, buffer, ctx);
  return ctx.attachmentsBaseURL + sha1;
}

function writeAttachmentFile(fileName: string, buffer: Buffer, ctx: SerializeContext): void {
  const dataDir = join(ctx.outputFolder, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, fileName), buffer);
}

function sha1Hex(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex');
}

function isTextContentType(contentType: string): boolean {
  return contentType.startsWith('text/') || contentType.startsWith('application/json');
}

function sanitizeExtension(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '');
}

const MIME_EXTENSION_MAP: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/zip': 'zip',
  'application/json': 'json',
  'application/octet-stream': 'bin',
  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
};

function mimeExtension(contentType: string): string | undefined {
  const base = contentType.split(';')[0]?.trim().toLowerCase();
  if (!base) return undefined;
  return MIME_EXTENSION_MAP[base];
}

function relativeLocation(
  rootDir: string,
  location: { file: string; line: number; column: number },
): RunboardLocation {
  return {
    file: toPosixPath(relative(rootDir, location.file)),
    line: location.line,
    column: location.column,
  };
}

function toPosixPath(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/');
}

function stripAnsiEscapes(value: string): string {
  // Standard ANSI CSI/OSC escape sequences. Conservative pattern that matches
  // Playwright's strip behavior for stdout/stderr text/plain attachments.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences include control chars
  return value.replace(/\[[0-9;?]*[A-Za-z]/g, '');
}

function readSourceSnippet(file: string, line: number, column: number): string | undefined {
  return makeCodeFrame(file, line, column, { linesAbove: 2, linesBelow: 2 });
}

function makeCodeFrame(
  file: string,
  line: number,
  column: number,
  options: { linesAbove: number; linesBelow: number },
): string | undefined {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) return undefined;
  const startLine = Math.max(1, line - options.linesAbove);
  const endLine = Math.min(lines.length, line + options.linesBelow);
  const lineNumberWidth = String(endLine).length;
  const out: string[] = [];
  for (let ln = startLine; ln <= endLine; ln++) {
    const marker = ln === line ? '>' : ' ';
    const padded = String(ln).padStart(lineNumberWidth);
    out.push(`${marker} ${padded} | ${lines[ln - 1] ?? ''}`);
    if (ln === line) {
      const arrowColumn = Math.max(0, column - 1);
      out.push(`  ${' '.repeat(lineNumberWidth)} | ${' '.repeat(arrowColumn)}^`);
    }
  }
  return out.join('\n');
}
