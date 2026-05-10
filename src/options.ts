import type { RunboardReportOptions } from './contract.js';

export const DEFAULT_OUTPUT_FOLDER = 'playwright-runboard-report';
export const DEFAULT_ATTACHMENTS_BASE_URL = 'data/';

export const OUTPUT_FOLDER_ENV = 'PLAYWRIGHT_RUNBOARD_OUTPUT_DIR';
export const ATTACHMENTS_BASE_URL_ENV = 'PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL';

export const NO_OP_COMPATIBILITY_OPTIONS = ['open', 'host', 'port', 'doNotInlineAssets'] as const;

export type NoOpCompatibilityOptionName = (typeof NO_OP_COMPATIBILITY_OPTIONS)[number];

export interface RunboardReporterOptions {
  outputFolder?: string;
  attachmentsBaseURL?: string;
  title?: string;
  noCopyPrompt?: boolean;
  noSnippets?: boolean;
  open?: 'always' | 'never' | 'on-failure';
  host?: string;
  port?: number;
  doNotInlineAssets?: boolean;
}

export interface ResolvedRunboardOptions {
  outputFolder: string;
  attachmentsBaseURL: string;
  reportOptions: RunboardReportOptions;
  noOpOptionsSupplied: NoOpCompatibilityOptionName[];
}

export function resolveRunboardOptions(
  options: RunboardReporterOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRunboardOptions {
  const outputFolder = options.outputFolder ?? env[OUTPUT_FOLDER_ENV] ?? DEFAULT_OUTPUT_FOLDER;
  const attachmentsBaseURL =
    options.attachmentsBaseURL ?? env[ATTACHMENTS_BASE_URL_ENV] ?? DEFAULT_ATTACHMENTS_BASE_URL;

  const reportOptions: RunboardReportOptions = {};
  if (options.title !== undefined) reportOptions.title = options.title;
  if (options.noCopyPrompt !== undefined) reportOptions.noCopyPrompt = options.noCopyPrompt;
  if (options.noSnippets !== undefined) reportOptions.noSnippets = options.noSnippets;

  const noOpOptionsSupplied = NO_OP_COMPATIBILITY_OPTIONS.filter(
    (name) => options[name] !== undefined,
  );

  return { outputFolder, attachmentsBaseURL, reportOptions, noOpOptionsSupplied };
}
