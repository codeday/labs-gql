/**
 * Offline regression tests for the "Project Information Updated" email gate in
 * `ProjectResolver.editProject`.
 *
 * The email must be dispatched ONLY when the project is already MATCHED AND
 * either its `description` or `issueUrl` actually changed. This is a truth-table
 * guard against the operator-precedence footgun (`&&` binding tighter than
 * `||`), which previously left the `issueUrl` branch ungated by the MATCHED
 * check and sent spurious update emails for non-MATCHED projects.
 *
 * No live DB or SMTP server is required: the Prisma client and the nodemailer
 * transporter are swapped out via the typedi `Container` (the same DI surface
 * used by `src/di.ts`).
 *
 * Run with:
 *   npx ts-node tests/testProjectEmailGating.ts
 */
import 'reflect-metadata';

// All env vars required by `src/config.ts` MUST be set before any module that
// (transitively) imports `src/config` is loaded. `src/resolvers/Project` ->
// `src/email` -> `src/config`, so set them here, above those imports.
// TypeScript's CommonJS emission preserves top-level statement order, so these
// assignments execute before the `require()` calls emitted for the imports
// below.
const TEST_ENV: Record<string, string> = {
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
for (const [k, v] of Object.entries(TEST_ENV)) {
  if (!process.env[k]) process.env[k] = v;
}

import { Container } from 'typedi';
import { ProjectStatus } from '@prisma/client';
import { ProjectResolver } from '../src/resolvers/Project';
import { ProjectEditInput } from '../src/inputs/ProjectEditInput';
import { registerHandlebarsHelpers } from '../src/email/helpers';

// The projectUpdate.md template uses the `{{diff}}` helper, registered globally
// at app boot in src/di.ts (which we deliberately do NOT call — it would
// instantiate a real PrismaClient + nodemailer transporter).
registerHandlebarsHelpers();

// Bespoke test harness (mirrors src/automation/tasks/syncAlumniInteractions.test.ts).
let failures = 0;

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL: ${name}: ${(e as Error).message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}

// Admin auth bypasses every permission gate in editProject, so the email-gating
// conditional is exercised without being short-circuited by auth failures.
const ADMIN_AUTH = { isAdmin: true } as unknown as Parameters<
  ProjectResolver['editProject']
>[0]['auth'];

type EmailCapture = { to: string | string[]; subject: string; text: string }[];

interface DbProject {
  id: string;
  eventId: string;
  status: ProjectStatus;
  description: string;
  issueUrl: string | null;
  deliverables: string | null;
  mentors: { id: string; username: string | null; givenName: string; surname: string; email: string }[];
  students: { id: string; username: string | null; givenName: string; surname: string; email: string }[];
  event: { matchPreferenceSubmissionOpen: boolean } | null;
}

function buildDbProject(overrides: Partial<DbProject> = {}): DbProject {
  return {
    id: 'proj-1',
    eventId: 'evt-1',
    status: ProjectStatus.DRAFT,
    description: 'old description',
    issueUrl: null,
    deliverables: null,
    mentors: [
      { id: 'm-1', username: 'mentor', givenName: 'Mentor', surname: 'One', email: 'mentor@example.com' },
    ],
    students: [
      { id: 's-1', username: 'student', givenName: 'Student', surname: 'One', email: 'student@example.com' },
    ],
    event: null,
    ...overrides,
  };
}

function makeInput(opts: {
  description?: string;
  issueUrl?: string | null;
  status: ProjectStatus;
}): ProjectEditInput {
  const input = new ProjectEditInput();
  input.description = opts.description;
  input.issueUrl = opts.issueUrl;
  input.status = opts.status;
  return input;
}

// Runs editProject against the given db/new state and returns the list of
// `sendMail` payloads captured by a fake email transporter registered in the
// typedi Container (the same seam used by src/di.ts: `Container.set('email')`).
async function runEdit(
  dbProject: DbProject,
  newProject: Record<string, unknown>,
  input: ProjectEditInput,
): Promise<EmailCapture> {
  const sent: EmailCapture = [];
  Container.set('email', {
    sendMail: async (opts: { to: string | string[]; subject: string; text: string }) => {
      sent.push(opts);
    },
  });
  const resolver = new ProjectResolver();
  (resolver as unknown as { prisma: unknown }).prisma = {
    project: {
      findUnique: async () => dbProject,
      update: async () => newProject,
    },
  };
  await resolver.editProject({ auth: ADMIN_AUTH } as unknown as never, 'proj-1', input);
  return sent;
}

// Truth-table guards: status x which-field-changed x no-op.

async function testMatchedDescriptionChangedSends(): Promise<void> {
  const db = buildDbProject({ status: ProjectStatus.MATCHED, description: 'old' });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'new', issueUrl: null },
    makeInput({ description: 'new', status: ProjectStatus.MATCHED }),
  );
  assertEqual(sent.length, 1, 'MATCHED + description changed sends exactly one email');
  assertEqual(sent[0].subject, 'Project Information Updated', 'email subject');
}

async function testMatchedIssueUrlChangedSends(): Promise<void> {
  const db = buildDbProject({ status: ProjectStatus.MATCHED, issueUrl: 'http://old' });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'old description', issueUrl: 'http://new' },
    makeInput({ issueUrl: 'http://new', status: ProjectStatus.MATCHED }),
  );
  assertEqual(sent.length, 1, 'MATCHED + issueUrl changed sends exactly one email');
  // Recipients are the team: students first, then mentors.
  assertEqual(sent[0].to, ['student@example.com', 'mentor@example.com'], 'recipients are team (students then mentors)');
}

async function testMatchedBothChangedSendsOnce(): Promise<void> {
  const db = buildDbProject({ status: ProjectStatus.MATCHED, description: 'old', issueUrl: 'http://old' });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'new', issueUrl: 'http://new' },
    makeInput({ description: 'new', issueUrl: 'http://new', status: ProjectStatus.MATCHED }),
  );
  assertEqual(sent.length, 1, 'a combined edit sends exactly one email, not two');
}

async function testMatchedNothingChangedSendsNone(): Promise<void> {
  const db = buildDbProject({ status: ProjectStatus.MATCHED, description: 'same', issueUrl: 'http://same' });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'same', issueUrl: 'http://same' },
    makeInput({ description: 'same', issueUrl: 'http://same', status: ProjectStatus.MATCHED }),
  );
  assertEqual(sent.length, 0, 'no email when no tracked field changed');
}

async function testMatchedClearingIssueUrlSendsNone(): Promise<void> {
  // `data.issueUrl && ...` short-circuits to falsy when data.issueUrl is null.
  const db = buildDbProject({ status: ProjectStatus.MATCHED, issueUrl: 'http://old' });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'old description', issueUrl: null },
    makeInput({ issueUrl: null, status: ProjectStatus.MATCHED }),
  );
  assertEqual(sent.length, 0, 'clearing issueUrl must not trigger the update email');
}

async function testDraftIssueUrlChangedSendsNone(): Promise<void> {
  // The regression: non-MATCHED + issueUrl change must NOT send. On the buggy
  // code, the ungated `|| (issueUrl changed)` branch fired here.
  const db = buildDbProject({ status: ProjectStatus.DRAFT, issueUrl: null, description: 'same' });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'same', issueUrl: 'http://issue' },
    makeInput({ issueUrl: 'http://issue', status: ProjectStatus.DRAFT }),
  );
  assertEqual(sent.length, 0, 'DRAFT + issueUrl change must NOT send (regression)');
}

async function testDraftBothChangedSendsNone(): Promise<void> {
  // The buggy conditional evaluated (MATCHED && desc) || issueUrl, so a DRAFT
  // project with an issueUrl change still fired even with a description change.
  const db = buildDbProject({ status: ProjectStatus.DRAFT, description: 'old', issueUrl: 'http://old' });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'new', issueUrl: 'http://new' },
    makeInput({ description: 'new', issueUrl: 'http://new', status: ProjectStatus.DRAFT }),
  );
  assertEqual(sent.length, 0, 'DRAFT + both changed must NOT send (regression)');
}

async function testDraftDescriptionOnlySendsNone(): Promise<void> {
  // Asymmetry check: the description branch was already gated by MATCHED in the
  // buggy code; confirm the fix does not regress that branch.
  const db = buildDbProject({ status: ProjectStatus.DRAFT, description: 'old', issueUrl: null });
  const sent = await runEdit(
    db,
    { id: 'proj-1', description: 'new', issueUrl: null },
    makeInput({ description: 'new', status: ProjectStatus.DRAFT }),
  );
  assertEqual(sent.length, 0, 'DRAFT + description-only change must NOT send (already-correct branch)');
}

async function main(): Promise<void> {
  await run('MATCHED + description changed sends update email', testMatchedDescriptionChangedSends);
  await run('MATCHED + issueUrl changed sends update email with team recipients', testMatchedIssueUrlChangedSends);
  await run('MATCHED + both changed sends a single email', testMatchedBothChangedSendsOnce);
  await run('MATCHED + nothing changed sends no email', testMatchedNothingChangedSendsNone);
  await run('MATCHED + clearing issueUrl sends no email', testMatchedClearingIssueUrlSendsNone);
  await run('DRAFT + issueUrl changed sends NO email (regression)', testDraftIssueUrlChangedSendsNone);
  await run('DRAFT + both changed sends NO email (regression)', testDraftBothChangedSendsNone);
  await run('DRAFT + description-only sends NO email (already-correct branch)', testDraftDescriptionOnlySendsNone);

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
