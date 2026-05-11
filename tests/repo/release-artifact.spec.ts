/**
 * Pre-NPM Release Flow and Release Artifact (issue #70).
 *
 * The Public Package Surface PRD makes Pre-NPM Releases the unit of release
 * delivery while npm publishing remains deferred. Each release ships as a
 * versioned GitHub Release with an `npm pack` tarball attached as the Release
 * Artifact so maintainers can inspect the package that would later be
 * published to npm.
 *
 * These specs assert the wiring: an `npm run release:artifact` command builds
 * the real tarball, a dedicated workflow drives that build from a `vX.Y.Z`
 * Release Tag and attaches the tarball to the GitHub Release, the release
 * gate still gates the artifact, and an explicit `prepublishOnly` guardrail
 * prevents `npm publish` from running until npm publishing is decided.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readTextFile(relativePath: string): Promise<string> {
  return readFile(resolve(repoRoot, relativePath), 'utf8');
}

async function readPackageJson(): Promise<{ scripts?: Record<string, string> }> {
  return JSON.parse(await readTextFile('package.json'));
}

/**
 * Strip YAML line comments so workflow assertions ignore explanatory text
 * such as "this workflow never invokes `npm publish`" while still catching
 * an actual `npm publish` invocation in a `run:` step.
 */
function stripYamlComments(yaml: string): string {
  return yaml
    .split('\n')
    .map((line) => {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '#' && (i === 0 || /\s/.test(line[i - 1] ?? ''))) break;
        out += line[i];
      }
      return out;
    })
    .join('\n');
}

const RELEASE_WORKFLOW_PATH = '.github/workflows/release-artifact.yml';
const RELEASE_PROCESS_DOC_PATH = 'docs/public/release-process.md';

test.describe('Pre-NPM Release Artifact script', () => {
  test('package.json defines a `release:artifact` script', async () => {
    const pkg = await readPackageJson();
    expect(
      pkg.scripts?.['release:artifact'],
      'package.json must define a `release:artifact` script that produces the Pre-NPM Release tarball',
    ).toBeTruthy();
  });

  test('`release:artifact` builds the package before packing so dist/ is fresh', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['release:artifact'] ?? '';
    expect(
      script,
      '`release:artifact` must run `npm run build` so the packed tarball contains the latest dist output',
    ).toContain('npm run build');
  });

  test('`release:artifact` runs `npm pack` to produce a real Release Artifact tarball', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['release:artifact'] ?? '';
    expect(
      script,
      '`release:artifact` must invoke `npm pack` so a `.tgz` file is written for upload as the Release Artifact',
    ).toMatch(/\bnpm pack\b/);
  });

  test('`release:artifact` does not pass --dry-run because it must produce a real tarball', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['release:artifact'] ?? '';
    expect(
      script,
      '`release:artifact` must not pass --dry-run; the canonical pack verification path is `pack:verify`',
    ).not.toContain('--dry-run');
  });

  test('`release:artifact` does not invoke `npm publish`', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['release:artifact'] ?? '';
    expect(
      script,
      '`release:artifact` must not invoke `npm publish`; npm publishing is intentionally deferred',
    ).not.toContain('npm publish');
  });
});

test.describe('Accidental npm publish guardrails', () => {
  test('package.json defines a `prepublishOnly` guard that aborts `npm publish`', async () => {
    const pkg = await readPackageJson();
    expect(
      pkg.scripts?.['prepublishOnly'],
      'package.json must define a `prepublishOnly` script that fails so `npm publish` cannot succeed while npm publishing is deferred',
    ).toBeTruthy();
  });

  test('`prepublishOnly` exits non-zero with a descriptive deferred-publishing message', async () => {
    const pkg = await readPackageJson();
    const script = pkg.scripts?.['prepublishOnly'] ?? '';
    expect(
      script,
      '`prepublishOnly` must run the documented forbid-npm-publish guard so the failure message is consistent across the package and workflows',
    ).toMatch(/scripts\/forbid-npm-publish\.mjs/);
  });

  test('the forbid-npm-publish guardrail script exists', async () => {
    const guard = await readTextFile('scripts/forbid-npm-publish.mjs');
    expect(
      guard,
      'forbid-npm-publish.mjs must explain that npm publishing is deferred pending account/package-name/provenance decisions',
    ).toMatch(/npm publish/i);
    expect(guard, 'forbid-npm-publish.mjs must exit non-zero so `npm publish` aborts').toMatch(
      /process\.exit\(1\)/,
    );
  });

  test('no workflow file invokes `npm publish`', async () => {
    const workflowsDir = '.github/workflows';
    const files = await readdir(resolve(repoRoot, workflowsDir));
    for (const file of files) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
      const content = stripYamlComments(await readTextFile(`${workflowsDir}/${file}`));
      expect(
        content,
        `${workflowsDir}/${file} must not invoke \`npm publish\` while npm publishing is deferred`,
      ).not.toMatch(/\bnpm publish\b/);
    }
  });
});

test.describe('Pre-NPM Release Artifact workflow', () => {
  test('a dedicated release-artifact workflow exists', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(yml, 'release-artifact workflow must declare jobs').toMatch(/^jobs:/m);
  });

  test('release-artifact workflow triggers on `vX.Y.Z` Release Tag push', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-artifact workflow must trigger on tag push so the Release Tag drives the authoritative artifact build',
    ).toMatch(/on:\s*[\s\S]*?push:\s*[\s\S]*?tags:/);
    expect(
      yml,
      'release-artifact workflow must filter to `v*.*.*` tags so only canonical Release Tags trigger it',
    ).toMatch(/v\*\.\*\.\*/);
  });

  test('release-artifact workflow installs Node from .nvmrc to match the canonical CI workflow', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-artifact workflow must drive Node from .nvmrc so the artifact build matches CI and the release gate',
    ).toContain('node-version-file: .nvmrc');
  });

  test('release-artifact workflow runs the release gate before producing the artifact', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-artifact workflow must run `npm run release-gate` so a Pre-NPM Release inherits the strict pre-release quality gate',
    ).toContain('npm run release-gate');
  });

  test('release-artifact workflow runs `npm run release:artifact` to build the tarball', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-artifact workflow must run `npm run release:artifact` so workflow and local artifact builds share the same script',
    ).toContain('npm run release:artifact');
  });

  test('release-artifact workflow creates a GitHub Release and attaches the packed tarball', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-artifact workflow must call `gh release create` so a GitHub Release is published for the Release Tag',
    ).toMatch(/gh release create/);
    expect(
      yml,
      'release-artifact workflow must reference `github.ref_name` so the GitHub Release is tied to the pushed Release Tag',
    ).toContain('github.ref_name');
    expect(
      yml,
      'release-artifact workflow must attach the `.tgz` Release Artifact to the GitHub Release',
    ).toMatch(/\*\.tgz/);
  });

  test('release-artifact workflow never invokes `npm publish`', async () => {
    const yml = stripYamlComments(await readTextFile(RELEASE_WORKFLOW_PATH));
    expect(
      yml,
      'release-artifact workflow must not invoke `npm publish`; this PRD scope explicitly defers npm publishing',
    ).not.toMatch(/\bnpm publish\b/);
  });

  test('release-artifact workflow grants the `contents: write` permission needed to create a GitHub Release', async () => {
    const yml = await readTextFile(RELEASE_WORKFLOW_PATH);
    expect(
      yml,
      'release-artifact workflow must request `contents: write` so `gh release create` can publish the Release Artifact',
    ).toMatch(/contents:\s*write/);
  });
});

test.describe('Release Process documentation', () => {
  test('release-process.md documents Release PR version bump and changelog update', async () => {
    const doc = await readTextFile(RELEASE_PROCESS_DOC_PATH);
    expect(
      doc,
      'release-process.md must describe the package.json `version` bump performed in a Release PR',
    ).toMatch(/`package\.json`[^\n]*version/);
    expect(
      doc,
      'release-process.md must describe renaming the `## [Unreleased]` changelog heading to a versioned release entry',
    ).toMatch(/`## \[Unreleased\]`[\s\S]*\[0\.Y\.Z\]/);
  });

  test('release-process.md documents the `vX.Y.Z` Release Tag flow', async () => {
    const doc = await readTextFile(RELEASE_PROCESS_DOC_PATH);
    expect(doc, 'release-process.md must describe the `vX.Y.Z` Release Tag').toMatch(/vX\.Y\.Z/);
    expect(
      doc,
      'release-process.md must show the `git push origin vX.Y.Z` command that drives the release workflow',
    ).toMatch(/git push origin v0?\.Y\.Z/);
  });

  test('release-process.md documents the GitHub Release with the attached `npm pack` Release Artifact', async () => {
    const doc = await readTextFile(RELEASE_PROCESS_DOC_PATH);
    expect(
      doc,
      'release-process.md must mention GitHub Releases as the Pre-NPM Release surface',
    ).toMatch(/GitHub Release/);
    expect(
      doc,
      'release-process.md must mention `npm pack` so consumers know the Release Artifact is the packed tarball',
    ).toContain('npm pack');
    expect(
      doc,
      'release-process.md must reference the dedicated release-artifact workflow so maintainers know which workflow produces the tarball',
    ).toContain('release-artifact.yml');
  });

  test('release-process.md explicitly defers npm publishing pending account/package-name/provenance decisions', async () => {
    const doc = await readTextFile(RELEASE_PROCESS_DOC_PATH);
    expect(
      doc,
      'release-process.md must use the canonical "npm publishing (deferred)" heading so README and PRD references resolve',
    ).toContain('## npm publishing (deferred)');
    for (const decision of [/npm account/i, /package[- ]name/i, /provenance/i]) {
      expect(
        doc,
        `release-process.md must call out the deferred decision matching ${decision}`,
      ).toMatch(decision);
    }
  });

  test('release-process.md describes the guardrails that prevent accidental npm publishing', async () => {
    const doc = await readTextFile(RELEASE_PROCESS_DOC_PATH);
    expect(
      doc,
      'release-process.md must document the `prepublishOnly` guard so maintainers know `npm publish` is blocked',
    ).toContain('prepublishOnly');
  });

  test('release-process.md keeps the strict pre-release release gate visible', async () => {
    const doc = await readTextFile(RELEASE_PROCESS_DOC_PATH);
    expect(
      doc,
      'release-process.md must continue to reference `npm run release-gate` so the strict pre-release quality gate stays discoverable',
    ).toContain('npm run release-gate');
  });
});
