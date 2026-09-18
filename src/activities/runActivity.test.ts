/**
 * Offline unit tests for runActivity error propagation. Verifies the fix that runActivity
 * now awaits the async task fn and propagates rejections (rather than the old behavior of
 * not awaiting and unconditionally returning true). Uses the real sendSlackOnboardingReminder
 * task with a rejecting Prisma fake to reproduce the original failure path end-to-end through
 * runActivity.
 *
 * Run with:
 *   npx tsx src/activities/runActivity.test.ts
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import Container from 'typedi';
import { runActivity, getActivities, getActivitySchema } from './index';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { failures += 1; console.error(`FAILED: ${message}`); }
  else { console.log(`PASSED: ${message}`); }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures += 1; console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`); }
  else { console.log(`PASSED: ${message}`); }
}

function slackConfiguredEvent() {
  return { id: 'evt-1', slackWorkspaceId: 'W', slackWorkspaceAccessToken: 'T', name: 'TestEvent' };
}

function makeMockPrisma() {
  return {
    event: { findFirst: async () => slackConfiguredEvent() },
    student: { findMany: async () => [] },
  } as any;
}

function makeRejectingPrisma() {
  const m = makeMockPrisma();
  m.student.findMany = async () => { throw new Error('boom'); };
  return m;
}

function patchSlackPosts(): () => void {
  const orig = WebClient.prototype.apiCall as any;
  WebClient.prototype.apiCall = async function () { return { ok: true } as any; } as any;
  return () => { WebClient.prototype.apiCall = orig; };
}

const ctx = { auth: { eventId: 'evt-1' } } as any;
const args = { channel: 'C1', intro: 'hi', min: 1 } as any;

async function testRunActivityReturnsTrueOnSuccess(): Promise<void> {
  Container.set(PrismaClient, makeMockPrisma());
  const restore = patchSlackPosts();
  const result = await runActivity('sendSlackOnboardingReminder', ctx, args);
  assertEqual(result, true, 'runActivity returns true on success');
  restore();
}

async function testRunActivityIsAsync(): Promise<void> {
  Container.set(PrismaClient, makeMockPrisma());
  const restore = patchSlackPosts();
  const pending = runActivity('sendSlackOnboardingReminder', ctx, args);
  assert(pending instanceof Promise, 'runActivity returns a Promise (async)');
  await pending.catch(() => {});
  restore();
}

async function testRunActivityReturnsFalseForUnknownName(): Promise<void> {
  const result = await runActivity('doesNotExist', ctx, {});
  assertEqual(result, false, 'runActivity returns false for unknown name');
}

async function testRunActivityPropagatesRejection(): Promise<void> {
  Container.set(PrismaClient, makeRejectingPrisma());
  const restore = patchSlackPosts();
  let rejected: any = null;
  try {
    await runActivity('sendSlackOnboardingReminder', ctx, { channel: 'C1', intro: 'hi', min: 1, partnerCode: 'P' });
  } catch (e: any) { rejected = e; }
  assert(rejected !== null && /boom/.test(rejected.message), 'runActivity propagates rejection (does NOT swallow into true)');
  restore();
}

async function testNoUnhandledRejectionWhenCallerAwaits(): Promise<void> {
  // The OLD runActivity body (sync, no await, return true) would emit an unhandledRejection
  // when its un-awaited task fn rejected. The fix returns a rejecting promise the caller is
  // responsible for awaiting, so awaiting it must produce NO unhandledRejection.
  Container.set(PrismaClient, makeRejectingPrisma());
  const restore = patchSlackPosts();
  const rejections: any[] = [];
  const handler = (r: any) => rejections.push(r);
  process.on('unhandledRejection', handler);
  const p = runActivity('sendSlackOnboardingReminder', ctx, { channel: 'C1', intro: 'hi', min: 1, partnerCode: 'P' });
  try { await p; } catch { /* expected */ }
  await new Promise((res) => setTimeout(res, 50));
  process.removeListener('unhandledRejection', handler);
  assertEqual(rejections.length, 0, 'no unhandledRejection when caller awaits the returned promise');
  restore();
}

async function testResolverAwaitsRunActivity(): Promise<void> {
  // Unit-test the propagation expression `Boolean(await runActivity(...))`: with a rejecting
  // runActivity, the awaiting wrapper throws (does NOT return true). This is the body of
  // TasksResolver.runActivity after the fix.
  Container.set(PrismaClient, makeRejectingPrisma());
  const restore = patchSlackPosts();
  let rejected: any = null;
  try {
    await (async () => Boolean(await runActivity('sendSlackOnboardingReminder', ctx, { channel: 'C1', intro: 'hi', min: 1, partnerCode: 'P' })))();
  } catch (e: any) { rejected = e; }
  assert(rejected !== null && /boom/.test(rejected.message), 'Boolean(await runActivity(...)) propagates rejection (resolver body)');
  restore();
}

async function main(): Promise<void> {
  await testRunActivityReturnsTrueOnSuccess();
  await testRunActivityIsAsync();
  await testRunActivityReturnsFalseForUnknownName();
  await testRunActivityPropagatesRejection();
  await testNoUnhandledRejectionWhenCallerAwaits();
  await testResolverAwaitsRunActivity();
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
