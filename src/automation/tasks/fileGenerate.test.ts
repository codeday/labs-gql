/**
 * Offline unit tests for fileGenerate's per-iteration error isolation.
 *
 * The fileGenerate import graph runs src/config.ts at module load, which validates ~30
 * required env vars. This test sets fallback values for any that are missing (a real .env,
 * if present via `cp .env.test.example .env`, takes precedence) and then loads the module
 * under test with require() so the fallbacks are in place before config.ts validates.
 *
 * Run with:
 *   npx tsx src/automation/tasks/fileGenerate.test.ts
 */
import 'reflect-metadata';
import { PrismaClient, FileTypeGenerationCondition, FileTypeGenerationTarget, FileTypeType } from '@prisma/client';
import Container from 'typedi';
import createDebug from 'debug';

const FALLBACK_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ELASTIC_URL: 'http://localhost:9200',
  ELASTIC_INDEX: 'test',
  AUTH_SECRET: 'test-secret',
  AUTH_AUDIENCE: 'test-audience',
  EMAIL_HOST: 'localhost',
  EMAIL_PORT: '587',
  EMAIL_USER: 'test',
  EMAIL_PASS: 'test',
  EMAIL_INBOUND_DOMAIN: 'test.local',
  GEOCODIO_API_KEY: 'test-key',
  OPENAI_API_KEY: 'test-key',
  OPENAI_ORGANIZATION: 'test-org',
  WEBHOOK_KEY: 'test-key',
  BADGR_USERNAME: 'test',
  BADGR_PASSWORD: 'test',
  BADGR_ISSUER: 'test',
  SHOPIFY_API_TOKEN: 'test',
  SHOPIFY_API_KEY: 'test',
  SHOPIFY_API_SECRET_KEY: 'test',
  SHOPIFY_STORE_DOMAIN: 'test.myshopify.com',
  LINEAR_API_KEY: 'test',
  LINEAR_TEAM_ID: 'test',
  LINEAR_PROBLEM_LABEL_ID: 'test',
  METRICS_KEY: 'test',
  PLACID_API_TOKEN: 'test',
  ATTIO_API_TOKEN: 'test',
  ATTIO_ALUMNI_LIST: 'test',
};
for (const [k, v] of Object.entries(FALLBACK_ENV)) if (!process.env[k]) process.env[k] = v;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateFileForIndividuals, default: fileGenerate } = require('./fileGenerate');

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

function makeEvent(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'evt-1',
    name: 'Test Event',
    title: 'Test Event',
    defaultWeeks: 4,
    startsAt: new Date('2020-01-01T00:00:00Z'),
    isActive: true,
    ...overrides,
  };
}

function makeStudent(id: string, overrides: Record<string, unknown> = {}): any {
  return { id, givenName: 'S', surname: 'X', weeks: 6, projects: [], status: 'ACCEPTED', ...overrides };
}

function makeFileType(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'ft-1',
    templateId: 'tpl-1',
    type: FileTypeType.IMAGE,
    layers: {},
    generationCondition: FileTypeGenerationCondition.ACCEPTED,
    generationTarget: FileTypeGenerationTarget.STUDENT,
    slug: 'cert',
    eventId: 'evt-1',
    files: [],
    ...overrides,
  };
}

function makePrismaStub(overrides: Record<string, unknown> = {}): any {
  const createdFiles: any[] = [];
  return {
    _createdFiles: createdFiles,
    file: {
      create: async (args: any) => {
        createdFiles.push(args.data);
        return { id: `file-${createdFiles.length}`, ...args.data };
      },
    },
    fileType: { findMany: async () => [] },
    ...overrides,
  };
}

function placidSuccess(pollingUrl = 'https://placid.app/poll/123'): () => Promise<any> {
  return async () => ({ json: async () => ({ polling_url: pollingUrl }) });
}

function placidErrorBody(): () => Promise<any> {
  return async () => ({ json: async () => ({ error: 'bad template' }) });
}

function placidSequence(handlers: Array<() => Promise<any>>): { fetch: any; calls: { url: string; body: any }[] } {
  const calls: { url: string; body: any }[] = [];
  let i = 0;
  const fetchStub = (async (url: string, init: any) => {
    let body: any = undefined;
    try { body = init?.body ? JSON.parse(init.body) : undefined; } catch { body = init?.body; }
    calls.push({ url, body });
    const handler = handlers[Math.min(i, handlers.length - 1)];
    i += 1;
    return handler();
  }) as any;
  return { fetch: fetchStub, calls };
}

async function withFetchStub<T>(stub: any, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

function withPrisma<T>(prisma: any, fn: () => Promise<T>): Promise<T> {
  Container.set(PrismaClient, prisma);
  return fn();
}

async function withDebugCapture<T>(fn: (captured: string[]) => Promise<T>): Promise<T> {
  const captured: string[] = [];
  const originalLog = createDebug.log;
  createDebug.log = function (...args: any[]) { captured.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')); };
  createDebug.enable('codeday:labs:automation:tasks:fileGenerate');
  try { return await fn(captured); } finally { createDebug.log = originalLog; }
}

async function testStudentFailureDoesNotAbortRestOfFile(): Promise<void> {
  const prisma = makePrismaStub();
  const seq = placidSequence([placidErrorBody(), placidSuccess()]);
  const ft = makeFileType({ id: 'ft-1', generationTarget: FileTypeGenerationTarget.STUDENT });
  const students = [makeStudent('stud-0'), makeStudent('stud-1')];

  let threw = false;
  await withFetchStub(seq.fetch, () =>
    withPrisma(prisma, () => generateFileForIndividuals(ft, makeEvent(), students, []))
  ).catch(() => { threw = true; });

  assert(!threw, 'A single generateMedia rejection does not propagate out of generateFileForIndividuals');
  assertEqual(seq.calls.length, 2, 'generateMedia is called for BOTH students (loop is not aborted)');
  assertEqual(prisma._createdFiles.length, 1, 'Exactly one File row is created (for the succeeding student)');
  assertEqual(prisma._createdFiles[0].studentId, 'stud-1', 'The created row belongs to the second student');
}

async function testPrismaCreateFailureIsAlsoIsolated(): Promise<void> {
  const prisma = makePrismaStub();
  let createCalls = 0;
  prisma.file.create = async (args: any) => {
    createCalls += 1;
    if (createCalls === 1) throw new Error('db write failed');
    prisma._createdFiles.push(args.data);
    return { id: `file-${createCalls}`, ...args.data };
  };
  const seq = placidSequence([placidSuccess(), placidSuccess()]);
  const ft = makeFileType({ id: 'ft-1' });
  const students = [makeStudent('stud-0'), makeStudent('stud-1')];

  let threw = false;
  await withFetchStub(seq.fetch, () =>
    withPrisma(prisma, () => generateFileForIndividuals(ft, makeEvent(), students, []))
  ).catch(() => { threw = true; });

  assert(!threw, 'A prisma.file.create rejection does not propagate');
  assertEqual(prisma._createdFiles.length, 1, 'The student whose write failed is skipped; the next still persists');
  assertEqual(prisma._createdFiles[0].studentId, 'stud-1', 'The surviving row belongs to the second student');
}

async function testOneFailingFileTypeDoesNotAbortNextFileType(): Promise<void> {
  const ftBad = makeFileType({ id: 'ft-bad', templateId: 'tpl-bad', generationTarget: FileTypeGenerationTarget.STUDENT });
  ftBad.event = makeEvent();
  ftBad.event.students = [makeStudent('stud-bad')];
  ftBad.event.mentors = [];
  ftBad.event.projects = [];

  const ftGood = makeFileType({ id: 'ft-good', templateId: 'tpl-good', generationTarget: FileTypeGenerationTarget.STUDENT });
  ftGood.event = makeEvent();
  ftGood.event.students = [makeStudent('stud-good')];
  ftGood.event.mentors = [];
  ftGood.event.projects = [];

  const prisma = makePrismaStub({
    fileType: { findMany: async () => [ftBad, ftGood] },
  });
  const seq = placidSequence([placidErrorBody(), placidSuccess()]);

  let threw = false;
  await withFetchStub(seq.fetch, () => withPrisma(prisma, () => fileGenerate())).catch(() => { threw = true; });

  assert(!threw, 'fileGenerate() does not reject when a FileType fails');
  assertEqual(seq.calls.length, 2, 'Both FileTypes are attempted');
  assertEqual(prisma._createdFiles.length, 1, 'Only the good FileType produces a row');
  assertEqual(prisma._createdFiles[0].studentId, 'stud-good', 'The trailing FileType still generated its student');
  assertEqual(prisma._createdFiles[0].fileTypeId, 'ft-good', 'The row is attributed to the trailing FileType');
}

async function testFailureLogIncludesIdentifiers(): Promise<void> {
  const prisma = makePrismaStub();
  const seq = placidSequence([placidErrorBody(), placidSuccess()]);
  const ft = makeFileType({ id: 'ft-tag', templateId: 'tpl-tag' });
  const students = [makeStudent('stud-tag-0'), makeStudent('stud-tag-1')];

  await withDebugCapture(async (captured) => {
    await withFetchStub(seq.fetch, () =>
      withPrisma(prisma, () => generateFileForIndividuals(ft, makeEvent(), students, []))
    );

    const failureLines = captured.filter((line) => line.includes('Error generating'));
    assert(failureLines.some((line) => line.includes('ft-tag') && line.includes('stud-tag-0')), 'The catch is logged with the FileType id AND the failing individual id');
    assertEqual(failureLines.filter((line) => line.includes('stud-tag-1')).length, 0, 'The succeeding individual is not logged as a failure');
  });
}

async function main(): Promise<void> {
  await testStudentFailureDoesNotAbortRestOfFile();
  await testPrismaCreateFailureIsAlsoIsolated();
  await testOneFailingFileTypeDoesNotAbortNextFileType();
  await testFailureLogIncludesIdentifiers();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
