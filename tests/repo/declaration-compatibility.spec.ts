/**
 * Consumer-style TypeScript Declaration Compatibility gate.
 *
 * The Runboard Reporter Package publishes generated `.d.ts` declarations
 * under `dist/`, not TypeScript source. The Public Package Surface PRD
 * requires a Support Matrix Policy that proves the published declarations
 * are consumable under specific TypeScript compiler version(s) rather than
 * claiming an untested historical compiler range.
 *
 * This spec packs the built package into a fresh consumer project, installs
 * a documented TypeScript compiler version, writes a small consumer that
 * imports every public export, and runs `tsc --noEmit` against the public
 * entrypoint. If the public `.d.ts` surface stops compiling under the
 * documented compiler version, this gate fails.
 *
 * Pair this spec with `docs/public/support-matrix.md`: the markdown is the
 * public commitment, and the assertions here keep that commitment in sync
 * with the actual gate.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const supportMatrixPath = resolve(repoRoot, 'docs/public/support-matrix.md');

/**
 * TypeScript compiler version(s) currently covered by the declaration
 * compatibility gate. Update this list and `docs/public/support-matrix.md`
 * together; the docs consistency tests below enforce that they agree.
 */
const DOCUMENTED_TYPESCRIPT_VERSIONS = ['6.0.3'] as const;

/**
 * Consumer-fixture peer dependency pins. The gate installs these exact
 * versions into the throwaway consumer project so that a new
 * `@playwright/test` or `@types/node` release cannot silently change which
 * Reporter or Node typings the gate exercises. Update these constants and
 * the matching block in `docs/public/support-matrix.md` together; the docs
 * consistency tests below enforce that they agree.
 */
const DOCUMENTED_FIXTURE_DEPENDENCIES = {
  '@playwright/test': '1.59.1',
  '@types/node': '24.12.3',
} as const;

const CONSUMER_SOURCE = `
import RunboardReporter, {
  RunboardReporter as NamedRunboardReporter,
  RUNBOARD_SCHEMA_VERSION,
  type RunboardErrorEvidence,
  type RunboardErrorEvidenceSource,
  type RunboardLocation,
  type RunboardMachine,
  type RunboardMetadata,
  type RunboardReport,
  type RunboardReportOptions,
  type RunboardReporterOptions,
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
  type RunboardTestOutcome,
  type RunboardTestResult,
  type RunboardTestResultDisplayError,
  type RunboardTestResultStatus,
  type RunboardTestResultSummary,
  type RunboardTestStep,
} from 'playwright-runboard-reporter';

// Exercise the value exports so unused-import diagnostics catch a regression.
const options: RunboardReporterOptions = { outputFolder: 'out', noSnippets: true };
const defaultReporter = new RunboardReporter(options);
const namedReporter = new NamedRunboardReporter();
const schemaVersion: '1.1.0' = RUNBOARD_SCHEMA_VERSION;

// Exercise the type exports so a missing/renamed type breaks compilation.
type ContractAliases = [
  RunboardErrorEvidence,
  RunboardErrorEvidenceSource,
  RunboardLocation,
  RunboardMachine,
  RunboardMetadata,
  RunboardReport,
  RunboardReportOptions,
  RunboardResultEvidence,
  RunboardSourceExcerpt,
  RunboardStats,
  RunboardStatusDerivedErrorEvidence,
  RunboardTestAnnotation,
  RunboardTestAttachment,
  RunboardTestCase,
  RunboardTestCaseSummary,
  RunboardTestErrorEvidence,
  RunboardTestFile,
  RunboardTestFileSummary,
  RunboardTestOutcome,
  RunboardTestResult,
  RunboardTestResultDisplayError,
  RunboardTestResultStatus,
  RunboardTestResultSummary,
  RunboardTestStep,
];

export const _surface = {
  defaultReporter,
  namedReporter,
  schemaVersion,
  // Reference the alias once so the unused-locals rule does not strip it.
  aliases: null as unknown as ContractAliases | null,
};
`;

// The consumer tsconfig mirrors what a real Playwright consumer ships:
// NodeNext module resolution (so the package's ESM `exports` map resolves
// the same way npm consumers would see it) and `DOM` + `DOM.Iterable` in
// `lib` because Playwright's reporter type chain references browser
// globals like `HTMLElement` and `SVGElement`. ADR 0011 documents this
// inside the repo; consumers face the same need.
const CONSUMER_TSCONFIG = {
  compilerOptions: {
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    target: 'ES2024',
    lib: ['ES2024', 'DOM', 'DOM.Iterable'],
    types: ['node'],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
  },
  include: ['consumer.ts'],
};

async function buildAndPackTarball(destination: string): Promise<string> {
  await execFileAsync('npm', ['run', 'build'], { cwd: repoRoot });
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--silent', '--pack-destination', destination],
    { cwd: repoRoot },
  );
  const lines = stdout.trim().split('\n');
  const tarballName = lines[lines.length - 1] ?? '';
  return resolve(destination, tarballName);
}

interface CompatibilityRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runDeclarationCompatibility(
  tarball: string,
  typescriptVersion: string,
): Promise<CompatibilityRunResult> {
  const consumerDir = await mkdtemp(join(tmpdir(), 'runboard-dts-consumer-'));
  try {
    await writeFile(
      join(consumerDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'runboard-dts-consumer',
          version: '0.0.0',
          private: true,
          type: 'module',
          dependencies: {
            'playwright-runboard-reporter': `file:${tarball}`,
          },
          devDependencies: {
            ...DOCUMENTED_FIXTURE_DEPENDENCIES,
            typescript: typescriptVersion,
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(consumerDir, 'tsconfig.json'),
      `${JSON.stringify(CONSUMER_TSCONFIG, null, 2)}\n`,
    );
    await writeFile(join(consumerDir, 'consumer.ts'), CONSUMER_SOURCE);
    await execFileAsync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--no-package-lock'],
      { cwd: consumerDir },
    );
    try {
      const { stdout, stderr } = await execFileAsync('npx', ['--no-install', 'tsc', '--noEmit'], {
        cwd: consumerDir,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? '',
        exitCode: typeof e.code === 'number' ? e.code : 1,
      };
    }
  } finally {
    await rm(consumerDir, { recursive: true, force: true });
  }
}

/**
 * Slice the TypeScript declaration compatibility section out of the
 * support matrix markdown. Returns the section body up to the next H2
 * heading or end-of-file. Throws via expect() if the section is missing.
 */
function extractTypeScriptSection(md: string): string {
  const tsHeader = '## TypeScript declaration compatibility';
  const startIdx = md.indexOf(tsHeader);
  expect(startIdx, 'support-matrix.md must contain the TypeScript section').toBeGreaterThan(-1);
  const after = md.slice(startIdx + tsHeader.length);
  const nextH2 = after.search(/\n## /);
  return nextH2 === -1 ? after : after.slice(0, nextH2);
}

/**
 * Pull the indented sub-bullet block that follows a labeled top-level
 * bullet (e.g. "- Tested compiler versions:"). Returns the text of the
 * sub-bullet block so callers can parse individual lines from it.
 */
function extractSubBullets(section: string, labelPattern: RegExp): string {
  const labelMatch = section.match(labelPattern);
  expect(
    labelMatch,
    `TypeScript section must include a bullet matching ${labelPattern.source}`,
  ).not.toBeNull();
  const startIdx = (labelMatch?.index ?? 0) + (labelMatch?.[0].length ?? 0);
  const tail = section.slice(startIdx);
  const subListMatch = tail.match(/^((?:[ \t]{2,}-[^\n]*(?:\n|$))+)/m);
  expect(
    subListMatch,
    `bullet matching ${labelPattern.source} must be followed by an indented sub-list`,
  ).not.toBeNull();
  return subListMatch?.[1] ?? '';
}

test.describe('Declaration compatibility — public docs commitment', () => {
  test('support-matrix.md documents the consumer-style declaration compatibility gate', async () => {
    const md = await readFile(supportMatrixPath, 'utf8');
    expect(
      md,
      'support-matrix.md must describe a consumer-style declaration compatibility gate (no more "planned" wording)',
    ).not.toMatch(/\bplanned\b/i);
    expect(
      md,
      'support-matrix.md must point at the in-repo gate spec so consumers can audit which TS versions are tested',
    ).toContain('tests/repo/declaration-compatibility.spec.ts');
  });

  test('support-matrix.md tested-compiler list exactly equals the gate matrix', async () => {
    const md = await readFile(supportMatrixPath, 'utf8');
    const section = extractTypeScriptSection(md);
    const subList = extractSubBullets(section, /^- Tested compiler versions:[ \t]*$/m);
    const documentedVersions = Array.from(
      subList.matchAll(/^[ \t]{2,}- TypeScript `([^`]+)`[ \t]*$/gm),
      (m) => m[1],
    );
    expect(
      documentedVersions,
      'support-matrix.md tested-compiler list must exactly match DOCUMENTED_TYPESCRIPT_VERSIONS — extra or missing versions break the public commitment',
    ).toEqual([...DOCUMENTED_TYPESCRIPT_VERSIONS]);
  });

  test('support-matrix.md fixture pins exactly equal the consumer fixture pins', async () => {
    const md = await readFile(supportMatrixPath, 'utf8');
    const section = extractTypeScriptSection(md);
    const subList = extractSubBullets(
      section,
      /^- Pinned consumer fixture dependencies[^\n]*:[ \t]*$/m,
    );
    const documentedPins = Object.fromEntries(
      Array.from(
        subList.matchAll(/^[ \t]{2,}- `([^`]+)` `([^`]+)`[ \t]*$/gm),
        (m) => [m[1], m[2]] as const,
      ),
    );
    expect(
      documentedPins,
      'support-matrix.md fixture pins must exactly match DOCUMENTED_FIXTURE_DEPENDENCIES — extra or missing pins break the public commitment',
    ).toEqual({ ...DOCUMENTED_FIXTURE_DEPENDENCIES });
  });

  test('support-matrix.md still declines a minimum TypeScript version until a documented range is gated', async () => {
    const md = await readFile(supportMatrixPath, 'utf8');
    // The PRD: "Do not document a minimum TypeScript compiler version until a
    // declaration-compatibility gate proves it." The gate covers exactly the
    // versions in DOCUMENTED_TYPESCRIPT_VERSIONS, which is a list of specific
    // points, not a range. The docs must remain explicit about that posture.
    expect(
      md,
      'support-matrix.md must explicitly decline to pin a minimum TypeScript compiler version until the gate covers a range',
    ).toMatch(/no minimum supported TypeScript compiler version/i);
  });

  test('support-matrix.md states the gate is wired into the canonical verify gate', async () => {
    const md = await readFile(supportMatrixPath, 'utf8');
    expect(
      md,
      'support-matrix.md must say the declaration compatibility gate runs as part of `npm run verify`',
    ).toMatch(/npm run verify/);
  });
});

test.describe('Declaration compatibility — consumer-style gate', () => {
  for (const typescriptVersion of DOCUMENTED_TYPESCRIPT_VERSIONS) {
    test(`packed tarball compiles under TypeScript ${typescriptVersion}`, async () => {
      test.setTimeout(240_000);
      const stagingDir = await mkdtemp(join(tmpdir(), 'runboard-dts-stage-'));
      try {
        const tarball = await buildAndPackTarball(stagingDir);
        const result = await runDeclarationCompatibility(tarball, typescriptVersion);
        expect(
          result.exitCode,
          `tsc must exit cleanly when compiling the public entrypoint under TypeScript ${typescriptVersion}; stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        ).toBe(0);
      } finally {
        await rm(stagingDir, { recursive: true, force: true });
      }
    });
  }
});
