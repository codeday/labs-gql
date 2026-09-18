import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(__filename), '..');

// Regression guards for the LINEAR_BLOCKING_LABEL_ID footgun: the env var is
// consumed with a non-null assertion (`process.env.LINEAR_BLOCKING_LABEL_ID!`)
// in src/config.ts, so it must also be listed in the required-env-vars guard
// array — otherwise it silently becomes `undefined` at runtime and, for
// blocking tickets (`preventingProgress: true`), a `null` element is serialized
// into the Linear `labelIds` array, which Linear's `[String!]` schema rejects
// (the whole `issueCreate` mutation fails). These static checks catch the
// exact class of regression (a `!`-asserted env var missing from the guard /
// test template) without the overhead of booting the server.

test('src/config.ts lists LINEAR_BLOCKING_LABEL_ID in the required-env-vars array', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'src/config.ts'), 'utf-8');
  // The startup guard is the array literal preceding the
  // `.forEach((req) => { if (!process.env[req]) throw ... })` call. Entries are
  // indented, so the regex allows leading whitespace.
  const guardBlock = src.split('.forEach((req) =>')[0];
  assert.ok(
    /^\s*'LINEAR_BLOCKING_LABEL_ID',\s*$/m.test(guardBlock),
    'LINEAR_BLOCKING_LABEL_ID must appear in the required-env-vars array in src/config.ts '
      + '(otherwise the non-null assertion silently yields `undefined` at runtime)',
  );
  // The siblings must remain too — guards against an accidental cleanup that
  // drops the whole Linear block.
  for (const name of ['LINEAR_API_KEY', 'LINEAR_TEAM_ID', 'LINEAR_PROBLEM_LABEL_ID']) {
    assert.ok(
      new RegExp(`^\\s*'${name}',\\s*$`, 'm').test(guardBlock),
      `${name} must remain in the required-env-vars array`,
    );
  }
});

test('.env.test.example provides LINEAR_BLOCKING_LABEL_ID', () => {
  const example = readFileSync(resolve(REPO_ROOT, '.env.test.example'), 'utf-8');
  assert.ok(
    /^LINEAR_BLOCKING_LABEL_ID=.+$/m.test(example),
    '.env.test.example must define LINEAR_BLOCKING_LABEL_ID so test/CI envs boot cleanly',
  );
  assert.ok(
    /^LINEAR_PROBLEM_LABEL_ID=.+$/m.test(example),
    'LINEAR_PROBLEM_LABEL_ID must remain in .env.test.example',
  );
});
