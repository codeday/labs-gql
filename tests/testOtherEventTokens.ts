import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { verify, decode } from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Set ALL env vars required by src/config.ts BEFORE any import that transitively
// loads src/config (signToken, AuthContext, LoginResolver all pull config).
// The `import` statements above (node:test, node:assert/strict, jsonwebtoken) do
// not touch config; the assignments below run before the `require()` calls below.
// ---------------------------------------------------------------------------
const REQUIRED_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ELASTIC_URL: 'http://localhost:9200',
  ELASTIC_INDEX: 'test',
  AUTH_SECRET: 'test-manager-token-secret',
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
for (const [k, v] of Object.entries(REQUIRED_ENV)) {
  if (!process.env[k]) process.env[k] = v;
}

// Now load config-dependent modules (order matters; these would throw if env unset).
// NOTE: signToken, AuthContext and JwtToken are safe to load under tsx (esbuild)
// because they only use `registerEnumType` (no inferred @Field reflection). The
// full LoginResolver pulls the entire type-graphql object graph (e.g. FileType)
// which relies on `emitDecoratorMetadata`; esbuild does not emit that, so we load
// the resolver from the tsc-compiled `dist/` build instead (see test plan).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signTokenManager, signTokenAdmin } = require('../src/utils/signToken') as typeof import('../src/utils/signToken');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthContext } = require('../src/context/auth/AuthContext') as typeof import('../src/context/auth/AuthContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthRole, AuthByTarget } = require('../src/context/auth/JwtToken') as typeof import('../src/context/auth/JwtToken');

// The resolver is loaded from the compiled dist/ build (tsc emits decorator
// metadata that esbuild/tsx cannot). `npx tsc --skipLibCheck` must have been run.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LoginResolver } = require('../dist/resolvers/Login') as typeof import('../src/resolvers/Login');

const SECRET = process.env.AUTH_SECRET!;
const AUDIENCE = process.env.AUTH_AUDIENCE!;

// Minimal Event-shaped objects (only `id` is read by the signers).
const mkEvent = (id: string) => ({ id, name: `Event ${id}` }) as any;

function decodePayload(token: string): any {
  return decode(token, { complete: true })!.payload;
}

test('signTokenManager embeds MANAGER role + identity (not admin)', () => {
  const event = mkEvent('evt-fixed');
  const token = signTokenManager(event, 'mgr-alice');

  const payload = decodePayload(token);
  assert.equal(payload.typ, AuthRole.MANAGER, 'typ must be MANAGER (mm), not admin (a)');
  assert.equal(payload.evt, 'evt-fixed', 'evt must carry the event id');
  assert.equal(payload.tgt, AuthByTarget.USERNAME, 'tgt must point to USERNAME so auth.username resolves');
  assert.equal(payload.sid, 'mgr-alice', 'sid must carry the manager username');
  assert.notEqual(payload.typ, AuthRole.ADMIN, 'must not be an admin token');

  // token must verify against the shared secret/audience
  const verified = verify(token, SECRET, { audience: AUDIENCE }) as any;
  assert.equal(verified.typ, AuthRole.MANAGER);
  assert.equal(verified.sid, 'mgr-alice');
});

test('a signTokenManager-minted token round-trips through AuthContext as a manager', () => {
  const event = mkEvent('evt-rt');
  const token = signTokenManager(event, 'mgr-bob');

  // Must not throw during validate()
  const auth = new AuthContext(token);
  assert.equal(auth.isManager, true);
  assert.equal(auth.isAdmin, false);
  assert.equal(auth.username, 'mgr-bob', 'auth.username must resolve from tgt=USERNAME/sid');
  assert.equal(auth.eventId, 'evt-rt');
});

test('otherEventTokens: manager branch scopes to the caller\'s managed events and mints MANAGER tokens', async () => {
  const event = mkEvent('evt-owned-1');
  const otherEvent = mkEvent('evt-owned-2');
  const mockEvents = [event, otherEvent];

  // Mock prisma: capture the findMany args and return the manager's events.
  let findManyCallCount = 0;
  let findManyArgs: any;
  const mockPrisma = {
    event: {
      findMany: async (args?: any) => {
        findManyCallCount += 1;
        findManyArgs = args;
        return mockEvents; // in real life the WHERE clause filters to these
      },
    },
  };

  const resolver = new LoginResolver();
  (resolver as any).prisma = mockPrisma;

  const auth = new AuthContext(signTokenManager(mkEvent('evt-owned-1'), 'mgr-bob'));
  assert.equal(auth.isManager, true);

  const result = await resolver.otherEventTokens({ auth } as any);

  // Guarantee 1: findMany MUST be scoped by caller identity (no unfiltered findMany()).
  assert.equal(findManyCallCount, 1, 'event.findMany should be called exactly once');
  assert.deepEqual(
    findManyArgs,
    { where: { mentors: { some: { managerUsername: 'mgr-bob' } } } },
    'manager branch must scope by the caller\'s managerUsername, not return all events',
  );

  // Guarantee 2: results map back to the scoped events only.
  assert.equal(result.length, mockEvents.length);
  assert.deepEqual(result.map((r: any) => r.event.id), ['evt-owned-1', 'evt-owned-2']);

  // Guarantee 3: every minted token is a MANAGER token tied to the manager identity & event.
  for (const r of result) {
    const p = decodePayload(r.token);
    assert.equal(p.typ, AuthRole.MANAGER, 'manager branch must mint MANAGER tokens, not admin');
    assert.notEqual(p.typ, AuthRole.ADMIN, 'must not escalate to admin');
    assert.equal(p.tgt, AuthByTarget.USERNAME);
    assert.equal(p.sid, 'mgr-bob');
    assert.equal(p.evt, r.event.id);
    // and the token must validate as a real manager AuthContext
    const roundtrip = new AuthContext(r.token);
    assert.equal(roundtrip.isManager, true);
    assert.equal(roundtrip.isAdmin, false);
    assert.equal(roundtrip.username, 'mgr-bob');
  }
});

test('otherEventTokens: manager branch passes a scoped where even when the manager owns no events', async () => {
  let findManyArgs: any;
  const mockPrisma = {
    event: {
      findMany: async (args?: any) => {
        findManyArgs = args;
        return [];
      },
    },
  };
  const resolver = new LoginResolver();
  (resolver as any).prisma = mockPrisma;

  const auth = new AuthContext(signTokenManager(mkEvent('evt-x'), 'mgr-empty'));
  const result = await resolver.otherEventTokens({ auth } as any);

  assert.deepEqual(result, []);
  assert.ok(
    Boolean(findManyArgs && findManyArgs.where && findManyArgs.where.mentors
      && findManyArgs.where.mentors.some && findManyArgs.where.mentors.some.managerUsername === 'mgr-empty'),
    'findMany must always carry the scoped where predicate by caller identity',
  );
});

test('regression: otherEventTokens admin branch still returns all events with ADMIN tokens (unchanged)', async () => {
  const a = mkEvent('evt-admin-1');
  const b = mkEvent('evt-admin-2');
  const allEvents = [a, b];

  let findManyArgs: any;
  const mockPrisma = {
    event: {
      findMany: async (args?: any) => {
        findManyArgs = args;
        return allEvents;
      },
    },
  };
  const resolver = new LoginResolver();
  (resolver as any).prisma = mockPrisma;

  // Admin token: no username/id, has evt.
  const auth = new AuthContext(signTokenAdmin(mkEvent('evt-admin-1')));
  assert.equal(auth.isAdmin, true);
  assert.equal(auth.isManager, false);

  const result = await resolver.otherEventTokens({ auth } as any);

  assert.equal(result.length, 2);
  assert.ok(findManyArgs === undefined || Object.keys(findManyArgs).length === 0,
    'admin branch must remain an unfiltered findMany()');

  for (const r of result) {
    const p = decodePayload(r.token);
    assert.equal(p.typ, AuthRole.ADMIN, 'admin branch still mints admin tokens');
    assert.equal(p.evt, r.event.id);
    assert.equal(p.sid, undefined, 'admin tokens carry no identity');
    assert.equal(p.tgt, undefined);
  }
});
