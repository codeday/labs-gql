import Container from "typedi";
import { ArrayElement } from "../utils";
import { classesToLogitBias, isomorphicLabelProbability } from "./format";
import OpenAIApi from "openai";

export async function getCompletion<T extends string[]>(
  classes: T,
  model: string,
  messages: OpenAIApi.Chat.Completions.ChatCompletionMessageParam[],
): Promise<ArrayElement<T>> {
  const openAi = Container.get(OpenAIApi);

  const result = await openAi.chat.completions.create({
    model,
    messages,
    logprobs: true,
    temperature: 0,
    logit_bias: classesToLogitBias(classes),
    max_tokens: 2,
    top_logprobs: 5,
  });
  const logprobs = result.choices[0].logprobs!.content!
    .map(c => Object.fromEntries(
      c.top_logprobs
        .map(p => [p.token, p.logprob] as [string, number])
    )) as Record<string, number>[];

  const tokenProbs = classes
    .map(c => [c, isomorphicLabelProbability(c, logprobs)] as [ArrayElement<T>, number])
    .sort((a, b) => a[1] < b[1] ? 1 : -1);

  return tokenProbs[0][0];
}