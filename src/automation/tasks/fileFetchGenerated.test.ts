/**
 * Offline unit tests for the fileFetchGenerated cron task.
 *
 * Verifies the fix for: "Automation: File generation can finalize with a CDN error
 * page as the saved artifact." A non-2xx (or empty-body) response from the asset
 * CDN must NOT be mirrored to our CDN / persisted as File.url; the row must be left
 * at url:null + pollingUrl set so the next cron tick retries. Download failures must
 * `continue` (not throw) so the existing catch/delete self-heal path stays reserved
 * for genuine generation errors.
 *
 * No live DB, Placid, or CDN access: the global `fetch` is stubbed per-test, and fake
 * PrismaClient / Uploader instances are registered in the typedi Container.
 *
 * The task imports src/placid -> src/config, which throws if its required env vars are
 * missing. We pre-load .env.test.example (.env if present) and set fallbacks BEFORE
 * lazily requiring the task, so this runs in a bare checkout.
 *
 * Run with:
 *   npx tsx src/automation/tasks/fileFetchGenerated.test.ts
 *   # or: npx ts-node --transpile-only src/automation/tasks/fileFetchGenerated.test.ts
 */
import 'reflect-metadata';
import { PrismaClient, FileTypeType } from '@prisma/client';
import Container from 'typedi';
import Uploader from '@codeday/uploader-node';
import { config as loadEnv } from 'dotenv';

// --- Bootstrap env BEFORE importing anything that pulls in src/config.ts ----------
loadEnv({ path: '.env.test.example' });
loadEnv(); // also read .env if the user did `cp .env.test.example .env`
const REQUIRED_ENV = [
  'DATABASE_URL', 'ELASTIC_URL', 'ELASTIC_INDEX', 'AUTH_SECRET', 'AUTH_AUDIENCE',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_INBOUND_DOMAIN',
  'GEOCODIO_API_KEY', 'OPENAI_API_KEY', 'OPENAI_ORGANIZATION', 'WEBHOOK_KEY',
  'BADGR_USERNAME', 'BADGR_PASSWORD', 'BADGR_ISSUER', 'SHOPIFY_API_TOKEN',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET_KEY', 'SHOPIFY_STORE_DOMAIN',
  'LINEAR_API_KEY', 'LINEAR_TEAM_ID', 'LINEAR_PROBLEM_LABEL_ID', 'METRICS_KEY',
  'PLACID_API_TOKEN', 'ATTIO_API_TOKEN', 'ATTIO_ALUMNI_LIST',
];
for (const k of REQUIRED_ENV) if (!process.env[k]) process.env[k] = 'test';

// Safe to import the task / placid now (their imports pull in src/config.ts).
const fileFetchGenerated = require('./fileFetchGenerated').default as () => Promise<void>;

// --- Test harness --------------------------------------------------------------------
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAILED: ${message}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

// --- Fakes ----------------------------------------------------------------------------
type Body = string | Buffer;

const POLL_URL = 'https://placid.example/poll/file-1';
const ASSET_URL = 'https://cdn.example/asset.jpg';
const CDN_URL = 'https://our-cdn.example/uploaded-file.jpg';
const HTML_502 = '<html><body>502 Bad Gateway</body></html>';
// Plausible JPEG payload (magic bytes + some body) so the happy-path bytes are
// clearly not an error page.
const IMAGE_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);

function makeResponse(body: Body, status: number) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const ok = status >= 200 && status < 300;
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return {
    ok,
    status,
    async arrayBuffer() { return ab; },
    async json() { return JSON.parse(buf.toString('utf8')); },
    async text() { return buf.toString('utf8'); },
    headers: new Map<string, string>(),
  };
}

function fetchRouter(routes: Array<{ url: string; status: number; body: Body }>) {
  const map = new Map(routes.map((r) => [r.url, { status: r.status, body: r.body }]));
  return async (input: unknown, _init?: unknown) => {
    const u = String(input);
    const r = map.get(u);
    if (!r) throw new Error(`Unexpected fetch URL in test: ${u}`);
    return makeResponse(r.body, r.status);
  };
}

type FakeFile = {
  id: string;
  pollingUrl: string;
  fileTypeId: string;
  fileType: { type: FileTypeType };
  createdAt: Date;
};
function makeFile(over: Partial<FakeFile> = {}): FakeFile {
  return {
    id: 'file-1',
    pollingUrl: POLL_URL,
    fileTypeId: 'ft-1',
    fileType: { type: FileTypeType.IMAGE },
    createdAt: new Date(),
    ...over,
  };
}

interface FakeCalls { findMany: number; update: any[]; delete: any[] }
function makeFakePrisma(files: FakeFile[]) {
  const calls: FakeCalls = { findMany: 0, update: [], delete: [] };
  return {
    instance: {
      file: {
        findMany: async () => { calls.findMany += 1; return files; },
        update: async (args: any) => { calls.update.push(args); return {}; },
        delete: async (args: any) => { calls.delete.push(args); return {}; },
      },
    },
    calls,
  };
}

function makeFakeUploader() {
  const uploads: Array<{ buffer: Buffer; filename: string }> = [];
  return {
    instance: {
      file: async (buffer: Buffer, filename: string) => {
        uploads.push({ buffer, filename });
        return { id: 'cdn-1', url: CDN_URL };
      },
    },
    uploads,
  };
}

async function runScenario(opts: {
  files: FakeFile[];
  routes: Array<{ url: string; status: number; body: Body }>;
}) {
  const prisma = makeFakePrisma(opts.files);
  const uploader = makeFakeUploader();
  Container.reset();
  Container.set(PrismaClient, prisma.instance);
  Container.set(Uploader, uploader.instance);

  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchRouter(opts.routes);

  let threw = false;
  let err: unknown;
  try {
    await fileFetchGenerated();
  } catch (ex) {
    threw = true;
    err = ex;
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = originalFetch;
  }
  return { prisma, uploader, threw, err };
}

// --- Tests ----------------------------------------------------------------------------

async function testNon2xxRetries(): Promise<void> {
  // The core bug: a non-2xx (502/504/503/404) error body from the asset CDN used to be
  // uploaded verbatim and its CDN URL persisted as File.url. After the fix, the row is
  // skipped (no upload, no update, no delete) so the next cron tick retries the fetch
  // of the already-finished asset.
  for (const status of [404, 500, 502, 503, 504]) {
    const { prisma, uploader, threw } = await runScenario({
      files: [makeFile()],
      routes: [
        { url: POLL_URL, status: 200, body: JSON.stringify({ status: 'finished', image_url: ASSET_URL }) },
        { url: ASSET_URL, status, body: HTML_502 },
      ],
    });
    assert(!threw, `${status} asset: task does not throw (download blip must not reach catch/delete)`);
    assertEqual(uploader.uploads.length, 0, `${status} asset: uploader is NEVER called with the error body`);
    assertEqual(prisma.calls.update.length, 0, `${status} asset: prisma.file.update is NOT called (File.url stays null)`);
    assertEqual(prisma.calls.delete.length, 0, `${status} asset: row is NOT deleted (left for next-tick retry)`);
    assertEqual(prisma.calls.findMany, 1, `${status} asset: findMany called once`);
  }
}

async function testEmpty200Retries(): Promise<void> {
  // Replaces the dead `if (!dl)` guard: an ArrayBuffer is always truthy, so the old
  // guard never fired. A 200 with an empty body must now be skipped for retry, not
  // uploaded as a zero-byte artifact.
  const { prisma, uploader, threw } = await runScenario({
    files: [makeFile()],
    routes: [
      { url: POLL_URL, status: 200, body: JSON.stringify({ status: 'finished', image_url: ASSET_URL }) },
      { url: ASSET_URL, status: 200, body: '' },
    ],
  });
  assert(!threw, 'empty 200 body: task does not throw');
  assertEqual(uploader.uploads.length, 0, 'empty 200 body: uploader is not called');
  assertEqual(prisma.calls.update.length, 0, 'empty 200 body: prisma.file.update is NOT called');
  assertEqual(prisma.calls.delete.length, 0, 'empty 200 body: row is NOT deleted (left for retry)');
}

async function testHappyPathImage(): Promise<void> {
  // Regression guard: a real 200 image still mirrors the exact asset bytes and finalizes.
  const { prisma, uploader, threw } = await runScenario({
    files: [makeFile()],
    routes: [
      { url: POLL_URL, status: 200, body: JSON.stringify({ status: 'finished', image_url: ASSET_URL }) },
      { url: ASSET_URL, status: 200, body: IMAGE_BYTES },
    ],
  });
  assert(!threw, 'happy path: task does not throw');
  assertEqual(uploader.uploads.length, 1, 'happy path: uploader called exactly once');
  assertEqual(uploader.uploads[0].filename, 'file.jpg', 'happy path: uploaded with image extension');
  assert(
    buffersEqual(uploader.uploads[0].buffer, IMAGE_BYTES),
    'happy path: uploaded bytes equal the asset bytes (not an error body)',
  );
  assertEqual(prisma.calls.update.length, 1, 'happy path: prisma.file.update called exactly once');
  assertEqual(prisma.calls.update[0].where.id, 'file-1', 'happy path: update targets the right file id');
  assertEqual(prisma.calls.update[0].data.url, CDN_URL, 'happy path: update sets url to the mirrored CDN url');
  assertEqual(prisma.calls.update[0].data.pollingUrl, null, 'happy path: update clears pollingUrl (null)');
  assertEqual(prisma.calls.delete.length, 0, 'happy path: row is NOT deleted');
}

async function testHappyPathPdf(): Promise<void> {
  // Light regression for a non-IMAGE FileType: the pdf_url branch and 'pdf' extension.
  const POLL_PDF = 'https://placid.example/poll/pdf-1';
  const ASSET_PDF = 'https://cdn.example/asset.pdf';
  const PDF_BYTES = Buffer.from('%PDF-1.4\n%binary\r\n');
  const { uploader, prisma, threw } = await runScenario({
    files: [makeFile({ id: 'pdf-1', pollingUrl: POLL_PDF, fileType: { type: FileTypeType.PDF } })],
    routes: [
      { url: POLL_PDF, status: 200, body: JSON.stringify({ status: 'finished', pdf_url: ASSET_PDF }) },
      { url: ASSET_PDF, status: 200, body: PDF_BYTES },
    ],
  });
  assert(!threw, 'pdf happy path: task does not throw');
  assertEqual(uploader.uploads.length, 1, 'pdf happy path: uploader called once');
  assertEqual(uploader.uploads[0].filename, 'file.pdf', 'pdf happy path: correct pdf extension');
  assert(buffersEqual(uploader.uploads[0].buffer, PDF_BYTES), 'pdf happy path: uploaded bytes equal the asset bytes');
  assertEqual(prisma.calls.update[0].data.url, CDN_URL, 'pdf happy path: update sets url');
  assertEqual(prisma.calls.update[0].data.pollingUrl, null, 'pdf happy path: update clears pollingUrl');
}

async function testMixedTick(): Promise<void> {
  // A 502 on one row must not abort the loop or delete that row; a concurrently-ready
  // row in the same tick must still finalize. This confirms `continue` (not `throw`).
  const POLL_A = 'https://placid.example/poll/a';
  const ASSET_A = 'https://cdn.example/a.jpg';
  const POLL_B = 'https://placid.example/poll/b';
  const ASSET_B = 'https://cdn.example/b.jpg';
  const B_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x01, 0x02, 0x03, 0x04]);
  const { prisma, uploader, threw } = await runScenario({
    files: [makeFile({ id: 'a', pollingUrl: POLL_A }), makeFile({ id: 'b', pollingUrl: POLL_B })],
    routes: [
      { url: POLL_A, status: 200, body: JSON.stringify({ status: 'finished', image_url: ASSET_A }) },
      { url: ASSET_A, status: 502, body: HTML_502 },
      { url: POLL_B, status: 200, body: JSON.stringify({ status: 'finished', image_url: ASSET_B }) },
      { url: ASSET_B, status: 200, body: B_BYTES },
    ],
  });
  assert(!threw, 'mixed tick: task does not throw (the 502 row does not abort the loop)');
  assertEqual(uploader.uploads.length, 1, 'mixed tick: only the 200-row is uploaded');
  assert(
    uploader.uploads.length === 1 && buffersEqual(uploader.uploads[0].buffer, B_BYTES),
    'mixed tick: the uploaded bytes are the 200-row asset, not the 502 error body',
  );
  assertEqual(prisma.calls.update.length, 1, 'mixed tick: only the 200-row is updated');
  assertEqual(prisma.calls.update[0].where.id, 'b', 'mixed tick: update targets the 200-row id');
  assertEqual(prisma.calls.delete.length, 0, 'mixed tick: neither row is deleted (the 502 row waits for retry)');
}

async function testStillQueuedSkips(): Promise<void> {
  // Generation not finished: getFinalUrl returns null -> skip without touching the row.
  const { prisma, uploader, threw } = await runScenario({
    files: [makeFile()],
    routes: [
      { url: POLL_URL, status: 200, body: JSON.stringify({ status: 'queued' }) },
    ],
  });
  assert(!threw, 'queued: task does not throw');
  assertEqual(uploader.uploads.length, 0, 'queued: uploader not called');
  assertEqual(prisma.calls.update.length, 0, 'queued: prisma.file.update not called');
  assertEqual(prisma.calls.delete.length, 0, 'queued: row not deleted (left for next poll)');
}

async function testGenerationErrorDeletes(): Promise<void> {
  // Regression guard for the catch/delete self-heal path: a genuine Placid generation
  // error (getFinalUrl throws) MUST still delete the row. The fix routes DOWNLOAD
  // failures around this path via `continue`, but must not weaken it for generation errors.
  const { prisma, uploader, threw } = await runScenario({
    files: [makeFile()],
    routes: [
      { url: POLL_URL, status: 200, body: JSON.stringify({ status: 'error' }) },
    ],
  });
  assert(!threw, 'generation error: task swallows the error and does not throw to the caller');
  assertEqual(uploader.uploads.length, 0, 'generation error: uploader not called');
  assertEqual(prisma.calls.update.length, 0, 'generation error: prisma.file.update not called');
  assertEqual(prisma.calls.delete.length, 1, 'generation error: row is deleted via catch self-heal (regression guard)');
  assertEqual(prisma.calls.delete[0].where.id, 'file-1', 'generation error: delete targets the right file id');
}

async function testFetchRestoredAfterEachRun(): Promise<void> {
  // Observational guard: globalThis.fetch is restored to the original after a run so
  // stub leakage can't poison other tests.
  const before = globalThis.fetch;
  await runScenario({
    files: [],
    routes: [{ url: POLL_URL, status: 200, body: JSON.stringify({ status: 'queued' }) }],
  });
  assertEqual(globalThis.fetch, before, 'globalThis.fetch restored after the task runs');
}

async function main(): Promise<void> {
  await testNon2xxRetries();
  await testEmpty200Retries();
  await testHappyPathImage();
  await testHappyPathPdf();
  await testMixedTick();
  await testStillQueuedSkips();
  await testGenerationErrorDeletes();
  await testFetchRestoredAfterEachRun();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
