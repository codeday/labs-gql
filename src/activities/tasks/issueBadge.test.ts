/**
 * Offline unit tests for the Open-Source Contributor badge issuance prUrl filter
 * and evidence builder. No live DB or Badgr access — only pure helpers are exercised.
 *
 * Guards against reverting the dual-condition prUrl filter (which excludes the
 * storable-but-meaningless empty-string value) or the evidence builder.
 *
 * Run with:
 *   npx tsx src/activities/tasks/issueBadge.test.ts
 */
import 'reflect-metadata';

// issueBadge.ts transitively imports src/config.ts, which throws at import time
// unless every required env var is present. Stub them before loading the module
// under test. (A plain `import` would be hoisted above these stubs by the
// transpiler, so load via `require` instead.)
const ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ELASTIC_URL: 'http://localhost:9200', ELASTIC_INDEX: 'test',
  AUTH_SECRET: 'test-secret', AUTH_AUDIENCE: 'test-audience',
  EMAIL_HOST: 'localhost', EMAIL_PORT: '587', EMAIL_USER: 'test', EMAIL_PASS: 'test',
  EMAIL_INBOUND_DOMAIN: 'test.local', GEOCODIO_API_KEY: 'test-key',
  OPENAI_API_KEY: 'test-key', OPENAI_ORGANIZATION: 'test-org', WEBHOOK_KEY: 'test-key',
  BADGR_USERNAME: 'test', BADGR_PASSWORD: 'test', BADGR_ISSUER: 'test',
  SHOPIFY_API_TOKEN: 'test', SHOPIFY_API_KEY: 'test', SHOPIFY_API_SECRET_KEY: 'test',
  SHOPIFY_STORE_DOMAIN: 'test.myshopify.com', LINEAR_API_KEY: 'test', LINEAR_TEAM_ID: 'test',
  LINEAR_PROBLEM_LABEL_ID: 'test', METRICS_KEY: 'test', PLACID_API_TOKEN: 'test',
  ATTIO_API_TOKEN: 'test', ATTIO_ALUMNI_LIST: 'test',
};
for (const [k, v] of Object.entries(ENV)) if (!process.env[k]) process.env[k] = v;

const { HAS_PR_URL, buildEvidence } = require('./issueBadge') as typeof import('./issueBadge');

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { failures += 1; console.error(`FAILED: ${message}`); }
  else { console.log(`PASSED: ${message}`); }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) { failures += 1; console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`); }
  else { console.log(`PASSED: ${message}`); }
}

function proj(prUrl: string | null): { prUrl: string | null } { return { prUrl }; }

function main(): void {
  // Guards against reverting HAS_PR_URL to the bare `prUrl: { not: null }` that
  // admits the storable empty-string value.
  assertEqual(
    HAS_PR_URL,
    { AND: [{ prUrl: { not: null } }, { prUrl: { not: '' } }] },
    'HAS_PR_URL excludes both NULL and empty string (mirrors studentPin.ts)',
  );

  // Guards buildEvidence against reverting to `projects.map(p => ({ url: p.prUrl! }))`,
  // which would emit `{ url: "" }` (and crash on null) into the Badgr POST.
  assert(buildEvidence([]).length === 0, 'empty project list yields empty evidence');
  assertEqual(buildEvidence([proj(null), proj('')]), [], 'null and empty-string prUrl are excluded from evidence');
  assertEqual(
    buildEvidence([proj(null), proj('https://a.example/pull/1'), proj(''), proj('https://b.example/pull/2')]),
    [{ url: 'https://a.example/pull/1' }, { url: 'https://b.example/pull/2' }],
    'only real prUrls produce evidence, in order',
  );
  assert(!buildEvidence([proj(''), proj('https://c.example/pull/3')]).some((e) => e.url === ''), 'no evidence entry ever has an empty-string url');

  if (failures > 0) { console.error(`\n${failures} test(s) failed.`); process.exit(1); }
  console.log('\nAll tests passed.');
}

main();
