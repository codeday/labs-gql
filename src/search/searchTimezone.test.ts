/**
 * Offline unit + end-to-end regression tests for the timezone-offset handling in the
 * search ranking pipeline (index side: projectToElasticEntry -> Elasticsearch; query
 * side: getProjectMatches -> function-score timezone boost).
 *
 * Regression coverage for the UTC+0 falsy-zero bug: both the index-side wrapper in
 * ElasticEntry.ts (`if (basicLookup)` -> `if (basicLookup !== null)`) and the query-side
 * mirror in getProjectMatches.ts (`|| -7` -> `?? -7`) must distinguish a legitimate
 * `0`/`-0` offset (a real UTC+0 zone) from a `null` "unrecognized" sentinel. Otherwise
 * UTC+0 users are indexed/queried at -7, the same bucket as Asia/Bangkok (UTC+7),
 * shifting the +/-4h timezone boost window and mis-awarding the 15x TIMEZONE_MATCH
 * multiplier (the single largest ranking weight).
 *
 * No live Elasticsearch / Postgres. The IO layer is stubbed by injecting fakes into the
 * typedi Container (the same DI container the production code uses) and reading the
 * generated Elasticsearch query JSON back out.
 *
 * Run with:
 *   npx tsx src/search/searchTimezone.test.ts
 */
// type-graphql's registerEnumType (pulled in via ../enums) needs the reflect-metadata
// polyfill, and it must be loaded BEFORE any module that triggers registration.
import 'reflect-metadata';

// The inner util (src/utils/getTimezoneOffset.ts) imports nothing, so it is safe to
// import normally; it is the foundation whose 0-vs-null contract both fixes rely on.
import { getTimezoneOffset as innerGetTimezoneOffset } from '../utils/getTimezoneOffset';
import { Client } from '@elastic/elasticsearch';
import { Container } from 'typedi';
import { Track, TagType, MentorStatus } from '../enums';
// `import type` is erased at runtime, so it does not pull ../types -> ../utils -> config.
import type { Student } from '../types';

// src/config.ts throws at import time unless every required env var is present, and
// ElasticEntry.ts / getProjectMatches.ts both transitively `require('../utils')` whose
// barrel re-exports geoToTimezone -> config. Stub them BEFORE requiring those modules.
// (These modules are therefore loaded with dynamic `require` below, not static import,
// so this env-stub loop runs first.)
const REQUIRED_ENV = [
  'DATABASE_URL', 'ELASTIC_URL', 'ELASTIC_INDEX', 'AUTH_SECRET', 'AUTH_AUDIENCE',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_INBOUND_DOMAIN',
  'GEOCODIO_API_KEY', 'OPENAI_API_KEY', 'OPENAI_ORGANIZATION', 'WEBHOOK_KEY',
  'BADGR_USERNAME', 'BADGR_PASSWORD', 'BADGR_ISSUER', 'SHOPIFY_API_TOKEN',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET_KEY', 'SHOPIFY_STORE_DOMAIN', 'LINEAR_API_KEY',
  'LINEAR_TEAM_ID', 'LINEAR_PROBLEM_LABEL_ID', 'METRICS_KEY', 'PLACID_API_TOKEN',
  'ATTIO_API_TOKEN', 'ATTIO_ALUMNI_LIST',
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) process.env[key] = 'stub';
}

// Load these AFTER the env stubs are in place, since their import graph reaches config.
const { projectToElasticEntry, ELASTIC_NULL } = require('./ElasticEntry') as typeof import('./ElasticEntry');
const { getProjectMatches } = require('./getProjectMatches') as typeof import('./getProjectMatches');
const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

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

// `=== 0` is true for both +0 and -0; the inner util returns -0 for picker UTC+0 zones
// on newer ICU and +0 on older ICU, and both must be honored by the fixes.
function isZeroOffset(value: unknown): boolean {
  return typeof value === 'number' && value === 0;
}

// --- Fixtures ----------------------------------------------------------------------------

// A minimal projection of a Prisma Project+Mentor document that exposes only the
// fields projectToElasticEntry actually reads. Cast through `unknown` because the
// real Prisma model types declare many more required fields than the function touches.
type ElasticProjectInput = Parameters<typeof projectToElasticEntry>[0];

function makeProjectWithMentorTimezone(
  id: string,
  mentorTimezone: string | undefined,
): ElasticProjectInput {
  return {
    id,
    eventId: 'evt-1',
    status: 'ACCEPTED',
    track: Track.BEGINNER,
    affinePartnerId: null,
    mentors: [
      {
        status: MentorStatus.ACCEPTED,
        maxWeeks: 6,
        timezone: mentorTimezone,
        profile: {},
      },
    ],
    tags: [],
    projectPreferences: [],
  } as unknown as ElasticProjectInput;
}

function makeStudent(timezone: string | null): unknown {
  // Plain object is sufficient: getProjectMatches only reads these plain properties.
  return {
    id: 'student-1',
    timezone,
    partnerCode: null,
    eventId: 'evt-1',
    weeks: 6,
    track: Track.BEGINNER,
    profile: {},
  };
}

// --- Query-JSON helpers ------------------------------------------------------------------

interface TimezoneFunction { window: Set<string>; weight: number }

function extractTimezoneFunction(query: unknown): TimezoneFunction | null {
  const functions: any[] = (query as any)?.query?.function_score?.functions ?? [];
  for (const f of functions) {
    const should: any[] = f?.filter?.bool?.should;
    if (!Array.isArray(should)) continue;
    const values: string[] = [];
    let touchesTimezone = false;
    for (const clause of should) {
      const match = clause?.match;
      if (match && typeof match === 'object' && 'timezoneOffset' in match) {
        touchesTimezone = true;
        const raw = match.timezoneOffset;
        const value = (typeof raw === 'object' && raw !== null && 'query' in raw)
          ? (raw as { query: unknown }).query
          : raw;
        values.push(String(value));
      }
    }
    if (touchesTimezone) return { window: new Set(values), weight: f.weight };
  }
  return null;
}

// Generically evaluate the query's function_score against an ElasticEntry-shaped doc,
// so the end-to-end ranking test scores candidates the way the real query would. Only
// the shapes the codebase actually emits are supported (weightScoreFunction filters of
// `match` / `bool.should`, plus the gauss popularity decay which is 1.0 for our fixtures
// since studentsSelected <= offset).
function docMatchesFilter(filter: any, doc: any): boolean {
  if (!filter) return true;
  if (filter.match) {
    return Object.entries(filter.match).every(([field, v]) => {
      const query = (typeof v === 'object' && v !== null && 'query' in v)
        ? (v as { query: unknown }).query
        : v;
      return String(doc[field]) === String(query);
    });
  }
  if (filter.bool) {
    if (Array.isArray(filter.bool.should) && !filter.bool.should.some((s: any) => docMatchesFilter(s, doc))) return false;
    if (Array.isArray(filter.bool.must) && !filter.bool.must.every((s: any) => docMatchesFilter(s, doc))) return false;
    if (Array.isArray(filter.bool.must_not) && filter.bool.must_not.some((s: any) => docMatchesFilter(s, doc))) return false;
  }
  return true;
}

function scoreDocAgainstQuery(doc: any, query: unknown): number {
  const functions: any[] = (query as any)?.query?.function_score?.functions ?? [];
  let score = 1.0;
  for (const f of functions) {
    if (typeof f.weight === 'number') {
      if (f.filter && !docMatchesFilter(f.filter, doc)) continue;
      score *= f.weight;
    } else if (f.gauss) {
      score *= 1.0; // popularity decay: studentsSelected is 0 for all fixtures => decay == 1.0
    }
  }
  return score;
}

function expectedWindowFor(offset: number): Set<string> {
  return new Set([-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => String(offset + d)));
}

// --- Group A: inner util contract (src/utils/getTimezoneOffset.ts) -----------------------

(function testInnerUtilReturnsZeroForYearRoundUtc0Zones() {
  const zones = [
    'Atlantic/Reykjavik', 'Africa/Accra', 'Africa/Monrovia', 'America/Danmarkshavn',
    'Africa/Abidjan', 'Africa/Sao_Tome', 'Africa/Bissau',
  ];
  for (const z of zones) {
    const v = innerGetTimezoneOffset(z);
    assert(v !== null, `inner: year-round UTC+0 zone ${z} returns non-null`);
    assert(isZeroOffset(v), `inner: ${z} returns zero offset (got ${String(v)})`);
  }
})();

(function testInnerUtilReturnsZeroForUtc0Literals() {
  for (const z of ['GMT', 'UTC', 'Etc/UTC']) {
    const v = innerGetTimezoneOffset(z);
    assert(v !== null, `inner: literal ${z} returns non-null`);
    assert(isZeroOffset(v), `inner: ${z} returns zero offset (got ${String(v)})`);
  }
})();

(function testInnerUtilReturnsInvertedNonZeroForKnownZones() {
  // The codebase uses an inverted convention: real UTC+x is reported as -x.
  const cases: Array<[string, number]> = [
    ['Asia/Bangkok', -7],
    ['Asia/Ho_Chi_Minh', -7],
    ['Asia/Jakarta', -7],
    ['Africa/Lagos', -1],
    ['America/Phoenix', 7], // UTC-7 year-round (no DST) => +7
  ];
  for (const [z, expected] of cases) {
    assertEqual(innerGetTimezoneOffset(z), expected, `inner: ${z} returns inverted ${expected}`);
  }
})();

(function testInnerUtilReturnsNullForUnrecognizedZone() {
  assertEqual(innerGetTimezoneOffset('Bogus/Zone'), null, 'inner: unrecognized zone returns null sentinel');
})();

(function testInnerUtilRoutesOldStyleStringsThroughItsMap() {
  // 'America - Pacific' is mapped to America/Los_Angeles by the inner util, so it must
  // resolve to a real (non-null) offset rather than falling through to a dict/default.
  assert(innerGetTimezoneOffset('America - Pacific') !== null, 'inner: legacy string resolves via inner map (non-null)');
})();

// --- Group B: index side via projectToElasticEntry (ElasticEntry.ts) ---------------------

(function testIndexUtc0MentorIndexedAtZero() {
  const zones = ['Atlantic/Reykjavik', 'Africa/Accra', 'GMT', 'UTC', 'Etc/UTC'];
  for (const z of zones) {
    const entry = projectToElasticEntry(makeProjectWithMentorTimezone('p-' + z, z));
    assert(!!entry, `index: ${z} produces a non-null entry`);
    assert(isZeroOffset(entry?.timezoneOffset), `index: ${z} mentor indexed at 0, not -7 (got ${String(entry?.timezoneOffset)})`);
    assert(entry?.timezoneOffset !== -7, `index: ${z} NOT collapsed to -7`);
  }
})();

(function testIndexRealUtc7MentorIndexedAtNegative7() {
  const entry = projectToElasticEntry(makeProjectWithMentorTimezone('p-bkk', 'Asia/Bangkok'));
  assertEqual(entry?.timezoneOffset, -7, 'index: real UTC+7 mentor (Asia/Bangkok) stays at -7 (no regression)');
})();

(function testIndexRealUtc1MentorIndexedAtNegative1() {
  const entry = projectToElasticEntry(makeProjectWithMentorTimezone('p-lagos', 'Africa/Lagos'));
  assertEqual(entry?.timezoneOffset, -1, 'index: real UTC+1 mentor (Africa/Lagos) indexed at -1 (no regression)');
})();

(function testIndexRealUtcMinus7MentorIndexedAtPositive7() {
  const entry = projectToElasticEntry(makeProjectWithMentorTimezone('p-phx', 'America/Phoenix'));
  assertEqual(entry?.timezoneOffset, 7, 'index: real UTC-7 mentor (America/Phoenix) indexed at 7 (no regression)');
})();

(function testIndexMissingTimezoneFallsBackToNegative7() {
  const entry = projectToElasticEntry(makeProjectWithMentorTimezone('p-none', undefined));
  assertEqual(entry?.timezoneOffset, -7, 'index: missing timezone still falls back to -7 (guard unchanged)');
})();

(function testIndexUnrecognizedZoneFallsBackToNegative7() {
  const entry = projectToElasticEntry(makeProjectWithMentorTimezone('p-bogus', 'Bogus/Zone'));
  assertEqual(
    entry?.timezoneOffset,
    -7,
    'index: unrecognized IANA zone falls through inner(null) -> dict miss -> default -7 (null-sentinel honored)',
  );
})();

(function testIndexLegacyStringDictFallbackStillWorks() {
  // 'SGT' is unrecognized by the inner util (returns null) but present in the legacy
  // string dict, so the wrapper must return the dict value 8 via the fixed `?? -7` line.
  const entry = projectToElasticEntry(makeProjectWithMentorTimezone('p-sgt', 'SGT'));
  assertEqual(entry?.timezoneOffset, 8, 'index: legacy dict fallback (SGT -> 8) preserved by ?? -7');
})();

(function testIndexReturnsNullForProjectWithoutMentors() {
  const project = {
    id: 'p-nomentors', eventId: 'evt-1', status: 'ACCEPTED', track: Track.BEGINNER,
    affinePartnerId: null, mentors: [], tags: [], projectPreferences: [],
  } as unknown as ElasticProjectInput;
  assertEqual(projectToElasticEntry(project), null, 'index: project with no mentors returns null (guard unchanged)');
})();

// --- Group C: query side — timezone boost window via getProjectMatches end-to-end ----------

function installCapturingElastic(): { getQuery: () => unknown } {
  const store: { query: unknown } = { query: null };
  const fakeElastic = {
    search: async (params: any) => {
      store.query = params.body;
      return { body: { hits: { hits: [{ _id: 'p1', _score: 1 }, { _id: 'p2', _score: 0.5 }] } } };
    },
  };
  const fakePrisma = { project: { findMany: async () => [{ id: 'p1' }, { id: 'p2' }] } };
  Container.set(Client, fakeElastic as unknown as Client);
  Container.set(PrismaClient, fakePrisma as unknown as InstanceType<typeof PrismaClient>);
  return { getQuery: () => store.query };
}

async function assertBoostWindow(
  studentTimezone: string | null,
  expected: Set<string>,
  message: string,
): Promise<void> {
  const { getQuery } = installCapturingElastic();
  await getProjectMatches(makeStudent(studentTimezone) as unknown as Student, []);
  const tz = extractTimezoneFunction(getQuery());
  assert(!!tz, `query: timezone function present in generated query (${message})`);
  if (!tz) return;
  assertEqual(Array.from(tz.window).sort(), Array.from(expected).sort(), message);
}

async function testQueryUtc0StudentUsesZeroCenteredWindow(): Promise<void> {
  await assertBoostWindow(
    'Atlantic/Reykjavik',
    expectedWindowFor(0),
    'query: UTC+0 student (Atlantic/Reykjavik) boost window centered on 0 [-4..4]',
  );
}

async function testQueryUtc0LiteralStudentUsesZeroCenteredWindow(): Promise<void> {
  await assertBoostWindow(
    'UTC',
    expectedWindowFor(0),
    'query: UTC+0 literal student (UTC) boost window centered on 0 (|| -7 would give -7)',
  );
}

async function testQueryRealUtc7StudentWindowUnchanged(): Promise<void> {
  await assertBoostWindow(
    'Asia/Bangkok',
    expectedWindowFor(-7),
    'query: real UTC+7 student (Asia/Bangkok) window centered on -7 (no regression)',
  );
}

async function testQueryRealUtc1StudentWindowUnchanged(): Promise<void> {
  await assertBoostWindow(
    'Africa/Lagos',
    expectedWindowFor(-1),
    'query: real UTC+1 student (Africa/Lagos) window centered on -1 (no regression)',
  );
}

async function testQueryUnrecognizedStudentTimezoneDefaultsToNegative7(): Promise<void> {
  // The fix must NOT pass the null sentinel through; `null ?? -7` -> -7 for genuinely
  // unrecognized zones. This is the complement that distinguishes the fix from a naive
  // "always trust inner" change.
  await assertBoostWindow(
    'Bogus/Zone',
    expectedWindowFor(-7),
    'query: unrecognized student timezone defaults to -7 via ?? (null sentinel still honored)',
  );
}

async function testQueryMissingStudentTimezoneDefaultsToNegative7(): Promise<void> {
  await assertBoostWindow(
    null,
    expectedWindowFor(-7),
    'query: no student timezone -> getTimezone falls back to -7 (guard unchanged)',
  );
}

// --- Group D: end-to-end ranking inversion (index + query together) ---------------------

// Two otherwise-equal mentors that differ only in real timezone. Built via the real
// indexing path (projectToElasticEntry), scored by a fake Elasticsearch that evaluates
// the real generated function_score query, then ranked by getProjectMatches. With the
// fix, the timezone window is centered on the student's TRUE offset, so the mentor
// genuinely within +/-4h earns the 15x TIMEZONE_MATCH boost and ranks first. With the
// bug, the UTC+0 student's window shifts to [-11..-3] (real UTC[+3..+11]) and inverts.
async function rankTwoMentorsForStudent(
  studentTimezone: string,
  mentorA: { id: string; tz: string },
  mentorB: { id: string; tz: string },
): Promise<string[]> {
  const entryA = projectToElasticEntry(makeProjectWithMentorTimezone(mentorA.id, mentorA.tz))!;
  const entryB = projectToElasticEntry(makeProjectWithMentorTimezone(mentorB.id, mentorB.tz))!;
  const corpus: any[] = [entryA, entryB];
  const projectsById: Record<string, { id: string }> = { [mentorA.id]: { id: mentorA.id }, [mentorB.id]: { id: mentorB.id } };
  const store: { query: unknown } = { query: null };
  const fakeElastic = {
    search: async (params: any) => {
      store.query = params.body;
      const scored = corpus.map((doc) => ({
        _id: doc.id,
        _score: scoreDocAgainstQuery(doc, store.query),
      }));
      scored.sort((a, b) => (b._score > a._score ? 1 : b._score < a._score ? -1 : 0));
      return { body: { hits: { hits: scored } } };
    },
  };
  const fakePrisma = {
    project: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => projectsById[id]).filter(Boolean) },
  };
  Container.set(Client, fakeElastic as unknown as Client);
  Container.set(PrismaClient, fakePrisma as unknown as InstanceType<typeof PrismaClient>);
  const matches = await getProjectMatches(makeStudent(studentTimezone) as unknown as Student, []);
  return matches.map((m) => m.project.id);
}

async function testUtc0StudentRanksUtcPlus1MentorAboveUtcPlus7Mentor(): Promise<void> {
  // Real UTC+1 mentor (Africa/Lagos, indexed -1) vs real UTC+7 mentor (Asia/Bangkok,
  // indexed -7) for a UTC+0 student. Fix: student offset 0 -> window [-4..4] -> the
  // UTC+1 mentor is within +/-4h and earns 15x. Bug: student offset -7 -> window
  // [-11..-3] -> the UTC+7 mentor "earns" 15x and the order inverts.
  const order = await rankTwoMentorsForStudent('Atlantic/Reykjavik',
    { id: 'mentor-utc1', tz: 'Africa/Lagos' },
    { id: 'mentor-utc7', tz: 'Asia/Bangkok' });
  assertEqual(order, ['mentor-utc1', 'mentor-utc7'],
    'e2e: UTC+0 student ranks real UTC+1 mentor above real UTC+7 mentor (inversion fixed)');
}

async function testUtc7StudentRanksUtcPlus7MentorAboveUtcPlus1Mentor(): Promise<void> {
  // Non-regression: a real UTC+7 student should rank the real UTC+7 mentor above the
  // real UTC+1 mentor (6h apart, outside +/-4h). Both the buggy and fixed code agree
  // here (-7 is truthy), so this pins correct behavior for non-UTC+0 students.
  const order = await rankTwoMentorsForStudent('Asia/Bangkok',
    { id: 'mentor-utc1', tz: 'Africa/Lagos' },
    { id: 'mentor-utc7', tz: 'Asia/Bangkok' });
  assertEqual(order, ['mentor-utc7', 'mentor-utc1'],
    'e2e: UTC+7 student ranks real UTC+7 mentor above real UTC+1 mentor (no regression)');
}

async function testTimezoneWeightIsDominant(): Promise<void> {
  // Pin the structural claim that justifies treating the inversion as material:
  // TIMEZONE_MATCH (15) is the largest weight in the generated query.
  const { getQuery } = installCapturingElastic();
  await getProjectMatches(makeStudent('Atlantic/Reykjavik') as unknown as Student, []);
  const tz = extractTimezoneFunction(getQuery());
  assert(!!tz, 'e2e: timezone weight function emitted');
  assert(tz?.weight === 15, `e2e: TIMEZONE_MATCH weight is 15 (got ${tz?.weight})`);
  assert(ELASTIC_NULL === '__ELASTIC_NULL', 'e2e: ELASTIC_NULL sentinel unchanged');
}

// --- Runner ------------------------------------------------------------------------------

async function main(): Promise<void> {
  await testQueryUtc0StudentUsesZeroCenteredWindow();
  await testQueryUtc0LiteralStudentUsesZeroCenteredWindow();
  await testQueryRealUtc7StudentWindowUnchanged();
  await testQueryRealUtc1StudentWindowUnchanged();
  await testQueryUnrecognizedStudentTimezoneDefaultsToNegative7();
  await testQueryMissingStudentTimezoneDefaultsToNegative7();
  await testUtc0StudentRanksUtcPlus1MentorAboveUtcPlus7Mentor();
  await testUtc7StudentRanksUtcPlus7MentorAboveUtcPlus1Mentor();
  await testTimezoneWeightIsDominant();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
