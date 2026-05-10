import type {
  FullConfig,
  FullProject,
  FullResult,
  Location,
  Suite,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

export interface FakeAttachmentSpec {
  name: string;
  contentType: string;
  path?: string;
  body?: Buffer;
}

export interface FakeStepSpec {
  title: string;
  startTime?: Date;
  duration?: number;
  category?: string;
  location?: Location;
  error?: TestError;
  attachments?: FakeAttachmentSpec[];
  steps?: FakeStepSpec[];
  annotations?: Array<{ type: string; description?: string }>;
}

export interface FakeTestResultSpec {
  retry?: number;
  status?: TestResult['status'];
  startTime?: Date;
  duration?: number;
  workerIndex?: number;
  parallelIndex?: number;
  errors?: TestError[];
  attachments?: FakeAttachmentSpec[];
  steps?: FakeStepSpec[];
  annotations?: Array<{ type: string; description?: string }>;
  stdout?: Array<string | Buffer>;
  stderr?: Array<string | Buffer>;
}

export interface FakeTestSpec {
  title: string;
  status?: TestResult['status'];
  expectedStatus?: TestCase['expectedStatus'];
  outcome?: ReturnType<TestCase['outcome']>;
  annotations?: Array<{ type: string; description?: string; location?: Location }>;
  tags?: string[];
  repeatEachIndex?: number;
  retries?: number;
  results?: FakeTestResultSpec[];
  describes?: string[];
  location?: Location;
  id?: string;
}

export interface FakeFileSpec {
  fileName: string;
  tests: FakeTestSpec[];
}

export interface FakeProjectSpec {
  name?: string;
  testDir?: string;
  outputDir?: string;
}

export interface FakeRunSpec {
  rootDir: string;
  playwrightVersion?: string;
  projectName?: string;
  configFile?: string;
  projects?: FakeProjectSpec[];
  files?: FakeFileSpec[];
}

export interface FakeRun {
  config: FullConfig;
  rootSuite: Suite;
  testResults: Array<{ test: TestCase; result: TestResult }>;
}

export function fakeRun(spec: FakeRunSpec): FakeRun {
  const projectSpecs: FakeProjectSpec[] =
    spec.projects ?? (spec.projectName !== undefined ? [{ name: spec.projectName }] : [{}]);

  const fullProjects: FullProject[] = projectSpecs.map(
    (p) =>
      ({
        name: p.name ?? 'chromium',
        testDir: p.testDir ?? spec.rootDir,
        outputDir: p.outputDir ?? `${spec.rootDir}/test-results`,
      }) as unknown as FullProject,
  );

  const config = {
    rootDir: spec.rootDir,
    version: spec.playwrightVersion ?? '1.59.0',
    projects: fullProjects,
    ...(spec.configFile !== undefined ? { configFile: spec.configFile } : {}),
  } as unknown as FullConfig;

  const rootSuite = createSuite('', 'root', undefined);
  const projectSuites = fullProjects.map((project) =>
    createSuite(project.name, 'project', rootSuite, project),
  );
  for (const projectSuite of projectSuites) {
    rootSuite.suites.push(projectSuite);
  }

  const testResults: Array<{ test: TestCase; result: TestResult }> = [];

  const [primaryProjectSuite] = projectSuites;
  const [primaryProject] = fullProjects;
  if (primaryProjectSuite && primaryProject) {
    for (const file of spec.files ?? []) {
      const fileSuite = createSuite(file.fileName, 'file', primaryProjectSuite, primaryProject, {
        file: file.fileName,
        line: 1,
        column: 1,
      });
      primaryProjectSuite.suites.push(fileSuite);

      for (const [index, testSpec] of file.tests.entries()) {
        const leafSuite = appendDescribeSuites(fileSuite, testSpec.describes ?? [], primaryProject);
        const test = createTestCase(testSpec, leafSuite, file.fileName, index);
        leafSuite.tests.push(test);
        for (const result of test.results) {
          testResults.push({ test, result });
        }
      }
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

function appendDescribeSuites(
  fileSuite: MutableSuite,
  describeTitles: readonly string[],
  project: FullProject,
): MutableSuite {
  let parent = fileSuite;
  for (const title of describeTitles) {
    const describeSuite = createSuite(title, 'describe', parent, project, fileSuite.location);
    parent.suites.push(describeSuite);
    parent = describeSuite;
  }
  return parent;
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
  const outcome = spec.outcome ?? deriveOutcome(spec, status, expectedStatus);

  const resultSpecs = spec.results ?? [{ status }];
  const results: TestResult[] = resultSpecs.map((rs, retry) => createResult(rs, retry));

  const test: TestCase = {
    annotations: (spec.annotations ?? []).map((a) => ({ ...a })),
    expectedStatus,
    id: spec.id ?? `${fileName}#${index}`,
    location: spec.location ?? { file: fileName, line: 1, column: 1 },
    parent,
    repeatEachIndex: spec.repeatEachIndex ?? 0,
    results,
    retries: spec.retries ?? Math.max(results.length - 1, 0),
    tags: spec.tags ?? [],
    timeout: 30_000,
    title: spec.title,
    type: 'test',
    ok: () => outcome === 'expected' || outcome === 'flaky' || outcome === 'skipped',
    outcome: () => outcome,
    titlePath: () => [...parent.titlePath(), spec.title],
  };

  return test;
}

function deriveOutcome(
  spec: FakeTestSpec,
  status: TestResult['status'],
  expectedStatus: TestCase['expectedStatus'],
): ReturnType<TestCase['outcome']> {
  if (spec.results && spec.results.length > 1) {
    const final = spec.results[spec.results.length - 1]?.status ?? status;
    if (final === expectedStatus) return 'flaky';
    return 'unexpected';
  }
  if (status === 'skipped' && expectedStatus === 'skipped') return 'skipped';
  return status === expectedStatus ? 'expected' : 'unexpected';
}

function createResult(spec: FakeTestResultSpec, retry: number): TestResult {
  return {
    annotations: (spec.annotations ?? []).map((a) => ({ ...a })),
    attachments: (spec.attachments ?? []) as TestResult['attachments'],
    duration: spec.duration ?? 1,
    errors: spec.errors ?? [],
    parallelIndex: spec.parallelIndex ?? 0,
    retry: spec.retry ?? retry,
    startTime: spec.startTime ?? new Date(0),
    status: spec.status ?? 'passed',
    stderr: spec.stderr ?? [],
    stdout: spec.stdout ?? [],
    steps: (spec.steps ?? []).map((s) => createStep(s)),
    workerIndex: spec.workerIndex ?? 0,
  };
}

function createStep(spec: FakeStepSpec): TestStep {
  return {
    title: spec.title,
    startTime: spec.startTime ?? new Date(0),
    duration: spec.duration ?? 0,
    category: spec.category ?? 'test.step',
    steps: (spec.steps ?? []).map((s) => createStep(s)),
    attachments: spec.attachments ?? [],
    annotations: (spec.annotations ?? []).map((a) => ({ ...a })),
    titlePath: () => [spec.title],
    ...(spec.location !== undefined ? { location: spec.location } : {}),
    ...(spec.error !== undefined ? { error: spec.error } : {}),
  } as unknown as TestStep;
}
