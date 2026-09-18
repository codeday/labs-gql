import './_setupEnv';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { processPostmarkInboundEmail } from '../src/email/postmark';

const INBOUND_DOMAIN = 'test.local';
const REAL_PROJECT_ID = 'proj-test-1';
const REAL_EMAIL_SENT_ID = 'ck2abcdef123456';
const TRACKING_ADDR = `${REAL_PROJECT_ID}+${REAL_EMAIL_SENT_ID}@${INBOUND_DOMAIN}`;

function buildToFull(email: string, name = 'Recipient') {
  return { Email: email, Name: name, MailboxHash: '' };
}

interface ReqOverrides {
  ToFull?: any[];
  CcFull?: any[];
  BccFull?: any[];
  FromFull?: any;
  To?: string;
  Cc?: string;
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
}

function buildReq(overrides: ReqOverrides = {}) {
  return {
    body: {
      FromName: 'Test Sender',
      MessageStream: 'inbound',
      From: 'student@example.com',
      FromFull: { Email: 'student@example.com', Name: 'Test Sender', MailboxHash: '' },
      To: `tracking <${TRACKING_ADDR}>, mentor <mentor@example.com>`,
      ToFull: [buildToFull(TRACKING_ADDR), buildToFull('mentor@example.com')],
      Cc: '',
      CcFull: [],
      Bcc: '',
      BccFull: [],
      OriginalRecipient: TRACKING_ADDR,
      Subject: 'Re: Match Team Intro',
      MessageId: '<test@example.com>',
      ReplyTo: '',
      MailboxHash: '',
      Date: new Date().toISOString(),
      TextBody: 'Sounds great, thanks!',
      HtmlBody: '<p>Sounds great, thanks!</p>',
      StrippedTextReply: 'Sounds great, thanks!',
      Tag: '',
      Headers: [],
      Attachments: [],
      ...overrides,
    },
  } as any;
}

interface Fakes {
  fakePrisma: any;
  fakeTransporter: any;
  projectEmailCreateCalls: any[];
  findUniqueCalls: { model: string; where: any }[];
  sendMailCalls: any[];
}

function buildFakes(): Fakes {
  const projectEmailCreateCalls: any[] = [];
  const findUniqueCalls: { model: string; where: any }[] = [];
  const sendMailCalls: any[] = [];

  const fakePrisma = {
    project: {
      findUnique: async (args: any) => {
        findUniqueCalls.push({ model: 'project', where: args.where });
        if (args.where?.id === REAL_PROJECT_ID) {
          return {
            id: REAL_PROJECT_ID,
            mentors: [{ id: 'mentor-1', email: 'mentor@example.com' }],
            students: [{ id: 'student-1', email: 'student@example.com' }],
            event: { name: 'Test Event', emailSignature: 'Cheers' },
          };
        }
        return null;
      },
    },
    emailSent: {
      // Production-accurate: only the clean cuid matches; a contaminated id
      // (carrying an "@domain" suffix) can never equal a cuid, so it returns null.
      findUnique: async (args: any) => {
        findUniqueCalls.push({ model: 'emailSent', where: args.where });
        if (args.where?.id === REAL_EMAIL_SENT_ID) return { id: REAL_EMAIL_SENT_ID };
        return null;
      },
    },
    projectEmail: {
      create: async (args: any) => {
        projectEmailCreateCalls.push(args.data);
        return { id: 'project-email-1' };
      },
    },
  };

  const fakeTransporter = {
    sendMail: async (opts: any) => { sendMailCalls.push(opts); },
  };

  return { fakePrisma, fakeTransporter, projectEmailCreateCalls, findUniqueCalls, sendMailCalls };
}

function wire(fakes: Fakes) {
  Container.set(PrismaClient, fakes.fakePrisma);
  Container.set('email', fakes.fakeTransporter);
}

test('project-tracking reply-all connects ProjectEmail to the originating EmailSent', async () => {
  const fakes = buildFakes();
  wire(fakes);

  await processPostmarkInboundEmail(buildReq(), { send: () => 'ok' } as any);

  const emailSentCall = fakes.findUniqueCalls.find(c => c.model === 'emailSent');
  assert.ok(emailSentCall, 'emailSent.findUnique must be called');
  assert.equal(
    (emailSentCall as any).where.id,
    REAL_EMAIL_SENT_ID,
    'findUnique must receive the clean cuid, with no "@domain" suffix',
  );
  assert.ok(
    !String((emailSentCall as any).where.id).includes('@'),
    'the parsed emailSentId must never contain "@"',
  );

  assert.equal(fakes.projectEmailCreateCalls.length, 1, 'exactly one ProjectEmail must be created');
  const data = fakes.projectEmailCreateCalls[0];

  assert.deepEqual(
    data.emailSent,
    { connect: { id: REAL_EMAIL_SENT_ID } },
    'the fix must drive the emailSent: { connect } branch to fire',
  );
  assert.deepEqual(
    data.project,
    { connect: { id: REAL_PROJECT_ID } },
    'projectId parse (sibling line) must remain correct',
  );
  assert.deepEqual(
    data.student,
    { connect: { id: 'student-1' } },
    'a replying student must be linked (mentor/student matching unaffected)',
  );
  assert.equal(data.mentor, undefined, 'no mentor connect when the sender is a student');
});

test('tracking address without a "+" segment omits the EmailSent connect and skips the lookup', async () => {
  const fakes = buildFakes();
  wire(fakes);

  const noPlusAddr = `${REAL_PROJECT_ID}@${INBOUND_DOMAIN}`;
  const req = buildReq({
    To: `tracking <${noPlusAddr}>, mentor <mentor@example.com>`,
    ToFull: [buildToFull(noPlusAddr), buildToFull('mentor@example.com')],
    OriginalRecipient: noPlusAddr,
  });

  await processPostmarkInboundEmail(req, { send: () => 'ok' } as any);

  assert.equal(fakes.projectEmailCreateCalls.length, 1);
  const data = fakes.projectEmailCreateCalls[0];
  assert.equal(data.emailSent, undefined, 'no emailSentId segment must mean no EmailSent connect');
  assert.equal(
    fakes.findUniqueCalls.find(c => c.model === 'emailSent'),
    undefined,
    'emailSent.findUnique must not be called when there is no id to look up',
  );
  assert.deepEqual(data.project, { connect: { id: REAL_PROJECT_ID } });
});

test('reply-all with an emailSentId that matches no EmailSent row omits the connect', async () => {
  const fakes = buildFakes();
  wire(fakes);

  const unknownSentAddr = `${REAL_PROJECT_ID}+ck_unknown_sent_id@${INBOUND_DOMAIN}`;
  const req = buildReq({
    To: `tracking <${unknownSentAddr}>, mentor <mentor@example.com>`,
    ToFull: [buildToFull(unknownSentAddr), buildToFull('mentor@example.com')],
    OriginalRecipient: unknownSentAddr,
  });

  await processPostmarkInboundEmail(req, { send: () => 'ok' } as any);

  assert.equal(fakes.projectEmailCreateCalls.length, 1);
  const data = fakes.projectEmailCreateCalls[0];
  assert.equal(
    fakes.findUniqueCalls.find(c => c.model === 'emailSent')?.where.id,
    'ck_unknown_sent_id',
    'the clean (but unknown) id must still be looked up',
  );
  assert.equal(data.emailSent, undefined, 'no connect when the EmailSent row is missing');
  assert.deepEqual(data.project, { connect: { id: REAL_PROJECT_ID } });
});
