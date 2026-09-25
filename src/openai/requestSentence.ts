import OpenAIApi from 'openai';

// OpenRouter's `reasoning` parameter isn't part of the upstream OpenAI schema, so the
// `openai` SDK's types reject it via excess-property checking unless we widen the type.
export type OpenRouterChatCompletionCreateParams =
  OpenAIApi.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    reasoning?: { effort?: 'low' | 'medium' | 'high' };
  };

// A plain "only return a sentence" instruction isn't enough: reasoning/search models
// routinely narrate their findings before (or instead of) giving a clean final answer.
// Forcing the answer through a tool call constrains the shape at the API level instead
// of relying on the model to follow a text instruction, so callers don't end up saving
// a paragraph of notes into what's supposed to be a one-sentence field.
const SUBMIT_SENTENCE_TOOL: OpenAIApi.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_sentence',
    description: 'Submit the final answer text. This is not an action to perform or confirm — it is where you write your actual answer.',
    parameters: {
      type: 'object',
      properties: {
        sentence: {
          type: 'string',
          description: 'A single sentence of 5-10 words containing your substantive answer to the question asked. '
            + 'No preamble, caveats, or citations. Never a status/confirmation message '
            + '(e.g. never "I confirm..." or "Task completed...") — those are not valid answers.',
        },
      },
      required: ['sentence'],
      additionalProperties: false,
    },
  },
};

// A generous ceiling past the requested 5-10 words. If the model still stuffs a
// paragraph into the tool argument, callers should treat it as no answer rather than
// permanently saving it.
const MAX_SENTENCE_WORDS = 20;

// Tool-calling models occasionally treat a tool named `submit_*` as an action to
// perform rather than a field to fill in, and answer with a generic task-completion
// remark instead of substantive content (e.g. "I confirm the command has been
// executed."). These are short, so the word-count ceiling above won't catch them —
// reject anything that looks like this instead of saving it.
const NON_ANSWER_RE = /^(i (confirm|have completed|have executed)|task (complete|completed|has been completed)|(the )?(command|action|request) (has been|was) (executed|completed|performed)|done\.?$)/i;

// When research (e.g. a web-search-grounded model call) comes up empty, the model is
// still forced to call the tool, and some models satisfy that by submitting a stand-in
// string instead of admitting they found nothing. Reject these the same way as a
// non-answer, rather than saving them as if they were a real result.
//
// The `placeholder` stand-in is matched only as a bare token or a one-word label
// (`^placeholder\b(\s+\w+)?\W*$`): a substantive sentence that merely starts with the
// word "placeholder" (e.g. "Placeholder logo was replaced with a real project image")
// is a real summary, not a stand-in, and is kept. Matching the bare word alone would
// drop it, and both callers mark the row fetched without retrying, so the loss would be
// permanent. Explicit disclaimers longer than a bare label can't be told apart from a
// real sentence by shape alone, so they're let through rather than risk dropping a real
// summary.
const PLACEHOLDER_RE = /^placeholder\b(\s+\w+)?\W*$|^(no|not) (specific |concrete |publicly )?(information|data|details) (is |was |)?(available|found)|^(i )?(could not|couldn't|was unable to) find/i;

/**
 * Requests a single short sentence from a chat model, forcing the answer through a
 * tool call rather than trusting free-form text to come back clean. Returns null if
 * the model didn't call the tool, returned unparsable arguments, returned a
 * "sentence" that's suspiciously long, returned a generic task-completion remark
 * instead of substantive content, or admitted (via a placeholder/"couldn't find"
 * style answer) that it doesn't actually have one.
 */
export async function requestSentence(
  client: OpenAIApi,
  params: Omit<OpenRouterChatCompletionCreateParams, 'tools' | 'tool_choice'>,
): Promise<string | null> {
  const completion = await client.chat.completions.create({
    ...params,
    tools: [SUBMIT_SENTENCE_TOOL],
    tool_choice: { type: 'function', function: { name: 'submit_sentence' } },
  } as OpenRouterChatCompletionCreateParams);

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (toolCall?.type !== 'function' || toolCall.function.name !== 'submit_sentence') return null;

  let sentence: string | undefined;
  try {
    ({ sentence } = JSON.parse(toolCall.function.arguments) as { sentence?: string });
  } catch {
    return null;
  }

  sentence = sentence?.trim();
  if (!sentence) return null;
  if (sentence.split(/\s+/).length > MAX_SENTENCE_WORDS) return null;
  if (NON_ANSWER_RE.test(sentence)) return null;
  if (PLACEHOLDER_RE.test(sentence)) return null;

  return sentence;
}
