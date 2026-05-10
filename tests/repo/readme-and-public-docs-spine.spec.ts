import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readReadme(): Promise<string> {
  return readFile(resolve(repoRoot, 'README.md'), 'utf8');
}

test.describe('README landing page content', () => {
  test('names the package and its primary audience of Playwright users and AI agents', async () => {
    const readme = await readReadme();
    expect(readme).toContain('playwright-runboard-reporter');
    expect(readme, 'README should name Playwright users as a primary audience').toMatch(
      /Playwright user/i,
    );
    expect(readme, 'README should name AI agents as a primary audience').toMatch(/AI[- ]?agent/i);
  });

  test('describes output as a Playwright HTML Report Data bundle without rendered HTML', async () => {
    const readme = (await readReadme()).toLowerCase();
    expect(readme).toContain('playwright html report data bundle');
    expect(readme).toContain('without rendered html');
  });

  test('includes install and reporter config examples', async () => {
    const readme = await readReadme();
    expect(readme, 'README should show an npm install command').toMatch(
      /npm install [^\n]*playwright-runboard-reporter/,
    );
    expect(readme, 'README should reference playwright.config').toContain('playwright.config');
    expect(readme, 'README should show how to wire the reporter into Playwright config').toMatch(
      /reporter:\s*\[/,
    );
    expect(
      readme,
      'README should show how to import or reference playwright-runboard-reporter from config',
    ).toMatch(/['"]playwright-runboard-reporter['"]/);
  });

  test('shows the default Runboard Data Bundle output overview', async () => {
    const readme = await readReadme();
    expect(readme).toContain('playwright-runboard-report');
    expect(readme).toContain('report.json');
    expect(readme).toContain('<fileId>.json');
    expect(readme).toContain('data/');
  });

  test('compares this reporter to the Playwright html, json, and blob reporters', async () => {
    const readme = await readReadme();
    for (const name of ['`html`', '`json`', '`blob`']) {
      expect(readme, `README must reference Playwright's ${name} reporter in a comparison`).toMatch(
        new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    }
    expect(readme.toLowerCase(), 'README must have a comparison section heading').toMatch(
      /compar(?:e|ison)/,
    );
  });

  test('declares explicit Not Included boundaries for the surfaces this package does not own', async () => {
    const readme = (await readReadme()).toLowerCase();
    expect(readme).toContain('not included');
    const boundaries = [
      'rendered html',
      'serving',
      'opening',
      'previous run',
      'runboard ui',
      'error classification',
    ];
    for (const phrase of boundaries) {
      expect(readme, `README Not Included boundaries must mention "${phrase}"`).toContain(phrase);
    }
  });

  test('includes meaningful maintenance badges for CI, license, Node, and Playwright', async () => {
    const readme = await readReadme();
    const badges = [
      { name: 'CI', pattern: /!\[(?:CI|Build|Workflow)/i },
      { name: 'License', pattern: /!\[License/i },
      { name: 'Node', pattern: /!\[Node/i },
      { name: 'Playwright', pattern: /!\[Playwright/i },
    ];
    for (const badge of badges) {
      expect(readme, `README must include a ${badge.name} maintenance badge`).toMatch(
        badge.pattern,
      );
    }
  });

  test('links to public docs under docs/public/ and to repository governance docs', async () => {
    const readme = await readReadme();
    expect(readme, 'README must link to public docs under docs/public/').toMatch(
      /\]\(\.?\/?docs\/public\//,
    );
    for (const governanceDoc of ['CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'LICENSE']) {
      expect(readme, `README must link to repository governance file ${governanceDoc}`).toMatch(
        new RegExp(`\\]\\(\\.?/?${governanceDoc}\\)`),
      );
    }
  });

  test('documents the current Pre-NPM install path and marks npm install as deferred', async () => {
    const readme = await readReadme();
    expect(
      readme,
      'README must point at the GitHub Release artifact while npm publishing is deferred',
    ).toMatch(/GitHub Release/);
    expect(
      readme,
      'README must reference the Release Process page for the Pre-NPM install path',
    ).toMatch(/\]\(\.?\/?docs\/public\/release-process\.md\)/);
    expect(readme, 'README must mark npm install as deferred until npm publishing exists').toMatch(
      /npm install[^\n]*\b(?:deferred|future|after npm publishing|not yet)\b/i,
    );
  });
});

const SPINE_FILES = [
  {
    path: 'docs/public/README.md',
    requiredHeadings: ['# ', '## Public docs index'],
  },
  {
    path: 'docs/public/api.md',
    requiredHeadings: ['# API Reference', '## Exports', '## Reporter options'],
  },
  {
    path: 'docs/public/data-contract.md',
    requiredHeadings: [
      '# Data Contract',
      '## Output layout',
      '## Report Summary',
      '## Test File Entry',
      '## Attachment assets',
      '## Runboard extensions',
      '## Schema versioning',
      '## Migration notes',
      '## Contract Stability Matrix',
    ],
  },
  {
    path: 'docs/public/options.md',
    requiredHeadings: [
      '# Options and Environment Variables',
      '## Reporter options',
      '## Environment variables',
      '## No-op compatibility options',
    ],
  },
  {
    path: 'docs/public/playwright-parity.md',
    requiredHeadings: [
      '# Playwright Parity',
      '## What matches Playwright HTML Report Data',
      '## What is intentionally out of scope',
      '## Display Error parity',
    ],
  },
  {
    path: 'docs/public/support-matrix.md',
    requiredHeadings: [
      '# Support Matrix',
      '## Node',
      '## Playwright',
      '## TypeScript declaration compatibility',
    ],
  },
  {
    path: 'docs/public/release-process.md',
    requiredHeadings: [
      '# Release Process',
      '## Public Preview Release posture',
      '## Release PR',
      '## Release Tag',
      '## Pre-NPM Release',
      '## npm publishing (deferred)',
    ],
  },
] as const;

test.describe('docs/public/ documentation spine', () => {
  for (const { path, requiredHeadings } of SPINE_FILES) {
    test(`${path} exists and provides the spine headings for human and AI-agent readers`, async () => {
      const content = await readFile(resolve(repoRoot, path), 'utf8');
      expect(content, `${path} must start with a top-level heading`).toMatch(/^# /m);
      for (const heading of requiredHeadings) {
        expect(content, `${path} must contain stable heading "${heading}"`).toContain(heading);
      }
    });
  }

  test('Support Matrix describes declaration compatibility as planned policy, not an existing gate', async () => {
    const content = await readFile(resolve(repoRoot, 'docs/public/support-matrix.md'), 'utf8');
    const tsHeader = '## TypeScript declaration compatibility';
    const tsIndex = content.indexOf(tsHeader);
    expect(tsIndex, 'support-matrix.md must contain the TypeScript section').toBeGreaterThan(-1);
    const tsSection = content.slice(tsIndex);
    expect(
      tsSection,
      'TypeScript section must NOT claim a declaration compatibility gate currently exists',
    ).not.toMatch(/\bgate\b[^.]*\bconsumes\b/i);
    expect(
      tsSection,
      'TypeScript section must mark declaration compatibility as planned/policy until the gate exists',
    ).toMatch(/\b(?:planned|policy|future|not yet|will)\b/i);
  });

  test('Contract Stability Matrix distinguishes the four documented surface categories', async () => {
    const content = await readFile(resolve(repoRoot, 'docs/public/data-contract.md'), 'utf8');
    const matrixIndex = content.indexOf('## Contract Stability Matrix');
    expect(
      matrixIndex,
      'data-contract.md must contain the Contract Stability Matrix section',
    ).toBeGreaterThan(-1);
    const matrixSection = content.slice(matrixIndex);
    for (const surface of [
      /stable[^\n]*(?:public|promise)/i,
      /schema[- ]versioned/i,
      /preview/i,
      /internal/i,
    ]) {
      expect(
        matrixSection,
        `Contract Stability Matrix must label the surface category matching ${surface}`,
      ).toMatch(surface);
    }
  });
});

test.describe('README and docs/public/ link integrity', () => {
  const linkPattern = /\]\(([^)]+)\)/g;

  function extractRelativeLinks(markdown: string): string[] {
    const targets = new Set<string>();
    for (const match of markdown.matchAll(linkPattern)) {
      const target = match[1];
      if (target === undefined) continue;
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('mailto:') ||
        target.startsWith('#')
      ) {
        continue;
      }
      targets.add(target);
    }
    return [...targets];
  }

  async function assertRelativeLinksResolve(markdownPath: string, content: string): Promise<void> {
    const baseDir = dirname(resolve(repoRoot, markdownPath));
    const relativeLinks = extractRelativeLinks(content);
    for (const target of relativeLinks) {
      const pathOnly = target.split('#')[0];
      if (!pathOnly) continue;
      const absolute = isAbsolute(pathOnly) ? pathOnly : resolve(baseDir, pathOnly);
      try {
        await access(absolute);
      } catch {
        throw new Error(
          `${markdownPath} contains a broken relative link: "${target}" (resolved to ${absolute})`,
        );
      }
    }
  }

  test('every relative link in README.md resolves to an existing file', async () => {
    const readme = await readReadme();
    const relativeLinks = extractRelativeLinks(readme);
    expect(
      relativeLinks.length,
      'README must link to at least one repository file',
    ).toBeGreaterThan(0);
    await assertRelativeLinksResolve('README.md', readme);
  });

  test('README links cover the public docs spine landing page', async () => {
    const readme = await readReadme();
    expect(
      readme,
      'README must link to the docs/public/ index so the public docs spine is discoverable',
    ).toMatch(/\]\(\.?\/?docs\/public\/(?:README\.md)?\)/);
  });

  for (const { path } of SPINE_FILES) {
    test(`every relative link in ${path} resolves to an existing file`, async () => {
      const content = await readFile(resolve(repoRoot, path), 'utf8');
      await assertRelativeLinksResolve(path, content);
    });
  }
});
