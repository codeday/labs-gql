import { PrismaClient } from "@prisma/client";
import OpenAIApi from "openai";
import Container from "typedi";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:aiFinalizeTrainedModels');

export const JOBSPEC = '*/10 * * * *';

/**
 * Fine-tunes take a few hours to complete, so this cronjob periodically checks
 * the API to check if they're done and updates the database once they are. 
 */
export default async function aiFinalizeTrainedModels() {
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

  DEBUG(`Checking the status of ${updateModles.length} fine-tunes`);

  for (const { key, keyPending, value } of updateModles) {
    const result = await openAi.fineTuning.jobs.retrieve(value!);
    DEBUG(`Fine-tune ${value} is ${result.status}.`)
    if (['validating_files', 'queued', 'running'].includes(result.status)) continue;
    if (result.status === 'succeeded' && result.fine_tuned_model) {
      await prisma.event.updateMany({
        where: { [keyPending]: value },
        data: {
          [key]: result.fine_tuned_model,
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