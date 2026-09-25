import './_setupEnv';
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';
import { processPostmarkInboundEmail } from '../src/email/postmark';

const INBOUND_DOMAIN = 'test.local';
const TRACKING_ADDR = `cid12345+es_abc123@${INBOUND_DOMAIN}`;

function mockRes() {
  return {
    send: () => 'ok',
    status: () => ({ send: () => 'ok' }),
  } as any;
}

function makeReq() {
  return {
    body: {
      FromFull: { Email: 'sender@example.com' },
      Subject: 'Hello',
      HtmlBody: 'ORIGINAL-BODY',
      ToFull: [{ Email: TRACKING_ADDR }],
      CcFull: [],
      BccFull: [],
    },
  } as any;
}

function installMocks(projectResult: any) {
  const captured: { html?: string } = {};
  Container.set(PrismaClient as any, {
    project: { findUnique: async () => projectResult },
  });
  Container.set('email', {
    sendMail: async (args: any) => {
      captured.html = args.html;
      return { MessageID: 'mid' };
    },
  });
  return captured;
}

// Guards the reply-one auto-reply body against leaking literal "null"/"undefined"
// when project/event/emailSignature is missing. The `from` field already falls
// back via `|| 'CodeDay'`; this lock the same treatment for the signature in `html`.
test('reply-one to an event with emailSignature = null does not leak literal "null"', async () => {
  const captured = await installMocks({ event: { name: 'CodeDay Lab', emailSignature: null } });
  await processPostmarkInboundEmail(makeReq(), mockRes());

  assert.equal(typeof captured.html, 'string');
  assert.ok(!captured.html!.includes('\nnull\n'), 'html must not contain literal "\\nnull\\n"');
  assert.ok(!captured.html!.includes('\nundefined\n'), 'html must not contain literal "\\nundefined\\n"');
});

test('reply-one to a deleted project does not leak literal "undefined" and falls back the sender name', async () => {
  const captured = await installMocks(null);
  await processPostmarkInboundEmail(makeReq(), mockRes());

  assert.equal(typeof captured.html, 'string');
  assert.ok(!captured.html!.includes('\nnull\n'), 'html must not contain literal "\\nnull\\n"');
  assert.ok(!captured.html!.includes('\nundefined\n'), 'html must not contain literal "\\nundefined\\n"');
});

test('a real emailSignature is still rendered verbatim', async () => {
  const signature = '-- The CodeDay Lab Team';
  const captured = await installMocks({ event: { name: 'CodeDay Lab', emailSignature: signature } });
  await processPostmarkInboundEmail(makeReq(), mockRes());

  assert.equal(typeof captured.html, 'string');
  assert.ok(captured.html!.includes(`\n${signature}\n`), 'signature must be interpolated verbatim');
  assert.ok(!captured.html!.includes('\nnull\n'));
  assert.ok(!captured.html!.includes('\nundefined\n'));
});
