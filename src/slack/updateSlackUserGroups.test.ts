/**
 * Offline unit tests for updateSlackUserGroups. No live Slack or DB access — the Slack
 * client is injected through the function's optional second parameter (mirroring
 * resolveSlackChannelId in tests/testSlackReporting.ts) and the PrismaClient is replaced
 * in the typedi Container.
 *
 * updateSlackUserGroups transitively imports src/config (via the ../utils barrel), which
 * validates required env vars at module-load time, so .env.test.example is loaded before
 * the module under test is dynamically imported.
 *
 * Run with:
 *   npx tsx src/slack/updateSlackUserGroups.test.ts
 */
import 'reflect-metadata';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import type { SlackEventWithProjects, SlackStudentInfo } from './types';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test.example') });

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

type UpdateFn = typeof import('./updateSlackUserGroups')['updateSlackUserGroups'];

type Calls = {
  create: any[];
  usersUpdate: any[];
  disable: any[];
  eventUpdate: any[];
};

function makeSlack(calls: Calls, createId = 'S-NEW'): any {
  return {
    usergroups: {
      create: async (args: any) => {
        calls.create.push(args);
        return { ok: true, usergroup: { id: createId } };
      },
      users: {
        update: async (args: any) => {
          calls.usersUpdate.push(args);
          return { ok: true };
        },
      },
      disable: async (args: any) => {
        calls.disable.push(args);
        return { ok: true };
      },
    },
  };
}

function makePrisma(calls: Calls): any {
  return {
    event: {
      update: async (args: any) => {
        calls.eventUpdate.push(args);
        return {};
      },
    },
  };
}

function makeEvent(overrides: Partial<SlackEventWithProjects<SlackStudentInfo>> = {}): SlackEventWithProjects<SlackStudentInfo> {
  return {
    id: 'evt-1',
    name: 'Test Event',
    slackWorkspaceAccessToken: 'xoxp-token',
    slackWorkspaceId: 'T0001',
    slackMentorChannelId: 'C-mentor',
    slackUserGroupId: null,
    projects: [],
    ...overrides,
  } as SlackEventWithProjects<SlackStudentInfo>;
}

function student(id: string, slackId: string | null): { id: string; email: string; slackId: string | null } {
  return { id, email: `${id}@example.com`, slackId };
}

function freshCalls(): Calls {
  return { create: [], usersUpdate: [], disable: [], eventUpdate: [] };
}

async function testEmptyRosterWithExistingGroupDisablesAndClearsId(update: UpdateFn): Promise<void> {
  const calls = freshCalls();
  const event = makeEvent({ slackUserGroupId: 'S123', projects: [] });
  Container.set(PrismaClient, makePrisma(calls));

  await update(event, makeSlack(calls) as any);

  assertEqual(calls.disable, [{ usergroup: 'S123' }], 'Stale usergroup is disabled');
  assertEqual(
    calls.eventUpdate,
    [{ where: { id: 'evt-1' }, data: { slackUserGroupId: null } }],
    'slackUserGroupId is cleared in the database',
  );
  assert(calls.usersUpdate.length === 0, 'No member update is performed when the roster is empty');
  assert(calls.create.length === 0, 'No new usergroup is created when clearing an existing one');
  assertEqual(event.slackUserGroupId, null, 'In-memory slackUserGroupId is cleared so callers see the new state immediately');
}

async function testNonEmptyRosterWithExistingGroupUpdatesMembersOnly(update: UpdateFn): Promise<void> {
  const calls = freshCalls();
  const event = makeEvent({
    slackUserGroupId: 'S123',
    projects: [
      { id: 'p1', slackChannelId: null, students: [student('s1', 'U1'), student('s2', 'U2')] },
    ],
  });
  Container.set(PrismaClient, makePrisma(calls));

  await update(event, makeSlack(calls) as any);

  assertEqual(
    calls.usersUpdate,
    [{ usergroup: 'S123', users: 'U1,U2' }],
    'Existing group membership is replaced with the current accepted students',
  );
  assert(calls.create.length === 0, 'No new usergroup is created when one already exists');
  assert(calls.disable.length === 0, 'Existing group is not disabled when students remain');
  assert(calls.eventUpdate.length === 0, 'DB id is not rewritten when the group id is unchanged');
  assertEqual(event.slackUserGroupId, 'S123', 'Group id is preserved when students remain');
}

async function testNonEmptyRosterWithNoGroupCreatesThenUpdates(update: UpdateFn): Promise<void> {
  const calls = freshCalls();
  const event = makeEvent({
    slackUserGroupId: null,
    projects: [
      { id: 'p1', slackChannelId: null, students: [student('s1', 'U1')] },
    ],
  });
  Container.set(PrismaClient, makePrisma(calls));

  await update(event, makeSlack(calls, 'S-NEW') as any);

  assertEqual(
    calls.create,
    [{ name: 'Test Event', handle: 'test-event' }],
    'A usergroup is created with the event name and slug handle',
  );
  assertEqual(
    calls.eventUpdate,
    [{ where: { id: 'evt-1' }, data: { slackUserGroupId: 'S-NEW' } }],
    'The newly created group id is persisted to the event',
  );
  assertEqual(
    calls.usersUpdate,
    [{ usergroup: 'S-NEW', users: 'U1' }],
    'The fresh group is immediately populated with the current students',
  );
  assert(calls.disable.length === 0, 'No disable occurs on the create path');
  assertEqual(event.slackUserGroupId, 'S-NEW', 'In-memory slackUserGroupId reflects the created group');
}

async function testEmptyRosterWithNoGroupIsNoOp(update: UpdateFn): Promise<void> {
  const calls = freshCalls();
  const event = makeEvent({ slackUserGroupId: null, projects: [] });
  Container.set(PrismaClient, makePrisma(calls));

  await update(event, makeSlack(calls) as any);

  assert(calls.create.length === 0, 'No placeholder group is created when there are no students yet');
  assert(calls.usersUpdate.length === 0, 'No member update is attempted on a non-existent group');
  assert(calls.disable.length === 0, 'Nothing to disable when no group exists');
  assert(calls.eventUpdate.length === 0, 'No DB write occurs on the no-op path');
  assertEqual(event.slackUserGroupId, null, 'slackUserGroupId stays null on the no-op path');
}

async function testAcceptedStudentsWithoutSlackIdTreatedAsEmptyRoster(update: UpdateFn): Promise<void> {
  const calls = freshCalls();
  const event = makeEvent({
    slackUserGroupId: 'S123',
    projects: [
      { id: 'p1', slackChannelId: null, students: [student('s1', null), student('s2', null)] },
    ],
  });
  Container.set(PrismaClient, makePrisma(calls));

  await update(event, makeSlack(calls) as any);

  assertEqual(calls.disable, [{ usergroup: 'S123' }], 'Group is disabled when accepted students have no linked Slack IDs');
  assertEqual(
    calls.eventUpdate,
    [{ where: { id: 'evt-1' }, data: { slackUserGroupId: null } }],
    'slackUserGroupId is cleared when no accepted student has a Slack ID',
  );
  assert(calls.usersUpdate.length === 0, 'No member update runs when no students have Slack IDs');
  assertEqual(event.slackUserGroupId, null, 'In-memory id is cleared');
}

async function testIdsFlattenedAcrossProjectsAndFalsySlackIdFiltered(update: UpdateFn): Promise<void> {
  const calls = freshCalls();
  const event = makeEvent({
    slackUserGroupId: 'S123',
    projects: [
      {
        id: 'p1',
        slackChannelId: null,
        students: [student('s1', 'U1'), student('s2', null), student('s3', '')],
      },
      {
        id: 'p2',
        slackChannelId: null,
        students: [student('s4', 'U2')],
      },
    ],
  });
  Container.set(PrismaClient, makePrisma(calls));

  await update(event, makeSlack(calls) as any);

  assertEqual(
    calls.usersUpdate,
    [{ usergroup: 'S123', users: 'U1,U2' }],
    'Slack IDs are flattened across projects and null/empty slackIds are dropped',
  );
  assert(calls.disable.length === 0, 'Group is not disabled when at least one valid Slack ID remains');
  assert(calls.create.length === 0, 'No group created when one already exists');
}

async function testRepopulateAfterClearRecreatesGroup(update: UpdateFn): Promise<void> {
  const calls = freshCalls();
  const event = makeEvent({
    slackUserGroupId: null,
    projects: [
      { id: 'p1', slackChannelId: null, students: [student('s1', 'U1')] },
    ],
  });
  Container.set(PrismaClient, makePrisma(calls));

  await update(event, makeSlack(calls, 'S-REBORN') as any);

  assertEqual(calls.create.length, 1, 'A fresh group is created once students re-join after a prior clear');
  assertEqual(event.slackUserGroupId, 'S-REBORN', 'New group id is stored after re-join');
  assertEqual(calls.disable.length, 0, 'Disable is not called on the re-create path');
}

async function main(): Promise<void> {
  const { updateSlackUserGroups } = await import('./updateSlackUserGroups');

  await testEmptyRosterWithExistingGroupDisablesAndClearsId(updateSlackUserGroups);
  await testNonEmptyRosterWithExistingGroupUpdatesMembersOnly(updateSlackUserGroups);
  await testNonEmptyRosterWithNoGroupCreatesThenUpdates(updateSlackUserGroups);
  await testEmptyRosterWithNoGroupIsNoOp(updateSlackUserGroups);
  await testAcceptedStudentsWithoutSlackIdTreatedAsEmptyRoster(updateSlackUserGroups);
  await testIdsFlattenedAcrossProjectsAndFalsySlackIdFiltered(updateSlackUserGroups);
  await testRepopulateAfterClearRecreatesGroup(updateSlackUserGroups);

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
