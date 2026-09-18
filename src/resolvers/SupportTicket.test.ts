// Regression tests for the `createSupportTicket` resolver.
//
// Bug: when `preventingProgress: true` was submitted without a `description`
// (omitted -> `undefined`, or explicitly `null`), the resolver prepended a
// banner via `+` concatenation onto the missing value, coercing it to the
// literal strings `"undefined"` / `"null"` baked into the Linear issue body.
//
// Run with:
//   npx tsx src/resolvers/SupportTicket.test.ts
//
// These tests instantiate the real `SupportTicketResolver` through typedi and
// inject fakes for `PrismaClient` and `LinearClient` (mirroring the repo's DI
// conventions), then capture the input posted to `linear.createIssue` to verify
// the exact body that would be sent to Linear.

import 'reflect-metadata';
import { Container } from 'typedi';
import { LinearClient } from '@linear/sdk';
import { PrismaClient, PersonType } from '@prisma/client';

// `src/config.ts` throws at import time if any of these environment variables
// are missing. They must be populated before any project module that
// transitively imports `src/config.ts` is required. The external dependencies
// imported above (`typedi`, `@linear/sdk`, `@prisma/client`, `reflect-metadata`)
// do not touch `src/config.ts`, so they are safe to import first. Project
// modules are loaded with `require()` below after the environment is seeded.
const REQUIRED_ENV: Record<string, string> = {
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
  LINEAR_TEAM_ID: 'team-1',
  LINEAR_PROBLEM_LABEL_ID: 'problem-label',
  LINEAR_BLOCKING_LABEL_ID: 'blocking-label',
  METRICS_KEY: 'test',
  PLACID_API_TOKEN: 'test',
  ATTIO_API_TOKEN: 'test',
  ATTIO_ALUMNI_LIST: 'test',
};
for (const [k, v] of Object.entries(REQUIRED_ENV)) {
  if (!process.env[k]) process.env[k] = v;
}

const { SupportTicketResolver } = require('./SupportTicket') as typeof import('./SupportTicket');
const { SupportTicketType } = require('../enums') as typeof import('../enums');

interface LinearIssueInput {
  priority: number;
  labelIds: string[];
  teamId: string;
  title: string;
  description: string;
}

let failures = 0;
let passes = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { failures += 1; console.error(`FAILED: ${message}`); }
  else { passes += 1; console.log(`PASSED: ${message}`); }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures += 1; console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`); }
  else { passes += 1; console.log(`PASSED: ${message}`); }
}

const BANNER = '***PROGRESS IS BEING PREVENTED***';

interface Scenario {
  description?: string | null;
  preventingProgress?: boolean | null;
}

async function runScenario(opts: Scenario): Promise<LinearIssueInput> {
  const created: LinearIssueInput[] = [];

  const fakeMentor = { id: 'mentor-1', givenName: 'Test', surname: 'Mentor', username: 'tmentor' };
  const fakeProject = {
    id: 'project-1',
    students: [{ id: 's1', givenName: 'S', surname: 'One' }],
    mentors: [{ id: 'm1', givenName: 'M', surname: 'One' }],
    event: { name: 'Test Event' },
    issueUrl: null as string | null,
    slackChannelId: null as string | null,
    description: 'A sample project description.',
  };

  const fakeLinear = {
    issues: async () => ({ nodes: [] }),
    createIssue: async (input: LinearIssueInput) => {
      created.push(input);
      return { id: 'lin-1', success: true };
    },
  };

  const fakePrisma = {
    mentor: { findUnique: async () => fakeMentor },
    student: { findUnique: async () => { throw new Error('student.findUnique should not be called for a mentor'); } },
    project: { findFirst: async () => fakeProject },
  };

  Container.reset();
  Container.set(PrismaClient, fakePrisma as any);
  Container.set(LinearClient, fakeLinear as any);

  const resolver = Container.get(SupportTicketResolver);
  const auth = {
    personType: PersonType.MENTOR,
    id: 'mentor-1',
    username: undefined,
    eventId: undefined,
  } as any;

  // Forward the raw JS value verbatim so omitted (`undefined`) and explicit
  // `null` are both exercised, matching what type-graphql forwards to the
  // resolver for a `nullable: true` argument.
  await resolver.createSupportTicket(
    { auth } as any,
    'project-1',
    SupportTicketType.Other,
    opts.description as any,
    opts.preventingProgress as any,
  );

  if (created.length !== 1) {
    throw new Error(`expected exactly one createIssue call, got ${created.length}`);
  }
  return created[0];
}

async function main(): Promise<void> {
  // Case 1: preventingProgress=true, description omitted (undefined) -- the
  // primary bug path: `"banner\n" + undefined` -> literal "undefined".
  {
    const issue = await runScenario({ preventingProgress: true, description: undefined });
    assert(issue.description.includes(BANNER), 'case1 (pp=true, desc=undefined): banner present in body');
    assert(!/\bundefined\b/.test(issue.description), 'case1: no literal "undefined" in body');
    assert(!/\bnull\b/.test(issue.description), 'case1: no literal "null" in body');
    assert(!issue.description.includes(`${BANNER}\nundefined`) && !issue.description.includes(`${BANNER}\nnull`), 'case1: banner is not followed by a literal undefined/null line');
    assertEqual(issue.priority, 1, 'case1: priority escalated to 1');
    assertEqual(issue.labelIds, ['problem-label', 'blocking-label'], 'case1: blocking label attached');
  }

  // Case 2: preventingProgress=true, description=null (explicit) -- the other
  // bug path: `"banner\n" + null` -> literal "null".
  {
    const issue = await runScenario({ preventingProgress: true, description: null });
    assert(issue.description.includes(BANNER), 'case2 (pp=true, desc=null): banner present in body');
    assert(!/\bnull\b/.test(issue.description), 'case2: no literal "null" in body');
    assert(!/\bundefined\b/.test(issue.description), 'case2: no literal "undefined" in body');
    assert(!issue.description.includes(`${BANNER}\nnull`) && !issue.description.includes(`${BANNER}\nundefined`), 'case2: banner is not followed by a literal null/undefined line');
    assertEqual(issue.priority, 1, 'case2: priority escalated to 1');
    assertEqual(issue.labelIds, ['problem-label', 'blocking-label'], 'case2: blocking label attached');
  }

  // Case 3: preventingProgress=true, description provided -- the happy path for
  // the blocking case: banner is prepended to the user's description.
  {
    const issue = await runScenario({ preventingProgress: true, description: 'my laggy build' });
    assert(issue.description.includes(BANNER), 'case3 (pp=true, desc=string): banner present in body');
    assert(issue.description.includes('my laggy build'), 'case3: user description preserved');
    assert(/## Description: \*\*\*PROGRESS IS BEING PREVENTED\*\*\*\nmy laggy build/.test(issue.description), 'case3: banner prepended directly above the user description');
    assert(!/\bundefined\b/.test(issue.description), 'case3: no literal "undefined" in body');
    assert(!/\bnull\b/.test(issue.description), 'case3: no literal "null" in body');
    assertEqual(issue.priority, 1, 'case3: priority escalated to 1');
    assertEqual(issue.labelIds, ['problem-label', 'blocking-label'], 'case3: blocking label attached');
  }

  // Case 4: preventingProgress omitted (undefined), description omitted -- the
  // downstream guard in createSupportTicket should omit the Description section
  // entirely and there must be no banner.
  {
    const issue = await runScenario({ preventingProgress: undefined, description: undefined });
    assert(!issue.description.includes(BANNER), 'case4 (pp=undefined, desc=undefined): no banner when preventingProgress omitted');
    assert(!/## Description: /.test(issue.description), 'case4: no Description section when description absent');
    assert(!/\bundefined\b/.test(issue.description), 'case4: no literal "undefined" in body');
    assert(!/\bnull\b/.test(issue.description), 'case4: no literal "null" in body');
    assert(!/## Description: (undefined|null)/.test(issue.description), 'case4: no corrupted Description section');
    assertEqual(issue.priority, 2, 'case4: default priority is 2');
    assertEqual(issue.labelIds, ['problem-label'], 'case4: only the problem label attached');
  }

  // Case 5: preventingProgress=false, description provided -- non-blocking path
  // keeps the description and must not prepend the banner.
  {
    const issue = await runScenario({ preventingProgress: false, description: 'just a heads up' });
    assert(!issue.description.includes(BANNER), 'case5 (pp=false, desc=string): no banner when preventingProgress is false');
    assert(issue.description.includes('## Description: just a heads up'), 'case5: description section present and unmodified');
    assert(!/\bundefined\b/.test(issue.description), 'case5: no literal "undefined" in body');
    assert(!/\bnull\b/.test(issue.description), 'case5: no literal "null" in body');
    assertEqual(issue.priority, 2, 'case5: default priority is 2');
    assertEqual(issue.labelIds, ['problem-label'], 'case5: only the problem label attached');
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll tests passed (${passes} assertions).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
