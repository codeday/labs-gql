/**
 * Offline unit tests for ReviewResolver.submitStudentRating. No live DB: the
 * PrismaClient is stubbed so the tests assert the resolver upserts exactly one
 * row per (student, reviewer) pair instead of stacking duplicates — the
 * invariant nextStudentNeedingRating's queue already assumes.
 *
 * Run with (ts-node, not tsx, because this repo's type-graphql @Field decorators
 * rely on TS emitDecoratorMetadata that esbuild-based tsx strips at load time):
 *   npx ts-node src/resolvers/Review.test.ts
 *
 * Preconditions:
 *   - `config.ts` (pulled in transitively via Review -> context) throws at
 *     import time unless the env vars it checks are set, so ensureTestEnv()
 *     seeds them before the resolver is dynamically imported. (The repo also
 *     documents `cp .env.test.example .env` for the same effect.)
 *   - typedi's Container is given the stub prisma so validateStudentEvent(),
 *     which resolves PrismaClient from the Container itself, also sees it.
 */
import 'reflect-metadata';
import { Container } from 'typedi';
import { PrismaClient, Track } from '@prisma/client';

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

// config.ts (loaded transitively through Review) throws at import time unless
// these are present.
function ensureTestEnv(): void {
  const defaults: Record<string, string> = {
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
  for (const [k, v] of Object.entries(defaults)) {
    process.env[k] = process.env[k] || v;
  }
}

interface StudentRow { id: string; eventId: string; username?: string }

interface CallLog {
  findUnique: any[];
  upsert: any[];
  create: any[];
}

function auth(username: string | undefined, eventId = 'eventA'): any {
  return { username, eventId };
}

function makeResolver(students: StudentRow[]): { resolver: any; calls: CallLog } {
  const calls: CallLog = { findUnique: [], upsert: [], create: [] };
  const byId: Record<string, StudentRow> = {};
  const byUsername: Record<string, StudentRow> = {};
  for (const s of students) {
    byId[s.id] = s;
    if (s.username) byUsername[s.username] = s;
  }
  const fakePrisma: any = {
    student: {
      findUnique: async (args: any) => {
        calls.findUnique.push(args);
        const w = args.where;
        if (w && w.id) return byId[w.id] ?? null;
        if (w && w.username_eventId) return byUsername[w.username_eventId.username] ?? null;
        return null;
      },
    },
    admissionRating: {
      upsert: async (args: any) => {
        calls.upsert.push(args);
        return { id: `ar-${calls.upsert.length}` };
      },
      create: async (args: any) => {
        calls.create.push(args);
        return { id: `ar-create-${calls.create.length}` };
      },
    },
  };
  Container.set(PrismaClient, fakePrisma);
  const ReviewResolverModule = require('./Review');
  const resolver = new ReviewResolverModule.ReviewResolver();
  (resolver as any).prisma = fakePrisma;
  return { resolver, calls };
}

async function testFirstRatingUsesUpsertNotCreate(): Promise<void> {
  const { resolver, calls } = makeResolver([{ id: 's1', eventId: 'eventA', username: 's1user' }]);

  const result = await resolver.submitStudentRating(
    { auth: auth('reviewer1', 'eventA') } as any,
    { id: 's1' } as any,
    7,
    Track.BEGINNER,
  );

  assertEqual(result, true, 'submitStudentRating returns true on success');
  assertEqual(calls.create.length, 0, 'First rating does NOT call admissionRating.create');
  assertEqual(calls.upsert.length, 1, 'First rating calls admissionRating.upsert exactly once');
  assertEqual(
    calls.upsert[0].where,
    { studentId_ratedBy: { studentId: 's1', ratedBy: 'reviewer1' } },
    'Upsert is keyed by the composite (studentId, ratedBy)',
  );
  assertEqual(
    calls.upsert[0].create,
    { ratedBy: 'reviewer1', rating: 7, track: Track.BEGINNER, studentId: 's1' },
    'Upsert create branch stores ratedBy, rating, track, studentId',
  );
  assertEqual(
    calls.upsert[0].update,
    { rating: 7, track: Track.BEGINNER },
    'Upsert update branch replaces rating and track',
  );
}

async function testSecondRatingReplacesFirstNoStacking(): Promise<void> {
  const { resolver, calls } = makeResolver([{ id: 's1', eventId: 'eventA' }]);

  await resolver.submitStudentRating({ auth: auth('reviewer1', 'eventA') } as any, { id: 's1' } as any, 7, Track.BEGINNER);
  await resolver.submitStudentRating({ auth: auth('reviewer1', 'eventA') } as any, { id: 's1' } as any, 10, Track.ADVANCED);

  assertEqual(calls.create.length, 0, 'No create calls across two ratings from the same reviewer');
  assertEqual(calls.upsert.length, 2, 'Two upsert calls (one per submit), not two stacked rows');
  assertEqual(
    calls.upsert[0].where,
    calls.upsert[1].where,
    'Both upserts target the same (studentId, ratedBy) pair',
  );
  assertEqual(
    calls.upsert[1].update,
    { rating: 10, track: Track.ADVANCED },
    'Second rating replaces the first via the update branch',
  );
}

async function testDifferentReviewersAreDistinctPairs(): Promise<void> {
  const { resolver, calls } = makeResolver([{ id: 's1', eventId: 'eventA' }]);

  await resolver.submitStudentRating({ auth: auth('r1', 'eventA') } as any, { id: 's1' } as any, 7, Track.BEGINNER);
  await resolver.submitStudentRating({ auth: auth('r2', 'eventA') } as any, { id: 's1' } as any, 9, Track.ADVANCED);

  assertEqual(calls.create.length, 0, 'No create calls when two different reviewers rate the same student');
  assertEqual(calls.upsert.length, 2, 'Two reviewers produce two upsert calls');
  assertEqual(calls.upsert[0].where.studentId_ratedBy.ratedBy, 'r1', 'First upsert belongs to reviewer r1');
  assertEqual(calls.upsert[1].where.studentId_ratedBy.ratedBy, 'r2', 'Second upsert belongs to reviewer r2');
  assertEqual(calls.upsert[0].where.studentId_ratedBy.studentId, 's1', 'Both upserts target student s1');
}

async function testUsernameWhereStillResolvesStudentId(): Promise<void> {
  const { resolver, calls } = makeResolver([{ id: 's9', eventId: 'eventA', username: 'alice' }]);

  await resolver.submitStudentRating(
    { auth: auth('reviewer1', 'eventA') } as any,
    { username: 'alice' } as any,
    8,
    Track.INTERMEDIATE,
  );

  assertEqual(calls.upsert.length, 1, 'Username-based where still issues an upsert');
  assertEqual(calls.upsert[0].where.studentId_ratedBy.studentId, 's9', 'The resolved studentId is used for the upsert key');
  assertEqual(calls.upsert[0].create.studentId, 's9', 'create branch uses the resolved studentId, not a connect-by-username');
}

async function testMissingStudentIsRejectedAndNotPersisted(): Promise<void> {
  const { resolver, calls } = makeResolver([]);

  let threw = false;
  try {
    await resolver.submitStudentRating({ auth: auth('reviewer1', 'eventA') } as any, { id: 'nope' } as any, 7, Track.BEGINNER);
  } catch {
    threw = true;
  }
  assert(threw, 'A non-existent student is rejected rather than failing on a dangling FK');
  assertEqual(calls.upsert.length, 0, 'No upsert is issued for a missing student');
}

async function main(): Promise<void> {
  ensureTestEnv();
  await testFirstRatingUsesUpsertNotCreate();
  await testSecondRatingReplacesFirstNoStacking();
  await testDifferentReviewersAreDistinctPairs();
  await testUsernameWhereStillResolvesStudentId();
  await testMissingStudentIsRejectedAndNotPersisted();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

if (require.main === module) main();
