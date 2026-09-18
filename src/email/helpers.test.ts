/**
 * Offline tests for the `mentorManagers` Handlebars helper in `src/email/helpers.ts` and
 * its consumption by the team-intro email template.
 *
 * Why this file exists: `mentorManagers` used to stringify `null` `managerUsername` values,
 * producing the literal recipient `"null@codeday.org"` in the `matchTeamIntro.md` `cc:`
 * front-matter field. These tests exercise the helper through the exact production path
 * (the registered helper -> the real template -> the real `front-matter` parser) so the
 * fix is validated end-to-end as well as at the unit level.
 *
 * The test is self-contained: it stubs the env vars `src/config.ts` requires before
 * requiring `./helpers` (which imports `config` at module load). No `.env` file, DB, or
 * network is needed.
 *
 * Run with:
 *   npx tsx src/email/helpers.test.ts
 */
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import frontMatter from 'front-matter';

// `src/email/helpers.ts` imports `src/config.ts`, which throws at module load unless a
// list of env vars is set. Stub them BEFORE requiring `./helpers` so config loads cleanly.
// Use `if undefined` so a real env (e.g. from `cp .env.test.example .env`) is not clobbered.
const ENV_STUBS: Record<string, string> = {
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
for (const [k, v] of Object.entries(ENV_STUBS)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

// Require (not import) so this runs AFTER the env stubs above. `import` declarations are
// hoisted above the stub loop; `require()` is a plain call and runs in source order.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerHandlebarsHelpers }: typeof import('./helpers') = require('./helpers');

registerHandlebarsHelpers();

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

function assertDoesNotContain(haystack: string, needle: string, message: string): void {
  if (haystack.includes(needle)) {
    failures += 1;
    console.error(`FAILED: ${message}\n  "${needle}" unexpectedly found in:\n  ${JSON.stringify(haystack)}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

// A minimal mentor/project/event factory faithful to the real `matchTeamIntro` query
// result: mentors carry `managerUsername` (nullable), `email`, `givenName`, `surname`;
// the template also reads `project.{issueUrl,description,deliverables}` and `event.{name,
// emailSignature}`, plus `project.students` via `email`/`givenName`/`surname`.
type Fixture = { project: Record<string, unknown>; event: Record<string, unknown> };

function makeFixture(mentors: Array<Record<string, unknown>>): Fixture {
  return {
    project: {
      id: 'proj-test',
      issueUrl: 'https://example.com/issue/1',
      description: 'demo description',
      deliverables: 'demo deliverables',
      mentors,
      students: [{ id: 's1', email: 's1@x.com', givenName: 'S', surname: 'One' }],
    },
    event: { id: 'evt-1', name: 'CodeDay Labs Spring 2026', emailSignature: '-- CodeDay Labs' },
  };
}

// Render the helper in isolation (the same shape the template uses), against arbitrary
// mentor fixtures, returning the comma-joined result string.
function renderCc(mentors: Array<Record<string, unknown>>, suffix?: string): string {
  const ctx = { project: makeFixture(mentors).project };
  const suffixArg = suffix === undefined ? '' : `'${suffix}'`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpl = handlebars.compile<{ project: Record<string, unknown> }>(`{{join (mentorManagers project ${suffixArg}) ','}}`);
  return (tpl as (c: unknown) => string)(ctx).trim();
}

// Render the REAL team-intro template and return parsed front-matter (production path).
const TEAM_INTRO = fs.readFileSync(
  path.join(__dirname, 'templates', 'matchTeamIntro.md'),
  'utf-8',
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const teamIntroTpl = handlebars.compile<{ project: Record<string, unknown>; event: Record<string, unknown> }>(TEAM_INTRO);

function renderTeamIntroCc(mentors: Array<Record<string, unknown>>): string {
  const ctx: any = makeFixture(mentors);
  const { attributes } = (frontMatter as any)((teamIntroTpl as (c: unknown) => string)(ctx));
  return attributes.cc as string;
}

// --- Direct helper tests (through registered handlebars helper) -------------------------

(function testAllNullManagersProduceNoCc() {
  const cc = renderCc([
    { id: 'm1', managerUsername: null, email: 'm1@x.com', givenName: 'M', surname: 'One' },
    { id: 'm2', managerUsername: null, email: 'm2@x.com', givenName: 'M', surname: 'Two' },
  ], '@codeday.org');
  assertEqual(cc, '', 'All-null managerUsernames produce an empty cc string');
  assertDoesNotContain(cc, 'null@codeday.org', 'All-null case never emits null@codeday.org');
})();

(function testMixedNullAndAssignedManagers() {
  const cc = renderCc([
    { id: 'm3', managerUsername: 'alice', email: 'm3@x.com', givenName: 'M', surname: 'Three' },
    { id: 'm4', managerUsername: null, email: 'm4@x.com', givenName: 'M', surname: 'Four' },
  ], '@codeday.org');
  assertEqual(cc, 'alice@codeday.org', 'Mixed team keeps only the assigned manager (null dropped)');
  assertDoesNotContain(cc, 'null@codeday.org', 'Mixed team never emits null@codeday.org');
})();

(function testAllAssignedManagers() {
  const cc = renderCc([
    { id: 'm5', managerUsername: 'bob', email: 'm5@x.com', givenName: 'M', surname: 'Five' },
  ], '@codeday.org');
  assertEqual(cc, 'bob@codeday.org', 'All-assigned team emits the single correct address');
})();

(function testEmptyStringManagerUsernameIsDropped() {
  // An empty-string managerUsername is falsy and must be dropped just like null, so it
  // cannot produce "@codeday.org" (a bare domain) in the cc line.
  const cc = renderCc([
    { id: 'm10', managerUsername: '', email: 'm10@x.com', givenName: 'M', surname: 'Ten' },
    { id: 'm11', managerUsername: 'alice', email: 'm11@x.com', givenName: 'M', surname: 'Eleven' },
  ], '@codeday.org');
  assertEqual(cc, 'alice@codeday.org', 'Empty-string managerUsername is dropped, only the real one is kept');
  assertDoesNotContain(cc, '@codeday.org,alice', 'No bare-domain address is emitted for the empty username');
})();

// --- End-to-end tests through the real matchTeamIntro.md template + front-matter ---------

(function testRealTemplateAllNullManagersCcEmpty() {
  const cc = renderTeamIntroCc([
    { id: 'm1', managerUsername: null, email: 'm1@x.com', givenName: 'M', surname: 'One' },
    { id: 'm2', managerUsername: null, email: 'm2@x.com', givenName: 'M', surname: 'Two' },
  ]);
  assertEqual(cc, '', 'Real template: all-null managers yield empty cc front-matter');
  assertDoesNotContain(cc, 'null', 'Real template: no literal "null" anywhere in cc for all-null managers');
})();

(function testRealTemplateMixedManagersCcHasNoNull() {
  const cc = renderTeamIntroCc([
    { id: 'm3', managerUsername: 'alice', email: 'm3@x.com', givenName: 'M', surname: 'Three' },
    { id: 'm4', managerUsername: null, email: 'm4@x.com', givenName: 'M', surname: 'Four' },
  ]);
  assertEqual(cc, 'alice@codeday.org', 'Real template: mixed team keeps only the assigned manager in cc');
  assertDoesNotContain(cc, 'null', 'Real template: no literal "null" in cc for mixed managers');
})();

(function testRealTemplateAllAssignedCcCorrect() {
  const cc = renderTeamIntroCc([
    { id: 'm5', managerUsername: 'bob', email: 'm5@x.com', givenName: 'M', surname: 'Five' },
  ]);
  assertEqual(cc, 'bob@codeday.org', 'Real template: all-assigned team emits the correct cc');
})();

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
