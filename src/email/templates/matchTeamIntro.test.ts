/**
 * Offline unit tests for matchTeamIntro email template generation. Verifies that the
 * "Suggested Meeting Times (all students available)" block (commonTimeslots) is correctly
 * computed from students' timeManagementPlan data, and that the luxon DateTime.fromObject
 * call in localIntervalToUtc no longer throws InvalidUnitError.
 *
 * These tests exercise the real getList() public API with a stubbed Prisma client, so they
 * cover the actual localIntervalToUtc / findCommonTimeslots code path in matchTeamIntro.ts.
 *
 * Run with:
 *   npx tsx src/email/templates/matchTeamIntro.test.ts
 */
import 'reflect-metadata';
import { MentorStatus, StudentStatus } from '@prisma/client';
import { ProjectStatus } from '../../enums';
import Handlebars from 'handlebars';
import { getList } from './matchTeamIntro';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAILED: ${message}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

// JSON.stringify with object keys sorted recursively, so object key order (which is
// semantically insignificant) does not cause spurious failures. Array order is preserved.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = stableStringify(actual);
  const e = stableStringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

type Interval = { start: number; end: number };
type TimeManagementPlan = Record<string, Interval[]>;

interface StudentStub {
  timezone?: string;
  timeManagementPlan?: TimeManagementPlan;
  status: StudentStatus;
  email: string;
  givenName: string;
  surname: string;
}

function student(overrides: Partial<StudentStub> = {}): StudentStub {
  return {
    status: StudentStatus.ACCEPTED,
    email: 'student@example.com',
    givenName: 'Student',
    surname: 'One',
    ...overrides,
  };
}

function mentor(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    status: MentorStatus.ACCEPTED,
    email: 'mentor@example.com',
    givenName: 'Mentor',
    surname: 'One',
    ...overrides,
  };
}

function project(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'project-1',
    eventId: 'event-1',
    status: ProjectStatus.MATCHED,
    students: [] as StudentStub[],
    mentors: [] as Record<string, unknown>[],
    issueUrl: 'https://example.com/issue/1',
    description: 'A project',
    deliverables: 'Some deliverables',
    ...overrides,
  };
}

// A Prisma stub: project.findMany resolves to a fixed list of projects. No DB needed.
function fakePrisma(projects: Record<string, unknown>[]): { project: { findMany: () => Promise<Record<string, unknown>[]> } } {
  return {
    project: {
      findMany: async () => projects,
    },
  };
}

const EVENT = {
  id: 'event-1',
  name: 'Test Event',
  emailSignature: '',
  title: 'Test',
  startsAt: new Date('2024-01-01T00:00:00Z'),
  defaultWeeks: 8,
};

// Minutes-since-midnight helpers for readability.
function mins(h: number, m = 0): number {
  return h * 60 + m;
}

// --- Regression: the original bug -----------------------------------------------------------
// Before the fix, the very first localIntervalToUtc call threw InvalidUnitError, which the
// try/catch in findCommonTimeslots swallowed and returned {}, so getList collapsed
// commonTimeslots to undefined and the email rendered the When2meet {{else}} branch even
// though students supplied fully overlapping availability.
async function testOverlappingSameTimezoneProducesCommonTimeslots(): Promise<void> {
  const plan: TimeManagementPlan = { tuesday: [{ start: mins(9), end: mins(10) }] };
  const projects = [
    project({
      students: [
        student({ email: 'a@example.com', givenName: 'A', surname: 'One', timezone: 'America/New_York', timeManagementPlan: plan }),
        student({ email: 'b@example.com', givenName: 'B', surname: 'Two', timezone: 'America/New_York', timeManagementPlan: plan }),
      ],
      mentors: [mentor()],
    }),
  ];

  const result = await getList(fakePrisma(projects) as any, EVENT as any);
  assertEqual(result.length, 1, 'One email context per project');
  const ctx = result[0] as { project: unknown; commonTimeslots?: Record<string, Record<string, string[]>> };
  assert(ctx.commonTimeslots !== undefined, 'commonTimeslots is populated (not the bug-masked undefined)');
  assertEqual(
    ctx.commonTimeslots,
    { tuesday: { 'America/New_York': ['9:00 AM - 10:00 AM'] } },
    'Overlapping same-timezone availability renders a single NY-formatted timeslot on Tuesday',
  );
}

// --- Cross-timezone overlap proves the UTC conversion is actually correct --------------------
// NY 9-11am EST and LA 6-8am PST both map to 14:00-16:00 UTC; the overlap must be rendered in
// each student's own timezone. This is the case the bug report highlights: students supplied
// data, a real overlap exists, and the template was written to render it.
async function testOverlappingAcrossTimezonesRendersInEachTimezone(): Promise<void> {
  const nyPlan: TimeManagementPlan = { tuesday: [{ start: mins(9), end: mins(11) }] };
  const laPlan: TimeManagementPlan = { tuesday: [{ start: mins(6), end: mins(8) }] };
  const projects = [
    project({
      students: [
        student({ email: 'a@example.com', givenName: 'A', surname: 'One', timezone: 'America/New_York', timeManagementPlan: nyPlan }),
        student({ email: 'b@example.com', givenName: 'B', surname: 'Two', timezone: 'America/Los_Angeles', timeManagementPlan: laPlan }),
      ],
      mentors: [mentor()],
    }),
  ];

  const result = await getList(fakePrisma(projects) as any, EVENT as any);
  const ctx = result[0] as { commonTimeslots?: Record<string, Record<string, string[]>> };
  assert(ctx.commonTimeslots !== undefined, 'Cross-timezone overlap is detected (not swallowed by a thrown error)');
  assertEqual(
    ctx.commonTimeslots,
    {
      tuesday: {
        'America/Los_Angeles': ['6:00 AM - 8:00 AM'],
        'America/New_York': ['9:00 AM - 11:00 AM'],
      },
    },
    'The 14:00-16:00 UTC overlap is rendered in each student local timezone',
  );
}

// --- No console.warn should be emitted when students supplied real data ---------------------
// Before the fix, findCommonTimeslots logged `Error occurred while finding common timeslots:
// InvalidUnitError - Invalid unit zone` and returned {}. After the fix, no warning is emitted
// for valid data. Guards against the silent try/catch masking returning.
async function testNoSwallowedErrorWhenDataSupplied(): Promise<void> {
  const plan: TimeManagementPlan = { tuesday: [{ start: mins(9), end: mins(10) }] };
  const projects = [
    project({
      students: [
        student({ email: 'a@example.com', givenName: 'A', surname: 'One', timezone: 'America/New_York', timeManagementPlan: plan }),
        student({ email: 'b@example.com', givenName: 'B', surname: 'Two', timezone: 'America/New_York', timeManagementPlan: plan }),
      ],
      mentors: [mentor()],
    }),
  ];

  let warned = false;
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0]).includes('finding common timeslots')) warned = true;
    originalWarn.apply(console, args as never);
  };
  try {
    await getList(fakePrisma(projects) as any, EVENT as any);
  } finally {
    console.warn = originalWarn;
  }
  assert(!warned, 'No "Error occurred while finding common timeslots" warning is emitted when students supplied valid overlapping data');
}

// --- Legitimate empty result: students supplied no availability data -------------------------
// When students have a timezone but no timeManagementPlan, findCommonTimeslots legitimately
// returns {} without ever calling localIntervalToUtc. getList must collapse that to undefined
// so the {{else}} When2meet branch renders. This is the correct behavior, NOT the bug.
async function testNoAvailabilityDataYieldsUndefined(): Promise<void> {
  const projects = [
    project({
      students: [
        student({ email: 'a@example.com', givenName: 'A', surname: 'One', timezone: 'America/New_York', timeManagementPlan: undefined }),
        student({ email: 'b@example.com', givenName: 'B', surname: 'Two', timezone: 'America/New_York', timeManagementPlan: undefined }),
      ],
      mentors: [mentor()],
    }),
  ];

  const result = await getList(fakePrisma(projects) as any, EVENT as any);
  const ctx = result[0] as { commonTimeslots?: unknown };
  assert(ctx.commonTimeslots === undefined, 'No timeManagementPlan data legitimately yields commonTimeslots undefined (When2meet branch)');
}

// --- End-to-end: the actual Handlebars block from matchTeamIntro.md -------------------------
// Verifies the template's {{#if commonTimeslots}} / {{else}} branch renders the "Suggested
// Meeting Times" block (and NOT the When2meet fallback) when students supplied data, and the
// When2meet fallback (and NOT the timeslot block) when they did not. This is the user-visible
// behavior the bug report says was silently broken.
const TIMESLOT_BLOCK = `{{#if commonTimeslots}}
**Suggested Meeting Times (all students available):**
{{#each commonTimeslots}}
  - {{@key}}: {{#each this}}{{#each this}}{{this}} ({{@../key}}){{#unless @last}} || {{/unless}}{{/each}}{{/each}}
{{/each}}
{{else}}
- **Mentors:** Send a [When2meet](https://www.when2meet.com/) for recurring meeting availability
{{/if}}`;

const timeslotTemplate = Handlebars.compile(TIMESLOT_BLOCK);

async function testTemplateRendersSuggestedTimesWhenDataSupplied(): Promise<void> {
  const nyPlan: TimeManagementPlan = { tuesday: [{ start: mins(9), end: mins(11) }] };
  const laPlan: TimeManagementPlan = { tuesday: [{ start: mins(6), end: mins(8) }] };
  const projects = [
    project({
      students: [
        student({ email: 'a@example.com', givenName: 'A', surname: 'One', timezone: 'America/New_York', timeManagementPlan: nyPlan }),
        student({ email: 'b@example.com', givenName: 'B', surname: 'Two', timezone: 'America/Los_Angeles', timeManagementPlan: laPlan }),
      ],
      mentors: [mentor()],
    }),
  ];

  const result = await getList(fakePrisma(projects) as any, EVENT as any);
  const rendered = timeslotTemplate(result[0] as any);
  assert(
    rendered.includes('**Suggested Meeting Times (all students available):**'),
    'Template renders the "Suggested Meeting Times" header when students supplied overlapping availability',
  );
  assert(
    rendered.includes('9:00 AM - 11:00 AM (America/New_York)'),
    'Template renders the NY-formatted overlap window labeled with its timezone',
  );
  assert(
    rendered.includes('6:00 AM - 8:00 AM (America/Los_Angeles)'),
    'Template renders the LA-formatted overlap window labeled with its timezone',
  );
  assert(
    !rendered.includes('When2meet'),
    'Template does NOT render the When2meet fallback when students supplied overlapping availability',
  );
}

async function testTemplateRendersWhen2meetFallbackWhenNoData(): Promise<void> {
  const projects = [
    project({
      students: [
        student({ email: 'a@example.com', givenName: 'A', surname: 'One', timezone: 'America/New_York', timeManagementPlan: undefined }),
        student({ email: 'b@example.com', givenName: 'B', surname: 'Two', timezone: 'America/New_York', timeManagementPlan: undefined }),
      ],
      mentors: [mentor()],
    }),
  ];

  const result = await getList(fakePrisma(projects) as any, EVENT as any);
  const rendered = timeslotTemplate(result[0] as any);
  assert(
    rendered.includes('Send a [When2meet]'),
    'Template renders the When2meet fallback when students supplied no availability data',
  );
  assert(
    !rendered.includes('Suggested Meeting Times'),
    'Template does NOT render the "Suggested Meeting Times" block when there is no availability data',
  );
}

async function main(): Promise<void> {
  await testOverlappingSameTimezoneProducesCommonTimeslots();
  await testOverlappingAcrossTimezonesRendersInEachTimezone();
  await testNoSwallowedErrorWhenDataSupplied();
  await testNoAvailabilityDataYieldsUndefined();
  await testTemplateRendersSuggestedTimesWhenDataSupplied();
  await testTemplateRendersWhen2meetFallbackWhenNoData();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
