/**
 * Offline unit tests for the `finishMatching` activity guard and the `runActivity`
 * runner's async await/error-propagation contract. Guards against two silent-failure
 * footguns: (1) removing the `auth.eventId` guard would reintroduce the mass-update
 * bug where an unscoped admin token flips `matchComplete` on every Event row, and
 * (2) reverting `runActivity` to a synchronous call would swallow async activity
 * errors into a `true` return.
 *
 * Run with:
 *   npx tsx src/activities/tasks/finishMatching.test.ts
 */
import 'reflect-metadata';
import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';

// src/config.ts validates ~28 env vars at module load and throws if any are missing.
// It is transitively imported by the module under test, and static `import`
// statements are hoisted above this statement, so every import above is
// config-free. The config-pulling modules are loaded with dynamic `import()` inside
// main(), after the env is populated.
const ENV: Record<string, string> = {
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
for (const [k, v] of Object.entries(ENV)) process.env[k] = process.env[k] || v;

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

async function assertRejectsWith(
  promise: Promise<unknown>,
  needle: string,
  message: string,
): Promise<void> {
  try {
    await promise;
    failures += 1;
    console.error(`FAILED: ${message} (expected rejection containing "${needle}")`);
  } catch (ex) {
    const text = ex instanceof Error ? ex.message : String(ex);
    if (text.includes(needle)) {
      console.log(`PASSED: ${message}`);
    } else {
      failures += 1;
      console.error(`FAILED: ${message} (rejected with "${text}", expected "${needle}")`);
    }
  }
}

function makeFakePrisma() {
  const calls: { method: string; args: unknown[] }[] = [];
  const prisma: any = {
    event: {
      updateMany: async (args: unknown) => {
        calls.push({ method: 'event.updateMany', args: [args] });
        return { count: 1 };
      },
    },
  };
  return { prisma, calls };
}

function fakeContext(eventId: string | undefined): { auth: { eventId: string | undefined } } {
  return { auth: { eventId } } as any;
}

async function main(): Promise<void> {
  // Dynamic imports: these pull in src/config (env now set) and the task registry.
  const { default: finishMatching } = await import('./finishMatching');
  const { runActivity } = await import('../');

  // The guard must reject before any write when the event scope is missing, so an
  // unscoped admin token cannot trigger a match-all `event.updateMany`.
  {
    const { prisma, calls } = makeFakePrisma();
    Container.set(PrismaClient, prisma as any);
    await assertRejectsWith(
      finishMatching(fakeContext(undefined) as any),
      'event must be specified',
      'finishMatching rejects when auth.eventId is undefined',
    );
    assertEqual(
      calls.filter((c) => c.method === 'event.updateMany').length,
      0,
      'finishMatching never calls event.updateMany when eventId is undefined',
    );
  }

  // The happy path must still scope the update to exactly the one event, never an
  // empty `where` (which Prisma would treat as a match-all).
  {
    const { prisma, calls } = makeFakePrisma();
    Container.set(PrismaClient, prisma as any);
    await finishMatching(fakeContext('ev1') as any);
    const updates = calls.filter((c) => c.method === 'event.updateMany');
    assertEqual(updates.length, 1, 'finishMatching calls event.updateMany exactly once for a scoped event');
    assertEqual(
      (updates[0].args[0] as any).where,
      { id: 'ev1' },
      'finishMatching scopes the update to exactly the specified event id',
    );
    assertEqual(
      (updates[0].args[0] as any).data,
      { matchComplete: true },
      'finishMatching sets matchComplete=true',
    );
  }

  // runActivity must await its (async) task and propagate rejections. The prior
  // synchronous implementation returned a Promise as truthy `true` and never saw
  // async throws, turning the guard into a silent no-op.
  {
    const { prisma, calls } = makeFakePrisma();
    Container.set(PrismaClient, prisma as any);
    await assertRejectsWith(
      runActivity('finishMatching', fakeContext(undefined) as any, {}),
      'event must be specified',
      'runActivity awaits its task and propagates async throws',
    );
    assertEqual(
      calls.filter((c) => c.method === 'event.updateMany').length,
      0,
      'runActivity does not swallow a rejected task into a successful return',
    );

    const result = await runActivity('finishMatching', fakeContext('ev2') as any, {});
    assertEqual(result, true, 'runActivity resolves true when a known activity completes');
    const updates = calls.filter((c) => c.method === 'event.updateMany');
    assertEqual(updates.length, 1, 'runActivity actually ran the activity');
    assertEqual((updates[0].args[0] as any).where, { id: 'ev2' }, 'runActivity scoped the update to the event id');

    assertEqual(
      await runActivity('___no_such_activity___', fakeContext(undefined) as any, {}),
      false,
      'runActivity resolves false for an unknown activity name',
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main().catch((ex) => {
  console.error('Test harness crashed:', ex);
  process.exit(1);
});
