import { CreateCompletionResponseChoicesInner } from "openai";
import { PickNonNullable } from "../utils";
import { encode } from 'gpt-tokenizer/cjs/model/babbage';

export function classesToLogitBias(classes: string[]): Record<number, number> {
  return Object.fromEntries(
    classes
      .flatMap(t => [t, ` ${t}`, `\n${t}`])
      .flatMap(t => encode(t, ))
      .map(t => [t, 100])
  );
}


export enum Model {
  Vague = 'Vague',
  Workload = 'Workload',
};

export const CLASSES = ['yes', 'no'] as ['yes', 'no'];


const INSTRUCTIONS = {
  [Model.Vague]: `
    You are an engineering manager categorizing status updates submitted by engineers as vague or not vague.
    An update is not vague if most of the tasks listed can be checked off when they're done. If it's not
    obvious what was done, or what will be done, the update is vague. (For example updates which say someone will
    "continue" doing something or will "learn" something are usually vague.) 
  `,
  [Model.Workload]: `
    You are an engineering manager reviewing the daily performance of software engineers, and categorizing them
    as either productive or unproductive. An engineer is productive if either the tasks the accomplished in the past,
    or the tasks they plan to accomplish, could represent at least 5 hours of full-time work.
  `,
};

const PROMPTS = {
  [Model.Vague]: 'Update was vague:',
  [Model.Workload]: 'Person was productive:',
};

const MODEL_MAX_TOKENS = 2049;

function textToCompletionPromptUnchecked(model: Model, text: string): string {
  const modelInstructions = INSTRUCTIONS[model].trim().replace(/\n/g, '');
  const modelPrompt = PROMPTS[model];
  //return `${modelInstructions}\n\nUpdate:\n${text}\n\n###\n${modelPrompt}`;
  return `${text}\n\n###\n${modelPrompt}`;
}

export function textToCompletionPrompt(model: Model, text: string): string {
  let truncatedText = text;
  let truncatedTextTokenLength = encode(
    textToCompletionPromptUnchecked(model, truncatedText)
  ).length;

  while (truncatedTextTokenLength > MODEL_MAX_TOKENS) {
    truncatedText = truncatedText
      .split(' ')
      .slice(0, truncatedText.length - Math.round((truncatedTextTokenLength - MODEL_MAX_TOKENS)/2))
      .join(' ');

    truncatedTextTokenLength = encode(
      textToCompletionPromptUnchecked(model, truncatedText)
    ).length;
  }

  return textToCompletionPromptUnchecked(model, truncatedText)
}

export function valToCompletionExample(val: string | number): string {
  return ` ${val.toString()}\n`;
}

// See https://medium.com/edge-analytics/getting-the-most-out-of-gpt-3-based-text-classifiers-part-three-77305628f472
export function isomorphicLabelProbability(
  label: string,
  logprobs: Record<string, number>[]
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