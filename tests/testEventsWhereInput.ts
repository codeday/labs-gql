import test from 'node:test';
import assert from 'node:assert/strict';
import { sign as jwtSign } from 'jsonwebtoken';

// src/config.ts validates ~28 env vars at import time; set them before importing
// anything under src/. Static `import` declarations are hoisted, so the src
// modules are loaded via `require()` AFTER these assignments run (require is a
// function call, not hoisted). This keeps the file CommonJS-clean (no TLA).
const REQUIRED_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://noop',
  ELASTIC_URL: 'noop',
  ELASTIC_INDEX: 'noop',
  AUTH_SECRET: 'testsecret',
  AUTH_AUDIENCE: 'testaud',
  EMAIL_HOST: 'noop',
  EMAIL_PORT: '25',
  EMAIL_USER: 'noop',
  EMAIL_PASS: 'noop',
  EMAIL_INBOUND_DOMAIN: 'noop',
  GEOCODIO_API_KEY: 'noop',
  OPENAI_API_KEY: 'noop',
  OPENAI_ORGANIZATION: 'noop',
  WEBHOOK_KEY: 'noop',
  BADGR_USERNAME: 'noop',
  BADGR_PASSWORD: 'noop',
  BADGR_ISSUER: 'noop',
  SHOPIFY_API_TOKEN: 'noop',
  SHOPIFY_API_KEY: 'noop',
  SHOPIFY_API_SECRET_KEY: 'noop',
  SHOPIFY_STORE_DOMAIN: 'noop',
  LINEAR_API_KEY: 'noop',
  LINEAR_TEAM_ID: 'noop',
  LINEAR_PROBLEM_LABEL_ID: 'noop',
  METRICS_KEY: 'noop',
  PLACID_API_TOKEN: 'noop',
  ATTIO_API_TOKEN: 'noop',
  ATTIO_ALUMNI_LIST: 'noop',
};
for (const [k, v] of Object.entries(REQUIRED_ENV)) process.env[k] ||= v;

// reflect-metadata must be loaded before any type-graphql @InputType/@Field
// decorators run (which happens at module load of EventsWhereInput).
require('reflect-metadata');
const { EventsWhereInput } = require('../src/inputs/EventsWhereInput') as typeof import('../src/inputs/EventsWhereInput');
const { AuthContext, AuthRole, AuthByTarget } = require('../src/context') as typeof import('../src/context');
const { signTokenUser } = require('../src/utils/signToken') as typeof import('../src/utils/signToken');

// Helper: build an EventsWhereInput with only `mine` set.
function mineInput(mine = true): InstanceType<typeof EventsWhereInput> {
  const input = new EventsWhereInput();
  input.mine = mine;
  return input;
}

// Helper: the mine clause is the 4th AND element of toQuery's output.
function mineClause(auth: AuthContext): { OR?: unknown[] } {
  const query = mineInput(true).toQuery(auth);
  return (query.AND as unknown[])[3] as { OR?: unknown[] };
}

// Per the bug report: every mentor/student token ever issued in this repo is
// ID-target (tgt: AuthByTarget.ID, sid: <user-id>) via signTokenUser, for which
// AuthContext.id is set and AuthContext.username is undefined.
const mentorToken = signTokenUser({ id: 'mentor-id-1', eventId: 'event-1', maxWeeks: 6 } as any);
const studentToken = signTokenUser({ id: 'student-id-1', eventId: 'event-1' } as any);

// A username-target manager token is the designed-for (validate() admits
// managers with username, not id) but no in-repo issuer mints it; we mint one
// directly to exercise that path.
const managerToken = jwtSign(
  { typ: AuthRole.MANAGER, tgt: AuthByTarget.USERNAME, sid: 'mgr1', evt: 'event-1' },
  process.env.AUTH_SECRET!,
  { audience: process.env.AUTH_AUDIENCE!, noTimestamp: true },
);
const unameMentorToken = jwtSign(
  { typ: AuthRole.MENTOR, tgt: AuthByTarget.USERNAME, sid: 'alice', evt: 'event-1' },
  process.env.AUTH_SECRET!,
  { audience: process.env.AUTH_AUDIENCE!, noTimestamp: true },
);

test('ID-target mentor token carries auth.id and not auth.username (bug premise)', () => {
  const auth = new AuthContext(mentorToken);
  assert.equal(auth.isMentor, true);
  assert.equal(auth.id, 'mentor-id-1');
  assert.equal(auth.username, undefined);
});

test('mine:true for an ID-target mentor matches by id, never by empty username', () => {
  const auth = new AuthContext(mentorToken);
  const clause = mineClause(auth);
  assert.ok(clause.OR, 'mine clause present');

  // deepEqual ignores undefined-valued own properties, mirroring Prisma's
  // behavior of stripping undefined keys (verified empirically with Prisma 3).
  assert.deepEqual(clause.OR, [
    { mentors: { some: { OR: [{ id: 'mentor-id-1' }, { username: undefined }] } } },
    { students: { some: { OR: [{ id: 'mentor-id-1' }, { username: undefined }] } } },
  ]);

  // The manager branch must NOT be emitted for an ID-target caller (auth.username
  // is undefined): otherwise it would collapse to {mentors:{some:{}}} and match
  // every event that has any mentor.
  assert.equal(clause.OR!.length, 2);

  const json = JSON.stringify(mineInput(true).toQuery(auth));
  assert.match(json, /"id":"mentor-id-1"/);
  assert.doesNotMatch(json, /"username":""/);
  assert.doesNotMatch(json, /"managerUsername":""/);
  assert.doesNotMatch(json, /"managerUsername"/);
});

test('mine:true for an ID-target student matches by id', () => {
  const auth = new AuthContext(studentToken);
  assert.equal(auth.isStudent, true);
  assert.equal(auth.id, 'student-id-1');
  assert.equal(auth.username, undefined);

  const clause = mineClause(auth);
  assert.deepEqual(clause.OR, [
    { mentors: { some: { OR: [{ id: 'student-id-1' }, { username: undefined }] } } },
    { students: { some: { OR: [{ id: 'student-id-1' }, { username: undefined }] } } },
  ]);
  assert.equal(clause.OR!.length, 2);

  const json = JSON.stringify(mineInput(true).toQuery(auth));
  assert.match(json, /"id":"student-id-1"/);
  assert.doesNotMatch(json, /"username":""/);
  assert.doesNotMatch(json, /"managerUsername"/);
});

test('mine:true for a username-target mentor matches by username and includes the manager branch', () => {
  const auth = new AuthContext(unameMentorToken);
  assert.equal(auth.isMentor, true);
  assert.equal(auth.id, undefined);
  assert.equal(auth.username, 'alice');

  const clause = mineClause(auth);
  // Because auth.username is defined, the manager branch IS emitted.
  assert.deepEqual(clause.OR, [
    { mentors: { some: { OR: [{ id: undefined }, { username: 'alice' }] } } },
    { students: { some: { OR: [{ id: undefined }, { username: 'alice' }] } } },
    { mentors: { some: { managerUsername: 'alice' } } },
  ]);
  assert.equal(clause.OR!.length, 3);

  const json = JSON.stringify(mineInput(true).toQuery(auth));
  assert.match(json, /"username":"alice"/);
  assert.match(json, /"managerUsername":"alice"/);
  assert.doesNotMatch(json, /"username":""/);
  assert.doesNotMatch(json, /"managerUsername":""/);
});

test('mine:true for a username-target manager matches managed mentors by username', () => {
  const auth = new AuthContext(managerToken);
  assert.equal(auth.isManager, true);
  assert.equal(auth.id, undefined);
  assert.equal(auth.username, 'mgr1');

  const clause = mineClause(auth);
  assert.deepEqual(clause.OR, [
    { mentors: { some: { OR: [{ id: undefined }, { username: 'mgr1' }] } } },
    { students: { some: { OR: [{ id: undefined }, { username: 'mgr1' }] } } },
    { mentors: { some: { managerUsername: 'mgr1' } } },
  ]);
  assert.equal(clause.OR!.length, 3);

  const json = JSON.stringify(mineInput(true).toQuery(auth));
  assert.match(json, /"managerUsername":"mgr1"/);
  assert.doesNotMatch(json, /"managerUsername":""/);
  assert.doesNotMatch(json, /"username":""/);
});

test('mine:true for an unauthenticated caller does not emit a username:"" leak and omits the manager branch', () => {
  const auth = new AuthContext(undefined);
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.id, undefined);
  assert.equal(auth.username, undefined);

  const clause = mineClause(auth);
  // No manager branch (auth.username undefined), so the OR has two participants
  // branches whose {id}/{username} are all undefined — Prisma strips undefined
  // keys, leaving OR:[{},{}] which matches nothing (verified empirically).
  assert.equal(clause.OR!.length, 2);
  assert.deepEqual(clause.OR, [
    { mentors: { some: { OR: [{ id: undefined }, { username: undefined }] } } },
    { students: { some: { OR: [{ id: undefined }, { username: undefined }] } } },
  ]);

  const json = JSON.stringify(mineInput(true).toQuery(auth));
  // No empty-string fallback anywhere (the original bug).
  assert.doesNotMatch(json, /"username":""/);
  assert.doesNotMatch(json, /"managerUsername":""/);
  // No manager branch at all, so no {mentors:{some:{}}} "any mentor" leak.
  assert.doesNotMatch(json, /"managerUsername"/);
  // No identifying id/username value — i.e. the predicate matches no one.
  assert.doesNotMatch(json, /"id":"[^"]/);
  assert.doesNotMatch(json, /"username":"[^"]/);
});

test('mine:false/unset produces no mine clause', () => {
  const auth = new AuthContext(mentorToken);
  const query = new EventsWhereInput().toQuery(auth);
  // The mine slot of the AND array is {} when mine is not set.
  assert.deepEqual((query.AND as unknown[])[3], {});
});

test('mine:true composes with the other filters without losing them', () => {
  const auth = new AuthContext(mentorToken);
  const input = new EventsWhereInput();
  input.mine = true;
  input.public = true;
  input.partnerCode = 'CODE';
  const query = input.toQuery(auth) as any;
  const and = query.AND as unknown[];
  assert.equal(and.length, 4);
  assert.deepEqual(and[0], { partnersOnly: false });          // public
  assert.deepEqual(and[1], {});                              // dateFilter (no state)
  assert.deepEqual(and[2], {
    partners: { some: { partnerCode: { equals: 'CODE', mode: 'insensitive' } } },
  });
  assert.ok((and[3] as any).OR, 'mine OR present');
});

test('no toQuery output across scenarios contains the buggy `username:""`/`managerUsername:""` fallback', () => {
  const scenarios: AuthContext[] = [
    new AuthContext(mentorToken),
    new AuthContext(studentToken),
    new AuthContext(unameMentorToken),
    new AuthContext(managerToken),
    new AuthContext(undefined),
  ];
  for (const auth of scenarios) {
    assert.doesNotMatch(
      JSON.stringify(mineInput(true).toQuery(auth)),
      /"username":""|{"username":""}|"managerUsername":""/,
      `empty-string fallback leaked for auth id=${auth.id} username=${auth.username}`,
    );
  }
});
