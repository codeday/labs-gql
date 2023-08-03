import { PrismaClient, StandupResult, Event } from "@prisma/client";
import Container from "typedi";
import { PickNonNullable, groupBy } from "../../utils";
import { MODEL_STORAGE_KEYS, ModelType, trainModel } from "../../openai";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:aiTrain');

export const JOBSPEC = '20 6 * * *';

/**
 * Minimum number of new examples before the app initiates a new fine-tune.
 */
const MIN_TO_TRAIN = 100;

/**
 * This cronjob checks when we have enough human-categorized standups to retrain
 * a model, and then submits the request to OpenAI to start the fine-tune.
 */
export default async function aiTrain() {
  const prisma = Container.get(PrismaClient);

  // Fetch only training examples which are:
  //   - have a rating;
  //   - human rated;
  //   - not already in the training corpus;
  //   - from an event with models for vagueness and workload; and,
  //   - from an event where a model is not already being trained.
  const standups = await prisma.standupResult.findMany({
    where: {
      rating: { not: null },
      humanRated: true,
      trainingSubmitted: false,
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

  DEBUG(`${standups.length} new standups available for fine-tuning.`)

  // Group training examples by model type. It's possible an event might re-use
  // a model for one task for not another (e.g., if an event has a very different
  // workload requirement but still wants to reuse vagueness), so we will group
  // on both options.
  const modelTraining = {
    [ModelType.Vague]: Object.entries(
      groupBy(standups, t => t.event.standupAiModelVague)
    ),
    [ModelType.Workload]: Object.entries(
      groupBy(
        standups.filter(t => t.rating > 1), // Only non-vague standups can be used for workload training
        t => t.event.standupAiModelWorkload
      )
    ),
  };

  // Train each model type
  for (const modelType of [ModelType.Vague, ModelType.Workload]) {
    
    // Train each individual model of that type
    for (const [model, trainingExamples] of modelTraining[modelType]) {

      // Check if we have enough new examples to be worth training a new model
      if (trainingExamples.length < MIN_TO_TRAIN) {
        DEBUG(`Training ${modelType} corpus for ${model} needs ${MIN_TO_TRAIN-trainingExamples.length} more examples to train.`);
        continue;
      }

      // Train the model and set its key as pending. The training process will
      // take a few hours, so another task will check to see if it's done
      // periodically and update when it finishes.
      // 
      // (See `aiFinalizeTrainedModels` in this folder.)
      await prisma.event.updateMany({
        where: { [MODEL_STORAGE_KEYS[modelType].final]: model },
        data: {
          [MODEL_STORAGE_KEYS[modelType].pending]: await trainModel(
            modelType,
            model,
            trainingExamples
          ),
        },
      });


      // Mark the standups as being included in training
      await prisma.standupResult.updateMany({
        where: { id: { in: trainingExamples.map(t => t.id) } },
        data: { trainingSubmitted: true },
      });
    }
  }
}