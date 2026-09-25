/**
 * Offline unit tests for StatsResolver's prCount rounding consistency.
 *
 * Regression guard for the bug where `statOutcomes` (global) and
 * `statOutcomesByYear` (per-year breakdown) rounded the same `StatOutcomes.prCount`
 * field at different aggregation boundaries. The global endpoint rounded the
 * whole aggregate once (`Math.round(sum(f_i))`); the per-year endpoint rounded
 * each year independently and left callers to sum (`sum(Math.round(f_i))`).
 * Because the pre-2025 estimator `PRE_2025_PR_RATE = 0.71` is fractional, these
 * two strategies disagree once pre-2025 events span >=2 year-groups, so the two
 * views of prCount could differ.
 *
 * The fix makes both endpoints round at the SAME (per-year-group) boundary: the
 * global value is now `sum(Math.round(f_i))`, definitionally equal to the sum of
 * the per-year values. Both endpoints share a single `projectsByYearQuery()` so
 * the rounding boundary cannot drift apart again — this is the structural
 * invariant the last test guards.
 *
 * No live DB. The PrismaClient is stubbed: `student/mentor/project.count` return
 * scalars and `$queryRaw` dispatches on the SQL text to one of the per-year
 * GROUP BY result sets or the global scalar sets. The private `compute*`
 * methods are invoked directly (via `any`) to bypass the 1-hour `ttlCache`
 * wrapper so each test recomputes from the configured data.
 *
 * Run with (ts-node, not tsx — type-graphql decorators require emitDecoratorMetadata
 * which esbuild-based tsx strips; ts-node honors tsconfig's emitDecoratorMetadata):
 *   npx ts-node --transpile-only src/resolvers/Stats.test.ts
 *
 * Preconditions:
 *   - `src/config.ts` (pulled in transitively via Stats -> context -> config)
 *     throws at import time unless its required env vars are set, so
 *     ensureTestEnv() seeds them BEFORE `./Stats` is require()'d.
 *   - typedi's Container is given the stub prisma so the @Inject(() => PrismaClient)
 *     path also sees it; `resolver.prisma` is additionally assigned directly.
 */
import 'reflect-metadata';
import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';

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

// config.ts (loaded transitively through Stats) throws at import time unless
// these are present. Includes the vars that postdate tests/setupEnv.ts:
// LINEAR_BLOCKING_LABEL_ID, GITHUB_TOKEN, OPENROUTER_API_KEY.
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
    LINEAR_BLOCKING_LABEL_ID: 'test',
    METRICS_KEY: 'test',
    PLACID_API_TOKEN: 'test',
    ATTIO_API_TOKEN: 'test',
    ATTIO_ALUMNI_LIST: 'test',
    GITHUB_TOKEN: 'test',
    OPENROUTER_API_KEY: 'test',
  };
  for (const [k, v] of Object.entries(defaults)) {
    process.env[k] = process.env[k] || v;
  }
}

interface ProjectsByYearRow { year: number; projectCount: number; prCount: number }
interface StudentsByYearRow { year: number; studentCount: number; studentHours: number }
interface MentorsByYearRow { year: number; volunteerCount: number; volunteerHours: number }

interface YearStatOutcomesLike {
  year: number;
  statOutcomes: {
    studentCount: number;
    volunteerCount: number;
    projectCount: number;
    prCount: number;
    studentHours: number;
    volunteerHours: number;
    hours: number;
  };
}

interface TestData {
  studentsByYear: StudentsByYearRow[];
  mentorsByYear: MentorsByYearRow[];
  projectsByYear: ProjectsByYearRow[];
  // Global (no GROUP BY) scalar sums. For integer-valued fields these equal the
  // sum of the per-year rows so that the global/per-year consistency assertion
  // is a real regression guard and not a tautology over the stub.
  globalStudentHours: number;
  globalVolunteerHours: number;
}

function buildFakePrisma(data: TestData): any {
  const totalStudentCount = data.studentsByYear.reduce((a, r) => a + r.studentCount, 0);
  const totalVolunteerCount = data.mentorsByYear.reduce((a, r) => a + r.volunteerCount, 0);
  const totalProjectCount = data.projectsByYear.reduce((a, r) => a + r.projectCount, 0);

  const clone = <T>(xs: T[]): T[] => xs.map((x) => ({ ...x }));

  return {
    student: {
      count: async () => totalStudentCount,
    },
    mentor: {
      count: async () => totalVolunteerCount,
    },
    project: {
      count: async () => totalProjectCount,
    },
    $queryRaw: async (strings: TemplateStringsArray, ..._values: any[]): Promise<any[]> => {
      const sql = strings.join('');
      if (sql.includes('"prCount"')) {
        return clone(data.projectsByYear);
      }
      if (sql.includes('"studentHours"')) {
        return sql.includes('group by')
          ? clone(data.studentsByYear)
          : [{ studentHours: data.globalStudentHours }];
      }
      if (sql.includes('"volunteerHours"')) {
        return sql.includes('group by')
          ? clone(data.mentorsByYear)
          : [{ volunteerHours: data.globalVolunteerHours }];
      }
      return [];
    },
  };
}

let StatsModule: any;

function makeResolver(data: TestData): any {
  const fakePrisma = buildFakePrisma(data);
  Container.set(PrismaClient, fakePrisma);
  if (!StatsModule) StatsModule = require('./Stats');
  const resolver = new StatsModule.StatsResolver();
  (resolver as any).prisma = fakePrisma;
  return resolver;
}

function sumPrCountByYear(byYear: { statOutcomes: { prCount: number } }[]): number {
  return byYear.reduce((acc, y) => acc + y.statOutcomes.prCount, 0);
}

async function assertConsistent(data: TestData, label: string): Promise<void> {
  const resolver = makeResolver(data);

  const global = await (resolver as any).computeStatOutcomes();
  const byYear = await (resolver as any).computeStatOutcomesByYear();

  assert(Number.isInteger(global.prCount), `${label}: global prCount is an integer`);
  for (const y of byYear) {
    assert(Number.isInteger(y.statOutcomes.prCount), `${label}: by-year ${y.year} prCount is an integer`);
  }

  const summed = sumPrCountByYear(byYear);
  assertEqual(
    global.prCount,
    summed,
    `${label}: global.prCount === sum of per-year prCount (round boundary consistent)`,
  );
}

async function testTwoPre2025YearsOneProjectEach(): Promise<void> {
  // The headline bug: round(0.71)+round(0.71)=2 but round(1.42)=1. The global
  // endpoint must use per-year rounding (sum of rounded) so it equals the sum
  // of the per-year breakdown.
  await assertConsistent(
    {
      studentsByYear: [],
      mentorsByYear: [],
      projectsByYear: [
        { year: 2022, projectCount: 1, prCount: 0.71 },
        { year: 2023, projectCount: 1, prCount: 0.71 },
      ],
      globalStudentHours: 0,
      globalVolunteerHours: 0,
    },
    'two pre-2025 years, 1 project each',
  );

  // Document the mathematical origin: the two rounding strategies genuinely
  // differ for the fractional estimator, which is why the bug was real.
  assert(
    Math.round(0.71 + 0.71) !== Math.round(0.71) + Math.round(0.71),
    'round(sum) != sum(round) for the fractional estimator (the bug exists mathematically)',
  );

  const resolver = makeResolver({
    studentsByYear: [],
    mentorsByYear: [],
    projectsByYear: [
      { year: 2022, projectCount: 1, prCount: 0.71 },
      { year: 2023, projectCount: 1, prCount: 0.71 },
    ],
    globalStudentHours: 0,
    globalVolunteerHours: 0,
  });
  const global = await (resolver as any).computeStatOutcomes();
  assertEqual(global.prCount, 2, 'headline case: global prCount is 2 (sum of per-year), not 1 (aggregate)');
}

async function testNoMatchedProjects(): Promise<void> {
  // Guards the new reduce-based shared-query path against the empty GROUP BY
  // result: both prCount views are 0 and neither endpoint crashes. The global
  // computation is now `projectsByYear.reduce(..., 0)` over `[]`, which yields 0
  // rather than indexing a missing row.
  await assertConsistent(
    {
      studentsByYear: [{ year: 2025, studentCount: 3, studentHours: 18 }],
      mentorsByYear: [{ year: 2025, volunteerCount: 2, volunteerHours: 4 }],
      projectsByYear: [],
      globalStudentHours: 18,
      globalVolunteerHours: 4,
    },
    'no matched projects',
  );

  const resolver = makeResolver({
    studentsByYear: [{ year: 2025, studentCount: 3, studentHours: 18 }],
    mentorsByYear: [{ year: 2025, volunteerCount: 2, volunteerHours: 4 }],
    projectsByYear: [],
    globalStudentHours: 18,
    globalVolunteerHours: 4,
  });
  const global = await (resolver as any).computeStatOutcomes();
  const byYear = await (resolver as any).computeStatOutcomesByYear();
  assertEqual(global.prCount, 0, 'no matched projects: global prCount is 0');
  assertEqual(sumPrCountByYear(byYear), 0, 'no matched projects: sum of per-year prCount is 0');
}

async function testIntegerFieldsAlsoReconcile(): Promise<void> {
  // General invariant: every StatOutcomes field on the global view equals the
  // sum of the per-year view. prCount is the only fractional field (the bug),
  // but this guards the whole class so a future change cannot quietly introduce
  // the same rounding-boundary mismatch in any other field.
  const data: TestData = {
    studentsByYear: [
      { year: 2022, studentCount: 4, studentHours: 184 },
      { year: 2024, studentCount: 6, studentHours: 276 },
    ],
    mentorsByYear: [
      { year: 2022, volunteerCount: 2, volunteerHours: 8 },
      { year: 2024, volunteerCount: 3, volunteerHours: 12 },
    ],
    projectsByYear: [
      { year: 2022, projectCount: 3, prCount: 2.13 },
      { year: 2024, projectCount: 4, prCount: 2.84 },
    ],
    globalStudentHours: 460,
    globalVolunteerHours: 20,
  };
  const resolver = makeResolver(data);
  const global = await (resolver as any).computeStatOutcomes();
  const byYear: YearStatOutcomesLike[] = await (resolver as any).computeStatOutcomesByYear();

  const sumStudentCount = byYear.reduce((a, y) => a + y.statOutcomes.studentCount, 0);
  const sumVolunteerCount = byYear.reduce((a, y) => a + y.statOutcomes.volunteerCount, 0);
  const sumProjectCount = byYear.reduce((a, y) => a + y.statOutcomes.projectCount, 0);
  const sumStudentHours = byYear.reduce((a, y) => a + y.statOutcomes.studentHours, 0);
  const sumVolunteerHours = byYear.reduce((a, y) => a + y.statOutcomes.volunteerHours, 0);
  const sumHours = byYear.reduce((a, y) => a + y.statOutcomes.hours, 0);

  assertEqual(global.studentCount, sumStudentCount, 'integer fields: global studentCount === sum per-year');
  assertEqual(global.volunteerCount, sumVolunteerCount, 'integer fields: global volunteerCount === sum per-year');
  assertEqual(global.projectCount, sumProjectCount, 'integer fields: global projectCount === sum per-year');
  assertEqual(global.studentHours, sumStudentHours, 'integer fields: global studentHours === sum per-year');
  assertEqual(global.volunteerHours, sumVolunteerHours, 'integer fields: global volunteerHours === sum per-year');
  assertEqual(global.hours, global.studentHours + global.volunteerHours, 'global hours === studentHours + volunteerHours');
  assertEqual(global.hours, sumHours, 'integer fields: global hours === sum per-year hours');

  for (const y of byYear) {
    assertEqual(
      y.statOutcomes.hours,
      y.statOutcomes.studentHours + y.statOutcomes.volunteerHours,
      `by-year ${y.year}: hours === studentHours + volunteerHours`,
    );
  }

  // And the prCount consistency still holds with non-empty other fields.
  assertEqual(
    global.prCount,
    byYear.reduce((a, y) => a + y.statOutcomes.prCount, 0),
    'populated case: global prCount === sum per-year prCount',
  );
}

async function testSharedQueryMeansNoDrift(): Promise<void> {
  // Structural guarantee: both endpoints route the projects/prCount query
  // through the same projectsByYearQuery(), so the two rounding boundaries
  // cannot drift apart again. Counts prCount-shaped $queryRaw calls: each
  // compute path that needs prCount data hits the same single shared query
  // (no second, separate, global-aggregate prCount SQL).
  let prCountCalls = 0;
  const base = buildFakePrisma({
    studentsByYear: [],
    mentorsByYear: [],
    projectsByYear: [{ year: 2022, projectCount: 1, prCount: 0.71 }],
    globalStudentHours: 0,
    globalVolunteerHours: 0,
  });
  const fakePrisma: any = {
    ...base,
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]): Promise<any[]> => {
      if (strings.join('').includes('"prCount"')) prCountCalls += 1;
      return base.$queryRaw(strings, ...values);
    },
  };
  Container.set(PrismaClient, fakePrisma);
  if (!StatsModule) StatsModule = require('./Stats');
  const resolver = new StatsModule.StatsResolver();
  (resolver as any).prisma = fakePrisma;

  await (resolver as any).computeStatOutcomes();
  assertEqual(prCountCalls, 1, 'computeStatOutcomes issues exactly one prCount-shaped query (the shared one)');

  await (resolver as any).computeStatOutcomesByYear();
  assertEqual(prCountCalls, 2, 'computeStatOutcomesByYear issues exactly one prCount-shaped query (the shared one)');
}

async function main(): Promise<void> {
  ensureTestEnv();
  await testTwoPre2025YearsOneProjectEach();
  await testNoMatchedProjects();
  await testIntegerFieldsAlsoReconcile();
  await testSharedQueryMeansNoDrift();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

if (require.main === module) main();
