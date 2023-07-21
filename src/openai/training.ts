import { Event, PrismaClient, StandupResult } from "@prisma/client";
import Container from "typedi";
import { PickNonNullable, groupBy } from "../utils";
import { Model, valToCompletionExample, textToCompletionPrompt } from "./format";
import { OpenAIApi } from "openai";
import { fileSync } from 'tmp';
import { unlink, writeFile } from "fs/promises";
import { createReadStream } from "fs";

function getTrainingExample(
  modelType: Model,
  example: PickNonNullable<StandupResult, 'text' | 'rating'>
) {
  const completionTrue = modelType === Model.Vague
    ? (example.rating === 1) // is this vague? 1 = vague = yes
    : (example.rating === 3); // is this productive? 3 = productive = yes

  return {
    prompt: textToCompletionPrompt(modelType, example.text),
    completion: valToCompletionExample(completionTrue ? 'yes' : 'no'),
  };
}

async function trainModel(
  modelType: Model,
  model: string,
  examples: PickNonNullable<StandupResult, 'text' | 'rating'>[]
): Promise<string> {
  const openAi = Container.get(OpenAIApi);
  const jsonlExamples = examples
    .map(e => JSON.stringify(getTrainingExample(modelType, e)))
    .join(`\n`) + `\n`;

  console.log(`Fine-tuning ${modelType} model ${model} with ${examples.length} new examples.`);

  // It seems that this has to actually be a file for the API to succeed
  const tmpFile = fileSync({ postfix: '.jsonl' }).name;
  console.log(tmpFile);

  await writeFile(tmpFile, jsonlExamples);
  const upload = await openAi.createFile(createReadStream(tmpFile), 'fine-tune');
  unlink(tmpFile);

  const result = await openAi.createFineTune({
    training_file: upload.data.id,
    model,
    ...(model.includes(':') ? { learning_rate_multiplier: 0.03 } : {}),
  });

  return result.data.id;
}

export async function syncAiTraining() {
  const prisma = Container.get(PrismaClient);

  const trainingExamples = await prisma.standupResult.findMany({
    where: {
      trainingSubmitted: false,
      humanRated: true,
      rating: { not: null },
      event: {
        standupAiModelVague: { not: null },
        standupAiModelVaguePending: null,
        standupAiModelWorkload: { not: null },
        standupAiModelWorkloadPending: null,
      },
    },
    select: {
      id: true,
      text: true,
      rating: true,
      event: { select: { standupAiModelVague: true, standupAiModelWorkload: true } },
    },
  }) as (PickNonNullable<StandupResult, 'rating' | 'text' | 'id'>
    & { event: PickNonNullable<Event, 'standupAiModelVague' | 'standupAiModelWorkload'> })[];

  console.log(`${trainingExamples.length} new standups available for fine-tuning.`)

  const modelTraining = {
    [Model.Vague]: Object.entries(
      groupBy(trainingExamples, t => t.event.standupAiModelVague)
    ),
    [Model.Workload]: Object.entries(
      groupBy(
        trainingExamples.filter(t => t.rating > 1),
        t => t.event.standupAiModelWorkload
      )
    ),
  };

  for (const [model, trainingExamples] of modelTraining[Model.Vague]) {
    await prisma.event.updateMany({
      where: { standupAiModelVague: model },
      data: {
        standupAiModelVaguePending: await trainModel(Model.Vague, model, trainingExamples)
      },
    });
  }

  for (const [model, trainingExamples] of modelTraining[Model.Workload]) {
    await prisma.event.updateMany({
      where: { standupAiModelWorkload: model },
      data: {
        standupAiModelWorkloadPending: await trainModel(Model.Workload, model, trainingExamples)
      },
    });
  }

  await prisma.standupResult.updateMany({
    where: { id: { in: trainingExamples.map(t => t.id) } },
    data: { trainingSubmitted: true },
  });
}

export async function syncAiPendingModels() {
  const prisma = Container.get(PrismaClient);
  const openAi = Container.get(OpenAIApi);

  const [pendingModelsVague, pendingModelsWorkload] = await Promise.all([
    prisma.event.groupBy({
      by: ['standupAiModelVaguePending'],
      where: { standupAiModelVaguePending: { not: null } },
    }),
    prisma.event.groupBy({
      by: ['standupAiModelWorkloadPending'],
      where: { standupAiModelWorkloadPending: { not: null } },
    }),
  ]);

  const updateModles = [...pendingModelsVague, ...pendingModelsWorkload]
    .map(e => {
      const key = 'standupAiModelVaguePending' in e
        ? 'standupAiModelVague'
        : 'standupAiModelWorkload';

      const keyPending = `${key}Pending`;

      const value = e[keyPending as keyof typeof e];

      return {
        key,
        keyPending,
        value,
      };
    });

  console.log(`Checking the status of ${updateModles.length} fine-tunes`);

  for (const { key, keyPending, value } of updateModles) {
    const result = await openAi.retrieveFineTune(value!);
    console.log(`Fine-tune ${value} is ${result.data.status}.`)
    if (result.data.status === 'pending') continue;
    if (result.data.status === 'succeeded' && result.data.fine_tuned_model) {
      await prisma.event.updateMany({
        where: { [keyPending]: value },
        data: {
          [key]: result.data.fine_tuned_model,
          [keyPending]: null,
        },
      });
    } else {
      await prisma.event.updateMany({
        where: { [keyPending]: value },
        data: { [keyPending]: null },
      });
    }
  }
}