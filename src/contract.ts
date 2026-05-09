export const RUNBOARD_SCHEMA_VERSION = '1.0.0';

export interface RunboardLocation {
  file: string;
  line: number;
  column: number;
}

export interface RunboardStats {
  total: number;
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  ok: boolean;
}

export interface RunboardMetadata {
  schemaVersion: string;
  reporterVersion: string;
  playwrightVersion: string;
}

export interface RunboardReportOptions {
  title?: string;
  noCopyPrompt?: boolean;
  noSnippets?: boolean;
}

export interface RunboardMachine {
  shardIndex?: number;
  tag: string[];
  startTime: number;
  duration: number;
}

export interface RunboardTestAnnotation {
  type: string;
  description?: string;
  location?: RunboardLocation;
}

export interface RunboardTestAttachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
}

export interface RunboardTestStep {
  title: string;
  startTime: string;
  duration: number;
  location?: RunboardLocation;
  snippet?: string;
  error?: string;
  steps: RunboardTestStep[];
  attachments: number[];
  count: number;
  skipped?: boolean;
}

export type RunboardErrorEvidenceSource = 'test-error' | 'status-derived';

export interface RunboardTestErrorEvidence {
  source: 'test-error';
  message?: string;
  stack?: string;
  value?: string;
  location?: RunboardLocation;
  snippet?: string;
  stepPath?: string[];
  stepCategory?: string;
  attachmentIndexes?: number[];
  cause?: RunboardErrorEvidence;
}

export interface RunboardStatusDerivedErrorEvidence {
  source: 'status-derived';
  message: string;
  stack?: string;
  value?: string;
  location?: RunboardLocation;
  snippet?: string;
  stepPath?: string[];
  stepCategory?: string;
  attachmentIndexes?: number[];
  cause?: RunboardErrorEvidence;
}

export type RunboardErrorEvidence = RunboardTestErrorEvidence | RunboardStatusDerivedErrorEvidence;

export interface RunboardResultEvidence {
  evidence: RunboardErrorEvidence[];
}

export interface RunboardTestResultDisplayError {
  message: string;
  codeframe?: string;
}

export type RunboardTestResultStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

export interface RunboardTestResult {
  retry: number;
  startTime: string;
  duration: number;
  steps: RunboardTestStep[];
  errors: RunboardTestResultDisplayError[];
  attachments: RunboardTestAttachment[];
  status: RunboardTestResultStatus;
  annotations: RunboardTestAnnotation[];
  workerIndex: number;
  runboard?: RunboardResultEvidence;
}

export interface RunboardTestResultSummary {
  attachments: { name: string; contentType: string; path?: string }[];
  startTime: string;
  workerIndex: number;
}

export type RunboardTestOutcome = 'skipped' | 'expected' | 'unexpected' | 'flaky';

export interface RunboardTestCaseSummary {
  testId: string;
  title: string;
  path: string[];
  projectName: string;
  location: RunboardLocation;
  annotations: RunboardTestAnnotation[];
  tags: string[];
  outcome: RunboardTestOutcome;
  duration: number;
  ok: boolean;
  results: RunboardTestResultSummary[];
  repeatEachIndex?: number;
}

export interface RunboardTestCase extends Omit<RunboardTestCaseSummary, 'results'> {
  results: RunboardTestResult[];
}

export interface RunboardTestFileSummary {
  fileId: string;
  fileName: string;
  tests: RunboardTestCaseSummary[];
  stats: RunboardStats;
}

export interface RunboardTestFile {
  fileId: string;
  fileName: string;
  tests: RunboardTestCase[];
}

export interface RunboardReport {
  runboard: RunboardMetadata;
  metadata: Record<string, unknown>;
  startTime: number;
  duration: number;
  files: RunboardTestFileSummary[];
  projectNames: string[];
  stats: RunboardStats;
  errors: string[];
  options: RunboardReportOptions;
  machines: RunboardMachine[];
}
