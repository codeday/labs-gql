/**
 * Offline unit tests for the OpenAI prompt-formatting helpers, focused on the
 * truncation loop in `textToCompletionPrompt`. No live DB or OpenAI access is
 * required — only the repo's pinned `gpt-tokenizer` is exercised.
 *
 * Run with:
 *   npx ts-node src/openai/format.test.ts
 *   # or:
 *   npx tsx src/openai/format.test.ts
 */
import { encode } from 'gpt-tokenizer/cjs/model/gpt-3.5-turbo';
import { StandupResult } from '@prisma/client';
import { PickNonNullable } from '../utils';
import {
  MODEL_MAX_TOKENS,
  BINARY_CLASSIFICATION_PROMPTS,
  textToCompletionPrompt,
  getTrainingExample,
  valToCompletionExample,
} from './format';
import { ModelType } from './types';

type AnyMessage = { role: string; content: string };

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

function asMessages(msgs: ReturnType<typeof textToCompletionPrompt>): AnyMessage[] {
  return msgs as unknown as AnyMessage[];
}

function userContentOf(msgs: ReturnType<typeof textToCompletionPrompt>): string {
  return asMessages(msgs)[1].content;
}

function rolesOf(msgs: ReturnType<typeof textToCompletionPrompt>): string[] {
  return asMessages(msgs).map(m => m.role);
}

// A code/prose-shaped standup fragment that is comfortably over the model token
// budget once repeated.
const SENTENCE = 'the quick brown fox jumps over the lazy dog while async handlers dispatch tokens';

function oversizedStandupText(): string {
  // ~4200 tokens with gpt-tokenizer's gpt-3.5-turbo model.
  return SENTENCE.repeat(300);
}

// Per-call wall-clock budget. The loop converges in well under 100ms even for
// very large inputs; a regression to a non-terminating loop would hang the test
// process before this assertion could be reached, so an external harness/CI
// timeout is expected to catch that case.
const CONVERGENCE_BUDGET_MS = 5000;

function runWithinBudget<T>(fn: () => T, message: string): T {
  const start = Date.now();
  const result = fn();
  const elapsed = Date.now() - start;
  assert(elapsed < CONVERGENCE_BUDGET_MS, `${message} (returned in ${elapsed}ms, budget ${CONVERGENCE_BUDGET_MS}ms)`);
  return result;
}

// Guards the truncation loop against regressing to a non-terminating form (the
// original bug computed the slice keep-count from the character count instead
// of the word count, making the slice a no-op and the loop infinite).
(function testOversizedInputTerminatesAndFitsBudget() {
  const text = oversizedStandupText();
  assert(encode(text).length > MODEL_MAX_TOKENS, 'oversized input is over the token budget before truncation');

  const messages = runWithinBudget(
    () => textToCompletionPrompt(ModelType.Vague, text),
    'oversized input does not infinite-loop',
  );

  const userContent = userContentOf(messages);
  const finalTokens = encode(userContent).length;
  assert(
    finalTokens <= MODEL_MAX_TOKENS,
    `truncated user content fits the token budget (final=${finalTokens}, budget=${MODEL_MAX_TOKENS})`,
  );
})();

// Guards the truncation loop against collapsing the user slot to the empty
// string for token-dense, space-sparse input. The word-count formula computes
// `end = words.length - Math.ceil((tokens - MAX)/2)`; when the overage-per-2 is
// greater than or equal to the word count, `Array.prototype.slice(0, end)`
// clamps to `[]` and the user message becomes `""`. Compact JSON (the default
// output of `JSON.stringify`, with no inter-token whitespace) hits this path
// because a large blob encodes to thousands of tokens but splits into only a
// handful of space-delimited words.
(function testTokenDenseSpaceSparseInputDoesNotCollapseToEmpty() {
  const jsonError = JSON.stringify({
    error: 'InternalServerError',
    code: 500,
    message: 'DB pool exhausted',
    stack: Array.from({ length: 120 }, (_, i) => ({
      file: `/app/src/modules/mod${i}/service${i}.ts`,
      line: i * 50,
      col: i,
      fn: `handleRequest${i}`,
      err: `ECONNREFUSED:${i}`,
    })),
  });
  const text = [
    `What did you do yesterday?\nI hit a 500 error and captured the response:\n${jsonError}`,
    'What will you do today?\nDebug the API error.',
    'Any blockers?\nDB pool issue.',
  ].join('\n\n');
  assert(encode(text).length > MODEL_MAX_TOKENS, 'compact-JSON input is over the token budget before truncation');
  assert(
    text.split(' ').length < Math.ceil((encode(text).length - MODEL_MAX_TOKENS) / 2),
    'compact-JSON input is in the single-step collapse region (C >= W)',
  );

  const messages = runWithinBudget(
    () => textToCompletionPrompt(ModelType.Vague, text),
    'compact-JSON input does not infinite-loop',
  );

  const userContent = userContentOf(messages);
  assert(userContent.length > 0, 'compact-JSON input does not collapse the user slot to the empty string');
  const finalTokens = encode(userContent).length;
  assert(
    finalTokens <= MODEL_MAX_TOKENS,
    `compact-JSON user content fits the token budget (final=${finalTokens}, budget=${MODEL_MAX_TOKENS})`,
  );
})();

// Guards the single-word over-budget edge case: when the entire over-budget
// input is one whitespace-free token, the keep-count clamps to 1 and
// `slice(0, 1)` returns the same word, so the `next >= truncatedTextTokenLength`
// guard must break out of the loop rather than spinning forever. The result
// stays non-empty (the whole word is preserved since it cannot be split), even
// though it remains over the model's token budget.
(function testSingleOverBudgetWordTerminatesAndStaysNonEmpty() {
  const text = 'A'.repeat(20000); // ~2500 tokens, single whitespace-free "word"
  assert(encode(text).length > MODEL_MAX_TOKENS, 'single-word input is over the token budget before truncation');
  assert(text.split(' ').length === 1, 'single-word input has exactly one space-delimited word');

  const messages = runWithinBudget(
    () => textToCompletionPrompt(ModelType.Vague, text),
    'single over-budget word does not infinite-loop',
  );

  const userContent = userContentOf(messages);
  assert(userContent.length > 0, 'single over-budget word does not collapse the user slot to the empty string');
  assertEqual(userContent, text, 'single over-budget word is preserved verbatim (cannot be sub-word split)');
})();

// Guards against over-truncation: input already within the budget must be
// passed through verbatim.
(function testUnderlimitInputPassedThroughUnchanged() {
  const text = 'Yesterday I fixed a flaky test and reviewed two PRs. Today I will pair on the API.';
  assert(encode(text).length <= MODEL_MAX_TOKENS, 'under-limit input is genuinely under the budget');

  const messages = textToCompletionPrompt(ModelType.Vague, text);
  assertEqual(userContentOf(messages), text, 'under-limit input is passed through verbatim in the user slot');
})();

// Guards the canonical chat-completions prompt shape consumed by both callers
// (aiTrain's training examples and aiScoreStandups's completion requests).
(function testPromptStructureHasFourMessagesWithCorrectRoles() {
  const messages = textToCompletionPrompt(ModelType.Vague, 'A short standup.');
  assertEqual(asMessages(messages).length, 4, 'prompt has exactly 4 messages');
  assertEqual(rolesOf(messages), ['system', 'user', 'assistant', 'user'], 'message roles are in canonical order');
  assertEqual(
    asMessages(messages)[0].content,
    'You are an agile scrum manager in a software company reviewing your team\'s standup updates.',
    'system message is the agile scrum manager prompt',
  );
  assertEqual(
    asMessages(messages)[2].content,
    'What would you like to know about this standup update?',
    'assistant priming message is unchanged',
  );
})();

// Guards that the final user turn is the correct classification question for
// each model type.
(function testFinalUserMessageIsClassificationPrompt() {
  for (const modelType of [ModelType.Vague, ModelType.Workload]) {
    const messages = textToCompletionPrompt(modelType, 'A short standup.');
    assertEqual(
      asMessages(messages)[3].content,
      BINARY_CLASSIFICATION_PROMPTS[modelType],
      `final user message is the ${modelType} classification prompt`,
    );
  }
})();

function makeExample(text: string, rating: number): PickNonNullable<StandupResult, 'text' | 'rating'> {
  return { text, rating } as PickNonNullable<StandupResult, 'text' | 'rating'>;
}

// Guards the rating -> yes/no completion matrix used by aiTrain's training
// corpus. The Vague vs Workload semantics (rating 1 vs 3 mean opposite things
// per model) are a subtle footgun.
(function testGetTrainingExampleCompletionLabels() {
  const cases: Array<{ modelType: ModelType; rating: number; expected: 'yes' | 'no' }> = [
    { modelType: ModelType.Vague, rating: 1, expected: 'yes' },    // rating 1 => vague => yes
    { modelType: ModelType.Vague, rating: 3, expected: 'no' },     // rating 3 => not vague => no
    { modelType: ModelType.Workload, rating: 3, expected: 'yes' },// rating 3 => productive => yes
    { modelType: ModelType.Workload, rating: 1, expected: 'no' }, // rating 1 => not productive => no
  ];

  for (const { modelType, rating, expected } of cases) {
    const example = getTrainingExample(modelType, makeExample('A short standup.', rating));
    const msgs = asMessages(example.messages);
    assertEqual(msgs.length, 5, `${modelType}/rating=${rating}: example has 5 messages`);
    assertEqual(msgs[4].role, 'assistant', `${modelType}/rating=${rating}: completion is an assistant message`);
    assertEqual(
      msgs[4].content,
      valToCompletionExample(expected),
      `${modelType}/rating=${rating}: completion label is ${expected}`,
    );
  }
})();

// --- entry point ------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
