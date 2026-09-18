import 'reflect-metadata';
import { normalizeGithubUsername } from '../src/utils/normalizeGithubUsername';

let failures = 0;

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

const REQUIRED_ENV = [
  'DATABASE_URL', 'ELASTIC_URL', 'ELASTIC_INDEX', 'AUTH_SECRET', 'AUTH_AUDIENCE',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_INBOUND_DOMAIN',
  'GEOCODIO_API_KEY', 'OPENAI_API_KEY', 'OPENAI_ORGANIZATION', 'WEBHOOK_KEY',
  'BADGR_USERNAME', 'BADGR_PASSWORD', 'BADGR_ISSUER', 'SHOPIFY_API_TOKEN',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET_KEY', 'SHOPIFY_STORE_DOMAIN',
  'LINEAR_API_KEY', 'LINEAR_TEAM_ID', 'LINEAR_PROBLEM_LABEL_ID', 'METRICS_KEY',
  'PLACID_API_TOKEN', 'ATTIO_API_TOKEN', 'ATTIO_ALUMNI_LIST',
];

const normalizeCases: Array<[string, string]> = [
  ['jdoe', 'jdoe'],
  ['jane-doe', 'jane-doe'],
  ['my-user-123', 'my-user-123'],
  ['https://github.com/jdoe', 'jdoe'],
  ['https://github.com/jdoe?tab=overview', 'jdoe'],
  ['https://github.com/jdoe?tab=overview&foo=bar', 'jdoe'],
  ['https://github.com/jdoe#readme', 'jdoe'],
  ['https://github.com/jdoe/', 'jdoe'],
  ['https://github.com/jdoe/?tab=x', 'jdoe'],
  ['https://github.com/jane-doe', 'jane-doe'],
  ['https://github.com/my-user-123', 'my-user-123'],
  ['http://github.com/jdoe', 'jdoe'],
  ['https://www.github.com/jdoe', 'jdoe'],
  ['http://www.github.com/jdoe', 'jdoe'],
  ['https://github.com/Jdoe', 'Jdoe'],
  ['HTTPS://GitHub.COM/jdoe', 'jdoe'],
  ['git@github.com:jdoe', 'jdoe'],
  ['git@github.com:jane-doe', 'jane-doe'],
  ['git@github.com:jdoe/foo', 'jdoe'],
  ['GIT@github.com:jdoe', 'jdoe'],
  ['jdoe?tab=overview', 'jdoe'],
  ['jdoe#readme', 'jdoe'],
  ['', ''],
  ['https://example.com/jdoe', 'https://example.com/jdoe'],
  ['https://gitlab.com/jdoe', 'https://gitlab.com/jdoe'],
  ['https://github.com', 'https://github.com'],
  ['https://github.com/', 'https://github.com/'],
  ['www.github.com/jdoe', 'www.github.com/jdoe'],
];

for (const [input, expected] of normalizeCases) {
  assertEqual(
    normalizeGithubUsername(input),
    expected,
    `normalizeGithubUsername(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`,
  );
}

REQUIRED_ENV.forEach((k) => { if (!process.env[k]) process.env[k] = 'x'; });

(async () => {
  const { StudentApplyInput } = await import('../src/inputs/StudentApplyInput');
  const { Track, StudentStatus } = await import('@prisma/client');

  async function persistedGithubUsername(raw: string): Promise<string> {
    const input = new StudentApplyInput();
    (input as any).githubUsername = raw;
    (input as any).resume = null;
    (input as any).track = Track.BEGINNER;
    const query: any = await input.toQuery();
    return query.githubUsername;
  }

  assertEqual(await persistedGithubUsername('https://github.com/jdoe'), 'jdoe', 'toQuery normalizes https profile URL instead of persisting it verbatim');
  assertEqual(await persistedGithubUsername('https://github.com/jdoe?tab=overview'), 'jdoe', 'toQuery strips ?tab= query suffix');
  assertEqual(await persistedGithubUsername('https://github.com/jane-doe'), 'jane-doe', 'toQuery preserves hyphens in username segment');
  assertEqual(await persistedGithubUsername('https://github.com/my-user-123'), 'my-user-123', 'toQuery preserves multiple hyphens and digits');
  assertEqual(await persistedGithubUsername('git@github.com:jdoe'), 'jdoe', 'toQuery normalizes git@github.com SSH form');
  assertEqual(await persistedGithubUsername('jdoe'), 'jdoe', 'toQuery passes a bare username through unchanged');
  assertEqual(await persistedGithubUsername('https://www.github.com/jdoe'), 'jdoe', 'toQuery normalizes www. subdomain URL');
  assertEqual(await persistedGithubUsername('http://github.com/jdoe'), 'jdoe', 'toQuery normalizes http scheme URL');

  const input = new StudentApplyInput();
  Object.assign(input as any, {
    givenName: 'Ada',
    surname: 'Lovelace',
    email: 'ada@example.com',
    githubUsername: 'https://github.com/ada-lovelace?tab=overview',
    track: Track.BEGINNER,
    minHours: 30,
    partnerCode: 'PARTNER1',
    timezone: 'America/New_York',
    profile: { foo: 'bar' },
  });
  (input as any).resume = null;
  const query: any = await input.toQuery();

  assertEqual(query.givenName, 'Ada', 'regression: givenName passes through');
  assertEqual(query.surname, 'Lovelace', 'regression: surname passes through');
  assertEqual(query.email, 'ada@example.com', 'regression: email passes through');
  assertEqual(query.githubUsername, 'ada-lovelace', 'regression: githubUsername persisted as normalized username (not raw URL)');
  assertEqual(query.status, StudentStatus.APPLIED, 'regression: status assigned APPLIED');
  assertEqual(query.track, Track.BEGINNER, 'regression: track passes through');
  assertEqual(query.minHours, 30, 'regression: minHours passes through');
  assertEqual(query.partnerCode, 'PARTNER1', 'regression: partnerCode passes through');
  assertEqual(query.timezone, 'America/New_York', 'regression: timezone passes through');
  assertEqual(query.profile, { foo: 'bar' }, 'regression: profile passes through');
  assertEqual(query.resumeUrl, null, 'regression: resumeUrl is null when no resume provided');
  assertEqual(query.tags, undefined, 'regression: tags is undefined when none provided');

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exit(1);
  }
  console.log(`\nAll tests passed.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
