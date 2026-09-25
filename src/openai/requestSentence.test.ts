/**
 * Offline regression tests for the `requestSentence` filter contract, focused on the
 * PLACEHOLDER_RE bug where the first alternative was the unanchored bare word
 * `placeholder`: substantive summaries that merely mentioned a placeholder (e.g.
 * "Replaced the placeholder logo with a real project image") were discarded as if they
 * were stand-in non-answers, silently dropping the row in both callers.
 *
 * No live DB or OpenAI access — the OpenAI client is stubbed with an object that
 * returns a `submit_sentence` tool call carrying a crafted sentence, so the
 * NON_ANSWER_RE -> PLACEHOLDER_RE pipeline is exercised through the public contract.
 *
 * Run with:
 *   npx ts-node src/openai/requestSentence.test.ts
 *   # or (no type-graphql decorator dependency, so transpile-only is safe):
 *   npx ts-node --transpile-only src/openai/requestSentence.test.ts
 */
import type OpenAIApi from 'openai';
import { requestSentence } from './requestSentence';
import type { OpenRouterChatCompletionCreateParams } from './requestSentence';

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

const PARAMS = {
  model: 'test-model',
  messages: [],
} as unknown as OpenRouterChatCompletionCreateParams;

function makeCompletion(sentence: string): unknown {
  return {
    choices: [{
      message: {
        tool_calls: [{
          type: 'function',
          function: {
            name: 'submit_sentence',
            arguments: JSON.stringify({ sentence }),
          },
        }],
      },
    }],
  };
}

async function requestWith(sentence: string): Promise<string | null> {
  const client = { chat: { completions: { create: async (): Promise<unknown> => makeCompletion(sentence) } } };
  return requestSentence(client as unknown as OpenAIApi, PARAMS);
}

// The reported bug: substantive summaries that mention "placeholder" mid-sentence must
// be returned verbatim, not misclassified as a stand-in and discarded.
async function testSubstantiveSentencesMentioningPlaceholderAreKept(): Promise<void> {
  const cases = [
    'Replaced the placeholder logo with a real project image',
    'Swapped placeholder text on the homepage for real content',
    'Updated a placeholder license file with the correct MIT text',
    'Removed a stale placeholder constant that broke the build',
    'Filled in placeholder values for the new config file',
  ];
  for (const c of cases) {
    assertEqual(await requestWith(c), c, `substantive sentence mentioning placeholder is kept: "${c}"`);
  }
}

// Regression guard: leading stand-ins that start with "placeholder" (the genuine
// target of the first alternative) are still rejected after anchoring it.
async function testLeadingPlaceholderStandInsAreRejected(): Promise<void> {
  const cases = ['placeholder', 'Placeholder', 'Placeholder description', 'placeholder, not a real answer'];
  for (const c of cases) {
    assertEqual(await requestWith(c), null, `leading stand-in rejected: "${c}"`);
  }
}

// Regression guard: the other two PLACEHOLDER_RE branches ("no/not ... available/found"
// and "[I] could not/couldn't/was unable to ... find ...") still reject genuine
// non-answers (anchoring the first alternative must not perturb them).
async function testCouldNotFindAndNoInformationBranchesReject(): Promise<void> {
  const cases = [
    'No information available',
    "I couldn't find any details",
    'was unable to find the project',
  ];
  for (const c of cases) {
    assertEqual(await requestWith(c), null, `"couldn't find"/"no information" branch rejects: "${c}"`);
  }
}

// Sanity guard: NON_ANSWER_RE still rejects task-completion remarks.
async function testNonAnswerReRejects(): Promise<void> {
  const cases = ['I confirm the command has been executed', 'Task completed'];
  for (const c of cases) {
    assertEqual(await requestWith(c), null, `non-answer filter still rejects: "${c}"`);
  }
}

// Sanity guard: genuine substantive answers (research + PR-summary shapes) are
// returned verbatim.
async function testGenuineSubstantiveAnswersAreReturned(): Promise<void> {
  const cases = ["Used in Pixar's rendering pipeline.", 'Added input validation to the login form.'];
  for (const c of cases) {
    assertEqual(await requestWith(c), c, `genuine answer returned verbatim: "${c}"`);
  }
}

// Documents the narrowing tradeoff: a longer word starting with "placeholder" but with
// no word boundary right after (e.g. "placeholders") is NOT caught by `^placeholder\b` —
// the substance of such a sentence is kept. This is the intended consequence of using
// `\b` rather than re-anchoring on the bare substring.
async function testPluralPlaceholderPrefixedWordIsKeptByAnchor(): Promise<void> {
  assertEqual(
    await requestWith('Removed obsolete placeholders from the config templates'),
    'Removed obsolete placeholders from the config templates',
    'anchored first alternative does not match a longer word starting with "placeholder"',
  );
}

async function main(): Promise<void> {
  await testSubstantiveSentencesMentioningPlaceholderAreKept();
  await testLeadingPlaceholderStandInsAreRejected();
  await testCouldNotFindAndNoInformationBranchesReject();
  await testNonAnswerReRejects();
  await testGenuineSubstantiveAnswersAreReturned();
  await testPluralPlaceholderPrefixedWordIsKeptByAnchor();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
