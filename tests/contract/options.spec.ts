import { expect, test } from '@playwright/test';
import { resolveRunboardOptions } from '../../src/options.js';

test.describe('resolveRunboardOptions', () => {
  test('defaults outputFolder to "playwright-runboard-report" when no option or env is set', () => {
    const resolved = resolveRunboardOptions({}, {});
    expect(resolved.outputFolder).toBe('playwright-runboard-report');
  });

  test('defaults attachmentsBaseURL to "data/" when no option or env is set', () => {
    const resolved = resolveRunboardOptions({}, {});
    expect(resolved.attachmentsBaseURL).toBe('data/');
  });

  test('reads outputFolder from PLAYWRIGHT_RUNBOARD_OUTPUT_DIR when no option supplied', () => {
    const resolved = resolveRunboardOptions(
      {},
      { PLAYWRIGHT_RUNBOARD_OUTPUT_DIR: '/tmp/from-env' },
    );
    expect(resolved.outputFolder).toBe('/tmp/from-env');
  });

  test('reads attachmentsBaseURL from PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL when no option supplied', () => {
    const resolved = resolveRunboardOptions(
      {},
      { PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL: 'https://cdn.example/runboard/' },
    );
    expect(resolved.attachmentsBaseURL).toBe('https://cdn.example/runboard/');
  });

  test('options.outputFolder takes precedence over PLAYWRIGHT_RUNBOARD_OUTPUT_DIR', () => {
    const resolved = resolveRunboardOptions(
      { outputFolder: '/tmp/from-options' },
      { PLAYWRIGHT_RUNBOARD_OUTPUT_DIR: '/tmp/from-env' },
    );
    expect(resolved.outputFolder).toBe('/tmp/from-options');
  });

  test('options.attachmentsBaseURL takes precedence over PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL', () => {
    const resolved = resolveRunboardOptions(
      { attachmentsBaseURL: '/cdn-from-options/' },
      { PLAYWRIGHT_RUNBOARD_ATTACHMENTS_BASE_URL: '/cdn-from-env/' },
    );
    expect(resolved.attachmentsBaseURL).toBe('/cdn-from-options/');
  });

  test('reportOptions contains exactly the supplied display options (title, noCopyPrompt, noSnippets)', () => {
    const resolved = resolveRunboardOptions(
      { title: 'Nightly', noCopyPrompt: true, noSnippets: false },
      {},
    );
    expect(resolved.reportOptions).toEqual({
      title: 'Nightly',
      noCopyPrompt: true,
      noSnippets: false,
    });
  });

  test('reportOptions omits unspecified display options instead of writing undefined', () => {
    const resolved = resolveRunboardOptions({ title: 'Only Title' }, {});
    expect(resolved.reportOptions).toEqual({ title: 'Only Title' });
    expect(resolved.reportOptions).not.toHaveProperty('noCopyPrompt');
    expect(resolved.reportOptions).not.toHaveProperty('noSnippets');
  });

  test('reportOptions excludes attachmentsBaseURL even when supplied', () => {
    const resolved = resolveRunboardOptions({ attachmentsBaseURL: '/cdn/', title: 'X' }, {});
    expect(resolved.reportOptions).toEqual({ title: 'X' });
    expect(resolved.reportOptions).not.toHaveProperty('attachmentsBaseURL');
  });

  test('reportOptions excludes no-op compatibility options', () => {
    const resolved = resolveRunboardOptions(
      { open: 'always', host: 'localhost', port: 9323, doNotInlineAssets: true, title: 'Y' },
      {},
    );
    expect(resolved.reportOptions).toEqual({ title: 'Y' });
    expect(resolved.reportOptions).not.toHaveProperty('open');
    expect(resolved.reportOptions).not.toHaveProperty('host');
    expect(resolved.reportOptions).not.toHaveProperty('port');
    expect(resolved.reportOptions).not.toHaveProperty('doNotInlineAssets');
  });

  test('noOpOptionsSupplied lists each supplied no-op compatibility option', () => {
    const resolved = resolveRunboardOptions(
      { open: 'always', host: '127.0.0.1', port: 9323, doNotInlineAssets: true },
      {},
    );
    expect(resolved.noOpOptionsSupplied).toEqual(['open', 'host', 'port', 'doNotInlineAssets']);
  });

  test('noOpOptionsSupplied is empty when no no-op compatibility option is supplied', () => {
    const resolved = resolveRunboardOptions({ title: 'no no-ops' }, {});
    expect(resolved.noOpOptionsSupplied).toEqual([]);
  });
});
