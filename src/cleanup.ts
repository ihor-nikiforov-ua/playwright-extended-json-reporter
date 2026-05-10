import { mkdir, rm } from 'node:fs/promises';
import { dirname, parse, resolve, sep } from 'node:path';

export interface ForbiddenPaths {
  paths: readonly string[];
  labels?: Readonly<Record<string, string>>;
}

export interface ForbiddenPathsConfigInput {
  rootDir: string;
  configFile?: string | undefined;
  projects?: readonly { name?: string; testDir?: string; outputDir?: string }[];
}

export function collectForbiddenPaths(
  config: ForbiddenPathsConfigInput,
  cwd: string = process.cwd(),
): ForbiddenPaths {
  const fsRoot = parse(resolve(config.rootDir)).root;
  const paths: string[] = [fsRoot, cwd, config.rootDir];
  const labels: Record<string, string> = {
    [fsRoot]: 'filesystem root',
    [cwd]: 'process.cwd()',
    [config.rootDir]: 'config.rootDir',
  };

  if (config.configFile) {
    const configDir = dirname(config.configFile);
    paths.push(configDir);
    labels[configDir] = 'config directory';
  }

  for (const project of config.projects ?? []) {
    if (project.testDir) {
      paths.push(project.testDir);
      labels[project.testDir] = `project '${project.name ?? ''}' testDir`;
    }
    if (project.outputDir) {
      paths.push(project.outputDir);
      labels[project.outputDir] = `project '${project.name ?? ''}' outputDir`;
    }
  }

  return { paths, labels };
}

export function collectProjectArtifactDirs(config: ForbiddenPathsConfigInput): string[] {
  const dirs: string[] = [];
  for (const project of config.projects ?? []) {
    if (project.testDir) dirs.push(project.testDir);
    if (project.outputDir) dirs.push(project.outputDir);
  }
  return dirs;
}

export function assertOutputFolderSafe(outputFolder: string, forbidden: ForbiddenPaths): void {
  const absolute = resolve(outputFolder);
  for (const candidate of forbidden.paths) {
    if (resolve(candidate) === absolute) {
      const label = forbidden.labels?.[candidate] ?? candidate;
      throw new Error(
        `playwright-runboard-reporter: refuses to clear Output Folder ${absolute}: ` +
          `resolved path equals ${label}.`,
      );
    }
  }
}

export async function clearOutputFolder(outputFolder: string): Promise<void> {
  const absolute = resolve(outputFolder);
  await rm(absolute, { recursive: true, force: true });
  await mkdir(absolute, { recursive: true });
}

export function detectOutputFolderOverlaps(
  outputFolder: string,
  projectDirs: readonly string[],
): string[] {
  const absoluteOutput = resolve(outputFolder);
  const outputPrefix = absoluteOutput.endsWith(sep) ? absoluteOutput : absoluteOutput + sep;
  const overlaps: string[] = [];
  for (const dir of projectDirs) {
    const absoluteDir = resolve(dir);
    if (absoluteOutput === absoluteDir) continue;
    const dirPrefix = absoluteDir.endsWith(sep) ? absoluteDir : absoluteDir + sep;
    if (absoluteOutput.startsWith(dirPrefix) || absoluteDir.startsWith(outputPrefix)) {
      overlaps.push(dir);
    }
  }
  return overlaps;
}
