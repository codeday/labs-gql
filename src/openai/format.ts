import { PickNonNullable } from "../utils";
import { encode } from 'gpt-tokenizer/cjs/model/babbage';
import { StandupResult } from "@prisma/client";
import { ModelType, OpenAILogitBias, OpenAILogprobs, OpenAITrainingExample } from "./types";

export const MODEL_MAX_TOKENS = 2049;
export const BINARY_CLASSIFICATION_CLASSES = ['yes', 'no'] as ['yes', 'no'];
export const BINARY_CLASSIFICATION_PROMPTS = {
  [ModelType.Vague]: 'Update was vague:',
  [ModelType.Workload]: 'Person was productive:',
};

/**
 * Converts classification classes into a logitBias object, which forces
 * GPT to only output those tokens. This improves the quality of predictions.
 * @param classes List of possible output classes.
 * @returns logit_bias input for GPT.
 */
export function classesToLogitBias(classes: string[]): OpenAILogitBias {
  return Object.fromEntries(
    classes
      // GPT encodes e.g. `no`, ` no`, `No`, etc with different tokens. We can
      // improve the accuracy of the model by allowing it to predict all four
      // options for each class.
      .flatMap(t => [
        t,
        ` ${t}`,
        `${t[0].toUpperCase() + t.slice(1)}`,
        ` ${t[0].toUpperCase() + t.slice(1)}`,
      ])

      // Convert each possible output to its GPT tokens.
      .flatMap(t => encode(t))

      // Weight each token as 100, making it extremely unlikely GPT will predict
      // any other tokens.
      .map(t => [t, 100])
  );
}

/**
 * Generates a training prompt/completion for OpenAI based on the provided standup.
 * 
 * @param modelType Is the model for vagueness or workload?
 * @param example Specific standup example.
 * @returns OpenAI prompt/completion pair.
 */
export function getTrainingExample(
  modelType: ModelType,
  example: PickNonNullable<StandupResult, 'text' | 'rating'>
): OpenAITrainingExample {
  const completionYes = modelType === ModelType.Vague
    ? (example.rating === 1) // is this vague? 1 => yes, this is vague.
    : (example.rating === 3); // is this productive? 3 yes, this is productive.

  return {
    prompt: textToCompletionPrompt(modelType, example.text),
    completion: valToCompletionExample(completionYes ? 'yes' : 'no'),
  };
}

/**
 * Reformats classification text into OpenAI's recommended format for
 * classification tasks. Does not check length.
 * 
 * @param modelType Is the model for vagueness or workload?
 * @param text Text to score.
 * @returns Full model prompt.
 */
function textToCompletionPromptUnchecked(
  modelType: ModelType,
  text: string
): string {
  const modelPrompt = BINARY_CLASSIFICATION_PROMPTS[modelType];
  return `${text}\n\n###\n${modelPrompt}`;
}

/**
 * Reformats classification text into OpenAI's recommended format for
 * classification tasks. Truncates the value of `text` if the final prompt
 * would exceed the max token length for the model.
 * 
 * @param modelType Is the model for vagueness or workload?
 * @param text Text to score.
 * @returns Full model prompt.
 */
export function textToCompletionPrompt(
  modelType: ModelType,
  text: string
): string {
  let truncatedText = text;
  let truncatedTextTokenLength = encode(
    textToCompletionPromptUnchecked(modelType, truncatedText)
  ).length;

  while (truncatedTextTokenLength > MODEL_MAX_TOKENS) {
    truncatedText = truncatedText
      .split(' ')
      .slice(0, truncatedText.length - Math.ceil((truncatedTextTokenLength - MODEL_MAX_TOKENS)/2))
      .join(' ');

    truncatedTextTokenLength = encode(
      textToCompletionPromptUnchecked(modelType, truncatedText)
    ).length;
  }

  return textToCompletionPromptUnchecked(modelType, truncatedText)
}

/**
 * Reformats classification response example into OpenAI's recommended format
 * for classification tasks. Does not check length.
 * 
 * @param val Example response.
 * @returns Full model response example.
 */
export function valToCompletionExample(val: string | number): string {
  return ` ${val.toString()}\n`;
}

/**
 * Calculates the total probability for the given label to be the prediction
 * given a logprobs array from GPT. The total probability will take into
 * account:
 * 
 * - Variants: P(`no`) = P(`no`) + p(` no`) + p(` No`) ...
 * - Sequences: P(`hello world`) = p(`hello`) * p(` world`).
 * 
 * This function also converts from logprob, so the final result will range from
 * 0 to 1.
 * 
 * @see https://medium.com/edge-analytics/getting-the-most-out-of-gpt-3-based-text-classifiers-part-three-77305628f472
 * @param label The label to check
 * @param logprobs Logprobs array from the AI response
 * @returns Prediction probability for the label, as a percent from 0-1.
 */
export function isomorphicLabelProbability(
  label: string,
  logprobs: OpenAILogprobs,
): number {
  let prob = 0;
  const labelClean = label.toLowerCase().trim();

  if (logprobs.length === 0 || !logprobs) return 0;

  // Check each token
  for (const [k, logprob] of Object.entries(logprobs[0])) {
    const kClean = k.toLowerCase().trim();
    if (kClean == '') continue;

    // Add probabilities for case variants
    if (labelClean === kClean) prob += Math.exp(logprob);

    // Multiply probabilities for multi-token sequences
    else if (labelClean.startsWith(kClean)) {
      const remainingLabel = labelClean.slice(kClean.length);
      const remainingLogprobs = logprobs.slice(1) || [];
      prob += Math.exp(logprob)
        * isomorphicLabelProbability(remainingLabel, remainingLogprobs);
    }
  }

  return prob;
}