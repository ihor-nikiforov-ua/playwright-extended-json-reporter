import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertOutputFolderSafe,
  clearOutputFolder,
  collectForbiddenPaths,
  collectProjectArtifactDirs,
  detectOutputFolderOverlaps,
} from '../../src/cleanup.js';

test.describe('assertOutputFolderSafe', () => {
  test('throws when the resolved output folder equals the filesystem root', () => {
    const fsRoot = parse(resolve('/')).root;
    expect(() =>
      assertOutputFolderSafe(fsRoot, { paths: [fsRoot], labels: { [fsRoot]: 'filesystem root' } }),
    ).toThrow(/refuses to clear/);
  });

  test('throws when the resolved output folder equals an explicit forbidden path', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cleanup-guard-'));
    try {
      expect(() =>
        assertOutputFolderSafe(tmp, { paths: [tmp], labels: { [tmp]: 'process.cwd()' } }),
      ).toThrow(/process\.cwd\(\)/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('throws and includes the unsafe path in the message', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cleanup-guard-'));
    try {
      let captured: Error | undefined;
      try {
        assertOutputFolderSafe(tmp, { paths: [tmp], labels: { [tmp]: 'configDir' } });
      } catch (err) {
        captured = err as Error;
      }
      expect(captured?.message).toContain(tmp);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('does not throw when the output folder does not match any forbidden path', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cleanup-guard-'));
    const safeChild = join(tmp, 'output');
    try {
      expect(() =>
        assertOutputFolderSafe(safeChild, { paths: [tmp], labels: { [tmp]: 'config.rootDir' } }),
      ).not.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('compares forbidden paths after resolution so trailing separators do not bypass the guard', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cleanup-guard-'));
    try {
      const trailing = `${tmp}/`;
      expect(() =>
        assertOutputFolderSafe(trailing, { paths: [tmp], labels: { [tmp]: 'project.testDir' } }),
      ).toThrow(/refuses to clear/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

test.describe('clearOutputFolder', () => {
  test('removes pre-existing files inside the output folder', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cleanup-clear-'));
    try {
      const stalePath = join(tmp, 'stale.json');
      await writeFile(stalePath, '"stale"', 'utf8');

      await clearOutputFolder(tmp);

      const entries = await readdir(tmp);
      expect(entries).toEqual([]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('creates the output folder when it does not yet exist', async () => {
    const parentTmp = await mkdtemp(join(tmpdir(), 'cleanup-create-'));
    const target = join(parentTmp, 'fresh', 'output');
    try {
      await clearOutputFolder(target);
      const stats = await stat(target);
      expect(stats.isDirectory()).toBe(true);
    } finally {
      await rm(parentTmp, { recursive: true, force: true });
    }
  });

  test('does not touch files outside the output folder', async () => {
    const parentTmp = await mkdtemp(join(tmpdir(), 'cleanup-isolate-'));
    const sibling = join(parentTmp, 'keep.txt');
    const target = join(parentTmp, 'out');
    try {
      await writeFile(sibling, 'keep me', 'utf8');

      await clearOutputFolder(target);

      const siblingContent = await readFile(sibling, 'utf8');
      expect(siblingContent).toBe('keep me');
    } finally {
      await rm(parentTmp, { recursive: true, force: true });
    }
  });
});

test.describe('collectForbiddenPaths', () => {
  test('includes filesystem root, the supplied cwd, and config.rootDir', () => {
    const result = collectForbiddenPaths({ rootDir: '/repo' }, '/some/explicit/cwd');
    const fsRoot = parse(resolve('/repo')).root;
    expect(result.paths).toContain(fsRoot);
    expect(result.paths).toContain('/some/explicit/cwd');
    expect(result.paths).toContain('/repo');
    expect(result.labels?.['/some/explicit/cwd']).toBe('process.cwd()');
    expect(result.labels?.['/repo']).toBe('config.rootDir');
    expect(result.labels?.[fsRoot]).toBe('filesystem root');
  });

  test('includes the parent directory of configFile when present', () => {
    const result = collectForbiddenPaths(
      { rootDir: '/repo', configFile: '/repo/playwright.config.ts' },
      '/cwd',
    );
    expect(result.paths).toContain('/repo');
    expect(result.labels?.['/repo']).toBeDefined();
  });

  test('includes each project testDir and outputDir labelled by project name', () => {
    const result = collectForbiddenPaths(
      {
        rootDir: '/repo',
        projects: [
          { name: 'chromium', testDir: '/repo/tests', outputDir: '/repo/test-results/chromium' },
          { name: 'firefox', testDir: '/repo/tests', outputDir: '/repo/test-results/firefox' },
        ],
      },
      '/cwd',
    );
    expect(result.paths).toContain('/repo/tests');
    expect(result.paths).toContain('/repo/test-results/chromium');
    expect(result.paths).toContain('/repo/test-results/firefox');
    expect(result.labels?.['/repo/test-results/chromium']).toContain('chromium');
    expect(result.labels?.['/repo/test-results/firefox']).toContain('firefox');
  });

  test('does not throw when no projects are present', () => {
    const result = collectForbiddenPaths({ rootDir: '/repo' }, '/cwd');
    expect(result.paths).toContain('/repo');
  });
});

test.describe('end-to-end safety: assertOutputFolderSafe with collected forbidden paths', () => {
  test('refuses to clear when output folder resolves to the supplied cwd', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cleanup-cwd-'));
    try {
      const forbidden = collectForbiddenPaths({ rootDir: '/repo' }, tmp);
      expect(() => assertOutputFolderSafe(tmp, forbidden)).toThrow(/process\.cwd\(\)/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('refuses to clear when output folder resolves to a project outputDir from the config', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cleanup-output-'));
    const projectOutputDir = join(tmp, 'project-out');
    try {
      const forbidden = collectForbiddenPaths(
        {
          rootDir: tmp,
          projects: [{ name: 'chromium', testDir: tmp, outputDir: projectOutputDir }],
        },
        '/some/cwd-not-target',
      );
      expect(() => assertOutputFolderSafe(projectOutputDir, forbidden)).toThrow(
        /project 'chromium' outputDir/,
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

test.describe('collectProjectArtifactDirs', () => {
  test('returns each project testDir and outputDir', () => {
    const dirs = collectProjectArtifactDirs({
      rootDir: '/repo',
      projects: [
        { name: 'chromium', testDir: '/repo/tests', outputDir: '/repo/test-results/chromium' },
        { name: 'firefox', testDir: '/repo/tests', outputDir: '/repo/test-results/firefox' },
      ],
    });
    expect(dirs).toEqual([
      '/repo/tests',
      '/repo/test-results/chromium',
      '/repo/tests',
      '/repo/test-results/firefox',
    ]);
  });

  test('returns an empty list when no projects are configured', () => {
    expect(collectProjectArtifactDirs({ rootDir: '/repo' })).toEqual([]);
  });
});

test.describe('detectOutputFolderOverlaps', () => {
  test('reports the project directory when output folder is nested inside it', () => {
    const projectDir = '/repo/test-results';
    const outputFolder = '/repo/test-results/runboard';
    const overlaps = detectOutputFolderOverlaps(outputFolder, [projectDir]);
    expect(overlaps).toEqual([projectDir]);
  });

  test('returns no overlaps when output folder is unrelated to project directories', () => {
    const overlaps = detectOutputFolderOverlaps('/repo/runboard-output', ['/repo/test-results']);
    expect(overlaps).toEqual([]);
  });

  test('does not treat exact equality as a parent/child overlap', () => {
    const projectDir = '/repo/output';
    const overlaps = detectOutputFolderOverlaps(projectDir, [projectDir]);
    expect(overlaps).toEqual([]);
  });

  test('treats sibling paths sharing a prefix as non-overlapping', () => {
    const overlaps = detectOutputFolderOverlaps('/repo/test-results-runboard', [
      '/repo/test-results',
    ]);
    expect(overlaps).toEqual([]);
  });

  test('reports the project directory when output folder is an ancestor of it', () => {
    const projectOutputDir = '/repo/test-results/chromium';
    const outputFolder = '/repo/test-results';
    const overlaps = detectOutputFolderOverlaps(outputFolder, [projectOutputDir]);
    expect(overlaps).toEqual([projectOutputDir]);
  });

  test('reports overlaps in both nesting directions across multiple project dirs', () => {
    const insideOutput = '/repo/output/nested-artifacts';
    const containsOutput = '/repo';
    const unrelated = '/elsewhere/results';
    const outputFolder = '/repo/output';
    const overlaps = detectOutputFolderOverlaps(outputFolder, [
      insideOutput,
      containsOutput,
      unrelated,
    ]);
    expect(overlaps).toEqual([insideOutput, containsOutput]);
  });
});
