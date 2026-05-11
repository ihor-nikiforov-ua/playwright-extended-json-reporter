import type { RunboardReportOptions } from './contract.js';

export const DEFAULT_OUTPUT_FOLDER = 'playwright-runboard-report';
export const DEFAULT_ATTACHMENTS_BASE_URL = 'data/';

export const OUTPUT_FOLDER_ENV = 'PLAYWRIGHT_RUNBOARD_OUTPUT_DIR';
export const ATTACHMENTS_BASE_URL_ENV = 'PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL';

export const NO_OP_COMPATIBILITY_OPTIONS = ['open', 'host', 'port', 'doNotInlineAssets'] as const;

export type NoOpCompatibilityOptionName = (typeof NO_OP_COMPATIBILITY_OPTIONS)[number];

/**
 * Options accepted by the {@link RunboardReporter} constructor and by
 * Playwright's `reporter:` array.
 *
 * Option names that also apply to Playwright's official HTML reporter use
 * the same name and default. Options that only make sense for a rendered
 * HTML report (`open`, `host`, `port`, `doNotInlineAssets`) are accepted
 * for configuration compatibility and ignored at runtime with a once-per-
 * option warning during `onBegin`.
 *
 * Constructor options take precedence over matching environment variables.
 */
export interface RunboardReporterOptions {
  /**
   * Output Folder for the Runboard Data Bundle. Resolved to an absolute
   * path before cleanup. Defaults to `'playwright-runboard-report'` and
   * may also be set via `PLAYWRIGHT_RUNBOARD_OUTPUT_DIR`.
   */
  outputFolder?: string;
  /**
   * Base path used in copied Attachment Asset references. Defaults to
   * `'data/'` and may also be set via
   * `PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL`.
   */
  attachmentsBaseURL?: string;
  /** Human-readable report title preserved in `report.options.title`. */
  title?: string;
  /** When `true`, Runboard UIs hide the AI copy-prompt affordance. */
  noCopyPrompt?: boolean;
  /**
   * When `true`, suppresses Source Excerpts in Structured Error Evidence,
   * matching Playwright's `noSnippets` privacy and size control.
   */
  noSnippets?: boolean;
  /**
   * Accepted for compatibility with Playwright's HTML reporter and ignored
   * at runtime; this package does not render, serve, or open HTML.
   */
  open?: 'always' | 'never' | 'on-failure';
  /**
   * Accepted for compatibility with Playwright's HTML reporter and ignored
   * at runtime; this package does not serve HTML.
   */
  host?: string;
  /**
   * Accepted for compatibility with Playwright's HTML reporter and ignored
   * at runtime; this package does not serve HTML.
   */
  port?: number;
  /**
   * Accepted for compatibility with Playwright's HTML reporter and ignored
   * at runtime; this package does not render HTML or inline assets.
   */
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
