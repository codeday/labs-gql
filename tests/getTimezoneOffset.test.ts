/**
 * Offline unit tests for `getTimezoneOffset`, focusing on the UTC-offset sign
 * convention and sub-hour offset magnitude. Run with either of:
 *
 *   npx tsx tests/getTimezoneOffset.test.ts
 *   npx ts-node tests/getTimezoneOffset.test.ts
 *
 * The tests assert the fix for the "sign-flip + minute-order" bug:
 *   - Western-hemisphere zones (Americas) MUST return negative offsets.
 *   - Eastern-hemisphere zones (Asia/Australia) MUST return positive offsets.
 *   - Positive sub-hour zones (Kolkata, Kathmandu, Yangon) return exact +HH:MM magnitudes.
 *   - Negative sub-hour zones (Newfoundland) return exact -HH:MM magnitudes (the
 *     bug-report-recommended fix would get this wrong; this guard catches it).
 *   - The fixed values are CONSISTENT with the standard convention used by every
 *     other timezoneOffset producer in the codebase (the -7 default and the
 *     geoToTimezone country dict), so the ±4 matcher window connects mixed-
 *     code-path student/mentor pairs.
 */
import { getTimezoneOffset } from '../src/utils/getTimezoneOffset';

let run = 0;
let failed = 0;

function assertOk(cond: boolean, message = 'condition'): void {
  if (!cond) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message = 'value'): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function check(name: string, fn: () => void): void {
  run += 1;
  try {
    fn();
    console.log(`PASSED: ${name}`);
  } catch (ex) {
    failed += 1;
    console.error(`FAILED: ${name}\n  ${(ex as Error).message}`);
  }
}

// Capture the runtime's Intl-derived offset token independently so we can build
// a season-invariant *expected* band for DST-observing zones. We never use the
// function-under-test to build expectations; we recompute the canonical value
// with a deliberately-correct parser.
function canonicalFromIntl(tz: string): number | null {
  let parts: Intl.DateTimeFormatPart[] = [];
  try {
    parts = new Intl.DateTimeFormat('ia', {
      timeZoneName: 'short',
      timeZone: tz,
    }).formatToParts();
  } catch {
    return null;
  }
  const token = parts.find((i) => i.type === 'timeZoneName')?.value;
  if (!token) return null;
  const offset = token.slice(3);
  if (!offset) return 0; // bare "UTC"
  const m = offset.match(/([+-])(\d+)(?::(\d+))?/);
  if (!m) return null;
  const [, sign, hour, minute] = m;
  let result = parseInt(hour, 10) * 60;
  if (minute) result += parseInt(minute, 10); // magnitude first...
  if (sign === '-') result *= -1; // ...then apply sign (the correct order)
  return result / 60;
}

// ---------------------------------------------------------------------------
// 1. UTC / zero-offset handling (line-28 short-circuit)
// ---------------------------------------------------------------------------
check('UTC returns exactly 0', () => {
  assertEqual(getTimezoneOffset('UTC'), 0);
});

check('Etc/UTC returns exactly 0', () => {
  assertEqual(getTimezoneOffset('Etc/UTC'), 0);
});

check('GMT+0 / GMT-0 zones collapse to 0 (e.g. Atlantic/Reykjavik)', () => {
  assertEqual(getTimezoneOffset('Atlantic/Reykjavik'), 0);
});

// ---------------------------------------------------------------------------
// 2. Sign convention — west negative, east positive (season-invariant in sign)
// ---------------------------------------------------------------------------
check('Western-hemisphere zones never return a positive offset', () => {
  for (const tz of [
    'America/Los_Angeles',
    'America/New_York',
    'America/Phoenix',
    'America/Chicago',
    'America/Denver',
    'America/Caracas',
    'America/Buenos_Aires',
    'America/St_Johns',
  ]) {
    const got = getTimezoneOffset(tz);
    assertOk(
      got !== null && got <= 0,
      `${tz} should be <= 0 but got ${got}`,
    );
  }
});

check('Eastern-hemisphere zones never return a negative offset', () => {
  for (const tz of [
    'Asia/Taipei',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Asia/Kolkata',
    'Asia/Kathmandu',
    'Asia/Yangon',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Australia/Sydney',
    'Asia/Tehran',
  ]) {
    const got = getTimezoneOffset(tz);
    assertOk(
      got !== null && got >= 0,
      `${tz} should be >= 0 but got ${got}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Season-stable integer offsets — exact values (no DST in these zones)
//           
// These exact-value assertions are the canonical regression tests for the bug.
// Before the fix: America/Los_Angeles -> +7, Asia/Taipei -> -8, etc.
// ---------------------------------------------------------------------------
check('America/Phoenix (no DST) returns exactly -7', () => {
  assertEqual(getTimezoneOffset('America/Phoenix'), -7);
});

check('Asia/Taipei (no DST) returns exactly +8', () => {
  assertEqual(getTimezoneOffset('Asia/Taipei'), 8);
});

check('Asia/Singapore (no DST) returns exactly +8', () => {
  assertEqual(getTimezoneOffset('Asia/Singapore'), 8);
});

check('Asia/Tokyo (no DST) returns exactly +9', () => {
  assertEqual(getTimezoneOffset('Asia/Tokyo'), 9);
});

check('Asia/Shanghai (no DST) returns exactly +8', () => {
  assertEqual(getTimezoneOffset('Asia/Shanghai'), 8);
});

check('Asia/Seoul (no DST) returns exactly +9', () => {
  assertEqual(getTimezoneOffset('Asia/Seoul'), 9);
});

check('Australia/Brisbane (no DST) returns exactly +10', () => {
  assertEqual(getTimezoneOffset('Australia/Brisbane'), 10);
});

// ---------------------------------------------------------------------------
// 4. Positive sub-hour offsets — sign AND magnitude correct (season-stable)
//    These were the worst-broken values under the bug: +5:30 became -4.5.
// ---------------------------------------------------------------------------
check('Asia/Kolkata (UTC+5:30) returns exactly +5.5', () => {
  assertEqual(getTimezoneOffset('Asia/Kolkata'), 5.5);
});

check('Asia/Kathmandu (UTC+5:45) returns exactly +5.75', () => {
  assertEqual(getTimezoneOffset('Asia/Kathmandu'), 5.75);
});

check('Asia/Yangon (UTC+6:30) returns exactly +6.5', () => {
  assertEqual(getTimezoneOffset('Asia/Yangon'), 6.5);
});

check('Asia/Tehran (UTC+3:30) returns exactly +3.5', () => {
  // Iran abolished DST in 2022, so this is now season-stable at +3:30.
  assertEqual(getTimezoneOffset('Asia/Tehran'), 3.5);
});

// ---------------------------------------------------------------------------
// 5. NEGATIVE sub-hour offset — the strict guard that the bug-report-
//    recommended fix (negate "-", then add minutes) would have got wrong.
//    With the complete fix (add minutes to magnitude, THEN apply sign):
//        GMT-2:30 (NDT, summer) -> -2.5
//        GMT-3:30 (NST, winter) -> -3.5
//    Both correct. The recommended-in-report fix would yield -2.5/-2.5 or
//    -3.5/-2.5, i.e. always wrong in exactly one season.
// ---------------------------------------------------------------------------
check('America/St_Johns (Newfoundland) returns a correct -HH:MM value in either DST season', () => {
  const got = getTimezoneOffset('America/St_Johns');
  assertOk(
    got === -2.5 || got === -3.5,
    `America/St_Johns should be -2.5 (NDT) or -3.5 (NST) but got ${got}`,
  );
  // Cross-check against the independent canonical parser for the current season.
  assertEqual(got, canonicalFromIntl('America/St_Johns'));
});

// ---------------------------------------------------------------------------
// 6. DST-observing integer-zone bands — value must land in the union of the
//    standard and daylight-saving offsets, with the correct (standard) sign.
// ---------------------------------------------------------------------------
check('America/Los_Angeles is -7 (PDT) or -8 (PST)', () => {
  const got = getTimezoneOffset('America/Los_Angeles');
  assertOk(got === -7 || got === -8, `got ${got}`);
});

check('America/New_York is -4 (EDT) or -5 (EST)', () => {
  const got = getTimezoneOffset('America/New_York');
  assertOk(got === -4 || got === -5, `got ${got}`);
});

check('Europe/London is 0 (GMT) or +1 (BST)', () => {
  const got = getTimezoneOffset('Europe/London');
  assertOk(got === 0 || got === 1, `got ${got}`);
});

check('Australia/Sydney is +10 (AEST) or +11 (AEDT)', () => {
  const got = getTimezoneOffset('Australia/Sydney');
  assertOk(got === 10 || got === 11, `got ${got}`);
});

// ---------------------------------------------------------------------------
// 7. Every parseable IANA zone: the function agrees with the independent
//    canonical parser for THIS runtime's "now" (season-aware, sign-aware,
//    magnitude-aware). This is the broad regression net.
// ---------------------------------------------------------------------------
check('function agrees with independent canonical parser across a broad zone set', () => {
  const zones = [
    'America/Los_Angeles', 'America/New_York', 'America/Phoenix', 'America/Chicago',
    'America/Denver', 'America/Caracas', 'America/Buenos_Aires', 'America/St_Johns',
    'Asia/Taipei', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Kathmandu',
    'Asia/Yangon', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Tehran', 'Asia/Kabul',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'Atlantic/Reykjavik', 'UTC', 'Etc/UTC',
    'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide',
    'Pacific/Auckland', 'Pacific/Honolulu',
  ];
  for (const tz of zones) {
    assertEqual(
      getTimezoneOffset(tz),
      canonicalFromIntl(tz),
      `mismatch for ${tz}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 8. Legacy "America - *" alias remap still works (and now yields the correct
//    sign via the inner parser, matching the ElasticEntry legacy dict).
// ---------------------------------------------------------------------------
check('legacy "America - Pacific" remaps to America/Los_Angeles with standard sign', () => {
  const got = getTimezoneOffset('America - Pacific');
  assertOk(got === -7 || got === -8, `got ${got}`);
  assertEqual(got, getTimezoneOffset('America/Los_Angeles'));
});

check('legacy "America - Arizona" remaps to America/Phoenix returning exactly -7', () => {
  // Phoenix has no DST, so this is an exact-value regression test.
  assertEqual(getTimezoneOffset('America - Arizona'), -7);
});

check('legacy "America - Eastern" remaps to America/New_York with standard sign', () => {
  const got = getTimezoneOffset('America - Eastern');
  assertOk(got === -4 || got === -5, `got ${got}`);
  assertEqual(got, getTimezoneOffset('America/New_York'));
});

// ---------------------------------------------------------------------------
// 9. Invalid / unparseable timezones return null (Intl throws, caught).
// ---------------------------------------------------------------------------
check('invalid IANA zone returns null', () => {
  assertEqual(getTimezoneOffset('NotARealZone/XYZ'), null);
});

check('empty-string timezone throws/errors (Intl rejects, caught -> null)', () => {
  // Intl.DateTimeFormat throws for an empty timeZone; the function returns null.
  assertEqual(getTimezoneOffset(''), null);
});

// ---------------------------------------------------------------------------
// 10. End-to-end: the ±4 matcher window from getProjectMatches now CONNECTS
//     mixed-code-path student/mentor pairs that were broken before the fix.
//     This reproduces Traces A, B, and C from the bug report.
// ---------------------------------------------------------------------------
// Replicates getProjectMatches.ts:193-201 — the nine exact matchQuery clauses.
function matchWindow(studentTZ: number): number[] {
  return [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => studentTZ + k);
}

function mentorMatches(studentTZ: number, mentorTZ: number): boolean {
  return matchWindow(studentTZ).includes(mentorTZ);
}

// Source-of-truth standard-convention producers (from the rest of the codebase).
function standardDefault(): number {
  return -7; // ElasticEntry.ts:108 and getProjectMatches.ts:93
}
function geoDictCN(): number {
  return 8; // geoToTimezone.ts country dict: CN: 8

}

check('Trace B: Asian student (geocoded CN:+8) vs Asian mentor (Asia/Taipei inner) now matches', () => {
  const studentTZ = geoDictCN(); // standard +8
  const mentorTZ = getTimezoneOffset('Asia/Taipei') as number; // now +8 (was -8)
  assertEqual(mentorTZ, 8);
  assertEqual(mentorMatches(studentTZ, mentorTZ), true);
});

check('Trace C: Pacific student (Asia... no) — symmetric default mentor case now matches', () => {
  // Student inner-parser (was +7, now -7); mentor dual-null default (-7).
  const studentTZ = getTimezoneOffset('America/Los_Angeles') as number;
  const mentorTZ = standardDefault();
  assertOk(studentTZ === -7 || studentTZ === -8);
  // The default is -7; even across PDT/PST the student falls inside the window.
  assertEqual(mentorMatches(studentTZ, mentorTZ), true);
});

check('Trace A: default student (-7) vs Pacific mentor (America/Los_Angeles inner) now matches', () => {
  const studentTZ = standardDefault(); // -7
  const mentorTZ = getTimezoneOffset('America/Los_Angeles') as number;
  assertOk(mentorTZ === -7 || mentorTZ === -8);
  assertEqual(mentorMatches(studentTZ, mentorTZ), true);
});

check('cross-convention divergence no longer occurs: same-region INTEGER pair via different paths matches', () => {
  // China pair: student geocoded via geoToTimezone CN:8 (standard +8, integer),
  // mentor inner-parser Asia/Shanghai (now +8, integer). Both sides now agree
  // on +8 and the integer ±4 window connects them. (Before the fix the mentor
  // would have stored -8 and failed to match.)
  const studentTZ = geoDictCN(); // +8
  const mentorTZ = getTimezoneOffset('Asia/Shanghai') as number;
  assertEqual(mentorTZ, 8);
  assertEqual(mentorMatches(studentTZ, mentorTZ), true);
});

check('known limitation (out of scope): sub-hour mentor does not match an integer-step window', () => {
  // getProjectMatches emits nine INTEGER clauses (studentTZ + k, k ∈ {-4..+4}).
  // A sub-hour mentor value (e.g. Kolkata +5.5) can never equal an integer
  // clause, regardless of sign correctness. This is the pre-existing matcher
  // design noted in bug report §7 ("the sub-hour inner value's fractional part
  // means even a numerically close integer partner cannot match any clause").
  // The fix corrects the sub-hour VALUE; it does not (and is not intended to)
  // make the integer-only window accept fractional offsets. Documented here so
  // a future change to integer-only matching is intentional.
  const studentTZ = 5; // geoToTimezone IN dict (integer, standard)
  const mentorTZ = getTimezoneOffset('Asia/Kolkata') as number;
  assertEqual(mentorTZ, 5.5);
  assertEqual(mentorMatches(studentTZ, mentorTZ), false);
});

check('regression guard: a genuinely-far mentor still does NOT match (window still bounded)', () => {
  // A Honolulu mentor (-10) is far from an EST student (-4/-5); the ±4 window
  // must not collapse to match-everything.
  const studentTZ = -5; // EST
  const mentorTZ = getTimezoneOffset('Pacific/Honolulu') as number; // -10
  assertEqual(mentorTZ, -10);
  assertEqual(mentorMatches(studentTZ, mentorTZ), false);
});

// ---------------------------------------------------------------------------
// 11. Sign-flip-pre-fix regression sentinel: a value that was unambiguously
//     positive-only under the bug MUST now be negative. This fails loudly if
//     the sign logic ever regresses back to `if (sign === "+") result *= -1;`.
// ---------------------------------------------------------------------------
check('America/Phoenix is strictly negative (was +7 under the bug)', () => {
  const got = getTimezoneOffset('America/Phoenix') as number;
  assertOk(got < 0, `expected negative, got ${got}`);
  assertEqual(got, -7);
});

check('Asia/Taipei is strictly positive (was -8 under the bug)', () => {
  const got = getTimezoneOffset('Asia/Taipei') as number;
  assertOk(got > 0, `expected positive, got ${got}`);
  assertEqual(got, 8);
});

console.log(`\n${run} checks, ${failed} failed.`);
if (failed > 0) process.exit(1);
