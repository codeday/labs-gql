/**
 * Offline integration tests for the aiScoreStandups scoring contract.
 *
 * A failed scoring attempt must leave `StandupResult.rating` null so the
 * next hourly cron run (which filters `rating: null`) re-selects and
 * retries it; a successful scoring must still persist the genuine rating.
 *
 * No live DB or OpenAI access — the OpenAI and Prisma clients are stubbed
 * via typedi's `Container.set` (the same injection seam `src/di.ts` uses).
 *
 * Run with:
 *   npx ts-node src/automation/tasks/aiScoreStandups.test.ts
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
  METRICS_KEY: 'test',
  PLACID_API_TOKEN: 'test',
  ATTIO_API_TOKEN: 'test',
  ATTIO_ALUMNI_LIST: 'test',
};
for (const [k, v] of Object.entries(envDefaults)) {
  if (!process.env[k]) process.env[k] = v;
}

import 'reflect-metadata';
import Container from 'typedi';
import OpenAIApi, { APIError } from 'openai';
import { PrismaClient } from '@prisma/client';
import { StandupWithModel } from '../../openai';

process.env.DEBUG = 'codeday:labs:automation:tasks:aiScoreStandups';
import debugLib from 'debug';
debugLib.enable(process.env.DEBUG);

import aiScoreStandups from './aiScoreStandups';

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

function makeStandup(overrides: Partial<StandupWithModel> = {}): StandupWithModel {
  return {
    id: 'su-1',
    text: 'I wrote tests for the AI scoring path and fixed a long-standing bug.',
    rating: null,
    humanRated: false,
    trainingSubmitted: false,
    threadId: 'thread-1',
    studentId: 'student-1',
    projectId: 'project-1',
    eventId: 'event-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    event: {
      standupAiModelVague: 'org:vague-model-1',
      standupAiModelWorkload: 'org:workload-model-1',
    },
    ...overrides,
  } as unknown as StandupWithModel;
}

function makeCompletionResponse(winner: 'yes' | 'no'): unknown {
  const loser = winner === 'yes' ? 'no' : 'yes';
  return {
    choices: [{
      logprobs: {
        content: [{
          top_logprobs: [
            { token: winner, logprob: 0 },
            { token: loser, logprob: -10 },
          ],
        }],
      },
    }],
  };
}

function makeScriptedOpenAi(script: ('yes' | 'no' | Error)[]): { client: unknown; calls: { count: number } } {
  let i = 0;
  const calls = { count: 0 };
  const client = {
    chat: {
      completions: {
        create: async (): Promise<unknown> => {
          calls.count += 1;
          if (i >= script.length) {
            throw new Error(`OpenAI stub ran out of scripted responses at call ${i + 1}`);
          }
          const next = script[i++];
          if (next instanceof Error) throw next;
          return makeCompletionResponse(next);
        },
      },
    },
  };
  return { client, calls };
}

function setOpenAiStub(client: unknown): void {
  Container.set(OpenAIApi, client as unknown as OpenAIApi);
}

function makeFakePrisma(findMany: () => Promise<StandupWithModel[]>): {
  prisma: unknown;
  updates: Array<{ where: { id: string }; data: { rating: number } }>;
} {
  const updates: Array<{ where: { id: string }; data: { rating: number } }> = [];
  const prisma = {
    standupResult: {
      findMany,
      update: async (args: { where: { id: string }; data: { rating: number } }) => {
        updates.push(args);
        return undefined;
      },
    },
  };
  return { prisma, updates };
}

function makeStoreBackedPrisma(seed: Map<string, { text: string; rating: number | null }>): {
  prisma: unknown;
  updates: Array<{ where: { id: string }; data: { rating: number } }>;
  store: Map<string, { text: string; rating: number | null }>;
} {
  const store = new Map(seed);
  const updates: Array<{ where: { id: string }; data: { rating: number } }> = [];
  const prisma = {
    standupResult: {
      // Reproduces the production `where: { ..., rating: null }` selection.
      findMany: async (): Promise<StandupWithModel[]> => {
        const selected: StandupWithModel[] = [];
        for (const [id, row] of store.entries()) {
          if (row.rating === null) selected.push(makeStandup({ id, text: row.text }));
        }
        return selected;
      },
      update: async (args: { where: { id: string }; data: { rating: number } }) => {
        updates.push(args);
        const row = store.get(args.where.id);
        if (row) store.set(args.where.id, { text: row.text, rating: args.data.rating });
        return undefined;
      },
    },
  };
  return { prisma, updates, store };
}

// Bug guard: an OpenAI failure must not be persisted as a fake rating.
async function testOpenAiFailureLeavesRatingNull(): Promise<void> {
  const { client } = makeScriptedOpenAi([
    new APIError(500, { message: 'simulated 5xx' }, 'Simulated 5xx', undefined),
  ]);
  const { prisma, updates } = makeFakePrisma(
    async () => [makeStandup({ id: 'su-fail' })],
  );
  setOpenAiStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);
  await aiScoreStandups();
  assertEqual(updates.length, 0, 'OpenAI failure: standupResult.update is not called (rating left null for retry)');
}

// Over-fix guard: a genuine middle-of-the-road score is still persisted.
async function testGenuineMiddleRatingIsPersisted(): Promise<void> {
  const { client } = makeScriptedOpenAi(['no', 'no']);
  const { prisma, updates } = makeFakePrisma(
    async () => [makeStandup({ id: 'su-mid' })],
  );
  setOpenAiStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);
  await aiScoreStandups();
  assertEqual(updates.length, 1, 'Genuine score: standupResult.update is called exactly once');
  assertEqual(updates[0], { where: { id: 'su-mid' }, data: { rating: 2 } }, 'Genuine score: rating 2 is persisted (no over-fix regression)');
}

// Contract proof: a failed row is re-selected on the next tick and finally scored.
async function testFailedRowIsReselectedAndRetriedOnNextTick(): Promise<void> {
  const { prisma, updates, store } = makeStoreBackedPrisma(
    new Map([['su-retry', { text: 'I built a feature.', rating: null }]]),
  );
  Container.set(PrismaClient, prisma as unknown as PrismaClient);

  const tick1 = makeScriptedOpenAi([
    new APIError(500, { message: 'simulated 5xx' }, 'Simulated 5xx', undefined),
  ]);
  setOpenAiStub(tick1.client);
  await aiScoreStandups();
  assertEqual(updates.length, 0, 'Tick 1 (OpenAI failure): no write, rating stays null');
  assertEqual(store.get('su-retry')?.rating ?? null, null, 'Tick 1: store rating is still null (re-selectable next run)');

  updates.length = 0;
  const tick2 = makeScriptedOpenAi(['yes']);
  setOpenAiStub(tick2.client);
  await aiScoreStandups();
  assertEqual(updates.length, 1, 'Tick 2 (OpenAI success): the previously-failed standup is re-selected and written');
  assertEqual(updates[0], { where: { id: 'su-retry' }, data: { rating: 1 } }, 'Tick 2: rating 1 is persisted on retry');
  assertEqual(store.get('su-retry')?.rating, 1, 'Tick 2: store rating is 1');
}

// Isolation guard: a failure on one row does not block writes for other rows in the same run.
async function testMixedRunIsolatesFailuresFromSuccesses(): Promise<void> {
  const { client } = makeScriptedOpenAi([
    new APIError(500, { message: 'simulated 5xx' }, 'Simulated 5xx', undefined),
    'yes',
  ]);
  const { prisma, updates } = makeFakePrisma(
    async () => [makeStandup({ id: 'su-fail' }), makeStandup({ id: 'su-ok' })],
  );
  setOpenAiStub(client);
  Container.set(PrismaClient, prisma as unknown as PrismaClient);
  await aiScoreStandups();
  assertEqual(updates.length, 1, 'Mixed run: only the successfully-scored standup is written');
  assertEqual(updates[0], { where: { id: 'su-ok' }, data: { rating: 1 } }, 'Mixed run: the failed row is skipped, the successful row is persisted');
}

async function main(): Promise<void> {
  await testOpenAiFailureLeavesRatingNull();
  await testGenuineMiddleRatingIsPersisted();
  await testFailedRowIsReselectedAndRetriedOnNextTick();
  await testMixedRunIsolatesFailuresFromSuccesses();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
