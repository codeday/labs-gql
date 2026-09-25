/**
 * Offline unit tests for ttlCache single-flight / concurrent-miss coalescing.
 * No network or DB access required.
 *
 * Run with:
 *   npx ts-node --transpile-only src/utils/ttlCache.test.ts
 */
import { ttlCache } from './ttlCache';

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// A compute() that records every invocation and resolves (after delayMs) with the
// invocation ordinal, so callers can confirm which refresh they received.
function makeCompute(delayMs: number): { compute: () => Promise<number>, getCalls: () => number } {
  let calls = 0;
  const compute = (): Promise<number> => new Promise<number>((resolve) => {
    calls += 1;
    const value = calls;
    setTimeout(() => resolve(value), delayMs);
  });
  return { compute, getCalls: () => calls };
}

// reproduces the exact scenario from the bug report: 20 concurrent callers on a cold cache
async function testColdCacheConcurrentMissRunsComputeOnce(): Promise<void> {
  const { compute, getCalls } = makeCompute(20);
  const cached = ttlCache(60_000, compute);

  const results = await Promise.all(Array.from({ length: 20 }, () => cached()));

  assertEqual(getCalls(), 1, 'cold cache: 20 concurrent callers invoke compute exactly once (was 20 before fix)');
  assertEqual(results.length, 20, 'all 20 callers return a result');
  assertEqual(results.every((r) => r === 1), true, 'all 20 callers receive the single shared computed value');
}

// warm-cache path must be unchanged: no compute on concurrent hits
async function testWarmCacheServesFromCacheWithoutComputing(): Promise<void> {
  const { compute, getCalls } = makeCompute(5);
  const cached = ttlCache(60_000, compute);

  const first = await cached();
  assertEqual(getCalls(), 1, 'first call computes once');

  const second = await cached();
  assertEqual(getCalls(), 1, 'second call within TTL is served from cache (no new compute)');
  assertEqual(second, first, 'cached value matches the originally computed value');

  const warmResults = await Promise.all(Array.from({ length: 25 }, () => cached()));
  assertEqual(getCalls(), 1, '25 concurrent callers against a warm cache invoke compute zero additional times');
  assertEqual(warmResults.every((r) => r === first), true, 'warm concurrent callers all receive the cached value');
}

// the production trigger: at the TTL boundary, concurrent callers must again coalesce to one compute
async function testExpiredCacheConcurrentMissRunsComputeOnce(): Promise<void> {
  const { compute, getCalls } = makeCompute(10);
  const cached = ttlCache(20, compute); // short TTL

  const first = await cached();
  assertEqual(getCalls(), 1, 'initial refresh runs compute once');
  assertEqual(first, 1, 'initial refresh returns value 1');

  await delay(30); // now past the TTL

  const results = await Promise.all(Array.from({ length: 15 }, () => cached()));
  assertEqual(getCalls(), 2, 'expired cache: 15 concurrent callers trigger exactly one additional compute (not 15)');
  assertEqual(results.every((r) => r === 2), true, 'all callers after expiry receive the freshly computed value (not stale)');
}

// a failed refresh must reject to all concurrent waiters, clear pending, and leave the cache
// unpoisoned so a later call retries
async function testFailedComputeRejectsAllWaitersAndClearsPending(): Promise<void> {
  let calls = 0;
  let shouldFail = true;
  const compute = (): Promise<number> => new Promise<number>((resolve, reject) => {
    calls += 1;
    setTimeout(() => {
      if (shouldFail) reject(new Error('boom'));
      else resolve(calls);
    }, 10);
  });
  const cached = ttlCache(60_000, compute);

  const errors: unknown[] = [];
  await Promise.all(Array.from({ length: 8 }, () => cached().catch((e: unknown) => { errors.push(e); return e; })));

  assertEqual(calls, 1, 'failed compute still runs only once for 8 concurrent callers (coalesced)');
  assertEqual(errors.length, 8, 'all 8 concurrent callers receive the rejection (none silently succeed)');
  assert(errors[0] instanceof Error && (errors[0] as Error).message === 'boom', 'the rejection carries the original Error');

  // pending must have been cleared so a new call retries rather than awaiting a dead promise forever
  shouldFail = false;
  const retried = await cached();
  assertEqual(calls, 2, 'after a failed refresh, a new call retries compute (pending slot was cleared)');
  assertEqual(retried, 2, 'the retry returns the successful value');
}

// a caller that arrives while a refresh is already in flight must join it, not start a second
// compute. This also guards the fix ordering: `cached` must be written in `.then` BEFORE
// `pending` is cleared in `.finally`, or an interleaved caller could start a duplicate compute.
async function testArrivingDuringInFlightRefreshJoinsIt(): Promise<void> {
  const { compute, getCalls } = makeCompute(30);
  const cached = ttlCache(60_000, compute);

  const firstCall = cached(); // start the refresh (compute runs)
  await delay(5); // ensures the refresh is in flight, before the cache is populated
  const secondCall = cached(); // arrives while compute() is still pending

  const [r1, r2] = await Promise.all([firstCall, secondCall]);
  assertEqual(getCalls(), 1, 'a caller arriving mid-refresh joins the in-flight compute instead of starting a second one');
  assertEqual(r1, r2, 'both the original and the late caller receive the same value');
}

async function main(): Promise<void> {
  await testColdCacheConcurrentMissRunsComputeOnce();
  await testWarmCacheServesFromCacheWithoutComputing();
  await testExpiredCacheConcurrentMissRunsComputeOnce();
  await testFailedComputeRejectsAllWaitersAndClearsPending();
  await testArrivingDuringInFlightRefreshJoinsIt();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
