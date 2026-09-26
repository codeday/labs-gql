/**
 * Offline unit tests for the activities loader, schema exposure, and the slackInviteChannels
 * regression guard (its `students: { some: { partnerCode } }` filter is VALID on Project and
 * must NOT be "fixed"). Re-validates slackInviteChannels's captured `where` against the real
 * generated Prisma client's project.findMany validator.
 *
 * Run with:
 *   npx tsx src/activities/tasks/activitiesLoader.test.ts
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import Container from 'typedi';
import { getActivities, getActivitySchema } from '../index';
import slackInviteChannels from './slackInviteChannels';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { failures += 1; console.error(`FAILED: ${message}`); }
  else { console.log(`PASSED: ${message}`); }
}

const realPrisma = new PrismaClient();

async function validateProjectWhere(where: object): Promise<{ isValidationError: boolean; errClass: string; mentionsUnknownArgStudents: boolean; }> {
  try {
    await realPrisma.project.findMany({ where: where as any, select: { slackChannelId: true } });
    return { isValidationError: false, errClass: '', mentionsUnknownArgStudents: false };
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    return {
      isValidationError: /PrismaClientValidationError/.test(e?.constructor?.name ?? ''),
      errClass: e?.constructor?.name ?? '',
      mentionsUnknownArgStudents: /Unknown arg `students`/.test(msg),
    };
  }
}

function patchSlackPosts(): () => void {
  const orig = WebClient.prototype.apiCall as any;
  WebClient.prototype.apiCall = async function () { return { ok: true } as any; } as any;
  return () => { WebClient.prototype.apiCall = orig; };
}

function slackConfiguredEvent() {
  return { id: 'evt-1', slackWorkspaceId: 'W', slackWorkspaceAccessToken: 'T', name: 'TestEvent' };
}

async function testGetActivitiesListsBothFixedTasks(): Promise<void> {
  const acts = getActivities();
  assert(Array.isArray(acts), 'getActivities returns an array');
  assert(acts.includes('sendSlackOnboardingReminder'), 'getActivities lists sendSlackOnboardingReminder');
  assert(acts.includes('slackSendEmailResponseReminder'), 'getActivities lists slackSendEmailResponseReminder');
}

function testGetActivitySchemaExposesPartnerCode(): void {
  const schema = getActivitySchema('sendSlackOnboardingReminder') as any;
  assert(!!schema && schema.properties.partnerCode.title === 'Partner Code (Optional)', 'onboarding schema exposes partnerCode titled "Partner Code (Optional)"');
  assert(!!schema && schema.properties.partnerCode.type === 'string', 'onboarding schema partnerCode is type string');
  const schema2 = getActivitySchema('slackSendEmailResponseReminder') as any;
  assert(!!schema2 && schema2.properties.partnerCode.title === 'Partner Code (Optional)', 'email-reminder schema exposes partnerCode titled "Partner Code (Optional)"');
}

function testTestFilesAreNotLoadedAsActivities(): void {
  const acts = getActivities();
  assert(!acts.some((n: string) => n.endsWith('.test') || n.includes('.test.')), 'loader does not register *.test.ts files as activities');
}

async function testSlackInviteChannelsStillUsesStudentsRelationFilter(): Promise<void> {
  const calls: any[] = [];
  const mock: any = {
    event: { findFirst: async () => slackConfiguredEvent() },
    project: { findMany: async (a: any) => { calls.push(a); return [{ slackChannelId: 'C' }]; } },
  };
  Container.set(PrismaClient, mock);
  const restore = patchSlackPosts();

  let threw: any = null;
  try {
    await slackInviteChannels({ auth: { eventId: 'evt-1' } } as any, { user: 'U1', partnerCode: 'PARTNER1' });
  } catch (e: any) { threw = e; }
  assert(threw === null, `slackInviteChannels should NOT throw with the valid students:{some} Project filter (got ${threw && threw.message})`);
  const where = calls[0]?.where;
  assert(!!where && !!where.students && !!where.students.some && !!where.students.some.partnerCode, 'slackInviteChannels STILL uses students:{some:{partnerCode}} on Project (regression guard)');
  assert(!!where && where.partnerCode === undefined, 'slackInviteChannels does NOT filter on scalar partnerCode (it is a relation filter on Project)');
  const r = await validateProjectWhere(where);
  assert(!r.isValidationError && !r.mentionsUnknownArgStudents, `slackInviteChannels Project where is accepted by real Prisma validator (got ${r.errClass})`);
  restore();
}

async function main(): Promise<void> {
  await testGetActivitiesListsBothFixedTasks();
  testGetActivitySchemaExposesPartnerCode();
  testTestFilesAreNotLoadedAsActivities();
  await testSlackInviteChannelsStillUsesStudentsRelationFilter();
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
