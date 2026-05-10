/**
 * extractHtmlReportData reads an `index.html` produced by Playwright's
 * official HTML reporter, decodes its embedded base64 ZIP, and returns the
 * parsed `report.json` plus the per-file shards keyed by `<fileId>`.
 *
 * The test synthesizes an `index.html` with a hand-crafted STORE-mode zip so
 * the harness's HTML extraction is verified independently of running
 * Playwright. Real Playwright runs are exercised by the Compatibility Smoke
 * Suite once this extraction layer is proven.
 */
import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { extractHtmlReportData } from '../harness/compatibility-fixture.js';

interface StoredZipEntry {
  name: string;
  body: Buffer;
}

function makeStoredZip(entries: StoredZipEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.body);
    const size = entry.body.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression: STORE
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed
    localHeader.writeUInt32LE(size, 22); // uncompressed
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra
    localChunks.push(localHeader, nameBuf, entry.body);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // compression: STORE
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20); // compressed
    centralHeader.writeUInt32LE(size, 24); // uncompressed
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + entry.body.length;
  }

  const central = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // disk with central
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, central, eocd]);
}

let crcTable: Uint32Array | undefined;

function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const tableIndex = (crc ^ (buf[i] ?? 0)) & 0xff;
    crc = (crcTable[tableIndex] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeFakeIndexHtml(zipBuffer: Buffer): string {
  const base64 = zipBuffer.toString('base64');
  return [
    '<html><body>fake html report shell</body>',
    '<template id="playwrightReportBase64">data:application/zip;base64,',
    base64,
    '</template></html>',
  ].join('');
}

test.describe('extractHtmlReportData', () => {
  let workDir: string;

  test.beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'extract-html-report-'));
  });

  test.afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('returns parsed report.json and per-file entries from the index.html embedded zip', async () => {
    const reportBody = JSON.stringify({ projectNames: ['chromium'], stats: { total: 1 } });
    const fileBody = JSON.stringify({ fileId: 'abc12345', fileName: 'a.spec.ts', tests: [] });
    const zip = makeStoredZip([
      { name: 'report.json', body: Buffer.from(reportBody, 'utf8') },
      { name: 'abc12345.json', body: Buffer.from(fileBody, 'utf8') },
    ]);
    const indexHtmlPath = join(workDir, 'index.html');
    await writeFile(indexHtmlPath, makeFakeIndexHtml(zip), 'utf8');

    const data = await extractHtmlReportData(indexHtmlPath);
    expect(data.report).toEqual({ projectNames: ['chromium'], stats: { total: 1 } });
    expect(data.files.size).toBe(1);
    expect(data.files.get('abc12345')).toEqual({
      fileId: 'abc12345',
      fileName: 'a.spec.ts',
      tests: [],
    });
  });

  test('throws a path-named error when index.html does not contain the expected playwrightReportBase64 template', async () => {
    const indexHtmlPath = join(workDir, 'index.html');
    await writeFile(indexHtmlPath, '<html><body>no template here</body></html>', 'utf8');
    await expect(extractHtmlReportData(indexHtmlPath)).rejects.toThrow(/playwrightReportBase64/);
  });
});
