/**
 * Support Matrix Policy drift checks.
 *
 * `docs/public/support-matrix.md` is the canonical public commitment for
 * Node, Playwright, and TypeScript declaration compatibility. The TypeScript
 * declaration compatibility section is already gated by
 * `tests/repo/declaration-compatibility.spec.ts`. These tests cover the Node
 * and Playwright sides by asserting that the markdown does not drift from
 * the canonical `package.json` `engines.node`, `.nvmrc`, and
 * `peerDependencies['@playwright/test']` constants.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const supportMatrixPath = resolve(repoRoot, 'docs/public/support-matrix.md');
const readmePath = resolve(repoRoot, 'README.md');

interface CanonicalSupport {
  enginesNode: string;
  nvmrcMajor: string;
  playwrightPeer: string;
}

async function readCanonicalSupport(): Promise<CanonicalSupport> {
  const pkg = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8')) as {
    engines?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const enginesNode = pkg.engines?.['node'];
  expect(enginesNode, 'package.json engines.node must be set').toBeDefined();
  const playwrightPeer = pkg.peerDependencies?.['@playwright/test'];
  expect(
    playwrightPeer,
    'package.json peerDependencies must declare @playwright/test',
  ).toBeDefined();
  const nvmrcMajor = (await readFile(resolve(repoRoot, '.nvmrc'), 'utf8')).trim().split('.')[0];
  expect(nvmrcMajor, '.nvmrc must pin a concrete Node version').toMatch(/^\d+$/);
  return {
    enginesNode: enginesNode as string,
    nvmrcMajor: nvmrcMajor as string,
    playwrightPeer: playwrightPeer as string,
  };
}

function extractH2Section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  expect(start, `markdown must contain the "${heading}" section`).toBeGreaterThan(-1);
  const tail = markdown.slice(start + heading.length);
  const nextH2 = tail.search(/\n## /);
  return nextH2 === -1 ? tail : tail.slice(0, nextH2);
}

test.describe('Support Matrix Policy — public docs drift', () => {
  test('support-matrix.md Node section cites package.json engines.node and pins to .nvmrc', async () => {
    const support = await readCanonicalSupport();
    const md = await readFile(supportMatrixPath, 'utf8');
    const nodeSection = extractH2Section(md, '## Node');
    expect(
      nodeSection,
      `support-matrix.md Node section must cite the canonical engines.node value '${support.enginesNode}'`,
    ).toContain(`\`${support.enginesNode}\``);
    expect(
      nodeSection,
      'support-matrix.md Node section must reference `.nvmrc` so consumers know where the concrete Node major is pinned',
    ).toMatch(/`\.nvmrc`/);
  });

  test('support-matrix.md Playwright section cites the canonical peerDependencies range', async () => {
    const support = await readCanonicalSupport();
    const md = await readFile(supportMatrixPath, 'utf8');
    const playwrightSection = extractH2Section(md, '## Playwright');
    expect(
      playwrightSection,
      `support-matrix.md Playwright section must cite the canonical peerDependencies range '${support.playwrightPeer}'`,
    ).toContain(support.playwrightPeer);
    expect(
      playwrightSection,
      'support-matrix.md Playwright section must name the canonical peerDependencies entry so consumers know which package field anchors the support promise',
    ).toMatch(/peerDependencies/i);
  });

  test('README maintenance badges agree with the canonical support ranges', async () => {
    const support = await readCanonicalSupport();
    const readme = await readFile(readmePath, 'utf8');
    const expectedNodeBadge = encodeURIComponent(support.enginesNode);
    expect(
      readme,
      `README Node maintenance badge must encode the canonical engines.node value '${support.enginesNode}' so badge claims cannot drift from package.json`,
    ).toContain(expectedNodeBadge);
    const expectedPlaywrightBadge = encodeURIComponent(support.playwrightPeer);
    expect(
      readme,
      `README Playwright maintenance badge must encode the canonical peerDependencies range '${support.playwrightPeer}' so badge claims cannot drift from package.json`,
    ).toContain(expectedPlaywrightBadge);
  });

  test('support-matrix.md describes the Support Matrix Policy without claiming exhaustive historical compatibility testing', async () => {
    const md = await readFile(supportMatrixPath, 'utf8');
    expect(
      md,
      'support-matrix.md must reference the Support Matrix Policy by name so the policy intent is discoverable',
    ).toMatch(/Support Matrix Policy/);
    expect(
      md,
      'support-matrix.md must call out that historical minors are not exhaustively tested so the policy intent is unambiguous',
    ).toMatch(/(?:not\s+exhaustively\s+tested|exhaustive\s+historical\s+matrix)/i);
  });
});
