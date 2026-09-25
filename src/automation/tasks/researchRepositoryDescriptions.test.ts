/**
 * Offline integration tests for the researchRepositoryDescriptions retry/stamp contract.
 *
 * Contract under test (matching the sibling generatePrDescriptions task):
 *   - On a genuine exception (auth/credits/model access/outage), repository.update
 *     is NOT called, so `descriptionsFetchedAt` stays null and the repository is
 *     re-selected and retried on the next run.
 *   - On a completed-but-unproductive ("soft-null") call — the AI returned nothing
 *     usable — `descriptionsFetchedAt` IS stamped (with no description keys) so the
 *     repository isn't re-billed forever. This is the deliberate cost-saving design
 *     introduced in 6366007 and must be preserved.
 *   - A pre-existing description is never re-researched; the missing one alone is.
 *
 * No live DB or OpenRouter access — the Prisma and openRouterAi (OpenAI SDK-shaped)
 * clients are stubbed via typedi's `Container.set` (the same injection seam
 * `src/di.ts` uses).
 *
 * Run with:
 *   npx ts-node src/automation/tasks/researchRepositoryDescriptions.test.ts
 *   (or) npx ts-node --transpile-only src/automation/tasks/researchRepositoryDescriptions.test.ts
 */
const envDefaults: Record<string, string> = {
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
  LINEAR_BLOCKING_LABEL_ID: 'test',
  METRICS_KEY: 'test',
  PLACID_API_TOKEN: 'test',
  ATTIO_API_TOKEN: 'test',
  ATTIO_ALUMNI_LIST: 'test',
  GITHUB_TOKEN: 'test',
  OPENROUTER_API_KEY: 'test',
};
for (const [k, v] of Object.entries(envDefaults)) {
  if (!process.env[k]) process.env[k] = v;
}

import 'reflect-metadata';
import Container from 'typedi';
import OpenAIApi, { APIError } from 'openai';
import { PrismaClient } from '@prisma/client';

process.env.DEBUG = 'codeday:labs:automation:tasks:researchRepositoryDescriptions';
import debugLib from 'debug';
debugLib.enable(process.env.DEBUG);

import researchRepositoryDescriptions from './researchRepositoryDescriptions';

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

function hasOwn(obj: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

interface RepoRow {
  id: string;
  name: string;
  url: string;
  useDescription: string | null;
  impactDescription: string | null;
  descriptionsFetchedAt: Date | null;
}

type UpdateRecord = { where: { id: string }; data: Record<string, unknown> };

function makeRepo(overrides: Partial<RepoRow> = {}): RepoRow {
  return {
    id: 'repo-1',
    name: 'foo/bar',
    url: 'https://github.com/foo/bar',
    useDescription: null,
    impactDescription: null,
    descriptionsFetchedAt: null,
    ...overrides,
  };
}

// A scripted response of `null` means "soft-null" (the model produced no usable
// tool call -> requestSentence returns null). A string means "a valid sentence".
// An Error means "the SDK threw" (a non-retryable failure surfaces here immediately).
type ScriptEntry = string | null | Error;

// Builds an OpenAI-SDK-shaped client whose `chat.completions.create` consumes the
// script in call order, recording how many calls were made so tests can assert that
// a failed use-research short-circuits the impact-research.
function makeOpenRouter(script: ScriptEntry[]): { client: unknown; createCalls: { count: number } } {
  let i = 0;
  const createCalls = { count: 0 };
  const client = {
    chat: {
      completions: {
        create: async (): Promise<unknown> => {
          createCalls.count += 1;
          if (i >= script.length) {
            throw new Error(`OpenRouter stub ran out of scripted responses at call ${i + 1}`);
          }
          const next = script[i++];
          if (next instanceof Error) throw next;
          if (next === null) {
            // No tool call -> requestSentence returns null (soft-null).
            return { choices: [{ message: {} }] };
          }
          return {
            choices: [{
              message: {
                tool_calls: [{
                  type: 'function',
                  function: {
                    name: 'submit_sentence',
                    arguments: JSON.stringify({ sentence: next }),
                  },
                }],
              },
            }],
          };
        },
      },
    },
  };
  return { client, createCalls };
}

function setOpenRouterStub(client: unknown): void {
  Container.set('openRouterAi', client as unknown as OpenAIApi);
}

// Simple in-memory prisma: findMany returns the seeded rows verbatim every call;
// update records each call. Use this when a test only needs one tick.
function makeFakePrisma(rows: RepoRow[]): { prisma: unknown; updates: UpdateRecord[] } {
  const updates: UpdateRecord[] = [];
  const prisma = {
    repository: {
      findMany: async () => rows.map((r) => ({
        id: r.id, name: r.name, url: r.url,
        useDescription: r.useDescription, impactDescription: r.impactDescription,
      })),
      update: async (args: UpdateRecord) => { updates.push(args); return undefined; },
    },
  };
  return { prisma, updates };
}

// Store-backed prisma that reproduces the production `where: { descriptionsFetchedAt:
// null }` selection and actually persists updates, so a test can run multiple ticks
// and observe whether a previously-failed row is re-selected.
function makeStorePrisma(seed: Map<string, RepoRow>): {
  prisma: unknown;
  updates: UpdateRecord[];
  store: Map<string, RepoRow>;
} {
  const store = new Map(seed);
  const updates: UpdateRecord[] = [];
  const prisma = {
    repository: {
      findMany: async () => {
        const selected: RepoRow[] = [];
        for (const row of store.values()) {
          if (row.descriptionsFetchedAt === null) selected.push(row);
        }
        // Mimic the production `select` projection: only the fields the task reads.
        return selected.map((r) => ({
          id: r.id, name: r.name, url: r.url,
          useDescription: r.useDescription, impactDescription: r.impactDescription,
        }));
      },
      update: async (args: UpdateRecord) => {
        updates.push(args);
        const row = store.get(args.where.id);
        if (row) {
          if (hasOwn(args.data, 'useDescription')) row.useDescription = args.data.useDescription as string | null;
          if (hasOwn(args.data, 'impactDescription')) row.impactDescription = args.data.impactDescription as string | null;
          if (hasOwn(args.data, 'descriptionsFetchedAt')) row.descriptionsFetchedAt = args.data.descriptionsFetchedAt as Date;
        }
        return undefined;
      },
    },
  };
  return { prisma, updates, store };
}

// ---------------------------------------------------------------------------
// Test 1 (CORE bug-fix): a non-retryable 403 on the FIRST research() call must
// skip the entire update so descriptionsFetchedAt stays null and the repo is
// retried next run. Under the bug, the update ran with descriptionsFetchedAt
// set and no descriptions, permanently excluding the repo.
// ---------------------------------------------------------------------------
async function testUseThrowsSkipsUpdateAndImpact(): Promise<void> {
  const repo = makeRepo({ id: 'r-use-throws' });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([
    new APIError(403, { message: 'simulated 403 Forbidden' }, 'Simulated 403', undefined),
  ]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(updates.length, 0, 'Use-research 403: repository.update is NOT called (row stays retriable)');
  assertEqual(createCalls.count, 1, 'Use-research 403: impact research is short-circuited (only 1 create call)');
}

// ---------------------------------------------------------------------------
// Test 2 (design-decision guard): the FIRST research() returned a real sentence,
// but the SECOND threw. The recommended fix skips the whole update on any
// exception, so the repo (and its freshly-fetched use description) is retried
// next run rather than half-stamping. Asserts that an exception anywhere in the
// pass flips the skip flag.
// ---------------------------------------------------------------------------
async function testImpactThrowsSkipsUpdate(): Promise<void> {
  const repo = makeRepo({ id: 'r-impact-throws' });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([
    'Used to teach creative coding.',
    new APIError(402, { message: 'simulated 402 Payment Required' }, 'Simulated 402', undefined),
  ]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(createCalls.count, 2, 'Impact-throws: both use and impact were attempted');
  assertEqual(updates.length, 0, 'Impact-research 402: repository.update is NOT called (whole pass skipped, retried next run)');
}

// ---------------------------------------------------------------------------
// Test 3 (soft-null vs exception guard): a soft-null on use (the AI returned
// nothing usable) must NOT set the failed flag — impact is still attempted, and
// if impact then throws, the update is still skipped. Guards against an over-fix
// that treats "no description" as a failure and breaks the soft-null path.
// ---------------------------------------------------------------------------
async function testUseSoftNullImpactThrowsSkipsSoftNullDoesNotSetFailed(): Promise<void> {
  const repo = makeRepo({ id: 'r-softnull-then-throws' });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([
    null, // use -> soft-null (NOT a failure)
    new APIError(401, { message: 'simulated 401 Unauthorized' }, 'Simulated 401', undefined),
  ]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(createCalls.count, 2, 'Use soft-null then impact throws: BOTH calls attempted (soft-null is not a failure)');
  assertEqual(updates.length, 0, 'Use soft-null then impact throws: update skipped because impact threw (retried next run)');
  assert(!hasOwn(updates[0]?.data ?? {}, 'useDescription'),
    'no update payload exists (impact exception skipped the whole update)');
}

// ---------------------------------------------------------------------------
// Test 4 (PRESERVES the intentional 6366007 design): both calls completed but
// neither produced a usable sentence ("soft-null"). The repo MUST be stamped
// with descriptionsFetchedAt and no description keys, so it is NOT re-billed on
// every future run. This is the deliberate cost-saving decision the bug report
// says must remain intact.
// ---------------------------------------------------------------------------
async function testSoftNullOnBothStampsTimestampWithoutDescriptions(): Promise<void> {
  const repo = makeRepo({ id: 'r-soft-both' });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([null, null]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(createCalls.count, 2, 'Soft-null on both: both use and impact were attempted');
  assertEqual(updates.length, 1, 'Soft-null on both: repository.update IS called (intentional stamp-on-soft-null preserved)');
  assert(updates[0].data.descriptionsFetchedAt instanceof Date,
    'Soft-null on both: descriptionsFetchedAt is stamped (no re-billing on future runs)');
  assert(!hasOwn(updates[0].data, 'useDescription'),
    'Soft-null on both: no useDescription key on the update payload');
  assert(!hasOwn(updates[0].data, 'impactDescription'),
    'Soft-null on both: no impactDescription key on the update payload');
  assertEqual(updates[0].where.id, 'r-soft-both', 'Soft-null on both: update targets the right repo');
}

// ---------------------------------------------------------------------------
// Test 5 (happy path, regression guard): a normal successful pass persists BOTH
// descriptions plus the stamp.
// ---------------------------------------------------------------------------
async function testHappyPathPersistsBothDescriptions(): Promise<void> {
  const repo = makeRepo({ id: 'r-happy' });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([
    'Used to teach creative coding.',
    'Used by movie studios to exchange editorial data.',
  ]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(createCalls.count, 2, 'Happy path: both use and impact were attempted');
  assertEqual(updates.length, 1, 'Happy path: exactly one update');
  assertEqual(updates[0].where.id, 'r-happy', 'Happy path: update targets the right repo');
  assertEqual(updates[0].data.useDescription, 'Used to teach creative coding.',
    'Happy path: useDescription persisted');
  assertEqual(updates[0].data.impactDescription, 'Used by movie studios to exchange editorial data.',
    'Happy path: impactDescription persisted');
  assert(updates[0].data.descriptionsFetchedAt instanceof Date,
    'Happy path: descriptionsFetchedAt stamped');
}

// ---------------------------------------------------------------------------
// Test 6 (skip-already-set): useDescription is already populated, so use is NOT
// re-researched; impact throws -> update is still skipped so impact is retried.
// ---------------------------------------------------------------------------
async function testUseAlreadySetImpactThrowsSkipsUpdate(): Promise<void> {
  const repo = makeRepo({ id: 'r-use-set', useDescription: 'Already described.' });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([
    new APIError(403, { message: 'simulated 403 Forbidden' }, 'Simulated 403', undefined),
  ]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(createCalls.count, 1, 'Use already set: only impact was attempted (use not re-researched)');
  assertEqual(updates.length, 0, 'Use already set + impact throws: update skipped so impact is retried next run');
}

// ---------------------------------------------------------------------------
// Test 7 (skip-already-set, success): useDescription already populated; impact
// research succeeds -> stamp with the impact description, no use key, and do
// not re-research use.
// ---------------------------------------------------------------------------
async function testUseAlreadySetImpactSucceedsStamps(): Promise<void> {
  const repo = makeRepo({ id: 'r-use-set-ok', useDescription: 'Already described.' });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([
    'Art made with this hangs in the Met.',
  ]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(createCalls.count, 1, 'Use already set, impact succeeds: only impact attempted');
  assertEqual(updates.length, 1, 'Use already set, impact succeeds: one update');
  assertEqual(updates[0].data.impactDescription, 'Art made with this hangs in the Met.',
    'Use already set, impact succeeds: impactDescription persisted');
  assert(!hasOwn(updates[0].data, 'useDescription'),
    'Use already set, impact succeeds: useDescription key absent (not overwritten, not re-researched)');
  assert(updates[0].data.descriptionsFetchedAt instanceof Date,
    'Use already set, impact succeeds: descriptionsFetchedAt stamped');
}

// ---------------------------------------------------------------------------
// Test 8 (backfill / both-already-set): a row that already has BOTH
// descriptions but descriptionsFetchedAt=null (the pre-6366007 / post-migration
// state) must be stamped without any research calls, so it stops being
// re-selected. Guards against perpetual re-query churn.
// ---------------------------------------------------------------------------
async function testBothAlreadySetStampsTimestampOnly(): Promise<void> {
  const repo = makeRepo({
    id: 'r-both-set',
    useDescription: 'Already described.',
    impactDescription: 'Already impactful.',
    descriptionsFetchedAt: null,
  });
  const { prisma, updates } = makeFakePrisma([repo]);
  const { client, createCalls } = makeOpenRouter([]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(createCalls.count, 0, 'Both already set: no research calls made');
  assertEqual(updates.length, 1, 'Both already set: one update (stamp only)');
  assert(updates[0].data.descriptionsFetchedAt instanceof Date,
    'Both already set: descriptionsFetchedAt stamped (no re-query churn)');
  assert(!hasOwn(updates[0].data, 'useDescription'),
    'Both already set: useDescription key absent on the stamp-only update');
  assert(!hasOwn(updates[0].data, 'impactDescription'),
    'Both already set: impactDescription key absent on the stamp-only update');
}

// ---------------------------------------------------------------------------
// Test 9 (isolation across a batch): a failure on one repo must not block writes
// for other repos processed in the same findMany result. The failed repo is
// skipped; the successful repo still gets its update.
// ---------------------------------------------------------------------------
async function testMixedBatchIsolatesFailuresFromSuccesses(): Promise<void> {
  const a = makeRepo({ id: 'r-fail', name: 'failorg/badrepo', url: 'https://github.com/failorg/badrepo' });
  const b = makeRepo({ id: 'r-ok', name: 'goodorg/goodrepo', url: 'https://github.com/goodorg/goodrepo' });
  const { prisma, updates } = makeFakePrisma([a, b]);
  // Call order across the batch: r-fail use -> throw; r-fail impact -> (skipped by !failed);
  // r-ok use -> success; r-ok impact -> success.
  const { client } = makeOpenRouter([
    new APIError(403, { message: 'simulated 403 Forbidden' }, 'Simulated 403', undefined),
    'Used to teach creative coding.',
    'Used by movie studios to exchange editorial data.',
  ]);
  setOpenRouterStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  await researchRepositoryDescriptions();

  assertEqual(updates.length, 1, 'Mixed batch: only the successful repo is written');
  assertEqual(updates[0].where.id, 'r-ok', 'Mixed batch: the failed repo (r-fail) is skipped, the ok repo (r-ok) is written');
  assertEqual(updates[0].data.useDescription, 'Used to teach creative coding.',
    'Mixed batch: r-ok useDescription persisted');
  assertEqual(updates[0].data.impactDescription, 'Used by movie studios to exchange editorial data.',
    'Mixed batch: r-ok impactDescription persisted');
  assert(updates[0].data.descriptionsFetchedAt instanceof Date,
    'Mixed batch: r-ok descriptionsFetchedAt stamped');
}

// ---------------------------------------------------------------------------
// Test 10 (DURABLE retry contract, store-backed, multi-tick): tick 1 throws on
// the use-research -> no update, descriptionsFetchedAt stays null, so the SAME
// repo is re-selected on tick 2 and finally succeeded -> stamped. This is the
// end-to-end recovery path the bug permanently destroyed.
// ---------------------------------------------------------------------------
async function testFailedRepoIsReselectedAndRetriedNextTick(): Promise<void> {
  const store = makeStorePrisma(new Map([['r-retry', makeRepo({ id: 'r-retry' })]]));
  Container.set(PrismaClient, store.prisma as unknown as PrismaClient);

  // Tick 1: a non-retryable 403 on the use-research.
  const tick1 = makeOpenRouter([
    new APIError(403, { message: 'simulated 403 Forbidden' }, 'Simulated 403', undefined),
  ]);
  setOpenRouterStub(tick1.client);
  await researchRepositoryDescriptions();

  assertEqual(store.updates.length, 0, 'Tick 1 (403): no write, descriptionsFetchedAt stays null');
  assertEqual(store.store.get('r-retry')?.descriptionsFetchedAt, null,
    'Tick 1: stored descriptionsFetchedAt is still null (repo stays re-selectable)');

  // Tick 2: the same repo must be re-selected (descriptionsFetchedAt still null) and
  // now succeed on both calls.
  const tick2 = makeOpenRouter([
    'Used to teach creative coding.',
    'Art made with this hangs in the Met.',
  ]);
  setOpenRouterStub(tick2.client);
  await researchRepositoryDescriptions();

  assertEqual(store.updates.length, 1, 'Tick 2 (success): the previously-failed repo was re-selected and written');
  assertEqual(store.updates[0].where.id, 'r-retry', 'Tick 2: the write targets the retried repo');
  assertEqual(store.updates[0].data.useDescription, 'Used to teach creative coding.', 'Tick 2: useDescription persisted on retry');
  assertEqual(store.updates[0].data.impactDescription, 'Art made with this hangs in the Met.', 'Tick 2: impactDescription persisted on retry');
  assert(store.store.get('r-retry')?.descriptionsFetchedAt instanceof Date,
    'Tick 2: descriptionsFetchedAt is stamped after the successful retry (no longer re-selected)');
  assertEqual(store.store.get('r-retry')?.useDescription, 'Used to teach creative coding.',
    'Tick 2: useDescription persisted in the store');
}

// ---------------------------------------------------------------------------
// Test 11 (soft-null is durable, no retry churn): tick 1 soft-nulls on both
// calls -> stamped with no descriptions. Tick 2 re-selects NOTHING for that repo
// (descriptionsFetchedAt set), proving the intentional stamp-on-soft-null still
// suppresses re-billing after the fix.
// ---------------------------------------------------------------------------
async function testSoftNullStampsSoRepoIsNotReselectedNextTick(): Promise<void> {
  const store = makeStorePrisma(new Map([['r-softnull', makeRepo({ id: 'r-softnull' })]]));
  Container.set(PrismaClient, store.prisma as unknown as PrismaClient);

  const tick1 = makeOpenRouter([null, null]);
  setOpenRouterStub(tick1.client);
  await researchRepositoryDescriptions();

  assertEqual(store.updates.length, 1, 'Soft-null tick 1: stamped (no descriptions)');
  assert(store.store.get('r-softnull')?.descriptionsFetchedAt instanceof Date,
    'Soft-null tick 1: descriptionsFetchedAt is set');
  assertEqual(store.store.get('r-softnull')?.useDescription, null, 'Soft-null tick 1: useDescription stays null');
  assertEqual(store.store.get('r-softnull')?.impactDescription, null, 'Soft-null tick 1: impactDescription stays null');

  const tick2 = makeOpenRouter([]);
  setOpenRouterStub(tick2.client);
  await researchRepositoryDescriptions();

  assertEqual(tick2.createCalls.count, 0,
    'Soft-null tick 2: repo is NOT re-selected (descriptionsFetchedAt stamp suppresses re-billing)');
  assertEqual(store.updates.length, 1, 'Soft-null tick 2: no additional writes (no re-query churn)');
}

async function main(): Promise<void> {
  await testUseThrowsSkipsUpdateAndImpact();
  await testImpactThrowsSkipsUpdate();
  await testUseSoftNullImpactThrowsSkipsSoftNullDoesNotSetFailed();
  await testSoftNullOnBothStampsTimestampWithoutDescriptions();
  await testHappyPathPersistsBothDescriptions();
  await testUseAlreadySetImpactThrowsSkipsUpdate();
  await testUseAlreadySetImpactSucceedsStamps();
  await testBothAlreadySetStampsTimestampOnly();
  await testMixedBatchIsolatesFailuresFromSuccesses();
  await testFailedRepoIsReselectedAndRetriedNextTick();
  await testSoftNullStampsSoRepoIsNotReselectedNextTick();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
