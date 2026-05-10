import type { TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';
import type {
  RunboardTestAttachment,
  RunboardTestCase,
  RunboardTestCaseSummary,
  RunboardTestResult,
  RunboardTestResultDisplayError,
  RunboardTestResultSummary,
  RunboardTestStep,
} from './contract.js';

export interface SerializeContext {
  projectName: string;
  fileName: string;
  noSnippets?: boolean;
}

const SKIPPED_STEP_CATEGORY = 'test.step.skipped';

export function serializeTestCase(test: TestCase, ctx: SerializeContext): RunboardTestCase {
  const base = baseTestCase(test, ctx);
  return {
    ...base,
    results: test.results.map((result) => serializeResult(result, ctx)),
  };
}

export function summarizeTestCase(test: TestCase, ctx: SerializeContext): RunboardTestCaseSummary {
  const base = baseTestCase(test, ctx);
  return {
    ...base,
    results: test.results.map((result) => summarizeResult(result)),
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
    location: { ...test.location },
    annotations: test.annotations.map((a) => ({ ...a })),
    tags: [...test.tags],
    outcome: test.outcome(),
    duration,
    ok: test.ok(),
  };
  if (test.repeatEachIndex !== undefined) {
    summary.repeatEachIndex = test.repeatEachIndex;
  }
  return summary;
}

function serializeResult(result: TestResult, ctx: SerializeContext): RunboardTestResult {
  return {
    retry: result.retry,
    startTime: result.startTime.toISOString(),
    duration: result.duration,
    steps: result.steps.map((step) => serializeStep(step, result.attachments, ctx)),
    errors: result.errors.map(serializeDisplayError),
    attachments: result.attachments.map(serializeAttachment),
    status: result.status,
    annotations: (result.annotations ?? []).map((a) => ({ ...a })),
    workerIndex: result.workerIndex,
  };
}

function serializeStep(
  step: TestStep,
  resultAttachments: readonly TestResult['attachments'][number][],
  ctx: SerializeContext,
): RunboardTestStep {
  const out: RunboardTestStep = {
    title: step.title,
    startTime: step.startTime.toISOString(),
    duration: step.duration,
    steps: step.steps.map((child) => serializeStep(child, resultAttachments, ctx)),
    attachments: step.attachments
      .map((attachment) => resultAttachments.indexOf(attachment))
      .filter((index) => index !== -1),
    count: 1,
  };
  if (step.location !== undefined) out.location = { ...step.location };
  if (step.error !== undefined) {
    out.error = step.error.message ?? step.error.value ?? '';
    if (!ctx.noSnippets && step.error.snippet !== undefined) {
      out.snippet = step.error.snippet;
    }
  }
  if (step.category === SKIPPED_STEP_CATEGORY) out.skipped = true;
  return out;
}

function serializeAttachment(
  attachment: TestResult['attachments'][number],
): RunboardTestAttachment {
  const out: RunboardTestAttachment = {
    name: attachment.name,
    contentType: attachment.contentType,
  };
  if (attachment.path !== undefined) out.path = attachment.path;
  if (attachment.body !== undefined) out.body = attachment.body.toString('utf8');
  return out;
}

function serializeDisplayError(error: TestError): RunboardTestResultDisplayError {
  const message = error.message ?? error.value ?? '';
  const out: RunboardTestResultDisplayError = { message };
  if (error.snippet !== undefined) out.codeframe = error.snippet;
  return out;
}

function summarizeResult(result: TestResult): RunboardTestResultSummary {
  return {
    attachments: result.attachments.map((a) => {
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
