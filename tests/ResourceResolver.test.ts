/**
 * Offline unit tests for ResourceResolver.resources().
 *
 * Regression guard for the bug where the GraphQL `resources` query threw a
 * PrismaClientValidationError for admin callers: `WHERE_KEYS` had no entry for
 * AuthRole.ADMIN, so the computed-key expression `{ [undefined]: true }` was
 * coerced to the unknown Prisma field `{ "undefined": true }`.
 *
 * No live database is required. The resolver's PrismaClient is replaced with
 * an inline fake that records the `where` argument of each `findMany` call and
 * returns a sentinel array. The admin code path is additionally exercised with
 * a REAL admin JWT (via signTokenAdmin) and a real AuthContext, to verify the
 * end-to-end auth shape that originally triggered the bug.
 *
 * `src/config.ts` validates required env vars at import time and throws if any
 * are missing, so `./setupEnv` (which populates dummy values) is imported FIRST
 * — before any module that transitively loads `src/config.ts`. ESM/tsx
 * evaluates imported modules in source order, so this guarantees the env vars
 * are set in time.
 *
 * Run with:
 *   npx ts-node tests/ResourceResolver.test.ts
 *
 * Note: `npx tsx` (esbuild) does NOT work here — it skips decorator metadata
 * emission, which type-graphql's @Field decorators require. Use `ts-node`,
 * which runs the TypeScript compiler and respects `emitDecoratorMetadata`.
 */
import './setupEnv';
import 'reflect-metadata';
import { ResourceResolver } from '../src/resolvers/Resource';
import { AuthContext, AuthRole } from '../src/context';
import { signTokenAdmin, signTokenManager } from '../src/utils/signToken';

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

// Minimal fake PrismaClient: only `resource.findMany` is exercised. It records
// the `where` arg of the most recent call and returns a sentinel array.
const SENTINEL = [{ id: 'resource-1', name: 'sentinel', eventId: 'evt-1' }];
let lastWhere: any;
let findManyCalls = 0;
const fakePrisma: any = {
  resource: {
    findMany: async (args: { where: any }) => {
      findManyCalls += 1;
      lastWhere = args.where;
      return SENTINEL;
    },
  },
};

function makeResolver(): ResourceResolver {
  const resolver = new ResourceResolver();
  (resolver as any).prisma = fakePrisma;
  return resolver;
}

type FakeAuth = {
  isAdmin: boolean;
  isManager: boolean;
  isStudent: boolean;
  isMentor: boolean;
  isPartner: boolean;
  type: AuthRole;
  eventId?: string;
};

function makeAuth(role: AuthRole, eventId = 'evt-1'): FakeAuth {
  return {
    isAdmin: role === AuthRole.ADMIN,
    isManager: role === AuthRole.MANAGER,
    isStudent: role === AuthRole.STUDENT,
    isMentor: role === AuthRole.MENTOR,
    isPartner: role === AuthRole.PARTNER,
    type: role,
    eventId,
  };
}

async function runWithFakeAuth(role: AuthRole, eventId = 'evt-1'): Promise<{ where: any, result: any }> {
  const resolver = makeResolver();
  findManyCalls = 0;
  lastWhere = undefined;
  const result = await resolver.resources({ auth: makeAuth(role, eventId) } as any);
  assert(findManyCalls === 1, `${role}: findMany called exactly once`);
  return { where: lastWhere, result };
}

async function runWithRealAuth(auth: AuthContext): Promise<{ where: any, result: any }> {
  const resolver = makeResolver();
  findManyCalls = 0;
  lastWhere = undefined;
  const result = await resolver.resources({ auth } as any);
  assert(findManyCalls === 1, 'real-auth: findMany called exactly once');
  return { where: lastWhere, result };
}

const DISPLAY_KEYS = ['displayToMentors', 'displayToStudents', 'displayToPartners', 'displayToManagers'];

async function main(): Promise<void> {
  // ---- ADMIN (the bug) with a fake auth object ----
  {
    const { where, result } = await runWithFakeAuth(AuthRole.ADMIN);
    assert(!('undefined' in where), 'ADMIN: where does NOT contain the bogus "undefined" key (regression guard)');
    assert(!DISPLAY_KEYS.some((k) => k in where), 'ADMIN: where is NOT restricted by any displayTo* flag');
    assert('eventId' in where, 'ADMIN: where scopes by eventId');
    assertEqual(where.eventId, 'evt-1', 'ADMIN: where.eventId equals the admin event id');
    assertEqual(Object.keys(where).length, 1, 'ADMIN: where has exactly one key (eventId only)');
    assertEqual(JSON.stringify(result), JSON.stringify(SENTINEL), 'ADMIN: resources() returns findMany result without throwing');
  }

  // ---- MANAGER ----
  {
    const { where, result } = await runWithFakeAuth(AuthRole.MANAGER);
    assert(!('undefined' in where), 'MANAGER: where does NOT contain the bogus "undefined" key');
    assertEqual(where.displayToManagers, true, 'MANAGER: where.displayToManagers === true');
    assertEqual(where.eventId, 'evt-1', 'MANAGER: where.eventId equals caller event id');
    assertEqual(JSON.stringify(result), JSON.stringify(SENTINEL), 'MANAGER: resources() returns findMany result');
  }

  // ---- STUDENT ----
  {
    const { where, result } = await runWithFakeAuth(AuthRole.STUDENT);
    assert(!('undefined' in where), 'STUDENT: where does NOT contain the bogus "undefined" key');
    assertEqual(where.displayToStudents, true, 'STUDENT: where.displayToStudents === true');
    assertEqual(where.eventId, 'evt-1', 'STUDENT: where.eventId equals caller event id');
    assertEqual(JSON.stringify(result), JSON.stringify(SENTINEL), 'STUDENT: resources() returns findMany result');
  }

  // ---- MENTOR ----
  {
    const { where, result } = await runWithFakeAuth(AuthRole.MENTOR);
    assert(!('undefined' in where), 'MENTOR: where does NOT contain the bogus "undefined" key');
    assertEqual(where.displayToMentors, true, 'MENTOR: where.displayToMentors === true');
    assertEqual(where.eventId, 'evt-1', 'MENTOR: where.eventId equals caller event id');
    assertEqual(JSON.stringify(result), JSON.stringify(SENTINEL), 'MENTOR: resources() returns findMany result');
  }

  // ---- Event scoping: admin for a different event scopes correctly ----
  {
    const { where, result } = await runWithFakeAuth(AuthRole.ADMIN, 'evt-2');
    assertEqual(where.eventId, 'evt-2', 'ADMIN(evt-2): where scoped to the provided event id');
    assert(!('undefined' in where), 'ADMIN(evt-2): where does NOT contain the bogus "undefined" key');
    assertEqual(Object.keys(where).length, 1, 'ADMIN(evt-2): where has only eventId');
    assertEqual(JSON.stringify(result), JSON.stringify(SENTINEL), 'ADMIN(evt-2): resources() returns findMany result');
  }

  // ---- End-to-end admin auth path (the real-world trigger of the bug) ----
  {
    const token = signTokenAdmin({ id: 'evt-real' } as any);
    const auth = new AuthContext(token);
    assert(auth.isAdmin, 'real admin AuthContext.isAdmin === true');
    assertEqual(auth.type, AuthRole.ADMIN, 'real admin AuthContext.type === ADMIN');
    assertEqual(auth.eventId, 'evt-real', 'real admin AuthContext.eventId === evt-real');

    const { where, result } = await runWithRealAuth(auth);
    assert(!('undefined' in where), 'real admin: where does NOT contain the bogus "undefined" key');
    assert(!DISPLAY_KEYS.some((k) => k in where), 'real admin: where is NOT restricted by any displayTo* flag');
    assertEqual(where.eventId, 'evt-real', 'real admin: where scoped to admin event id');
    assertEqual(Object.keys(where).length, 1, 'real admin: where has only eventId');
    assertEqual(JSON.stringify(result), JSON.stringify(SENTINEL), 'real admin: returns resources without throwing (bug fixed)');
  }

  // ---- End-to-end manager auth path (no regression through real auth) ----
  {
    const token = signTokenManager({ id: 'evt-real' } as any);
    const auth = new AuthContext(token);
    assert(auth.isManager, 'real manager AuthContext.isManager === true');
    assertEqual(auth.type, AuthRole.MANAGER, 'real manager AuthContext.type === MANAGER');

    const { where, result } = await runWithRealAuth(auth);
    assert(!('undefined' in where), 'real manager: where does NOT contain the bogus "undefined" key');
    assertEqual(where.displayToManagers, true, 'real manager: where.displayToManagers === true (filter preserved)');
    assertEqual(where.eventId, 'evt-real', 'real manager: where scoped to manager event id');
    assertEqual(JSON.stringify(result), JSON.stringify(SENTINEL), 'real manager: returns resources without throwing');
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll assertions passed.');
  }
}

main().catch((err) => {
  console.error('Test harness threw:', err);
  process.exit(1);
});
