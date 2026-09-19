/**
 * Offline unit tests for GitHub URL parsing. No network access required.
 *
 * Run with:
 *   npx ts-node src/github/index.test.ts
 */
import { parseGithubRepoUrl, parseGithubPullRequestUrl } from './index';

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

(function testParseGithubRepoUrl() {
  assertEqual(
    parseGithubRepoUrl('https://github.com/codeday/labs-gql/issues/42'),
    { owner: 'codeday', repo: 'labs-gql' },
    'parses owner/repo from an issue URL',
  );
  assertEqual(
    parseGithubRepoUrl('https://github.com/codeday/labs-gql/pull/42'),
    { owner: 'codeday', repo: 'labs-gql' },
    'parses owner/repo from a pull request URL',
  );
  assertEqual(
    parseGithubRepoUrl('https://www.github.com/codeday/labs-gql'),
    { owner: 'codeday', repo: 'labs-gql' },
    'parses owner/repo from a bare repo URL with www',
  );
  assertEqual(
    parseGithubRepoUrl('https://github.com/codeday/labs-gql.git'),
    { owner: 'codeday', repo: 'labs-gql' },
    'strips a trailing .git suffix',
  );
  assertEqual(
    parseGithubRepoUrl('https://gitlab.com/codeday/labs-gql/issues/42'),
    null,
    'rejects a non-github.com URL',
  );
  assertEqual(
    parseGithubRepoUrl('not a url'),
    null,
    'rejects a non-URL string',
  );
})();

(function testParseGithubPullRequestUrl() {
  assertEqual(
    parseGithubPullRequestUrl('https://github.com/codeday/labs-gql/pull/42'),
    { owner: 'codeday', repo: 'labs-gql', number: 42 },
    'parses owner/repo/number from a pull request URL',
  );
  assertEqual(
    parseGithubPullRequestUrl('https://github.com/codeday/labs-gql/issues/42'),
    null,
    'rejects an issue URL',
  );
  assertEqual(
    parseGithubPullRequestUrl('https://github.com/codeday/labs-gql'),
    null,
    'rejects a bare repo URL',
  );
})();

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
