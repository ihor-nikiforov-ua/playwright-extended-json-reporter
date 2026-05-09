import type {
  FullConfig,
  FullProject,
  FullResult,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

export interface FakeFileSpec {
  fileName: string;
  tests: FakeTestSpec[];
}

export interface FakeTestSpec {
  title: string;
  status?: TestResult['status'];
  expectedStatus?: TestCase['expectedStatus'];
  outcome?: ReturnType<TestCase['outcome']>;
}

export interface FakeRunSpec {
  rootDir: string;
  playwrightVersion?: string;
  projectName?: string;
  files?: FakeFileSpec[];
}

export interface FakeRun {
  config: FullConfig;
  rootSuite: Suite;
  testResults: Array<{ test: TestCase; result: TestResult }>;
}

export function fakeRun(spec: FakeRunSpec): FakeRun {
  const projectName = spec.projectName ?? 'chromium';
  const project = { name: projectName } as unknown as FullProject;
  const config = {
    rootDir: spec.rootDir,
    version: spec.playwrightVersion ?? '1.59.0',
  } as unknown as FullConfig;

  const rootSuite = createSuite('', 'root', undefined);
  const projectSuite = createSuite(projectName, 'project', rootSuite, project);
  rootSuite.suites.push(projectSuite);

  const testResults: Array<{ test: TestCase; result: TestResult }> = [];

  for (const file of spec.files ?? []) {
    const fileSuite = createSuite(file.fileName, 'file', projectSuite, project, {
      file: file.fileName,
      line: 1,
      column: 1,
    });
    projectSuite.suites.push(fileSuite);

    for (const [index, testSpec] of file.tests.entries()) {
      const test = createTestCase(testSpec, fileSuite, file.fileName, index);
      fileSuite.tests.push(test);
      testResults.push({ test, result: test.results[0] });
    }
  }

  return { config, rootSuite, testResults };
}

export function fakeFullResult(overrides: Partial<FullResult> = {}): FullResult {
  return {
    status: 'passed',
    startTime: new Date(0),
    duration: 0,
    ...overrides,
  };
}

interface MutableSuite extends Suite {
  suites: Suite[];
  tests: TestCase[];
}

function createSuite(
  title: string,
  type: Suite['type'],
  parent: Suite | undefined,
  project?: FullProject,
  location?: { file: string; line: number; column: number },
): MutableSuite {
  const suite: MutableSuite = {
    title,
    type,
    suites: [],
    tests: [],
    ...(parent !== undefined ? { parent } : {}),
    ...(location !== undefined ? { location } : {}),
    allTests: () => collectTests(suite),
    entries: () => [...suite.suites, ...suite.tests],
    project: () => project,
    titlePath: () => (parent ? [...parent.titlePath(), title] : [title]),
  };
  return suite;
}

function collectTests(suite: Suite): TestCase[] {
  const out: TestCase[] = [...suite.tests];
  for (const child of suite.suites) {
    out.push(...collectTests(child));
  }
  return out;
}

function createTestCase(
  spec: FakeTestSpec,
  parent: Suite,
  fileName: string,
  index: number,
): TestCase {
  const status: TestResult['status'] = spec.status ?? 'passed';
  const expectedStatus = spec.expectedStatus ?? 'passed';
  const outcome = spec.outcome ?? (status === expectedStatus ? 'expected' : 'unexpected');
  const result: TestResult = {
    annotations: [],
    attachments: [],
    duration: 1,
    errors: [],
    parallelIndex: 0,
    retry: 0,
    startTime: new Date(0),
    status,
    stderr: [],
    stdout: [],
    steps: [],
    workerIndex: 0,
  };

  const test: TestCase = {
    annotations: [],
    expectedStatus,
    id: `${fileName}#${index}`,
    location: { file: fileName, line: 1, column: 1 },
    parent,
    repeatEachIndex: 0,
    results: [result],
    retries: 0,
    tags: [],
    timeout: 30_000,
    title: spec.title,
    type: 'test',
    ok: () => outcome === 'expected' || outcome === 'flaky',
    outcome: () => outcome,
    titlePath: () => [...parent.titlePath(), spec.title],
  };

  return test;
}
