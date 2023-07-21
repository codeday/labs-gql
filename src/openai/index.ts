import { Event, PrismaClient, ProjectStatus, StandupResult, StudentStatus } from '@prisma/client';
import { OpenAIApi } from 'openai';
import { encode } from 'gpt-tokenizer';
import Container from 'typedi';
import { ArrayElement, PickNonNullable } from '../utils';
import { CLASSES, Model, completionToClass, isomorphicLabelProbability, textToCompletionPrompt } from './format';

export { syncAiPendingModels, syncAiTraining } from './training';

type StandupWithModel = StandupResult
  & { event: PickNonNullable<Event, 'standupAiModelVague' | 'standupAiModelWorkload'> };

function classesToLogitBias(classes: string[]): [number, number][] {
  return classes
    .flatMap(t => [t, ` ${t}`, `\n${t}`])
    .flatMap(t => encode(t))
    .map(t => [t, 100]);
}

async function getCompletion<T extends string[]>(
  classes: T,
  model: string,
  prompt: string,
): Promise<ArrayElement<T>> {
  const openAi = Container.get(OpenAIApi);

  const result = await openAi.createCompletion({
    model,
    prompt,// textToCompletionPrompt(standup.text)
    logprobs: 5,
    temperature: 0,
    logit_bias: classesToLogitBias(classes),
    max_tokens: 4,
  });
  const logprobs = result.data.choices[0].logprobs!.top_logprobs! as Record<string, number>[];

  const tokenProbs = classes
    .map(c => [c, isomorphicLabelProbability(c, logprobs)] as [ArrayElement<T>, number])
    .sort((a, b) => a[1] > b[1] ? 1 : -1);

  return completionToClass<ArrayElement<T>>(tokenProbs[0][0]);
}

async function getProjectStandupScore(
  standup: StandupWithModel,
): Promise<number> {
  const vague = await getCompletion(
    CLASSES,
    standup.event.standupAiModelVague,
    textToCompletionPrompt(Model.Vague, standup.text),
  );
  if (vague === 'yes') return 1;

  const workload = await getCompletion(
    CLASSES,
    standup.event.standupAiModelWorkload,
    textToCompletionPrompt(Model.Workload, standup.text)
  );
  return workload === 'yes' ? 3 : 2;
}

async function scoreProjectStandup(
  standup: StandupWithModel
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const rating = await getProjectStandupScore(standup);

  console.log(`Standup ${standup.id} was scored ${rating}`);

  await prisma.standupResult.update({
    where: { id: standup.id },
    data: { rating },
  });
}

export async function scoreStandups() {
  const prisma = Container.get(PrismaClient);
  const standups = await prisma.standupResult.findMany({
    where: {
      event: {
        isActive: true,
        standupAiModelVague: { not: null, contains: ':' },
        standupAiModelWorkload: { not: null, contains: ':' },
      },
      student: { status: StudentStatus.ACCEPTED },
      humanRated: false,
      rating: null,
    },
    include: {
      event: { select: { standupAiModelVague: true, standupAiModelWorkload: true } },
    },
  }) as StandupWithModel[];

  console.log(`Scoring ${standups.length} standups.`);

  for (const standup of standups) {
    await scoreProjectStandup(standup);
  }
}