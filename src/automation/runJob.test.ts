/**
 * Behavioral regression test for src/automation/index.ts runJob.
 *
 * Guards against: runJob invoking a task's async fn() without a rejection
 * handler, which leaves the returned Promise unhandled and (on Node 15+
 * default --unhandled-rejections=throw) terminates the process when a task
 * rejects on a transient downstream failure (Prisma/Email/Slack/Elastic/OpenAI).
 *
 * Approach: inject a controllable fake `./tasks` module into require.cache
 * BEFORE requiring the real src/automation/index.ts, so tasksByName is built
 * from fake tasks (resolving, rejecting, slow) and no real Prisma/DI-backed
 * task files are loaded. Pre-set the env vars required by src/config.ts so
 * importing index.ts does not throw. Install a process 'unhandledRejection'
 * listener to detect a regression (the bug manifests as exactly that event).
 *
 * Convention follows src/automation/tasks/syncAlumniInteractions.test.ts
 * (custom assert + async main(), process.exit(1) on failure).
 *
 * Run with:
 *   npx ts-node src/automation/runJob.test.ts
 */
import 'reflect-metadata';
import * as path from 'path';

// --- 1. Set required env vars BEFORE any import of src/config.ts --------------------------
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
  DEBUG: 'codeday:labs:*',
};
for (const [k, v] of Object.entries(ENV)) {
  if (!process.env[k]) process.env[k] = v;
}

// --- 2. Capture debug log output -----------------------------------------------------------
import createDebug from 'debug';
const capturedLogs: string[] = [];
const origLog = createDebug.log;
createDebug.log = (...args: any[]) => {
  capturedLogs.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  if (origLog) (origLog as any)(...args);
};

// --- 3. Build controllable fake tasks + inject into require.cache ---------------------------
const TASKS_INDEX_PATH = path.join(__dirname, 'tasks', 'index.ts');

const invocations: Record<string, { started: boolean; finished: boolean }> = {
  goodTask: { started: false, finished: false },
  badTask: { started: false, finished: false },
  slowTask: { started: false, finished: false },
};

const fakeTasks = [
  {
    name: 'goodTask',
    spec: undefined,
    fn: async function goodTask() {
      invocations.goodTask.started = true;
      invocations.goodTask.finished = true;
    },
  },
  {
    name: 'badTask',
    spec: undefined,
    fn: async function badTask() {
      invocations.badTask.started = true;
      throw new Error('badTask-rejected-on-purpose');
    },
  },
  {
    name: 'slowTask',
    spec: undefined,
    fn: async function slowTask() {
      invocations.slowTask.started = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      invocations.slowTask.finished = true;
    },
  },
];

const Module = require('module');
const fakeModule = new Module(TASKS_INDEX_PATH, module);
fakeModule.filename = TASKS_INDEX_PATH;
fakeModule.loaded = true;
fakeModule.exports = { default: fakeTasks, __esModule: true };
require.cache[TASKS_INDEX_PATH] = fakeModule as any;

// --- 4. Now require the real automation module ----------------------------------------------
const { runJob, getAutomations } = require('./index') as typeof import('./index');

// --- 5. Test harness ----------------------------------------------------------------------
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
  if (actual !== expected) {
    failures += 1;
    console.error(`FAILED: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logsInclude(substr: string): boolean {
  return capturedLogs.some((line) => line.includes(substr));
}

async function main(): Promise<void> {
  let unhandled: { reason: unknown } | null = null;
  const onUnhandled = (reason: unknown) => {
    unhandled = { reason };
  };
  process.on('unhandledRejection', onUnhandled as any);

  assertEqual(runJob('doesNotExist'), false, 'runJob returns false for an unknown task name');

  const slowReturnedBeforeFinish = invocations.slowTask.finished;
  assertEqual(runJob('slowTask'), true, 'runJob returns true for a known task name');
  assert(
    slowReturnedBeforeFinish === false && invocations.slowTask.finished === false,
    'runJob returns synchronously while the async task is still running (immediate-return contract preserved)',
  );

  assertEqual(runJob('goodTask'), true, 'runJob returns true for a resolving task');
  assertEqual(invocations.goodTask.started, true, 'the resolving task fn is invoked');
  assertEqual(invocations.goodTask.finished, true, 'the resolving task fn runs to completion synchronously-ish');

  assertEqual(runJob('badTask'), true, 'runJob returns true for a rejecting task');
  assertEqual(invocations.badTask.started, true, 'the rejecting task fn is invoked');

  await delay(50);

  assert(unhandled === null, 'a rejecting task produces NO unhandledRejection (fix prevents process crash)');
  if (unhandled !== null) {
    console.error(`  unhandledRejection reason: ${String((unhandled as { reason: unknown }).reason)}`);
  }

  assert(logsInclude('Job slowTask started.'), 'log emits "Job <name> started." after dispatching the task');
  assert(!logsInclude('Job slowTask completed.'), 'log no longer emits the misleading "Job <name> completed." line');
  assert(logsInclude('Running oneshot job slowTask'), 'log emits "Running oneshot job <name>" before dispatching');

  assert(logsInclude('Error from job badTask'), 'a rejecting task is logged via DEBUG("Error from job <name>:")');
  assert(logsInclude('badTask-rejected-on-purpose'), 'the underlying rejection error details are logged');

  await delay(80);
  assertEqual(invocations.slowTask.finished, true, 'a fire-and-forget slow task still runs to completion');

  const automationNames = getAutomations();
  assert(
    ['goodTask', 'badTask', 'slowTask'].every((n) => automationNames.includes(n)),
    'getAutomations lists the loaded task names (loader shape unchanged)',
  );

  await delay(50);
  assert(unhandled === null, 'no unhandledRejection observed across the whole test (process would survive)');

  process.off('unhandledRejection', onUnhandled as any);

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main().catch((err) => {
  console.error('Test harness threw:', err);
  process.exit(1);
});
