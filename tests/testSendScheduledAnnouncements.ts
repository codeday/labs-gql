/**
 * Offline unit tests for the scheduled-announcement cron
 * (src/automation/tasks/sendScheduledAnnouncements.ts).
 *
 * No real database or SMTP server is required: the PrismaClient and the nodemailer
 * Transporter are replaced with fakes via the typedi Container (the same lookup seam
 * the production code uses at runtime). The only environment requirement is that the
 * dummy env vars below are set before the SUT is loaded, because src/config throws at
 * import time if any required env var is missing.
 *
 * Run with:
 *   npx ts-node tests/testSendScheduledAnnouncements.ts
 *   npx tsx tests/testSendScheduledAnnouncements.ts
 */
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import Container from 'typedi';
import { PrismaClient, ScheduledAnnouncementMedium, ScheduledAnnouncementTarget } from '@prisma/client';

// Seed dummy env BEFORE loading the SUT. Real values (from a .env file) win because we
// only set a variable when it is absent.
function env(key: string, value: string): void {
  if (!process.env[key]) process.env[key] = value;
}
env('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
env('ELASTIC_URL', 'http://localhost:9200');
env('ELASTIC_INDEX', 'test');
env('AUTH_SECRET', 'test');
env('AUTH_AUDIENCE', 'test');
env('EMAIL_HOST', 'localhost');
env('EMAIL_PORT', '587');
env('EMAIL_USER', 'test');
env('EMAIL_PASS', 'test');
env('EMAIL_INBOUND_DOMAIN', 'test.local');
env('GEOCODIO_API_KEY', 'test');
env('OPENAI_API_KEY', 'test');
env('OPENAI_ORGANIZATION', 'test');
env('WEBHOOK_KEY', 'test');
env('BADGR_USERNAME', 'test');
env('BADGR_PASSWORD', 'test');
env('BADGR_ISSUER', 'test');
env('SHOPIFY_API_TOKEN', 'test');
env('SHOPIFY_API_KEY', 'test');
env('SHOPIFY_API_SECRET_KEY', 'test');
env('SHOPIFY_STORE_DOMAIN', 'test.myshopify.com');
env('LINEAR_API_KEY', 'test');
env('LINEAR_TEAM_ID', 'test');
env('LINEAR_PROBLEM_LABEL_ID', 'test');
env('METRICS_KEY', 'test');
env('PLACID_API_TOKEN', 'test');
env('ATTIO_API_TOKEN', 'test');
env('ATTIO_ALUMNI_LIST', 'test');

// Load the SUT AFTER env is configured. Use require() (not an `import`) so this runs
// after the env assignments above instead of being hoisted ahead of them.
const sendScheduledAnnouncements: () => Promise<void> =
  require('../src/automation/tasks/sendScheduledAnnouncements').default;

interface SentMail {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  html: string;
}

function makeTransporter(behavior: { failAll?: boolean; failOn?: string[] } = {}) {
  const sent: SentMail[] = [];
  const transporter = {
    sendMail: async (mail: SentMail) => {
      if (behavior.failAll) throw new Error('SMTP down');
      if (
        behavior.failOn &&
        Array.isArray(mail.to) &&
        behavior.failOn.some((addr) => mail.to.includes(addr))
      ) {
        throw new Error(`bounce for ${mail.to.join(',')}`);
      }
      sent.push(mail);
      return { messageId: `ok-${sent.length}` };
    },
  };
  return { transporter: transporter as any, sent };
}

function makePrisma(announcements: any[]) {
  const updates: { where: { id: string }; data: { isSent: boolean } }[] = [];
  const prisma = {
    scheduledAnnouncement: {
      findMany: async () => announcements,
      update: async (args: { where: { id: string }; data: { isSent: boolean } }) => {
        updates.push(args);
        return {};
      },
    },
  };
  return { prisma: prisma as any, updates };
}

function mentor(id: string, email: string, managerUsername?: string) {
  return { id, email, givenName: 'M', surname: 'L', slackId: null, managerUsername };
}
function student(id: string, email: string) {
  return { id, email, givenName: 'S', surname: 'L', slackId: null };
}
function announcement(overrides: any = {}) {
  return {
    id: 'ann-1',
    medium: ScheduledAnnouncementMedium.EMAIL,
    target: ScheduledAnnouncementTarget.MENTOR,
    subject: 'Welcome',
    body: '<p>hi</p>',
    event: { id: 'event-1', mentors: [], students: [], projects: [] },
    ...overrides,
  };
}
function install(prisma: any, email: any) {
  Container.set(PrismaClient, prisma);
  Container.set('email', email);
}

test('EMAIL MENTOR: one email per accepted mentor, To is an array, marked sent', async () => {
  const { transporter, sent } = makeTransporter();
  const { prisma, updates } = makePrisma([
    announcement({
      target: ScheduledAnnouncementTarget.MENTOR,
      event: {
        id: 'e',
        mentors: [mentor('m1', 'm1@x.com'), mentor('m2', 'm2@x.com')],
        students: [],
        projects: [],
      },
    }),
  ]);
  install(prisma, transporter);

  await sendScheduledAnnouncements();

  assert.equal(sent.length, 2, 'one sendMail per mentor');
  assert.ok(Array.isArray(sent[0].to), 'To must be an array (not a bare string)');
  assert.deepEqual(sent[0].to, ['m1@x.com']);
  assert.deepEqual(sent[0].cc, []);
  assert.deepEqual(sent[1].to, ['m2@x.com']);
  assert.equal(sent[0].from, 'labs@codeday.org');
  assert.equal(sent[0].subject, 'Welcome');
  assert.equal(sent[0].html, '<p>hi</p>');
  assert.equal(updates.length, 1, 'announcement marked sent exactly once');
  assert.equal(updates[0].where.id, 'ann-1');
  assert.equal(updates[0].data.isSent, true);
});

test('EMAIL STUDENT: one email per accepted student, To is an array, marked sent', async () => {
  const { transporter, sent } = makeTransporter();
  const { prisma, updates } = makePrisma([
    announcement({
      target: ScheduledAnnouncementTarget.STUDENT,
      event: {
        id: 'e',
        mentors: [],
        students: [student('s1', 's1@x.com'), student('s2', 's2@x.com')],
        projects: [],
      },
    }),
  ]);
  install(prisma, transporter);

  await sendScheduledAnnouncements();

  assert.equal(sent.length, 2, 'one sendMail per student');
  assert.ok(Array.isArray(sent[0].to), 'To must be an array (not a bare string)');
  assert.deepEqual(sent[0].to, ['s1@x.com']);
  assert.deepEqual(sent[1].to, ['s2@x.com']);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.isSent, true);
});

test('EMAIL TEAM: one email per project; To aggregates mentors+students; Cc dedups managers', async () => {
  const { transporter, sent } = makeTransporter();
  const { prisma, updates } = makePrisma([
    announcement({
      target: ScheduledAnnouncementTarget.TEAM,
      event: {
        id: 'e',
        mentors: [],
        students: [],
        projects: [
          {
            slackChannelId: 'C1',
            mentors: [
              mentor('m1', 'm1@x.com', 'mgr1'),
              mentor('m2', 'm2@x.com', 'mgr1'),
              mentor('m3', 'm3@x.com', 'mgr2'),
            ],
            students: [student('s1', 's1@x.com')],
          },
        ],
      },
    }),
  ]);
  install(prisma, transporter);

  await sendScheduledAnnouncements();

  assert.equal(sent.length, 1, 'one sendMail per project');
  assert.ok(Array.isArray(sent[0].to));
  assert.deepEqual(sent[0].to, ['m1@x.com', 'm2@x.com', 'm3@x.com', 's1@x.com']);
  assert.deepEqual(sent[0].cc, ['mgr1', 'mgr2'], 'manager usernames are deduped');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.isSent, true);
});

test('EMAIL MENTOR: total send failure is NOT marked sent so the cron retries', async () => {
  const { transporter, sent } = makeTransporter({ failAll: true });
  const { prisma, updates } = makePrisma([
    announcement({
      target: ScheduledAnnouncementTarget.MENTOR,
      event: {
        id: 'e',
        mentors: [mentor('m1', 'm1@x.com'), mentor('m2', 'm2@x.com')],
        students: [],
        projects: [],
      },
    }),
  ]);
  install(prisma, transporter);

  await sendScheduledAnnouncements();

  assert.equal(sent.length, 0, 'no email was delivered');
  assert.equal(updates.length, 0, 'must NOT be marked sent or retry is impossible');
});

test('EMAIL MENTOR: partial failure still marks sent (no regression for partial delivery)', async () => {
  const { transporter, sent } = makeTransporter({ failOn: ['m1@x.com'] });
  const { prisma, updates } = makePrisma([
    announcement({
      target: ScheduledAnnouncementTarget.MENTOR,
      event: {
        id: 'e',
        mentors: [mentor('m1', 'm1@x.com'), mentor('m2', 'm2@x.com')],
        students: [],
        projects: [],
      },
    }),
  ]);
  install(prisma, transporter);

  await sendScheduledAnnouncements();

  assert.equal(sent.length, 1, 'the non-failing mentor still receives the email');
  assert.deepEqual(sent[0].to, ['m2@x.com']);
  assert.equal(updates.length, 1, 'partial success still marks the announcement sent');
  assert.equal(updates[0].data.isSent, true);
});

test('EMAIL MENTOR: zero accepted mentors is marked sent (nothing to send)', async () => {
  const { transporter, sent } = makeTransporter();
  const { prisma, updates } = makePrisma([
    announcement({
      target: ScheduledAnnouncementTarget.MENTOR,
      event: { id: 'e', mentors: [], students: [], projects: [] },
    }),
  ]);
  install(prisma, transporter);

  await sendScheduledAnnouncements();

  assert.equal(sent.length, 0);
  assert.equal(updates.length, 1, 'no recipients -> nothing to send -> marked sent (preserved behavior)');
  assert.equal(updates[0].data.isSent, true);
});

test('EMAIL TEAM: total failure is NOT marked sent so the cron retries', async () => {
  const { transporter, sent } = makeTransporter({ failAll: true });
  const { prisma, updates } = makePrisma([
    announcement({
      target: ScheduledAnnouncementTarget.TEAM,
      event: {
        id: 'e',
        mentors: [],
        students: [],
        projects: [{ slackChannelId: 'C1', mentors: [mentor('m1', 'm1@x.com')], students: [] }],
      },
    }),
  ]);
  install(prisma, transporter);

  await sendScheduledAnnouncements();

  assert.equal(sent.length, 0);
  assert.equal(updates.length, 0, 'total failure must not be marked sent');
});

test('SLACK MENTOR with no mentor channel configured is NOT marked sent (no regression)', async () => {
  const { prisma, updates } = makePrisma([
    announcement({
      medium: ScheduledAnnouncementMedium.SLACK,
      target: ScheduledAnnouncementTarget.MENTOR,
      event: {
        id: 'e',
        slackWorkspaceAccessToken: 'xoxb-fake',
        slackWorkspaceId: 'T-fake',
        slackMentorChannelId: null,
        mentors: [mentor('m1', 'm1@x.com')],
        students: [],
        projects: [],
      },
    }),
  ]);
  install(prisma, makeTransporter().transporter);

  await sendScheduledAnnouncements();

  assert.equal(updates.length, 0, 'sendSlackAnnouncement throws -> not marked sent (retryable)');
});
