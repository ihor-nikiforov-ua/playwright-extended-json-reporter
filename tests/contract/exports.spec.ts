import { expect, test } from '@playwright/test';
import {
  RUNBOARD_SCHEMA_VERSION,
  type RunboardErrorEvidence,
  type RunboardLocation,
  type RunboardMachine,
  type RunboardMetadata,
  type RunboardReport,
  RunboardReporter,
  type RunboardReporterOptions,
  type RunboardReportOptions,
  type RunboardResultEvidence,
  type RunboardSourceExcerpt,
  type RunboardStats,
  type RunboardStatusDerivedErrorEvidence,
  type RunboardTestAnnotation,
  type RunboardTestAttachment,
  type RunboardTestCase,
  type RunboardTestCaseSummary,
  type RunboardTestErrorEvidence,
  type RunboardTestFile,
  type RunboardTestFileSummary,
  type RunboardTestResult,
  type RunboardTestResultSummary,
  type RunboardTestStep,
} from '../../src/index.js';

test('exposes RunboardReporter as a class and RUNBOARD_SCHEMA_VERSION as a semver string', () => {
  expect(typeof RunboardReporter).toBe('function');
  expect(RUNBOARD_SCHEMA_VERSION).toBe('1.1.0');
});

test('exposes the first Runboard Contract Types', () => {
  // Type-only: each binding is `import type`, so this block has no runtime work.
  // It exists so `tsc --noEmit` fails if the package stops re-exporting any contract type.
  const _options: RunboardReporterOptions = { outputFolder: 'x' };
  const _location: RunboardLocation = { file: 'a.spec.ts', line: 1, column: 1 };
  const _stats: RunboardStats = {
    total: 0,
    expected: 0,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
    ok: true,
  };
  const _metadata: RunboardMetadata = {
    schemaVersion: RUNBOARD_SCHEMA_VERSION,
    reporterVersion: '0.0.0',
    playwrightVersion: '1.59.0',
  };
  const _reportOptions: RunboardReportOptions = {};
  const _machine: RunboardMachine = { tag: [], startTime: 0, duration: 0 };
  const _annotation: RunboardTestAnnotation = { type: 'skip' };
  const _attachment: RunboardTestAttachment = { name: 'x', contentType: 'text/plain' };
  const _step: RunboardTestStep = {
    title: 's',
    startTime: '',
    duration: 0,
    steps: [],
    attachments: [],
    count: 1,
    skipped: false,
  };
  const _sourceExcerpt: RunboardSourceExcerpt = {
    file: 'a.spec.ts',
    startLine: 1,
    lines: ['x;'],
    highlightedLine: 1,
  };
  const _statusDerivedEvidence: RunboardStatusDerivedErrorEvidence = {
    source: 'status-derived',
    message: 'm',
    sourceExcerpt: _sourceExcerpt,
  };
  const _testErrorEvidence: RunboardTestErrorEvidence = {
    source: 'test-error',
    sourceExcerpt: _sourceExcerpt,
  };
  const _errorEvidence: RunboardErrorEvidence = _statusDerivedEvidence;
  // @ts-expect-error status-derived evidence requires `message`
  const _invalidStatusDerived: RunboardErrorEvidence = { source: 'status-derived' };
  void _testErrorEvidence;
  void _invalidStatusDerived;
  const _resultEvidence: RunboardResultEvidence = { evidence: [] };
  const _resultSummary: RunboardTestResultSummary = {
    attachments: [],
    startTime: '',
    workerIndex: 0,
  };
  const _result: RunboardTestResult = {
    retry: 0,
    startTime: '',
    duration: 0,
    steps: [],
    errors: [],
    attachments: [],
    status: 'passed',
    annotations: [],
    workerIndex: 0,
  };
  const _caseSummary: RunboardTestCaseSummary = {
    testId: 't',
    title: 'tc',
    path: [],
    projectName: 'p',
    location: _location,
    annotations: [],
    tags: [],
    outcome: 'expected',
    duration: 0,
    ok: true,
    results: [],
  };
  const _case: RunboardTestCase = { ..._caseSummary, results: [_result] };
  const _fileSummary: RunboardTestFileSummary = {
    fileId: 'f',
    fileName: 'a.spec.ts',
    tests: [],
    stats: _stats,
  };
  const _file: RunboardTestFile = { fileId: 'f', fileName: 'a.spec.ts', tests: [] };
  const _report: RunboardReport = {
    runboard: _metadata,
    metadata: {},
    startTime: 0,
    duration: 0,
    files: [],
    projectNames: [],
    stats: _stats,
    errors: [],
    options: _reportOptions,
    machines: [],
  };

  expect(_options.outputFolder).toBe('x');
  expect(_report.runboard.schemaVersion).toBe(RUNBOARD_SCHEMA_VERSION);
  // Reference the rest so unused-binding rules don't drop them.
  expect([
    _stats,
    _machine,
    _annotation,
    _attachment,
    _step,
    _sourceExcerpt,
    _errorEvidence,
    _resultEvidence,
    _resultSummary,
    _result,
    _caseSummary,
    _case,
    _fileSummary,
    _file,
  ]).toHaveLength(14);
});
