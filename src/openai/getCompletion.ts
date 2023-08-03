import Container from "typedi";
import { ArrayElement } from "../utils";
import { classesToLogitBias, isomorphicLabelProbability } from "./format";
import { OpenAIApi } from "openai";

export async function getCompletion<T extends string[]>(
  classes: T,
  model: string,
  prompt: string,
): Promise<ArrayElement<T>> {
  const openAi = Container.get(OpenAIApi);

  const result = await openAi.createCompletion({
    model,
    prompt,
    logprobs: 5,
    temperature: 0,
    logit_bias: classesToLogitBias(classes),
    max_tokens: 4,
  });
  const logprobs = result.data.choices[0].logprobs!.top_logprobs! as Record<string, number>[];

  const tokenProbs = classes
    .map(c => [c, isomorphicLabelProbability(c, logprobs)] as [ArrayElement<T>, number])
    .sort((a, b) => a[1] < b[1] ? 1 : -1);

  return tokenProbs[0][0];
}